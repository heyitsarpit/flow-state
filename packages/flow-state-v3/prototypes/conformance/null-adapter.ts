// No runtime. The suite's red run: every read is empty, so a scenario fails on an expectation, or on its whole output (D132). The whole `Instance`, so it does not fail by `TypeError`.
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
  module: () => undefined,
  peakDeliveriesInMail: () => 0,
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
// It writes nothing, so its codec knows nothing.
export const port: Port = {
  boot: () => nothing,
  disk: { kind: () => "other", scope: () => undefined, heads: () => [], parked: () => [], decode: (_k, v) => JSON.parse(v), leaves: () => undefined },
};
