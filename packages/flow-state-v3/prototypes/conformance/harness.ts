// The whole contract between the suite and any runtime (convergence-1 section 12, D34). Internals stay invisible.
// A runtime implements `Port` (drive.ts turns it into a Harness), so settling, faults and the fake stay in the suite.
import type { Context } from "effect";
import type { Compiled, Ev } from "./fixtures/compiled.ts";
import type { Api, Host, ServerModel } from "./fake-world.ts";

export type ActorRef = { readonly actor: string; readonly id: string };
export type RequestMatch = string; // the fake's operation name
export type SlotPath = string;

export type Fixture = {
  readonly id: string;
  readonly make: (api: Api) => Compiled; // compiled data has commits, so it closes over the fake's API
  readonly server?: ServerModel; // what the fake server believes, for answers that come from truth
  // Round 11 (D211): the services this machine's Slots ask for, given to the Runtime at boot, as production gives it a Layer. A typed fixture's commits ask
  // for the fake by its service (`typed/lab.ts`); a hand fixture closes over it and has none.
  readonly services?: (api: Api) => Context.Context<never>;
};

export type Answer =
  | { ok: unknown }
  | { fail: { tag: string; [k: string]: unknown } }
  | { lost: true }
  | { lostButLanded: unknown }
  | { die: string }
  | { never: true }
  | { apply: true } // the server model applies it and answers, or refuses. Idempotent per key
  | { applyLost: true } // the server model applies it; the answer is lost
  | { truth: true } // a read, answered from what the server now believes (M2's causal fake)
  | { atStart: true } // a read, answered from what the server held when it started (review H6)
  | { inFlight: true } // D145: 409, an earlier send of this key is still executing. Nothing lands from this one
  | { applyFail: { tag: string; status?: number } }; // D145: lands, answers a failure, and replays that failure to every retry

export type Fault =
  | { throwIn: SlotPath; times?: number }
  | { duplicateCompletion: RequestMatch }
  | { schedulerShuffle: number; atTick?: number; inject?: Step }
  | { lateAnswer: readonly [RequestMatch, Answer] } // the server's answer finally arrives
  | { landLate: RequestMatch } // a lost request lands at the server, unseen
  | { forgetKeys: true } // D145: the server prunes the keys it remembers (Stripe, after 24 hours)
  | { uninterruptibleHang: RequestMatch }
  | { syncAnswer: readonly [RequestMatch, Answer | ((input: any) => Answer)] }
  | { microAnswer: readonly [RequestMatch, Answer | ((input: any) => Answer)] } // D122: as a resolved promise: after the pump, before any task
  | { throwInModule: string } // D27: the next call of this hook of any module throws
  | { throwInModuleAfter: string } // L1: the hook runs, makes its effects, then throws
  | { throwInCore: true } // D27: the next step's core code throws. Reached through data: no seam in the core
  | { throwInCoreAfter: number } // the same, after this many more steps: a fatal with mail left and a batch pending
  | { startThrows: RequestMatch } // DRV-02: building this op's commit throws
  | { afterYield: Step | readonly Step[] } // runs when the runtime has yielded its drain to the host: a gap between steps. Round 8: `hide`, then `reload`, is a kill mid-drain
  | { mutateServer: (s: any) => any } // the world changes with nobody asking: a price, another device
  | { socketClose: number } // how long a close takes from now on. Infinity never finishes
  | { lateCancel: number } // re-audit M3: the next n timer cancels lose the race (the task was already queued), and the old timer fires anyway
  | { storageFails: number } // review M7: the next n plain writes fail
  | { storageFailsLate: number } // review H1: they fail, and it is said on the next tick
  | { storageFailsHeld: number } // and it is said at a `failLate` storage step
  | { corruptStored: { readonly match: string; readonly edit: (raw: string) => string } }; // a record on disk changed: a bad write, a release

