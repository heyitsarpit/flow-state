// The write lane: 2.7.13's table as data (D17, D28). A row and a column pick one action; a pair the table says cannot occur
// raises an issue (S12). Columns are phases, and "by history" is one bit (D45). 2.9.3's releasing rows are rows here too.
import { hook, sentAll, startAll } from "./hooks.ts";
import { requestDurable } from "./durable.ts";
import { armTimer, disarmTimer } from "./timers.ts";
import { same } from "./gate.ts";
import {
  clearStall,
  declined,
  deleteLane,
  enqueue,
  issue,
  laneKey,
  nextGen,
  note,
  noteEnding,
  position,
  setLane,
  type Attempt,
  type Ending,
  type EndingMail,
  type Lane,
  type Owner,
  type Tx,
} from "./world.ts";

type Column = "Idle" | "Kept" | "Waiting" | "Resend" | "Wire" | "Settled" | "Held"; // D123: Kept, no head, and a sent Attempt's ending the machine has not heard. A decline sent nothing, so it never makes this column
type Row =
  | "commit"
  | "retry"
  | "cancel"
  | "invoked"
  | "storageRefused"
  | "success"
  | "failure"
  | "unknown"
  | "interrupt"
  | "restore"
  | "runtimeDisposal"
  | "release"; // rule 60: the leaving turn marks
type Action =
  | "mint"
  | "busy"
  | "commitOverWaiting"
  | "nothingToResend"
  | "evidenceInFlight"
  | "resend"
  | "nothing"
  | "busyKept"
  | "cancelNeverSent"
  | "cancelResend"
  | "interruptWire"
  | "giveUp"
  | "invoke"
  | "refuseFirst"
  | "refuseResend"
  | "resolve"
  | "hold"
  | "byEnding"
  | "disposeNeverSent"
  | "disposeResend"
  | "disposeWire"
  | "disposeSettled"
  | "markIdle"
  | "markNeverSent"
  | "markResend"
  | "markWire"
  | "markSettled"
  | "markHeld";

const IN_FLIGHT: readonly Column[] = ["Waiting", "Resend", "Wire", "Settled"];
const all = (a: Action): Partial<Record<Column, Action>> =>
  Object.fromEntries(IN_FLIGHT.map((c) => [c, a]));
const TABLE: Readonly<Record<Row, Partial<Record<Column, Action>>>> = {
  commit: {
    Idle: "mint",
    Kept: "busyKept",
    Waiting: "commitOverWaiting",
    Resend: "busy",
    Wire: "busy",
    Settled: "busy",
    Held: "busy",
  },
  retry: { Idle: "nothingToResend", Kept: "nothingToResend", ...all("evidenceInFlight"), Held: "resend" },
  cancel: {
    Idle: "nothing",
    Kept: "nothing", // D123: `letGoKept` has taken it before the row is read
    Waiting: "cancelNeverSent",
    Resend: "cancelResend",
    Wire: "interruptWire",
    Settled: "nothing", // rule 24: a settled ending is never rewritten
    Held: "giveUp",
  },
  invoked: { Waiting: "invoke", Resend: "invoke" },
  storageRefused: { Waiting: "refuseFirst", Resend: "refuseResend" },
  success: { Settled: "resolve" },
  failure: { Settled: "resolve" },
  unknown: { Settled: "hold" },
  interrupt: { Settled: "hold" },
  restore: { Settled: "byEnding", Held: "nothing" },
  runtimeDisposal: {
    Waiting: "disposeNeverSent",
    Resend: "disposeResend",
    Wire: "disposeWire",
    Settled: "disposeSettled",
    Held: "nothing",
  },
  release: {
    Idle: "markIdle",
    Kept: "markIdle",
    Waiting: "markNeverSent",
    Resend: "markResend",
    Wire: "markWire",
    Settled: "markSettled",
    Held: "markHeld",
  },
};
const GUARD: Readonly<
  Record<"idle" | "retryable", Partial<Record<Column, "pass" | "deny" | "budget">>>
> = {
  idle: {
    Idle: "pass",
    Kept: "deny",
    Waiting: "deny",
    Resend: "deny",
    Wire: "deny",
    Settled: "deny",
    Held: "deny",
  },
  retryable: {
    Idle: "deny",
    Kept: "deny",
    Waiting: "deny",
    Resend: "deny",
    Wire: "deny",
    Settled: "deny",
    Held: "budget",
  },
};

