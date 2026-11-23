// The Runtime as one value (convergence-1 section 3), and the plumbing of one step. Internal. Evidence and the log are
// sinks: nothing here reads them back. Plain objects, copied on write: round 1 has a handful of keys, and section 11
// forbids a persistent-map library unless measured.
import type { Compiled, Ev } from "../conformance/fixtures/compiled.ts";

export type Owner = { readonly node: string; readonly activation: string };
export type AttemptEnding =
  | { readonly ch: "success"; readonly value: unknown }
  | { readonly ch: "failure"; readonly tag: string; readonly value: unknown }
  | { readonly ch: "unknown"; readonly reason: string; readonly value?: unknown };
export type Attempt = {
  readonly id: string;
  readonly mint: number;
  readonly op: string;
  readonly input: unknown;
  readonly owner: Owner;
  readonly sends: number; // invocations so far; 0 means never sent, the table's "by history"
  readonly retryCount: number;
  readonly mayHaveApplied: boolean;
  readonly acked: boolean;
  readonly waits: { readonly ack: boolean; readonly capture: boolean };
  readonly wire?: { readonly gen: number; readonly timeout?: string };
  readonly settled?: AttemptEnding; // the ending, waiting in mail for admission
  readonly cancelled?: boolean; // this send was interrupted by Flow: Cancelled, not Interrupted
};
export type Lane = {
  readonly id: string;
  readonly actor: string;
  readonly op: string;
  readonly key: unknown;
  readonly state: "InFlight" | "Held";
  readonly head: Attempt;
  readonly parked?: AttemptEnding; // saved by disposal, delivered on restore
};
export type ReadLane = {
  readonly actor: string;
  readonly op: string;
  readonly gen: number;
  readonly owner: Owner;
};
export type Timer = {
  readonly key: string;
  readonly gen: number;
  readonly dueAt: number;
  readonly actor?: string;
  readonly activation?: string;
  readonly send?: string; // a schedule
  readonly attempt?: string; // an operation timeout, or a module's bound
  readonly kind: "schedule" | "timeout" | "module" | "dispose";
  readonly module?: string;
};
export type ActorRec = {
  readonly key: string;
  readonly machine: string;
  readonly leaf: string;
  readonly memory: any;
  readonly activations: Readonly<Record<string, string>>;
};
export type Mail =
  | { readonly k: "send"; readonly actor: string; readonly event: Ev }
  | { readonly k: "fire"; readonly actor: string; readonly activation: string; readonly event: Ev }
  | {
      readonly k: "ending";
      readonly actor: string;
      readonly op: string;
      readonly owner: Owner;
      readonly ending: AttemptEnding;
      readonly lane?: string;
      readonly attempt?: string;
      readonly restored?: boolean; // current from the active leaf, whatever the owner
    };
export type World = {
  readonly boot: number;
  readonly nextId: number;
  readonly nextMint: number;
  readonly clockSeq: number;
  readonly actors: Readonly<Record<string, ActorRec>>;
  readonly lanes: Readonly<Record<string, Lane>>;
  readonly reads: Readonly<Record<string, ReadLane>>;
  readonly timers: Readonly<Record<string, Timer>>;
  readonly mail: readonly Mail[];
  readonly dirty: readonly string[];
  readonly disposing: boolean;
  readonly disposed: boolean;
  readonly ext: Readonly<Record<string, unknown>>;
};
export const emptyWorld: World = {
  boot: 0,
  nextId: 1,
  nextMint: 1,
  clockSeq: 0,
  actors: {},
  lanes: {},
  reads: {},
  timers: {},
  mail: [],
  dirty: [],
  disposing: false,
  disposed: false,
  ext: {},
};

export type SendExit =
  | { readonly t: "ok"; readonly value: unknown }
  | { readonly t: "unknown"; readonly reason: unknown }
  | { readonly t: "failure"; readonly reason: unknown }
  | { readonly t: "defect"; readonly cause: unknown }
  | { readonly t: "interrupted"; readonly cause: unknown };
export type Input =
  | { readonly k: "boot"; readonly records: ReadonlyArray<readonly [string, string]> }
  | { readonly k: "sent"; readonly attempt: string; readonly send: number; readonly exit: SendExit }
  | { readonly k: "timer"; readonly timer: string; readonly gen: number }
  | { readonly k: "acked" | "captured"; readonly attempt: string; readonly ok: boolean }
  | { readonly k: "send"; readonly actor: string; readonly event: Ev }
  | {
      readonly k: "ensure";
      readonly actor: string;
      readonly machine: string;
      readonly input: unknown;
    }
  | { readonly k: "turn" }
  | { readonly k: "disposeRuntime" };

