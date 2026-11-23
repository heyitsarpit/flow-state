import type { Fault } from "./faults.ts";

/**
 * Faults of operation endings, read entries, placements and persisted resources, each caught by
 * its own target tests. Each edits the code that owns its rule; when that code moves, a fault keeps
 * its test and takes a new `find` there.
 */
export const readsFaults: ReadonlyArray<Fault> = [
  {
    name: "retryable-ignores-count",
    tests: ["tests/chat/endings.test.ts"],
    says: "a guard's lane view reads a Held head's resends as none, so `retryable` never declines",
    rule: "Operations R15",
    edits: [
      {
        file: "src/core/lanes.ts",
        find: "LaneView.Held({ retryCount: l.head.retryCount })",
        replace: "LaneView.Held({ retryCount: 0 })",
      },
    ],
  },
  {
    name: "attempt-id-without-seed",
    tests: ["tests/chat/keys.test.ts"],
    says: "an Attempt id is minted from the count alone, so a boot mints ids an earlier boot used",
    rule: "Operations R1, I16",
    edits: [
      {
        file: "src/core/tx.ts",
        find: "`att-${env.seed}-${world.attempts}`",
        replace: "`att-${world.attempts}`",
      },
    ],
  },
];
