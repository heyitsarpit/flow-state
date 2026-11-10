import { Move, type Model, Obligation, type Phase } from "./lifecycle-model.ts";
import { endTraces } from "./lifecycle-ends.traces.ts";
import { lifeTraces } from "./lifecycle-lives.traces.ts";
import { memberTraces } from "./lifecycle-members.traces.ts";
import { turnTraces } from "./lifecycle-turns.traces.ts";
import { obligationTraces } from "./lifecycle-obligations.traces.ts";
import { at, build, type Trace } from "./lifecycle-trace.ts";
import type { InvariantId } from "./oracle.ts";

const { Q, U, RS, W, I, H, RT, RF, GC, GE, GS } = at;

const {
  laneNamed,
  lane,
  model,
  wl,
  actors,
  pending,
  awaiting,
  one,
  headed,
  behindHeld,
  goneBeside,
  unknown,
  released,
  superseded,
  started,
} = build;

const unknownTraces: ReadonlyArray<Trace> = [
  one({
    name: "a queued Attempt ends unknown",
    cites: "WriteLanes I11",
    start: behindHeld(),
    move: unknown("s", "Interrupted"),
    refused: [wl(11)],
    phases: { h: H, s: Q },
  }),
  one({
    name: "a never-sent head ends unknown (pending CQ5)",
    cites: "pending CQ5: the lifecycle stays, and its pending cancel too",
    start: model(lane("A", ["s", U], ["w", Q]), { obligations: [pending("s")] }),
    move: unknown("s", "Interrupted"),
    refused: [],
    phases: { s: U, w: Q },
  }),
  one({
    name: "a re-send whose capture was refused",
    cites: "WriteLanes I15: a refused re-send capture adds unknown StorageRefused",
    start: headed(RS),
    move: unknown("s", "StorageRefused"),
    refused: [],
    phases: { s: H, w: Q },
  }),
  one({
    name: "a re-send ends unknown before it is invoked",
    cites: "WriteLanes I16",
    start: headed(RS),
    move: unknown("s", "Interrupted"),
    refused: [wl(16)],
    phases: { s: RS, w: Q },
  }),
  one({
    name: "a retained unknown holds the lane",
    cites: "WriteLanes R4, R8",
    start: headed(W),
    move: unknown("s", "Interrupted"),
    refused: [],
    phases: { s: H, w: Q },
  }),
  one(
    {
      name: "an unknown that is not retained owes its release",
      cites: "WriteLanes R4: an unknown not retained is released",
      start: headed(W),
      move: unknown("s", "Interrupted", false),
      refused: [],
      phases: { s: H, w: Q },
    },
    1,
  ),
  one({
    name: "a call on the wire past the disposal's bound",
    cites: "Actors R22: unknown Disposed past the bound",
    start: model(lane("A", ["s", W], ["w", Q]), { mode: "disposing" }),
    move: unknown("s", "Disposed"),
    refused: [],
    phases: { s: H, w: Q },
  }),
  one({
    name: "a call ends unknown Disposed with no disposal",
    cites: "Actors I35: a call ends Disposed only past the disposal's bound",
    start: headed(W),
    move: unknown("s", "Disposed"),
    refused: [actors(35)],
    phases: { s: W, w: Q },
  }),
  one({
    name: "a cancel on the wire ends unknown Cancelled",
    cites: "WriteLanes R14",
    start: headed(I),
    move: unknown("s", "Cancelled"),
    refused: [],
    phases: { s: H, w: Q },
  }),
  one({
    name: "an interrupted call past the disposal's bound",
    cites: "Actors R22",
    start: model(lane("A", ["s", I], ["w", Q]), { mode: "disposing" }),
    move: unknown("s", "Disposed"),
    refused: [],
    phases: { s: H, w: Q },
  }),
  one({
    name: "an interrupted call ends unknown for another reason",
    cites: "WriteLanes I20",
    start: headed(I),
    move: unknown("s", "Interrupted"),
    refused: [wl(20)],
    phases: { s: I, w: Q },
  }),
  one(
    {
      name: "a Held head's restore ending, owed to this incarnation",
      cites: "Restore I6, WriteLanes I15: unknown Restored once per incarnation",
      start: model(lane("A", ["s", H], ["w", Q]), {
        obligations: [Obligation.AwaitRestore({ attempt: "s", incarnation: 1, cause: "plain" })],
      }),
      move: unknown("s", "Restored"),
      refused: [],
      phases: { s: H, w: Q },
    },
    0,
  ),
  one({
    name: "a Held head's restore ending, not owed",
    cites: "WriteLanes I15, Restore I6: at most once per incarnation",
    start: headed(H),
    move: unknown("s", "Restored"),
    refused: [wl(15)],
    phases: { s: H, w: Q },
  }),
  one({
    name: "a Held head ends unknown again",
    cites: "WriteLanes I16",
    start: headed(H),
    move: unknown("s", "Interrupted"),
    refused: [wl(16)],
    phases: { s: H, w: Q },
  }),
  one({
    name: "an acknowledged never-sent head comes back unknown Restored",
    cites: "Restore R3",
    start: headed(RT),
    move: unknown("s", "Restored"),
    refused: [],
    phases: { s: H, w: Q },
  }),
  one({
    name: "a restored queued commit ends unknown Restored",
    cites: "Restore R3: a queued commit ends NotSent Restored",
    start: model(lane("A", ["h", H], ["s", RF])),
    move: unknown("s", "Restored"),
    refused: [wl(16)],
    phases: { h: H, s: RF },
  }),
  one({
    name: "a replaced Attempt's late unknown is evidence",
    cites: "WriteLanes R7, I15",
    start: goneBeside(GE),
    move: unknown("s", "Cancelled"),
    refused: [],
    phases: { s: GE, n: U },
  }),
  one(
    {
      name: "a pending cancel of a replaced head ends unknown Cancelled",
      cites: "WriteLanes R14 (CQ9)",
      start: goneBeside(GC, { obligations: [pending("s", "UnknownCancelled")] }),
      move: unknown("s", "Cancelled"),
      refused: [],
      phases: { s: GC, n: U },
    },
    0,
  ),
  one({
    name: "a call settled in disposal comes back Restored",
    cites: "Actors I36",
    start: goneBeside(GS),
    move: unknown("s", "Restored"),
    refused: [actors(36)],
    phases: { s: GS, n: U },
  }),
  one({
    name: "a gone Attempt ends unknown",
    cites: "WriteLanes I16",
    start: goneBeside(GC),
    move: unknown("s", "Interrupted"),
    refused: [wl(16)],
    phases: { s: GC, n: U },
  }),
];

