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
import { type Env, type Machines, makeTx, without } from "./tx.ts";
import { admit, Life, Verdict } from "./life.ts";
import { actorKey, Mail, Timer, type TimerId, type World } from "./world.ts";

export { CallResult, Input } from "./input.ts";

export type { Env, Machines } from "./tx.ts";

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
    const timer = tx.world().timers.get(id);

    if (timer === undefined) return;
    tx.set({ ...tx.world(), timers: without(tx.world().timers, id) });

    Timer.$match(timer, {
      Schedule: ({ actor, incarnation, schedule, arming }) => {
        if (used(actor)) enqueue(Mail.Firing({ actor, incarnation, schedule, arming }));
      },
      Grace: ({ actor, incarnation }) => {
        if (incarnationOf(actor)?.id === incarnation) end(actor);
      },
      Bound: () => boundPassed(),
      Silent: ({ ticket }) => {
        for (const lane of tx.world().lanes.values())
          if (awaits(lane, ticket))
            tx.act(Act.Silent({ operation: lane.operation, attempt: lane.head.id }));
      },
    });
  };

  const open = Life.$is("Open")(world0.life);
  const setLife = (life: Life) => tx.set({ ...tx.world(), life });

  Input.$match(input, {
    Start: () => setLife(Life.Booting()),
    Boot: ({ stored }) => {
      setLife(Life.Open());
      incarnations.boot(stored);
    },
    BootFailed: () => setLife(Life.Failed()),
    Ensure: ({ actor, use, existing }) => incarnations.ensure(actor, use, existing),
    Create: ({ actor, input: given }) => incarnations.create(actor, given),
    Release: ({ actor, use }) => incarnations.release(actor, use),
    Send: ({ actor, tag, payload }) => {
      if (incarnationOf(actor) === undefined && tx.world().records.has(actorKey(actor)))
        incarnations.ensure(actor, Option.none(), true);

      if (incarnationOf(actor) !== undefined) enqueue(Mail.Event({ actor, tag, payload }));
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
