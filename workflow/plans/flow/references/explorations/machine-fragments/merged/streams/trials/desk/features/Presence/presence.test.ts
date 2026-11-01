// TRIAL (stories-amended.md 1.1): Presence checks, in the runner's own `expect`.
import { expect, it as test } from "vite-plus/test"; // the repo shim exports `it`, not `test`
import { Collab } from "../../testing/presence.fake.js";
import { Presence } from "./presence.definition.js";
import { attachHeld, ben, joined, sdkGaveUp, sdkResumed, T42, typing } from "./presence.story.js";

const { S, O } = Presence;

test("joined: the set, the badges, the flash", async () => {
  const { joined: first, benJoined, settled } = (await joined.run()).checkpoints;

  expect(first.operations.viewers).toMatchObject({
    connection: "Live",
    value: { "dispatcher-2": { name: "Dana" } },
  });
  expect(first.memory.viewerIds).toEqual(["dispatcher-2"]);
  expect(benJoined.memory.badges).toMatchObject([
    { key: "dispatcher-2", fresh: false },
    { key: ben.id, fresh: true }, // the new arrival flashes
  ]);
  expect(settled.memory.badges.every((badge) => !badge.fresh)).toBe(true);
});

test("the SDK reconnects itself: dimmed, then proven", async () => {
  const { suspended, sdkResumed: resumed } = (await sdkResumed.run()).checkpoints;

  expect(suspended.state).toBe(S.WATCHING); // a drop is not a transition
  expect(suspended.operations.viewers).toMatchObject({
    connection: "Connecting",
    drop: { reason: "connection lost" },
    value: undefined,
    last: { value: { "dispatcher-2": { name: "Dana" } } }, // dimmed, never emptied
  });
  expect(resumed.operations.viewers?.connection).toBe("Live");
  expect(resumed.records("session", { operation: O.viewers })).toContainEqual(
    expect.objectContaining({ answer: "proven", basis: "collab channel resumed" }),
  );
  expect(resumed.read(Collab.channel)).toHaveLength(1); // the SDK's own reconnect: no second attach
});

test("the SDK gives up: ENDED with its reason", async () => {
  const { ended } = (await sdkGaveUp.run()).checkpoints;

  expect(ended.state).toBe(S.ENDED);
  expect(ended.memory.reason).toBe("token revoked");
});

test("typing: a burst never overflows, and pings are not held", async () => {
  const { typing: burst, pinging, pinged } = (await typing.run()).checkpoints;

  expect(burst.records("session", { operation: O.typing })).not.toContainEqual(
    expect.objectContaining({ kind: "Overflow" }),
  );
  expect(burst.memory.typing["dispatcher-2"]).toBe(102_400); // the last of the burst, each delivered once
  expect(pinging.lane(O.ping, T42)).toMatchObject({ pending: true, outstanding: 1 }); // was O.ping.get(checkpoint, key)
  expect(pinged.read(Collab.publish)).toHaveLength(2);
  expect(pinged.inspection.lanes).toEqual([]);
});

test("a held attach keeps the row Connecting", async () => {
  const { attaching, attached } = (await attachHeld.run()).checkpoints;

  expect(attaching.operations.viewers?.connection).toBe("Connecting");
  expect(attached.operations.viewers?.connection).toBe("Live");
});
