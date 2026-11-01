// Assistant checks (`@flow-state/vitest`, proposed). Pending merge 6.
import { storyTest } from "@flow-state/vitest"; // NEW (proposed)
import { Story } from "flow-state/testing";
import { expect } from "vite-plus/test";
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

storyTest(answered, ({ at }) => {
  expect(at.answered).toMatchObject({
    state: S.IDLE,
    memory: { last: textAfter(10), incomplete: false },
  });
  expect(at.answered.operations.suggest).toEqual([]);
  expect(at.answered.read(Model.suggest)).toMatchObject([{ phase: "closed", code: 1000 }]);
});

storyTest(streaming, ({ at }) => {
  expect(at.streaming.state).toBe(S.ASKING);
  expect(O.suggest.get(at.streaming, T42)).toMatchObject({
    pending: true,
    progress: { text: textAfter(2) },
  });
  expect(at.streaming.memory.last).toBe(""); // tokens are the row's `progress`, never a turn (SR29)
});

storyTest(regenerated, ({ at }) => {
  // The interrupted Attempt's ending is evidence: no event, and the new one's progress starts empty (FC30).
  expect(O.suggest.get(at.regenerating, T42)).toMatchObject({ pending: true, progress: undefined });
  expect(at.regenerated.read(Story.records("ending", { operation: O.suggest }))).toMatchObject([
    { channel: "unknown", reason: { _tag: "Cancelled" }, disposition: "evidence" },
    { channel: "success" },
  ]);
  expect(at.regenerated.memory).toMatchObject({ last: textAfter(10), incomplete: false });
  expect(at.regenerated.read(Model.suggest)).toHaveLength(2);
});

storyTest(stopped, ({ at }) => {
  expect(at.stopped).toMatchObject({
    state: S.IDLE,
    memory: { last: textAfter(2), incomplete: true },
  });
  expect(at.stopped.read(Story.inspection).lanes).toEqual([]); // nothing held past the ending's own turn
});

storyTest(askedAgain, ({ at }) => {
  expect(at["answered-again"].memory).toMatchObject({ last: textAfter(10), incomplete: false });
});

storyTest(truncated, ({ at }) => {
  expect(at.cut.memory).toMatchObject({ last: textAfter(4), incomplete: true });
});

storyTest(stalled, ({ at }) => {
  expect(at.cut).toMatchObject({ state: S.IDLE, memory: { last: textAfter(2), incomplete: true } });
});

storyTest(refused, ({ at }) => {
  expect(at.refused.memory).toMatchObject({ last: "", incomplete: false, refused: true });
});

storyTest(reloaded, ({ at }) => {
  expect(at.reloaded.read(assistantRef(T42))).toMatchObject({
    state: S.IDLE,
    memory: { last: "", incomplete: true },
  });
  expect(at.reloaded.read(Model.suggest)).toMatchObject([{ phase: "closed", code: 1001 }]); // the server may finish
});
