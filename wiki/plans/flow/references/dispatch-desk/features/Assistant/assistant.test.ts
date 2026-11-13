// Assistant checks, in the runner's own `expect`.
import { expect, test } from "vite-plus/test";
import { Assistant as Model, textAfter } from "../../testing/assistant.fake.js";
import { Assistant } from "./assistant.definition.js";
import { assistantRef } from "./assistant.ref.js";
import {
  answered,
  askedAgain,
  refused,
  regenerated,
  reloaded,
  stalled,
  stopped,
  streaming,
  T42,
  truncated,
} from "./assistant.story.js";

const { S, O } = Assistant;

test("answered", async () => {
  const { answered: cp } = (await answered.run()).checkpoints;

  expect(cp.state).toBe(S.IDLE);
  expect(cp.memory).toMatchObject({ last: textAfter(10), incomplete: false });
  expect(cp.operations.suggest).toEqual([]);
  expect(cp.read(Model.suggest)).toMatchObject([{ phase: "closed", code: 1000 }]);
});

test("streaming: tokens are the row's progress, never a turn", async () => {
  const { streaming: cp } = (await streaming.run()).checkpoints;

  expect(cp.state).toBe(S.ASKING);
  expect(cp.lane(O.suggest, T42)).toMatchObject({
    pending: true,
    progress: { text: textAfter(2) },
  }); // was O.suggest.get(checkpoint, key)
  expect(cp.memory.last).toBe("");
});

test("regenerate: the interrupted Attempt's ending is evidence", async () => {
  const { regenerating, regenerated: done } = (await regenerated.run()).checkpoints;

  const row = regenerating.lane(O.suggest, T42);
  expect(row).toMatchObject({ pending: true });
  expect(row?.progress).toBeUndefined();
  expect(done.records("ending", { operation: O.suggest })).toMatchObject([
    { channel: "unknown", reason: { _tag: "Cancelled" }, disposition: "evidence" },
    { channel: "success" },
  ]);
  expect(done.memory).toMatchObject({ last: textAfter(10), incomplete: false });
  expect(done.read(Model.suggest)).toHaveLength(2);
});

test("stop: partial kept as incomplete, nothing held", async () => {
  const { stopped: cp } = (await stopped.run()).checkpoints;

  expect(cp.state).toBe(S.IDLE);
  expect(cp.memory).toMatchObject({ last: textAfter(2), incomplete: true });
  expect(cp.inspection.lanes).toEqual([]);
});

test("asked again after a stop", async () => {
  const { answeredAgain } = (await askedAgain.run()).checkpoints;

  expect(answeredAgain.memory).toMatchObject({ last: textAfter(10), incomplete: false });
});

test("a body without done is cut", async () => {
  const { cut } = (await truncated.run()).checkpoints;

  expect(cut.memory).toMatchObject({ last: textAfter(4), incomplete: true });
});

test("a stall is cut", async () => {
  const { cut } = (await stalled.run()).checkpoints;

  expect(cut.state).toBe(S.IDLE);
  expect(cut.memory).toMatchObject({ last: textAfter(2), incomplete: true });
});

test("a 4xx is a refusal", async () => {
  const { refused: cp } = (await refused.run()).checkpoints;

  expect(cp.memory).toMatchObject({ last: "", incomplete: false, refused: true });
});

test("a reload while asking restores an incomplete reply", async () => {
  const { reloaded: cp } = (await reloaded.run()).checkpoints;

  const restored = cp.read(assistantRef(T42));
  expect(restored?.state).toBe(S.IDLE);
  expect(restored?.memory).toMatchObject({ last: "", incomplete: true });
  // was `code: 1001` (going away). the fake logs a client close as code 1000, by "client"; 1001 is not expressible.
  expect(cp.read(Model.suggest)).toMatchObject([{ phase: "closed", by: "client" }]);
});
