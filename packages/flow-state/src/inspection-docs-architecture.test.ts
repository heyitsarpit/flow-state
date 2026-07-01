import * as flowState from "./index.js";
import * as flowInspect from "./inspect.js";
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
    const apiSource = requireDoc("../../../apps/docs/src/pages/reference/api.md");
    const statusSource = requireDoc("../../../apps/docs/src/pages/reference/status.mdx");

    expect(inspectionSource).toContain("two sub-surfaces shipped from");
    expect(inspectionSource).toContain("## Supported Today");
    expect(inspectionSource).toContain("## Still Partial Or Future");
    expect(inspectionSource).toContain("## Machine Analysis Surface");
    expect(inspectionSource).toContain("## Live Runtime Inspection Surface");
    expect(apiSource).toContain("Machine analysis and live runtime inspection helpers.");
    expect(statusSource).toContain("`@flow-state/inspect`");
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
});
