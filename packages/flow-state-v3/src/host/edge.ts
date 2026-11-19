import { Clock, Context, Data, Effect, Option, Schedule } from "effect";
import { RuntimeDefaults } from "../core/defaults.ts";
import { Due, type Marks, type Ticket, type TicketId, type Write } from "../core/world.ts";
import { Ending, type Owner, sleepUntil } from "./owners/owners.ts";
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

const RETRY = "retry";

// A refused batch's keys are captured again one default capture interval later, so a store that
// keeps refusing is never retried in a loop, even with `captureMs` at 0.
const refusedRetry = Schedule.duration(RuntimeDefaults.captureInterval);

/**
 * The persistence edge: it decides when the core captures a batch, and keeps one batch out at a
 * time for the Runtime's scope.
 *
 * **Details**
 *
 * - The core reports when a step's marks are due; the edge issues a capture by `capture`, which
 *   runs the core's Capture step, and writes the batch it returns.
 * - A batch due now or with a ticket, or any batch with `captureMs` at 0 or on a hidden page, is
 *   captured in the next host task; a later one waits at most `captureMs`.
 * - A refused batch's keys go to the next capture, at the latest one default capture interval
 *   later, which encodes them again from the World as it then stands.
 * - Each ticket's answer is passed to `answered`, which runs a step of the core; a ticket whose
 *   batch has nothing to write is answered as landed.
 */
export const makeEdge = (
  platform: Platform,
  work: Owner,
  options: {
    readonly captureMs: number;
    readonly capture: (tickets: ReadonlyArray<Ticket>, again: Marks) => void;
    readonly answered: (ticket: TicketId, landed: boolean) => void;
  },
) => {
  const host = Context.get(platform, Host);
  const clock = Context.get(platform, Clock.Clock);

  // Whether a step marked records since the last capture, the tickets waiting on the next batch,
  // the keys of a refused batch, whether a capture or batch is out, and when the next plain batch
  // is due. The edge's own state, written in place.
  let marked = false;
  let tickets: Array<Ticket> = [];
  let again: Marks = new Map();
  let out = false;
  let wake: Wake = Wake.Idle();

  const due = () =>
    Wake.$match(wake, {
      Idle: () => false,
      At: ({ at }) => clock.currentTimeMillisUnsafe() >= at,
      Now: () => true,
    });

  const issue = () => {
    work.cancel(WAKE);
    work.cancel(RETRY);

    const carried = tickets;
    const keys = again;
    tickets = [];
    again = new Map();
    marked = false;
    wake = Wake.Idle();

    // Without a store nothing is written: every ticket has what it waits for.
    if (Option.isNone(host.store)) {
      for (const t of carried) options.answered(t.id, true);

      return;
    }

    out = true;
    options.capture(carried, keys);
  };

  const pump = () => {
    if (out) return;

    if (tickets.length > 0 || ((marked || again.size > 0) && (due() || host.hidden()))) issue();
  };

  const wakeAt = (at: number) => {
    const earlier = Wake.$match(wake, {
      Idle: () => true,
      At: (set) => at < set.at,
      Now: () => false,
    });

    if (!earlier) return;
    wake = Wake.At({ at });

    work.fork(WAKE, sleepUntil(clock, at), (ending) => {
      if (!Ending.$is("Done")(ending)) return;
      wake = Wake.Now();
      pump();
    });
  };

  const settle = (carried: ReadonlyArray<Ticket>, landed: boolean) => {
    out = false;

    for (const t of carried) options.answered(t.id, landed);

    if (!landed)
      work.fork(RETRY, Effect.schedule(Effect.void, refusedRetry), (ending) => {
        if (!Ending.$is("Done")(ending)) return;
        wake = Wake.Now();
        pump();
      });
    pump();
  };

  // A hidden page captures at once whatever is marked; the listener goes with the Runtime's work.
  work.finalize(
    host.onHidden(() => {
      if (!out && (tickets.length > 0 || marked || again.size > 0)) issue();
    }),
  );

  return {
    /**
     * Whether every record a step marked has landed: no capture or batch out and nothing left to
     * capture.
     */
    settled: () => !out && !marked && again.size === 0,
    /**
     * A step's marks: when they are due, and the tickets refused before any batch.
     */
    accept: (when: Due, refused: ReadonlyArray<TicketId>) => {
      for (const ticket of refused) options.answered(ticket, false);

      marked = true;

      if (Due.$is("Awaited")(when)) tickets.push(...when.tickets);

      if (!Due.$is("Later")(when) || options.captureMs <= 0 || host.hidden()) {
        wake = Wake.Now();
        work.fork(WAKE, Effect.yieldNow, (ending) => {
          if (Ending.$is("Done")(ending)) pump();
        });
      } else wakeAt(clock.currentTimeMillisUnsafe() + options.captureMs);
    },
    /**
     * A captured batch: written as one Store write, its tickets answered with its verdict; a ticket
     * refused at capture is answered so at once.
     */
    write: (
      writes: ReadonlyArray<Write>,
      marks: Marks,
      carried: ReadonlyArray<Ticket>,
      refused: ReadonlyArray<TicketId>,
    ) => {
      for (const ticket of refused) options.answered(ticket, false);

      if (writes.length === 0 || Option.isNone(host.store)) {
        settle(carried, true);

        return;
      }

      const answer = (landed: boolean) => {
        if (!landed) again = new Map([...marks, ...again]);
        settle(carried, landed);
      };

      work.fork(
        "store",
        host.store.value.write(
          writes.map((w) => ({ key: w.key, value: w.record })),
          purposeOf(carried),
          carried.flatMap((t) => (t.purpose === "acknowledge" ? [t.attempt] : [])),
        ),
        (ending) =>
          Ending.$match(ending, {
            Done: () => answer(true),
            Failed: () => answer(false),
            Died: () => answer(false),
            // An interrupted write is unanswered, as a hung store is: it may have landed. Its
            // cleanup's failure is its Owner's.
            Interrupted: () => undefined,
          }),
      );
    },
  };
};
