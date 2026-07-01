import * as flowInspect from "./inspect.js";
import { describe, expect, it } from "vite-plus/test";

const docsSources = import.meta.glob("../../../apps/docs/src/pages/reference/{api,inspection}.md", {
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

    expect(inspectionSource).toContain("two sub-surfaces shipped from");
    expect(inspectionSource).toContain("## Machine Analysis Surface");
    expect(inspectionSource).toContain("## Live Runtime Inspection Surface");
    expect(apiSource).toContain("Machine analysis and live runtime inspection helpers.");
  });

  it("keeps the renamed analysis surface and omits the old replayTrace export", () => {
    expect(Object.keys(flowInspect)).toContain("analyzeTrace");
    expect(Object.keys(flowInspect)).toContain("graphOf");
    expect(Object.keys(flowInspect)).not.toContain("replayTrace");
  });
});
