import { describe, expect, it } from "vite-plus/test";
import { player } from "../../fixtures/player/machine.ts";
import { Speaker } from "../../fixtures/player/server.ts";
import { usual } from "../../fixtures/player/stories.ts";
import { played } from "../rules/played.ts";

describe("the usual player Story", () => {
  it("starts from its ref's input, with its constants and a computed label read from the input and the private device, OFF (Compile R5, R6; Actors R5, R6)", async () => {
    const run = await played(usual);

    expect(run.evidence.find((e) => e._tag === "Published")).toEqual(
      expect.objectContaining({
        state: "OFF",
        memory: {
          room: "lounge",
          trackId: "",
          pos: 0,
          notice: "",
          device: "living-room",
          label: "lounge: living-room",
        },
      }),
    );
  });

  it("enters a compound at its default leaf and moves between its children, the tick counting only while PLAYING (Turn R1, R3, R14)", async () => {
    const run = await played(usual);
    const at = (name: keyof typeof run.checkpoints) => run.checkpoints[name].read(player);

    expect(at("playing")?.state).toBe("ON.PLAYING");
    expect(at("three seconds")?.memory).toEqual(expect.objectContaining({ pos: 3 }));
    expect(at("paused")).toEqual(
      expect.objectContaining({ state: "ON.PAUSED", memory: expect.objectContaining({ pos: 3 }) }),
    );
    expect(at("stopped")?.state).toBe("OFF");
  });

  it("Turn R4: S.ON.history enters ON's last active leaf, and from there Resume plays on", async () => {
    const run = await played(usual);
    const at = (name: keyof typeof run.checkpoints) => run.checkpoints[name].read(player);

    expect(at("resumed into the pause")?.state).toBe("ON.PAUSED");
    expect(at("playing again")).toEqual(
      expect.objectContaining({ state: "ON.PLAYING", memory: expect.objectContaining({ pos: 4 }) }),
    );
  });

  it("Turn R14: a root handler for an event a PLAYING schedule lists in armOn runs, and the event restarts the schedule", async () => {
    const run = await played(usual);
    const at = (name: keyof typeof run.checkpoints) => run.checkpoints[name].read(player);

    expect(at("sought")?.memory).toEqual(expect.objectContaining({ pos: 10 }));
    expect(at("ticked after the seek")?.memory).toEqual(expect.objectContaining({ pos: 11 }));
  });

  it("an ending mapped at the root leaves ON from its child, and Stories see the private device (Turn R2, Machines O8)", async () => {
    const run = await played(usual);
    const refused = run.checkpoints.refused.read(player);

    expect(refused).toEqual(
      expect.objectContaining({
        state: "OFF",
        memory: expect.objectContaining({ notice: "not in your region", device: "living-room" }),
      }),
    );
  });

  it("Turn R20: a start owned by BUFFERING lands after BUFFERING was left and is routed from ON, its nearest surviving ancestor", async () => {
    const run = await played(usual);
    const late = run.checkpoints["late start"];

    expect(late.read(player)).toEqual(
      expect.objectContaining({
        state: "ON.PAUSED",
        memory: expect.objectContaining({ notice: "The speaker started while you were away." }),
      }),
    );
    expect(late.read(Speaker).playing).toEqual({ "living-room": "t3" });
  });
});
