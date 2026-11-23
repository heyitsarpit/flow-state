// The Runtime as one value, and the plumbing of one step. Internal. Plain objects copied on write, with indexes in place of
// scans (D37). Evidence and the log are sinks: nothing here reads them back.
import type { Compiled, Ev } from "../conformance/fixtures/compiled.ts";
import type { Module } from "./seam.ts";

export type Owner = { readonly node: string; readonly activation: string };
export type Ending =
  | { readonly ch: "success"; readonly value: unknown }
  | { readonly ch: "failure"; readonly tag: string; readonly value: unknown }
  | { readonly ch: "unknown"; readonly reason: string; readonly value?: unknown };
// D28: one Attempt, one phase. "Held with a wire" cannot be written, and nothing has to remember what it asked for (H3).
export type Phase =
  | { readonly t: "queued" } // in W
  | { readonly t: "durable"; readonly on: "ack" | "capture"; readonly ticket: string }
  | { readonly t: "ready" } // only a module can hold it now
  | { readonly t: "wire"; readonly gen: string; readonly cancelled: boolean }
  | { readonly t: "settled"; readonly ending: Ending } // in mail; the row still reads pending
  | { readonly t: "held" };
export type Attempt = {
  readonly id: string;
  readonly mint: number;
  readonly input: unknown;
  readonly owner: Owner;
  readonly sends: number; // invocations so far; 0 means never sent, the table's "by history"
  readonly retryCount: number;
  readonly mayHaveApplied: boolean;
  readonly acked: boolean;
  readonly phase: Phase;
};
export type Parked = { readonly attempt: string; readonly ending: Ending; readonly head: boolean };
export type Lane = {
  readonly id: string;
  readonly actor: string;
  readonly machine: string;
  readonly op: string;
  readonly key: unknown;
  readonly head: Attempt;
  readonly w: readonly Attempt[];
  readonly parked?: readonly Parked[]; // saved by disposal, delivered on restore
};
export type ReadLane = {
  readonly actor: string;
  readonly machine: string;
  readonly op: string;
  readonly gen: string;
  readonly owner: Owner;
  readonly input: unknown;
  readonly key: unknown;
};
export type Timer = {
  readonly key: string;
  readonly gen: string;
  readonly dueAt: number;
} & (
  | {
      readonly kind: "schedule";
      readonly actor: string;
      readonly activation: string;
      readonly send: string;
    }
  | { readonly kind: "timeout"; readonly attempt: string }
  | { readonly kind: "storage"; readonly attempt: string }
  | { readonly kind: "module"; readonly module: string }
  | { readonly kind: "dispose" }
);
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
      readonly key: unknown;
      readonly owner: Owner;
      readonly ending: Ending;
      readonly attempt?: string; // addresses the lane's head when `onLane`
      readonly onLane?: boolean;
      readonly restored?: boolean; // current from the active leaf, whatever the owner
    };
