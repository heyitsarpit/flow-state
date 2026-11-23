// The palette's checks (2.10.6): each test runs its Story once and destructures what it names.
import { expect, test } from "vite-plus/test";
import { Desk } from "../../testing/desk.fake.js";
import { Find } from "./find.definition.js";
import { cleared, failedKeeps, found, jumped, staleDropped } from "./find.story.js";

const { E, O } = Find;

test("one lookup after the pause, and none for one letter", async () => {
  const { typing, tooShort, results } = (await found.run()).checkpoints;

  expect(typing.read(Desk.find)).toEqual([]); // nothing sent for one letter
  expect(tooShort.records("verdict", { event: E.Search })).toMatchObject([
    { result: { _tag: "Denied", reasons: [{ code: "TooShort", context: { min: 2 } }] } },
  ]);
  expect(results.read(Desk.find).map((r) => r.input.q)).toEqual(["lobby"]); // one lookup after the pause
  expect(results.memory.hits).toMatchObject([{ kind: "ticket", id: "T-42" }]);
});

test("a slow answer to an older query never lands", async () => {
  const { staleDropped: cp } = (await staleDropped.run()).checkpoints;

  expect(cp.read(Desk.find).map((r) => r.input.q)).toEqual(["dock", "door"]);
  expect(cp.memory.hits.map((h) => h.id)).toEqual(["T-43"]); // "door"'s answer: the loading dock door
  // "dock"'s answer was released, not delivered: one `Found`, one `Superseded` lookup.
  expect(cp.records("ending", { operation: O.results })).toMatchObject([
    { channel: "success", key: { q: "door" } },
    { disposition: "evidence", reason: { _tag: "Superseded" }, key: { q: "dock" } },
  ]);
});

test("clearing the box cancels the lookup, and its answer never lands", async () => {
  const { inFlight, cleared: cp } = (await cleared.run()).checkpoints;

  expect(inFlight.lane(O.results)).toMatchObject({ _tag: "Pending" });
  expect(cp.lane(O.results)).toBeUndefined(); // N3: after `cancel`, the row does not exist
  expect(cp.memory.hits).toEqual([]); // the held answer never landed
});

test("a failed search keeps the last results, dimmed", async () => {
  const { failedKept } = (await failedKeeps.run()).checkpoints;

  expect(failedKept.memory).toMatchObject({
    failed: true,
    hits: [{ kind: "part", id: "BULB-40W" }],
  });
});

test("choosing a ticket records the choice and sends to the queue", async () => {
  const { jumped: cp } = (await jumped.run()).checkpoints;

  expect(cp.memory.chosen).toEqual({ kind: "ticket", id: "T-43" });
  // design gap: a machine Story's `send` action to an actor that is not running (the queue) has no record kind in
  // 2.10.6. The old file assumed `ActorAbsent` evidence in a `drop` record; nothing in the design says so.
  expect(cp.records("drop")).toContainEqual(expect.objectContaining({ reason: "ActorAbsent" }));
});