export type Step =
  | { burst: ActorRef; event: string; n: number } // round 9: many sends in one tick, as a bulk flow does
  | { ensure: ActorRef; input?: unknown }
  | { send: ActorRef; event: string; payload?: unknown; to?: readonly string[] }
  | { dispose: ActorRef } // the actor's life ends. Its lanes stay the Runtime's (OD19)
  // Rule 73: a consumer of a shared actor attaches (ensuring it), or a use ends (Story.release, OD27 Q4), which disposes nothing. The suite's
  // `ensure` attaches its own consumer on a runtime with uses; `release` ends it. With no uses and nothing busy, the actor goes after the grace.
  | { attach: ActorRef; input?: unknown }
  | { release: ActorRef }
  | { advance: number }
  | { answer: RequestMatch; with: Answer; where?: Readonly<Record<string, unknown>> }
  // crashAfterBoot: the first boot dies with its mail undelivered (review M1). Needs drainMs -1. tear: only the first n writes of the last batch landed
  // load: round 7, the new boot's read hangs until a `loadOk`/`loadFail` storage step, or fails.
  // wipe: D104, H3: the origin's IndexedDB is gone at the next open, older records too.
  | { reload: true; crashAfterBoot?: true; tear?: number; load?: "hang" | "fail"; wipe?: true }
  | { storage: "ack" | "refuse" | "hang" | "landNoAck" | "failLate" | "loadOk" | "loadFail"; match?: string }
  | { clockBack: number } // round 7: the wall clock is set back
  | { freeze: boolean } // round 7: a frozen tab's timers do not fire
  | { ensureAs: { key: ActorRef; machine: string } } // D137
  | { sendMany: ReadonlyArray<readonly [ActorRef, string, unknown]> } // review M4: sends with no settle between them
  | { chargeWork: number } // D136: a listener's or a commit's tail's time, on the work clock (ms)
  | { advanceNow: number } // round 8, inside `afterYield`: time passes and timers fire, with no settling: a firing behind mail already queued
  | { nextYield: Step | readonly Step[] } // round 8, inside `afterYield`: and this at the next yield
  | { holdPlain: boolean } // round 7: plain successes stay in flight until a `storage` step
  | { slowAfterAck: true } // D104: the store goes slow at the next `ack`, so what follows it stays in flight
  | { storeWide: boolean } // round 7: one store: only the oldest batch can be answered
  | { hide: true; stay?: true } // round 7, D80: `visibilitychange` to hidden, or `pagehide`
  // A stream's server says something. `frames`: a burst, with no settling between them. `fail`: the connection fails with this.
  | { feed: string; frame?: unknown; frames?: readonly unknown[]; end?: true; fail?: unknown }
  | { fault: Fault }
  | { tasksPerStep: number | null } // D122: a spin never settles. From now on a step ends after this many tasks, and `quiet().spinning` says so
  | { disposeRuntime: true };

export type Row = {
  pending: boolean;
  uncertain: boolean;
  waiting: boolean;
  retryCount: number;
  outstanding: number;
};
export type RecordRead = {
  data: any; // undefined when absent or predicted away
  predicted: boolean;
  uncertain: boolean;
  unconfirmed: readonly string[];
};
export type Request = {
  op: string;
  input: any;
  idempotencyKey?: string;
  at: number;
  answered: boolean;
};
export type World0 = {
  charges: number; // distinct idempotency keys the server charged
  chargedKeys: readonly string[];
  acked: readonly string[];
  placed: number;
  voided: number;
  ledger: {
    charged: readonly string[]; // intents
    voided: readonly string[];
    placed: readonly string[];
    // Per authorization (D53). `pay` capturable adds one under its key; `void` voids what is on that intent then; `place` consumes the latest.
    auths: ReadonlyArray<{ key: string; intent: string; voided: boolean; placed: boolean }>;
    orders: readonly string[]; // order ids placed
  };
  server: any;
};
export type Frame = {
  cause: string;
  at: number;
  seq: number;
  view: Readonly<
    Record<
      string,
      { state: string; memory: unknown; rows: Readonly<Record<string, Row>> } // rows by `${op}|${JSON key}`
    >
  >;
  records: Readonly<Record<string, RecordRead>>;
};
// D29: claims, each checkable against what the suite owns. D49 (changed): a stall is Inspection's, here, not the row's.
export type Wait = { stalled?: "storage" | "record" | "module" } & WaitKind;
type WaitKind =
  | { kind: "wire"; op: string; attempt?: string }
  | { kind: "ack" | "capture"; op: string; attempt: string; key: string }
  | { kind: "queue" | "W"; op: string; attempt: string; mint: number; behind: readonly string[] }
  | { kind: "repair"; op: string; attempt: string; ref: string }
  | {
      kind: "held";
      op: string;
      attempt: string;
      mint: number;
      actor: string;
      owner: "bound" | "unplaced" | "unbound";
    }
  | { kind: "mail"; op: string; attempt: string }
  | { kind: "ready"; op: string; attempt: string } // eligible and not invoked: never true after settling
  | { kind: "timer"; key: string; at: number }
  | { kind: "disposing"; op: string; attempt: string }
  | { kind: "disabled"; op: string; attempt: string; module: string } // D46: a module holds it, having failed
  | { kind: "parked"; op: string; attempt: string } // rule 53: an ending waits for an incarnation of its path
  | { kind: "stranded"; op: string }; // D118: a read's answer or a stream's failure no turn could take
