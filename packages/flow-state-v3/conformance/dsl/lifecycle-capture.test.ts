import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { rolledBack, wrote } from "./lifecycle-capture.ts";
import { apply } from "./lifecycle-fold.ts";
import { ActorMove, Life, LifeMove, Move, Obligation, Phase } from "./lifecycle-model.ts";
import { CL, ending, named, OW, PK } from "./lifecycle-lives.traces.ts";
import { build } from "./lifecycle-trace.ts";

const { model } = build;

const restored = (life: Life) => rolledBack(wrote(model([], { endings: [ending(life)] }), "flush"));

const livesOf = (life: Life) => restored(life).endings.map((e) => e.life._tag);

describe("a row's fate in the step whose batch landed is exact (WriteAhead I21, I22)", () => {
  it("a kill restores each row as the batch the step wrote holds it, never a bound", () => {
    assert.deepEqual(livesOf(CL), ["Closed"]);
    assert.deepEqual(livesOf(OW), ["Owed"]);
    assert.deepEqual(livesOf(PK), ["Parked"]);
  });

  it("a doubled delivery of a row the landed batch holds as heard is refused", () => {
    const [, refusals] = apply(restored(CL), LifeMove.Delivered({ ending: named }));

    assert.deepEqual(
      refusals.map((r) => r.invariant),
      ["WriteLanes I15"],
    );
  });

  it("a batch holds the step's end, so the old least bound (the step's start) restores another life (close O2)", () => {
    const start = model([], { endings: [ending(OW)] });
    const [delivered] = apply(start, LifeMove.Delivered({ ending: named }));
    const [heard] = apply(delivered, LifeMove.Heard({ ending: named }));

    const lives = (m: typeof start) =>
      rolledBack(wrote(m, "flush")).endings.map((e) => e.life._tag);

    assert.notDeepEqual(lives(heard), lives(start));
    assert.deepEqual(lives(start), ["Owed"]);
  });

  it("a reload keeps a Held head's Maybe row, so its start owes no restore beside it (close O3)", () => {
    const start = build.model(build.lane("A", ["s", Phase.Held()]), {
      endings: [ending(Life.Maybe())],
    });

    const [reloaded] = apply(start, Move.Reload());
    const [started] = apply(reloaded, ActorMove.Incarnated({ actor: build.shopper }));

    assert.ok(
      !started.obligations.some(Obligation.$is("AwaitRestore")),
      started.obligations.map((o) => o._tag).join(" "),
    );
  });

  it("an adopting incarnation owes no restore to a Held head with a Kept or Refused row (close O4)", () => {
    for (const life of [Life.Kept(), Life.Refused()]) {
      const start = build.model(build.lane("A", ["s", Phase.Held()]), {
        actors: [{ actor: build.shopper, record: "disposeActor" }],
        endings: [ending(life)],
      });

      const [adopted] = apply(start, ActorMove.Adopt({ actor: build.shopper }));

      assert.ok(!adopted.obligations.some(Obligation.$is("AwaitRestore")), life._tag);
    }

    const bare = build.model(build.lane("A", ["s", Phase.Held()]), {
      actors: [{ actor: build.shopper, record: "disposeActor" }],
    });

    const [owing] = apply(bare, ActorMove.Adopt({ actor: build.shopper }));

    assert.ok(owing.obligations.some(Obligation.$is("AwaitRestore")), "a bare Held head owes one");
  });

  it("a row the landed batch holds as owed is still owed, so dropping it is a lost delivery", () => {
    const [, refusals] = apply(restored(PK), LifeMove.Delivered({ ending: named }));

    assert.deepEqual(refusals, []);
    assert.ok(restored(PK).endings.every((e) => e.life._tag !== "Maybe"));
  });
});
