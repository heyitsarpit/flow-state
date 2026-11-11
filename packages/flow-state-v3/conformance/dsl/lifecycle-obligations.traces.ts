import { Option } from "effect";
import { Life, LifeMove, Move, Obligation } from "./lifecycle-model.ts";
import { member, turn } from "./lifecycle-members.traces.ts";
import { at, build, type Trace } from "./lifecycle-trace.ts";
import type { InvariantId } from "./oracle.ts";

const { Q, U, RS, W, H, RF, GC, GE } = at;

const {
  lane,
  model,
  wl,
  actors,
  pending,
  awaiting,
  one,
  headed,
  goneBeside,
  definite,
  notSent,
  unknown,
  released,
} = build;

const endingOfS = { operation: "pay", attempt: Option.some("s"), actor: build.shopper };

const ownEnding = {
  ...endingOfS,
  channel: "unknown" as const,
  reason: "Interrupted",
  incarnation: 1,
  inDisposal: false,
};

const promotionTraces: ReadonlyArray<Trace> = [
  one({
    name: "promotion skips a waiting commit that owes a report",
    cites: "the design's requirement 3 (firstFree); WriteLanes I11 with CQ7 pending",
    start: model(lane("A", ["s", W], ["q", Q], ["w", Q]), {
      obligations: [awaiting("q", "Superseded")],
    }),
    move: definite("s"),
    refused: [],
    phases: { s: GC, q: Q, w: U },
  }),
  one({
    name: "promotion takes the first waiting commit in mint order",
    cites: "WriteLanes R8, I11: W's head is promoted",
    start: model(lane("A", ["s", W], ["q", Q], ["w", Q])),
    move: definite("s"),
    refused: [],
    phases: { s: GC, q: U, w: Q },
  }),
  {
    name: "an unretained unknown's release is due by the close of the turn that hears it",
    cites:
      "WriteLanes R4, I12: an unknown not retained is released once its own ending's turn ends",
    start: headed(W),
    steps: [
      unknown("s", "Interrupted", false),
      LifeMove.Delivered({ ending: endingOfS }),
      LifeMove.Heard({ ending: endingOfS }),
      turn(),
      { due: "TurnCloses" as const },
    ],
    refusals: [[], [], [], [], [wl(12)]],
    phases: { s: H, w: Q },
    owed: 0,
    checks: [],
  },
  {
    name: "an unretained unknown's release is not due at a turn that does not hear it",
    cites:
      "WriteLanes R4: released once its own ending's turn ends, not an earlier one's (review H2)",
    start: headed(W),
    steps: [unknown("s", "Interrupted", false), { due: "TurnCloses" as const }],
    refusals: [[], []],
    phases: { s: H, w: Q },
    owed: 1,
    checks: [],
  },
  {
    name: "an unretained unknown heard by no turn owes its release by the step's end",
    cites:
      "WriteLanes R4, I12: heard with no turn (Unhandled, Denied), its release is due by the step's end (F3)",
    start: headed(W),
    steps: [
      unknown("s", "Interrupted", false),
      LifeMove.Delivered({ ending: endingOfS }),
      LifeMove.Heard({ ending: endingOfS }),
      { due: "StepEnds" as const },
    ],
    refusals: [[], [], [], [wl(12)]],
    phases: { s: H, w: Q },
    owed: 0,
    checks: [],
  },
  {
    name: "an unretained unknown's release is owed by its own ending's turn, not the Attempt's other ending",
    cites: "WriteLanes R4: released once its own ending's turn ends (step-4 reviewer, item 2)",
    start: model(lane("A", ["s", H], ["w", Q]), {
      endings: [
        { ...ownEnding, life: Life.Delivering({ retry: false }) },
        { ...ownEnding, life: Life.Owed() },
      ],
      obligations: [awaiting("s", "Released", Option.some(1))],
    }),
    steps: [LifeMove.Heard({ ending: endingOfS }), { due: "TurnCloses" as const }],
    refusals: [[], []],
    phases: { s: H, w: Q },
    owed: 1,
    checks: [],
  },
  {
    name: "an unretained unknown whose ending closes unheard owes its release at once",
    cites: "WriteLanes R4, I12: its ending got no turn (closed at a reload), so the release is due",
    start: headed(W),
    steps: [unknown("s", "Interrupted", false), Move.Reload(), { due: "StepEnds" as const }],
    refusals: [[], [], [wl(12)]],
    phases: { s: H, w: RF },
    owed: 0,
    checks: [],
  },
  {
    name: "an unretained unknown not yet heard owes nothing at the step's end",
    cites: "WriteLanes R4: a parked ending's release waits for its own turn (review H2)",
    start: headed(W),
    steps: [unknown("s", "Interrupted", false), { due: "StepEnds" as const }],
    refusals: [[], []],
    phases: { s: H, w: Q },
    owed: 1,
    checks: [],
  },
  {
    name: "an unretained unknown re-sent in its own turn owes no release",
    cites: "WriteLanes R4: under cancel an unknown is released once its own ending's turn ends",
    start: headed(W),
    steps: [
      unknown("s", "Interrupted", false),
      turn(member("retry", "cancel")),
      { due: "TurnCloses" as const },
    ],
    refusals: [[], [], []],
    phases: { s: RS, w: Q },
    owed: 0,
    checks: [],
  },
  {
    name: "an unretained unknown released in its turn",
    cites: "WriteLanes R4",
    start: headed(W),
    steps: [unknown("s", "Interrupted", false), released("s"), { due: "TurnCloses" as const }],
    refusals: [[], [], []],
    phases: { s: GC, w: U },
    owed: 0,
    checks: [],
  },
  {
    name: "a replaced Attempt's second ending",
    cites: "WriteLanes I15, I16: evidence once, a settled ending never replaced",
    start: goneBeside(GE),
    steps: [notSent("s", "Cancelled"), unknown("s", "Cancelled")],
    refusals: [[], [wl(16)]],
    phases: { s: GE, n: U },
    owed: 0,
    checks: [],
  },
  one(
    {
      name: "a pending cancel's ending of the other kind",
      cites: "WriteLanes R14: a cancel on the wire ends unknown Cancelled, never NotSent",
      start: goneBeside(GC, { obligations: [pending("s", "UnknownCancelled")] }),
      move: notSent("s", "Cancelled"),
      refused: [wl(16)],
      phases: { s: GC, n: U },
    },
    1,
  ),
  one(
    {
      name: "an unretained unknown Disposed during disposal holds its lane",
      cites: "WriteLanes R17, Actors R22: disposal drops no lane; the call ends unknown Disposed",
      start: model(lane("A", ["s", W], ["w", Q]), { mode: "disposing" }),
      move: unknown("s", "Disposed", false),
      refused: [],
      phases: { s: H, w: Q },
    },
    0,
  ),
];