export type Outside = {
  open: ReadonlyArray<{ op: string; key?: string; never: boolean; input: any }>;
  mayHave: readonly string[]; // keys the fake says may be at the server, undecided: open, or lost
  storage: ReadonlyArray<{ purpose: string; keys: readonly string[]; hung: boolean }>;
  timers: readonly number[];
  lost: number; // requests whose answer was lost and which may still land
  feeds: ReadonlyArray<{
    op: string;
    input: any;
    from: unknown;
    open: boolean;
    closing: boolean;
    pulled: number;
    backlog: number;
  }>;
  live: number;
  scheduler: { picks: number; choices: number };
  failing: number; // plain writes whose failure has not been said yet
  batches: ReadonlyArray<{ at: number; purpose: string; writes: ReadonlyArray<{ key: string; value: string | undefined }> }>; // every batch asked of the store, in order
  injections: { planned: number; done: number; withLive: number; withChoice: number };
};
export type Reads = {
  missingEndings(): readonly string[]; // D117, oracle (j): what a committed turn asked for and nothing became; an ending refused twice with no wait
  writeAheadLies(): readonly string[]; // D112: keys the server may hold, on a persisted write, unreleased, that no lane's head on disk names
  state(a: ActorRef): string | undefined;
  memory(a: ActorRef): any;
  inner(a: ActorRef, path: readonly string[]): { state: string; memory: any } | undefined; // a fragment instance, undefined while inactive (N3)
  row(a: ActorRef, op: string, key?: unknown): Row | undefined;
  record(ref: string): RecordRead | undefined;
  requests(): readonly Request[];
  truth(): World0;
  frames(): readonly Frame[];
  issues(): ReadonlyArray<{ code: string; origin?: string; input?: unknown }>;
  evidence(kind?: string): ReadonlyArray<Record<string, any>>;
  stored(): ReadonlyMap<string, unknown>;
  diskKeys(): readonly string[];
  diskKind(key: string): string; // D142
  appliedTwice(): readonly string[]; // D145: keys the server really applied more than once
  bodyMismatches(): number; // D145: resends of a key with another body, which the server refused
  frozenDrops(): number; // D146: steps a frozen page could not take
  diskScope(key: string): string | undefined; // D142
  releaseSeen(attempt: string): boolean; // D158: the ledger saw a cause for this attempt's release (D154)
  actorKey(a: ActorRef): string; // D158: the id the suite names an actor by to the runtime, which `diskScope` answers in. One spelling, the suite's
  // Stage K: `loading`, the runtime has not booted yet (a slow `storage.load`). What it will restore is on disk only, and nothing waits on it
  quiet(): { idle: boolean; fatal: boolean; waits: readonly Wait[]; spinning?: boolean; frozen?: boolean; loading?: boolean };
  tasks(): number; // D122: how many tasks the page has had
  now(): number; // the virtual clock: what a correct bulk must not need
  outside(): Outside;
  stateHash(): string; // opaque; equal means the same future under the same steps
  module(id: string, ref: string): any; // a module's `read`: a stream's row
  peakDeliveriesInMail(): number; // rule 69: the most a single session has ever had in mail at once, over every step
  replay(): { same: boolean; firstDiff?: unknown };
};
export type Bounds = {
  drainMs: number;
  storageMs: number;
  disposeMs: number;
  repairMs: number;
  followUps: number;
  notifyChain: number;
  queueMax: number;
  pageMs: number;
};
export type Harness = {
  start(cfg: { machines: readonly Fixture[]; seed: number; bounds?: Partial<Bounds> }): void;
  do(step: Step): void; // runs, then settles
  release(now: () => void, before: () => void): void; // the program itself changes here: `now` makes it so, `before` undoes it. S11 replays each life under what it ran
  raw(step: Step): void; // runs, does not settle: D2 is visible on return
  subscribe(f: () => void): void; // notified per drain
  send(a: ActorRef, event: string, payload?: unknown): void; // from a subscriber: no settling
  read: Reads;
};

