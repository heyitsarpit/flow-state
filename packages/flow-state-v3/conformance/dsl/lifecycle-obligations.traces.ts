import { Option } from "effect";
import { type Cause, Life, LifeMove, Move, Obligation } from "./lifecycle-model.ts";
import { member, turn } from "./lifecycle-members.traces.ts";
import { RETIRED_I21 } from "./lifecycle-rules.ts";
import { at, build, type Trace } from "./lifecycle-trace.ts";
import type { InvariantId } from "./facts.ts";

const { Q, U, RS, W, H, RF, GC } = at;

const { lane, model, wl, actors, pending, awaiting, one, headed, definite, unknown } = build;

const endingOfS = { operation: "pay", attempt: Option.some("s"), actor: build.shopper };

const ownEnding = {
  ...endingOfS,
  channel: "unknown" as const,
  reason: "Interrupted",
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
    cites: "WriteLanes R4, I5: its ending got no turn (closed at a reload), so the release is due",
    start: headed(W),
    steps: [unknown("s", "Interrupted", false), Move.Reload(), { due: "StepEnds" as const }],
    refusals: [[], [], [wl(5)]],
    phases: { s: H, w: RF },
    owed: 0,
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

const restore = (cause: Cause) => Obligation.AwaitRestore({ attempt: "s", cause });

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
    RETIRED_I21,
    awaiting("s", "NotSentCancelled"),
    [RETIRED_I21],
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

const unsentAtReload = (acknowledged: ReadonlyArray<string>) =>
  model(lane("A", ["s", U]), { acknowledged });

const restoreTraces: ReadonlyArray<Trace> = [
  {
    name: "an acknowledged head never sent meets its restore once it is delivered",
    cites: "Restore R3, I6: delivered unknown { Restored } exactly once in the boot",
    start: unsentAtReload(["s"]),
    steps: [
      Move.Reload(),
      unknown("s", "Restored"),
      LifeMove.Delivered({ ending: endingOfS }),
      Move.BootSettles(),
      { due: "StepEnds" as const },
    ],
    refusals: [[], [], [], [], []],
    phases: { s: H },
    owed: 0,
    checks: [],
  },
];

/**
 * The traces of promotion, of the obligations' deadlines, and of a never-sent head's restore.
 */
export const obligationTraces: ReadonlyArray<Trace> = [
  ...promotionTraces,
  ...deadlineTraces,
  ...restoreTraces,
];
