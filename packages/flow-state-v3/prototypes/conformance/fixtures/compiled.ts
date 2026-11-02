// The compiled format of convergence-1 section 7, the subset rounds 1 and 2 use, plus Flow's commit vocabulary (2.7.1).
// Hand-written until round 6. `uses` and `domain` name a module's data; the core reads neither.
import { Context, Data, Effect, Stream } from "effect";

export type At = { readonly definition: string; readonly path: string };
export type Slot<F> = { readonly run: F; readonly at: At };
export type Denial = { readonly deny: string };
export const deny = (code: string): Denial => ({ deny: code });

export type Ev = { readonly tag: string; readonly payload: any; readonly to?: readonly string[] }; // to: a fragment instance path, "summary", "uploads:r1"
export type GuardIn = { readonly memory: any; readonly event: any };
export type AfterIn = { readonly memory: any; readonly event: any };

export type TokenGuard =
  | { readonly node: string }
  | { readonly port: string } // a guard the host fills (2.2, rule 4)
  | {
      readonly op: string;
      readonly verb: "idle" | "retryable";
      readonly times?: number;
      readonly key?: Slot<(a: AfterIn) => unknown>;
    };

export type Member =
  | { readonly op: string; readonly verb: "commit"; readonly input: Slot<(a: AfterIn) => unknown> }
  | {
      readonly op: string;
      readonly verb: "retry" | "cancel";
      readonly key?: Slot<(a: AfterIn) => unknown>;
    }
  | { readonly op: string; readonly verb: "lookup"; readonly input: Slot<(a: AfterIn) => unknown> }
  // A module's member (M8, D63): `O.x.bookmark`, `O.x.refetch`. In action order, with the turn's rollback.
  | {
      readonly op: string;
      readonly verb: "module";
      readonly module: string;
      readonly name: string;
      readonly value?: Slot<(a: AfterIn) => unknown>;
    };

