import type { Option, Scheduler } from "effect";

/**
 * Why the runtime writes a batch: to acknowledge an Attempt before its send, to capture a lane
 * record before a re-send, or a plain flush.
 */
export type Purpose = "acknowledge" | "capture" | "flush";

/**
 * One key's write in a batch: its new value, or `None` to remove it.
 */
export type Bytes = { readonly key: string; readonly value: Option.Option<string> };

/**
 * A scope's durable store as the runtime uses it (WriteAhead R12): it loads every record at boot
 * and writes atomic batches, answering each once.
 */
export type Store = {
  readonly load: () => ReadonlyMap<string, string>;
  readonly write: (
    writes: ReadonlyArray<Bytes>,
    purpose: Purpose,
    answer: (ok: boolean) => void,
    acknowledges: ReadonlyArray<string>,
  ) => void;
};

/**
 * The platform a Runtime runs on: its clock and timers, its task queue and fiber scheduler, its
 * page visibility, its store and the boot's entropy.
 *
 * **Details**
 *
 * Every operation is the host's synchronous primitive, as a page's `Date.now`, `setTimeout` and
 * IndexedDB callbacks are. `now` is wall-clock time; `monotonic` never goes backwards, whatever the
 * wall clock does (a browser's `performance.now()`). `sessionSeed` is fresh per boot; Attempt ids are minted from it
 * (WriteLanes R5).
 */
export type Host = {
  readonly now: () => number;
  readonly monotonic: () => number;
  readonly arm: (at: number, fire: () => void) => () => void;
  readonly later: (task: () => void) => void;
  readonly scheduler: Scheduler.Scheduler;
  readonly hidden: () => boolean;
  readonly onHidden: (listener: () => void) => void;
  readonly store: Option.Option<Store>;
  readonly sessionSeed: number;
};
