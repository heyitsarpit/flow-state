import { Option } from "effect";
import type { Concurrency } from "../fixtures/reference.ts";
import { type MemberKind, MemberTarget } from "../port.ts";
import {
  type Ending,
  type LaneMember,
  LaneMove,
  Life,
  type Model,
  Obligation,
  type Phase,
} from "./lifecycle-model.ts";
import { at, build, Check, type Trace } from "./lifecycle-trace.ts";
import type { InvariantId } from "./oracle.ts";

const { Q, U, RS, W, I, H, RT, GC, GE } = at;
const { shopper, laneNamed, lane, model, wl, pending, awaiting } = build;

/**
 * A lane member of the test operation `pay`, on lane `A` unless a target is given.
 */
export const member = (
  kind: MemberKind,
  concurrency: Concurrency = "serialize",
  target: MemberTarget = MemberTarget.Key({ key: "A" }),
) => ({ operation: "pay", kind, target, concurrency });

/**
 * A turn of the test actor that runs these members.
 */
export const turn = (...members: ReadonlyArray<LaneMember>) =>
  LaneMove.Turn({ actor: shopper, members });

/**
 * A mint of this Attempt on the lane of this key.
 */
export const mint = (attempt: string, name = "A") =>
  LaneMove.Minted({ attempt, lane: laneNamed(name) });

/**
 * A decline of the test actor's `pay` commit, with this reason.
 */
export const decline = (reason: string) =>
  LaneMove.Declined({ operation: "pay", actor: shopper, reason });

/**
 * The open turn's close.
 */
export const closes = LaneMove.TurnCloses();

const keptEnding: Ending = {
  attempt: Option.some("k"),
  operation: "pay",
  actor: shopper,
  channel: "unknown",
  reason: "Interrupted",
  incarnation: 1,
  inDisposal: false,
  life: Life.Kept(),
};

const supersededQ = awaiting("q", "Superseded");

const idle = (kept = true) =>
  model(lane("A", ["k", GC], ["q", Q]), {
    endings: kept ? [keptEnding] : [],
    obligations: [supersededQ],
  });

const busy = (head: Phase, obligations: ReadonlyArray<Obligation> = []) =>
  model(lane("A", ["k", GC], ["h", head], ["q", Q]), { endings: [keptEnding], obligations });

type Row = {
  readonly name: string;
  readonly cites: string;
  readonly start: Model;
  readonly member: LaneMember;
  readonly probe: "mint" | "decline";
  readonly refused: ReadonlyArray<InvariantId>;
  readonly phases: Readonly<Record<string, Phase>>;
  readonly owing: ReadonlyArray<Obligation>;
};

const cell = (row: Row, marked = 0) => ({
  name: row.name,
  cites: row.cites,
  start: row.start,
  steps: [turn(row.member), row.probe === "mint" ? mint("n") : decline("Cancelled")],
  refusals: [[], row.refused],
  phases: row.phases,
  owed: row.owing.length,
  checks: [Check.Owing({ obligations: row.owing }), Check.Marked({ count: marked })],
});

/**
 * A commit member of `pay` on lane `A` under this policy.
 */
export const commit = (concurrency: Concurrency) => member("commit", concurrency);