export type Alternative = {
  readonly target: string; // a node id, or "self"
  readonly at: At;
  readonly tokens: readonly TokenGuard[];
  readonly guards: ReadonlyArray<Slot<(g: GuardIn) => true | Denial>>;
  readonly patch?: Slot<(u: GuardIn) => object>;
  readonly members: readonly Member[];
  // A head insertion, for ORDER-* (D1, D35). Pending resets and adoption deliveries are the real users since round 3.
  readonly followUps?: ReadonlyArray<Slot<(a: AfterIn) => Ev>>;
  // Round 3: the walk (2.5 step 3).
  readonly raises?: readonly Raise[];
  readonly notify?: readonly Notify[];
  readonly exit?: Notify;
  readonly history?: true; // target's remembered child, S.X.history. Control only (rule 1)
};
export type Raise = {
  readonly to: string; // a direct child's instance name
  readonly key?: Slot<(a: GuardIn) => string>; // for an .each child
  readonly event: string;
  readonly from?: Slot<(a: GuardIn) => any>; // reads before
};
export type Notify = {
  readonly name: string; // a callback's or an exit's name
  readonly from?: Slot<(a: GuardIn) => any>;
};
export type Placement = {
  readonly name: string;
  readonly fragment: string;
  readonly input?: Slot<(a: GuardIn) => any>; // before-walk (rule 1)
  readonly resetOn?: Slot<(a: GuardIn) => unknown>;
  readonly each?: { readonly of: string; readonly by?: string; readonly max: number };
  readonly resumable?: true;
  readonly guards?: Readonly<Record<string, Slot<(g: GuardIn) => true | Denial>>>;
  readonly callbacks?: Readonly<Record<string, readonly Alternative[]>>;
  readonly exits?: Readonly<Record<string, readonly Alternative[]>>;
};
export type Fragment = {
  readonly id: string;
  readonly nodes: Readonly<Record<string, Node>>;
  readonly root: string;
  readonly default: string; // the root node when it has no states
  readonly memory: { readonly initial: Slot<(input: any) => object> };
  readonly whenAbandoned?: {
    readonly notify?: readonly Notify[];
    readonly release?: readonly string[]; // rule 60: a key-less O.x.cancel listed there
  };
};
export type ScheduleSpec = {
  readonly id: string;
  readonly send: string;
  readonly schedule: { readonly ms: number } | Slot<(a: AfterIn) => number>;
  readonly armOn: ReadonlyArray<string | "entry">; // "entry" is Flow.entry
  readonly disarmOn: readonly string[];
};
export type Node = {
  readonly id: string;
  readonly parent?: string;
  readonly on: Readonly<Record<string, readonly Alternative[]>>;
  readonly schedules: readonly ScheduleSpec[];
  readonly default?: string; // a compound state's initial child
  readonly placements?: readonly Placement[]; // traits at this node
  readonly subroutine?: Placement; // the fragment this state goes into
  readonly activities?: readonly Activity[]; // data for a sessions module; the core reads none of it
};
export type Activity = {
  readonly op: string;
  readonly input: Slot<(a: AfterIn) => unknown>;
  readonly when?: Slot<(a: AfterIn) => boolean>; // 2.7.3's `when`: placed while true. Read on each change (level-triggered)
};
export type Mapped = {
  readonly event: string;
  // rule 13's ctx: `input` and `key` of the call that ended; `reason` for an unknown; `key` absent never
  readonly from?: Slot<
    (v: any, c: { readonly key: any; readonly input: any; readonly reason?: string }) => object
  >;
};
export type CommitCtx = {
  readonly attempt: { readonly id: string; readonly mayHaveApplied: boolean };
};
export type Op = {
  readonly id: string;
  readonly contract: string;
  readonly kind: "write" | "read";
  readonly key: Slot<(input: any) => unknown>;
  readonly concurrency: "reject" | "latest" | "serialize";
  readonly timeoutMs?: number;
  readonly fragment?: string; // the declaring fragment (rule 49). Absent: the machine. One per actor (rule 51)
  // Round 7, D91: a Slot from the typed path, and after the seal always. A bare function is the hand-written fixtures' spelling.
  readonly commit:
    | ((input: any, ctx: CommitCtx) => Effect.Effect<unknown, unknown, never>)
    | Slot<(input: any, ctx: CommitCtx) => Effect.Effect<unknown, unknown, never>>;
  readonly keyFields?: readonly string[]; // Round 7, D91: rule 39's field list, as data. Hand-written fixtures have a closure only
  readonly outcomes: {
    readonly success?: Mapped;
    readonly failure: Readonly<Record<string, Mapped>>;
    readonly unknown?: Mapped | { readonly byReason: Readonly<Record<string, Mapped>> }; // one event, or by reason (rule 13, M6)
  };
};
export type Compiled = {
  readonly id: string;
  readonly nodes: Readonly<Record<string, Node>>;
  readonly root: string;
  readonly default: string;
  readonly memory: {
    readonly initial: Slot<(input: unknown) => object>;
    readonly restore?: Slot<(stored: any) => object>; // D82: a stand-in for Schema decode with defaults, at restore
  };
  readonly ops: Readonly<Record<string, Op>>;
  readonly persisted: boolean;
  readonly uses: readonly string[]; // D44: modules this machine's operations import, by name
  readonly domain?: DomainSpec;
  readonly fragments?: Readonly<Record<string, Fragment>>;
  readonly local?: true; // a local identity: lanes never adopted (D21)
  readonly streams?: Readonly<Record<string, StreamSpec>>; // data for a sessions module
  // Round 7, D91, rule 47: what a typed definition declares. Absent on hand-written fixtures, so `flow check` infers it and says so.
  readonly events?: { readonly external: readonly string[]; readonly internal: readonly string[] };
};

// ── What a domain says about records (2.8). Data for the entities module; the core never reads it.
export type FieldFn = (beneath: any, input: any) => unknown;
export type Predicted = {
  readonly ref: string; // `${entity}|${key}`
  readonly patch?: Readonly<Record<string, unknown>>; // a function value is a field function over the record beneath
  readonly remove?: true;
};
export type Carried = {
  readonly ref: string;
  readonly fields?: Readonly<Record<string, unknown>>;
  readonly removed?: true;
  readonly version?: unknown; // a tombstone's: `Ticket.delete(key, { version })`. A row's comes from its fields, by the entity's field
  readonly evidence?: "whole" | "partial"; // Round 7: additive, unread until round 8's per-field versions. Evidence can say what it speaks for
};
export type DomainSpec = {
  readonly writes: Readonly<
    Record<
      string,
      {
        readonly predicts: Slot<(input: any) => readonly Predicted[]>;
        readonly confirms?: (value: any, input: any) => readonly Carried[];
      }
    >
  >;
  readonly reads: Readonly<Record<string, (value: any, input: any) => readonly Carried[]>>;
  readonly repair: (ref: string) => Effect.Effect<any, any, never>; // a forced repair: the record's fields, or null
  readonly version?: (ref: string) => string | undefined; // D67: the entity's `version: "revision"`, the name of the field, per record
  readonly versionOrder?: "lexical" | ((a: unknown, b: unknown) => number); // D75: numbers order. A string orders only if declared
  readonly listens?: Readonly<Record<string, (value: any) => readonly Carried[]>>; // a domain's `listen(...).as(...)`: a stream's values as changes
};

