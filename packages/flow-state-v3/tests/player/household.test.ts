import { describe, expect, it } from "vite-plus/test";
import { household, room } from "../../fixtures/player/app.ts";
import {
  BUILDING,
  FAN_OUT,
  GROUP,
  groupBadRoom,
  groupInGrace,
  groupOfSixtyFour,
  groupPastGuard,
  groupPlay,
  groupRoomEnded,
  groupReplays,
  groupRoomsAbsent,
  homeStory,
  REPLAYS,
} from "../../fixtures/player/stories/sends.ts";
import {
  droppedSends,
  endsOf,
  incarnationsOf,
  refusedTurns,
  turnsOf,
  readerOf,
} from "../actors/sends.ts";
import { checked } from "../rules/rules.ts";
import { played } from "../rules/played.ts";
import { RuntimeDefaults } from "../../src/index.ts";

const { idOf, is } = readerOf(homeStory("ids"));

describe("the household plays a group of rooms (Actors R16; Runtime O4's send table)", () => {
  it.fails("Actors R16 live: each room of a group gets Play once, as a later turn of its own", async () => {
    const run = await played(groupPlay);

    for (const name of GROUP) {
      const snapshot = run.checkpoints.started.read(room(name));

      expect(snapshot?.memory["trackId"]).toBe("t1");
      expect(snapshot?.state.startsWith("ON.")).toBe(true);
    }

    for (const name of GROUP)
      expect(turnsOf(run, is(room(name))).filter((e) => e === "Play")).toEqual(["Play"]);
    expect(run.checkpoints.started.read(household)?.memory["started"]).toBe(3);
  });

  it.fails("Actors R16 live in the grace, I25: a room in its grace gets Play in the same incarnation, and the send is no use of it, so it ends after the grace", async () => {
    const run = await played(groupInGrace);

    expect(run.checkpoints.delivered.read(room("kitchen"))?.memory["trackId"]).toBe("t1");
    expect(incarnationsOf(run, is(room("kitchen")))).toBe(1);
    expect(run.checkpoints["after the grace"].read(room("kitchen"))?.lifecycle).not.toBe("active");
    expect(endsOf(run, is(room("kitchen")))).toBe(1);
  });

  it.fails("Actors R16 ending and not persisted, I25: a send to an ended unpersisted room is dropped NoRecord on the household, never recreating the room, and the household's turn stands", async () => {
    const run = await played(groupRoomEnded);

    expect(droppedSends(run)).toEqual([
      { actor: idOf(room("kitchen")), event: "Play", reason: "NoRecord", sender: idOf(household) },
    ]);
    expect(incarnationsOf(run, is(room("kitchen")))).toBe(1);
    expect(run.checkpoints.sent.read(household)?.memory["started"]).toBe(1);
  });

  it.fails("Actors R16 no record (disposed, never created): both sends are dropped NoRecord on the household, in send order, and neither room is created", async () => {
    const run = await played(groupRoomsAbsent);

    expect(droppedSends(run).map((d) => [d.actor, d.reason, d.sender])).toEqual([
      [idOf(room("kitchen")), "NoRecord", idOf(household)],
      [idOf(room("attic")), "NoRecord", idOf(household)],
    ]);
    expect(incarnationsOf(run, is(room("kitchen")))).toBe(1);
    expect(incarnationsOf(run, is(room("attic")))).toBe(0);
    expect(run.checkpoints.sent.read(household)?.memory["started"]).toBe(2);
  });

  it.fails("send check: a target ref with no encoded name refuses the sender's turn with a FlowError; the rooms before it played and none after", async () => {
    const run = await played(groupBadRoom);
    const sent = run.checkpoints.sent;

    expect(refusedTurns(sent, household)).toHaveLength(1);
    expect(sent.read(household)?.memory["started"]).toBe(1);
    expect(sent.read(room("lounge"))?.memory["trackId"]).toBe("t1");
    expect(sent.read(room("study"))?.memory["trackId"]).toBe("");
  });

  it.fails("S2 x 64, Actors R13: three group plays back to back each reach all sixty-four rooms once, the last track winning", async () => {
    const run = await played(groupOfSixtyFour);

    for (const n of Array.from({ length: BUILDING }, (_, i) => i)) {
      const at = room(`room-${String(n)}`);

      expect(run.checkpoints.end.read(at)?.memory["trackId"]).toBe("t3");
      expect(turnsOf(run, is(at)).filter((e) => e === "Play")).toHaveLength(3);
    }

    expect(run.checkpoints.end.read(household)?.memory["started"]).toBe(3 * BUILDING);
  });

  it.fails("Actors R13, I20: forty group plays whose sends together pass the loop guard are never refused, since the guard counts per admitted event", async () => {
    const run = checked(await groupReplays.run());
    const end = run.checkpoints.end;

    expect(refusedTurns(end, household)).toEqual([]);
    expect(end.read(household)?.memory["started"]).toBe(REPLAYS * BUILDING);
    expect(end.read(room("room-0"))?.memory["trackId"]).toBe(`t${String(REPLAYS)}`);
  });

  it.fails("Actors R13, I20: one group play whose sends together pass the loop guard is stopped there, though its chain of Nexts is shorter than the guard: the guard counts every send of one admitted event, not a chain's length", async () => {
    const run = checked(await groupPastGuard.run());
    const stopped = run.checkpoints.stopped;
    // PlayGroup sends one Next; each room's Next sends a Next and a Play.
    const started = Math.floor((RuntimeDefaults.loopGuard - 1) / 2);

    expect(FAN_OUT < RuntimeDefaults.loopGuard).toBe(true);
    expect(refusedTurns(stopped, household)).toHaveLength(1);
    expect(stopped.read(household)?.memory["started"]).toBe(started);
    expect(droppedSends(run)).toHaveLength(started);
  });
});
