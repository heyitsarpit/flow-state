import { Option } from "effect";
import { Act } from "./evidence-of.ts";
import { Input } from "./input.ts";
import { makeAnswers } from "./answers.ts";
import { makeDisposal } from "./disposal.ts";
import { makeIncarnations } from "./incarnations.ts";
import { awaits } from "./lane-moves.ts";
import { makeLanes } from "./lanes.ts";
import { makeLedger } from "./ledger.ts";
import { makePersistence } from "./persist.ts";
import { makeServe } from "./serve.ts";
import { type Env, type Machines, makeTx } from "./tx.ts";
import { admit, Life, Verdict } from "./life.ts";
import {
  type ActorId,
  actorKey,
  Mail,
  startOrder,
  Timer,
  type TimerId,
  type World,
} from "./world.ts";

export { CallResult, Input } from "./input.ts";

export type { Env, Machines } from "./tx.ts";

/**
 * The live actors whose context slots are bound to `provider`.
 */
export const dependentsOf = (world: World, provider: ActorId) =>
  [...(world.consumersOf.get(actorKey(provider)) ?? [])]
    .flatMap((key) => Option.toArray(Option.fromUndefinedOr(world.incarnations.get(key))))
    .toSorted((a, b) => startOrder(a) - startOrder(b))
    .map((i) => i.actor);

/**
 * How many external events one actor may have pending: past it, a send is refused.
 */
export const ADMISSION_BOUND = 1024;

/**
 * Whether one more external send to an actor would pass its admission bound, counting the events
 * in its mailbox and the sends still waiting to be stepped. Endings, firings and context updates
 * are never counted.
 */
export const overloaded = (world: World, actor: ActorId, waiting: number) =>
  (world.mail.get(actorKey(actor)) ?? []).filter(Mail.$is("Event")).length + waiting >=
  ADMISSION_BOUND;

/**
 * Whether a world still holds admitted mail its step did not serve: its drain stopped at its cap,
 * so the host owes it a Serve step without new input.
 */
export const owesServe = (world: World) =>
  world.mail.size > 0 && Verdict.$is("Run")(admit(world.life, Input.Serve()));

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
  const ledger = makeLedger(tx, persistence);
  const lanes = makeLanes(tx, persistence, ledger);
  const answers = makeAnswers(tx, lanes, ledger);
  const incarnations = makeIncarnations(tx, persistence, ledger);
  const serve = makeServe(tx, lanes, incarnations, ledger);
  const disposal = makeDisposal(tx, persistence, lanes, ledger);
  const { incarnationOf, used, enqueue } = tx;
  const { end } = incarnations;
  const { boundPassed } = disposal;

  const fired = (id: TimerId) => {
    const timer = tx.fire(id);

    if (Option.isNone(timer)) return;

    Timer.$match(timer.value, {
      Schedule: ({ actor, incarnation, schedule, arming }) => {
        if (used(actor)) enqueue(Mail.Firing({ actor, incarnation, schedule, arming }));
      },
      Grace: ({ actor, incarnation }) => {
        if (incarnationOf(actor)?.id === incarnation) end(actor);
      },
      Bound: () => boundPassed(),
      Silent: ({ ticket }) => {
        for (const [, lane] of Option.toArray(tx.laneWaiting(ticket)))
          if (awaits(lane, ticket))
            tx.act(Act.Silent({ operation: lane.operation, attempt: lane.head.id }));
      },
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
    Ensure: ({ actor, use, existing, wiring }) => incarnations.ensure(actor, use, existing, wiring),
    Create: ({ actor, input: given }) => incarnations.create(actor, given),
    Serve: () => undefined,
    Release: ({ actor, use }) => incarnations.release(actor, use),
    Send: ({ actor, tag, payload }) => {
      if (incarnationOf(actor) === undefined && tx.world().records.has(actorKey(actor)))
        incarnations.ensure(actor, Option.none(), true, Option.none());

      // A send never creates an actor: with no actor and no record it is dropped, told to the
      // sender as evidence.
      if (incarnationOf(actor) === undefined)
        tx.act(Act.SendTargetAbsent({ actor, event: tag, reason: "NoRecord" }));
      else enqueue(Mail.Event({ actor, tag, payload }));
    },
    Settled: ({ call, result }) => answers.settled(call, result, open),
    Fired: ({ timer }) => fired(timer),
    Stored: ({ ticket }) => {
      answers.stored(ticket);
      disposal.answered(ticket, true);
    },
    Refused: ({ ticket }) => {
      answers.storeRefused(ticket);
      disposal.answered(ticket, false);
    },
    DisposeRuntime: () => disposal.disposeRuntime(),
    DisposeActor: ({ actor }) => incarnations.dispose(actor, false),
    Forget: ({ actor }) => incarnations.dispose(actor, true),
  });

  Life.$match(tx.world().life, {
    Open: () => {
      serve.drain();
      incarnations.graces();
      persistence.project();
    },
    Disposing: () => {
      disposal.write(open);
      disposal.disposalEnds();
    },
    Inert: () => undefined,
    Booting: () => undefined,
    Failed: () => undefined,
    Disposed: () => undefined,
  });

  return tx.out();
};