export type World = {
  readonly boot: number;
  readonly nextId: number;
  readonly nextMint: number;
  readonly seq: number;
  readonly actors: Readonly<Record<string, ActorRec>>;
  readonly lanes: Readonly<Record<string, Lane>>;
  readonly byAttempt: Readonly<Record<string, string>>; // head Attempts to their lane
  readonly ready: Readonly<Record<string, true>>; // D4: lanes whose head is `ready`, rechecked after every step
  readonly reads: Readonly<Record<string, ReadLane>>;
  readonly timers: Readonly<Record<string, Timer>>;
  readonly mail: readonly Mail[];
  readonly follow: readonly Mail[]; // head insertions: they run next, before any other mail (D1)
  readonly chain: number; // follow-ups admitted since the last ordinary item (D35)
  readonly status: "live" | "disposing" | "disposed";
  readonly savedLanes: Readonly<Record<string, string>>; // what storage was last told, per lane
  readonly savedMeta: string;
  readonly disabled: Readonly<Record<string, true>>; // D27
  readonly ext: Readonly<Record<string, unknown>>; // module slices; the core never reads inside
};
export const emptyWorld: World = {
  boot: 0,
  nextId: 1,
  nextMint: 1,
  seq: 0,
  actors: {},
  lanes: {},
  byAttempt: {},
  ready: {},
  reads: {},
  timers: {},
  mail: [],
  follow: [],
  chain: 0,
  status: "live",
  savedLanes: {},
  savedMeta: "",
  disabled: {},
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
  | { readonly k: "sent"; readonly attempt: string; readonly send: string; readonly exit: SendExit }
  | { readonly k: "timer"; readonly timer: string; readonly gen: string }
  | {
      readonly k: "stored";
      readonly attempt: string;
      readonly ticket: string;
      readonly ok: boolean;
    }
  | { readonly k: "module"; readonly m: string; readonly payload: unknown }
  | { readonly k: "send"; readonly actor: string; readonly event: Ev }
  | {
      readonly k: "ensure";
      readonly actor: string;
      readonly machine: string;
      readonly input: unknown;
    }
  | { readonly k: "turn" }
  | { readonly k: "disposeRuntime" };

export type Write = { readonly key: string; readonly value: string | undefined };
export type Command =
  | {
      readonly k: "invoke";
      readonly attempt: string;
      readonly send: string;
      readonly machine: string;
      readonly op: string;
      readonly input: unknown;
      readonly ctx: { readonly id: string; readonly mayHaveApplied: boolean };
    }
  | { readonly k: "interrupt"; readonly attempt: string; readonly send: string }
  | { readonly k: "arm"; readonly timer: string; readonly gen: string; readonly at: number }
  | { readonly k: "disarm"; readonly timer: string }
  | {
      readonly k: "persist";
      readonly writes: readonly Write[];
      readonly purpose: "acknowledge" | "capture" | "flush";
      readonly ticket?: { readonly attempt: string; readonly ticket: string };
    }
  | { readonly k: "module"; readonly m: string; readonly cmd: unknown };

export type Env = { readonly now: number; id(): string };
export type Evidence = { readonly kind: string; readonly [k: string]: unknown };
export type Issue = { readonly code: string; readonly origin?: string; readonly input?: unknown };
export type Bounds = {
  readonly drainMs: number;
  readonly storageMs: number;
  readonly disposeMs: number;
  readonly repairMs: number;
  readonly followUps: number;
  readonly notifyChain: number;
  readonly queueMax: number;
};
export const defaultBounds: Bounds = {
  drainMs: 8,
  storageMs: 10_000,
  disposeMs: 5_000,
  repairMs: 30_000,
  followUps: 64,
  notifyChain: 64,
  queueMax: 64,
};
export type Machines = Readonly<Record<string, Compiled>>;
export type System = {
  readonly machines: Machines;
  readonly modules: readonly Module<any>[];
  readonly bounds: Bounds;
};
export type Tx = System & {
  w: World;
  readonly env: Env;
  readonly commands: Command[];
  readonly evidence: Evidence[];
  readonly issues: Issue[];
  readonly touchedActors: Set<string>;
  readonly touchedLanes: Set<string>;
  readonly asks: Array<{ lane: string; on: "ack" | "capture"; ticket: string }>;
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
  return `g${tx.w.boot}.${n}`;
};
const without = <V>(o: Readonly<Record<string, V>>, k: string): Readonly<Record<string, V>> => {
  if (!(k in o)) return o;
  const { [k]: _gone, ...rest } = o;
  return rest;
};
export { without };
// The one way a lane is stored: its indexes follow from it, so they cannot disagree.
export const setLane = (tx: Tx, lane: Lane) => {
  const prev = tx.w.lanes[lane.id];
  const byAttempt =
    prev?.head.id === lane.head.id
      ? tx.w.byAttempt
      : {
          ...(prev ? without(tx.w.byAttempt, prev.head.id) : tx.w.byAttempt),
          [lane.head.id]: lane.id,
        };
  const ready =
    lane.head.phase.t === "ready"
      ? tx.w.ready[lane.id]
        ? tx.w.ready
        : { ...tx.w.ready, [lane.id]: true as const }
      : without(tx.w.ready, lane.id);
  tx.w = { ...tx.w, lanes: { ...tx.w.lanes, [lane.id]: lane }, byAttempt, ready };
  tx.touchedLanes.add(lane.id);
  tx.visible = true;
};
export const deleteLane = (tx: Tx, id: string) => {
  const prev = tx.w.lanes[id];
  if (!prev) return;
  tx.w = {
    ...tx.w,
    lanes: without(tx.w.lanes, id),
    byAttempt: without(tx.w.byAttempt, prev.head.id),
    ready: without(tx.w.ready, id),
  };
  tx.touchedLanes.add(id);
  tx.visible = true;
};
export const enqueue = (tx: Tx, m: Mail) => {
  tx.w = { ...tx.w, mail: [...tx.w.mail, m] };
};
export const laneOfAttempt = (w: World, attempt: string) => {
  const id = w.byAttempt[attempt];
  return id === undefined ? undefined : w.lanes[id];
};
export const endingReason = (e: Ending): string =>
  e.ch === "unknown"
    ? e.reason
    : e.ch === "failure"
      ? e.tag === "NotSent"
        ? (e.value as { why: string }).why
        : e.tag
      : "success";
export const noteEnding = (tx: Tx, a: { op: string; attempt?: string; send?: string }, e: Ending) =>
  note(tx, "ending", {
    op: a.op,
    attempt: a.attempt,
    send: a.send,
    channel: e.ch,
    reason: endingReason(e),
  });
