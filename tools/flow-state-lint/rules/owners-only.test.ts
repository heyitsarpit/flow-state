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
  "Fx.forkDetach(Effect.void);",
  "E.runFork(Effect.void);",
  "Pkg.Effect.forkChild(Effect.void);",
  "const { forkDetach } = Effect;",
  "Effect.runCallback(Effect.void);",
  // Every runner: a fiber started outside an Owner is one no Owner holds.
  "Effect.runPromise(Effect.void);",
  "Effect.runSync(Effect.void);",
  "Effect.runFork(Effect.void);",
  "Effect.runPromiseExit(Effect.void);",
  // Aliases, casts and keys known before running.
  "const Alias = Effect; Alias.forkDetach(Effect.void);",
  "let Later = Other; Later = Effect; Later.forkDetach(Effect.void);",
  "const AliasPkg = Pkg; AliasPkg.Effect.forkDetach(Effect.void);",
  "const { Effect: Picked } = Pkg; Picked.runSync(Effect.void);",
  "(Effect as any).forkDetach(Effect.void);",
  "(Effect satisfies object).forkDetach(Effect.void);",
  "Effect[`forkDetach`](Effect.void);",
  'Effect["forkDetach"](Effect.void);',
  // A key known only at run time may be any banned member; so may a rest pattern.
  "Effect[String(Other)](Effect.void);",
  "const { ...everything } = Effect;",
  // Imports and exports that reach a watched module under another name.
  'import { default as Whole } from "effect/Effect"; Whole.forkDetach(Effect.void);',
  'import Def from "effect/Effect"; Def.runFork(Effect.void);',
  'import { forkDaemon as inner } from "effect/internal/effect";',
  'void import("effect/Effect");',
  'void import("effect");',
  'export { forkDetach } from "effect/Effect";',
  'export { default as Reexported } from "effect/Effect";',
  'export * from "effect/Effect";',
  // Cause reads: through a combinator, an Exit's match, a print or a reason test.
  "Effect.catchCause(Effect.void, () => Effect.void);",
  "Effect.tapCause(Effect.void, () => Effect.void);",
  "Effect.onExit(Effect.void, () => Effect.void);",
  "Effect.sandbox(Effect.void);",
  "Exit.match(Other, { onFailure: () => 1, onSuccess: () => 2 });",
  "Cause.pretty(Other);",
  "Cause.squash(Other);",
  "Cause.isDieReason(Other);",
];

const quiet = [
  "Effect.forEach([], () => Effect.void);",
  "Fiber.await(Other);",
  "Cause.combine(Other, Other);",
  "Exit.isSuccess(Other);",
  "Effect.exit(Effect.void);",
  "Effect.onInterrupt(Effect.void, () => Effect.void);",
  "Cause.fail(Other);",
  "Exit.fail(Other);",
  "const Same = Other; Same.forkDetach();",
  'Effect["forEach"]([], () => Effect.void);',
  'void import("node:path");',
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

  // A member imported bare from its module is refused at the import, under any local name.
  const bare = join(pkg, "src/host/bare.ts");
  write(bare, 'import { forkDetach as detached, forEach } from "effect/Effect";\nexport { detached, forEach };\n');

  const found = lint();

  for (const file of files) assert.deepEqual(lines(found, file, "owners-only"), [], file);
  assert.deepEqual(lines(found, bare, "owners-only"), [1], bare);
});

console.log("flow-state owners-only tests passed");
