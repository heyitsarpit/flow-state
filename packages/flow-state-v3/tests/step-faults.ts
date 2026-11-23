import type { Fault } from "./faults.ts";

/**
 * Wrong step operations: an index out of step with its facts, a step that misses a changed
 * identity, a kept world written by a later step, and a SlowWork report that is missed, made up at
 * the budget, or given in production.
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
  {
    name: "owned-ending-routed-current",
    tests: ["tests/write-lanes/payment-late-answers.test.ts"],
    says: "an ending of work an activation owns is heard from the active leaf after that activation was left",
    rule: "Turn R20",
    edits: [
      {
        file: "src/core/serve.ts",
        find: "            incarnation.activations.includes(activation)\n",
        replace: "            incarnation.activations.length >= 0\n",
      },
    ],
  },
  {
    name: "slow-work-missed",
    tests: ["src/host/slow-work.test.ts"],
    says: "a step slower than the budget is never reported",
    rule: "Diagnostics SlowWork",
    edits: [
      {
        file: "src/host/driver.ts",
        find: "(ms) => ms > budgetMs,",
        replace: "(ms) => ms > budgetMs * 1000,",
      },
    ],
  },
  {
    name: "slow-work-at-budget",
    tests: ["src/host/slow-work.test.ts"],
    says: "a step that takes exactly the budget is reported slow",
    rule: "Diagnostics SlowWork",
    edits: [
      {
        file: "src/host/driver.ts",
        find: "(ms) => ms > budgetMs,",
        replace: "(ms) => ms >= budgetMs,",
      },
    ],
  },
  {
    name: "slow-work-in-production",
    tests: ["src/host/slow-work.test.ts"],
    says: "the production host times every step",
    rule: "Diagnostics SlowWork",
    edits: [
      {
        file: "src/host/platform/browser.ts",
        find: "      workClock: Option.none(),",
        replace: "      workClock: Option.some(() => performance.now()),",
      },
    ],
  },
];
