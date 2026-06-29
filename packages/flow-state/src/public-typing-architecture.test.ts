import { describe, expect, it } from "vite-plus/test";

const sourceModules = import.meta.glob("./{descriptors,public,react,runtime}/**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function requireSource(path: string): string {
  const source = sourceModules[path];
  expect(source).toBeDefined();
  if (!source) {
    throw new Error(`Missing ${path} source module`);
  }

  return source;
}

describe("public typing architecture", () => {
  it("keeps provider and runtime entrypoints free of explicit any erasure", () => {
    const providerSource = requireSource("./react/provider.ts");
    const publicFlowSource = requireSource("./public/flow.ts");
    const contractRuntimeSource = requireSource("./runtime/contract-runtime.ts");

    expect(providerSource).not.toContain("FlowRuntime<any, any>");
    expect(publicFlowSource).not.toContain("Layer.Layer<any, any, never>");
    expect(publicFlowSource).not.toContain("FlowTransactionDefinition<string, any");
    expect(contractRuntimeSource).not.toContain("Layer.Layer<any, any, never>");
    expect(contractRuntimeSource).not.toContain("FlowRuntime<any, any>");
  });

  it("keeps machine invoke and submit contracts free of explicit any-erased transactions", () => {
    const machineTypesSource = requireSource("./public/machine-types.ts");

    expect(machineTypesSource).not.toContain("FlowTransactionDefinition<string, any");
    expect(machineTypesSource).not.toContain("FlowStreamDefinition<any");
  });

  it("keeps app-layer descriptor helpers aligned with the executable subset", () => {
    const appTypesSource = requireSource("./public/app-types.ts");
    const publicFlowSource = requireSource("./public/flow.ts");
    const appDescriptorSource = requireSource("./descriptors/app.ts");

    expect(appTypesSource).not.toContain("namespace: string");
    expect(appTypesSource).not.toContain("options: Readonly<Record<string, unknown>>");
    expect(publicFlowSource).not.toContain("memory: ({ namespace }");
    expect(publicFlowSource).not.toContain("test: ({ namespace }");
    expect(publicFlowSource).not.toContain("live: (options: Readonly<Record<string, unknown>>)");
    expect(publicFlowSource).not.toContain("test: (options: Readonly<Record<string, unknown>>)");
    expect(appDescriptorSource).not.toContain("void layerConfig.store");
    expect(appDescriptorSource).not.toContain("void layerConfig.orchestrators");
  });
});