export type Command =
  | {
      readonly k: "invoke";
      readonly attempt: string;
      readonly send: number;
      readonly machine: string;
      readonly op: string;
      readonly input: unknown;
      readonly ctx: { readonly id: string; readonly mayHaveApplied: boolean };
    }
  | { readonly k: "interrupt"; readonly attempt: string; readonly send: number }
  | { readonly k: "arm"; readonly timer: string; readonly gen: number; readonly at: number }
  | { readonly k: "disarm"; readonly timer: string }
  | {
      readonly k: "persist";
      readonly writes: ReadonlyArray<{ readonly key: string; readonly value: string | undefined }>;
      readonly purpose: "acknowledge" | "capture" | "flush";
      readonly ticket?: { readonly k: "acked" | "captured"; readonly attempt: string };
    };

export type Env = { readonly now: number; id(): string };
export type Evidence = { readonly kind: string; readonly [k: string]: unknown };
export type Issue = { readonly code: string; readonly origin?: string; readonly input?: unknown };
export type Machines = Readonly<Record<string, Compiled>>;

// What one hook sees. Section 7's `Result<S>` was not enough: see RESULTS, finding "the seam".
export type Module = {
  readonly id: string;
  readonly rank: number;
  init?(): unknown;
  onInput?(s: unknown, input: Input, tx: Tx): unknown;
  onTimer?(s: unknown, timer: Timer, tx: Tx): unknown;
  onCommit?(s: unknown, prev: World, tx: Tx): unknown;
  blocksInvoke?(s: unknown, a: Attempt, tx: Tx): false | string;
  restore?(records: ReadonlyMap<string, unknown>, tx: Tx): unknown;
};
export type Tx = {
  w: World;
  readonly env: Env;
  readonly machines: Machines;
  readonly modules: readonly Module[];
  readonly commands: Command[];
  readonly evidence: Evidence[];
  readonly issues: Issue[];
  visible: boolean;
  cause: string;
};
export type StepOut = {
  readonly world: World;
  readonly commands: readonly Command[];
  readonly evidence: readonly Evidence[];
  readonly issues: readonly Issue[];
  readonly frame?: {
    readonly cause: string;
    readonly at: number;
    readonly seq: number;
    readonly world: World;
  };
};

export const laneKey = (actor: string, op: string, key: unknown) =>
  `${actor}|${op}|${JSON.stringify(key)}`;
export const note = (tx: Tx, kind: string, fields: Record<string, unknown> = {}) =>
  void tx.evidence.push({ kind, ...fields });
export const issue = (tx: Tx, i: Issue) => void tx.issues.push(i);
// F8: a generation is unique across reloads, so a claim from a dead process cannot be expressed.
export const nextGen = (tx: Tx) => {
  const n = tx.w.nextId;
  tx.w = { ...tx.w, nextId: n + 1 };
  return tx.w.boot * 1_000_000 + n;
};
export const activationId = (tx: Tx) => `${nextGen(tx)}`;
export const setLane = (tx: Tx, lane: Lane) => {
  const dirty = tx.w.dirty.includes(lane.id) ? tx.w.dirty : [...tx.w.dirty, lane.id];
  tx.w = { ...tx.w, lanes: { ...tx.w.lanes, [lane.id]: lane }, dirty };
  tx.visible = true;
};
export const deleteLane = (tx: Tx, id: string) => {
  const { [id]: _gone, ...lanes } = tx.w.lanes;
  tx.w = { ...tx.w, lanes, dirty: tx.w.dirty.filter((d) => d !== id) };
  tx.visible = true;
};
export const enqueue = (tx: Tx, m: Mail) => {
  tx.w = { ...tx.w, mail: [...tx.w.mail, m] };
};
export const laneOfAttempt = (w: World, attempt: string) =>
  Object.values(w.lanes).find((l) => l.head.id === attempt);
export const endingReason = (e: AttemptEnding): string =>
  e.ch === "unknown"
    ? e.reason
    : e.ch === "failure"
      ? e.tag === "NotSent"
        ? (e.value as { why: string }).why
        : e.tag
      : "success";
