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
import { build, Check, type Trace } from "./lifecycle-trace.ts";
import type { InvariantId } from "./facts.ts";

const { shopper, model, wl, actors } = build;

export const other = { machine: "Checkout/Pay", id: "shopper-2" };

export const ending = (life: Life, more: Partial<Ending> = {}) => ({
  attempt: Option.some("s"),
  operation: "pay",
  actor: shopper,
  channel: "unknown" as const,
  reason: "Interrupted",
  inDisposal: false,
  life,
  ...more,
});

export const named = { operation: "pay", attempt: Option.some("s"), actor: shopper };

export const OW = Life.Owed();
export const PK = Life.Parked();
const PO = Life.ParkedOpen();
export const DF = Life.Delivering({ retry: false });
const DT = Life.Delivering({ retry: true });
const RF = Life.Refused();
export const KP = Life.Kept();
const KO = Life.KeptOpen();
const EV = Life.Evidence();
export const CL = Life.Closed();
const MB = Life.Maybe();

const lives: ReadonlyArray<readonly [string, Life]> = [
  ["Owed", OW],
  ["Parked", PK],
  ["ParkedOpen", PO],
  ["Delivering", DF],
  ["Refused", RF],
  ["Kept", KP],
  ["KeptOpen", KO],
  ["Evidence", EV],
  ["Closed", CL],
  ["Maybe", MB],
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
      ParkedOpen: DF,
      Delivering: wl(15),
      Refused: DT,
      Kept: actors(24),
      KeptOpen: DT,
      Evidence: wl(15),
      Closed: wl(15),
      Maybe: DT,
    },
  ),
  ...rowTraces(
    "Delivered",
    "Actors R22, WriteLanes I15: during the Runtime's disposal an ending is parked, not delivered",
    {
      Owed: wl(15),
      Parked: wl(15),
      ParkedOpen: wl(15),
      Refused: wl(15),
      Kept: wl(15),
      KeptOpen: wl(15),
      Maybe: wl(15),
    },
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
      ParkedOpen: wl(15),
      Delivering: RF,
      Refused: wl(15),
      Kept: wl(15),
      KeptOpen: wl(15),
      Evidence: wl(15),
      Closed: wl(15),
      Maybe: wl(15),
    },
  ),
  lifeTrace(
    "InvalidTurn",
    "WriteLanes I15: a second refusal is final; Actors R15 keeps it",
    DT,
    KP,
  ),
  lifeTrace(
    "InvalidTurn",
    "Actors R15 (ruling CQ1): a second refusal ends the tries until the next boot or adoption",
    DT,
    KP,
    alone,
    { channel: "failure", reason: "Cancelled" },
    " of a never-sent Attempt",
  ),
  ...rowTraces("Unmapped", "Actors R15: an unmapped ending is final (today's rule; CQ10)", {
    Owed: wl(15),
    Parked: wl(15),
    ParkedOpen: wl(15),
    Delivering: CL,
    Refused: wl(15),
    Kept: wl(15),
    KeptOpen: wl(15),
    Evidence: wl(15),
    Closed: wl(15),
    Maybe: wl(15),
  }),
  lifeTrace("Heard", "WriteLanes R10: a delivered ending is heard by its turn", DF, CL),
  ...rowTraces("Parked", "WriteLanes R10, Actors R22: an owed ending parks for its incarnation", {
    Owed: PK,
    Parked: PK,
    ParkedOpen: PK,
    Delivering: wl(15),
    Refused: wl(15),
    Kept: wl(15),
    KeptOpen: wl(15),
    Evidence: wl(15),
    Closed: wl(15),
    Maybe: PK,
  }),
  ...rowTraces("Unparked", "WriteLanes R10: a parked ending is owed again", {
    Owed: wl(15),
    Parked: OW,
    ParkedOpen: OW,
    Delivering: wl(15),
    Refused: wl(15),
    Kept: KP,
    KeptOpen: KO,
    Evidence: wl(15),
    Closed: wl(15),
    Maybe: MB,
  }),
  ...rowTraces(
    "RecordedLetGo",
    "Actors R15, R21: a kept ending is let go when cancelled or forgotten",
    { Owed: CL, Parked: CL, ParkedOpen: CL, Kept: CL, KeptOpen: CL, Maybe: CL },
    lettingGo,
    {},
    " owing its let-go",
  ),
  ...rowTraces("RecordedLetGo", "WriteLanes I15: an ending is let go only when owed", {
    Owed: wl(15),
    Parked: wl(15),
    ParkedOpen: wl(15),
    Delivering: wl(15),
    Refused: wl(15),
    Kept: wl(15),
    KeptOpen: wl(15),
    Evidence: CL,
    Closed: wl(15),
    Maybe: wl(15),
  }),
  ...rowTraces("RecordedOther", "WriteLanes R10, I15: evidence is recorded, never delivered", {
    Owed: wl(15),
    Parked: wl(15),
    ParkedOpen: wl(15),
    Delivering: wl(15),
    Refused: wl(15),
    Kept: wl(15),
    KeptOpen: wl(15),
    Evidence: CL,
    Closed: wl(15),
    Maybe: wl(15),
  }),
  ...[OW, PK, PO, MB].map((life) =>
    lifeTrace(
      "RecordedOther",
      "Actors R21: forget's parked and boot-queued endings become evidence",
      life,
      CL,
      (e) => model([], { endings: [e], actors: [{ actor: shopper, record: "forget" }] }),
      {},
      " of a forgotten identity",
    ),
  ),
  ...rowTraces(
    "Opens",
    "Actors R10, R15: an incarnation is owed its parked endings and one kept try",
    {
      Owed: OW,
      Parked: PO,
      ParkedOpen: PO,
      Delivering: DF,
      Refused: RF,
      Kept: KO,
      KeptOpen: KO,
      Evidence: EV,
      Closed: CL,
      Maybe: MB,
    },
  ),
  lifeTrace(
    "Opens",
    "Actors R22 as written, pending CQ6: a never-sent commit's disposal ending is not owed",
    PK,
    PK,
    alone,
    { channel: "failure", reason: "Disposed", inDisposal: true },
    " of a never-sent commit decided in disposal",
  ),
  ...rowTraces("StepEnds", "WriteLanes I15; Actors R10, I24: endings settle in their step (CQ8)", {
    Owed: wl(15),
    Parked: PK,
    ParkedOpen: wl(15),
    Delivering: wl(15),
    Refused: wl(15),
    Kept: KP,
    KeptOpen: actors(24),
    Evidence: wl(15),
    Closed: CL,
    Maybe: MB,
  }),
  lifeTrace(
    "StepEnds",
    "Restore R1, WriteLanes I15: an actor the suite holds is live, so its ending may not stay parked",
    PK,
    wl(15),
    (e) => model([], { endings: [e], held: [[shopper, "story"]] }),
    {},
    " of an actor the suite holds",
  ),
  lifeTrace(
    "StepEnds",
    "Actors R22: an ending decided during disposal is parked for the next incarnation",
    OW,
    OW,
    alone,
    { inDisposal: true },
    " decided in disposal",
  ),
  ...rowTraces("Reload", "Actors R15, R22: what survives comes back as the boot's (CQ10)", {
    Owed: CL,
    Parked: PK,
    ParkedOpen: PK,
    Delivering: wl(15),
    Refused: CL,
    Kept: KP,
    KeptOpen: KP,
    Evidence: CL,
    Closed: CL,
    Maybe: MB,
  }),
  lifeTrace(
    "Reload",
    "Actors R22: an ending decided during disposal parks at the reload",
    OW,
    PK,
    alone,
    { inDisposal: true },
    " decided in disposal",
  ),
  ...rowTraces("DisposalStarts", "Actors R22: the disposal's start moves no ending", {
    Owed: OW,
    Parked: PK,
    ParkedOpen: PO,
    Delivering: DF,
    Refused: RF,
    Kept: KP,
    KeptOpen: KO,
    Evidence: EV,
    Closed: CL,
    Maybe: MB,
  }),
];

/**
 * The traces of Table C: each cell at each guard value (the actor moves are
 * `lifecycle-actor-lives.traces.ts`).
 */
export const lifeTraces: ReadonlyArray<Trace> = tableTraces;
