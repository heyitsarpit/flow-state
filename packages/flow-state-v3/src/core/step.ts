import { Option } from "effect";
import { Act, evidenceOf } from "./evidence-of.ts";
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
import { actorKey, Disposal, Mail, Timer, type TimerId, type World } from "./world.ts";

export { CallResult, Input } from "./input.ts";

export type { Env, Machines } from "./tx.ts";

/**
 * One step of the Runtime: applies one input, then serves every
 * admitted mail item as a turn, and returns the next world with its commands and evidence.
 *
 * **Details**
 *
 * Pure and synchronous: time and the session seed come from `env`, ids from the world's counter.
 * Public calls are admitted only while the Runtime is open; host answers and timers still run
 * while it is disposing.
 */
export const step = (machines: Machines, world0: World, input: Input, env: Env) => {
  const tx = makeTx(machines, world0, env);
  const persistence = makePersistence(tx);
  const ledger = makeLedger(tx, persistence);
  const lanes = makeLanes(tx, persistence, ledger);
  const answers = makeAnswers(tx, lanes, ledger);
  const incarnations = makeIncarnations(tx, persistence, ledger);
  const serve = makeServe(tx, persistence, lanes, incarnations, ledger);
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
            for (const e of evidenceOf(
              Act.Silent({ operation: lane.operation, attempt: lane.head.id }),
            ))
              tx.emit(e);
      },
    });
  };

  const open = Disposal.$is("Open")(tx.world().disposal);
  const disposing = Disposal.$is("Disposing")(tx.world().disposal);

  Input.$match(input, {
    Boot: ({ stored }) => (open ? incarnations.boot(stored) : undefined),
    Ensure: ({ actor, use, existing }) =>
      open ? incarnations.ensure(actor, use, existing) : undefined,
    Release: ({ actor, use }) => (open ? incarnations.release(actor, use) : undefined),
    Send: ({ actor, tag, payload }) => {
      if (!open) return;

      if (incarnationOf(actor) === undefined && tx.world().records.has(actorKey(actor)))
        incarnations.ensure(actor, Option.none(), true);

      if (incarnationOf(actor) !== undefined) enqueue(Mail.Event({ actor, tag, payload }));
    },
    Settled: ({ call, result }) => {
      if (open || disposing) answers.settled(call, result, open);
    },
    Fired: ({ timer }) => (open || disposing ? fired(timer) : undefined),
    Stored: ({ ticket }) => (open ? answers.stored(ticket) : undefined),
    Refused: ({ ticket }) => (open ? answers.storeRefused(ticket) : undefined),
    DisposeRuntime: () => (open ? disposal.disposeRuntime() : undefined),
    DisposeActor: ({ actor }) => (open ? incarnations.dispose(actor, false) : undefined),
    Forget: ({ actor }) => (open ? incarnations.dispose(actor, true) : undefined),
  });

  if (Disposal.$is("Open")(tx.world().disposal)) {
    serve.drain();
    incarnations.graces();
  } else disposal.disposalEnds();

  return tx.out();
};
