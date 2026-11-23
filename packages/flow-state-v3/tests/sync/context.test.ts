import { describe, expect, it } from "vite-plus/test";
import { autoPull } from "../../fixtures/sync/app.ts";
import {
  pullFirstPause,
  pullPaused,
  pullRepaused,
  pullUnchanged,
  pullWatching,
} from "../../fixtures/sync/stories/context.ts";
import { pausedPull } from "../../fixtures/sync/stories/structure.ts";
import { played } from "../rules/played.ts";
import { refusal } from "../refusals.ts";

describe("the auto-pull reads its client's head and cooldown (Turn R22)", () => {
  it("Turn R22: each read head is pulled while watching; a rate limit is shown once and the cooldown's end is declined", async () => {
    const run = await played(pullWatching);
    const at = (name: keyof typeof run.checkpoints) => run.checkpoints[name].read(autoPull);

    expect(at("peeked")).toEqual(
      expect.objectContaining({
        context: { head: "a1b2c3", limited: false },
        memory: { pulled: "a1b2c3", pulls: 1, pending: "", behind: 0, throttles: 0 },
      }),
    );
    expect(at("pulled")?.memory).toEqual({
      pulled: "h1",
      pulls: 2,
      pending: "",
      behind: 0,
      throttles: 0,
    });
    expect(at("cooling")?.context).toEqual({ head: "h1", limited: true });
    expect(at("cooling")?.memory.throttles).toBe(1);
    expect(at("cooled")).toEqual(
      expect.objectContaining({
        context: { head: "h1", limited: false },
        memory: { pulled: "h1", pulls: 2, pending: "", behind: 0, throttles: 1 },
      }),
    );
  });
});

// Pausing changes what a head move does, not whether it is heard: one top-level reaction, handled
// by the state the auto-pull is in, so no move is lost while paused and none is told twice.
describe("a reaction handled per state (Turn R22)", () => {
  it("Turn R22: two head moves while paused are kept, and resuming pulls the latest head once", async () => {
    const run = await played(pullPaused);
    const at = (name: keyof typeof run.checkpoints) => run.checkpoints[name].read(autoPull);

    expect(at("paused")).toEqual(
      expect.objectContaining({
        state: "PAUSED",
        context: expect.objectContaining({ head: "h2" }),
        memory: { pulled: "a1b2c3", pulls: 1, pending: "h2", behind: 2, throttles: 0 },
      }),
    );
    expect(at("resumed")?.memory).toEqual({
      pulled: "h2",
      pulls: 2,
      pending: "",
      behind: 0,
      throttles: 0,
    });
    expect(at("after")?.memory).toEqual({
      pulled: "h3",
      pulls: 3,
      pending: "",
      behind: 0,
      throttles: 0,
    });
  });

  it("Turn R22: pausing and resuming with no head move pulls nothing more; a read of the same head while paused is no move", async () => {
    const run = await played(pullUnchanged);

    expect(run.checkpoints.resumed.read(autoPull)).toEqual(
      expect.objectContaining({
        state: "WATCHING",
        memory: { pulled: "a1b2c3", pulls: 1, pending: "", behind: 0, throttles: 0 },
      }),
    );
  });

  it("Turn R22: pausing with a head already pulled shows no new commit, a re-read of it is no move, and the next move shows once", async () => {
    const run = await played(pullFirstPause);
    const at = (name: keyof typeof run.checkpoints) => run.checkpoints[name].read(autoPull);

    expect(at("paused")?.memory).toEqual({
      pulled: "a1b2c3",
      pulls: 1,
      pending: "",
      behind: 0,
      throttles: 0,
    });
    expect(at("reread")?.memory).toEqual({
      pulled: "a1b2c3",
      pulls: 1,
      pending: "",
      behind: 0,
      throttles: 0,
    });
    expect(at("moved")).toEqual(
      expect.objectContaining({
        state: "PAUSED",
        context: expect.objectContaining({ head: "h1" }),
        memory: { pulled: "a1b2c3", pulls: 1, pending: "h1", behind: 1, throttles: 0 },
      }),
    );
  });

  it("Turn R22: a second pause shows no new commit for a head the editor already pulled while watching", async () => {
    const run = await played(pullRepaused);

    expect(run.checkpoints.repaused.read(autoPull)).toEqual(
      expect.objectContaining({
        state: "PAUSED",
        memory: { pulled: "h1", pulls: 2, pending: "", behind: 0, throttles: 0 },
      }),
    );
  });

  it("Compile R4: a reaction written in a state's body is refused there: only the root declares onContext", () => {
    expect(refusal(pausedPull)).toEqual([["InvalidConfiguration", "states.PAUSED.onContext"]]);
  });
});