const idleTraces: ReadonlyArray<Trace> = [
  ...(["reject", "latest", "serialize", "cancel"] as const).map((policy) =>
    cell({
      name: `a ${policy} commit on an Idle lane mints its head`,
      cites: "WriteLanes R6, R7: an Idle lane's commit is the head",
      start: idle(),
      member: commit(policy),
      probe: "mint",
      refused: [],
      phases: { k: GC, q: Q, n: U },
      owing: [supersededQ],
    }),
  ),
  cell({
    name: "a retry on an Idle lane does nothing",
    cites: "WriteLanes R8: a retry acts only on a Held head",
    start: idle(),
    member: member("retry"),
    probe: "decline",
    refused: [wl(1)],
    phases: { k: GC, q: Q },
    owing: [supersededQ],
  }),
  cell({
    name: "a cancel on an Idle lane declines nothing",
    cites: "WriteLanes R14: cancel on an Idle lane is nothing, and no ending",
    start: idle(false),
    member: member("cancel"),
    probe: "decline",
    refused: [wl(20)],
    phases: { k: GC, q: Q },
    owing: [supersededQ],
  }),
  cell({
    name: "a cancel on an Idle lane lets its kept ending go",
    cites: "Actors R15: a kept ending stands until cancelled (CQ3 pending)",
    start: idle(),
    member: member("cancel"),
    probe: "decline",
    refused: [wl(1)],
    phases: { k: GC, q: Q },
    owing: [supersededQ, Obligation.AwaitLetGo({ ending: 0 })],
  }),
  cell({
    name: "a cancelAll on an Idle lane declines nothing",
    cites: "WriteLanes R15, I21: cancelAll delivers only queued and head endings",
    start: idle(),
    member: member("cancelAll"),
    probe: "decline",
    refused: [wl(21)],
    phases: { k: GC, q: Q },
    owing: [supersededQ],
  }),
  cell({
    name: "a release of an Idle lane marks nothing",
    cites: "WriteLanes R16: a release acts on a lane's holds",
    start: idle(),
    member: member("release"),
    probe: "decline",
    refused: [wl(1)],
    phases: { k: GC, q: Q },
    owing: [supersededQ],
  }),
];

const heads: ReadonlyArray<readonly [string, Phase]> = [
  ["Unsent", U],
  ["Resending", RS],
  ["OnWire", W],
  ["Interrupted", I],
  ["Held", H],
  ["Restoring", RT],
];

const neverSent: ReadonlyArray<readonly [string, Phase]> = [
  ["Unsent", U],
  ["Restoring", RT],
];

const releasable: ReadonlyArray<readonly [string, Phase]> = [
  ["Resending", RS],
  ["Held", H],
];

const commitsOn = ([name, head]: readonly [string, Phase]) => [
  cell({
    name: `a reject commit behind a ${name} head declines`,
    cites: "WriteLanes R7, I8: reject keeps W empty",
    start: busy(head),
    member: commit("reject"),
    probe: "mint",
    refused: [wl(8)],
    phases: { k: GC, h: head, q: Q },
    owing: [],
  }),
  cell({
    name: `a serialize commit behind a ${name} head waits`,
    cites: "WriteLanes R7: serialize queues",
    start: busy(head),
    member: commit("serialize"),
    probe: "mint",
    refused: [],
    phases: { k: GC, h: head, q: Q, n: Q },
    owing: [],
  }),
];

const latestSupersedesQueued = (name: string, head: Phase) =>
  cell({
    name: `a latest commit behind a ${name} head supersedes the waiting one`,
    cites: "WriteLanes R7, I8: latest keeps at most one waiting",
    start: busy(head),
    member: commit("latest"),
    probe: "mint",
    refused: [],
    phases: { k: GC, h: head, q: Q, n: Q },
    owing: [awaiting("q", "Superseded")],
  });

const replaces = (name: string, head: Phase) =>
  cell({
    name: `a cancel commit replaces a ${name} head`,
    cites: "WriteLanes R7: cancel interrupts the previous Attempt, whose ending is evidence",
    start: busy(head),
    member: commit("cancel"),
    probe: "mint",
    refused: [],
    phases: { k: GC, h: GE, q: Q, n: U },
    owing: [],
  });

const busyTraces: ReadonlyArray<Trace> = [
  ...heads.flatMap(commitsOn),
  cell({
    name: "a latest commit supersedes a never-sent head",
    cites: "WriteLanes R7: latest supersedes a never-invoked head (CQ7 pending)",
    start: busy(U),
    member: commit("latest"),
    probe: "mint",
    refused: [],
    phases: { k: GC, h: U, q: Q, n: Q },
    owing: [awaiting("h", "Superseded")],
  }),
  cell({
    name: "a latest commit beside a cancelled never-sent head supersedes the waiting one",
    cites: "WriteLanes R14: a pending cancel is never lost to a later commit",
    start: busy(U, [pending("h")]),
    member: commit("latest"),
    probe: "mint",
    refused: [],
    phases: { k: GC, h: U, q: Q, n: Q },
    owing: [pending("h"), awaiting("q", "Superseded")],
  }),
  ...heads
    .filter(([name]) => name !== "Unsent")
    .map(([name, head]) => latestSupersedesQueued(name, head)),
  ...heads.filter(([name]) => name !== "Interrupted").map(([name, head]) => replaces(name, head)),
  ...neverSent.map(([name, head]) =>
    cell({
      name: `a cancel commit replaces a cancelled ${name} head, keeping its cancel`,
      cites: "WriteLanes R14: a pending cancel is never lost to a later replacement (CQ9)",
      start: busy(head, [pending("h")]),
      member: commit("cancel"),
      probe: "mint",
      refused: [],
      phases: { k: GC, h: GC, q: Q, n: U },
      owing: [pending("h")],
    }),
  ),
  cell({
    name: "a cancel commit replaces an interrupted head, which still ends unknown Cancelled",
    cites: "WriteLanes R14: an interrupted call ends unknown Cancelled",
    start: busy(I),
    member: commit("cancel"),
    probe: "mint",
    refused: [],
    phases: { k: GC, h: GC, q: Q, n: U },
    owing: [pending("h", "UnknownCancelled")],
  }),
];

