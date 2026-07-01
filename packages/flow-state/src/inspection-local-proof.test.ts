import { describe, expect, it } from "vite-plus/test";

import { captureTrace, createLocalInspectionProof } from "./inspect.js";
import { flow } from "./index.js";

describe("local inspection proof", () => {
  it("collects actor tree, event timeline, correlations, and trace export for local proofing", async () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "START" }>,
      "idle" | "running"
    >({
      id: "inspection.local-proof.machine",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            START: {
              target: "running",
              update: ({ context }) => ({ count: context.count + 1 }),
            },
          },
        },
        running: {},
      },
    });

    const runtime = flow.runtime(
      flow.app({ modules: [] }).layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );
    const actor = runtime.createActor(machine);

    actor.send({ type: "START" });
    await actor.flush();

    const eventTimeline = runtime.inspection.entries();
    const trace = captureTrace(actor.snapshot(), {
      includeSnapshots: true as const,
    });
    const proof = createLocalInspectionProof(trace, eventTimeline);

    expect(proof.kind).toBe("local-inspection-proof");
    expect(proof.machineId).toBe(machine.id);
    expect(proof.actorTree).toEqual(trace.actorHierarchy);
    expect(proof.eventTimeline).toEqual(eventTimeline);
    expect(proof.correlations).toEqual(trace.report.correlations);
    expect(proof.traceArtifact).toMatchObject({
      kind: "trace-artifact",
      version: "flow-state/trace-artifact.v1",
      snapshot: {
        machineId: machine.id,
        value: "running",
      },
    });
    expect(proof.formatted.eventTimeline).toContain("1. actor:start");
    expect(proof.formatted.eventTimeline).toContain("machine:event");
    expect(proof.formatted.trace).toContain("Actor tree");
    expect(proof.formatted.trace).toContain("Correlation timeline");

    await actor.dispose();
    await runtime.dispose();
  });

  it("defaults to an empty timeline when no live inspection entries are supplied", () => {
    const machine = flow.machine({
      id: "inspection.local-proof.empty",
      initial: "idle",
      context: () => ({ ready: true }),
      states: {
        idle: {},
      },
    });
    const trace = captureTrace(machine.getInitialSnapshot(), {
      includeSnapshots: true as const,
    });
    const proof = createLocalInspectionProof(trace);

    expect(proof.eventTimeline).toEqual([]);
    expect(proof.formatted.eventTimeline).toBe("(no inspection events)");
    expect(proof.traceArtifact.snapshot.machineId).toBe(machine.id);
  });
});
