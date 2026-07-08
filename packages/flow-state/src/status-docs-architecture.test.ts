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
  ...(import.meta.glob("../../../examples/launch-workspace/API_INVENTORY.md", {
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
    const gettingStartedSource = requireDoc("../../../apps/docs/src/pages/getting-started.md");
    const ownershipFactsSource = requireDoc(
      "../../../apps/docs/src/pages/guide/ownership-and-runtime-facts.md",
    );

    expect(statusSource).toContain("dependency and cycle validation plus duplicate");
    expect(statusSource).toContain("module ids and duplicate resource ids across modules");
    expect(statusSource).toContain("not every cross-module descriptor collision is checked");
    expect(apiSource).toContain("selective");
    expect(apiSource).toContain("selective duplicate module or");
    expect(apiSource).toContain("resource-id validation");
    expect(apiSource).not.toContain("duplicate-id validation");
    expect(gettingStartedSource).not.toContain("duplicate-id validation");
    expect(gettingStartedSource).toContain("[Current Status](/reference/status)");
    expect(ownershipFactsSource).toContain("selective duplicate module/resource-id validation");
  });

  it("keeps the status page explicit about public surfaces versus narrow and helper-only ones", () => {
    const statusSource = requireDoc("../../../apps/docs/src/pages/reference/status.mdx");

    expect(statusSource).toContain("## Public Surface Boundaries");
    expect(statusSource).toContain("package-owned CLI");
    expect(statusSource).toContain("families `behavior`, `story`, and `trace`");
    expect(statusSource).toContain("`flow-state/testing`");
    expect(statusSource).toContain("`flow-state/inspect`");
    expect(statusSource).toContain("`story run --pending-work`");
    expect(statusSource).toContain("`trace summarize --contextualize`");
    expect(statusSource).toContain("`trace proof`");
    expect(statusSource).toContain("`packages/flow-state/scripts/**`");
    expect(statusSource).toContain("`formatPendingWorkPretty(...)`");
    expect(statusSource).toContain("`examples/launch-workspace`");
    expect(statusSource).toContain("proof-app-owned");
  });

  it("keeps Launch Workspace inventory aligned with executable actor-owned resource commands", () => {
    const inventorySource = requireDoc("../../../examples/launch-workspace/API_INVENTORY.md");

    expect(inventorySource).toContain("Actor-owned ensure descriptor with runtime ResourceStore");
    expect(inventorySource).toContain("Actor-owned observe descriptor with runtime ResourceStore");
    expect(inventorySource).toContain("Actor-owned refresh descriptor with runtime ResourceStore");
    expect(inventorySource).toContain(
      "Actor-owned invalidation by ref, tag, and filter is runtime-real",
    );
    expect(inventorySource).toContain("Actor-owned one-shot timer descriptor");
    expect(inventorySource).not.toContain(
      "| `flow.ensure`             | Project editor loading                                                                                                               | Wired descriptor, runtime contract-only",
    );
    expect(inventorySource).not.toContain(
      "| `flow.observe`            | Project editor comments observer                                                                                                     | Wired descriptor, runtime contract-only",
    );
    expect(inventorySource).not.toContain(
      "| `flow.refresh`            | Project command contract                                                                                                             | Wired descriptor, runtime contract-only",
    );
    expect(inventorySource).not.toContain(
      "| `flow.invalidate`         | Readiness invalidation command                                                                                                       | Wired descriptor, runtime contract-only",
    );
    expect(inventorySource).not.toContain(
      "| `flow.after`              | Assets complete dismissal                                                                                                            | Wired descriptor, virtual time contract-only",
    );
  });
});