// D123: a `cancel`'s other half, whatever else the lane is doing: the owner lets go of what it could not hear. Returns the lane as it now stands.
export const letGoKept = (tx: Tx, l: Lane): Lane | undefined => {
  if (!l.parked.some((p) => p.kept)) return l;
  for (const p of l.parked) if (p.kept) note(tx, "KeptLetGo", { op: l.op, attempt: p.attempt ?? "" });
  return withParked(tx, l, l.parked.filter((p) => !p.kept));
};
// D21, D123: a local identity's life is over, so what it was owed goes as evidence.
export const dropParked = (tx: Tx, l: Lane): Lane | undefined => {
  for (const p of l.parked) note(tx, "ParkedLetGo", { op: l.op, attempt: p.attempt ?? "" });
  return l.parked.length ? withParked(tx, l, []) : l;
};
const withParked = (tx: Tx, l: Lane, parked: Lane["parked"]): Lane | undefined => {
  const next = { ...l, parked };
  if (parked.length === 0 && !l.head && l.w.length === 0) {
    deleteLane(tx, l.id);
    return undefined;
  }
  setLane(tx, next);
  return next;
};
export const columnOf = (lane: Lane | undefined): Column => {
  const h = lane?.head;
  if (!h) return lane?.parked.some((p) => p.kept && p.attempt) ? "Kept" : "Idle";
  switch (h.phase.t) {
    case "held":
      return "Held";
    case "wire":
      return "Wire";
    case "settled":
      return "Settled";
    default:
      return h.mayHaveApplied ? "Resend" : "Waiting"; // D45
  }
};
const label = (c: Column) => (c === "Idle" || c === "Kept" || c === "Held" ? c : "InFlight");

export type CellArgs = {
  actor: string;
  machine: string;
  op: string;
  key: unknown;
  subject?: readonly string[];
  input?: unknown;
  owner?: Owner;
  prepared?: Readonly<Record<string, unknown>>;
  ending?: Ending;
};
const argsOf = (l: Lane): CellArgs => ({
  actor: l.actor,
  machine: l.machine,
  op: l.op,
  key: l.key,
});

const toMail = (tx: Tx, lane: Lane, h: Attempt, e: Ending) =>
  enqueue(tx, {
    k: "ending",
    actor: lane.actor,
    op: lane.op,
    key: lane.key,
    owner: h.owner,
    ending: e,
    input: h.input,
    subject: lane.subject,
    attempt: h.id,
    onLane: true,
  });
export const tellEnded = (tx: Tx, attempt: string, how: Ending | "superseded" | "released", sentAt = 0) =>
  hook(tx, "ended", (m, s, cx) => m.ended!(s, { attempt, how, sentAt }, cx));
