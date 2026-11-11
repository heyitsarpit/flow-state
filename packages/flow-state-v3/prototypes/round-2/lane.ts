// The write lane: 2.7.13's table as data (D17, D28). A row and a column pick one action, or a pair the table says cannot
// occur raises an issue (S12). Columns are phases, so "by history" and "on the wire" are columns, not branches inside an
// action. The design's three states are what evidence reports: a cell is named lane.row.State.
import { hook, startAll } from "./hooks.ts";
import { requestDurable, phaseToWait } from "./durable.ts";
import { armTimer, disarmTimer } from "./timers.ts";
import {
  deleteLane,
  enqueue,
  issue,
  laneKey,
  nextGen,
  note,
  noteEnding,
  setLane,
  type Attempt,
  type Ending,
  type Lane,
  type Owner,
  type Tx,
} from "./world.ts";

type Column = "Idle" | "Waiting" | "Resend" | "Wire" | "Settled" | "Held";
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
  | "runtimeDisposal";
type Action =
  | "mint"
  | "busy"
  | "commitOverWaiting"
  | "nothingToResend"
  | "evidenceInFlight"
  | "resend"
  | "nothing"
  | "cancelNeverSent"
  | "cancelResend"
  | "interruptWire"
  | "release"
  | "invoke"
  | "refuseFirst"
  | "refuseResend"
  | "resolve"
  | "hold"
  | "byEnding"
  | "disposeNeverSent"
  | "disposeResend"
  | "disposeWire"
  | "disposeSettled";

const IN_FLIGHT: readonly Column[] = ["Waiting", "Resend", "Wire", "Settled"];
const all = (a: Action): Partial<Record<Column, Action>> =>
  Object.fromEntries(IN_FLIGHT.map((c) => [c, a]));
