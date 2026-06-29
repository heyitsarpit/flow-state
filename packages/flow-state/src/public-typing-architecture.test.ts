import { describe, expect, it } from "vite-plus/test";

const sourceModules = import.meta.glob("./{public,react,runtime}/**/*.ts", {
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
});
