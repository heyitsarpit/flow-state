import { describe, expect, it } from "vite-plus/test";

const sourceModules = import.meta.glob("./*.ts", {
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

describe("diagnostics architecture", () => {
  it("keeps diagnostic errors on a lazy shared message helper instead of eager formatting", () => {
    const diagnosticsSource = requireSource("./diagnostics.ts");

    expect(diagnosticsSource).toContain('Object.defineProperty(target, "message"');
    expect(diagnosticsSource).toContain("cachedMessage ??= printFlowDiagnostic(target)");
    expect(diagnosticsSource).not.toContain("this.message = printFlowDiagnostic(document)");
  });
});
