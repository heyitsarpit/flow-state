import { Cause, Clock, Context, Deferred, Duration, Effect, Exit, Option } from "effect";
import { Due, type Ticket, type TicketId, type Write } from "../core/world.ts";
import type { Fibers } from "./fibers.ts";
import { encodeJsonText } from "./json.ts";
import { Host, type Platform, type Purpose } from "./host.ts";

/**
 * One scope's pending persistence: what is dirty, the tickets waiting on it, whether a batch is
 * out, and when the next plain batch is due.
 */
type Scope = {
  readonly dirty: ReadonlyMap<string, Write>;
  readonly tickets: ReadonlyArray<Ticket>;
  readonly out: boolean;
  readonly due: number;
};

const fresh: Scope = {
  dirty: new Map(),
  tickets: [],
  out: false,
  due: Number.POSITIVE_INFINITY,
};

const purposeOf = (tickets: ReadonlyArray<Ticket>) => {
  const capture: Purpose = "capture";
  const acknowledge: Purpose = "acknowledge";
  const flush: Purpose = "flush";

  if (tickets.some((t) => t.purpose === "capture")) return capture;

  return tickets.length > 0 ? acknowledge : flush;
};

/**
 * The persistence edge: per scope, one batch out at a time, carrying
 * everything not known to have landed.
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
  const scopes = new Map<string, Scope>();
  const scopeOf = (name: string) => scopes.get(name) ?? fresh;
  let flushes: ReadonlyArray<Deferred.Deferred<void>> = [];
  const busy = () => [...scopes.values()].some((scope) => scope.out);

  const quiet = () => {
    if (busy()) return;

    for (const flushed of flushes) Deferred.doneUnsafe(flushed, Exit.void);
    flushes = [];
  };

  const issue = (name: string) => {
    const scope = scopeOf(name);
    fibers.cancel(`wake/${name}`);
    const store = host.store;

    if (Option.isNone(store) || scope.dirty.size === 0) {
      scopes.set(name, { ...scope, due: Number.POSITIVE_INFINITY });

      return;
    }

    const writes = [...scope.dirty.values()];
    const { tickets } = scope;

    scopes.set(name, {
      dirty: new Map(),
      tickets: [],
      out: true,
      due: Number.POSITIVE_INFINITY,
    });

    fibers.fork(
      `store/${name}`,
      store.value.write(
        writes.map((w) => ({ key: w.key, value: Option.map(w.record, encodeJsonText) })),
        purposeOf(tickets),
        tickets.filter((t) => t.purpose === "acknowledge").map((t) => t.attempt),
      ),
      (exit) => {
        // An interrupted write is unanswered, as a hung store is.
        if (Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)) return;
        const landed = Exit.isSuccess(exit);
        const now = scopeOf(name);
        const dirty = new Map(now.dirty);

        if (!landed) for (const w of writes) if (!dirty.has(w.key)) dirty.set(w.key, w);

        scopes.set(name, { ...now, dirty, out: false });

        for (const t of tickets) options.answered(t.id, landed);
        pump(name);
        quiet();
      },
    );
  };

  const pump = (name: string) => {
    const scope = scopeOf(name);

    if (scope.out || scope.dirty.size === 0) return;

    if (
      scope.tickets.length > 0 ||
      clock.currentTimeMillisUnsafe() >= scope.due ||
      host.hidden() ||
      flushes.length > 0
    )
      issue(name);
  };

  const wakeAt = (name: string, at: number) => {
    const scope = scopeOf(name);

    if (at >= scope.due) return;
    scopes.set(name, { ...scope, due: at });

    fibers.fork(
      `wake/${name}`,
      Effect.sleep(Duration.millis(Math.max(0, at - clock.currentTimeMillisUnsafe()))),
      (exit) => {
        if (Exit.isFailure(exit)) return;
        scopes.set(name, { ...scopeOf(name), due: Number.NEGATIVE_INFINITY });
        pump(name);
      },
    );
  };

  host.onHidden(() => {
    for (const [name, scope] of scopes) if (!scope.out) issue(name);
  });

  return {
    /**
     * Issues every scope's dirty writes at once and waits until no batch is out; a refused batch
     * is not retried. A store that never answers holds it (stated limit).
     */
    flush: Effect.suspend(() => {
      for (const [name, scope] of scopes) if (!scope.out) issue(name);

      if (!busy()) return Effect.void;

      const flushed = Deferred.makeUnsafe<void>();
      flushes = [...flushes, flushed];

      return Deferred.await(flushed);
    }),
    accept: (name: string, writes: ReadonlyArray<Write>, due: Due) => {
      const scope = scopeOf(name);
      const dirty = new Map(scope.dirty);
      const ticket = Due.$is("Awaited")(due) ? [due.ticket] : [];

      for (const w of writes) dirty.set(w.key, w);
      scopes.set(name, { ...scope, dirty, tickets: [...scope.tickets, ...ticket] });

      if (!Due.$is("Later")(due) || options.captureMs <= 0 || host.hidden()) {
        scopes.set(name, { ...scopeOf(name), due: Number.NEGATIVE_INFINITY });
        fibers.fork(`wake/${name}`, Effect.yieldNow, (exit) => {
          if (Exit.isSuccess(exit)) pump(name);
        });
      } else wakeAt(name, clock.currentTimeMillisUnsafe() + options.captureMs);
    },
  };
};
