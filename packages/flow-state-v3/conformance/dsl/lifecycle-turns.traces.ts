import { MemberTarget } from "../port.ts";
import { Life } from "./lifecycle-model.ts";
import { closes, commit, decline, member, mint, turn } from "./lifecycle-members.traces.ts";
import { at, build, Check, type Trace } from "./lifecycle-trace.ts";

const { Q, W, I, U } = at;
const { lane, model, wl, pending } = build;

const twoLanes = model([...lane("A", ["a", W]), ...lane("B", ["b", W])]);

const orderTraces: ReadonlyArray<Trace> = [
  {
    name: "a commit whose key did not encode declines Unencodable",
    cites: "WriteLanes R12, I18: it declines NotSent Unencodable and never fails its turn",
    start: model([]),
    steps: [turn(member("commit", "serialize", MemberTarget.Nothing())), decline("Unencodable")],
    refusals: [[], []],
    phases: {},
    owed: 0,
    checks: [Check.Lives({ lives: [Life.Owed()] })],
  },
  {
    name: "a key-less cancel of an operation with no lane declines nothing",
    cites: "WriteLanes R14: cancel on an Idle lane is nothing, and no ending",
    start: model([]),
    steps: [turn(member("cancel", "serialize", MemberTarget.Every())), decline("Cancelled")],
    refusals: [[], [wl(20)]],
    phases: {},
    owed: 0,
    checks: [],
  },
  {
    name: "a second cancel of a never-sent head",
    cites: "WriteLanes R14: one cancel's ending per never-sent Attempt",
    start: model(lane("A", ["h", U])),
    steps: [turn(member("cancel"), member("cancel"))],
    refusals: [[]],
    phases: { h: U },
    owed: 1,
    checks: [Check.Owing({ obligations: [pending("h")] })],
  },
  {
    name: "a key-less cancel acts on every lane of its operation",
    cites: "the design's Port change 1 (round-14 turn.ts:752-757); WriteLanes R9 says KeyRequired",
    start: twoLanes,
    steps: [turn(member("cancel", "serialize", MemberTarget.Every()))],
    refusals: [[]],
    phases: { a: I, b: I },
    owed: 0,
    checks: [],
  },
  {
    name: "a member that names no lane does nothing",
    cites: "WriteLanes R9: a member whose key does not encode names no lane (the Port's Nothing)",
    start: twoLanes,
    steps: [turn(member("cancel", "serialize", MemberTarget.Nothing()))],
    refusals: [[]],
    phases: { a: W, b: W },
    owed: 0,
    checks: [],
  },
  {
    name: "a commit then a cancel apply in action order",
    cites: "WriteLanes I10: each member to the lane state the previous one left",
    start: model([]),
    steps: [turn(commit("serialize"), member("cancel")), mint("n")],
    refusals: [[], []],
    phases: { n: U },
    owed: 1,
    checks: [Check.Owing({ obligations: [pending("n")] })],
  },
  {
    name: "a mint outside a turn",
    cites: "WriteLanes I1",
    start: model([]),
    steps: [mint("n")],
    refusals: [[wl(1)]],
    phases: {},
    owed: 0,
    checks: [],
  },
  {
    name: "an id minted twice",
    cites: "WriteLanes I6: no two writes share an id",
    start: model(lane("A", ["n", W])),
    steps: [turn(commit("serialize")), mint("n")],
    refusals: [[], [wl(6)]],
    phases: { n: W },
    owed: 0,
    checks: [],
  },
  {
    name: "a mint on another lane than the turn's commit",
    cites: "WriteLanes I1: a mint needs its lane's commit member",
    start: model([]),
    steps: [turn(commit("serialize")), mint("n", "B")],
    refusals: [[], [wl(1)]],
    phases: {},
    owed: 0,
    checks: [],
  },
  {
    name: "a later commit's mint before the earlier commit's",
    cites: "WriteLanes I10: reports come in member order",
    start: model([]),
    steps: [
      turn(commit("serialize"), member("commit", "serialize", MemberTarget.Key({ key: "B" }))),
      mint("n", "B"),
    ],
    refusals: [[], [wl(10)]],
    phases: {},
    owed: 0,
    checks: [],
  },
  {
    name: "a commit with no mint or decline by its turn's close",
    cites: "WriteLanes R10, I15: every commit delivers its ending",
    start: model([]),
    steps: [turn(commit("serialize")), closes],
    refusals: [[], [wl(15)]],
    phases: {},
    owed: 0,
    checks: [],
  },
  {
    name: "a reject commit behind a head declines Rejected",
    cites: "WriteLanes R7: reject declines NotSent Rejected",
    start: model(lane("A", ["h", W])),
    steps: [turn(commit("reject")), decline("Rejected")],
    refusals: [[], []],
    phases: { h: W },
    owed: 0,
    checks: [Check.Lives({ lives: [Life.Owed()] })],
  },
  {
    name: "a serialize commit declines Rejected",
    cites: "WriteLanes R7: only reject declines Rejected",
    start: model(lane("A", ["h", W])),
    steps: [turn(commit("serialize")), decline("Rejected")],
    refusals: [[], [wl(8)]],
    phases: { h: W },
    owed: 0,
    checks: [Check.Lives({ lives: [] })],
  },
  {
    name: "a commit on an Idle lane declines Overloaded",
    cites: "WriteLanes R7, I8: Overloaded only past 64 waiting",
    start: model([]),
    steps: [turn(commit("serialize")), decline("Overloaded")],
    refusals: [[], [wl(8)]],
    phases: {},
    owed: 0,
    checks: [],
  },
  {
    name: "a commit that cannot encode declines",
    cites: "WriteLanes R12, I18: a commit that cannot encode declines Unencodable",
    start: model([]),
    steps: [turn(commit("serialize")), decline("Unencodable")],
    refusals: [[], []],
    phases: {},
    owed: 0,
    checks: [Check.Lives({ lives: [Life.Owed()] })],
  },
  ...(["Cancelled", "Restored", "StorageRefused", "Disposed"] as const).map((reason) => ({
    name: `a commit on an Idle lane declines ${reason}`,
    cites: "WriteLanes R7, I8: a minting lane declines only for a reason no policy gives (M4)",
    start: model([]),
    steps: [turn(commit("serialize")), decline(reason)],
    refusals: [[], [wl(8)]],
    phases: {},
    owed: 0,
    checks: [Check.Lives({ lives: [] })],
  })),
  ...(["NoPersistence", "OldVersion"] as const).map((reason) => ({
    name: `a commit on an Idle lane declines ${reason}`,
    cites: "WriteLanes R11, R12: a reason no policy gives declines under every policy",
    start: model([]),
    steps: [turn(commit("serialize")), decline(reason)],
    refusals: [[], []],
    phases: {},
    owed: 0,
    checks: [Check.Lives({ lives: [Life.Owed()] })],
  })),
  {
    name: "a commit declines Disposed while the Runtime disposes",
    cites: "Actors R22: from the disposal's start nothing new is invoked",
    start: model([], { mode: "disposing" }),
    steps: [turn(commit("serialize")), decline("Disposed")],
    refusals: [[], []],
    phases: {},
    owed: 0,
    checks: [Check.Lives({ lives: [Life.Owed()] })],
  },
];

const full = model(
  lane("A", ["h", W], ...Array.from({ length: 64 }, (_, i) => [`q${i}`, Q] as const)),
);

const fullPhases = Object.fromEntries([
  ["h", W],
  ...Array.from({ length: 64 }, (_, i) => [`q${i}`, Q]),
]);

const queueTraces: ReadonlyArray<Trace> = [
  {
    name: "a 65th waiting commit declines Overloaded",
    cites: "WriteLanes R7, I8: at most 64 waiting under serialize",
    start: full,
    steps: [turn(commit("serialize")), decline("Overloaded")],
    refusals: [[], []],
    phases: fullPhases,
    owed: 0,
    checks: [Check.Lives({ lives: [Life.Owed()] })],
  },
  {
    name: "a 65th waiting commit minted",
    cites: "WriteLanes I8: at most 64 waiting under serialize",
    start: full,
    steps: [turn(commit("serialize")), mint("n")],
    refusals: [[], [wl(8)]],
    phases: fullPhases,
    owed: 0,
    checks: [],
  },
];

/**
 * The traces of a turn's members: member order, targets, mints and declines.
 */
export const turnTraces: ReadonlyArray<Trace> = [...orderTraces, ...queueTraces];
