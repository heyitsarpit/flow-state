// No runtime. The suite's red run: every read is empty, so a scenario fails on its first expectation.
import type { Instance, Port } from "./harness.ts";

const nothing: Instance = {
  ensure() {},
  send() {},
  dispose() {},
  disposeRuntime() {},
  repeatLastCompletion() {},
  pending: () => false,
  live: () => 0,
  logLength: () => 0,
  state: () => undefined,
  memory: () => undefined,
  inner: () => undefined,
  row: () => undefined,
  record: () => undefined,
  waits: () => [],
  fatal: () => false,
  frames: () => [],
  stateText: (o) => o,
  replay: () => ({ same: true }),
  subscribe() {},
};
export const port: Port = { boot: () => nothing };
