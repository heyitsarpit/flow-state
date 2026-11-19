// Planted violations for the six ban rules, run through oxlint with the options vite.config.ts gives
// each rule. Every rule must fire inside the package, stay silent in each exception folder, catch the
// `globalThis`, `global` and `window` forms, and ignore type positions.
// Run: node --experimental-strip-types tools/flow-state-lint/rules/bans.test.ts
import { plantRules } from "./test-support.ts";

plantRules({
  "no-json-stringify": {
    fires: ["JSON.stringify(1);", "globalThis.JSON.stringify(1);", "global.JSON.stringify(1);"],
    quiet: ["JSON.parse('1');", "const stringify = 1;"],
    silent: [],
  },
  "no-entropy": {
    fires: [
      "Math.random();",
      "globalThis.Math.random();",
      "crypto.randomUUID();",
      "globalThis.crypto;",
      "window.crypto;",
    ],
    quiet: ["type C = typeof Math;", "const random = 1;"],
    silent: ["src/host/platform/planted.ts"],
  },
  "no-clock": {
    fires: ["Date.now();", "new Date();", "performance.now();", "globalThis.Date;", "global.performance;"],
    quiet: ["export const d: Date = Object.create(null);", "type D = Date;"],
    silent: ["src/host/platform/planted.ts", "bench/planted.ts"],
  },
  "no-timers": {
    fires: [
      "setTimeout(() => 1, 1);",
      "clearTimeout(1);",
      "setInterval(() => 1, 1);",
      "queueMicrotask(() => 1);",
      "globalThis.setTimeout;",
      "global.setInterval;",
      "window.queueMicrotask;",
    ],
    quiet: ["type T = ReturnType<typeof setTimeout>;"],
    silent: ["src/host/platform/planted.ts", "bench/planted.ts"],
  },
  "no-host-apis": {
    fires: [
      "window;",
      "document;",
      "navigator;",
      "indexedDB;",
      "localStorage;",
      "sessionStorage;",
      "globalThis.localStorage;",
      "global.document;",
    ],
    quiet: ["type W = Window;", "const document2 = 1;"],
    silent: ["src/host/planted.ts", "src/host/platform/planted.ts", "src/host/planted.test.ts"],
  },
  "no-effect-runtime": {
    fires: [
      "Effect.gen(function* () {});",
      "Effect.runSync(Effect.void);",
      "Effect.runPromise(Effect.void);",
      "Effect.runFork(Effect.void);",
      "Effect.try(() => 1);",
      "Effect.tryPromise(() => Promise.resolve(1));",
      "Promise.resolve(1);",
      "globalThis.Promise;",
      "E.gen(function* () {});",
      "Fx.runSync(Effect.void);",
      "Pkg.Effect.runSync(Effect.void);",
    ],
    quiet: ["export type P = Promise<number>;", "Effect.succeed(1);", "Other.gen();"],
    silent: [
      "src/host/planted.ts",
      "src/host/platform/planted.ts",
      "src/core/planted.test.ts",
      "src/core/test/planted.ts",
      "src/host/planted.test.ts",
      "tests/planted.ts",
      "fixtures/planted.ts",
      "bench/planted.ts",
    ],
  },
});

console.log("flow-state ban rule tests passed");
