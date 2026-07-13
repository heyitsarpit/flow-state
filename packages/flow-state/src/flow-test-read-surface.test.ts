import { describe, expect, it } from "vite-plus/test";

import * as flow from "./index.js";
import { createFlowTestReadSurface } from "./testing/flow-test-read-surface.js";

describe("flow test read surface", () => {
  it("keeps noncanonical transaction lookalikes out of transaction event projections", () => {
    const machine = flow.machine<{}, Readonly<{ readonly type: "SAVE" }>, "idle">({
      id: "flow-test.read-surface.machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
      },
    });

    const snapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      transactions: {
        "trace.transaction": {
          id: "trace.transaction",
          status: "success" as const,
          value: { ok: true as const },
        },
      },
      receipts: [
        {
          type: "transaction:start",
          id: "trace.transaction",
          generation: 1,
          trigger: "event" as const,
          queueKey: "trace.transaction.scope",
          startedAt: 10,
          parentState: "idle",
          correlationId: "flow-test.read-surface.machine:event:1",
        },
        {
          type: "transaction:custom",
          id: "trace.transaction",
          parentState: "idle",
          correlationId: "flow-test.read-surface.machine:event:1",
        },
        {
          type: "transaction:success",
          id: "trace.transaction",
          generation: 1,
          queueKey: "trace.transaction.scope",
          startedAt: 10,
          endedAt: 15,
          durationMillis: 5,
          parentState: "idle",
          correlationId: "flow-test.read-surface.machine:event:1",
        },
        {
          type: "transaction:custom:failure",
          id: "trace.transaction",
          parentState: "idle",
          correlationId: "flow-test.read-surface.machine:event:1",
        },
      ],
    });

    const readSurface = createFlowTestReadSurface({
      currentSnapshot: () => snapshot,
      currentIssues: () => [],
      currentTransactions: () => snapshot.transactions,
      currentTimerSnapshots: () => ({}),
      currentStreamSnapshots: () => ({}),
      cache: {
        query: () => undefined,
      },
    });

    expect(
      readSurface
        .transactions()
        .events("trace.transaction")
        .map((receipt) => receipt.type),
    ).toEqual(["transaction:start", "transaction:success"]);
  });
});
