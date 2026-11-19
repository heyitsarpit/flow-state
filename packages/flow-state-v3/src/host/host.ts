import { type Cause, Context, Data, type Effect, type Option } from "effect";

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
 * The store refused a batch, so nothing in it landed, or refused to load.
 */
export class StoreRefused extends Data.TaggedError("StoreRefused")<Record<string, never>> {}

/**
 * A scope's durable store as the runtime uses it: it loads every record at boot
 * and writes atomic batches.
 *
 * **Details**
 *
 * `load` fails `StoreRefused` when the scope cannot be read. `write` succeeds when the batch landed
 * and fails `StoreRefused` when it did not; an interrupted write is unanswered, as a hung store
 * is. `acknowledges` names the Attempts the batch acknowledges.
 */
export type Store = {
  readonly load: Effect.Effect<ReadonlyMap<string, string>, StoreRefused>;
  readonly write: (
    writes: ReadonlyArray<Bytes>,
    purpose: Purpose,
    acknowledges: ReadonlyArray<string>,
  ) => Effect.Effect<void, StoreRefused>;
};

/**
 * The platform facts Effect has no service for: page visibility, the durable store and the boot's
 * entropy.
 *
 * **Details**
 *
 * Time and fiber scheduling are Effect's own `Clock` and `Scheduler`, in the same Context: absent,
 * Effect's defaults apply; a test host provides its own. Every operation is the host's synchronous
 * primitive, as a page's IndexedDB callbacks are. `sessionSeed` is fresh per boot, at least 128
 * random bits as hex, never restored; Attempt ids are minted from it. `freezeValues` deep-freezes
 * every admitted value (memory, selections, payloads, commit inputs), so a mutation throws where it
 * happens: on in dev and test hosts, off in production, which pays nothing. `workClock` is a
 * monotonic millisecond reader (`performance.now` in dev): a host that gives one has each step
 * timed, and a step slower than `RuntimeDefaults.slowWorkBudget` reported SlowWork; production
 * gives none and times nothing. A test host gives none unless its test controls the readings, so
 * evidence stays deterministic. `report` takes each cleanup failure found after `dispose()` stopped
 * waiting for its bound, with its whole Cause, as a page reports an unhandled error.
 */
export class Host extends Context.Service<
  Host,
  {
    readonly hidden: () => boolean;
    readonly onHidden: (listener: () => void) => () => void;
    readonly store: Option.Option<Store>;
    readonly sessionSeed: string;
    readonly freezeValues: boolean;
    readonly workClock: Option.Option<() => number>;
    // FLOW_STATE_ALLOW_UNKNOWN: a late cleanup fails with whatever it threw.
    readonly report: (cause: Cause.Cause<unknown>) => void;
  }
>()("flow-state/Host") {}

/**
 * What a Runtime runs over: the Host, with `Clock` and `Scheduler` where they are not Effect's
 * defaults.
 */
export type Platform = Context.Context<Host>;
