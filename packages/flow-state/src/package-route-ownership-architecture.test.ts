import { describe, expect, it } from "vite-plus/test";

const docsSources = {
  ...(import.meta.glob("../../../apps/docs/src/pages/reference/api.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../../../apps/docs/src/pages/reference/resources.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../../../apps/docs/src/pages/reference/transactions.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../../../apps/docs/src/pages/reference/machines.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../../../apps/docs/src/pages/reference/runtime.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../../../apps/docs/src/pages/reference/views-react.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../../../apps/docs/src/pages/guide/server-hydration.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../../../apps/docs/src/pages/getting-started.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
};

const launchWorkspaceSources = import.meta.glob(
  "../../../examples/launch-workspace/src/*.{ts,tsx}",
  {
    query: "?raw",
    import: "default",
    eager: true,
  },
) as Record<string, string>;

function requireDoc(path: string): string {
  const source = docsSources[path];
  expect(source).toBeDefined();
  if (!source) {
    throw new Error(`Missing ${path} source`);
  }

  return source;
}

function requireExample(path: string): string {
  const source = launchWorkspaceSources[path];
  expect(source).toBeDefined();
  if (!source) {
    throw new Error(`Missing ${path} source`);
  }

  return source;
}

describe("docs and examples package ownership", () => {
  it("keeps launch workspace shared builders and types on @flow-state/core", () => {
    const coreOwnedExamplePaths = [
      "../../../examples/launch-workspace/src/launchWorkspaceApproval.ts",
      "../../../examples/launch-workspace/src/launchWorkspaceAssistant.ts",
      "../../../examples/launch-workspace/src/launchWorkspaceChat.ts",
      "../../../examples/launch-workspace/src/launchWorkspaceDebug.ts",
      "../../../examples/launch-workspace/src/launchWorkspaceGuards.ts",
      "../../../examples/launch-workspace/src/launchWorkspaceProject.ts",
      "../../../examples/launch-workspace/src/launchWorkspaceResources.ts",
      "../../../examples/launch-workspace/src/launchWorkspaceStreams.ts",
      "../../../examples/launch-workspace/src/launchWorkspaceSupport.ts",
      "../../../examples/launch-workspace/src/launchWorkspaceViews.ts",
    ] as const;

    for (const examplePath of coreOwnedExamplePaths) {
      expect(requireExample(examplePath)).not.toContain("@flow-state/server");
    }

    const shellSource = requireExample(
      "../../../examples/launch-workspace/src/launchWorkspaceShell.tsx",
    );
    const assemblySource = requireExample(
      "../../../examples/launch-workspace/src/launchWorkspaceAssembly.ts",
    );

    expect(shellSource).toContain('import { flow as coreFlow } from "@flow-state/core";');
    expect(shellSource).toContain('import * as flowReact from "@flow-state/react";');
    expect(shellSource).not.toContain('import { flow as reactFlow } from "@flow-state/react";');
    expect(assemblySource).toContain('import { flow } from "@flow-state/core";');
    expect(assemblySource).toContain('import { withRequestRuntime } from "@flow-state/server";');
    expect(assemblySource).not.toContain(
      'import { flow, withRequestRuntime } from "@flow-state/server";',
    );
  });

  it("keeps route-specific docs honest about core versus route ownership", () => {
    const apiSource = requireDoc("../../../apps/docs/src/pages/reference/api.md");
    const resourcesSource = requireDoc("../../../apps/docs/src/pages/reference/resources.md");
    const transactionsSource = requireDoc("../../../apps/docs/src/pages/reference/transactions.md");
    const machinesSource = requireDoc("../../../apps/docs/src/pages/reference/machines.md");
    const runtimeSource = requireDoc("../../../apps/docs/src/pages/reference/runtime.md");
    const viewsSource = requireDoc("../../../apps/docs/src/pages/reference/views-react.md");
    const gettingStartedSource = requireDoc("../../../apps/docs/src/pages/getting-started.md");
    const serverHydrationSource = requireDoc(
      "../../../apps/docs/src/pages/guide/server-hydration.md",
    );

    expect(apiSource).toContain(
      'import { machine, resource, transaction } from "@flow-state/core";',
    );
    expect(apiSource).toContain('import * as flowCore from "@flow-state/core";');
    expect(resourcesSource).toContain('from "@flow-state/core";');
    expect(resourcesSource).toContain("createKey,");
    expect(resourcesSource).toContain("createTag,");
    expect(resourcesSource).toContain("ensure,");
    expect(resourcesSource).toContain("invalidate,");
    expect(resourcesSource).toContain("observe,");
    expect(resourcesSource).toContain("refresh,");
    expect(resourcesSource).toContain("resource,");
    expect(resourcesSource).toContain("const projectResource = resource({");
    expect(transactionsSource).toContain(
      'import { outcomes, run, transaction } from "@flow-state/core";',
    );
    expect(transactionsSource).toContain("const saveProject = transaction({");
    expect(transactionsSource).toContain("routes: outcomes({");
    expect(machinesSource).toContain(
      'import { after, can, child, ensure, machine, observe, run, stream } from "@flow-state/core";',
    );
    expect(machinesSource).toContain("const workspace = machine({");
    expect(machinesSource).toContain("ensure(projectResource.ref(fixtureProjectId))");
    expect(machinesSource).toContain("observe(readinessResource.ref(fixtureProjectId))");
    expect(machinesSource).toContain("invoke: run(saveProjectTransaction)");
    expect(runtimeSource).toContain(
      'import { app, orchestrators, runtime, store } from "@flow-state/core";',
    );
    expect(runtimeSource).toContain(
      "export const App = app({ modules: [Session, Project, Approval, Chat] });",
    );
    expect(runtimeSource).toContain("store: store.memory(),");
    expect(runtimeSource).toContain("orchestrators: orchestrators.live(),");
    expect(runtimeSource).toContain("export const appRuntime = runtime(AppLayer);");
    expect(viewsSource).toContain('import * as flowCore from "@flow-state/core";');
    expect(viewsSource).toContain(
      'import { FlowProvider, use as useFlow, useResource, useView } from "@flow-state/react";',
    );
    expect(viewsSource).not.toContain(
      'import { FlowProvider, flow as reactFlow } from "@flow-state/react";',
    );
    expect(gettingStartedSource).toContain(
      'import { FlowProvider, use as useFlow, useResource } from "@flow-state/react";',
    );
    expect(gettingStartedSource).toContain("runtime as createRuntime,");
    expect(gettingStartedSource).toContain("export const projectResource = resource({");
    expect(gettingStartedSource).toContain("export const saveProjectTransaction = transaction({");
    expect(gettingStartedSource).toContain("export const launchWorkspaceMachine = machine({");
    expect(gettingStartedSource).toContain(
      "invoke: [ensure(projectResource.ref(fixtureProjectId))]",
    );
    expect(gettingStartedSource).toContain("invoke: run(saveProjectTransaction)");
    expect(gettingStartedSource).toContain("export const App = app({ modules: [ProjectModule] });");
    expect(gettingStartedSource).toContain("store: store.test(),");
    expect(gettingStartedSource).toContain("orchestrators: orchestrators.test(),");
    expect(gettingStartedSource).toContain("export const runtime = createRuntime(AppLayer);");
    expect(gettingStartedSource).toContain(
      'expect(can(harness.snapshot(), { type: "SAVE_PROJECT" })).toBe(true);',
    );
    expect(gettingStartedSource).not.toContain(
      'import { FlowProvider, flow as reactFlow } from "@flow-state/react";',
    );
    expect(serverHydrationSource).toContain(
      'import { app, orchestrators, store } from "@flow-state/core";',
    );
    expect(serverHydrationSource).toContain('import { runtime } from "@flow-state/core";');
    expect(serverHydrationSource).toContain(
      'import { withRequestRuntime } from "@flow-state/server";',
    );
    expect(serverHydrationSource).toContain(
      'import { FlowProvider, use as useFlow } from "@flow-state/react";',
    );
    expect(serverHydrationSource).not.toContain(
      'import { flow, withRequestRuntime } from "@flow-state/server";',
    );
    expect(serverHydrationSource).not.toContain('import { flow } from "@flow-state/core";');
    expect(serverHydrationSource).not.toContain(
      'import { FlowProvider, flow as reactFlow } from "@flow-state/react";',
    );
  });
});
