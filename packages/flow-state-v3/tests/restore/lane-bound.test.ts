import { Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { SerializeMachine } from "../../fixtures/lanes/machine.ts";
import { lanesStory } from "../../fixtures/lanes/stories.ts";
import { Git } from "../../fixtures/sync/server.ts";
import type { Cut, StoryRun } from "../../src/host/testing/index.ts";
import { actorRef } from "../../src/index.ts";
import { checked } from "../rules/rules.ts";

const BYTES = 2_097_152;

// Client names one to ten characters long: a name's length moves the record's size byte by byte.
const NAMES = [
  "m",
  "mx",
  "mxx",
  "mxxx",
  "mxxxx",
  "mxxxxx",
  "mxxxxxx",
  "mxxxxxxx",
  "mxxxxxxxx",
  "mxxxxxxxxx",
] as const;

type Name = (typeof NAMES)[number];

// The one lane record a cut holds, as text.
const laneText = (cut: Cut) =>
  [...cut.records.stored].find(([key]) => key.startsWith("lane/"))?.[1] ?? "";

// A serialize client named `name`, its sync held on the wire, then `count` commits of one
// repository of `length` characters, all on one lane.
const filled = (name: Name, length: number, count: number) =>
  Array.from({ length: count }).reduce(
    (s: ReturnType<typeof lanesStory>) =>
      s.send(actorRef(SerializeMachine, name), { _tag: "Commit", repo: "r".repeat(length) }),
    lanesStory(`lane-bound/${name}-${length}-${count}`)
      .ensure(actorRef(SerializeMachine, name))
      .world(Git.sync.hold()),
  );

// The client and repository length whose ten commits make a lane record of exactly `target` bytes
// as the last one is queued, measured from lanes of two and three commits.
const exactly = async (target: number) => {
  const sized = async (count: number) =>
    laneText((await filled("m", 100_000, count).checkpoint("full").run()).checkpoints.full).length;

  const three = await sized(3);
  const perCommit = three - (await sized(2));
  const length = 100_000 + Math.floor((target - three - 7 * perCommit) / 10);
  const slack = target - (three + 7 * perCommit + 10 * (length - 100_000));

  return { name: NAMES[slack] ?? "m", length };
};

// A commit on another repository of the same client: it is sent and ends at once unless the
// identity's writes are held back.
const other = { _tag: "Commit", repo: "other" } as const;

const otherLane = (cut: Cut) =>
  cut.inspection.lanes.filter((l) => Option.getOrElse(l.key, () => "").includes("other"));

const ended = (run: StoryRun) =>
  run.evidence.flatMap((e) => (e._tag === "Ended" ? [`${e.channel} ${e.reason}`] : []));

describe("a lane record filled to its byte bound (Codec R1, R4; WriteAhead I21)", () => {
  it("WriteAhead I21: a lane record exactly at the bound when its last commit is queued never withholds its identity when its head goes Held", async () => {
    const { name, length } = await exactly(BYTES);
    const client = actorRef(SerializeMachine, name);

    // The head's answer is lost, so it goes Held and its record reads inFlight false.
    const run = checked(
      await filled(name, length, 10)
        .world(Git.sync.lose())
        .send(client, other)
        .advance("1 second")
        .checkpoint("held")
        .send(client, { _tag: "Cancel", repo: "r".repeat(length) })
        .advance("1 second")
        .checkpoint("after")
        .run(),
    );

    // Every commit ends once, sent in turn or declined at once, and the identity is never withheld
    // (the run rules).
    expect(otherLane(run.checkpoints.held)).toEqual([]);
    expect(ended(run).length).toBe(11);
    expect(run.checkpoints.after.inspection.lanes).toEqual([]);
  });

  it("WriteAhead I21: a lane record a byte under the bound never withholds its identity when its Held head's retry count gains a digit", async () => {
    const { name, length } = await exactly(BYTES - 1);
    const client = actorRef(SerializeMachine, name);
    const repo = "r".repeat(length);

    // Ten re-sends of the Held head, each answer lost: its retry count reaches 10.
    const retried = Array.from({ length: 10 }).reduce(
      (s: ReturnType<typeof filled>) =>
        s.world(Git.sync.hold()).send(client, { _tag: "Retry", repo }).world(Git.sync.lose()),
      filled(name, length, 10).world(Git.sync.lose()),
    );

    const run = checked(
      await retried
        .checkpoint("retried")
        .send(client, other)
        .advance("1 second")
        .checkpoint("held")
        .send(client, { _tag: "Cancel", repo })
        .advance("1 second")
        .checkpoint("after")
        .run(),
    );

    expect(run.checkpoints.retried.inspection.lanes).toEqual([
      expect.objectContaining({ retryCount: 10 }),
    ]);
    // Every commit and every re-send that went out ends once (WriteLanes R10).
    expect(otherLane(run.checkpoints.held)).toEqual([]);
    expect(ended(run).length).toBe(21);
    expect(run.checkpoints.after.inspection.lanes).toEqual([]);
  });
});
