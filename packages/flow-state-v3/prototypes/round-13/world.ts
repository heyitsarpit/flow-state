// The Runtime as one value, and the plumbing of one step. Internal. Plain objects copied on write (D37). Evidence and the log
// are sinks: nothing here reads them back.
import type { Compiled, Ev, Fragment } from "../conformance/fixtures/compiled.ts";
import { noActors, type Actors } from "./actors.ts";
import { canon } from "./gate.ts";
import type { Module } from "./seam.ts";

import { MailQ } from "./mailq.ts";
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
  readonly sentAt: number; // D47: the world's position at the first send. A restored Attempt's is 0
  readonly phase: Phase;
};
export type Parked = {
  readonly attempt?: string;
  readonly ending: Ending;
  readonly owner: Owner;
  readonly input: unknown;
  readonly kept?: true; // D118: a turn refused it twice. The machine has not heard: its lane is not Idle
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
  // Round 13 (D221, round 12 review H1): the key fields this lane's key was made under, stamped at mint and by a rekey. A lane is "under an older key"
  // only when this differs from its operation's current `keyFields`: a release boundary, never a key's shape. Absent: a hand key closure (F2), no fields.
  readonly keyFields?: readonly string[];
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
  readonly kept?: true; // D123: it came off a lane where it was kept, and goes back as that
};
export type FireMail = {
  readonly k: "fire";
  readonly actor: string;
  readonly inc: string;
  readonly activation: string;
  readonly event: Ev;
  readonly redelivered?: boolean; // D50
};
export type Mail =
  | { readonly k: "send"; readonly actor: string; readonly event: Ev }
  | FireMail
  | EndingMail
  | { readonly k: "recheck"; readonly actor: string } // a pending reset (rule 1)
  // A module's delivery (rule 69), current from the active leaf, fenced by incarnation as a firing is (M8).
  | {
      readonly k: "deliver";
      readonly actor: string;
      readonly inc: string;
      readonly activation: string; // rule 70: a session belongs to its placement's activation
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
  readonly actors: Actors; // D90
  readonly retired: Readonly<Record<string, ActorRec>>; // a persisted identity's record, kept for its next ensure (2.7.13)
  readonly lanes: Readonly<Record<string, Lane>>;
  readonly byAttempt: Readonly<Record<string, string>>;
  readonly ready: Readonly<Record<string, true>>;
  readonly reads: Readonly<Record<string, ReadLane>>;
  readonly timers: Readonly<Record<string, Timer>>;
  readonly mail: MailQ<Mail>; // D140
  readonly follow: readonly Mail[];
  readonly chain: number;
  readonly rota: readonly string[]; // D122: the actors with mail, in the order they are next served
  readonly failing: Readonly<Record<string, { readonly input: string; readonly n: number }>>; // D122: by actor and operation, the same input failing in a row. It names a spin, and decides nothing
  readonly status: "live" | "disposing" | "disposed";
  // Last value emitted per lane. The edge loses nothing it accepted, so this is only a diff.
  readonly savedLanes: Readonly<Record<string, string>>;
  readonly persistence: boolean; // D26, review H3: false: this tab read no disk and writes none. A persisted machine's commit declines
  readonly quarantined: Readonly<Record<string, true>>; // D88: a lane whose record this release cannot read. Its id still holds
  readonly rekeyed: Readonly<Record<string, string>>; // D78: new lane id -> old id still on disk
  readonly stranded: Readonly<Record<string, { readonly actor: string; readonly inc: string; readonly op: string }>>; // D123: a read's answer or a stream's failure no turn could take, by the life that asked. Nothing on disk. It ends with that life, or at that life's next ask of the same op
  readonly keptFires: readonly FireMail[]; // D118: a deadline no turn could take. On the record until a turn commits it, or its activation ends
  readonly disabled: Readonly<Record<string, true>>;
  readonly stalled: Readonly<Record<string, "storage" | "record" | "module">>; // D49, by Attempt
  readonly ext: Readonly<Record<string, unknown>>;
};
export const emptyWorld: World = {
  boot: 0,
  nextId: 1,
  nextMint: 1,
  seq: 0,
  actors: noActors,
  retired: {},
  lanes: {},
  byAttempt: {},
  ready: {},
  reads: {},
  timers: {},
  mail: MailQ.empty<Mail>(),
  follow: [],
  chain: 0,
  rota: [],
  failing: {},
  status: "live",
  savedLanes: {},
  persistence: true,
  quarantined: {},
  rekeyed: {},
  stranded: {},
  keptFires: [],
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
  | { readonly k: "boot"; readonly records: ReadonlyArray<readonly [string, string]>; readonly persistence?: boolean }
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

// D80: `record` is an actor's record, unencoded: the driver encodes it when it writes. `value`: already bytes, or undefined to delete.
export type Write = {
  readonly key: string;
  readonly value?: string | undefined;
  readonly record?: unknown;
};
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
      readonly scope: string; // the actor's key. `meta` is its own
      readonly writes: readonly Write[];
      readonly now: boolean; // does not wait for `captureMs`: a lane, a retired identity, an armed deadline
      readonly ticket?: { readonly attempt: string; readonly ticket: string; readonly purpose: "capture" | "acknowledge" };
    }
  | { readonly k: "module"; readonly m: string; readonly cmd: unknown };

