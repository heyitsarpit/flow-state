import { describe, expect, it } from "vite-plus/test";
import { player } from "../../fixtures/player/app.ts";
import {
  emptyRoom,
  emptyRoomPlayer,
  longRoom,
  roomAtBound,
  seekEdges,
} from "../../fixtures/player/stories/edges.ts";
import { sixteenRooms, roomOf } from "../../fixtures/player/stories/load.ts";
import { roomDisposed, roomReloaded } from "../../fixtures/player/stories/structure.ts";
import { played } from "../rules/played.ts";

describe("many rooms (fixtures.md L1 under L5)", () => {
  it("L1 x 16 under L5: sixteen rooms play at once, each ticking its own position through a burst of seeks", async () => {
    const run = await played(sixteenRooms);

    for (const n of [0, 7, 15])
      expect(run.checkpoints.end.read(roomOf(n))).toEqual(
        expect.objectContaining({
          state: "ON.PLAYING",
          memory: expect.objectContaining({ pos: 13 }),
        }),
      );
  });
});

describe("a room's end while its tick is armed (fixtures.md S6)", () => {
  it("S6 disposed, Actors R8, R20: a disposed room's tick is cancelled while the other room's runs on", async () => {
    const run = await played(roomDisposed);

    expect(run.checkpoints.later.read(roomOf(0))?.lifecycle).toBe("disposed");
    expect(run.checkpoints.later.read(roomOf(1))?.memory["pos"]).toBe(4);
  });

  it("S6 reloaded: an unpersisted room starts OFF after a reload, its tick gone", async () => {
    const run = await played(roomReloaded);

    expect(run.checkpoints.reloaded.read(player)).toEqual(
      expect.objectContaining({ state: "OFF", memory: expect.objectContaining({ pos: 0 }) }),
    );
  });
});

describe("rooms and seeks at their edges (fixtures.md E1, E3)", () => {
  it("E1, Compile R5: an empty room computes its label from the empty name", async () => {
    const run = await played(emptyRoom);

    expect(run.checkpoints.opened.read(emptyRoomPlayer)?.memory["label"]).toBe(": living-room");
  });

  it("E3, Codec R1: a room name at a string's 262,144-byte bound names a player that plays", async () => {
    const run = await played(roomAtBound);

    expect(run.checkpoints.playing.read(longRoom)?.state).toBe("ON.PLAYING");
  });

  it("a seek far past any track and a negative seek are taken as given, since the player keeps no track length, and the tick counts on from each", async () => {
    const run = await played(seekEdges);

    expect(run.checkpoints.past.read(player)?.memory["pos"]).toBe(100_001);
    expect(run.checkpoints.negative.read(player)?.memory["pos"]).toBe(-4);
  });
});
