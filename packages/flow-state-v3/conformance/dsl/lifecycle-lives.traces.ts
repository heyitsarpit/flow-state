import { Option, Predicate } from "effect";
import {
  ActorMove,
  type Ending,
  type Input,
  Life,
  LifeMove,
  type Model,
  Move,
  Obligation,
} from "./lifecycle-model.ts";
import { at, build, Check, type Trace } from "./lifecycle-trace.ts";
import type { InvariantId } from "./oracle.ts";

const { H } = at;
const { shopper, lane, model, wl, actors } = build;

const other = { machine: "Checkout/Pay", id: "shopper-2" };

const ending = (life: Life, more: Partial<Ending> = {}) => ({
  attempt: Option.some("s"),
  operation: "pay",
  actor: shopper,
  channel: "unknown" as const,
  reason: "Interrupted",
  incarnation: 1,
  inDisposal: false,
  life,
  ...more,
});

const named = { operation: "pay", attempt: Option.some("s"), actor: shopper };

const OW = Life.Owed();
const PK = Life.Parked();
const DF = Life.Delivering({ retry: false });
const DT = Life.Delivering({ retry: true });
const RF = Life.Refused();
const KP = Life.Kept();
const KO = Life.KeptOpen();
const EV = Life.Evidence();
const CL = Life.Closed();

const lives: ReadonlyArray<readonly [string, Life]> = [
  ["Owed", OW],
  ["Parked", PK],
  ["Delivering", DF],
  ["Refused", RF],
  ["Kept", KP],
  ["KeptOpen", KO],
  ["Evidence", EV],
  ["Closed", CL],
];

type Expected = Life | InvariantId;

const moveOf = {
  Delivered: LifeMove.Delivered({ ending: named }),
  InvalidTurn: LifeMove.Refused({ ending: named, issue: "InvalidTurn" }),
  Unmapped: LifeMove.Refused({ ending: named, issue: "Unmapped" }),
  Heard: LifeMove.Heard({ ending: named }),
  Parked: LifeMove.Parked({ ending: named }),
  Unparked: LifeMove.Unparked({ ending: named }),
  RecordedLetGo: LifeMove.Recorded({ ending: named, letGo: true }),
  RecordedOther: LifeMove.Recorded({ ending: named, letGo: false }),
  Opens: ActorMove.Incarnated({ actor: shopper }),
  StepEnds: Move.StepEnds({ unstoppable: [] }),
  Reload: Move.Reload(),
  DisposalStarts: Move.DisposalStarts(),
} satisfies Readonly<Record<string, Input>>;

type Row = keyof typeof moveOf;

const alone = (e: Ending) => model([], { endings: [e] });

const lifeTrace = (
  row: Row,
  cites: string,
  life: Life,
  expected: Expected,
  start: (e: Ending) => Model = alone,
  more: Partial<Ending> = {},
  note = "",
) => {
  const refused = Predicate.isString(expected) ? [expected] : [];
  const end = Predicate.isString(expected) ? life : expected;

  return {
    name: `${row} on a ${life._tag}${Life.$is("Delivering")(life) && life.retry ? " (retry)" : ""} ending${note}`,
    cites,
    start: start(ending(life, more)),
    steps: [moveOf[row]],
    refusals: [refused],
    phases: {},
    owed: 0,
    checks: [Check.Lives({ lives: [end] })],
  };
};

const rowTraces = (
  row: Row,
  cites: string,
  expected: Readonly<Record<string, Expected>>,
  start: (e: Ending) => Model = alone,
  more: Partial<Ending> = {},
  note = "",
) =>
  lives.flatMap(([tag, life]) => {
    const want = expected[tag];

    return want === undefined ? [] : [lifeTrace(row, cites, life, want, start, more, note)];
  });

const disposing = (e: Ending) => model([], { endings: [e], mode: "disposing" });

const lettingGo = (e: Ending) =>
  model([], { endings: [e], obligations: [Obligation.AwaitLetGo({ ending: 0 })] });

