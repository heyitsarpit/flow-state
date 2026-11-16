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

const ended = (run: StoryRun) =>
  run.evidence.flatMap((e) => (e._tag === "Ended" ? [`${e.channel} ${e.reason}`] : []));

describe("a lane record filled to its byte bound (Codec R1, R4; WriteAhead I21)", () => {
  it("WriteAhead I21: a lane record exactly at the bound when its last commit is admitted never grows past it, whatever its head does next", async () => {
    // Measure what one commit adds and what a lane of three weighs, to fill a lane exactly.
    const sized = async (count: number) =>
      laneText((await filled("m", 100_000, count).checkpoint("full").run()).checkpoints.full)
        .length;

    const three = await sized(3);
    const perCommit = three - (await sized(2));

    // Ten commits of `length` characters weigh `three + 7 * perCommit + 10 * (length - 100,000)`;
    // the client's name, one byte a character, takes up the rest.
    const length = 100_000 + Math.floor((BYTES - three - 7 * perCommit) / 10);
    const slack = BYTES - (three + 7 * perCommit + 10 * (length - 100_000));
    const name = NAMES[slack] ?? "m";

    // The head's answer is lost, so it goes Held and its record reads inFlight false.
    const run = checked(
      await filled(name, length, 10)
        .world(Git.sync.lose())
        .send(actorRef(SerializeMachine, name), { _tag: "Cancel", repo: "r".repeat(length) })
        .advance("1 second")
        .checkpoint("after")
        .run(),
    );

    // Every commit ends: those the lane took are sent in turn, and one that could take the record
    // past its bound declines at once.
    expect(ended(run).length).toBe(10);
    expect(ended(run).filter((e) => e === "notSent Unencodable").length).toBeGreaterThan(0);
    expect(run.checkpoints.after.inspection.lanes).toEqual([]);
  });
});