const otherMember = (
  name: string,
  cites: string,
  head: Phase,
  kind: MemberKind,
  after: { phases: Readonly<Record<string, Phase>>; owing: ReadonlyArray<Obligation> },
  marked = 0,
) =>
  cell(
    {
      name,
      cites,
      start: busy(head),
      member: member(kind),
      probe: "decline",
      refused: [wl(1)],
      ...after,
    },
    marked,
  );

const stays = (head: Phase) => ({ phases: { k: GC, h: head, q: Q }, owing: [] });
const cancelAll = awaiting("q", "NotSentCancelled");

const otherTraces: ReadonlyArray<Trace> = [
  ...heads
    .filter(([name]) => name !== "Held")
    .map(([name, head]) =>
      otherMember(
        `a retry of a ${name} head does nothing`,
        "WriteLanes R8",
        head,
        "retry",
        stays(head),
      ),
    ),
  otherMember("a retry re-sends a Held head", "WriteLanes R8", H, "retry", {
    phases: { k: GC, h: RS, q: Q },
    owing: [],
  }),
  ...neverSent.flatMap(([name, head]) => [
    otherMember(
      `a cancel of a never-sent ${name} head is pending`,
      "WriteLanes R14: never sent, it ends NotSent Cancelled",
      head,
      "cancel",
      { phases: { k: GC, h: head, q: Q }, owing: [pending("h")] },
    ),
    otherMember(
      `a cancelAll of a never-sent ${name} head`,
      "WriteLanes R14, R15: queued NotSent Cancelled, then the head's",
      head,
      "cancelAll",
      { phases: { k: GC, h: head, q: Q }, owing: [cancelAll, pending("h")] },
    ),
  ]),
  ...releasable.flatMap(([name, head]) => [
    otherMember(
      `a cancel of a ${name} head owes its release`,
      "WriteLanes R14: a cancel releases a Held lane",
      head,
      "cancel",
      { phases: { k: GC, h: head, q: Q }, owing: [awaiting("h", "Released")] },
    ),
    otherMember(`a cancelAll of a ${name} head`, "WriteLanes R14, R15", head, "cancelAll", {
      phases: { k: GC, h: head, q: Q },
      owing: [cancelAll, awaiting("h", "Released")],
    }),
  ]),
  otherMember("a cancel interrupts the call on the wire", "WriteLanes R14", W, "cancel", {
    phases: { k: GC, h: I, q: Q },
    owing: [],
  }),
  otherMember(
    "a cancelAll interrupts the call on the wire",
    "WriteLanes R14, R15",
    W,
    "cancelAll",
    {
      phases: { k: GC, h: I, q: Q },
      owing: [cancelAll],
    },
  ),
  otherMember("a second cancel of an interrupted call", "WriteLanes R14", I, "cancel", stays(I)),
  otherMember("a cancelAll of an interrupted call", "WriteLanes R15", I, "cancelAll", {
    phases: { k: GC, h: I, q: Q },
    owing: [cancelAll],
  }),
  ...heads.map(([name, head]) =>
    otherMember(
      `a release marks a ${name} head's lane`,
      "WriteLanes R16",
      head,
      "release",
      stays(head),
      1,
    ),
  ),
];

/**
 * The traces of Table B: each cell at each guard value.
 */
export const memberTraces: ReadonlyArray<Trace> = [...idleTraces, ...busyTraces, ...otherTraces];
