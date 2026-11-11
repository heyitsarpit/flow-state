import { Context, type Option } from "effect";

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
 * The platform facts Effect has no service for: the host's task queue, page visibility, the
 * durable store and the boot's entropy.
 *
 * **Details**
 *
 * Time and fiber scheduling are Effect's own `Clock` and `Scheduler`, in the same Context: absent,
 * Effect's defaults apply; a test host provides its own. Every operation is the host's synchronous
 * primitive, as a page's IndexedDB callbacks are. `sessionSeed` is fresh per boot; Attempt ids are
 * minted from it (WriteLanes R5).
 */
export class Host extends Context.Service<
  Host,
  {
    readonly later: (task: () => void) => void;
    readonly hidden: () => boolean;
    readonly onHidden: (listener: () => void) => void;
    readonly store: Option.Option<Store>;
    readonly sessionSeed: number;
  }
>()("flow-state/Host") {}

/**
 * What a Runtime runs over: the Host, with `Clock` and `Scheduler` where they are not Effect's
 * defaults.
 */
export type Platform = Context.Context<Host>;
