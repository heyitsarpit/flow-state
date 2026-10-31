// The panels' checks (`@flow-state/vitest`, proposed; editor/editor.test.ts says what `at` is).
import { storyTest } from "@flow-state/vitest"; // NEW (proposed)
import { Story } from "flow-state/testing";
import { expect } from "vite-plus/test";
import { Desk } from "../../../testing/desk.fake.js";
import { Panels } from "./panels.definition.js";
import {
  deepLinked,
  freshOnNewTicket,
  frozenAndThawed,
  pinOutlivesFreeze,
  reservationExpiredWhileAway,
} from "./panels.story.js";

const { S } = Panels;

storyTest(frozenAndThawed, ({ at }) => {
  expect(at["history-open"].operations.history?.latest?.data?.entries).toHaveLength(10);
  // Frozen, not dropped: the slice stays readable and Inspection lists it as frozen; its read is not placed.
  expect(at.frozen.state).toBe(S.TABS.PARTS);
  expect(at.frozen.memory.history).toMatchObject({ earlier: [] });
  expect(at.frozen.read(Story.inspection).incarnations).toContainEqual(
    expect.objectContaining({ instance: ["history"], status: "frozen" }),
  );
  expect(at.frozen.read(Story.records("ending", { instance: ["history"] }))).toMatchObject([
    { reason: { _tag: "Interrupted" }, disposition: "parked" },
  ]);
  // Thawed: the cut lookup delivered first, asked again, and answered; the live read placed again.
  expect(at.thawed.memory.history?.earlier).toHaveLength(5);
  expect(at.thawed.read(Desk.history).filter((r) => r.input.before === "10")).toHaveLength(2);
});

storyTest(pinOutlivesFreeze, ({ at }) => {
  expect(at["pin-parked"].read(Story.inspection).lanes).toMatchObject([
    {
      contract: "DispatchDesk/pin-history-note",
      subject: ["T-42"],
      binding: "unplaced",
      parked: 1,
    },
  ]);
  expect(at["pin-adopted"].read(Story.inspection).lanes).toEqual([]);
  expect(at["pin-adopted"].read(Desk).desk.history["north/T-42"]?.[0]?.pinned).toBe(true);
});

storyTest(reservationExpiredWhileAway, ({ at }) => {
  const dueAt = at.reserved.schedules.parts?.reservation.expire?.dueAt;
  expect(dueAt).toBe(15 * 60_000);
  // Frozen with its deadline: twenty minutes later it has not fired, and still names the same instant.
  expect(at.away.memory.parts?.reserved).toEqual(["BULB-40W"]);
  expect(at.away.schedules.parts?.reservation.expire?.dueAt).toBe(dueAt);
  // Back on the tab: the overdue hold fires once.
  expect(at["reservation-expired-while-away"].memory.parts).toMatchObject({
    reserved: [],
    expired: true,
  });
  expect(
    at["reservation-expired-while-away"].read(
      Story.records("schedule", { instance: ["parts", "reservation"] }),
    ),
  ).toMatchObject([{ change: "armed" }, { change: "retracted" }, { change: "fired" }]);
});

storyTest(freshOnNewTicket, ({ at }) => {
  expect(at.fresh.memory.parts).toMatchObject({ ticketId: "T-43", reserved: [] });
  expect(at.fresh.read(Story.records("life", { instance: ["parts"] }))).toContainEqual(
    expect.objectContaining({ change: "reset" }),
  );
});

storyTest(deepLinked, ({ at }) => {
  expect(at.highlighted.memory.history?.highlighted).toBe("h-3");
});
