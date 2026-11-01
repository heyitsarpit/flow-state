// The whole contract between the suite and any runtime (convergence-1 section 12, D34). Internals stay invisible.
// A runtime implements `Port` (drive.ts turns it into a Harness), so settling, faults and the fake stay in the suite.
import type { Compiled, Ev } from "./fixtures/compiled.ts";
import type { Api, Host, ServerModel } from "./fake-world.ts";

export type ActorRef = { readonly actor: string; readonly id: string };
export type RequestMatch = string; // the fake's operation name
export type SlotPath = string;

export type Fixture = {
  readonly id: string;
  readonly make: (api: Api) => Compiled; // compiled data has commits, so it closes over the fake's API
  readonly server?: ServerModel; // what the fake server believes, for answers that come from truth
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
  | { truth: true }; // a read, answered from what the server now believes (M2's causal fake)

export type Fault =
  | { throwIn: SlotPath; times?: number }
  | { duplicateCompletion: RequestMatch }
  | { schedulerShuffle: number; atTick?: number; inject?: Step }
  | { lateAnswer: readonly [RequestMatch, Answer] } // the server's answer finally arrives
  | { landLate: RequestMatch } // a lost request lands at the server, unseen
  | { uninterruptibleHang: RequestMatch }
  | { syncAnswer: readonly [RequestMatch, Answer] }
  | { throwInModule: string } // D27: the next call of this hook of any module throws
  | { throwInCore: true } // D27: the next step's core code throws. Reached through data: no seam in the core
  | { startThrows: RequestMatch } // DRV-02: building this op's commit throws
  | { afterYield: Step } // runs when the runtime has yielded its drain to the host: a gap between steps
  | { mutateServer: (s: any) => any }; // the world changes with nobody asking: a price, another device

export type Step =
  | { ensure: ActorRef; input?: unknown }
  | { send: ActorRef; event: string; payload?: unknown }
  | { advance: number }
  | { answer: RequestMatch; with: Answer; where?: Readonly<Record<string, unknown>> }
  | { reload: true }
  | { storage: "ack" | "refuse" | "hang" | "landNoAck"; match?: string }
  | { fault: Fault }
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
// D29: claims, each checkable against what the suite owns.
export type Wait =
  | { kind: "wire"; op: string; attempt?: string }
  | { kind: "ack" | "capture"; op: string; attempt: string; key: string }
  | { kind: "queue" | "W"; op: string; attempt: string; mint: number; behind: readonly string[] }
  | { kind: "repair"; op: string; attempt: string; ref: string }
  | { kind: "held"; op: string; attempt: string; mint: number; actor: string }
  | { kind: "mail"; op: string; attempt: string }
  | { kind: "ready"; op: string; attempt: string } // eligible and not invoked: never true after settling
  | { kind: "timer"; key: string; at: number }
  | { kind: "disposing"; op: string; attempt: string };
export type Outside = {
  open: ReadonlyArray<{ op: string; key?: string; never: boolean }>;
  storage: ReadonlyArray<{ purpose: string; keys: readonly string[]; hung: boolean }>;
  timers: readonly number[];
  lost: number; // requests whose answer was lost and which may still land
  live: number;
  scheduler: { picks: number; choices: number };
  injections: { planned: number; done: number; withLive: number; withChoice: number };
};
export type Reads = {
  state(a: ActorRef): string | undefined;
  memory(a: ActorRef): any;
  row(a: ActorRef, op: string, key?: unknown): Row | undefined;
  record(ref: string): RecordRead | undefined;
  requests(): readonly Request[];
  truth(): World0;
  frames(): readonly Frame[];
  issues(): ReadonlyArray<{ code: string; origin?: string; input?: unknown }>;
  evidence(kind?: string): ReadonlyArray<Record<string, any>>;
  stored(): ReadonlyMap<string, unknown>;
  quiet(): { idle: boolean; fatal: boolean; waits: readonly Wait[] };
  outside(): Outside;
  stateHash(): string; // opaque; equal means the same future under the same steps
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
};
export type Harness = {
  start(cfg: { machines: readonly Fixture[]; seed: number; bounds?: Partial<Bounds> }): void;
  do(step: Step): void; // runs, then settles
  raw(step: Step): void; // runs, does not settle: D2 is visible on return
  subscribe(f: () => void): void; // notified per drain
  send(a: ActorRef, event: string, payload?: unknown): void; // from a subscriber: no settling
  read: Reads;
};

// ── What a runtime implements.
export type FaultState = {
  moduleThrows: Map<string, number>; // hook name to count
  coreThrows: number;
};
export type BootArgs = {
  readonly host: Host;
  readonly compiled: readonly Compiled[];
  readonly bounds: Partial<Bounds>;
  readonly faults: FaultState;
  readonly onEvidence: (e: ReadonlyArray<Record<string, any>>) => void;
  readonly onIssue: (i: ReadonlyArray<{ code: string; origin?: string; input?: unknown }>) => void;
};
export type Instance = {
  ensure(actor: string, machine: string, input: unknown): void;
  send(actor: string, event: Ev): void;
  disposeRuntime(): void;
  repeatLastCompletion(): void;
  pending(): boolean;
  live(): number;
  logLength(): number;
  state(actor: string): string | undefined;
  memory(actor: string): unknown;
  row(actor: string, op: string, key: unknown): Row | undefined;
  record(ref: string): RecordRead | undefined;
  waits(): readonly Wait[];
  fatal(): boolean;
  frames(): readonly Frame[];
  stateText(outside: string): string;
  replay(before: (step: number) => void): { same: boolean; firstDiff?: unknown };
  subscribe(f: () => void): void;
};
export type Port = { boot(a: BootArgs): Instance };
export type RuntimeModule = { port: Port };
export type { Host };