// ── A stream contract, compiled (2.11.3). The thin spike's subset: no catchUp, no `latest`.
export type Signal =
  | {
      readonly _feed: "live";
      readonly proof?: string;
      readonly restartAt?: unknown;
      readonly head?: unknown;
    }
  | { readonly _feed: "ping" }
  | { readonly _feed: "down"; readonly reason: string };
// T6: what `Feed.callback` takes.
export type Emit = {
  (v: unknown): void; // a value or a signal
  readonly fail: (e: unknown) => void;
  readonly end: () => void;
};
export type FeedCallback = {
  readonly bound?: number; // 1,024 by default
  readonly start: (emit: Emit) => void | (() => unknown); // a finalizer may return an Effect, awaited
};
// `Feed.callback(...)` is a Stream an author may `.pipe`, and it asks the Runtime it runs under for the queue. So T6 is runtime code, and
// the Runtime can hear a failing queue with its pull stopped (D79). The suite holds only this name; a Runtime provides it.
export class FeedQueue extends Context.Service<
  FeedQueue,
  { readonly make: (cb: FeedCallback) => Stream.Stream<unknown, unknown> }
>()("Flow/FeedQueue") {}
export const feedCallback = (cb: FeedCallback): Stream.Stream<unknown, unknown> =>
  Stream.unwrap(Effect.map(Effect.service(FeedQueue), (q) => q.make(cb))) as Stream.Stream<
    unknown,
    unknown
  >;
export type StreamSpec = {
  readonly id: string;
  readonly delivers?: "every" | "latest"; // absent: every
  readonly listen?: true; // a domain's `listen`: its values are record changes, its consumer the store (T7)
  readonly key: (input: any) => unknown;
  readonly position?: string; // the NAME of a field of the output
  readonly fills?: string; // the memory field (2.11.7)
  readonly reconnect: boolean;
  readonly idleMs: number;
  readonly healthyMs: number;
  readonly backoff: (n: number) => number;
  readonly subscribe: (input: any, c: { readonly from: unknown }) => unknown; // Stream<value | Signal, E>
  readonly value: Mapped;
  readonly missed: Mapped;
  readonly failure: Mapped;
  readonly failureBy?: Readonly<Record<string, Mapped>>; // 2.11.6: by the adapter's tag. `failure` is `Feed`'s key
  readonly reconnectWhile?: (e: any) => boolean; // `reconnect.while`
  readonly pages?: Mapped; // a read's page, one event
  readonly catchUp?: (
    input: any,
    c: { readonly from: unknown; readonly next?: unknown },
  ) => unknown; // Effect<more | done | gone>
  readonly pageRetryWhile?: (e: any) => boolean;
  readonly callbackBound?: number; // T4: `buf`'s bound in Repairing, 1,024 by default
};
export type PageAnswer =
  | {
      readonly _feed: "more";
      readonly items: readonly unknown[];
      readonly next: unknown;
      readonly through?: unknown;
    }
  | {
      readonly _feed: "done";
      readonly items: readonly unknown[];
      readonly proof: string;
      readonly through?: unknown;
    }
  | {
      readonly _feed: "gone";
      readonly reason: string;
      readonly items?: readonly unknown[];
      readonly next?: unknown;
      readonly through?: unknown;
    };

// 2.7.1 "How it is built"
export class OutcomeFailure<R> extends Data.TaggedError("Flow/Failure")<{ readonly reason: R }> {}
export class OutcomeUnknown<R> extends Data.TaggedError("Flow/Unknown")<{ readonly reason: R }> {}
export const Outcome = {
  success: <A>(value: A) => Effect.succeed(value),
  failure: <R>(reason: R) => Effect.fail(new OutcomeFailure({ reason })),
  unknown: <R>(reason: R) => Effect.fail(new OutcomeUnknown({ reason })),
};
