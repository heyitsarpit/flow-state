// The write lane, 2.7.13's table as data (D17). Round 1 is `reject` only, so `W` is always empty and cells need no
// policy column. A row and a state pick one action; a pair the table says cannot occur raises an issue (S12).
import {
  deleteLane,
  endingReason,
  enqueue,
  issue,
  laneKey,
  nextGen,
  note,
  setLane,
  type Attempt,
  type AttemptEnding,
  type Lane,
  type Owner,
  type Tx,
} from "./world.ts";
import { armTimer, disarmTimer } from "./timers.ts";

type State = "Idle" | "InFlight" | "Held";
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
  | "rejected"
  | "evidenceOnly"
  | "resend"
  | "cancelByHistory"
  | "release"
  | "invoke"
  | "refuse"
  | "resolve"
  | "hold"
  | "stay"
  | "disposeInFlight";

const TABLE: Readonly<Record<Row, Partial<Record<State, Action>>>> = {
  commit: { Idle: "mint", InFlight: "rejected", Held: "rejected" },
  retry: { Idle: "evidenceOnly", InFlight: "evidenceOnly", Held: "resend" },
  cancel: { Idle: "evidenceOnly", InFlight: "cancelByHistory", Held: "release" },
  invoked: { InFlight: "invoke" },
  storageRefused: { InFlight: "refuse" },
  success: { InFlight: "resolve" },
  failure: { InFlight: "resolve" },
  unknown: { InFlight: "hold" },
  interrupt: { InFlight: "hold" },
  restore: { InFlight: "hold", Held: "stay" },
  runtimeDisposal: { InFlight: "disposeInFlight", Held: "stay" },
};

export type CellArgs = {
  actor: string;
  op: string;
  key: unknown;
  machine: string;
  input?: unknown;
  owner?: Owner;
  ending?: AttemptEnding;
};

export const stateOf = (lane: Lane | undefined): State => lane?.state ?? "Idle";

const declined = (why: string): AttemptEnding => ({
  ch: "failure",
  tag: "NotSent",
  value: { why },
});

const endingEvidence = (
  tx: Tx,
  a: { op: string; attempt?: string; send?: number },
  e: AttemptEnding,
) =>
  note(tx, "ending", {
    op: a.op,
    attempt: a.attempt,
    send: a.send,
    channel: e.ch,
    reason: endingReason(e),
  });
export { endingEvidence };

const settleHead = (tx: Tx, lane: Lane, e: AttemptEnding, restored = false) => {
  setLane(tx, { ...lane, head: { ...lane.head, settled: e } });
  enqueue(tx, {
    k: "ending",
    actor: lane.actor,
    op: lane.op,
    owner: lane.head.owner,
    ending: e,
    lane: lane.id,
    attempt: lane.head.id,
    ...(restored ? { restored } : {}),
  });
};