// ── What a runtime implements.
export type FaultState = {
  moduleThrows: Map<string, number>; // hook name to count
  moduleThrowsAfter: Map<string, number>;
  coreThrows: number;
  onLogged?: (n: number) => void; // a step was logged: `throwInCoreAfter` counts these
};
export type BootArgs = {
  readonly host: Host;
  readonly compiled: readonly Compiled[];
  readonly bounds: Partial<Bounds>;
  readonly faults: FaultState;
  readonly onEvidence: (e: ReadonlyArray<Record<string, any>>) => void;
  readonly onIssue: (i: ReadonlyArray<{ code: string; origin?: string; input?: unknown }>) => void;
  // Stage J (S1): an Instance's published reads answer from its first evidence, a boot's included: what it has published so far. Given
  // before the runtime boots, so a boot's runs are judged as they happen, by the same reads as any other batch's.
  readonly reads?: (r: BootReads) => void;
  // Round 11 (D211): what the machines' Slots require, merged. The Runtime runs every Effect a Slot returns with these, at the fiber's root, so no Slot
  // needs `Effect.provide` around it (finding F10: that wrapper is a step a scheduler can see).
  readonly services?: Context.Context<never>;
};
export type BootReads = Pick<Instance, "state" | "binding" | "memory" | "inner">;
export type Instance = {
  ensure(actor: string, machine: string, input: unknown): void;
  send(actor: string, event: Ev): void;
  dispose(actor: string): void;
  attach?(actor: string, machine: string, input: unknown, existing?: boolean): void; // rule 73: a runtime without uses has none. `existing`: only onto a live actor
  release?(actor: string): void;
  disposeRuntime(): void;
  repeatLastCompletion(): void;
  pending(): boolean;
  live(): number;
  logLength(): number;
  state(actor: string): string | undefined;
  // Stage E: where the runtime would deliver an ending of `op` with `subject` (rule 14, 53): a path, or undefined for none. Checked against `reference/`.
  binding?(actor: string, op: string, subject: readonly string[]): readonly string[] | undefined;
  memory(actor: string): unknown;
  inner(actor: string, path: readonly string[]): { state: string; memory: any } | undefined;
  row(actor: string, op: string, key: unknown): Row | undefined;
  record(ref: string): RecordRead | undefined;
  module(id: string, ref: string): any;
  peakDeliveriesInMail(): number;
  waits(): readonly Wait[];
  fatal(): boolean;
  frames(): readonly Frame[];
  stateText(outside: string): string;
  replay(before: (step: number) => void): { same: boolean; firstDiff?: unknown };
  subscribe(f: () => void): void;
};
// D142, over-assumptions F1: what the disk means, asked of the runtime's own codec. The suite owns the bytes (it tears, wipes and edits them) and no longer parses them: a runtime with another format answers these and passes.
export type DiskCodec = {
  kind(key: string): string; // what a stored key is: "actor", "lane", or the runtime's own word. Output counts keys by it
  scope(key: string): string | undefined; // the actor a stored key, or a wait's key, belongs to
  heads(entries: ReadonlyMap<string, string>): readonly string[]; // Attempt ids that are a lane's head on disk
  // Parked endings on disk. Stage L (review M7): `lane` names the lane record each is parked on, and each lane's list is in its saved order.
  parked(entries: ReadonlyMap<string, string>): ReadonlyArray<{ op: string; attempt: string; lane: string }>;
  decode(key: string, value: string): unknown; // a stored value, as a value
  // Stage K (re-check 10j S1'): the leaf an actor's record holds, for its root (`[]`) and every live copy in it, by path (the same path
  // form as `Instance.inner`). Undefined when the actor has no live record. A boot's first published state is checked against this, so
  // what a restored row is in is read from the suite's bytes, not from the runtime's decode of them. Stage L (review H1, L7): no answer for
  // a record the runtime restores is red, not a skip; and a Port must implement this reader apart from its restore's own decode, or D9 is
  // only a consistency check (limit L1).
  leaves(entries: ReadonlyMap<string, string>, actor: string): ReadonlyArray<{ path: readonly string[]; leaf: string }> | undefined;
};
export type Port = { boot(a: BootArgs): Instance; disk: DiskCodec };
export type RuntimeModule = { port: Port };
export type { Host };
