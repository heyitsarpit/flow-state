// Planted violations for owners-only, run through oxlint with the options vite.config.ts gives it: it
// fires in the host, and stays silent in the Owners module, the test tooling, the platform and tests.
// Run: node --experimental-strip-types tools/flow-state-lint/rules/owners-only.test.ts
import assert from "node:assert/strict";
import { join } from "node:path";

import { imports, inWorkdir, plantRules } from "./test-support.ts";

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
  // Sources the rule cannot follow, refused outright.
  'import Required = require("effect/Effect");',
  'const required = require("effect/Effect");',
  "void import(`effect/Effect`);",
  "void import(String(Other));",
  // Re-exports from the package.
  'export * as Reexport from "effect";',
  'export { Effect as Handed } from "effect";',
  "export { Fx };",
  "export const Exported = Effect;",
  "export default Effect;",
  // A module handed on as a value, where no name follows it.
  'Reflect.get(Effect, "forkDetach");',
  "void { ...Effect };",
  "void [Effect][0];",
  "Other.held = Effect;",
  "void ((Given = Effect) => Given);",
  "void { Effect };",
  "Other.gen(Pkg.Effect);",
  "void Pkg[String(Other)];",
  // A nested pattern taking a module out of the package.
  "const { Effect: { forkDetach: nested } } = Pkg;",
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
  "type Typed = Effect.Effect<Cause.Cause<unknown>>;",
  "type Queried = typeof Effect;",
  "void { Effect: 1, [Other.gen()]: 2 };",
  "void Other.Effect;",
  "class Keyed { Effect = 1; Cause() { return 2; } }",
  "const Same2 = Pkg.Effect.forEach;",
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
  // The CLI is a program of its own, which no Runtime runs.
  const files = ["src/host/owners/owners.ts", "src/host/testing/clock.ts", "src/host/cli/main.ts"].map((path) =>
    join(pkg, path),
  );

  for (const file of files) write(file, `${imports}\n${fires.join("\n")}\n`);

  // A member imported bare from its module is refused at the import, under any local name.
  const bare = join(pkg, "src/host/bare.ts");
  write(bare, 'import { forkDetach as detached, forEach } from "effect/Effect";\nexport { detached, forEach };\n');

  const found = lint();

  for (const file of files) assert.deepEqual(lines(found, file, "owners-only"), [], file);
  assert.deepEqual(lines(found, bare, "owners-only"), [1], bare);
});

// Forms host code could write by accident, each dropping or reading a Cause, or closing a Scope, outside an
// Owner: every line fires. Beside them, the Scope and Cause uses that stay quiet.
const accidental = [
  "Effect.ignoreCause(Effect.void);",
  "Scope.close(Other, Exit.void);",
  "let Late = Other; Late ??= Effect; Late.forkDetach(Effect.void);",
  "let Either = Other; Either ||= Effect; Either.forkDetach(Effect.void);",
  'declare const ended: Exit.Exit<number>; if (ended._tag === "Failure") void ended.cause;',
];

const accidentalQuiet = ["void Scope.make();", "void { cause: Other };", "Scope.provide(Other);"];

inWorkdir(({ pkg, write, lint, lines }) => {
  const file = join(pkg, "src/host/accidental.ts");
  write(file, `${imports}\nimport { Scope } from "effect";\n${[...accidental, ...accidentalQuiet].join("\n")}\n`);

  assert.deepEqual(lines(lint(), file, "owners-only"), [7, 8, 9, 10, 11], "each accidental form fires");
});

console.log("flow-state owners-only tests passed");
