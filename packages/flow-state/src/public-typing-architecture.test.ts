import { describe, expect, it } from "vite-plus/test";

const entrypointSources = import.meta.glob("./{index,server}.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const nestedSources = import.meta.glob(
  "./{descriptors,public,react,runtime,services,testing}/**/*.ts",
  {
    query: "?raw",
    import: "default",
    eager: true,
  },
) as Record<string, string>;

const sourceModules = {
  ...entrypointSources,
  ...nestedSources,
};

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

  it("keeps the server entrypoint free of testing and inspect ownership", () => {
    const serverSource = requireSource("./server.ts");

    expect(serverSource).not.toContain('from "./testing/controlled-effect.js"');
    expect(serverSource).not.toContain('from "./testing/controlled-stream.js"');
    expect(serverSource).not.toContain('from "./testing/flow-test.js"');
    expect(serverSource).not.toContain("flowExperimental");
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

  it("keeps the remaining internal runtime and flow-test seams free of explicit any erasure", () => {
    const appDescriptorSource = requireSource("./descriptors/app.ts");
    const orchestratorSystemSource = requireSource("./services/orchestrator-system.ts");
    const orchestratorHelpersSource = requireSource("./services/orchestrator-helpers.ts");
    const flowTestSource = requireSource("./testing/flow-test.ts");

    expect(appDescriptorSource).not.toContain("Layer.Layer<never, any, any>");
    expect(orchestratorSystemSource).not.toContain("FlowActor<any, any, any>");
    expect(orchestratorSystemSource).not.toContain("Context.Context<any>");
    expect(orchestratorSystemSource).not.toContain("Effect.context<any>()");
    expect(orchestratorHelpersSource).not.toContain("FlowActor<any, any, any>");
    expect(orchestratorHelpersSource).not.toContain("FlowSnapshot<any, any, any>");
    expect(flowTestSource).not.toContain("FlowTransactionDefinition<string, any");
    expect(flowTestSource).not.toContain("FlowActor<any, any, any>");
  });
});
