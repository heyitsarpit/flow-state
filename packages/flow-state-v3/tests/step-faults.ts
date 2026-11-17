import type { Fault } from "./faults.ts";

/**
 * Wrong step operations: an index out of step with its facts, a step that misses a changed
 * identity, and a kept world written by a later step.
 */
export const stepFaults: ReadonlyArray<Fault> = [
  {
    name: "lane-wait-unindexed",
    tests: ["tests/stories/fake.test.ts"],
    says: "a lane whose head goes on the wire is not found by its call, so its answer is lost",
    rule: "Turn realization",
    edits: [
      {
        file: "src/core/tx.ts",
        find: '    for (const wait of Option.toArray(waitOf(lane))) draft("laneOfWait").set(wait, id);',
        replace: "",
      },
    ],
  },
  {
    name: "lane-unindexed-by-actor",
    tests: ["tests/stories/fake.test.ts"],
    says: "a new lane is not listed under its identity, so its turn's end never reaches it",
    rule: "Turn realization",
    edits: [
      {
        file: "src/core/tx.ts",
        find: '    if (before === undefined) addTo("lanesOfActor", key, id);',
        replace: "    if (before === undefined) void addTo;",
      },
    ],
  },
  {
    name: "released-use-not-judged",
    tests: ["tests/actors/lifetime.test.ts"],
    says: "a released use is not seen by the step's graces, so a free actor never ends",
    rule: "Actors R8",
    edits: [
      {
        file: "src/core/tx.ts",
        find: '    draft("uses").set(key, uses);\n    dirty.add(key);',
        replace: '    draft("uses").set(key, uses);',
      },
    ],
  },
  {
    name: "cut-world-not-retained",
    tests: ["tests/write-lanes/payment-endings.test.ts"],
    says: "a checkpoint's world is written by the steps after it, so its reads show a later state",
    rule: "Testing O1",
    edits: [
      {
        file: "src/host/testing/run.ts",
        find: "    retain(world);\n",
        replace: "",
      },
    ],
  },
];