const dueTrace = (
  name: string,
  cites: string,
  obligation: Obligation,
  turn: ReadonlyArray<InvariantId>,
  step: ReadonlyArray<InvariantId>,
  left: number,
) => ({
  name,
  cites,
  start: model(lane("A", ["s", H]), { obligations: [obligation] }),
  steps: [{ due: "TurnCloses" as const }, { due: "StepEnds" as const }],
  refusals: [turn, step],
  phases: { s: H },
  owed: left,
  checks: [],
});

const restore = (cause: "plain" | "runtimeDisposal" | "disposeActor" | "forget") =>
  Obligation.AwaitRestore({ attempt: "s", incarnation: 1, cause });

const deadlineTraces: ReadonlyArray<Trace> = [
  dueTrace("a release not reported", "WriteLanes I12", awaiting("s", "Released"), [wl(12)], [], 0),
  dueTrace(
    "a supersede not reported",
    "WriteLanes I8",
    awaiting("s", "Superseded"),
    [wl(8)],
    [],
    0,
  ),
  dueTrace(
    "a cancelAll ending not reported",
    "WriteLanes I21",
    awaiting("s", "NotSentCancelled"),
    [wl(21)],
    [],
    0,
  ),
  dueTrace("a pending cancel waits", "WriteLanes R14", pending("s"), [], [], 1),
  dueTrace("a restore not delivered", "Restore I6 (CQ11)", restore("plain"), [], ["Restore I6"], 0),
  dueTrace(
    "a restore after the Runtime's disposal not delivered",
    "Actors I29",
    restore("runtimeDisposal"),
    [],
    [actors(29)],
    0,
  ),
  dueTrace(
    "a restore after the actor's disposal not delivered",
    "Actors I29",
    restore("disposeActor"),
    [],
    [actors(29)],
    0,
  ),
  dueTrace(
    "a restore after a forget not delivered",
    "Actors I32",
    restore("forget"),
    [],
    [actors(32)],
    0,
  ),
  dueTrace(
    "a kept ending not let go",
    "WriteLanes I15",
    Obligation.AwaitLetGo({ ending: 0 }),
    [],
    [wl(15)],
    0,
  ),
];

/**
 * The traces of promotion and of the obligations' deadlines.
 */
export const obligationTraces: ReadonlyArray<Trace> = [...promotionTraces, ...deadlineTraces];
