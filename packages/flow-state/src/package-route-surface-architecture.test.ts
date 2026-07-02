import { describe, expect, it } from "vite-plus/test";

const sourceModules = {
  ...(import.meta.glob("./{react-entry,server}.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../../flow-state-{react,server}/src/index.ts", {
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
      'export { withRequestRuntime } from "../../flow-state/src/runtime/request-runtime.js";',
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
});
