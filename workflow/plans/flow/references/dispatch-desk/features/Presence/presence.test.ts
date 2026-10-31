// Presence checks (`@flow-state/vitest`, proposed). Pending merge 6.
import { storyTest } from "@flow-state/vitest"; // NEW (proposed)
import { Story } from "flow-state/testing";
import { expect } from "vite-plus/test";
import { Collab } from "../../testing/presence.fake.js";
import { Presence } from "./presence.definition.js";
import { attachHeld, ben, joined, sdkGaveUp, sdkResumed, typing } from "./presence.story.js";

const { S, O } = Presence;

storyTest(joined, ({ at }) => {
  expect(at.joined.operations.viewers).toMatchObject({
    connection: "Live",
    value: { "dispatcher-2": { name: "Dana" } },
  });
  expect(at.joined.memory.viewerIds).toEqual(["dispatcher-2"]);
  expect(at["ben-joined"].memory.badges).toMatchObject([
    { key: "dispatcher-2", fresh: false },
    { key: ben.id, fresh: true }, // the new arrival flashes
  ]);
  expect(at.settled.memory.badges.every((badge) => !badge.fresh)).toBe(true);
});

storyTest(sdkResumed, ({ at }) => {
  expect(at.suspended.state).toBe(S.WATCHING); // a drop is not a transition
  expect(at.suspended.operations.viewers).toMatchObject({
    connection: "Connecting",
    drop: { reason: "connection lost" },
    value: undefined,
    last: { value: { "dispatcher-2": { name: "Dana" } } }, // dimmed, never emptied
  });
  expect(at["sdk-resumed"].operations.viewers?.connection).toBe("Live");
  expect(at["sdk-resumed"].read(Story.records("session", { operation: O.viewers }))).toContainEqual(
    expect.objectContaining({ answer: "proven", basis: "collab channel resumed" }),
  );
  expect(at["sdk-resumed"].read(Collab.channel)).toHaveLength(1); // the SDK's own reconnect: no second attach
});

storyTest(sdkGaveUp, ({ at }) => {
  expect(at.ended.state).toBe(S.ENDED);
  expect(at.ended.memory.reason).toBe("token revoked");
});

storyTest(typing, ({ at }) => {
  expect(at.typing.read(Story.records("session", { operation: O.typing }))).not.toContainEqual(
    expect.objectContaining({ kind: "Overflow" }),
  );
  expect(at.typing.memory.typing["dispatcher-2"]).toBe(39_900); // the last of the burst, each delivered once
  expect(O.ping.get(at.pinging, { workspaceId: "north", ticketId: "T-42" })).toMatchObject({
    pending: true,
    outstanding: 1,
  });
  expect(at.pinged.read(Collab.publish)).toHaveLength(2);
  expect(at.pinged.read(Story.inspection).lanes).toEqual([]);
});

storyTest(attachHeld, ({ at }) => {
  expect(at.attaching.operations.viewers?.connection).toBe("Connecting");
  expect(at.attached.operations.viewers?.connection).toBe("Live");
});
