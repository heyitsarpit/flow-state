import { type Cause, Context, type Option } from "effect";

/**
 * Why the runtime writes a batch: to acknowledge an Attempt before its send, to capture a lane
 * record before a re-send, or a plain flush.
 */
export type Purpose = "acknowledge" | "capture" | "flush";

/**
 * What a batch the edge is writing is for: its purpose and the Attempts it acknowledges, provided
 * around each Store write. A `Store` never needs it; Flow's own test store records it.
 */
export const BatchFacts = Context.Reference<{
  readonly purpose: Purpose;
  readonly acknowledges: ReadonlyArray<string>;
}>("flow-state/BatchFacts", { defaultValue: () => ({ purpose: "flush", acknowledges: [] }) });

/**
 * The platform facts Effect has no service for: page visibility and the boot's entropy.
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
