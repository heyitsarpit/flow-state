// Planted violations for owners-only, run through oxlint with the options vite.config.ts gives it: it
// fires in the host, and stays silent in the Owners module, the test tooling, the platform and tests.
// Run: node --experimental-strip-types tools/flow-state-lint/rules/owners-only.test.ts
import assert from "node:assert/strict";
import { join } from "node:path";

import { inWorkdir, plantRules } from "./test-support.ts";

const fires = [
  "Effect.forkDetach(Effect.void);",
  "Effect.runForkWith(Other);",
  "Effect.timeoutOption(Effect.void, 1);",
  "Effect.raceFirst(Effect.void, Effect.void);",
  "FiberMap.make();",
  "FiberSet.make();",
  "Fiber.interrupt(Other);",
  "Cause.hasInterruptsOnly(Other);",
  "Cause.findErrorOption(Other);",
  "Exit.isFailure(Other);",
  "Other.interruptUnsafe();",
];

const quiet = [
  "Effect.forEach([], () => Effect.void);",
  "Fiber.await(Other);",
  "Cause.combine(Other, Other);",
  "Exit.isSuccess(Other);",
];

plantRules({
  "owners-only": {
    fires,
    quiet,
    silent: [
      "src/core/planted.ts",
      "src/core/deep/planted.ts",
      "src/host/platform/planted.ts",
      "tests/planted.ts",
      "fixtures/planted.ts",
      "bench/planted.ts",
      "src/core/planted.test.ts",
      "src/core/test/planted.ts",
      "src/host/planted.test.ts",
    ],
  },
});

// The Owners module and the test tooling may do what the rule refuses elsewhere in the host.
inWorkdir(({ pkg, write, lint, lines }) => {
  const files = ["src/host/owners/owners.ts", "src/host/testing/clock.ts"].map((path) => join(pkg, path));

  for (const file of files) write(file, `${fires.join("\n")}\n`);

  const found = lint();

  for (const file of files) assert.deepEqual(lines(found, file, "owners-only"), [], file);
});

console.log("flow-state owners-only tests passed");
