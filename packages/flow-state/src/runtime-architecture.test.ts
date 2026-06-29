import { describe, expect, it } from "vite-plus/test";

const sourceModules = import.meta.glob("./{runtime,services}/**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const contractRuntimeModulePath = "./runtime/contract-runtime.ts";
const orchestratorSystemModulePath = "./services/orchestrator-system.ts";

function requireSource(path: string): string {
  const source = sourceModules[path];
  expect(source).toBeDefined();
  if (!source) {
    throw new Error(`Missing ${path} source module`);
  }

  return source;
}

describe("runtime architecture", () => {
  it("keeps runtime disposal on Effect-native lifecycle primitives", () => {
    const contractRuntimeSource = requireSource(contractRuntimeModulePath);

    expect(contractRuntimeSource).toContain("managedRuntime.disposeEffect");
    expect(contractRuntimeSource).toContain("runPromise(disposeEffect)");
    expect(contractRuntimeSource).not.toContain("disposePromise = (async () => {");
    expect(contractRuntimeSource).not.toContain("managedRuntime.dispose()");
  });

  it("keeps runtime layer and runner typing free of unknown-erased service channels", () => {
    const contractRuntimeSource = requireSource(contractRuntimeModulePath);

    expect(contractRuntimeSource).not.toContain("FlowRuntime<unknown, unknown>");
    expect(contractRuntimeSource).not.toContain("Effect.Effect<A, E, unknown>");
    expect(contractRuntimeSource).not.toContain(
      "ManagedRuntime.make(runtimeLayer as Layer.Layer<unknown, unknown, never>)",
    );
  });

  it("keeps orchestrator actor lifecycle control in Effects internally", () => {
    const orchestratorSystemSource = requireSource(orchestratorSystemModulePath);

    expect(orchestratorSystemSource).toContain("flushEffect");
    expect(orchestratorSystemSource).toContain("disposeEffect");
    expect(orchestratorSystemSource).not.toContain("Effect.promise(() => actor.dispose())");
    expect(orchestratorSystemSource).not.toContain("Effect.promise(() => actor.flush())");
  });
});
