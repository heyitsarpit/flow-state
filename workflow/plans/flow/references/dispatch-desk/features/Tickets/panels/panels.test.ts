// The panels' checks (2.10.6): each test runs its Story once and destructures what it names.
import { expect, test } from "vite-plus/test";
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

test("a tab that is left is frozen, not dropped, and the thaw delivers the cut lookup", async () => {
  const { historyOpen, frozen, thawed } = (await frozenAndThawed.run()).checkpoints;

  expect(historyOpen.operations.history?.latest?.data?.entries).toHaveLength(10);
  // Frozen, not dropped: the slice stays readable and Inspection lists it as frozen; its read is not placed.
  expect(frozen.state).toBe(S.TABS.PARTS);
  expect(frozen.memory.history).toMatchObject({ earlier: [] });
  expect(frozen.inspection.incarnations).toContainEqual(
    expect.objectContaining({ instance: ["history"], status: "frozen" }),
  );
  expect(frozen.records("ending", { instance: ["history"] })).toMatchObject([
    { reason: { _tag: "Interrupted" }, disposition: "parked" },
  ]);
  // Thawed: the cut lookup delivered first, asked again, and answered; the live read placed again.
  expect(thawed.memory.history?.earlier).toHaveLength(5);
  expect(thawed.read(Desk.history).filter((r) => r.input.before === "10")).toHaveLength(2);
});

test("a write that outlives the freeze is parked, and the thawed tab adopts it", async () => {
  const { pinParked, pinAdopted } = (await pinOutlivesFreeze.run()).checkpoints;

  expect(pinParked.inspection.lanes).toMatchObject([
    {
      contract: "DispatchDesk/pin-history-note",
      subject: ["T-42"],
      binding: "unplaced",
      parked: 1,
    },
  ]);
  expect(pinAdopted.inspection.lanes).toEqual([]);
  expect(pinAdopted.read(Desk).desk.history["north/T-42"]?.[0]?.pinned).toBe(true);
});

test("a deadline survives the freeze, and the overdue hold fires once on return", async () => {
  const {
    reserved,
    away,
    reservationExpiredWhileAway: back,
  } = (await reservationExpiredWhileAway.run()).checkpoints;

  const dueAt = reserved.schedules.parts?.reservation.expire?.dueAt;
  expect(dueAt).toBe(15 * 60_000);
  // Frozen with its deadline: twenty minutes later it has not fired, and still names the same instant.
  expect(away.memory.parts?.reserved).toEqual(["BULB-40W"]);
  expect(away.schedules.parts?.reservation.expire?.dueAt).toBe(dueAt);
  // Back on the tab: the overdue hold fires once.
  expect(back.memory.parts).toMatchObject({ reserved: [], expired: true });
  expect(back.records("schedule", { instance: ["parts", "reservation"] })).toMatchObject([
    { change: "armed" },
    { change: "retracted" },
    { change: "fired" },
  ]);
});

test("another ticket resets the Parts tab", async () => {
  const { fresh } = (await freshOnNewTicket.run()).checkpoints;

  expect(fresh.memory.parts).toMatchObject({ ticketId: "T-43", reserved: [] });
  expect(fresh.records("life", { instance: ["parts"] })).toContainEqual(
    expect.objectContaining({ change: "reset" }),
  );
});

test("a deep link highlights one history entry", async () => {
  const { highlighted } = (await deepLinked.run()).checkpoints;

  expect(highlighted.memory.history?.highlighted).toBe("h-3");
});
