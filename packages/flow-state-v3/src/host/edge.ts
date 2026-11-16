import { Cause, Clock, Context, Deferred, Duration, Effect, Exit, Option } from "effect";
import { Due, type Ticket, type TicketId, type Write } from "../core/world.ts";
import type { Fibers } from "./fibers.ts";
import { encodeJsonText } from "./json.ts";
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

  return tickets.length > 0 ? acknowledge : flush;
};

const WAKE = "wake";

/**
 * The persistence edge: one batch out at a time for the Runtime's scope, carrying everything not
 * known to have landed.
 *
 * **Details**
 *
 * - A batch due now or with a ticket, or any batch with `captureMs` at 0 or on a hidden page, is
 *   issued in the next host task; a later one waits at most `captureMs`.
 * - A refused batch is put back unless something newer was accepted for the same key.
 * - Each ticket's answer is passed to `answered`, which runs a step of the core.
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

  let flushes: ReadonlyArray<Deferred.Deferred<void>> = [];

  const quiet = () => {
    if (pending.out) return;

    for (const flushed of flushes) Deferred.doneUnsafe(flushed, Exit.void);
    flushes = [];
  };

  const issue = () => {
    fibers.cancel(WAKE);
    const store = host.store;

    if (Option.isNone(store) || pending.dirty.size === 0) {
      pending = { ...pending, due: Number.POSITIVE_INFINITY };

      return;
    }

    const writes = [...pending.dirty.values()];
    const { tickets } = pending;

    pending = { dirty: new Map(), tickets: [], out: true, due: Number.POSITIVE_INFINITY };

    fibers.fork(
      "store",
      store.value.write(
        writes.map((w) => ({ key: w.key, value: Option.map(w.record, encodeJsonText) })),
        purposeOf(tickets),
        tickets.filter((t) => t.purpose === "acknowledge").map((t) => t.attempt),
      ),
      (exit) => {
        // An interrupted write is unanswered, as a hung store is.
        if (Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)) return;
        const landed = Exit.isSuccess(exit);
        const dirty = new Map(pending.dirty);

        if (!landed) for (const w of writes) if (!dirty.has(w.key)) dirty.set(w.key, w);

        pending = { ...pending, dirty, out: false };

        for (const t of tickets) options.answered(t.id, landed);

        // A flush issues each batch once: a refused one waits for the next capture.
        if (landed || flushes.length === 0) pump();
        quiet();
      },
    );
  };

  const pump = () => {
    if (pending.out || pending.dirty.size === 0) return;

    if (
      pending.tickets.length > 0 ||
      clock.currentTimeMillisUnsafe() >= pending.due ||
      host.hidden() ||
      flushes.length > 0
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
     * Issues the dirty writes at once and waits until no batch is out; a refused batch is not
     * retried. A store that never answers holds it (stated limit).
     */
    flush: Effect.suspend(() => {
      if (!pending.out) issue();

      if (!pending.out) return Effect.void;

      const flushed = Deferred.makeUnsafe<void>();
      flushes = [...flushes, flushed];

      return Deferred.await(flushed);
    }),
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
