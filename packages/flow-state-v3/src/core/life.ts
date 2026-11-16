import { Data, type Option } from "effect";
import type { Input } from "./input.ts";
import type { TicketId } from "./world.ts";

/**
 * The Runtime's life: constructed, booting, open, failed to boot, disposing or disposed.
 *
 * **Details**
 *
 * `Disposing` names the write its end waits for: the last batch it issued, until the store
 * answers it.
 */
export type Life = Data.TaggedEnum<{
  Inert: {};
  Booting: {};
  Open: {};
  Failed: {};
  Disposing: { awaiting: Option.Option<TicketId> };
  Disposed: {};
}>;

/**
 * Constructors and matchers for {@link Life}.
 */
export const Life = Data.taggedEnum<Life>();

/**
 * Whether an input runs, is dropped (it changes nothing), or is rejected with the error its
 * caller gets.
 */
export type Verdict = Data.TaggedEnum<{
  Run: {};
  Drop: {};
  Reject: { code: "RuntimeNotReady" | "RuntimeDisposed" };
}>;

/**
 * Constructors and matchers for {@link Verdict}.
 */
export const Verdict = Data.taggedEnum<Verdict>();

type Row = { readonly [L in Life["_tag"]]: Verdict };

const run = Verdict.Run();
const drop = Verdict.Drop();
const notReady = Verdict.Reject({ code: "RuntimeNotReady" });
const disposed = Verdict.Reject({ code: "RuntimeDisposed" });

// A public call that needs an open Runtime.
const call: Row = {
  Inert: notReady,
  Booting: notReady,
  Open: run,
  Failed: notReady,
  Disposing: disposed,
  Disposed: disposed,
};

// A host answer or timer: it runs while the Runtime is open or disposing; a late one is dropped.
const answer: Row = {
  Inert: drop,
  Booting: drop,
  Open: run,
  Failed: drop,
  Disposing: run,
  Disposed: drop,
};

const table = {
  Start: {
    Inert: run,
    Booting: drop,
    Open: drop,
    Failed: drop,
    Disposing: disposed,
    Disposed: disposed,
  },
  Boot: {
    Inert: drop,
    Booting: run,
    Open: drop,
    Failed: drop,
    Disposing: disposed,
    Disposed: disposed,
  },
  BootFailed: {
    Inert: drop,
    Booting: run,
    Open: drop,
    Failed: drop,
    Disposing: drop,
    Disposed: drop,
  },
  Ensure: call,
  Create: call,
  Send: call,
  Forget: call,
  DisposeActor: { ...call, Disposing: drop, Disposed: drop },
  Release: {
    Inert: drop,
    Booting: drop,
    Open: run,
    Failed: drop,
    Disposing: drop,
    Disposed: drop,
  },
  Serve: {
    Inert: drop,
    Booting: drop,
    Open: run,
    Failed: drop,
    Disposing: drop,
    Disposed: drop,
  },
  DisposeRuntime: {
    Inert: run,
    Booting: run,
    Open: run,
    Failed: run,
    Disposing: drop,
    Disposed: drop,
  },
  Settled: answer,
  Fired: answer,
  Stored: answer,
  Refused: answer,
} as const satisfies { readonly [I in Input["_tag"]]: Row };

/**
 * The one table of admission: the verdict every (life, input) pair gets.
 *
 * **When to use**
 *
 * Before an input reaches the step, to throw the error a rejected call names; the step applies
 * the same verdict, so admission follows this table alone.
 */
export const admit = (life: Life, input: Input) => table[input._tag][life._tag];

/**
 * Whether the Runtime's life has ended: its disposal is over, so its Scope may close.
 */
export const isDisposed = Life.$is("Disposed");

/**
 * The name of the Runtime's life, for a report.
 *
 * **When to use**
 *
 * Inspection shows it; the host decides by {@link admit} and {@link isDisposed} alone.
 */
export const lifecycleOf = (life: Life) => life._tag;

/**
 * A live actor's public lifecycle under the Runtime's life: disposing while the Runtime disposes,
 * disposed once it has, active otherwise. Reported in snapshots; it decides nothing.
 */
export const actorLifecycleOf = (life: Life) =>
  Life.$match(life, {
    Inert: () => "active" as const,
    Booting: () => "active" as const,
    Open: () => "active" as const,
    Failed: () => "active" as const,
    Disposing: () => "disposing" as const,
    Disposed: () => "disposed" as const,
  });