const evidenceTraces: ReadonlyArray<Trace> = [
  ...started([
    ["a queued Attempt released", behindHeld(), { h: H, s: Q }],
    ["a never-sent head released", headed(U), { s: U, w: Q }],
    ["a re-send released with nothing owed", headed(RS), { s: RS, w: Q }],
    ["a call on the wire released", headed(W), { s: W, w: Q }],
    ["an interrupted call released", headed(I), { s: I, w: Q }],
    ["a Held head released quietly", headed(H), { s: H, w: Q }],
    ["a restoring head released", headed(RT), { s: RT, w: Q }],
    ["a closed Attempt released", goneBeside(GC), { s: GC, n: U }],
  ]).map(([name, start, phases]) =>
    one({
      name: name,
      cites: "WriteLanes R8, I12: no quiet release",
      start: start,
      move: released("s"),
      refused: [wl(12)],
      phases: phases,
    }),
  ),
  one(
    {
      name: "a cancel's release of a re-send",
      cites: "WriteLanes R14: a cancel releases a re-send",
      start: model(lane("A", ["s", RS], ["w", Q]), { obligations: [awaiting("s", "Released")] }),
      move: released("s"),
      refused: [],
      phases: { s: GC, w: U },
    },
    0,
  ),
  one(
    {
      name: "a cancel's release of a Held head",
      cites: "WriteLanes R14, I12",
      start: model(lane("A", ["s", H], ["w", Q]), { obligations: [awaiting("s", "Released")] }),
      move: released("s"),
      refused: [],
      phases: { s: GC, w: U },
    },
    0,
  ),
  one({
    name: "a releasing lane's Held head is released",
    cites: "WriteLanes R16",
    start: model(lane("A", ["s", H], ["w", Q]), { releasing: [laneNamed("A")] }),
    move: released("s"),
    refused: [],
    phases: { s: GC, w: U },
  }),
  one({
    name: "a replaced Attempt's release under cancel",
    cites: "WriteLanes R4: the cancel policy releases the replaced Attempt",
    start: goneBeside(GE),
    move: released("s"),
    refused: [],
    phases: { s: GE, n: U },
  }),
  one(
    {
      name: "latest supersedes a queued commit",
      cites: "WriteLanes R7, I8",
      start: behindHeld({ obligations: [awaiting("s", "Superseded")] }),
      move: superseded("s"),
      refused: [],
      phases: { h: H, s: GC },
    },
    0,
  ),
  one({
    name: "a queued commit superseded with nothing owed",
    cites: "WriteLanes I8",
    start: behindHeld(),
    move: superseded("s"),
    refused: [wl(8)],
    phases: { h: H, s: Q },
  }),
  one(
    {
      name: "latest supersedes a never-sent head (CQ7) and promotes the next",
      cites: "WriteLanes R7; I11 with CQ7",
      start: model(lane("A", ["s", U], ["w", Q]), { obligations: [awaiting("s", "Superseded")] }),
      move: superseded("s"),
      refused: [],
      phases: { s: GC, w: U },
    },
    0,
  ),
  ...started([
    ["a never-sent head superseded with nothing owed", headed(U), { s: U, w: Q }],
    ["a re-send superseded", headed(RS), { s: RS, w: Q }],
    ["a call on the wire superseded", headed(W), { s: W, w: Q }],
    ["an interrupted call superseded", headed(I), { s: I, w: Q }],
    ["a Held head superseded", headed(H), { s: H, w: Q }],
    ["a restoring head superseded", headed(RT), { s: RT, w: Q }],
    ["a gone Attempt superseded", goneBeside(GC), { s: GC, n: U }],
  ]).map(([name, start, phases]) =>
    one({
      name: name,
      cites: "WriteLanes R7, I8: only a never-invoked commit is superseded",
      start: start,
      move: superseded("s"),
      refused: [wl(8)],
      phases: phases,
    }),
  ),
];

