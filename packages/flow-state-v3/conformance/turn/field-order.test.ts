import assert from "node:assert/strict";
import { Option } from "effect";
import { describe, it } from "vite-plus/test";
import { Observation } from "../port.ts";
import { replayed } from "../runner/run.ts";
import { onPublished } from "./publication.ts";
import { changed, published } from "./refusal.ts";

// Two values that differ only in the order their fields were written are one value: a judge that
// keys a memory by its text would call the second a mutation.
const actor = { machine: "cart", id: "c1" };

const reported = (memory: Record<string, number>, memoryId: number) => ({
  _tag: "Reported" as const,
  observation: Observation.Published({ actor, state: "open", memory, memoryId }),
});

const first = { count: 1, total: 2 };
const reordered = { total: 2, count: 1 };

describe("a memory's fields in another order are the same memory", () => {
  it("publication does not call a reordered republication a mutation", () => {
    const start = { machines: {}, contents: new Map(), last: new Map() };
    const before = onPublished(start, reported(first, 1), []);
    const after = onPublished(before.state, reported(reordered, 1), []);

    assert.deepStrictEqual(after.found, []);
  });

  it("publication still calls other content a mutation", () => {
    const start = { machines: {}, contents: new Map(), last: new Map() };
    const before = onPublished(start, reported(first, 1), []);
    const after = onPublished(before.state, reported({ count: 1, total: 3 }, 1), []);

    assert.equal(after.found.length, 1);
  });

  it("refusal does not call a reordered publication a change", () => {
    const state = published({ published: new Map() }, [reported(first, 1)]);

    const found = changed(state, [reported(reordered, 2)], {
      actor,
      rule: "Turn I14",
      what: "refused turn",
      from: 0,
      at: 0,
    });

    assert.deepStrictEqual(found, []);
  });

  it("refusal still calls other memory a change", () => {
    const state = published({ published: new Map() }, [reported(first, 1)]);

    const found = changed(state, [reported({ count: 9, total: 2 }, 2)], {
      actor,
      rule: "Turn I14",
      what: "refused turn",
      from: 0,
      at: 0,
    });

    assert.equal(found.length, 1);
  });

  it("a replay is the same when only a report's fields were written in another order", () => {
    const report = (memory: Record<string, number>) =>
      Observation.Published({ actor, state: "open", memory, memoryId: 1 });

    assert.deepStrictEqual(replayed("T", [report(first)], [report(reordered)]), Option.none());
  });

  it("a replay still differs when a report's content does", () => {
    const report = (memory: Record<string, number>) =>
      Observation.Published({ actor, state: "open", memory, memoryId: 1 });

    assert.ok(Option.isSome(replayed("T", [report(first)], [report({ count: 2, total: 2 })])));
  });
});
