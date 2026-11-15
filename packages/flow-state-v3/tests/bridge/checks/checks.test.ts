import assert from "node:assert/strict";
import { Option } from "effect";
import { describe, it } from "vite-plus/test";
import { Fact } from "../harness/facts.ts";
import { Pay } from "../harness/fixture.ts";
import { Observation } from "../harness/reports.ts";
import { RequestPhase } from "../harness/world/network.ts";
import { invokedWhileDisposing } from "./disposal.ts";
import { publicationBreaches } from "./publication.ts";

const actor = { machine: Pay.machine, id: "shopper-1" };

const published = (memoryId: number, memory: { readonly n: number }, state = "CARD") =>
  Fact.Reported({ observation: Observation.Published({ actor, state, memory, memoryId }) });

const turn = (from: string, to: string) =>
  Fact.Reported({
    observation: Observation.Turn({ actor, event: "Start", from, to, parts: [], members: [] }),
  });

const requested = Fact.Requested({
  request: {
    seq: 0,
    operation: "intent",
    input: {},
    key: Option.none(),
    phase: RequestPhase.Open(),
  },
});

const step = Fact.Stepped({ what: "step" });

describe("publication", () => {
  it("passes an honest run", () => {
    assert.deepEqual(
      publicationBreaches(
        [Pay],
        [step, turn("IDLE", "CARD"), published(1, { n: 1 }), step, published(1, { n: 1 })],
      ),
      [],
    );
  });

  it("finds a published object mutated (Turn I29)", () => {
    const found = publicationBreaches(
      [Pay],
      [step, published(1, { n: 1 }), step, published(1, { n: 2 })],
    );

    assert.match(found.join(), /^Turn I29: /u);
  });

  it("finds unchanged memory published as a new object (Turn I30)", () => {
    const found = publicationBreaches(
      [Pay],
      [step, published(1, { n: 1 }), step, published(2, { n: 1 })],
    );

    assert.match(found.join(), /^Turn I30: /u);
  });

  it("finds a move that published nothing (Turn I9)", () => {
    const found = publicationBreaches([Pay], [step, turn("IDLE", "CARD")]);
    assert.match(found.join(), /^Turn I9: /u);
  });
});

describe("nothing invoked while disposing", () => {
  it("finds a request after the disposal began (Actors I30)", () => {
    const found = invokedWhileDisposing([Fact.DisposingRuntime(), requested]);
    assert.match(found.join(), /^Actors I30: /u);
  });

  it("allows requests before the disposal and after the next reload", () => {
    assert.deepEqual(
      invokedWhileDisposing([requested, Fact.DisposingRuntime(), Fact.Reloaded(), requested]),
      [],
    );
  });
});