const settleHead = (tx: Tx, lane: Lane, e: Ending) => {
  setLane(tx, { ...lane, head: { ...lane.head!, phase: { t: "settled", ending: e } } });
  toMail(tx, lane, lane.head!, e);
};
export const parkWaiting = (tx: Tx, lane: Lane): Lane => {
  const parked = lane.w.map((a) => {
    const e = declined("Disposed");
    noteEnding(tx, { op: lane.op, attempt: a.id }, e);
    tellEnded(tx, a.id, e);
    return { attempt: a.id, ending: e, owner: a.owner, input: a.input };
  });
  return { ...lane, w: [], parked: [...lane.parked, ...parked] };
};
// Runtime O6: an ending during disposal is a pending mapped outcome, parked, W after it in lane order. An unknown keeps its head on disk Held, so the
// key the server may hold can be re-sent by the same Attempt; a definite ending leaves no head.
const parkAtDisposal = (tx: Tx, lane: Lane, e: Ending) => {
  const h = lane.head!;
  note(tx, "parked", { op: lane.op, attempt: h.id });
  const own = { attempt: h.id, ending: e, owner: h.owner, input: h.input };
  const { head: _h, ...rest } = lane;
  // C179 (OD51): an ending that leaves a hold is delivered last, so an unknown is parked after W's `NotSent { Disposed }`.
  if (e.ch !== "unknown") return setLane(tx, parkWaiting(tx, { ...rest, parked: [...lane.parked, own] }));
  const waited = parkWaiting(tx, { ...lane, head: { ...h, mayHaveApplied: true, phase: { t: "held" } } });
  setLane(tx, { ...waited, parked: [...waited.parked, own] });
};
export const endPastDisposal = (tx: Tx, lane: Lane) => {
  const h = lane.head!;
  const e: Ending = { ch: "unknown", reason: "Disposed" };
  noteEnding(tx, { op: lane.op, attempt: h.id }, e);
  tellEnded(tx, h.id, e, h.sentAt);
  parkAtDisposal(tx, lane, e);
};
// The lane is empty: gone, unless a parked ending still needs it (2.9.3).
const emptied = (tx: Tx, lane: Lane) => {
  if (lane.parked.length === 0) return deleteLane(tx, lane.id);
  const { head: _h, releasing: _r, ...rest } = lane;
  setLane(tx, rest);
};
// Resolved or released: the next waiting commit becomes addressable. An unknown, a retry, a restore never get here.
const promote = (tx: Tx, lane: Lane) => {
  const [next, ...w] = lane.w;
  if (!next) return emptied(tx, lane);
  setLane(tx, { ...lane, head: { ...next, phase: requestDurable(tx, lane, next, "ack") }, w });
};
const newAttempt = (tx: Tx, a: CellArgs): { attempt: Attempt } | { no: string } => {
  const attempt: Attempt = {
    id: tx.env.id(),
    mint: tx.w.nextMint,
    input: a.input,
    owner: a.owner!,
    retryCount: 0,
    mayHaveApplied: false,
    sentAt: 0,
    phase: { t: "queued" },
  };
  const no = startAll(
    tx,
    { attempt: attempt.id, mint: attempt.mint, machine: a.machine, op: a.op, input: a.input },
    a.prepared ?? {},
  );
  if (no) return { no };
  tx.w = { ...tx.w, nextMint: attempt.mint + 1 };
  note(tx, "mint", { op: a.op, attempt: attempt.id, mint: attempt.mint });
  return { attempt };
};
export const decline = (tx: Tx, a: CellArgs, why: string) => {
  const e = declined(why);
  noteEnding(tx, { op: a.op }, e);
  enqueue(tx, {
    k: "ending",
    actor: a.actor,
    op: a.op,
    key: a.key,
    owner: a.owner!,
    ending: e,
    input: a.input,
    subject: a.subject ?? [],
  });
};
const supersede = (tx: Tx, op: string, x: Attempt) => {
  note(tx, "Superseded", { op, attempt: x.id });
  tellEnded(tx, x.id, "superseded");
};
const queueBehind = (tx: Tx, l: Lane, a: CellArgs, policy: string) => {
  if (policy === "serialize" && l.w.length >= tx.bounds.queueMax) {
    decline(tx, a, "Overloaded");
    return false;
  }
  const made = newAttempt(tx, a);
  if ("no" in made) {
    decline(tx, a, made.no);
    return false;
  }
  if (policy === "latest") {
    for (const x of l.w) supersede(tx, a.op, x);
    setLane(tx, { ...tx.w.lanes[l.id]!, w: [made.attempt] });
    return true;
  }
  setLane(tx, { ...tx.w.lanes[l.id]!, w: [...l.w, made.attempt] });
  return true;
};
// 2.7.13's `cancel` table: at most one Attempt is live. The one there becomes evidence (on the wire it is interrupted, and its ending, when it lands, is
// evidence by Attempt id; a settled ending not yet admitted is evidence; a held one or a waiting re-send is released), and the new one is minted.
const replaceHead = (tx: Tx, l: Lane, a: CellArgs) => {
  const old = l.head!;
  const made = newAttempt(tx, a);
  if ("no" in made) return decline(tx, a, made.no);
  if (old.phase.t === "wire") {
    tx.commands.push({ k: "interrupt", attempt: old.id, send: old.phase.gen });
    tx.w = { ...tx.w, interrupted: { ...tx.w.interrupted, [old.id]: { op: l.op } } };
    note(tx, "interruptedBy", { op: l.op, attempt: old.id, by: made.attempt.id });
  } else if (old.phase.t === "settled") {
    tx.w = { ...tx.w, interrupted: { ...tx.w.interrupted, [old.id]: { op: l.op } } };
    note(tx, "evidenceOnly", { op: l.op, attempt: old.id });
  } else {
    note(tx, "Released", { op: l.op, attempt: old.id });
    tellEnded(tx, old.id, "released", old.sentAt);
  }
  disarmTimer(tx, `storage/${old.id}`);
  disarmTimer(tx, `timeout/${old.id}`);
  clearStall(tx, old.id);
  const cur = tx.w.lanes[l.id]!;
  setLane(tx, { ...cur, w: [], head: { ...made.attempt, phase: requestDurable(tx, cur, made.attempt, "ack") } });
};
// Under `cancel` an unknown is held only for its own ending's turn (HeldThisTurn): at the turn's end, the hold is released and the unknown is evidence.
export const endHeldThisTurn = (tx: Tx, attempt: string | undefined) => {
  const l = attempt === undefined ? undefined : tx.w.lanes[tx.w.byAttempt[attempt] ?? ""];
  if (!l?.head || l.head.id !== attempt || l.head.phase.t !== "held" || tx.machines[l.machine]?.ops[l.op]?.concurrency !== "cancel") return;
  note(tx, "lane", { cell: "lane.turnEnd.HeldThisTurn", op: l.op, attempt });
  release(tx, l);
};
// The ack may be on disk: a NotSent now could restore as unknown after the fact (D48, M1).
const ackOut = (h: Attempt) => h.phase.t === "durable" && h.phase.on === "ack";
const endNeverSent = (tx: Tx, l: Lane) => {
  const h = l.head!;
  const e = declined("Cancelled");
  noteEnding(tx, { op: l.op, attempt: h.id }, e);
  disarmTimer(tx, `storage/${h.id}`);
  clearStall(tx, h.id);
  tellEnded(tx, h.id, e);
  if (l.releasing) {
    note(tx, "evidenceOnly", { op: l.op, attempt: h.id });
    return promote(tx, l);
  }
  settleHead(tx, l, e);
};
const release = (tx: Tx, l: Lane) => {
  const h = l.head!;
  note(tx, "Released", { op: l.op, attempt: h.id });
  disarmTimer(tx, `storage/${h.id}`);
  clearStall(tx, h.id);
  tellEnded(tx, h.id, "released", h.sentAt);
  promote(tx, tx.w.lanes[l.id]!);
};
// Rule 60: its queued commits end as evidence.
const dropW = (tx: Tx, l: Lane): Lane => {
  for (const a of l.w) {
    const e = declined("Cancelled");
    noteEnding(tx, { op: l.op, attempt: a.id }, e);
    tellEnded(tx, a.id, e);
    note(tx, "evidenceOnly", { op: l.op, attempt: a.id });
  }
  for (const p of l.parked) {
    note(tx, "unparked", { op: l.op, attempt: p.attempt ?? "" });
    note(tx, "evidenceOnly", { op: l.op, attempt: p.attempt ?? "" });
  }
  return { ...l, w: [], parked: [] };
};

