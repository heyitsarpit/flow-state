import type { TaskRef } from "../coverage.ts";
import { ActorMove, type Life, LifeMove, Move, Obligation } from "./lifecycle-model.ts";
import { CL, DF, ending, named, OW } from "./lifecycle-lives.traces.ts";
import { at, build, Check, type Trace } from "./lifecycle-trace.ts";

const { H } = at;
const { lane, model, wl } = build;

const restoring = Obligation.AwaitRestore({ attempt: "s", cause: "plain" });

// RETURN_TYPE: a Trace, so its literal fields keep the Trace types the lists hold.
const closedRowRestore = (row: string, life: Life): Trace => ({
  name: `the start after a boot owes a restore to a Held head whose ${row} row the reload closes`,
  cites: `Restore I6, R3: a ${row} row closes at the reload (Table C), so no row is owed and the Held head is owed its restore at the identity's start`,
  start: model(lane("A", ["s", H]), { endings: [ending(life)] }),
  steps: [Move.Reload(), ActorMove.Incarnated({ actor: build.shopper })],
  refusals: [[], []],
  phases: { s: H },
  owed: 1,
  checks: [Check.Owing({ obligations: [restoring] })],
});

/**
 * Traces whose expected result is the Spec's and that the model fails today, each owned by the
 * Task that fixes the model: the lifecycle test fails once one holds, so its row moves to the
 * traces.
 */
export const pendingTraces: ReadonlyArray<{ readonly owner: TaskRef; readonly trace: Trace }> = [];

/**
 * The traces of the actor moves on endings: incarnations, disposals, forgets and restores.
 */
export const actorTraces: ReadonlyArray<Trace> = [
  closedRowRestore("live Owed", OW),
  {
    name: "a delivery names the oldest open ending",
    cites: "WriteLanes I15: each ending delivered once, in order",
    start: model([], { endings: [ending(CL), ending(OW)] }),
    steps: [LifeMove.Delivered({ ending: named })],
    refusals: [[]],
    phases: {},
    owed: 0,
    checks: [Check.Lives({ lives: [CL, DF] })],
  },
  {
    name: "a delivery with no ending",
    cites: "WriteLanes I15",
    start: model([]),
    steps: [LifeMove.Delivered({ ending: named })],
    refusals: [[wl(15)]],
    phases: {},
    owed: 0,
    checks: [Check.Lives({ lives: [] })],
  },
  {
    name: "a turn heard while an older ending is still owed",
    cites: "the design: Heard moves only a Delivering life",
    start: model([], { endings: [ending(OW), ending(DF)] }),
    steps: [LifeMove.Heard({ ending: named })],
    refusals: [[]],
    phases: {},
    owed: 0,
    checks: [Check.Lives({ lives: [OW, CL] })],
  },
];