const TABLE: Readonly<Record<Row, Partial<Record<Column, Action>>>> = {
  commit: {
    Idle: "mint",
    Waiting: "commitOverWaiting",
    Resend: "busy",
    Wire: "busy",
    Settled: "busy",
    Held: "busy",
  },
  retry: { Idle: "nothingToResend", ...all("evidenceInFlight"), Held: "resend" },
  cancel: {
    Idle: "nothing",
    Waiting: "cancelNeverSent",
    Resend: "cancelResend",
    Wire: "interruptWire",
    Settled: "nothing", // the real ending has settled; a settled ending is never rewritten (rule 24)
    Held: "release",
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
};
const GUARD: Readonly<
  Record<"idle" | "retryable", Partial<Record<Column, "pass" | "deny" | "budget">>>
> = {
  idle: {
    Idle: "pass",
    Waiting: "deny",
    Resend: "deny",
    Wire: "deny",
    Settled: "deny",
    Held: "deny",
  },
  retryable: {
    Idle: "deny",
    Waiting: "deny",
    Resend: "deny",
    Wire: "deny",
    Settled: "deny",
    Held: "budget",
  },
};

export const columnOf = (lane: Lane | undefined): Column => {
  if (!lane) return "Idle";
  const h = lane.head;
  switch (h.phase.t) {
    case "held":
      return "Held";
    case "wire":
      return "Wire";
    case "settled":
      return "Settled";
    default:
      return h.sends === 0 ? "Waiting" : "Resend";
  }
};
const label = (c: Column) => (c === "Idle" || c === "Held" ? c : "InFlight");

export type CellArgs = {
  actor: string;
  machine: string;
  op: string;
  key: unknown;
  input?: unknown;
  owner?: Owner;
  prepared?: Readonly<Record<string, unknown>>;
  ending?: Ending;
};
const declined = (why: string): Ending => ({ ch: "failure", tag: "NotSent", value: { why } });

const toMail = (tx: Tx, lane: Lane, h: Attempt, e: Ending, restored = false, onLane = true) =>
  enqueue(tx, {
    k: "ending",
    actor: lane.actor,
    op: lane.op,
    key: lane.key,
    owner: h.owner,
    ending: e,
    attempt: h.id,
    ...(onLane ? { onLane } : {}),
    ...(restored ? { restored } : {}),
  });
// Settling never touches the state of the machine: it writes the phase and joins the mail.
const settleHead = (tx: Tx, lane: Lane, e: Ending) => {
  setLane(tx, { ...lane, head: { ...lane.head, phase: { t: "settled", ending: e } } });
  toMail(tx, lane, lane.head, e);
};
const parkWaiting = (tx: Tx, lane: Lane): Lane => {
  const parked = lane.w.map((a) => {
    const e = declined("Disposed");
    noteEnding(tx, { op: lane.op, attempt: a.id }, e);
    hook(tx, "settled", (m, s, cx) => m.settled!(s, { attempt: a.id, ending: e }, cx));
    return { attempt: a.id, ending: e, head: false };
  });
  return { ...lane, w: [], parked: [...(lane.parked ?? []), ...parked] };
};
// Resolved or released: the next waiting commit becomes addressable. An unknown, a retry, a restore never get here.
const promote = (tx: Tx, lane: Lane) => {
  const [next, ...w] = lane.w;
  if (!next) return deleteLane(tx, lane.id);
  setLane(tx, { ...lane, head: { ...next, phase: requestDurable(tx, lane, next, "ack") }, w });
};
const newAttempt = (tx: Tx, a: CellArgs): { attempt: Attempt } | { overloaded: true } => {
  const attempt: Attempt = {
    id: tx.env.id(),
    mint: tx.w.nextMint,
    input: a.input,
    owner: a.owner!,
    sends: 0,
    retryCount: 0,
    mayHaveApplied: false,
    acked: false,
    phase: { t: "queued" },
  };
  const ok = startAll(
    tx,
    { attempt: attempt.id, mint: attempt.mint, machine: a.machine, op: a.op, input: a.input },
    a.prepared ?? {},
  );
  if (!ok) return { overloaded: true };
  tx.w = { ...tx.w, nextMint: attempt.mint + 1 };
  note(tx, "mint", { op: a.op, attempt: attempt.id, mint: attempt.mint });
  return { attempt };
};
const decline = (tx: Tx, a: CellArgs, why: string) => {
  const e = declined(why);
  noteEnding(tx, { op: a.op }, e);
  enqueue(tx, { k: "ending", actor: a.actor, op: a.op, key: a.key, owner: a.owner!, ending: e });
};
const supersede = (tx: Tx, op: string, x: Attempt) => {
  note(tx, "Superseded", { op, attempt: x.id });
  hook(tx, "withdraw", (m, s, cx) => m.withdraw!(s, { attempt: x.id, why: "Superseded" }, cx));
};
const queueBehind = (tx: Tx, l: Lane, a: CellArgs, policy: string) => {
  if (policy === "serialize" && l.w.length >= 64) return decline(tx, a, "Overloaded");
  const made = newAttempt(tx, a);
  if ("overloaded" in made) return decline(tx, a, "Overloaded");
  if (policy === "latest") {
    for (const x of l.w) supersede(tx, a.op, x);
    return setLane(tx, { ...tx.w.lanes[l.id]!, w: [made.attempt] });
  }
  setLane(tx, { ...tx.w.lanes[l.id]!, w: [...l.w, made.attempt] });
};

const ACTIONS: Readonly<Record<Action, (tx: Tx, lane: Lane | undefined, a: CellArgs) => void>> = {
  mint(tx, _l, a) {
    const made = newAttempt(tx, a);
    if ("overloaded" in made) return decline(tx, a, "Overloaded");
    const lane: Lane = {
      id: laneKey(a.actor, a.op, a.key),
      actor: a.actor,
      machine: a.machine,
      op: a.op,
      key: a.key,
      head: made.attempt,
      w: [],
    };
    setLane(tx, {
      ...lane,
      head: { ...made.attempt, phase: requestDurable(tx, lane, made.attempt, "ack") },
    });
  },
  busy(tx, l, a) {
    const policy = tx.machines[a.machine]!.ops[a.op]!.concurrency;
    if (policy === "reject") return decline(tx, a, "Rejected");
    queueBehind(tx, l!, a, policy);
  },
  // OD20 F4: under `latest` a never-sent, never-invoked head is replaced, and W with it.
  commitOverWaiting(tx, l, a) {
    const policy = tx.machines[a.machine]!.ops[a.op]!.concurrency;
    if (policy === "reject") return decline(tx, a, "Rejected");
    if (policy === "serialize") return queueBehind(tx, l!, a, policy);
    const made = newAttempt(tx, a);
    if ("overloaded" in made) return decline(tx, a, "Overloaded");
    const old = l!.head;
    supersede(tx, a.op, old);
    for (const x of l!.w) supersede(tx, a.op, x);
    disarmTimer(tx, `storage/${old.id}`);
    setLane(tx, {
      ...l!,
      w: [],
      head: { ...made.attempt, phase: requestDurable(tx, l!, made.attempt, "ack") },
    });
  },
  nothingToResend(tx, _l, a) {
    note(tx, "NothingToResend", { op: a.op });
  },
  evidenceInFlight(tx, _l, a) {
    note(tx, "InFlight", { op: a.op });
  },
  nothing() {},
  resend(tx, l, a) {
    const h: Attempt = { ...l!.head, owner: a.owner ?? l!.head.owner };
    setLane(tx, { ...l!, head: { ...h, phase: requestDurable(tx, l!, h, "capture") } });
  },
  cancelNeverSent(tx, l) {
    const h = l!.head;
    const e = declined("Cancelled");
    noteEnding(tx, { op: l!.op, attempt: h.id }, e);
    disarmTimer(tx, `storage/${h.id}`);
    hook(tx, "settled", (m, s, cx) => m.settled!(s, { attempt: h.id, ending: e }, cx));
    settleHead(tx, l!, e);
  },
  cancelResend(tx, l) {
    disarmTimer(tx, `storage/${l!.head.id}`);
    ACTIONS.release(tx, l, {} as CellArgs);
  },
  interruptWire(tx, l) {
    const h = l!.head;
    if (h.phase.t !== "wire") return;
    tx.commands.push({ k: "interrupt", attempt: h.id, send: h.phase.gen });
    setLane(tx, { ...l!, head: { ...h, phase: { ...h.phase, cancelled: true } } });
  },
  release(tx, l) {
    const h = l!.head;
    note(tx, "Released", { op: l!.op, attempt: h.id });
    hook(tx, "released", (m, s, cx) => m.released!(s, { attempt: h.id }, cx));
    promote(tx, tx.w.lanes[l!.id]!);
  },
  invoke(tx, l, a) {
    const h = l!.head;
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
        sends: h.sends + 1,
        retryCount: h.sends > 0 ? h.retryCount + 1 : h.retryCount,
        phase: { t: "wire", gen, cancelled: false },
      },
    });
    note(tx, "invoked", { op: l!.op, attempt: h.id, send: gen });
    tx.commands.push({
      k: "invoke",
      attempt: h.id,
      send: gen,
      machine: a.machine,
      op: l!.op,
      input: h.input,
      ctx: { id: h.id, mayHaveApplied: h.mayHaveApplied },
    });
  },
  refuseFirst(tx, l) {
    const h = l!.head;
    note(tx, "StorageFailure", { op: l!.op, attempt: h.id });
    const e = declined("StorageRefused");
    noteEnding(tx, { op: l!.op, attempt: h.id }, e);
    hook(tx, "settled", (m, s, cx) => m.settled!(s, { attempt: h.id, ending: e }, cx));
    settleHead(tx, l!, e);
  },
  refuseResend(tx, l) {
    const h = l!.head;
    note(tx, "StorageFailure", { op: l!.op, attempt: h.id });
    const e: Ending = { ch: "unknown", reason: "StorageRefused" };
    noteEnding(tx, { op: l!.op, attempt: h.id }, e);
    settleHead(tx, l!, e);
  },
  resolve(tx, l) {
    promote(tx, l!);
  },
  hold(tx, l) {
    setLane(tx, { ...l!, head: { ...l!.head, phase: { t: "held" } } });
  },
  byEnding(tx, l, a) {
    if (a.ending?.ch === "unknown") return ACTIONS.hold(tx, l, a);
    deleteLane(tx, l!.id); // restore: NotSent { Restored }, or a parked ending. W has already ended (G5)
  },
  disposeNeverSent(tx, l) {
    const h = l!.head;
    const e = declined("Disposed");
    noteEnding(tx, { op: l!.op, attempt: h.id }, e);
    hook(tx, "settled", (m, s, cx) => m.settled!(s, { attempt: h.id, ending: e }, cx));
    const parked = { ...l!, parked: [{ attempt: h.id, ending: e, head: true }] };
    setLane(tx, parkWaiting(tx, parked));
  },
  disposeResend(tx, l) {
    setLane(tx, parkWaiting(tx, { ...l!, head: { ...l!.head, phase: { t: "held" } } }));
  },
  disposeWire(tx, l) {
    const h = l!.head;
    if (h.phase.t === "wire")
      tx.commands.push({ k: "interrupt", attempt: h.id, send: h.phase.gen });
  },
  disposeSettled(tx, l) {
    const h = l!.head;
    if (h.phase.t !== "settled") return;
    const parked = { ...l!, parked: [{ attempt: h.id, ending: h.phase.ending, head: true }] };
    setLane(tx, parkWaiting(tx, parked));
  },
};

