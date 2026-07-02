import { describe, expect, it } from "vite-plus/test";

const docsSources = {
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
    expect(shellSource).toContain('import { flow as reactFlow } from "@flow-state/react";');
    expect(shellSource).not.toContain('import { flow } from "@flow-state/react";');
    expect(assemblySource).toContain('import { flow } from "@flow-state/core";');
    expect(assemblySource).toContain('import { withRequestRuntime } from "@flow-state/server";');
    expect(assemblySource).not.toContain(
      'import { flow, withRequestRuntime } from "@flow-state/server";',
    );
  });

  it("keeps route-specific docs honest about core versus route ownership", () => {
    const viewsSource = requireDoc("../../../apps/docs/src/pages/reference/views-react.md");
    const gettingStartedSource = requireDoc("../../../apps/docs/src/pages/getting-started.md");
    const serverHydrationSource = requireDoc(
      "../../../apps/docs/src/pages/guide/server-hydration.md",
    );

    expect(viewsSource).toContain('import { flow as coreFlow } from "@flow-state/core";');
    expect(viewsSource).toContain(
      'import { FlowProvider, flow as reactFlow } from "@flow-state/react";',
    );
    expect(viewsSource).not.toContain('import { FlowProvider, flow } from "@flow-state/react";');
    expect(gettingStartedSource).toContain('import { flow } from "@flow-state/core";');
    expect(gettingStartedSource).toContain(
      'import { FlowProvider, flow as reactFlow } from "@flow-state/react";',
    );
    expect(gettingStartedSource).not.toContain(
      'import { FlowProvider, flow } from "@flow-state/react";',
    );
    expect(serverHydrationSource).toContain('import { flow } from "@flow-state/core";');
    expect(serverHydrationSource).toContain(
      'import { withRequestRuntime } from "@flow-state/server";',
    );
    expect(serverHydrationSource).toContain(
      'import { FlowProvider, flow as reactFlow } from "@flow-state/react";',
    );
    expect(serverHydrationSource).not.toContain(
      'import { flow, withRequestRuntime } from "@flow-state/server";',
    );
    expect(serverHydrationSource).not.toContain(
      'import { FlowProvider, flow } from "@flow-state/react";',
    );
  });
});