const ACTIONS: Readonly<Record<Action, (tx: Tx, lane: Lane | undefined, a: CellArgs) => void>> = {
  mint(tx, _l, a) {
    const persisted = tx.machines[a.machine]!.persisted;
    const head: Attempt = {
      id: tx.env.id(),
      mint: tx.w.nextMint,
      op: a.op,
      input: a.input,
      owner: a.owner!,
      sends: 0,
      retryCount: 0,
      mayHaveApplied: false,
      acked: false,
      waits: { ack: persisted, capture: false },
    };
    tx.w = { ...tx.w, nextMint: tx.w.nextMint + 1 };
    note(tx, "mint", { op: a.op, attempt: head.id, mint: head.mint });
    setLane(tx, {
      id: laneKey(a.actor, a.op, a.key),
      actor: a.actor,
      op: a.op,
      key: a.key,
      state: "InFlight",
      head,
    });
  },
  rejected(tx, _l, a) {
    const e = declined("Rejected");
    endingEvidence(tx, { op: a.op }, e);
    enqueue(tx, { k: "ending", actor: a.actor, op: a.op, owner: a.owner!, ending: e });
  },
  evidenceOnly() {},
  resend(tx, l, a) {
    const persisted = tx.machines[a.machine]!.persisted;
    setLane(tx, {
      ...l!,
      state: "InFlight",
      head: {
        ...l!.head,
        waits: { ack: false, capture: persisted },
        owner: a.owner ?? l!.head.owner,
      },
    });
  },
  cancelByHistory(tx, l) {
    const h = l!.head;
    if (h.settled) return; // the real ending already settled; a settled ending is never rewritten (rule 24)
    if (h.wire) {
      tx.commands.push({ k: "interrupt", attempt: h.id, send: h.wire.gen });
      setLane(tx, { ...l!, head: { ...h, cancelled: true } });
    } else if (h.sends === 0) {
      const e = declined("Cancelled");
      endingEvidence(tx, { op: h.op, attempt: h.id }, e);
      settleHead(tx, l!, e);
    } else {
      note(tx, "Released", { op: h.op, attempt: h.id });
      deleteLane(tx, l!.id);
    }
  },
  release(tx, l) {
    note(tx, "Released", { op: l!.op, attempt: l!.head.id });
    deleteLane(tx, l!.id);
  },
  invoke(tx, l, a) {
    const h = l!.head;
    const gen = nextGen(tx);
    const op = tx.machines[a.machine]!.ops[l!.op]!;
    const timeout =
      op.timeoutMs === undefined
        ? undefined
        : armTimer(tx, {
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
        cancelled: false,
        wire: { gen, ...(timeout ? { timeout } : {}) },
      },
    });
    tx.w = { ...tx.w, dirty: tx.w.dirty.filter((d) => d !== l!.id) };
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
  refuse(tx, l) {
    const h = l!.head;
    note(tx, "StorageFailure", { op: h.op, attempt: h.id });
    const e: AttemptEnding =
      h.sends === 0 ? declined("StorageRefused") : { ch: "unknown", reason: "StorageRefused" };
    endingEvidence(tx, { op: h.op, attempt: h.id }, e);
    setLane(tx, { ...l!, head: { ...h, waits: { ack: false, capture: false } } });
    settleHead(tx, tx.w.lanes[l!.id]!, e);
  },
  resolve(tx, l) {
    deleteLane(tx, l!.id);
  },
  hold(tx, l, a) {
    if (a.ending?.ch !== "unknown") return deleteLane(tx, l!.id); // restore: NotSent { Restored }, or a parked ending
    const { settled: _settled, ...head } = l!.head;
    setLane(tx, { ...l!, state: "Held", head });
  },
  stay() {},
  disposeInFlight(tx, l) {
    const h = l!.head;
    if (h.wire) {
      tx.commands.push({ k: "interrupt", attempt: h.id, send: h.wire.gen });
    } else if (h.settled) {
      setLane(tx, { ...l!, parked: h.settled });
    } else if (h.sends === 0) {
      const e = declined("Disposed");
      endingEvidence(tx, { op: h.op, attempt: h.id }, e);
      setLane(tx, { ...l!, parked: e });
    } else {
      setLane(tx, { ...l!, state: "Held", head: { ...h, waits: { ack: false, capture: false } } });
    }
  },
};

// The one way a lane changes. A lane's status changes only through here (S3).
export const cell = (tx: Tx, row: Row, lane: Lane | undefined, a: CellArgs) => {
  const state = stateOf(lane);
  const action = TABLE[row][state];
  if (!action) return issue(tx, { code: "CannotOccur", origin: `lane.${row}.${state}` });
  note(tx, "lane", { cell: `lane.${row}.${state}`, op: a.op, attempt: lane?.head.id });
  ACTIONS[action](tx, lane, a);
};

// Rule 18, at settlement: the Attempt's ending from the send's and the send history.
export const settleSend = (tx: Tx, lane: Lane, send: number, ending: AttemptEnding) => {
  const h = lane.head;
  const final: AttemptEnding =
    ending.ch === "failure" && h.mayHaveApplied
      ? { ch: "unknown", reason: "StillUnknown", value: ending }
      : ending;
  endingEvidence(tx, { op: h.op, attempt: h.id, send }, final);
  if (h.wire?.timeout) disarmTimer(tx, h.wire.timeout);
  const { wire: _wire, ...rest } = h;
  const next: Lane = {
    ...lane,
    head: { ...rest, mayHaveApplied: h.mayHaveApplied || final.ch === "unknown" },
  };
  if (tx.w.disposing) setLane(tx, { ...next, parked: final });
  else settleHead(tx, next, final);
};

// The restore row's delivery: the row reads as saved until admission (PAY-08), and the ending is mail like any other.
export const restoreDelivery = (tx: Tx, lane: Lane, ending: AttemptEnding) => {
  endingEvidence(tx, { op: lane.op, attempt: lane.head.id }, ending);
  const head =
    lane.state === "Held"
      ? lane.head
      : {
          ...lane.head,
          settled: ending,
          mayHaveApplied: lane.head.mayHaveApplied || ending.ch === "unknown",
        };
  tx.w = { ...tx.w, lanes: { ...tx.w.lanes, [lane.id]: { ...lane, head } } };
  enqueue(tx, {
    k: "ending",
    actor: lane.actor,
    op: lane.op,
    owner: lane.head.owner,
    ending,
    lane: lane.id,
    attempt: lane.head.id,
    restored: true,
  });
};
