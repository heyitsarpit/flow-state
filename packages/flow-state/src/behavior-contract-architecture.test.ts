import { describe, expect, it } from "vite-plus/test";

const sources = {
  ...(import.meta.glob("./core/inspection/behavior-contract.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../../../apps/docs/src/pages/reference/inspection.md", {
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

describe("behavior contract architecture", () => {
  it("documents the owner boundary for behavior-contract facts", () => {
    const inspectionSource = requireSource("../../../apps/docs/src/pages/reference/inspection.md");

    expect(inspectionSource).toContain("## Behavior Contract Owner Map");
    expect(inspectionSource).toContain("Descriptors own app/module identity, fixtures, screens");
    expect(inspectionSource).toContain("Screen metadata stays coarse inventory");
    expect(inspectionSource).toContain("`graphOf(machine)` owns machine shape");
    expect(inspectionSource).toContain("`flow-state/testing` owns live scenario execution");
    expect(inspectionSource).toContain("selective duplicate module/resource");
    expect(inspectionSource).toContain("broad cross-module descriptor collision");
  });

  it("projects existing owners instead of cloning app inventory or machine traversal", () => {
    const behaviorSource = requireSource("./core/inspection/behavior-contract.ts");

    expect(behaviorSource).toContain("target.app.inventory()");
    expect(behaviorSource).toContain("graphOf(machine)");
    expect(behaviorSource).toContain("storyToDoc(story)");
    expect(behaviorSource).not.toContain("Object.entries(machine.config.states)");
    expect(behaviorSource).not.toContain("machine.config.states");
  });
});
