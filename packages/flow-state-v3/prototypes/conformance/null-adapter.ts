// No runtime. The suite's red run: every read is empty, so every scenario fails on its first expectation.
import type { Harness } from "./harness.ts";

export const makeHarness = (): Harness => ({
  start() {},
  do() {},
  read: {
    state: () => undefined,
    memory: () => undefined,
    row: () => undefined,
    requests: () => [],
    truth: () => ({ charges: 0, chargedKeys: [], acked: [], placed: 0, voided: 0 }),
    frames: () => [],
    issues: () => [],
    evidence: () => [],
    stored: () => new Map(),
    quiet: () => ({ idle: true, waits: [] }),
    replay: () => ({ same: true }),
  },
});
