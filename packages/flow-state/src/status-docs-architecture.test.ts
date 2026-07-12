import { describe, expect, it } from "vite-plus/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const launchApiIds = [
  "flow.module",
  "flow.resource",
  "flow.transaction",
  "flow.machine",
  "flow.view",
  "flow.app",
  "App.layer",
  "flow.runtime",
  "flow.store.memory",
  "flow.store.test",
  "flow.orchestrators.live",
  "flow.orchestrators.test",
  "flow.ensure",
  "flow.observe",
  "flow.refresh",
  "flow.run",
  "flow.patch",
  "flow.invalidate",
  "flow.stream",
  "flow.after",
  "flow.child",
  "flow.can",
  "FlowProvider",
  "useResource",
  "use",
  "useView",
  "flowTest",
  "test.app",
  "createControlledStream",
] as const;

type LaunchApiId = (typeof launchApiIds)[number];
type LaunchEvidenceExpectation = Readonly<{
  status: "executable" | "partial" | "contract-only" | "deferred" | "broken";
  boundary: string;
  declarationPath: string;
  ownerPath: string;
  runtimePath: string;
  testPath: string;
}>;

const launchEvidenceExpectations = {
  "flow.module": {
    status: "executable",
    boundary: "app module inventory",
    declarationPath: "packages/flow-state/src/core/api/flow-core.ts",
    ownerPath: "packages/flow-state/src/descriptors/module.ts",
    runtimePath: "packages/flow-state/src/descriptors/inventory.ts",
    testPath: "examples/launch-workspace/src/launchWorkspace.test.ts",
  },
  "flow.resource": {
    status: "partial",
    boundary: "capacity/TTL and broader freshness policy remain unproved",
    declarationPath: "packages/flow-state/src/core/api/flow-core.ts",
    ownerPath: "packages/flow-state/src/core/runtime/services/resource-store.ts",
    runtimePath: "packages/flow-state/src/core/store/resource-store-memory.ts",
    testPath: "examples/launch-workspace/src/launchWorkspace.test.ts",
  },
  "flow.transaction": {
    status: "executable",
    boundary: "transaction snapshots, receipts, preview rollback",
    declarationPath: "packages/flow-state/src/core/api/flow-core.ts",
    ownerPath: "packages/flow-state/src/core/orchestrator/orchestrator-transactions.ts",
    runtimePath: "packages/flow-state/src/core/orchestrator/orchestrator-transaction-start.ts",
    testPath: "examples/launch-workspace/src/launchWorkspace.test.ts",
  },
  "flow.machine": {
    status: "executable",
    boundary: "machine states, transitions, receipts, and issues",
    declarationPath: "packages/flow-state/src/core/api/flow-core.ts",
    ownerPath: "packages/flow-state/src/core/orchestrator/orchestrator-system.ts",
    runtimePath: "packages/flow-state/src/core/machines/machine-transition-runtime.ts",
    testPath: "examples/launch-workspace/src/launchWorkspace.test.ts",
  },
  "flow.view": {
    status: "executable",
    boundary: "overview, trace, and debug projection values",
    declarationPath: "packages/flow-state/src/core/api/flow-core.ts",
    ownerPath: "packages/flow-state/src/core/api/flow-core.ts",
    runtimePath: "packages/flow-state/src/core/api/flow-core.ts",
    testPath: "examples/launch-workspace/src/launchWorkspace.test.ts",
  },
  "flow.app": {
    status: "executable",
    boundary: "flattened app inventory and app-backed scenarios",
    declarationPath: "packages/flow-state/src/core/api/flow-core.ts",
    ownerPath: "packages/flow-state/src/descriptors/app.ts",
    runtimePath: "packages/flow-state/src/descriptors/validation.ts",
    testPath: "examples/launch-workspace/src/launchWorkspace.test.ts",
  },
  "App.layer": {
    status: "partial",
    boundary: "broader installer policy variants are not exercised",
    declarationPath: "packages/flow-state/src/descriptors/app.ts",
    ownerPath: "packages/flow-state/src/descriptors/app.ts",
    runtimePath: "packages/flow-state/src/descriptors/app.ts",
    testPath: "examples/launch-workspace/src/launchWorkspaceModuleOwnership.test.ts",
  },
  "flow.runtime": {
    status: "partial",
    boundary: "broader schedule and trace policy remain unproved",
    declarationPath: "packages/flow-state/src/core/api/flow-core.ts",
    ownerPath: "packages/flow-state/src/runtime/contract-runtime.ts",
    runtimePath: "packages/flow-state/src/runtime/contract-runtime.ts",
    testPath: "examples/launch-workspace/src/launchWorkspace.test.ts",
  },
  "flow.store.memory": {
    status: "partial",
    boundary: "no Launch test exercises memory-mode-specific behavior",
    declarationPath: "packages/flow-state/src/core/api/flow-core.ts",
    ownerPath: "packages/flow-state/src/core/runtime/services/resource-store.ts",
    runtimePath: "packages/flow-state/src/core/store/resource-store-memory.ts",
    testPath: "examples/launch-workspace/src/launchWorkspaceModuleOwnership.test.ts",
  },
  "flow.store.test": {
    status: "partial",
    boundary: "test-mode policy distinctions remain unproved",
    declarationPath: "packages/flow-state/src/core/api/flow-core.ts",
    ownerPath: "packages/flow-state/src/core/runtime/services/resource-store.ts",
    runtimePath: "packages/flow-state/src/core/store/resource-store-memory.ts",
    testPath: "examples/launch-workspace/src/launchWorkspace.test.ts",
  },
  "flow.orchestrators.live": {
    status: "partial",
    boundary: "no Launch test exercises live-mode-specific behavior",
    declarationPath: "packages/flow-state/src/core/api/flow-core.ts",
    ownerPath: "packages/flow-state/src/core/orchestrator/orchestrator-system.ts",
    runtimePath: "packages/flow-state/src/core/orchestrator/orchestrator-system.ts",
    testPath: "examples/launch-workspace/src/launchWorkspaceModuleOwnership.test.ts",
  },
  "flow.orchestrators.test": {
    status: "partial",
    boundary: "deterministic mailbox/time distinctions are not asserted",
    declarationPath: "packages/flow-state/src/core/api/flow-core.ts",
    ownerPath: "packages/flow-state/src/core/orchestrator/orchestrator-system.ts",
    runtimePath: "packages/flow-state/src/core/orchestrator/orchestrator-system.ts",
    testPath: "examples/launch-workspace/src/launchWorkspace.test.ts",
  },
  "flow.ensure": {
    status: "executable",
    boundary: 'mode: "ensure"',
    declarationPath: "packages/flow-state/src/core/api/flow-core.ts",
    ownerPath: "packages/flow-state/src/core/orchestrator/orchestrator-resources.ts",
    runtimePath: "packages/flow-state/src/core/store/resource-store-lookups.ts",
    testPath: "examples/launch-workspace/src/launchWorkspace.test.ts",
  },
  "flow.observe": {
    status: "partial",
    boundary: "no assertion distinguishes observe mode or proves subscription lifetime/release",
    declarationPath: "packages/flow-state/src/core/api/flow-core.ts",
    ownerPath: "packages/flow-state/src/core/orchestrator/orchestrator-resources.ts",
    runtimePath: "packages/flow-state/src/core/orchestrator/orchestrator-resources.ts",
    testPath: "examples/launch-workspace/src/launchWorkspace.test.ts",
  },
  "flow.refresh": {
    status: "executable",
    boundary: 'mode: "refresh"',
    declarationPath: "packages/flow-state/src/core/api/flow-core.ts",
    ownerPath: "packages/flow-state/src/core/orchestrator/orchestrator-resources.ts",
    runtimePath: "packages/flow-state/src/core/store/resource-store-lookups.ts",
    testPath: "examples/launch-workspace/src/launchWorkspace.test.ts",
  },
  "flow.run": {
    status: "contract-only",
    boundary: "tested saves use transition submit",
    declarationPath: "packages/flow-state/src/core/api/flow-core.ts",
    ownerPath: "packages/flow-state/src/core/orchestrator/orchestrator-transaction-ownership.ts",
    runtimePath: "packages/flow-state/src/core/orchestrator/orchestrator-transaction-ownership.ts",
    testPath: "examples/launch-workspace/src/launchWorkspace.test.ts",
  },
  "flow.patch": {
    status: "contract-only",
    boundary: "tested patches are transaction preview",
    declarationPath: "packages/flow-state/src/core/api/flow-core.ts",
    ownerPath: "packages/flow-state/src/core/orchestrator/orchestrator-resources.ts",
    runtimePath: "packages/flow-state/src/core/orchestrator/orchestrator-resources.ts",
    testPath: "examples/launch-workspace/src/launchWorkspace.test.ts",
  },
  "flow.invalidate": {
    status: "executable",
    boundary: "resource:invalidate",
    declarationPath: "packages/flow-state/src/core/api/flow-core.ts",
    ownerPath: "packages/flow-state/src/core/orchestrator/orchestrator-resources.ts",
    runtimePath:
      "packages/flow-state/src/core/orchestrator/orchestrator-transaction-invalidation.ts",
    testPath: "examples/launch-workspace/src/launchWorkspace.test.ts",
  },
  "flow.stream": {
    status: "executable",
    boundary: "chat generations, emissions, interrupt, and cleanup",
    declarationPath: "packages/flow-state/src/core/api/flow-core.ts",
    ownerPath: "packages/flow-state/src/core/orchestrator/orchestrator-stream-ownership.ts",
    runtimePath: "packages/flow-state/src/core/orchestrator/orchestrator-stream-ownership.ts",
    testPath: "examples/launch-workspace/src/launchWorkspace.test.ts",
  },
  "flow.after": {
    status: "contract-only",
    boundary: "never drives it",
    declarationPath: "packages/flow-state/src/core/api/flow-core.ts",
    ownerPath: "packages/flow-state/src/core/orchestrator/orchestrator-after-timer-ownership.ts",
    runtimePath: "packages/flow-state/src/core/orchestrator/orchestrator-after-timer-ownership.ts",
    testPath: "examples/launch-workspace/src/launchWorkspace.test.ts",
  },
  "flow.child": {
    status: "executable",
    boundary: "start/stop/retry receipts",
    declarationPath: "packages/flow-state/src/core/api/flow-core.ts",
    ownerPath: "packages/flow-state/src/core/orchestrator/orchestrator-children.ts",
    runtimePath: "packages/flow-state/src/core/orchestrator/orchestrator-children.ts",
    testPath: "examples/launch-workspace/src/launchWorkspace.test.ts",
  },
  "flow.can": {
    status: "executable",
    boundary: "allowed and denied guard results",
    declarationPath: "packages/flow-state/src/core/api/flow-core.ts",
    ownerPath: "packages/flow-state/src/core/machines/machine-transition.ts",
    runtimePath: "packages/flow-state/src/core/machines/machine-transition.ts",
    testPath: "examples/launch-workspace/src/launchWorkspace.test.ts",
  },
  FlowProvider: {
    status: "executable",
    boundary: "without provider mismatch",
    declarationPath: "packages/flow-state/src/react/provider.ts",
    ownerPath: "packages/flow-state/src/react/provider.ts",
    runtimePath: "packages/flow-state/src/react/provider.ts",
    testPath: "examples/launch-workspace/src/launchWorkspaceShell.test.tsx",
  },
  useResource: {
    status: "executable",
    boundary: "rendered project resource data",
    declarationPath: "packages/flow-state/src/react/use-resource.ts",
    ownerPath: "packages/flow-state/src/react/resource-source.ts",
    runtimePath: "packages/flow-state/src/react/use-resource.ts",
    testPath: "examples/launch-workspace/src/launchWorkspaceShell.test.tsx",
  },
  use: {
    status: "executable",
    boundary: "assistant state and pending save receipts",
    declarationPath: "packages/flow-state/src/react/use-actor.ts",
    ownerPath: "packages/flow-state/src/react/use-actor.ts",
    runtimePath: "packages/flow-state/src/react/use-actor.ts",
    testPath: "examples/launch-workspace/src/launchWorkspaceShell.test.tsx",
  },
  useView: {
    status: "executable",
    boundary: "overview/trace/debug panel output",
    declarationPath: "packages/flow-state/src/react/use-view.ts",
    ownerPath: "packages/flow-state/src/react/view-source.ts",
    runtimePath: "packages/flow-state/src/react/use-view.ts",
    testPath: "examples/launch-workspace/src/launchWorkspaceShell.test.tsx",
  },
  flowTest: {
    status: "executable",
    boundary: "harness state, snapshots, receipts, issues, and controls",
    declarationPath: "packages/flow-state/src/testing.ts",
    ownerPath: "packages/flow-state/src/testing/flow-test.ts",
    runtimePath: "packages/flow-state/src/testing/flow-test.ts",
    testPath: "examples/launch-workspace/src/launchWorkspace.test.ts",
  },
  "test.app": {
    status: "executable",
    boundary: "fixture cache, views, guards, and model paths",
    declarationPath: "packages/flow-state/src/testing/test.ts",
    ownerPath: "packages/flow-state/src/testing/test.ts",
    runtimePath: "packages/flow-state/src/testing/test.ts",
    testPath: "examples/launch-workspace/src/launchWorkspace.test.ts",
  },
  createControlledStream: {
    status: "partial",
    boundary: "migration-only test helper, not product runtime",
    declarationPath: "packages/flow-state/src/testing/controlled-stream.ts",
    ownerPath: "packages/flow-state/src/testing/controlled-stream.ts",
    runtimePath: "packages/flow-state/src/testing/controlled-stream.ts",
    testPath: "examples/launch-workspace/src/launchWorkspace.test.ts",
  },
} satisfies Record<LaunchApiId, LaunchEvidenceExpectation>;

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

  it("keeps Launch Workspace resource-command classifications explicit", () => {
    const inventorySource = requireDoc("../../../examples/launch-workspace/API_INVENTORY.md");

    expect(inventorySource).toContain('asserts `mode: "ensure"`');
    expect(inventorySource).toContain("no assertion distinguishes observe mode");
    expect(inventorySource).toContain('asserts `mode: "refresh"`');
    expect(inventorySource).toContain("tested saves use transition submit");
    expect(inventorySource).toContain("tested patches are transaction preview");
  });

  it("keeps the Launch evidence table structurally complete and path-valid", () => {
    const inventorySource = requireDoc("../../../examples/launch-workspace/API_INVENTORY.md");
    const rows = inventorySource
      .split("\n")
      .filter((line) => line.startsWith("| `"))
      .map((line) => {
        const cells = line
          .split("|")
          .slice(1, -1)
          .map((cell) => cell.trim());
        if (cells.length !== 6) {
          throw new Error(
            `Expected exactly six inventory cells, received ${cells.length}: ${line}`,
          );
        }
        return cells as [string, string, string, string, string, string];
      });
    const expectedApis = [...launchApiIds];
    const actualApis = rows.map(([api]) => api.replaceAll("`", ""));

    expect(actualApis).toEqual(expectedApis);
    expect(rows).toHaveLength(expectedApis.length);

    for (const [api, declaration, owner, runtime, test, status] of rows) {
      const apiId = api.replaceAll("`", "") as LaunchApiId;
      const expectation = launchEvidenceExpectations[apiId];
      const rowText = [declaration, owner, runtime, test].join(" ");
      const cellsAndPaths = [
        [declaration, expectation.declarationPath],
        [owner, expectation.ownerPath],
        [runtime, expectation.runtimePath],
        [test, expectation.testPath],
      ] as const;

      expect(status).toBe(expectation.status);
      expect(rowText).toContain(expectation.boundary);

      for (const [cell, expectedPath] of cellsAndPaths) {
        const actualPath = [...cell.matchAll(/`([^`]*\/[^`]*)`/g)][0]?.[1];
        expect(actualPath).toBe(expectedPath);
        expect(existsSync(resolve(process.cwd(), expectedPath))).toBe(true);
      }
    }

    expect(inventorySource).not.toContain("reference-next/lib-api.md");
    expect(inventorySource).toContain("../../API_CONTRACT.md");
    expect(/\| `[^`]+`[^\n]*executable[^\n]*contract-only/.test(inventorySource)).toBe(false);
  });

  it("keeps the P4A.3 receipt-history boundary explicit", () => {
    const inventorySource = requireDoc("../../../examples/launch-workspace/API_INVENTORY.md");
    const statusSource = requireDoc("../../../apps/docs/src/pages/reference/status.mdx");

    for (const source of [inventorySource, statusSource]) {
      const normalizedSource = source.replace(/\s+/g, " ");
      expect(normalizedSource).toContain("cache:invalidate");
      expect(normalizedSource).toContain("bounded receipt history");
      expect(normalizedSource).toContain("intended only as bounded diagnostic evidence");
      expect(normalizedSource).toContain("independent of receipt");
      expect(normalizedSource).toContain("does not itself repair");
      expect(normalizedSource).toContain("P4A.3");
    }
  });

  it("classifies the status registry as metadata rather than Launch runtime proof", () => {
    const statusSource = requireDoc("../../../apps/docs/src/pages/reference/status.mdx");
    const guideSource = requireDoc("../../../apps/docs/src/pages/guide/launch-workspace.md");

    for (const source of [statusSource, guideSource]) {
      const normalizedSource = source.replace(/\s+/g, " ");
      expect(normalizedSource).toContain("coarse package");
      expect(normalizedSource).toContain("not Launch runtime proof");
      expect(normalizedSource).toContain("Launch-specific evidence classification");
    }
  });
});
