import { Option } from "effect";
import { Act } from "./evidence-of.ts";
import { Input } from "./input.ts";
import { makeAnswers } from "./answers.ts";
import { makeDisposal } from "./disposal.ts";
import { makeIncarnations } from "./incarnations.ts";
import { awaits } from "./lane-moves.ts";
import { makeLanes } from "./lanes.ts";
import { makeEntries } from "./entries.ts";
import { makeLedger } from "./ledger.ts";
import { makePersistence } from "./persist.ts";
import { makeServe } from "./serve.ts";
import { type Env, type Machines, makeTx } from "./tx.ts";
import { admit, Life, Verdict } from "./life.ts";
import { type ActorId, actorKey, Mail, byStart, type World } from "./world.ts";
import { Alarm, byDeadline } from "./alarms.ts";
import { Change } from "./change.ts";
import { scheduleOrder } from "./schedule-plan.ts";

export { CallResult, Input } from "./input.ts";

export type { Env, Machines } from "./tx.ts";

/**
 * The live actors whose context slots are bound to `provider`.
 */
export const dependentsOf = (world: World, provider: ActorId) =>
  [...(world.consumersOf.get(actorKey(provider)) ?? [])]
    .flatMap((key) => Option.toArray(Option.fromUndefinedOr(world.incarnations.get(key))))
    .toSorted(byStart)
    .map((i) => i.actor);

/**
 * Whether a world still holds admitted mail its step did not serve: its drain yielded,
 * so the host owes it a Serve step without new input.
 */
export const owesServe = (world: World) =>
  world.mail.size > 0 && Verdict.$is("Run")(admit(world.life, Input.Serve()));

/**
 * A world whose step failed with a defect: its life is Stopped, so no input runs again. The world's
 * maps are as the failed step left them, read only by inspection.
 */
// RETURN_TYPE: the World contract, whose life widens to every Life.
export const stopped = (world: World): World => ({ ...world, life: Life.Stopped() });

/**
 * One step of the Runtime: applies one input, then serves every
 * admitted mail item as a turn, and returns the next world with its commands and evidence.
 *
 * **Details**
 *
 * Pure and synchronous: time and the session seed come from `env`, ids from the world's counter.
 * An input runs only when `admit` says so for the Runtime's life; any other changes nothing.
 */
export const step = (machines: Machines, world0: World, input: Input, env: Env) => {
  const tx = makeTx(machines, world0, env);

  if (!Verdict.$is("Run")(admit(world0.life, input))) return tx.out();

  const persistence = makePersistence(tx);

  // A capture only reads the World: it serves no mail and starts nothing.
  if (Input.$is("Capture")(input)) {
    persistence.capture(input.tickets, input.again);

    return tx.out();
  }

  const ledger = makeLedger(tx, persistence);
  const entries = makeEntries(tx, ledger, persistence);
  const lanes = makeLanes(tx, persistence, ledger, entries);
  const answers = makeAnswers(tx, lanes, entries);
  const incarnations = makeIncarnations(tx, persistence, ledger, lanes, entries);
  const serve = makeServe(tx, lanes, incarnations, ledger);
  const disposal = makeDisposal(tx, persistence, lanes, ledger, incarnations.apply, entries);
  const { incarnationOf, enqueue } = tx;
  const { end } = incarnations;
  const { boundPassed } = disposal;

  // The alarms due by now, once each, by deadline, kind and each kind's own order: a schedule's
  // firing is queued as mail, the other kinds act at once.
  const tick = () => {
    const due = tx.takeDue().toSorted(byDeadline(scheduleOrder(tx.world(), machines)));

    for (const { alarm } of due)
      Alarm.$match(alarm, {
        Bound: () => boundPassed(),
        Silent: ({ ticket }) => {
          for (const [, lane] of Option.toArray(tx.laneWaiting(ticket)))
            if (awaits(lane, ticket))
              tx.act(Act.Silent({ operation: lane.operation, attempt: lane.head.id }));
        },
        Release: ({ call }) => {
          for (const actor of entries.releaseDue(call))
            incarnations.apply(Option.fromUndefinedOr(incarnationOf(actor)), Change.Shown());
        },
        Collect: ({ entry }) => entries.collectDue(entry),
        Grace: ({ actor, incarnation }) => {
          if (incarnationOf(actor)?.id === incarnation) end(actor);
        },
        Schedule: (s) =>
          enqueue(
            Mail.Firing({
              actor: s.actor,
              incarnation: s.incarnation,
              schedule: s.schedule,
              track: s.track,
              arming: s.arming,
            }),
          ),
      });
  };

  const open = Life.$is("Open")(world0.life);
  const { setLife } = tx;

  Input.$match(input, {
    Start: () => setLife(Life.Booting()),
    Boot: ({ stored }) => {
      setLife(Life.Open());
      // A store that failed to load is never written: the Runtime runs without persistence.
      Option.match(stored, {
        onNone: () => {
          tx.noPersistence();
          tx.act(Act.Reported({ code: "StorageFailure", record: Option.none(), reason: "load" }));
        },
        onSome: incarnations.boot,
      });
    },
    BootFailed: () => setLife(Life.Failed()),
    // Reported only: the boot waits on its load, since nothing bounds a wait on storage.
    LoadSilent: () =>
      tx.act(Act.Reported({ code: "StorageSilent", record: Option.none(), reason: "load" })),
    Ensure: ({ actor, use, start, wiring }) => incarnations.ensure(actor, use, start, wiring),
    Create: ({ actor, input: given }) => incarnations.create(actor, given),
    Serve: () => undefined,
    Release: ({ actor, use }) => incarnations.release(actor, use),
    Send: ({ actor, tag, payload }) => incarnations.deliver(actor, { tag, payload }, Option.none()),
    Settled: ({ call, result }) => answers.settled(call, result, open),
    Progress: ({ call, value }) => lanes.progressed(call, value),
    Tick: () => tick(),
    Stored: ({ ticket }) => {
      answers.stored(ticket);
      disposal.answered(ticket, true);
    },
    Refused: ({ ticket }) => {
      answers.storeRefused(ticket);
      disposal.answered(ticket, false);
    },
    Capture: () => undefined,
    DisposeRuntime: () => disposal.disposeRuntime(),
    DisposeActor: ({ actor }) => incarnations.dispose(actor, false),
    Forget: ({ actor }) => incarnations.dispose(actor, true),
    Run: () => undefined,
    CleanupFailed: () => tx.act(Act.CleanupFailed()),
  });

  Life.$match(tx.world().life, {
    Open: () => {
      serve.recheckLanes();
      serve.drain();

      // A chain is counted while mail may still follow it; once every mailbox is empty none can.
      if (tx.world().mail.size === 0 && tx.world().chains.size > 0) tx.replace("chains", new Map());
      incarnations.graces();
      persistence.close();
    },
    Disposing: () => {
      disposal.write(open);
      disposal.disposalEnds();
    },
    Inert: () => undefined,
    Booting: () => undefined,
    Failed: () => undefined,
    Disposed: () => undefined,
    Stopped: () => undefined,
  });

  // An entry that lost its last hold in the step is judged at its end, before the wake: it may set
  // a Collect alarm.
  entries.stepEnds();

  // The step's last row: the host's one wake, when the earliest alarm changed.
  tx.wake();

  return tx.out();
};
