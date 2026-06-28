import { describe, expect, it } from "vite-plus/test";

import { flow, flowExperimental } from "./index.js";

describe("flowExperimental trace reports", () => {
  it("captures receipt categories and preserves replay lanes deterministically", () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "ADVANCE" }>,
      "idle"
    >({
      id: "flow-trace.machine",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {},
      },
    });

    const snapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      receipts: [
        { type: "machine:event", id: machine.id, eventType: "ADVANCE" },
        { type: "machine:transition", id: machine.id, from: "idle", to: "idle" },
        { type: "resource:patch", id: "trace.resource" },
        { type: "transaction:success", id: "trace.transaction.success" },
        { type: "transaction:failure", id: "trace.transaction.failure", error: "denied" },
        { type: "transaction:defect", id: "trace.transaction.defect", cause: "boom" },
        { type: "stream:done", id: "trace.stream.success" },
        { type: "child:interrupt", id: "trace.child.interrupt" },
        { type: "timer:interrupt", id: "trace.timer.interrupt" },
        { type: "actor:start", id: "trace.actor" },
        { type: "domain:custom", id: "trace.domain" },
      ],
    });

    const trace = flowExperimental.captureTrace(snapshot, { includeSnapshots: true });
    const replay = flowExperimental.replayTrace(machine, trace);
    const replayAgain = flowExperimental.replayTrace(machine, trace);

    expect(trace.kind).toBe("trace");
    expect(trace.receipts).toEqual(snapshot.receipts);
    expect(trace.report.events.map((receipt) => receipt.type)).toEqual(["machine:event"]);
    expect(trace.report.transitions.map((receipt) => receipt.type)).toEqual(["machine:transition"]);
    expect(trace.report.resources.map((receipt) => receipt.type)).toEqual(["resource:patch"]);
    expect(trace.report.transactions.map((receipt) => receipt.type)).toEqual([
      "transaction:success",
      "transaction:failure",
      "transaction:defect",
    ]);
    expect(trace.report.streams.map((receipt) => receipt.type)).toEqual(["stream:done"]);
    expect(trace.report.children.map((receipt) => receipt.type)).toEqual(["child:interrupt"]);
    expect(trace.report.timers.map((receipt) => receipt.type)).toEqual(["timer:interrupt"]);
    expect(trace.report.actors.map((receipt) => receipt.type)).toEqual(["actor:start"]);
    expect(trace.report.other.map((receipt) => receipt.type)).toEqual(["domain:custom"]);

    expect(replay.kind).toBe("replay");
    expect(replay.receipts).toEqual(trace.receipts);
    expect(replay.report).toEqual(trace.report);
    expect(replayAgain.report).toEqual(replay.report);
    expect(replay.report.lanes.success.map((receipt) => receipt.type)).toEqual([
      "transaction:success",
      "stream:done",
    ]);
    expect(replay.report.lanes.failure.map((receipt) => receipt.type)).toEqual([
      "transaction:failure",
    ]);
    expect(replay.report.lanes.defect.map((receipt) => receipt.type)).toEqual([
      "transaction:defect",
    ]);
    expect(replay.report.lanes.interrupt.map((receipt) => receipt.type)).toEqual([
      "child:interrupt",
      "timer:interrupt",
    ]);
  });
});