const tableTraces: ReadonlyArray<Trace> = [
  ...rowTraces(
    "Delivered",
    "WriteLanes R10, I15; Actors R15, I24: delivered once, a kept try per boot",
    {
      Owed: DF,
      Parked: DF,
      Delivering: wl(15),
      Refused: DT,
      Kept: actors(24),
      KeptOpen: DT,
      Evidence: wl(15),
      Closed: wl(15),
    },
  ),
  ...rowTraces(
    "Delivered",
    "WriteLanes R17, I15: nothing is delivered during the Runtime's disposal (today's rule)",
    { Owed: wl(15), Parked: wl(15), Refused: wl(15), Kept: wl(15), KeptOpen: wl(15) },
    disposing,
    {},
    " during disposal",
  ),
  ...rowTraces(
    "InvalidTurn",
    "WriteLanes I15: a refused turn's ending is delivered once more (CQ1, CQ2)",
    {
      Owed: wl(15),
      Parked: wl(15),
      Delivering: RF,
      Refused: wl(15),
      Kept: wl(15),
      KeptOpen: wl(15),
      Evidence: wl(15),
      Closed: wl(15),
    },
  ),
  lifeTrace(
    "InvalidTurn",
    "WriteLanes I15: a second refusal is final; Actors R15 keeps it",
    DT,
    KP,
  ),
  ...rowTraces("Unmapped", "Actors R15: an unmapped ending is final (today's rule; CQ10)", {
    Owed: wl(15),
    Parked: wl(15),
    Delivering: CL,
    Refused: wl(15),
    Kept: wl(15),
    KeptOpen: wl(15),
    Evidence: wl(15),
    Closed: wl(15),
  }),
  lifeTrace("Heard", "WriteLanes R10: a delivered ending is heard by its turn", DF, CL),
  ...rowTraces("Parked", "WriteLanes R10, R17: an owed ending parks for its incarnation", {
    Owed: PK,
    Parked: PK,
    Delivering: wl(15),
    Refused: wl(15),
    Kept: wl(15),
    KeptOpen: wl(15),
    Evidence: wl(15),
    Closed: wl(15),
  }),
  ...rowTraces("Unparked", "WriteLanes R10: a parked ending is owed again", {
    Owed: wl(15),
    Parked: OW,
    Delivering: wl(15),
    Refused: wl(15),
    Kept: KP,
    KeptOpen: KO,
    Evidence: wl(15),
    Closed: wl(15),
  }),
  ...rowTraces(
    "RecordedLetGo",
    "Actors R15, R21: a kept ending is let go when cancelled or forgotten",
    { Owed: CL, Parked: CL, Kept: CL, KeptOpen: CL },
    lettingGo,
    {},
    " owing its let-go",
  ),
  ...rowTraces("RecordedLetGo", "WriteLanes I15: an ending is let go only when owed", {
    Owed: wl(15),
    Parked: wl(15),
    Delivering: wl(15),
    Refused: wl(15),
    Kept: wl(15),
    KeptOpen: wl(15),
    Evidence: CL,
    Closed: wl(15),
  }),
  ...rowTraces("RecordedOther", "WriteLanes R10, I15: evidence is recorded, never delivered", {
    Owed: wl(15),
    Parked: wl(15),
    Delivering: wl(15),
    Refused: wl(15),
    Kept: wl(15),
    KeptOpen: wl(15),
    Evidence: CL,
    Closed: wl(15),
  }),
  ...rowTraces(
    "Opens",
    "Actors R10, R15: an incarnation is owed its parked endings and one kept try",
    {
      Owed: OW,
      Parked: OW,
      Delivering: DF,
      Refused: RF,
      Kept: KO,
      KeptOpen: KO,
      Evidence: EV,
      Closed: CL,
    },
  ),
  ...rowTraces("StepEnds", "WriteLanes I15; Actors R10, I24: endings settle in their step (CQ8)", {
    Owed: wl(15),
    Parked: PK,
    Delivering: wl(15),
    Refused: wl(15),
    Kept: KP,
    KeptOpen: actors(24),
    Evidence: wl(15),
    Closed: CL,
  }),
  lifeTrace(
    "StepEnds",
    "WriteLanes R17: an ending decided during disposal waits for the reload",
    OW,
    OW,
    alone,
    { inDisposal: true },
    " decided in disposal",
  ),
  ...rowTraces(
    "Reload",
    "WriteLanes R17; Actors R15: what survives comes back as the boot's (CQ10)",
    {
      Owed: CL,
      Parked: PK,
      Delivering: wl(15),
      Refused: CL,
      Kept: KP,
      KeptOpen: KP,
      Evidence: CL,
      Closed: CL,
    },
  ),
  lifeTrace(
    "Reload",
    "WriteLanes R17: an ending decided during disposal parks at the reload",
    OW,
    PK,
    alone,
    { inDisposal: true },
    " decided in disposal",
  ),
  ...rowTraces("DisposalStarts", "Actors R22: the disposal's start moves no ending", {
    Owed: OW,
    Parked: PK,
    Delivering: DF,
    Refused: RF,
    Kept: KP,
    KeptOpen: KO,
    Evidence: EV,
    Closed: CL,
  }),
];