const zoo = (more: Partial<Omit<Model, "attempts">> = {}) =>
  model(
    [
      ...lane("Q", ["hq", H], ["q", Q]),
      ...lane("U", ["u", U], ["uw", Q]),
      ...lane("R", ["r", RS]),
      ...lane("O", ["o", W]),
      ...lane("I", ["i", I]),
      ...lane("T", ["t", RT], ["f", RF]),
      ...lane("G", ["ge", GE], ["gc", GC], ["gs", GS]),
    ],
    more,
  );

const zooPhases = {
  hq: H,
  q: Q,
  u: U,
  uw: Q,
  r: RS,
  o: W,
  i: I,
  t: RT,
  f: RF,
  ge: GE,
  gc: GC,
  gs: GS,
};

const laneWide = (
  name: string,
  cites: string,
  move: Move,
  refusals: ReadonlyArray<InvariantId>,
  changed: Readonly<Record<string, Phase>>,
  more: Partial<Omit<Model, "attempts">> = {},
) => ({
  name,
  cites,
  start: zoo({ obligations: [pending("u")], ...more }),
  steps: [move],
  refusals: [refusals],
  phases: { ...zooPhases, ...changed },
  owed: 1,
  checks: [],
});

const laneWideTraces: ReadonlyArray<Trace> = [
  laneWide(
    "a reload",
    "Restore R3, WriteLanes R8: what was on the wire is Held; never-sent commits are restored",
    Move.Reload(),
    [],
    { q: RF, u: RT, uw: RF, r: H, o: H, i: H },
  ),
  laneWide(
    "the boot settles",
    "Restore R3: a never-sent commit with no restore ending is gone",
    Move.BootSettles(),
    [],
    { t: GC, f: GC },
  ),
  laneWide(
    "the Runtime's disposal starts",
    "Actors R22: nothing new is invoked; a re-send not yet invoked holds",
    Move.DisposalStarts(),
    [],
    { r: H },
  ),
  laneWide(
    "the Runtime's disposal ends with never-sent commits left (pending CQ6)",
    "Actors I29 as written",
    Move.RuntimeDisposed(),
    [actors(29), actors(29), actors(29)],
    {},
  ),
  laneWide(
    "a step ends with an interruptible call still interrupted",
    "today's rule (the design's guard 15): an interrupted call ends in its step",
    Move.StepEnds({ unstoppable: [] }),
    [wl(20)],
    {},
  ),
  laneWide(
    "a step ends with an unstoppable call interrupted",
    "today's rule (the design's guard 15): an unstoppable call ends with its answer",
    Move.StepEnds({ unstoppable: ["pay"] }),
    [],
    {},
  ),
];

/**
 * Every lifecycle trace, written from the Spec rules each cites.
 */
export const traces: ReadonlyArray<Trace> = [
  ...endTraces,
  ...unknownTraces,
  ...evidenceTraces,
  ...laneWideTraces,
  ...obligationTraces,
  ...memberTraces,
  ...turnTraces,
  ...lifeTraces,
];
