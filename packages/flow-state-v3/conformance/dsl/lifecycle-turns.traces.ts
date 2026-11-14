import { MemberTarget } from "../port.ts";
import { Life } from "./lifecycle-model.ts";
import { closes, commit, decline, member, mint, turn } from "./lifecycle-members.traces.ts";
import { at, build, Check, type Trace } from "./lifecycle-trace.ts";

const { Q, W } = at;
const { lane, model, wl } = build;

const orderTraces: ReadonlyArray<Trace> = [
  {
    name: "an Unencodable decline of an input the fixture says encodes is refused",
    cites: "WriteLanes R12: only a value that cannot encode declines Unencodable (a suite fact)",
    start: model([]),
    steps: [turn(member("commit", "serialize", MemberTarget.Nothing())), decline("Unencodable")],
    refusals: [[], [wl(8)]],
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
    name: "a commit that cannot encode declines",
    cites: "WriteLanes R12, I18: a commit that cannot encode declines Unencodable",
    start: model([], { unencodable: true }),
    steps: [turn(commit("serialize")), decline("Unencodable")],
    refusals: [[], []],
    phases: {},
    owed: 0,
    checks: [Check.Lives({ lives: [Life.Owed()] })],
  },
  {
    name: "a commit beside a lane minted at an older release declines OldVersion",
    cites: "WriteLanes R11, I17: an old-version hold declines every commit of its operation",
    start: { ...model([...lane("A", ["h", W])]), release: 2, mintedIn: [["h", 1] as const] },
    steps: [turn(commit("serialize")), decline("OldVersion")],
    refusals: [[], []],
    phases: { h: W },
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
 * The traces of a turn's members: member order, targets, mints and declines. Traces whose every
 * table and fold kill another trace makes were deleted (T61, the fold-mutant verdicts in
 * `held-traces.tsv`).
 */
export const turnTraces: ReadonlyArray<Trace> = [...orderTraces, ...queueTraces];
