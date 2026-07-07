import { describe, expect, it } from "vite-plus/test";

const sources = {
  ...(import.meta.glob("../scripts/behavior-cli.mjs", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../../../HOW_TO_USE_FLOW_STATE.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../../../BEHAVIOR_CONTRACT.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
};

function requireSource(path: string): string {
  const source = sources[path];
  expect(source).toBeDefined();
  if (!source) {
    throw new Error(`Missing ${path} source`);
  }

  return source;
}

describe("behavior scaffold architecture", () => {
  it("keeps the behavior CLI surface limited to build, render, and diff", () => {
    const cliSource = requireSource("../scripts/behavior-cli.mjs");

    expect(cliSource).toContain("flow-state behavior build");
    expect(cliSource).toContain("flow-state behavior render");
    expect(cliSource).toContain("flow-state behavior diff");
    expect(cliSource).not.toContain("flow-state behavior scaffold");
    expect(cliSource).not.toContain('case "scaffold"');
  });

  it("keeps scaffolds future, opt-in, and non-canonical in the narrowing contract", () => {
    const contractSource = requireSource("../../../BEHAVIOR_CONTRACT.md");

    expect(contractSource).toContain("Optional `scaffold` work is future");
    expect(contractSource).toContain(
      "They are only created when a user explicitly asks for scaffolds",
    );
    expect(contractSource).toContain("must never be");
    expect(contractSource).toContain("treated as canonical sources of truth");
    expect(contractSource).toContain(
      "Optional user-owned scaffolds are opt-in and clearly non-canonical.",
    );
  });

  it("keeps the concrete behavior loop free of default scaffold generation", () => {
    const howToUseSource = requireSource("../../../HOW_TO_USE_FLOW_STATE.md");

    expect(howToUseSource).toContain("The minimal loop is:");
    expect(howToUseSource).toContain("Scaffolds stay future, opt-in, and non-canonical.");
    expect(howToUseSource).toContain("flow-state behavior build");
    expect(howToUseSource).toContain("flow-state behavior render");
    expect(howToUseSource).toContain("flow-state behavior diff");
  });
});