export type Env = { readonly now: number; id(): string };
export type Evidence = { readonly kind: string; readonly [k: string]: unknown };
export type Issue = { readonly code: string; readonly origin?: string; readonly input?: unknown; readonly cause?: string }; // D123: `cause`, what a user's closure threw
export type Bounds = {
  readonly drainMs: number;
  readonly storageMs: number;
  readonly disposeMs: number;
  readonly repairMs: number;
  readonly pageMs: number; // D79: a read's page deadline. Proposed for T1
  readonly captureMs: number; // D80 (accepted): plain memory coalesces this long, flushed on hide. 0: at once. D84: a batch touching a lane never waits
  readonly bootMs: number; // D87: a read of the disk that has not answered by now is O5's StorageFailure. A guess
  readonly retryMaxMs: number;
  readonly sameFailures: number; // D122: the same ask failing in a row, with the same input, before `TurnStorm` names it. Decides nothing. A guess, in line with `followUps`
  readonly bootQueue: number; // D87: inputs held until boot; past this, dropped with evidence
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
  pageMs: 30_000,
  captureMs: 5_000,
  bootMs: 10_000,
  retryMaxMs: 30_000,
  sameFailures: 64,
  bootQueue: 1_024,
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
  readonly decode?: (key: string, text: string) => unknown; // stage J: the Host's codec for a stored record. Not given: `JSON.parse`
};
export type Tx = System & {
  w: World;
  readonly env: Env;
  readonly commands: Command[];
  readonly evidence: Evidence[];
  readonly issues: Issue[];
  readonly touchedActors: Set<string>;
  readonly touchedLanes: Map<string, string>; // lane id -> its actor: the scope a deleted lane's write belongs to
  armedDeadline: boolean; // a schedule was armed this step: an armed deadline does not wait for captureMs
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
const strandKey = (actor: string, inc: string, op: string) => `${actor}|${inc}|${op}`;
export const strand = (tx: Tx, actor: string, inc: string, op: string) => {
  tx.w = { ...tx.w, stranded: { ...tx.w.stranded, [strandKey(actor, inc, op)]: { actor, inc, op } } };
  tx.visible = true;
};
export const clearStranded = (tx: Tx, actor: string, inc: string, op: string) => {
  if (tx.w.stranded[strandKey(actor, inc, op)])
    tx.w = { ...tx.w, stranded: without(tx.w.stranded, strandKey(actor, inc, op)) };
};
// D123: what a life was owed ends with it.
export const reapStranded = (tx: Tx, gone: (s: { readonly actor: string; readonly inc: string }) => boolean) => {
  const kept = Object.entries(tx.w.stranded).filter(([, s]) => !gone(s));
  if (kept.length !== Object.keys(tx.w.stranded).length) {
    tx.w = { ...tx.w, stranded: Object.fromEntries(kept) };
    tx.visible = true;
  }
};
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
  tx.touchedLanes.set(lane.id, lane.actor);
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
  tx.touchedLanes.set(id, prev.actor);
  tx.visible = true;
};
// D122: mail is served actor by actor, oldest first within each, so what one actor has queued does not stand in front of another's press.
export const enqueue = (tx: Tx, m: Mail) => {
  const inRota = tx.w.mail.has(m.actor) || tx.w.rota.includes(m.actor); // the queue answers first: it is one look when this actor already has mail, as in a burst
  const rota = inRota ? tx.w.rota : [...tx.w.rota, m.actor];
  tx.w = { ...tx.w, mail: tx.w.mail.push(m), rota };
};
export const takeMail = (tx: Tx): Mail | undefined => {
  let rota = tx.w.rota;
  for (;;) {
    const actor = rota[0];
    const got = actor === undefined ? tx.w.mail.takeFirst() : tx.w.mail.take(actor);
    if (actor !== undefined && !got) {
      rota = rota.slice(1); // its mail went some other way: a freeze, a retract
      continue;
    }
    if (!got) {
      tx.w = { ...tx.w, rota: [] };
      return undefined;
    }
    const { item, rest } = got;
    tx.w = { ...tx.w, mail: rest, rota: rest.has(item.actor) ? [...rota.slice(1), item.actor] : rota.slice(1) };
    return item;
  }
};
// A firing still in mail, or kept, is a schedule to the disk (L6, D118).
export const fireAsTimer = (m: FireMail, now: number): FrozenTimer => ({
  key: `fired/${m.inc}/${m.event.tag}`,
  gen: "",
  dueAt: now,
  kind: "schedule",
  actor: m.actor,
  inc: m.inc,
  activation: m.activation,
  send: m.event.tag,
  id: m.event.tag,
});
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
