// Planted violations for no-mark-probe, run through oxlint with the options vite.config.ts gives it.
// Run: node --experimental-strip-types tools/flow-state-lint/rules/no-mark-probe.test.ts
import { plantRules } from "./test-support.ts";

plantRules({
  "no-mark-probe": {
    fires: [
      'Predicate.hasProperty(Other, "~flow");',
      'hasProperty(Other, "~token");',
      'Object.hasOwn(Other, "~owner");',
      '"~payload" in Other;',
      "Predicate.hasProperty(Other, `~walk`);",
    ],
    quiet: ['Predicate.hasProperty(Other, "_tag");', '"_tag" in Other;', 'const mark = "~flow";'],
    silent: [
      "src/core/planted.test.ts",
      "src/core/test/planted.ts",
      "src/host/planted.test.ts",
      "tests/planted.ts",
      "fixtures/planted.ts",
      "bench/planted.ts",
    ],
  },
});

console.log("flow-state no-mark-probe tests passed");