const ACTIONS: Readonly<Record<Action, (tx: Tx, lane: Lane | undefined, a: CellArgs) => void>> = {
  mint(tx, l, a) {
    const made = newAttempt(tx, a);
    if ("no" in made) return decline(tx, a, made.no);
    const lane: Lane = {
      id: laneKey(a.actor, a.op, a.key),
      actor: a.actor,
      machine: a.machine,
      op: a.op,
      key: a.key,
      subject: a.subject ?? [],
      w: [],
      parked: l?.parked ?? [],
      ...stampOf(tx, a.machine, a.op),
    };
    setLane(tx, {
      ...lane,
      head: { ...made.attempt, phase: requestDurable(tx, lane, made.attempt, "ack") },
    });
  },
  busy(tx, l, a) {
    const policy = tx.machines[a.machine]!.ops[a.op]!.concurrency;
    if (policy === "reject") return decline(tx, a, "Rejected");
    if (policy === "cancel") return replaceHead(tx, l!, a);
    void queueBehind(tx, l!, a, policy);
  },
  // OD20 F4: under `latest` a never-sent, never-invoked head is replaced, and W with it. D48: not while its ack is out.
  commitOverWaiting(tx, l, a) {
    const policy = tx.machines[a.machine]!.ops[a.op]!.concurrency;
    if (policy === "reject") return decline(tx, a, "Rejected");
    if (policy === "serialize") return void queueBehind(tx, l!, a, policy);
    const old = l!.head!;
    if (ackOut(old) && old.phase.t === "durable") {
      if (!queueBehind(tx, l!, a, policy === "cancel" ? "latest" : policy)) return; // M1: `then` only if the queue took it; under `cancel` one waits, as under `latest`
      const cur = tx.w.lanes[l!.id]!;
      return setLane(tx, { ...cur, head: { ...old, phase: { ...old.phase, then: old.phase.then === "cancel" ? "cancel" : "replace" } } });
    }
    const made = newAttempt(tx, a);
    if ("no" in made) return decline(tx, a, made.no);
    supersede(tx, a.op, old);
    for (const x of l!.w) supersede(tx, a.op, x);
    disarmTimer(tx, `storage/${old.id}`);
    clearStall(tx, old.id);
    const cur = tx.w.lanes[l!.id]!;
    setLane(tx, {
      ...cur,
      w: [],
      head: { ...made.attempt, phase: requestDurable(tx, cur, made.attempt, "ack") },
    });
  },
  nothingToResend(tx, _l, a) {
    note(tx, "NothingToResend", { op: a.op });
  },
  evidenceInFlight(tx, _l, a) {
    note(tx, "InFlight", { op: a.op });
  },
  nothing() {},
  // D118: a new press may not go beside an ending nobody heard. Whatever the policy: `serialize` queues behind a head, and there is none.
  busyKept(tx, _l, a) {
    decline(tx, a, "Rejected");
  },
  resend(tx, l, a) {
    const h: Attempt = { ...l!.head!, owner: a.owner ?? l!.head!.owner };
    setLane(tx, { ...l!, head: { ...h, phase: requestDurable(tx, l!, h, "capture") } });
  },
  cancelNeverSent(tx, l) {
    const h = l!.head!;
    if (ackOut(h) && h.phase.t === "durable")
      return setLane(tx, { ...l!, head: { ...h, phase: { ...h.phase, then: "cancel" } } });
    endNeverSent(tx, l!);
  },
  cancelResend(tx, l) {
    release(tx, l!);
  },
  interruptWire(tx, l) {
    const h = l!.head!;
    if (h.phase.t !== "wire") return;
    tx.commands.push({ k: "interrupt", attempt: h.id, send: h.phase.gen });
    setLane(tx, { ...l!, head: { ...h, phase: { ...h.phase, cancelled: true } } });
  },
  giveUp(tx, l) {
    release(tx, l!);
  },
  invoke(tx, l, a) {
    const h = l!.head!;
    const gen = nextGen(tx);
    const op = tx.machines[a.machine]!.ops[l!.op]!;
    if (op.timeoutMs !== undefined)
      armTimer(tx, {
        key: `timeout/${h.id}`,
        kind: "timeout",
        dueAt: tx.env.now + op.timeoutMs,
        attempt: h.id,
      });
    setLane(tx, {
      ...l!,
      head: {
        ...h,
        retryCount: h.mayHaveApplied ? h.retryCount + 1 : h.retryCount,
        sentAt: h.sentAt || position(tx), // E7: a re-send keeps the first send's position
        phase: { t: "wire", gen, cancelled: false },
      },
    });
    note(tx, "invoked", { op: l!.op, attempt: h.id, send: gen });
    const basedOn = sentAll(tx, h.id);
    tx.commands.push({
      k: "invoke",
      attempt: h.id,
      send: gen,
      machine: a.machine,
      op: l!.op,
      input: h.input,
      ctx: { id: h.id, mayHaveApplied: h.mayHaveApplied },
      ...(basedOn === undefined ? {} : { basedOn }),
    });
  },
  refuseFirst(tx, l) {
    const h = l!.head!;
    note(tx, "StorageFailure", { op: l!.op, attempt: h.id });
    const e = declined("StorageRefused");
    noteEnding(tx, { op: l!.op, attempt: h.id }, e);
    tellEnded(tx, h.id, e);
    if (l!.releasing) {
      note(tx, "evidenceOnly", { op: l!.op, attempt: h.id });
      return promote(tx, l!);
    }
    settleHead(tx, l!, e);
  },
  // A refused capture sent nothing: the store hears nothing (L5).
  refuseResend(tx, l) {
    const h = l!.head!;
    note(tx, "StorageFailure", { op: l!.op, attempt: h.id });
    const e: Ending = { ch: "unknown", reason: "StorageRefused" };
    noteEnding(tx, { op: l!.op, attempt: h.id }, e);
    settleHead(tx, l!, e);
  },
  resolve(tx, l) {
    promote(tx, l!);
  },
  hold(tx, l) {
    setLane(tx, { ...l!, head: { ...l!.head!, phase: { t: "held" } } });
  },
  byEnding(tx, l, a) {
    if (a.ending?.ch === "unknown") return ACTIONS.hold(tx, l, a);
    emptied(tx, { ...l!, w: [] }); // NotSent { Restored }, or a parked ending. W has already ended (G5)
  },
  disposeNeverSent(tx, l) {
    const h = l!.head!;
    const e = declined("Disposed");
    noteEnding(tx, { op: l!.op, attempt: h.id }, e);
    tellEnded(tx, h.id, e);
    const parked = {
      ...l!,
      parked: [...l!.parked, { attempt: h.id, ending: e, owner: h.owner, input: h.input }],
    };
    const { head: _h, ...rest } = parkWaiting(tx, parked);
    setLane(tx, rest);
  },
  disposeResend(tx, l) {
    setLane(tx, parkWaiting(tx, { ...l!, head: { ...l!.head!, phase: { t: "held" } } }));
  },
  // Runtime O6: an invoked commit is allowed to settle within the disposal bound; its ending is parked (settleSend), and one still on the wire
  // at the bound ends unknown { Disposed }, parked the same way (`endPastDisposal`).
  disposeWire() {},
  disposeSettled(tx, l) {
    const h = l!.head!;
    if (h.phase.t !== "settled") return;
    const parked = {
      ...l!,
      parked: [
        ...l!.parked,
        { attempt: h.id, ending: h.phase.ending, owner: h.owner, input: h.input },
      ],
    };
    const { head: _h, ...rest } = parkWaiting(tx, parked);
    setLane(tx, rest);
  },
  markIdle(tx, l) {
    dropW(tx, l!);
    deleteLane(tx, l!.id);
  },
  markNeverSent(tx, l) {
    const cur = { ...dropW(tx, l!), releasing: true as const };
    const h = cur.head!;
    if (ackOut(h) && h.phase.t === "durable")
      return setLane(tx, { ...cur, head: { ...h, phase: { ...h.phase, then: "cancel" } } });
    endNeverSent(tx, cur);
  },
  markResend(tx, l) {
    const cur = dropW(tx, l!);
    setLane(tx, cur); // W has ended as evidence: the promotion must not see it
    release(tx, cur);
  },
  markWire(tx, l) {
    const cur = { ...dropW(tx, l!), releasing: true as const };
    setLane(tx, cur);
    ACTIONS.interruptWire(tx, cur, argsOf(cur));
  },
  markSettled(tx, l) {
    setLane(tx, { ...dropW(tx, l!), releasing: true });
  },
  markHeld(tx, l) {
    const cur = dropW(tx, l!);
    setLane(tx, cur);
    release(tx, cur);
  },
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
// A version entry is `name#format:hash`; the format tag says which Flow wrote it. Untagged: a bare name is format 0, `name#hash` format 1.
const formatOf = (f: string) => {
  const v = f.split("#")[1];
  return v === undefined ? 0 : v.includes(":") ? Number(v.split(":")[0]) : 1;
};
const formatOfAll = (xs: readonly string[]) => (new Set(xs.map(formatOf)).size === 1 ? formatOf(xs[0]!) : undefined);
const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((f) => b.includes(f)) && b.every((f) => a.includes(f));
// Two version lists, in any order (a key is a record). Written by one format, they compare whole. Across formats, each side is compared with the
// other's spelling of the current Schema in its own format (`older`, from the compiler), so a Schema change made in the same release as a Flow
// upgrade is still a new version; with no spelling in that format, they differ.
export type OlderFormats = Readonly<Record<string, readonly string[]>> | undefined;
export const sameVersion = (a: readonly string[], b: readonly string[], older?: OlderFormats) => {
  if (a.length !== b.length) return false;
  if (a.length === 0) return true;
  const fa = formatOfAll(a);
  const fb = formatOfAll(b);
  if (fa === undefined || fb === undefined) return false;
  if (fa === fb) return sameSet(a, b);
  const theirs = older?.[String(Math.min(fa, fb))];
  return theirs !== undefined && sameSet(fa < fb ? a : b, theirs);
};
export const sameFields = (a: readonly string[] | undefined, b: readonly string[] | undefined, older?: OlderFormats) =>
  a === undefined || b === undefined || sameVersion(a, b, older);
// Round 13 (D221): a mint stamps the fields its key is made under now; U17 B, each with its Schema's version where the compiler gave one.
export const stampFields = (o: { readonly keyFields?: readonly string[]; readonly keyVersion?: readonly string[] } | undefined) => o?.keyVersion ?? o?.keyFields;
export const olderOf = (o: { readonly keyVersion?: readonly string[]; readonly keyVersionByFormat?: OlderFormats } | undefined): OlderFormats =>
  o?.keyVersion ? o.keyVersionByFormat : undefined;
// Phase 1 migration (2.7.15, Q2 A): a keyed member names the lane of its key only in its own version, the current key's or `previous[i]`'s.
// An old-version hold is never matched against a new key, and an earlier key never names a current lane. An unstamped lane has no version.
type Versioned = { readonly keyFields?: readonly string[]; readonly keyVersion?: readonly string[]; readonly keyVersionByFormat?: OlderFormats };
export const ofVersion = (lane: Lane | undefined, o: (Versioned & { readonly previous?: readonly Versioned[] }) | undefined, previous?: number): Lane | undefined => {
  if (!lane || lane.keyFields === undefined) return previous === undefined ? lane : undefined;
  const p = previous === undefined ? o : o?.previous?.[previous];
  const fields = previous === undefined ? stampFields(p) : p?.keyVersion;
  if (fields === undefined) return previous === undefined ? lane : undefined;
  return sameFields(lane.keyFields, fields, p?.keyVersion ? p.keyVersionByFormat : undefined) ? lane : undefined;
};
function stampOf(tx: Tx, machine: string, op: string): { keyFields?: readonly string[]; identity?: readonly string[] } {
  const f = stampFields(tx.machines[machine]?.ops[op]);
  const id = tx.machines[machine]?.identityVersion;
  return { ...(f ? { keyFields: [...f] } : {}), ...(id?.length ? { identity: [...id] } : {}) };
}
// Rule 74 (migration round 3): a value-named actor's lane is stamped with the identity version it was minted under. Under another version now, it is
// the old identity's: never adopted or heard by the new identity, whose name may have the same text ("no ref can spell its identity"). No stamp:
// a singleton, or a record written before Flow's record format 3.
export const ofIdentity = (tx: Tx, l: Lane | undefined): boolean => {
  const m = l && tx.machines[l.machine];
  if (!l?.identity || !m?.identityVersion) return true;
  return sameVersion(l.identity, m.identityVersion, m.identityVersionByFormat);
};
// Round 13 (D221, Arpit's call on required key fields; replaces D217's shape test and the first D221's projection). An op's key fields are part of its
// identity: a release that changes them makes a new version of the op. A lane minted under the old fields (its stamp) is an old-version hold: never rekeyed,
// never matched against a new key. It stays reachable by its own old key (`retry(k)`, `cancel(k)`, an exact lane id), and until it ends every commit of
// this actor's op declines, whatever its key, and a keyed `idle` says no. A lane with no stamp (a hand key closure, F2) has no version.
export const oldVersionLane = (tx: Tx, actor: string, machine: string, op: string): Lane | undefined => {
  const fields = stampFields(tx.machines[machine]?.ops[op]);
  if (!fields) return undefined;
  const older = olderOf(tx.machines[machine]?.ops[op]);
  return Object.values(tx.w.lanes).find((l) => l.actor === actor && l.op === op && l.keyFields !== undefined && !sameFields(l.keyFields, fields, older) && columnOf(l) !== "Idle");
};
// The one way a lane changes. A lane's status changes only through here (S3).
export const cell = (tx: Tx, row: Row, lane: Lane | undefined, a: CellArgs) => {
  const id = laneKey(a.actor, a.op, a.key);
  if (tx.w.quarantined[id] && !lane) {
    // D88: a record this release cannot read still holds its id. A commit declines; a cancel is the owner giving it up, and the record goes.
    note(tx, "quarantinedLane", { op: a.op, row });
    if (row === "commit") return decline(tx, a, "Rejected");
    if (row === "cancel") {
      const { [id]: _gone, ...quarantined } = tx.w.quarantined;
      tx.w = { ...tx.w, quarantined };
      tx.touchedLanes.set(id, a.actor);
    }
    return;
  }
  // Round 13 (D221): beside an old-version hold of this op, every commit declines, as beside a hold on its own key, and its transition runs. The Runtime
  // cannot say whether the old server thing is the new one; nothing sends beside it.
  if (row === "commit") {
    const old = oldVersionLane(tx, a.actor, a.machine, a.op);
    if (old) {
      note(tx, "BesideOldVersion", { op: a.op, lane: old.id });
      return decline(tx, a, "OldVersion");
    }
  }
  const col = columnOf(lane);
  const action = TABLE[row][col];
  if (!action) return issue(tx, { code: "CannotOccur", origin: `lane.${row}.${col}` });
  note(tx, "lane", { cell: `lane.${row}.${label(col)}`, op: a.op, attempt: lane?.head?.id });
  ACTIONS[action](tx, lane, a);
};
export const guardCell = (
  tx: Tx,
  verb: "idle" | "retryable",
  lane: Lane | undefined,
  op: string,
  times?: number,
  quarantined?: boolean,
) => {
  if (quarantined) return false; // D88: not idle, and nothing to retry
  const col = columnOf(lane);
  note(tx, "lane", { cell: `lane.${verb}.${label(col)}`, op });
  const v = GUARD[verb][col];
  return v === "pass" || (v === "budget" && lane!.head!.retryCount < (times ?? Infinity));
};
// The whole lane: the head as `cancel` has it, then every queued commit ends NotSent { Cancelled }, a current ending, in lane order. When the same
// transition releases the lane (rule 60), the release wins: the head is left to it, and the queued commits end as evidence, owed to no one.
export const cancelAll = (tx: Tx, lane: Lane | undefined, a: CellArgs, released = false) => {
  if (released && lane) return setLane(tx, dropW(tx, lane));
  if (!lane?.w.length) return cell(tx, "cancel", lane, a);
  const queued = lane.w;
  const cleared = { ...lane, w: [] };
  setLane(tx, cleared);
  cell(tx, "cancel", cleared, a);
  for (const x of queued) {
    const e = declined("Cancelled");
    noteEnding(tx, { op: lane.op, attempt: x.id }, e);
    tellEnded(tx, x.id, e);
    enqueue(tx, { k: "ending", actor: lane.actor, machine: lane.machine, op: lane.op, key: lane.key, owner: x.owner, ending: e, input: x.input, subject: lane.subject, attempt: x.id });
  }
};
// D48: storage has answered, so what was waiting for it may run.
export const afterAck = (tx: Tx, l: Lane, then: "cancel" | "replace") => {
  if (then === "cancel") return endNeverSent(tx, l);
  const [next, ...rest] = l.w;
  supersede(tx, l.op, l.head!);
  disarmTimer(tx, `storage/${l.head!.id}`);
  setLane(tx, { ...l, w: rest, head: { ...next!, phase: requestDurable(tx, l, next!, "ack") } });
};

// Rule 18, at settlement: the Attempt's ending from the send and its history. N: the store hears it before any route.
export const settleSend = (tx: Tx, lane: Lane, send: string, ending: Ending) => {
  const h = lane.head!;
  const final: Ending =
    ending.ch === "failure" && h.mayHaveApplied
      ? { ch: "unknown", reason: "StillUnknown", value: ending }
      : ending;
  noteEnding(tx, { op: lane.op, attempt: h.id, send }, final);
  disarmTimer(tx, `timeout/${h.id}`);
  const next: Lane = {
    ...lane,
    head: { ...h, mayHaveApplied: h.mayHaveApplied || final.ch === "unknown" },
  };
  tellEnded(tx, h.id, final, h.sentAt);
  if (tx.w.status === "disposing") return parkAtDisposal(tx, next, final);
  settleHead(tx, next, final);
};
export const interruptReason = (e: Ending) =>
  e.ch === "unknown" && (e.reason === "Cancelled" || e.reason === "Interrupted");
export const admitRow = (item: EndingMail): Row =>
  item.restored
    ? "restore"
    : interruptReason(item.ending)
      ? "interrupt"
      : item.ending.ch === "success"
        ? "success"
        : item.ending.ch === "failure"
          ? "failure"
          : "unknown";