const restoring = Obligation.AwaitRestore({ attempt: "s", incarnation: 2, cause: "plain" });

const actorTraces: ReadonlyArray<Trace> = [
  {
    name: "a forgotten actor's kept ending is let go",
    cites: "Actors R21: forget lets every kept ending go",
    start: model([], { endings: [ending(KP)] }),
    steps: [
      ActorMove.Forgot({ actor: shopper }),
      LifeMove.Recorded({ ending: named, letGo: true }),
    ],
    refusals: [[], []],
    phases: {},
    owed: 0,
    checks: [Check.Lives({ lives: [CL] })],
  },
  {
    name: "an incarnation owes its Held head a restore",
    cites: "Restore R3, I6: unknown Restored once per incarnation",
    start: model(lane("A", ["s", H])),
    steps: [ActorMove.Incarnated({ actor: shopper })],
    refusals: [[]],
    phases: { s: H },
    owed: 1,
    checks: [Check.Owing({ obligations: [restoring] })],
  },
  {
    name: "an adoption after the actor's disposal owes its Held head a restore",
    cites: "Actors R20, I29: a disposed actor's holds are restored at adoption",
    start: model(lane("A", ["s", H])),
    steps: [ActorMove.Disposed({ actor: shopper }), ActorMove.Adopt({ actor: shopper })],
    refusals: [[], []],
    phases: { s: H },
    owed: 1,
    checks: [
      Check.Owing({
        obligations: [
          Obligation.AwaitRestore({ attempt: "s", incarnation: 2, cause: "disposeActor" }),
        ],
      }),
    ],
  },
  {
    name: "a return after the grace owes a plain restore",
    cites: "Actors R9, Restore I6",
    start: model(lane("A", ["s", H])),
    steps: [ActorMove.Finished({ actor: shopper }), ActorMove.Incarnated({ actor: shopper })],
    refusals: [[], []],
    phases: { s: H },
    owed: 1,
    checks: [Check.Owing({ obligations: [restoring] })],
  },
  {
    name: "a Held head's parked ending delivered meets its restore",
    cites: "Restore I6: the parked ending is the restore's delivery",
    start: model(lane("A", ["s", H]), { endings: [ending(PK)] }),
    steps: [ActorMove.Incarnated({ actor: shopper }), LifeMove.Delivered({ ending: named })],
    refusals: [[], []],
    phases: { s: H },
    owed: 0,
    checks: [Check.Lives({ lives: [DF] })],
  },
  {
    name: "an incarnation opens only its own actor's endings",
    cites: "Actors R10: parked endings belong to their identity",
    start: model([], { endings: [ending(PK, { actor: other })] }),
    steps: [ActorMove.Incarnated({ actor: shopper })],
    refusals: [[]],
    phases: {},
    owed: 0,
    checks: [Check.Lives({ lives: [PK] })],
  },
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
  {
    name: "a turn of an ending not being delivered",
    cites: "the design: Heard moves only a Delivering life",
    start: model([], { endings: [ending(OW)] }),
    steps: [LifeMove.Heard({ ending: named })],
    refusals: [[]],
    phases: {},
    owed: 0,
    checks: [Check.Lives({ lives: [OW] })],
  },
];

/**
 * The traces of Table C: each cell at each guard value, and the actor moves.
 */
export const lifeTraces: ReadonlyArray<Trace> = [...tableTraces, ...actorTraces];
