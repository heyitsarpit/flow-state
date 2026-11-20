// The Runtime as one value, and the plumbing of one step. Internal. Plain objects copied on write (D37). Evidence and the log
// are sinks: nothing here reads them back.
import type { Compiled, Ev, Fragment } from "../conformance/fixtures/compiled.ts";
import { canon } from "./gate.ts";
import type { Module } from "./seam.ts";

export type Owner = {
  readonly inc: string; // rule 14's test runs inside this incarnation
  readonly node: string;
  readonly activation: string;
  readonly chain: ReadonlyArray<{ readonly node: string; readonly activation: string }>; // ancestors, nearest first
};
export type Ending =
  | { readonly ch: "success"; readonly value: unknown }
  | { readonly ch: "failure"; readonly tag: string; readonly value: unknown }
  | { readonly ch: "unknown"; readonly reason: string; readonly value?: unknown };
// D28: one Attempt, one phase. D48: `then` is what a cancel or a replace waits for, once storage has answered.
export type Phase =
  | { readonly t: "queued" }
  | {
      readonly t: "durable";
      readonly on: "ack" | "capture";
      readonly ticket: string;
      readonly then?: "cancel" | "replace";
    }
  | { readonly t: "ready" }
  | { readonly t: "wire"; readonly gen: string; readonly cancelled: boolean }
  | { readonly t: "settled"; readonly ending: Ending }
  | { readonly t: "held" };
export type Attempt = {
  readonly id: string;
  readonly mint: number;
  readonly input: unknown;
  readonly owner: Owner;
  readonly retryCount: number;
  // D45: "by history" is this one-way bit. An unknown ending or a restore as unknown sets it; `sends` is gone.
  readonly mayHaveApplied: boolean;
  readonly acked: boolean;
  readonly sentAt: number; // D47: the world's position at the first send. A restored Attempt's is 0
  readonly phase: Phase;
};
export type Parked = {
  readonly attempt?: string;
  readonly ending: Ending;
  readonly owner: Owner;
  readonly input: unknown;
};
export type Lane = {
  readonly id: string;
  readonly actor: string;
  readonly machine: string;
  readonly op: string;
  readonly key: unknown;
  readonly subject: readonly string[]; // rule 51
  readonly head?: Attempt; // absent: only parked endings keep this lane (rule 53)
  readonly w: readonly Attempt[];
  readonly parked: readonly Parked[];
  readonly releasing?: true; // rule 60
};
export type ReadLane = {
  readonly actor: string;
  readonly machine: string;
  readonly op: string;
  readonly gen: string;
  readonly pos: number; // D47
  readonly inc: string;
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
      readonly inc: string;
      readonly activation: string;
      readonly send: string;
      readonly id: string;
    }
  | { readonly kind: "timeout" | "storage" | "stall" | "yield"; readonly attempt: string }
  | { readonly kind: "module"; readonly module: string }
  | { readonly kind: "dispose" }
);
export type FrozenTimer = Extract<Timer, { kind: "schedule" }>;
// D52: one life of a placement. An actor's root is one too, with path [] and frag null.
export type Inc = {
  readonly id: string;
  readonly frag: string | null;
  readonly leaf: string;
  readonly memory: any;
  readonly activations: Readonly<Record<string, string>>;
  readonly history: Readonly<Record<string, string>>;
  readonly subject: readonly string[];
  readonly reset?: string; // JSON of the reset value this incarnation has
  readonly name?: string; // the placement's. D57: a part is an opaque id; this and `key` are what is read
  readonly key?: string;
  readonly item?: unknown;
  readonly each?: readonly string[]; // active `.each` placements, so none reads [] (M7)
  // D62: a module's private partition of the slice's saved record (rule 71). Opaque to core; it lives and dies with this life.
  readonly partition?: Readonly<Record<string, unknown>>;
  readonly frozen?: { readonly timers: readonly FrozenTimer[]; readonly parked: readonly Mail[] };
  readonly kids: Readonly<Record<string, Inc>>; // "summary", "CHALLENGE", "uploads:r1"
};
export type ActorRec = { readonly key: string; readonly machine: string; readonly root: Inc };
export type EndingMail = {
  readonly k: "ending";
  readonly actor: string;
  readonly machine?: string; // a restored ending may have no lane and no actor left to say it (D61)
  readonly op: string;
  readonly key: unknown;
  readonly owner: Owner;
  readonly ending: Ending;
  readonly input: unknown;
  readonly subject?: readonly string[]; // the lane's. A fragment's ending reaches the incarnation with it (rule 53)
  readonly attempt?: string;
  readonly inc?: string; // a read's incarnation
  readonly onLane?: boolean; // its cell has yet to apply
  readonly restored?: boolean; // current from the active leaf, whatever the owner
  readonly redelivered?: boolean; // D50
};
export type Mail =
  | { readonly k: "send"; readonly actor: string; readonly event: Ev }
  | {
      readonly k: "fire";
      readonly actor: string;
      readonly inc: string;
      readonly activation: string;
      readonly event: Ev;
      readonly redelivered?: boolean; // D50
    }
  | EndingMail
  | { readonly k: "recheck"; readonly actor: string } // a pending reset (rule 1)
  // A module's delivery (rule 69), current from the active leaf, fenced by incarnation as a firing is (M8).
  | {
      readonly k: "deliver";
      readonly actor: string;
      readonly inc: string;
      readonly event: Ev;
      readonly module: string;
      readonly tag: string;
      readonly ending: boolean; // a `failure` is an ending too (rule 47): D50 applies. A value is T1's end(Defect)
      readonly redelivered?: boolean;
    };
