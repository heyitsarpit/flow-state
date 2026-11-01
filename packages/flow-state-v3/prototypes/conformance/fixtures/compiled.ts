// The compiled format of convergence-1 section 7, the subset round 1 uses, plus Flow's commit vocabulary (2.7.1).
import { Data, Effect } from "effect"

export type At = { readonly definition: string; readonly path: string }
export type Slot<F> = { readonly run: F; readonly at: At }
export type Denial = { readonly deny: string }
export const deny = (code: string): Denial => ({ deny: code })

export type Ev = { readonly tag: string; readonly payload: any }
export type GuardIn = { readonly memory: any; readonly event: any }
export type AfterIn = { readonly memory: any; readonly event: any }

export type TokenGuard =
  | { readonly node: string }
  | { readonly op: string; readonly verb: "idle" | "retryable"; readonly times?: number; readonly key?: Slot<(a: AfterIn) => unknown> }

export type Member =
  | { readonly op: string; readonly verb: "commit"; readonly input: Slot<(a: AfterIn) => unknown> }
  | { readonly op: string; readonly verb: "retry" | "cancel"; readonly key?: Slot<(a: AfterIn) => unknown> }
  | { readonly op: string; readonly verb: "lookup"; readonly input: Slot<(a: AfterIn) => unknown> }

export type Alternative = {
  readonly target: string // a node id, or "self"
  readonly at: At
  readonly tokens: readonly TokenGuard[]
  readonly guards: ReadonlyArray<Slot<(g: GuardIn) => true | Denial>>
  readonly patch?: Slot<(u: GuardIn) => object>
  readonly members: readonly Member[]
}
export type ScheduleSpec = {
  readonly id: string
  readonly send: string
  readonly schedule: { readonly ms: number } | Slot<(a: AfterIn) => number>
  readonly armOn: ReadonlyArray<string | "entry"> // "entry" is Flow.entry
  readonly disarmOn: readonly string[]
}
export type Node = {
  readonly id: string
  readonly parent?: string
  readonly on: Readonly<Record<string, readonly Alternative[]>>
  readonly schedules: readonly ScheduleSpec[]
}
export type Mapped = { readonly event: string; readonly from?: Slot<(v: any) => object> }
export type CommitCtx = { readonly attempt: { readonly id: string; readonly mayHaveApplied: boolean } }
export type Op = {
  readonly id: string
  readonly contract: string
  readonly kind: "write" | "read"
  readonly key: (input: any) => unknown
  readonly concurrency: "reject"
  readonly timeoutMs?: number
  readonly commit: (input: any, ctx: CommitCtx) => Effect.Effect<unknown, unknown, never>
  readonly outcomes: {
    readonly success?: Mapped
    readonly failure: Readonly<Record<string, Mapped>>
    readonly unknown?: Mapped
  }
}
export type Compiled = {
  readonly id: string
  readonly nodes: Readonly<Record<string, Node>>
  readonly root: string
  readonly default: string
  readonly memory: { readonly initial: Slot<(input: unknown) => object> }
  readonly ops: Readonly<Record<string, Op>>
  readonly persisted: boolean
  readonly modules: readonly unknown[] // the Runtime supplies persistence; section 7 says a contract imports it
  readonly bounds?: Partial<Bounds>
}
export type Bounds = { drainMs: number; storageMs: number; disposeMs: number }

// 2.7.1 "How it is built"
export class OutcomeFailure<R> extends Data.TaggedError("Flow/Failure")<{ readonly reason: R }> {}
export class OutcomeUnknown<R> extends Data.TaggedError("Flow/Unknown")<{ readonly reason: R }> {}
export const Outcome = {
  success: <A>(value: A) => Effect.succeed(value),
  failure: <R>(reason: R) => Effect.fail(new OutcomeFailure({ reason })),
  unknown: <R>(reason: R) => Effect.fail(new OutcomeUnknown({ reason })),
}
