// Planted violations for timers-decided, run through oxlint with the options vite.config.ts gives it.
// Run: node --experimental-strip-types tools/flow-state-lint/rules/timers-decided.test.ts
import { plantRules } from "./test-support.ts";

plantRules({
  "timers-decided": {
    fires: [
      "const kept = { ...Other, schedules: Other.timers };",
      "const fired = { ...Other, schedules: new Map(Other.timers).set('t', Other) };",
      "const named = { ...Other, 'schedules': Other.timers };",
      "Other.schedules = new Map();",
      "Other.schedules.set('t', Other);",
      "Other.schedules.delete('t');",
      "const copy = new Map(Other.schedules);",
    ],
    quiet: [
      "const minted = { ...Other, schedules: new Map() };",
      "const record = { ...Other, schedules: [] };",
      "const saved = { format: 5, schedules: Other.timers };",
      "const read = Other.schedules.get('t');",
      "const Fields = Schema.Struct({ ...Other, schedules: Other.timers });",
    ],
    silent: [
      "tests/planted.ts",
      "fixtures/planted.ts",
      "bench/planted.ts",
      "src/core/planted.test.ts",
      "src/core/test/planted.ts",
      "src/host/planted.test.ts",
    ],
  },
});

console.log("flow-state timers-decided tests passed");
