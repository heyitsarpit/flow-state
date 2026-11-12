import { ActorMove, LifeMove, Move, Obligation } from "./lifecycle-model.ts";
import { CL, DF, ending, KP, named, other, OW, PK } from "./lifecycle-lives.traces.ts";
import { at, build, Check, type Trace } from "./lifecycle-trace.ts";

const { H } = at;
const { shopper, lane, model, wl, unknown } = build;

const restoring = Obligation.AwaitRestore({ attempt: "s", cause: "plain" });

const unboundAfterDisposal = model(lane("A", ["s", H]), {
  actors: [{ actor: shopper, record: "disposeActor" }],
  saved: { lives: [], ended: 0, least: { lives: [], ended: 0, removed: [shopper], minted: 0 } },
});

/**
 * The traces of the actor moves on endings: incarnations, disposals, forgets and restores.
 */
export const actorTraces: ReadonlyArray<Trace> = [
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
    name: "a reload owes its Held head one restore, and the boot's incarnation owes no second",
    cites: "Restore R3, I6: unknown Restored once per incarnation",
    start: model(lane("A", ["s", H])),
    steps: [Move.Reload(), ActorMove.Incarnated({ actor: shopper })],
    refusals: [[], []],
    phases: { s: H },
    owed: 1,
    checks: [Check.Owing({ obligations: [restoring] })],
  },
  {
    name: "a boot's restore ending comes before its incarnation opens, owed until delivered",
    cites:
      "Restore R3, I6: the boot decides its restore endings, then opens incarnations; R1: restored live",
    start: model(lane("A", ["s", H])),
    steps: [Move.Reload(), unknown("s", "Restored")],
    refusals: [[], []],
    phases: { s: H },
    owed: 1,
    checks: [],
  },
  {
    name: "a boot owes no restore to a head whose own ending is parked",
    cites: "Actors R10, Restore R3 (C22): its parked ending is what the next incarnation hears",
    start: model(lane("A", ["s", H]), { endings: [ending(PK)] }),
    steps: [Move.Reload()],
    refusals: [[]],
    phases: { s: H },
    owed: 0,
    checks: [],
  },
  {
    name: "a boot owes no restore to a head whose ending was decided in the disposal",
    cites:
      "Actors R10, R22: that ending parks at the reload and is what the next incarnation hears",
    start: model(lane("A", ["s", H]), { endings: [ending(OW, { inDisposal: true })] }),
    steps: [Move.Reload()],
    refusals: [[]],
    phases: { s: H },
    owed: 0,
    checks: [],
  },
  {
    name: "a bound actor's incarnation with no reload owes no restore",
    cites: "Restore I6: no boot and no return, so no restore ending",
    start: model(lane("A", ["s", H])),
    steps: [ActorMove.Incarnated({ actor: shopper })],
    refusals: [[]],
    phases: { s: H },
    owed: 0,
    checks: [],
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
        obligations: [Obligation.AwaitRestore({ attempt: "s", cause: "disposeActor" })],
      }),
    ],
  },
  {
    name: "a disposed identity's unbound Held head may take its restore at the boot, parked for its adoption",
    cites:
      "Actors R20 (unbound lanes reported at each boot until an adopting ensure), Restore R1 (an unbound lane's endings are parked for the adopting incarnation); owed until delivered, never due",
    start: unboundAfterDisposal,
    steps: [Move.Reload(), unknown("s", "Restored")],
    refusals: [[], []],
    phases: { s: H },
    owed: 1,
    checks: [
      Check.Owing({
        obligations: [Obligation.AwaitRestore({ attempt: "s", cause: "unbound" })],
      }),
    ],
  },
  {
    name: "a disposed identity's unbound Held head not restored at the boot is owed its restore at adoption",
    cites: "Actors R20, I29: a disposed actor's holds are restored at adoption",
    start: unboundAfterDisposal,
    steps: [Move.Reload(), ActorMove.Adopt({ actor: shopper })],
    refusals: [[], []],
    phases: { s: H },
    owed: 1,
    checks: [
      Check.Owing({
        obligations: [Obligation.AwaitRestore({ attempt: "s", cause: "disposeActor" })],
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
    steps: [
      Move.Reload(),
      ActorMove.Incarnated({ actor: shopper }),
      LifeMove.Delivered({ ending: named }),
    ],
    refusals: [[], [], []],
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
