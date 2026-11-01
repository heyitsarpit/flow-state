// The compiled format of convergence-1 section 7, the subset rounds 1 and 2 use, plus Flow's commit vocabulary (2.7.1).
// Hand-written until round 6. `uses` and `domain` name a module's data; the core reads neither.
import { Data, Effect } from "effect";

export type At = { readonly definition: string; readonly path: string };
export type Slot<F> = { readonly run: F; readonly at: At };
export type Denial = { readonly deny: string };
export const deny = (code: string): Denial => ({ deny: code });

export type Ev = { readonly tag: string; readonly payload: any };
export type GuardIn = { readonly memory: any; readonly event: any };
export type AfterIn = { readonly memory: any; readonly event: any };

export type TokenGuard =
  | { readonly node: string }
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
  // A head insertion: stands for pending resets and adoption deliveries until round 3 (D1, D35).
  readonly followUps?: ReadonlyArray<Slot<(a: AfterIn) => Ev>>;
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
};
export type Mapped = {
  readonly event: string;
  readonly from?: Slot<(v: any, c: { readonly key: any }) => object>;
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
  readonly commit: (input: any, ctx: CommitCtx) => Effect.Effect<unknown, unknown, never>;
  readonly outcomes: {
    readonly success?: Mapped;
    readonly failure: Readonly<Record<string, Mapped>>;
    readonly unknown?: Mapped;
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
