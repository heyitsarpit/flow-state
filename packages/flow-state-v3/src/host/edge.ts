import { Cause, Clock, Context, Duration, Effect, Exit, Option } from "effect";
import type { Ticket, TicketId, Write } from "../core/world.ts";
import type { Fibers } from "./fibers.ts";
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
 * The persistence edge (WriteAhead R10, R12, R13): per scope, one batch out at a time, carrying
 * everything not known to have landed.
 *
 * **Details**
 *
 * - A batch with a ticket, or any batch with `captureMs` at 0 or on a hidden page, is issued in
 *   the next host task; a plain one waits at most `captureMs`.
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
        writes.map((w) => ({ key: w.key, value: Option.map(w.record, (r) => JSON.stringify(r)) })),
        purposeOf(tickets),
        tickets.filter((t) => t.purpose === "acknowledge").map((t) => t.attempt),
      ),
      (exit) => {
        // An interrupted write is unanswered, as a hung store is (WriteAhead R12).
        if (Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)) return;
        const landed = Exit.isSuccess(exit);
        const now = scopeOf(name);
        const dirty = new Map(now.dirty);

        if (!landed) for (const w of writes) if (!dirty.has(w.key)) dirty.set(w.key, w);

        scopes.set(name, { ...now, dirty, out: false });

        for (const t of tickets) options.answered(t.id, landed);
        pump(name);
      },
    );
  };

  const pump = (name: string) => {
    const scope = scopeOf(name);

    if (scope.out || scope.dirty.size === 0) return;

    if (scope.tickets.length > 0 || clock.currentTimeMillisUnsafe() >= scope.due || host.hidden())
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
    accept: (name: string, writes: ReadonlyArray<Write>, ticket: Option.Option<Ticket>) => {
      const scope = scopeOf(name);
      const dirty = new Map(scope.dirty);

      for (const w of writes) dirty.set(w.key, w);
      scopes.set(name, { ...scope, dirty, tickets: [...scope.tickets, ...Option.toArray(ticket)] });

      if (Option.isSome(ticket) || options.captureMs <= 0 || host.hidden()) {
        scopes.set(name, { ...scopeOf(name), due: Number.NEGATIVE_INFINITY });
        host.later(() => pump(name));
      } else wakeAt(name, clock.currentTimeMillisUnsafe() + options.captureMs);
    },
  };
};
