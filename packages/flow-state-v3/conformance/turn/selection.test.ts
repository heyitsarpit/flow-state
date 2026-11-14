import assert from "node:assert/strict";
import { Option } from "effect";
import { describe, it } from "vite-plus/test";
import { parts } from "../../fixtures/index.ts";
import { partFixture } from "../parts/reference.ts";
import { Fact } from "../dsl/oracle.ts";
import { DisposeExit, Observation } from "../port.ts";
import { actorIn, keyOf, leavesOf, Undecided } from "./anchor.ts";
import { anchorAt, judgedStep } from "./selection.ts";

const pay = parts.find((p) => p.name === "pay");

assert.ok(pay !== undefined);

const actor = { machine: pay.machine.compiled.id, id: "shopper-1" };
const machines = { [actor.machine]: partFixture(pay).handlers };

const turn = (event: string, from: string, to: string, at: string) => [
  Fact.Drove({ actor, event, to: { _tag: "Root" }, labels: {} }),
  Fact.Reported({
    observation: Observation.Turn({
      actor,
      event,
      from,
      to,
      parts: [{ part: [], definition: actor.machine, at, node: "root", target: to }],
      members: [],
    }),
  }),
];

const flushed = [Fact.Wrote({ bytes: 1 }), Fact.Purposed({ purpose: "flush" })];
const held = [Fact.Wrote({ bytes: 1 }), Fact.Purposed({ purpose: "capture" })];

const after = (steps: ReadonlyArray<ReadonlyArray<Fact>>, leaf = "IDLE") =>
  steps.reduce((state, step) => judgedStep(state, step).state, anchorAt(machines, actor, leaf, []));

describe("what selection leaves undecided (Turn I2, I12)", () => {
  it("a guard the folds cannot compute is listed by its place", () => {
    const state = after(
      [turn("PayNotSent", "PAYING", "PAYING", "states.PAYING.on.PayNotSent[0]")],
      "PAYING",
    );

    assert.deepEqual(
      state.undecided.filter(Undecided.$is("Guard")).map((u) => u.at),
      ["states.PAYING.on.PayNotSent[0]"],
    );
  });

  it("a schedule armed with a delay the folds cannot compute is listed by its id", () => {
    const state = after([turn("Busy", "PAYING", "WAITING", "states.PAYING.on.Busy[0]")], "PAYING");

    assert.deepEqual(
      state.undecided.filter(Undecided.$is("Delay")).map((u) => `${u.state} ${u.schedule}`),
      ["WAITING retry"],
    );
  });

  it("a turn whose guards and delays are all computed lists nothing", () => {
    const state = after([turn("Start", "IDLE", "CARD", "states.IDLE.on.Start[0]")]);

    assert.deepEqual(state.undecided, []);
  });
});

describe("the leaves a kill may restore (Turn I2; WriteAhead R10, I10)", () => {
  it("a use of a disposed actor does not pin its record: the removal may not have landed", () => {
    const state = after([
      [...turn("Leave", "IDLE", "LEFT", "on.Leave[1]"), ...flushed],
      [Fact.Disposed({ actor })],
      [Fact.Ensured({ actor, use: "story" })],
      [...turn("Start", "IDLE", "CARD", "states.IDLE.on.Start[0]"), ...held],
      [Fact.Reloaded({ release: 1 })],
    ]);

    assert.deepEqual(actorIn(state, actor).allowed.toSorted(), ["CARD", "IDLE", "LEFT"]);
  });

  it("a second kill with no turn between keeps the leaves the first left uncertain", () => {
    const state = after([
      [...turn("Leave", "IDLE", "LEFT", "on.Leave[1]"), ...flushed],
      [...turn("Start", "LEFT", "CARD", "states.LEFT.on.Start[0]"), ...held],
      [Fact.Reloaded({ release: 1 })],
      [Fact.Reloaded({ release: 2 })],
    ]);

    assert.deepEqual(actorIn(state, actor).allowed.toSorted(), ["CARD", "LEFT"]);
  });

  it("the first turn after a kill pins the leaf it was restored at", () => {
    const state = after([
      [...turn("Leave", "IDLE", "LEFT", "on.Leave[1]"), ...flushed],
      [...turn("Start", "LEFT", "CARD", "states.LEFT.on.Start[0]"), ...held],
      [Fact.Reloaded({ release: 1 })],
      [...turn("PayRequested", "CARD", "PAYING", "on.PayRequested[1]"), ...held],
      [Fact.Reloaded({ release: 2 })],
    ]);

    assert.deepEqual(actorIn(state, actor).allowed.toSorted(), ["CARD", "PAYING"]);
  });
});

describe("a reload after a completed Runtime disposal (Actors I44; T52 close review O1)", () => {
  const disposed = (exit: DisposeExit, failed: ReadonlyArray<Fact> = []) => [
    [...turn("Leave", "IDLE", "LEFT", "on.Leave[1]"), ...flushed],
    [...turn("Start", "LEFT", "CARD", "states.LEFT.on.Start[0]"), ...held],
    [Fact.DisposingRuntime(), ...failed],
    [Fact.Disposal({ exit })],
    [Fact.Reloaded({ release: 1 })],
  ];

  it("restores exactly the state the final write held: no older leaf is allowed", () => {
    const state = after(disposed(DisposeExit.Done()));

    assert.deepEqual(actorIn(state, actor).allowed, []);
    assert.equal(leavesOf(state).get(keyOf(actor)), "CARD");
  });

  it("an older leaf after that reload breaks Turn I2", () => {
    const steps = disposed(DisposeExit.Done());

    const judged = judgedStep(
      after(steps),
      turn("PayRequested", "LEFT", "PAYING", "on.PayRequested[1]"),
    );

    assert.deepEqual(
      judged.violations.map((v) => v.invariant),
      ["Turn I2"],
    );
  });

  it("a refused final write or a failed cleanup leaves the leaves a kill may restore", () => {
    const refused = Fact.Reported({
      observation: Observation.Evidence({
        kind: "StorageFailure",
        operation: "",
        attempt: Option.none(),
      }),
    });

    for (const steps of [
      disposed(DisposeExit.Done(), [refused]),
      disposed(DisposeExit.CleanupFailed({ why: "planted" })),
    ])
      assert.deepEqual(actorIn(after(steps), actor).allowed.toSorted(), ["CARD", "LEFT"]);
  });

  it("a second dispose restarts nothing: a refusal seen after the first still counts (Actors I43)", () => {
    const refused = Fact.Reported({
      observation: Observation.Evidence({
        kind: "StorageFailure",
        operation: "",
        attempt: Option.none(),
      }),
    });

    const state = after([
      [...turn("Leave", "IDLE", "LEFT", "on.Leave[1]"), ...flushed],
      [...turn("Start", "LEFT", "CARD", "states.LEFT.on.Start[0]"), ...held],
      [Fact.DisposingRuntime(), refused],
      [Fact.DisposingRuntime()],
      [Fact.Disposal({ exit: DisposeExit.Done() })],
      [Fact.Reloaded({ release: 1 })],
    ]);

    assert.deepEqual(actorIn(state, actor).allowed.toSorted(), ["CARD", "LEFT"]);
  });
});
