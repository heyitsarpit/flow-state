import { describe, expect, it } from "vite-plus/test";

const docsSources = {
  ...(import.meta.glob("../../../apps/docs/src/pages/guide/*.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../../../apps/docs/src/pages/reference/*.{md,mdx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../../../apps/docs/src/pages/getting-started.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../../../apps/docs/src/pages/index.mdx", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../../../apps/docs/src/pages/concepts.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
};

function requireDoc(path: string): string {
  const source = docsSources[path];
  expect(source).toBeDefined();
  if (!source) {
    throw new Error(`Missing ${path} source`);
  }
  return source;
}

describe("status docs architecture", () => {
  it("routes high-level docs back through the curated status contract", () => {
    const apiSource = requireDoc("../../../apps/docs/src/pages/reference/api.mdx");
    const runtimeSource = requireDoc("../../../apps/docs/src/pages/reference/runtime.md");
    const inspectionSource = requireDoc("../../../apps/docs/src/pages/reference/inspection.md");
    const gettingStartedSource = requireDoc("../../../apps/docs/src/pages/getting-started.md");
    const conceptsSource = requireDoc("../../../apps/docs/src/pages/concepts.md");
    const homeSource = requireDoc("../../../apps/docs/src/pages/index.mdx");

    expect(apiSource).toContain("[Supported Today](/reference/status)");
    expect(runtimeSource).toContain("[Current Status](/reference/status)");
    expect(inspectionSource).toContain("[Supported Today](/reference/status)");
    expect(gettingStartedSource).toContain("[Current Status](/reference/status)");
    expect(conceptsSource).toContain("[Current Status](/reference/status)");
    expect(homeSource).toContain("[Current Status](/reference/status)");
  });

  it("keeps app-validation claims selective instead of implying broad duplicate-id coverage", () => {
    const statusSource = requireDoc("../../../apps/docs/src/pages/reference/status.mdx");
    const apiSource = requireDoc("../../../apps/docs/src/pages/reference/api.mdx");

    expect(statusSource).toContain("dependency and cycle validation plus duplicate");
    expect(statusSource).toContain("module ids and duplicate resource ids across modules");
    expect(statusSource).toContain("not every cross-module");
    expect(statusSource).toContain("descriptor collision is checked");
    expect(apiSource).toContain("selective duplicate module or");
    expect(apiSource).not.toContain("duplicate-id validation");
  });

  it("keeps the public surface separate from package helpers and maintained recipe evidence", () => {
    const statusSource = requireDoc("../../../apps/docs/src/pages/reference/status.mdx");

    expect(statusSource).toContain("## Public Surface Boundaries");
    expect(statusSource).toContain("families `behavior`, `story`, and `trace`");
    expect(statusSource).toContain("`flow-state/testing`");
    expect(statusSource).toContain("`flow-state/inspect`");
    expect(statusSource).toContain("`packages/flow-state/scripts/**`");
    expect(statusSource).not.toContain("examples/launch-workspace");
  });
});
