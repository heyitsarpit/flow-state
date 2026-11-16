import { Cause, Clock, Context, Duration, Effect, Exit, Option } from "effect";
import { Due, type Ticket, type TicketId, type Write } from "../core/world.ts";
import type { Fibers } from "./fibers.ts";
import { Host, type Platform, type Purpose } from "./host.ts";

/**
 * The Runtime's pending persistence: what is dirty, the tickets waiting on it, whether a batch is
 * out, and when the next plain batch is due.
 */
type Pending = {
  readonly dirty: ReadonlyMap<string, Write>;
  readonly tickets: ReadonlyArray<Ticket>;
  readonly out: boolean;
  readonly due: number;
};

const purposeOf = (tickets: ReadonlyArray<Ticket>) => {
  const capture: Purpose = "capture";
  const acknowledge: Purpose = "acknowledge";
  const flush: Purpose = "flush";

  if (tickets.some((t) => t.purpose === "capture")) return capture;

  return tickets.some((t) => t.purpose === "acknowledge") ? acknowledge : flush;
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

  let pending: Pending = {
    dirty: new Map(),
    tickets: [],
    out: false,
    due: Number.POSITIVE_INFINITY,
  };

  const issue = () => {
    fibers.cancel(WAKE);
    const store = host.store;

    // With nothing left to write, every ticket waiting on the store has what it waits for.
    if (Option.isNone(store) || pending.dirty.size === 0) {
      const { tickets } = pending;
      pending = { ...pending, tickets: [], due: Number.POSITIVE_INFINITY };

      for (const t of tickets) options.answered(t.id, true);

      return;
    }

    const writes = [...pending.dirty.values()];
    const { tickets } = pending;

    pending = { dirty: new Map(), tickets: [], out: true, due: Number.POSITIVE_INFINITY };

    fibers.fork(
      "store",
      store.value.write(
        writes.map((w) => ({ key: w.key, value: w.record })),
        purposeOf(tickets),
        tickets.flatMap((t) => (t.purpose === "acknowledge" ? [t.attempt] : [])),
      ),
      (exit) => {
        // An interrupted write is unanswered, as a hung store is.
        if (Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)) return;
        const landed = Exit.isSuccess(exit);
        const dirty = new Map(pending.dirty);

        if (!landed) for (const w of writes) if (!dirty.has(w.key)) dirty.set(w.key, w);

        pending = { ...pending, dirty, out: false };

        for (const t of tickets) options.answered(t.id, landed);

        if (!landed) wakeAt(clock.currentTimeMillisUnsafe() + RETRY_MS);
        pump();
      },
    );
  };

  const pump = () => {
    if (pending.out) return;

    if (pending.tickets.length > 0) issue();
    else if (
      pending.dirty.size > 0 &&
      (clock.currentTimeMillisUnsafe() >= pending.due || host.hidden())
    )
      issue();
  };

  const wakeAt = (at: number) => {
    if (at >= pending.due) return;
    pending = { ...pending, due: at };

    fibers.fork(
      WAKE,
      Effect.sleep(Duration.millis(Math.max(0, at - clock.currentTimeMillisUnsafe()))),
      (exit) => {
        if (Exit.isFailure(exit)) return;
        pending = { ...pending, due: Number.NEGATIVE_INFINITY };
        pump();
      },
    );
  };

  host.onHidden(() => {
    if (!pending.out) issue();
  });

  return {
    /**
     * Whether every record handed to the edge has landed: no batch out and nothing left to write.
     */
    settled: () => !pending.out && pending.dirty.size === 0,
    accept: (writes: ReadonlyArray<Write>, due: Due) => {
      const dirty = new Map(pending.dirty);
      const tickets = Due.$is("Awaited")(due) ? due.tickets : [];

      for (const w of writes) dirty.set(w.key, w);
      pending = { ...pending, dirty, tickets: [...pending.tickets, ...tickets] };

      if (!Due.$is("Later")(due) || options.captureMs <= 0 || host.hidden()) {
        pending = { ...pending, due: Number.NEGATIVE_INFINITY };
        fibers.fork(WAKE, Effect.yieldNow, (exit) => {
          if (Exit.isSuccess(exit)) pump();
        });
      } else wakeAt(clock.currentTimeMillisUnsafe() + options.captureMs);
    },
  };
};
