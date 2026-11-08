// The compiled format of convergence-1 section 7, the subset rounds 1 and 2 use, plus Flow's commit vocabulary (2.7.1).
// Hand-written until round 6. `uses` and `domain` name a module's data; the core reads neither.
import { Context, Data, Effect, type Schema, Stream } from "effect";

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
      readonly verb: "retry" | "cancel" | "cancelAll";
      readonly key?: Slot<(a: AfterIn) => unknown>;
      readonly previous?: number; // 2.7.15 (Q2 A): `O.x.previous[i]`, naming only lanes of the op's `previous[i]` version
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
// Round 13 (round 12 review M3): what a definition or a fragment declares, by direction, with each event's payload fields as Schemas (in-process; the data
// view renders each as JSON Schema). `host` is a fragment's `hostEvents` (sent by its host, or a Story alone); a machine has none.
export type Events = {
  readonly external: readonly string[];
  readonly internal: readonly string[];
  readonly host?: readonly string[];
  readonly payloads?: Readonly<Record<string, Readonly<Record<string, unknown>>>>; // event -> field -> Schema
  readonly uncertain?: readonly string[]; // round 13 (mid review L4): the events `Flow.uncertain` marks, the only ones an `unknown:` may target (rule 13)
};
// A fragment's ports (2.2.1): exits and callbacks with their payload fields, guard ports. `optional` is `Flow.optional`, not built (api-changes): never set.
export type Port = { readonly fields: Readonly<Record<string, unknown>>; readonly optional?: true };
export type Ports = {
  readonly exits: Readonly<Record<string, Port>>;
  readonly callbacks: Readonly<Record<string, Port>>;
  readonly guards: Readonly<Record<string, { readonly optional?: true }>>;
};
export type Fragment = {
  readonly id: string;
  readonly kind?: "trait" | "subroutine"; // round 13 (M3): absent on the suite's hand fragments only
  readonly events?: Events; // round 13 (M3)
  readonly ports?: Ports; // round 13 (M3)
  readonly nodes: Readonly<Record<string, Node>>;
  readonly root: string;
  readonly default: string; // the root node when it has no states
  readonly memory: Memory;
  readonly whenAbandoned?: {
    readonly notify?: readonly Notify[];
    readonly release?: readonly string[]; // rule 60: a key-less O.x.cancel listed there
  };
};
// Round 12 (D214, review M2): memory as fields, each with its Schema, its one source (2.2.2) and whether it is private: what `flow check`'s rule 12, the restore
// rule and the creation decode are decided over. The three Slots are made from the fields by the compiler and are what the Runtime runs; `restore` and
// `encode` are required after the seal (the suite's hand data gets identity ones from `legacy.ts`, and `fields: {}`, since F11's open record has none).
export type MemoryField = {
  readonly source: "input" | "initial" | "computed" | "absent";
  readonly schema: unknown; // an Effect Schema, in-process (D194); the data view renders it
  readonly private?: true;
};
export type Memory = {
  readonly fields?: Readonly<Record<string, MemoryField>>;
  readonly initial: Slot<(input: any) => object>;
  readonly restore?: Slot<(stored: any) => object>; // D82, D214: decode by the fields' Schemas, with the restore rule for a field a release adds
  readonly encode?: Slot<(memory: any) => object>; // Round 7, review H2: the memory's Schema, so reading and writing are one format
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
  readonly each?: true; // `subscribe.each` (rule 41): `input` selects a list, one session per distinct key
};
export type Mapped = {
  readonly event: string;
  readonly ignore?: true; // round 14 (OD28, 2.7.18): `Flow.ignore`; `event` is "" and nothing runs
  // rule 13's ctx: `input` and `key` of the call that ended; `reason` for an unknown; `key` absent never
  readonly from?: Slot<
    (v: any, c: { readonly key: any; readonly input: any; readonly reason?: string }) => object
  >;
};
export type CommitCtx = {
  readonly attempt: { readonly id: string; readonly mayHaveApplied: boolean };
  readonly basedOn?: unknown; // OD19 Q32 A, narrowed: the version of the record this write was minted over, rebased in its record queue; a map by ref for several
};
export type Op = {
  readonly id: string;
  readonly contract: string;
  readonly kind: "write" | "read";
  // Round 12 (D215): the key has one source, `keyFields`, and the seal makes the lane's key from it. A compiler never writes `key`; only the suite's hand
  // data does (finding F2's closures), through `conformance/legacy.ts`, and the seal refuses an op that has both or neither. After the seal, always a Slot.
  readonly key?: Slot<(input: any) => unknown>;
  // Round 12 (D215, review M3): the input's field names, so the seal and `flow check` can refuse a key field that names nothing.
  readonly inputFields?: readonly string[];
  // Round 12 (D213, review H1): the service keys the commit asks for (rule 57's requirements, as data). The seal refuses a boot that does not give one.
  readonly services?: readonly string[];
  readonly concurrency: "reject" | "latest" | "cancel" | "serialize";
  // Q1 A, with the convergence's rules (round-9/released-write-proof-proposal-2.md, named `guarded`): the author's claim that the server applies the
  // commit only while each target record's version equals the `basedOn` it was sent with. Flow cannot check it.
  readonly guarded?: true;
  // C129 (the design's, not yet a word of this prototype's `transaction`; set on `Compiled` by a fixture): what the server dedupes on. A business key
  // (input field names) makes a later Attempt's success with the same values a replay of this one.
  readonly idempotency?: "attempt" | readonly string[];
  readonly timeoutMs?: number;
  readonly fragment?: string; // the declaring fragment (rule 49). Absent: the machine. One per actor (rule 51)
  // Round 7, D91: a Slot from the typed path, and after the seal always. A bare function is the hand-written fixtures' spelling.
  readonly commit:
    | ((input: any, ctx: CommitCtx) => Effect.Effect<unknown, unknown, never>)
    | Slot<(input: any, ctx: CommitCtx) => Effect.Effect<unknown, unknown, never>>;
  readonly keyFields?: readonly string[]; // Round 7, D91: rule 39's field list, as data. Hand-written fixtures have a closure only
  readonly keyVersion?: readonly string[]; // U17 B (OD48), 2.7.15: each key field with its Schema's version (type and encoded side); the lane's stamp
  readonly keyVersionByFormat?: Readonly<Record<string, readonly string[]>>; // R7: the same Schemas in each older version format, for a cross-format compare
  // 2.7.15 (Q2 A): each earlier key the contract declares, as `keyVersion` is written, so an old-version hold is named by its own version.
  readonly previous?: ReadonlyArray<{ readonly keyFields: readonly string[]; readonly keyVersion: readonly string[]; readonly keyVersionByFormat?: Readonly<Record<string, readonly string[]>> }>;
  readonly inputNotCarried?: readonly string[]; // D124: which input fields, by path, have a decoded form the door refuses. For `flow check`
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
  readonly memory: Memory;
  readonly ops: Readonly<Record<string, Op>>;
  readonly persisted: boolean;
  readonly uses: readonly string[]; // D44: modules this machine's operations import, by name
  readonly domain?: DomainSpec;
  readonly fragments?: Readonly<Record<string, Fragment>>;
  readonly local?: true; // a local identity: lanes never adopted (D21)
  readonly identityFields?: readonly string[]; // round 14, rule 74: the `Flow.input` fields, sorted; a value ref's identity
  readonly identityVersion?: readonly string[]; // OD30 Q3: each identity field with its Schema (type and encoded side), in name order
  readonly identityVersionByFormat?: Readonly<Record<string, readonly string[]>>; // R7: the same in each older version format
  readonly streams?: Readonly<Record<string, StreamSpec>>; // data for a sessions module
  // Round 7, D91, rule 47: what a typed definition declares. Absent on hand-written fixtures, so `flow check` infers it and says so.
  readonly events?: Events;
};
// Round 12 (D213-D216): what a compiler emits. The fields above stay optional only for the suite's hand data, which `legacy.ts` completes before the seal,
// and the seal refuses a table without them; this type says it to the compiler, so the front end's output is checked by `tsc` too.
export type CompiledOp = Omit<Op, "key"> & {
  readonly keyFields: readonly string[];
  readonly inputFields: readonly string[];
  readonly services: readonly string[];
};
export type CompiledMemory = Required<Memory>;
export type CompiledEvents = Required<Omit<Events, "host">> & Pick<Events, "host">;
export type CompiledFragment = Omit<Fragment, "memory" | "kind" | "events" | "ports"> & {
  readonly memory: CompiledMemory;
  readonly kind: "trait" | "subroutine";
  readonly events: Required<Events>;
  readonly ports: Ports;
};
export type CompiledOutput = Omit<Compiled, "ops" | "memory" | "events" | "fragments"> & {
  readonly ops: Readonly<Record<string, CompiledOp>>;
  readonly memory: CompiledMemory;
  readonly events: CompiledEvents;
  readonly fragments?: Readonly<Record<string, CompiledFragment>>;
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
export type Gone = { readonly tag: string; readonly ref: (input: any) => string };
// Q3 A: `listen(c).covers(({ input, record }) => eq(record.f, input.g))`, compiled to data so `flow explain` can print it: every term holds.
export type CoverTerm = { readonly field: string; readonly input: string } | { readonly field: string; readonly value: unknown };
export type Covers = { readonly entity: string; readonly where: readonly CoverTerm[] };
export type DomainSpec = {
  readonly writes: Readonly<
    Record<
      string,
      {
        readonly predicts: Slot<(input: any) => readonly Predicted[]>;
        readonly confirms?: (value: any, input: any) => readonly Carried[];
        readonly targets?: (input: any) => readonly string[]; // the `.one` record or each `many` key: the records whose base a `guarded` server fences
      }
    >
  >;
  readonly reads: Readonly<Record<string, (value: any, input: any) => readonly Carried[]>>;
  readonly gone?: Readonly<Record<string, Gone>>; // Q2 A: a read's `.gone(tag)`, by read: that failure is a tombstone for the read's key (`.byKey`)
  readonly repair: (ref: string) => Effect.Effect<any, any, never>; // a forced repair: the record's fields, or null
  readonly version?: (ref: string) => string | undefined; // D67: the entity's `version: "revision"`, the name of the field, per record
  readonly versionOrder?: "lexical" | ((a: unknown, b: unknown) => number); // D75: numbers order. A string orders only if declared
  readonly listens?: Readonly<Record<string, (value: any) => readonly Carried[]>>; // a domain's `listen(...).as(...)`: a stream's values as changes
  readonly covers?: Readonly<Record<string, Covers>>; // by listen: what its session watches. Absent: the records it has itself delivered
  readonly primaryKey?: Readonly<Record<string, readonly string[]>>; // by entity (`entity({ primaryKey })`): key fields have no cell (entity-proposal-2 2.2)
  readonly fields?: Readonly<Record<string, Schema.Top>>; // the entity's field Schemas (`entity({ fields })`): the judge compares by `Schema.toEquivalence`
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
  readonly backoff?: (n: number) => number; // absent: 2.11.10's default schedule
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