export type World = {
  readonly boot: number;
  readonly nextId: number;
  readonly nextMint: number;
  readonly seq: number;
  readonly actors: Readonly<Record<string, ActorRec>>;
  readonly retired: Readonly<Record<string, ActorRec>>; // a persisted identity's record, kept for its next ensure (2.7.13)
  readonly lanes: Readonly<Record<string, Lane>>;
  readonly byAttempt: Readonly<Record<string, string>>;
  readonly ready: Readonly<Record<string, true>>;
  readonly reads: Readonly<Record<string, ReadLane>>;
  readonly timers: Readonly<Record<string, Timer>>;
  readonly mail: readonly Mail[];
  readonly follow: readonly Mail[];
  readonly chain: number;
  readonly status: "live" | "disposing" | "disposed";
  readonly savedLanes: Readonly<Record<string, string>>;
  readonly savedMeta: string;
  readonly disabled: Readonly<Record<string, true>>;
  readonly stalled: Readonly<Record<string, "storage" | "record" | "module">>; // D49, by Attempt
  readonly ext: Readonly<Record<string, unknown>>;
};
export const emptyWorld: World = {
  boot: 0,
  nextId: 1,
  nextMint: 1,
  seq: 0,
  actors: {},
  retired: {},
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
  stalled: {},
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
  | { readonly k: "dispose"; readonly actor: string }
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
  readonly recordStallMs: number; // D49
  readonly unboundHoldMs: number; // D15
};
export const defaultBounds: Bounds = {
  drainMs: 8,
  storageMs: 10_000,
  disposeMs: 5_000,
  repairMs: 30_000,
  followUps: 64,
  notifyChain: 64,
  queueMax: 64,
  recordStallMs: 30_000,
  unboundHoldMs: 300_000,
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
  inTurn: boolean; // D46: is a user closure's throw a refusal, or an issue with a default?
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

// A user's key closure may return what cannot encode: the caller has gated it (D57). Written once, never read back.
export const laneKey = (actor: string, op: string, key: unknown) => `${actor}|${op}|${canon(key)}`;
export const fragOf = (m: Compiled, inc: Inc): Pick<Fragment, "nodes" | "root" | "memory"> =>
  inc.frag === null ? m : m.fragments![inc.frag]!;
export const note = (tx: Tx, kind: string, fields: Record<string, unknown> = {}) =>
  void tx.evidence.push({ kind, ...fields });
export const issue = (tx: Tx, i: Issue) => void tx.issues.push(i);
export const nextGen = (tx: Tx) => {
  const n = tx.w.nextId;
  tx.w = { ...tx.w, nextId: n + 1 };
  return `g${tx.w.boot}.${n}`;
};
// D58: a unique tick. Reading one moves it, so an answer's start and what it is compared with can never tie (H1).
export const position = (tx: Tx) => {
  const n = tx.w.nextId;
  tx.w = { ...tx.w, nextId: n + 1 };
  return n;
};
export const without = <V>(
  o: Readonly<Record<string, V>>,
  k: string,
): Readonly<Record<string, V>> => {
  if (!(k in o)) return o;
  const { [k]: _gone, ...rest } = o;
  return rest;
};
// The one way a lane is stored: its indexes follow from it, so they cannot disagree.
export const setLane = (tx: Tx, lane: Lane) => {
  const prev = tx.w.lanes[lane.id];
  const was = prev?.head?.id;
  const is = lane.head?.id;
  let byAttempt = tx.w.byAttempt;
  if (was !== is) {
    if (was) byAttempt = without(byAttempt, was);
    if (is) byAttempt = { ...byAttempt, [is]: lane.id };
  }
  const ready =
    lane.head?.phase.t === "ready"
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
    byAttempt: prev.head ? without(tx.w.byAttempt, prev.head.id) : tx.w.byAttempt,
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
export const clearStall = (tx: Tx, attempt: string) => {
  if (tx.w.stalled[attempt]) tx.w = { ...tx.w, stalled: without(tx.w.stalled, attempt) };
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
export const declined = (why: string): Ending => ({
  ch: "failure",
  tag: "NotSent",
  value: { why },
});
