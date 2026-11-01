// The compiled format of convergence-1 section 7, the subset rounds 1 and 2 use, plus Flow's commit vocabulary (2.7.1).
// Hand-written until round 6. `uses` and `domain` name a module's data; the core reads neither.
import { Data, Effect } from "effect";

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
  | { readonly op: string; readonly verb: "lookup"; readonly input: Slot<(a: AfterIn) => unknown> };

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
  readonly commit: (input: any, ctx: CommitCtx) => Effect.Effect<unknown, unknown, never>;
  readonly outcomes: {
    readonly success?: Mapped;
    readonly failure: Readonly<Record<string, Mapped>>;
    readonly unknown?: Mapped | Readonly<Record<string, Mapped>>; // one event, or by reason (rule 13)
  };
};
export type Compiled = {
  readonly id: string;
  readonly nodes: Readonly<Record<string, Node>>;
  readonly root: string;
  readonly default: string;
  readonly memory: { readonly initial: Slot<(input: unknown) => object> };
  readonly ops: Readonly<Record<string, Op>>;
  readonly persisted: boolean;
  readonly uses: readonly string[]; // D44: modules this machine's operations import, by name
  readonly domain?: DomainSpec;
  readonly fragments?: Readonly<Record<string, Fragment>>;
  readonly local?: true; // a local identity: lanes never adopted (D21)
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
};

// 2.7.1 "How it is built"
export class OutcomeFailure<R> extends Data.TaggedError("Flow/Failure")<{ readonly reason: R }> {}
export class OutcomeUnknown<R> extends Data.TaggedError("Flow/Unknown")<{ readonly reason: R }> {}
export const Outcome = {
  success: <A>(value: A) => Effect.succeed(value),
  failure: <R>(reason: R) => Effect.fail(new OutcomeFailure({ reason })),
  unknown: <R>(reason: R) => Effect.fail(new OutcomeUnknown({ reason })),
};
