// The whole contract between the suite and any runtime (convergence-1 section 12). Internals stay invisible.
// Lines marked AMENDED differ from the section 12 text; each one is a finding in expected-changes.log.
import type { Compiled } from "./fixtures/compiled.ts"
import type { Host, ShopApi } from "./fake-world.ts"

export type ActorRef = { readonly actor: string; readonly id: string }
export type RequestMatch = string // the fake's operation name
export type SlotPath = string

export type StorageScript = { readonly holdCaptures?: boolean } // AMENDED: section 12 left it unspecified

export type Fixture = {
  readonly id: string
  readonly make: (api: ShopApi) => Compiled // AMENDED: compiled data has commits, so it closes over the fake's API
}

export type Answer =
  | { ok: unknown }
  | { fail: { tag: string; [k: string]: unknown } }
  | { lost: true }
  | { lostButLanded: unknown }
  | { die: string }
  | { never: true }
  | { landLate: true }

export type Fault =
  | { interruptAt: "beforeStart" | number }
  | { throwIn: SlotPath; times?: number }
  | { reorderAnswers: readonly number[] }
  | { wake: { after: number } }
  | { duplicateCompletion: RequestMatch }
  | { schedulerShuffle: number; atTick?: number; inject?: Step } // AMENDED: atTick, inject (scenario text "at each tick")
  | { lateAnswer: readonly [RequestMatch, Answer] } // AMENDED: used by PAY-06, absent from section 12
  | { uninterruptibleHang: RequestMatch } // AMENDED: used by PAY-13, absent from section 12
  | { syncAnswer: readonly [RequestMatch, Answer] } // AMENDED: PAY-12 "sync" needs a commit that does not yield
  | { throwInModule: string } // AMENDED: D10 needs a fault in our own code; a module is data, so no core seam

export type Step =
  | { ensure: ActorRef; input?: unknown }
  | { dispose: ActorRef }
  | { send: ActorRef; event: string; payload?: unknown }
  | { advance: number }
  | { answer: RequestMatch; with: Answer }
  | { reload: true }
  | { storage: "ack" | "refuse" | "hang" | "landNoAck"; match?: string } // AMENDED: landNoAck is design 2.10's hold at response
  | { fault: Fault }
  | { disposeRuntime: true }

export type Row = { pending: boolean; uncertain: boolean; waiting: boolean; retryCount: number }
export type Request = {
  op: string
  input: unknown
  idempotencyKey?: string
  at: number
  answered: boolean
}
export type World0 = {
  charges: number // distinct idempotency keys the server charged: the oracle
  chargedKeys: readonly string[]
  acked: readonly string[] // attempt ids whose acknowledgement was confirmed by storage
  placed: number
  voided: number
}
export type Frame = {
  cause: string
  at: number
  seq: number
  // AMENDED: PAY-08's "expect-after-boot" reads a cut no `do` returns at, because `do` settles.
  view: Readonly<Record<string, { state: string; rows: Readonly<Record<string, Row>> }>>
}
export type Reads = {
  state(a: ActorRef): string | undefined
  memory(a: ActorRef): any
  row(a: ActorRef, op: string, key?: unknown): Row | undefined
  requests(): readonly Request[]
  truth(): World0
  frames(): readonly Frame[]
  issues(): ReadonlyArray<{ code: string; origin?: string; input?: unknown }>
  evidence(kind?: string): ReadonlyArray<Record<string, any>>
  stored(): ReadonlyMap<string, unknown>
  quiet(): { idle: boolean; waits: readonly string[] }
  replay(): { same: boolean; firstDiff?: unknown }
}
export type Harness = {
  start(cfg: { machines: readonly Fixture[]; seed: number; storage?: StorageScript }): void
  do(step: Step): void
  read: Reads
}
export type RuntimeModule = { makeHarness(): Harness }
export type { Host }
