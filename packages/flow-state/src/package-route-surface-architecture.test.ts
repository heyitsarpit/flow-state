import { describe, expect, it } from "vite-plus/test";

const sourceModules = {
  ...(import.meta.glob("./{inspect,react-entry,server,testing}.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../../flow-state-{inspect,react,server,testing}/src/index.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
};

function requireSource(path: string): string {
  const source = sourceModules[path];
  expect(source).toBeDefined();
  if (!source) {
    throw new Error(`Missing ${path} source module`);
  }

  return source;
}

describe("package route surface architecture", () => {
  it("keeps the public server route focused on request boot helpers only", () => {
    const serverSource = requireSource("./server.ts");
    const wrapperSource = requireSource("../../flow-state-server/src/index.ts");

    expect(serverSource).toContain(
      'export { withRequestRuntime } from "./runtime/request-runtime.js";',
    );
    expect(serverSource).toContain("FlowRuntimeBootPayload");
    expect(serverSource).not.toContain("export { createKey");
    expect(serverSource).not.toContain("export { flow");
    expect(serverSource).not.toContain("FlowEvent");
    expect(serverSource).not.toContain("FlowRuntimeResources");

    expect(wrapperSource).toContain(
      'import type { FlowRuntime, RuntimeReadyLayer } from "@flow-state/core";',
    );
    expect(wrapperSource).toContain(
      "export async function withRequestRuntime<AppLayer extends Layer.Any, Result>(",
    );
    expect(wrapperSource).toContain("FlowRuntimeBootPayload");
    expect(wrapperSource).not.toContain("export { createKey");
    expect(wrapperSource).not.toContain("export { flow");
    expect(wrapperSource).not.toContain("FlowEvent");
    expect(wrapperSource).not.toContain("FlowRuntimeResources");
  });

  it("keeps the public react route on named hook exports instead of a package-owned flow namespace", () => {
    const reactEntrySource = requireSource("./react-entry.ts");
    const wrapperSource = requireSource("../../flow-state-react/src/index.ts");

    expect(reactEntrySource).toContain(
      'export { useFlowActor as use } from "./react/use-actor.js";',
    );
    expect(reactEntrySource).toContain(
      'export { useFlowResource as useResource } from "./react/use-resource.js";',
    );
    expect(reactEntrySource).toContain(
      'export { useFlowView as useView } from "./react/use-view.js";',
    );
    expect(reactEntrySource).not.toContain('export { flow } from "./react/flow.js";');

    expect(wrapperSource).toContain(
      'export { useFlowActor as use } from "../../flow-state/src/react/use-actor.js";',
    );
    expect(wrapperSource).toContain(
      'export { useFlowResource as useResource } from "../../flow-state/src/react/use-resource.js";',
    );
    expect(wrapperSource).toContain(
      'export { useFlowView as useView } from "../../flow-state/src/react/use-view.js";',
    );
    expect(wrapperSource).not.toContain("export const flow = Object.freeze(");
    expect(wrapperSource).not.toContain("export type ReactFlowApi");
  });

  it("keeps the public testing route on testing helpers only", () => {
    const testingSource = requireSource("./testing.ts");
    const wrapperSource = requireSource("../../flow-state-testing/src/index.ts");

    expect(testingSource).toContain(
      'export { createControlledStream } from "./testing/controlled-stream.js";',
    );
    expect(testingSource).toContain('export { runFlowStory } from "./testing/flow-stories.js";');
    expect(testingSource).toContain('export { storyToTest } from "./testing/flow-story-test.js";');
    expect(testingSource).toContain('export { test } from "./testing/test.js";');
    expect(testingSource).toContain('export { flowTest } from "./testing/flow-test.js";');
    expect(testingSource).not.toContain("createKey");
    expect(testingSource).not.toContain("selectView");
    expect(testingSource).not.toContain("export { flow }");

    expect(wrapperSource).toContain(
      'export { createControlledStream } from "../../flow-state/src/testing/controlled-stream.js";',
    );
    expect(wrapperSource).toContain("export const runFlowStory = internalRunFlowStory;");
    expect(wrapperSource).toContain("export const storyToTest = internalStoryToTest;");
    expect(wrapperSource).toContain("export const test = internalTest as unknown as FlowTestApi;");
    expect(wrapperSource).toContain(
      "export const flowTest = internalFlowTest as unknown as LegacyFlowTestApi;",
    );
    expect(wrapperSource).not.toContain("createKey");
    expect(wrapperSource).not.toContain("selectView");
    expect(wrapperSource).not.toContain("export const flow = Object.freeze(");
  });

  it("keeps the public inspect route on explicit inspection exports only", () => {
    const inspectSource = requireSource("./inspect.ts");
    const wrapperSource = requireSource("../../flow-state-inspect/src/index.ts");

    expect(inspectSource).toContain("analyzeTrace");
    expect(inspectSource).toContain("flowStories");
    expect(inspectSource).toContain("graphOf");
    expect(inspectSource).toContain("storyToDoc");
    expect(inspectSource).toContain("whyNoTransition");
    expect(inspectSource).not.toContain("createKey");
    expect(inspectSource).not.toContain("selectView");
    expect(inspectSource).not.toContain("export { flow }");

    expect(wrapperSource).toContain('} from "../../flow-state/src/inspect.js";');
    expect(wrapperSource).toContain("analyzeTrace");
    expect(wrapperSource).toContain("flowStories");
    expect(wrapperSource).toContain("graphOf");
    expect(wrapperSource).toContain("storyToDoc");
    expect(wrapperSource).toContain("whyNoTransition");
    expect(wrapperSource).not.toContain('export * from "../../flow-state/src/inspect.js";');
    expect(wrapperSource).not.toContain("createKey");
    expect(wrapperSource).not.toContain("selectView");
    expect(wrapperSource).not.toContain("export const flow = Object.freeze(");
  });
});
