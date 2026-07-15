import { describe, expect, it } from "vite-plus/test";

import {
  buildBehaviorContract,
  diffTrace,
  exportTraceArtifact,
  importTraceArtifact,
} from "flow-state/inspect";
import { runFlowScenario, scenarioToReport } from "flow-state/testing";
import {
  formatHarnessTracePretty,
  formatPendingWorkPretty,
  formatScenarioTranscript,
  flowTest,
  test,
} from "flow-state/testing";

import { OfflineApp } from "../app/app";
import { BehaviorGateway, offlineStories } from "../app/behavior";
import { offlineMachine } from "../features/offline/machine";
import { movieResource } from "../features/offline/resources";

describe("offline application evidence", () => {
  it("keeps independent movie identities in separate resource keys", () => {
    expect(movieResource.ref("movie-1").key).toEqual(["offline", "movie", "movie-1"]);
    expect(movieResource.ref("movie-2").key).toEqual(["offline", "movie", "movie-2"]);
  });

  it("starts the recovery actor through the focused actor harness", () => {
    const harness = flowTest(offlineMachine).start();
    expect(harness.state()).toBe("idle");
    expect(harness.snapshot().context.nextQueueId).toBe(1);
  });

  it("publishes bounded coalesced connectivity pressure", () => {
    expect(buildBehaviorContract(BehaviorGateway).streams).toContainEqual({
      id: "offline.connectivity",
      moduleId: "OfflineRecovery",
      hasParams: false,
      pressure: { strategy: "coalesce-latest", limit: 1 },
      routeKinds: ["value", "failure"],
    });
  });

  it("runs the declared story and renders bounded deterministic diagnostics", async () => {
    const story = offlineStories.stories[0];
    if (story === undefined) throw new Error("expected restored-shell story");
    const outcome = await runFlowScenario(OfflineApp, offlineMachine, story);
    const report = scenarioToReport(outcome);
    expect(report.ok).toBe(true);

    const harness = test.app(OfflineApp).scenario(offlineMachine).run();
    const trace = harness.captureTrace({ artifactId: "offline-evidence" });
    expect(formatHarnessTracePretty(trace)).toContain("receipts=");
    expect(formatPendingWorkPretty(harness.pendingWork())).toContain("activeFibers=0");
    expect(formatScenarioTranscript(trace.receipts)).toContain("actor:start");

    const artifact = exportTraceArtifact(trace);
    const imported = importTraceArtifact(artifact);
    expect(imported).toBeDefined();
    if (imported === undefined) throw new Error("expected imported trace artifact");
    expect(diffTrace(trace, imported).summary.matches).toBe(true);
    expect(JSON.stringify(artifact).length < 20_000).toBe(true);
  });
});
