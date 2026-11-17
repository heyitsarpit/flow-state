import { Cause, Clock, Context, Data, Effect, Exit, Option } from "effect";
import { Due, type Ticket, type TicketId, type Write } from "../core/world.ts";
import { type Fibers, sleepUntil } from "./fibers.ts";
import { Host, type Platform, type Purpose } from "./host.ts";

/**
 * When the next plain batch is due: not at all, at an instant, or now.
 */
type Wake = Data.TaggedEnum<{ Idle: {}; At: { at: number }; Now: {} }>;

const Wake = Data.taggedEnum<Wake>();

// RETURN_TYPE: a batch purpose, which the literals alone would widen.
const purposeOf = (tickets: ReadonlyArray<Ticket>): Purpose => {
  if (tickets.some((t) => t.purpose === "capture")) return "capture";

  return tickets.some((t) => t.purpose === "acknowledge") ? "acknowledge" : "flush";
};

const WAKE = "wake";

// A refused batch's records go out again after the default capture interval, so a store that keeps
// refusing is not retried in a loop.
const RETRY_MS = 5000;

/**
 * The persistence edge: one batch out at a time for the Runtime's scope, carrying everything not
 * known to have landed.
 *
 * **Details**
 *
 * - A batch due now or with a ticket, or any batch with `captureMs` at 0 or on a hidden page, is
 *   issued in the next host task; a later one waits at most `captureMs`.
 * - A refused batch is put back unless something newer was accepted for the same key, and goes
 *   again with the next batch, at the latest 5 s later.
 * - Each ticket's answer is passed to `answered`, which runs a step of the core; a ticket with
 *   nothing left to write is answered as landed.
 */
export const makeEdge = (
  platform: Platform,
  fibers: Fibers,
  options: {
    readonly captureMs: number;
    readonly answered: (ticket: TicketId, landed: boolean) => void;
  },
) => {
  const host = Context.get(platform, Host);
  const clock = Context.get(platform, Clock.Clock);

  // What is dirty, by record key, the tickets waiting on it, whether a batch is out, and when the
  // next plain batch is due. The edge's own state, written in place.
  let dirty = new Map<string, Write>();
  let tickets: Array<Ticket> = [];
  let out = false;
  let wake: Wake = Wake.Idle();

  const due = () =>
    Wake.$match(wake, {
      Idle: () => false,
      At: ({ at }) => clock.currentTimeMillisUnsafe() >= at,
      Now: () => true,
    });

  const issue = () => {
    fibers.cancel(WAKE);
    const store = host.store;

    const carried = tickets;
    tickets = [];
    wake = Wake.Idle();

    // With nothing left to write, every ticket waiting on the store has what it waits for.
    if (Option.isNone(store) || dirty.size === 0) {
      for (const t of carried) options.answered(t.id, true);

      return;
    }

    const writes = [...dirty.values()];
    dirty = new Map();
    out = true;

    fibers.fork(
      "store",
      store.value.write(
        writes.map((w) => ({ key: w.key, value: w.record })),
        purposeOf(carried),
        carried.flatMap((t) => (t.purpose === "acknowledge" ? [t.attempt] : [])),
      ),
      (exit) => {
        // An interrupted write is unanswered, as a hung store is.
        if (Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)) return;
        const landed = Exit.isSuccess(exit);

        if (!landed) for (const w of writes) if (!dirty.has(w.key)) dirty.set(w.key, w);
        out = false;

        for (const t of carried) options.answered(t.id, landed);

        if (!landed) wakeAt(clock.currentTimeMillisUnsafe() + RETRY_MS);
        pump();
      },
    );
  };

  const pump = () => {
    if (out) return;

    if (tickets.length > 0 || (dirty.size > 0 && (due() || host.hidden()))) issue();
  };

  const wakeAt = (at: number) => {
    const earlier = Wake.$match(wake, {
      Idle: () => true,
      At: (set) => at < set.at,
      Now: () => false,
    });

    if (!earlier) return;
    wake = Wake.At({ at });

    fibers.fork(WAKE, sleepUntil(clock, at), (exit) => {
      if (Exit.isFailure(exit)) return;
      wake = Wake.Now();
      pump();
    });
  };

  // A hidden page flushes at once; the listener goes with the Runtime's Scope.
  fibers.finalize(
    host.onHidden(() => {
      if (!out) issue();
    }),
  );

  return {
    /**
     * Whether every record handed to the edge has landed: no batch out and nothing left to write.
     */
    settled: () => !out && dirty.size === 0,
    accept: (writes: ReadonlyArray<Write>, refused: ReadonlyArray<TicketId>, when: Due) => {
      for (const ticket of refused) options.answered(ticket, false);

      for (const w of writes) dirty.set(w.key, w);

      if (Due.$is("Awaited")(when)) tickets.push(...when.tickets);

      if (!Due.$is("Later")(when) || options.captureMs <= 0 || host.hidden()) {
        wake = Wake.Now();
        fibers.fork(WAKE, Effect.yieldNow, (exit) => {
          if (Exit.isSuccess(exit)) pump();
        });
      } else wakeAt(clock.currentTimeMillisUnsafe() + options.captureMs);
    },
  };
};