// The one way a lane changes. A lane's status changes only through here (S3).
export const cell = (tx: Tx, row: Row, lane: Lane | undefined, a: CellArgs) => {
  const col = columnOf(lane);
  const action = TABLE[row][col];
  if (!action) return issue(tx, { code: "CannotOccur", origin: `lane.${row}.${col}` });
  note(tx, "lane", { cell: `lane.${row}.${label(col)}`, op: a.op, attempt: lane?.head.id });
  ACTIONS[action](tx, lane, a);
};
export const guardCell = (
  tx: Tx,
  verb: "idle" | "retryable",
  lane: Lane | undefined,
  op: string,
  times?: number,
) => {
  const col = columnOf(lane);
  note(tx, "lane", { cell: `lane.${verb}.${label(col)}`, op });
  const v = GUARD[verb][col];
  return v === "pass" || (v === "budget" && lane!.head.retryCount < (times ?? Infinity));
};

// Rule 18, at settlement: the Attempt's ending from the send and the send history. N: the store hears it before any route.
export const settleSend = (tx: Tx, lane: Lane, send: string, ending: Ending) => {
  const h = lane.head;
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
  hook(tx, "settled", (m, s, cx) => m.settled!(s, { attempt: h.id, ending: final }, cx));
  if (tx.w.status === "disposing") {
    const parked = {
      ...next,
      head: { ...next.head, phase: { t: "held" as const } },
      parked: [{ attempt: h.id, ending: final, head: true }],
    };
    note(tx, "parked", { op: lane.op, attempt: h.id });
    return setLane(tx, parkWaiting(tx, parked));
  }
  settleHead(tx, next, final);
};
export { parkWaiting, phaseToWait };
