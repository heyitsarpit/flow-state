import * as flowState from "./index.js";
import * as flowInspect from "./inspect.js";
import * as flowTesting from "./testing.js";
import { describe, expect, it } from "vite-plus/test";

const docsSources = import.meta.glob("../../../apps/docs/src/pages/reference/*.{md,mdx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function requireDoc(path: string): string {
  const source = docsSources[path];
  expect(source).toBeDefined();
  if (!source) {
    throw new Error(`Missing ${path} source`);
  }

  return source;
}

describe("inspection docs architecture", () => {
  it("documents inspect as separate machine-analysis and live-runtime sub-surfaces", () => {
    const inspectionSource = requireDoc("../../../apps/docs/src/pages/reference/inspection.md");
    const apiSource = requireDoc("../../../apps/docs/src/pages/reference/api.mdx");
    const statusSource = requireDoc("../../../apps/docs/src/pages/reference/status.mdx");

    expect(inspectionSource).toContain("two sub-surfaces shipped from");
    expect(inspectionSource).toContain("## Supported Today");
    expect(inspectionSource).toContain("## Start With Three Questions");
    expect(inspectionSource).toContain("## Still Partial Or Future");
    expect(inspectionSource).toContain("## Machine Analysis Surface");
    expect(inspectionSource).toContain("## Live Runtime Inspection Surface");
    expect(apiSource).toContain("Machine analysis and live runtime inspection helpers.");
    expect(statusSource).toContain("`flow-state/inspect`");
    expect(statusSource).toContain("local CLI proof surfaces are real");
  });

  it("keeps the renamed analysis surface and omits the old replayTrace export", () => {
    expect(Object.keys(flowInspect)).toContain("analyzeTrace");
    expect(Object.keys(flowInspect)).toContain("graphOf");
    expect(Object.keys(flowInspect)).not.toContain("replayTrace");
  });

  it("keeps inspect helpers out of the root package entrypoint", () => {
    expect(Object.keys(flowState)).not.toContain("analyzeTrace");
    expect(Object.keys(flowState)).not.toContain("attachInspectionSink");
    expect(Object.keys(flowState)).not.toContain("createLocalInspectionProof");
    expect(Object.keys(flowState)).not.toContain("graphOf");
  });

  it("documents and preserves the cross-package inspection split", () => {
    const inspectionSource = requireDoc("../../../apps/docs/src/pages/reference/inspection.md");

    expect(inspectionSource).toContain("## Cross-Package Ownership");
    expect(inspectionSource).toContain("`flow.runtime(...).inspection`");
    expect(inspectionSource).toContain("`runtime.resources.inspect()`");
    expect(inspectionSource).toContain(
      "`flow-state/testing` via `runFlowStory(...)` and `test.model(machine)`",
    );
    expect(inspectionSource).toContain("`flow.module(...)`, `flow.app(...)`, and `App.layer(...)`");
    expect(Object.keys(flowInspect)).toContain("storyToDoc");
    expect(Object.keys(flowInspect)).not.toContain("runFlowStory");
    expect(Object.keys(flowTesting)).toContain("runFlowStory");
    expect(Object.keys(flowTesting)).toContain("test");
    expect(Object.keys(flowState)).toContain("runtime");
    expect(Object.keys(flowState)).toContain("app");
    expect(Object.keys(flowState)).toContain("module");
  });

  it("prefers promoted subsystem facts over parallel inspect-only state", () => {
    const inspectionSource = requireDoc("../../../apps/docs/src/pages/reference/inspection.md");

    expect(inspectionSource).toContain("## Prefer Promoted Facts Over Parallel Inspect State");
    expect(inspectionSource).toContain("`runtime.resources.inspect()`");
    expect(inspectionSource).toContain("`test.model(machine)`");
    expect(inspectionSource).toContain("`runFlowStory(...)`");
    expect(inspectionSource).toContain("`runtime.dehydrateBoot()`");
    expect(inspectionSource).toContain("`runtime.hydrateBoot(...)`");
    expect(inspectionSource).toContain("`actor:restore` and `resource:hydrate`");
    expect(inspectionSource).toContain("`moduleId`, `appId`, and owner paths");
    expect(Object.keys(flowInspect)).toContain("flowStories");
    expect(Object.keys(flowInspect)).toContain("summarizeTrace");
    expect(Object.keys(flowState)).toContain("runtime");
    expect(Object.keys(flowTesting)).toContain("runFlowStory");
  });

  it("routes users from inspect outputs to happened, why, and reproduce flows", () => {
    const inspectionSource = requireDoc("../../../apps/docs/src/pages/reference/inspection.md");

    expect(inspectionSource).toContain("What happened?");
    expect(inspectionSource).toContain("`captureTrace(...)`, `summarizeTrace(...)`");
    expect(inspectionSource).toContain("Why did it happen?");
    expect(inspectionSource).toContain("`analyzeTrace(...)`, `whyNoTransition(...)`");
    expect(inspectionSource).toContain("How do I reproduce it?");
    expect(inspectionSource).toContain(
      "`flowStories(...)`, `runFlowStory(...)`, `test.model(machine)`",
    );
    expect(inspectionSource).toContain("local proof and CLI commands");
  });
});
