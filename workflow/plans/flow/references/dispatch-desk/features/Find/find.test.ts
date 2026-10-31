// The palette's checks (`@flow-state/vitest`, proposed; features/Tickets/editor/editor.test.ts says what `at` is).
import { storyTest } from "@flow-state/vitest"; // NEW (proposed)
import { Story } from "flow-state/testing";
import { expect } from "vite-plus/test";
import { Desk } from "../../testing/desk.fake.js";
import { Find } from "./find.definition.js";
import { cleared, failedKeeps, found, jumped, staleDropped } from "./find.story.js";

const { E, O } = Find;

storyTest(found, ({ at }) => {
  expect(at.typing.read(Desk.find)).toEqual([]); // nothing sent for one letter
  expect(at["too-short"].read(Story.records("verdict", { event: E.Search }))).toMatchObject([
    { result: { _tag: "Denied", reasons: [{ code: "TooShort", context: { min: 2 } }] } },
  ]);
  expect(at.results.read(Desk.find).map((r) => r.input.q)).toEqual(["lobby"]); // one lookup after the pause
  expect(at.results.memory.hits).toMatchObject([{ kind: "ticket", id: "T-42" }]);
});

storyTest(staleDropped, ({ at }) => {
  const cut = at["stale-dropped"];
  expect(cut.read(Desk.find).map((r) => r.input.q)).toEqual(["dock", "door"]);
  expect(cut.memory.hits.map((h) => h.id)).toEqual(["T-43"]); // "door"'s answer: the loading dock door
  // "dock"'s answer was released, not delivered: one `Found`, one `Superseded` lookup.
  expect(cut.read(Story.records("ending", { operation: O.results }))).toMatchObject([
    { channel: "success", key: { q: "door" } },
    { disposition: "evidence", reason: { _tag: "Superseded" }, key: { q: "dock" } },
  ]);
});

storyTest(cleared, ({ at }) => {
  expect(at["in-flight"].operations.results?._tag).toBe("Pending");
  expect(at.cleared.operations.results).toBeUndefined(); // N3: after `cancel`, the row does not exist
  expect(at.cleared.memory.hits).toEqual([]); // the held answer never landed
});

storyTest(failedKeeps, ({ at }) => {
  expect(at["failed-kept"].memory).toMatchObject({
    failed: true,
    hits: [{ kind: "part", id: "BULB-40W" }],
  });
});

storyTest(jumped, ({ at }) => {
  expect(at.jumped.memory.chosen).toEqual({ kind: "ticket", id: "T-43" });
  // design gap: a machine Story's `send` to an absent ref (the queue is not running here) is a record with
  // `ActorAbsent` evidence (REVIEW gap 12's proposed answer).
  expect(at.jumped.read(Story.records("drop"))).toContainEqual(
    expect.objectContaining({ reason: "ActorAbsent" }),
  );
});
