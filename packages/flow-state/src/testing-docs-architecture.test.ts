import { describe, expect, it } from "vite-plus/test";

const docsSources = {
  ...(import.meta.glob("../../../apps/docs/src/pages/guide/*.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../../../apps/docs/src/pages/reference/*.{md,mdx}", {
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

const generatedArtifacts = import.meta.glob("../../../apps/docs/src/generated/*.json", {
  import: "default",
  eager: true,
}) as Record<string, unknown>;

function requireDoc(path: string): string {
  const source = docsSources[path];
  expect(source).toBeDefined();
  if (!source) {
    throw new Error(`Missing ${path} source`);
  }

  return source;
}

function requireGenerated<T>(path: string): T {
  const artifact = generatedArtifacts[path];
  expect(artifact).toBeDefined();
  if (!artifact) {
    throw new Error(`Missing ${path} generated artifact`);
  }

  return artifact as T;
}

describe("testing docs architecture", () => {
  it("keeps removed testing names out of the public guides", () => {
    const gettingStartedSource = requireDoc("../../../apps/docs/src/pages/getting-started.md");
    const guideTestingSource = requireDoc("../../../apps/docs/src/pages/guide/testing.md");
    const guidePatternsSource = requireDoc("../../../apps/docs/src/pages/guide/patterns.md");

    for (const source of [gettingStartedSource, guideTestingSource, guidePatternsSource]) {
      expect(source).not.toContain("flow.test(...)");
      expect(source).not.toContain("flow.test(");
      expect(source).not.toContain("flow.test.app(...)");
    }

    expect(gettingStartedSource).not.toContain("flowTest");
    expect(guidePatternsSource).not.toContain("flowTest(");
    expect(guideTestingSource).toContain("`flowTest.app(App)` does not exist");
  });

  it("teaches focused test builders first and app harnesses only when they pay rent", () => {
    const gettingStartedSource = requireDoc("../../../apps/docs/src/pages/getting-started.md");
    const guideTestingSource = requireDoc("../../../apps/docs/src/pages/guide/testing.md");
    const guidePatternsSource = requireDoc("../../../apps/docs/src/pages/guide/patterns.md");
    const apiSource = requireDoc("../../../apps/docs/src/pages/reference/api.mdx");
    const apiReference = requireGenerated<{
      readonly sections: ReadonlyArray<{
        readonly id: string;
        readonly entries: ReadonlyArray<{
          readonly name: string;
          readonly description: string;
        }>;
      }>;
    }>("../../../apps/docs/src/generated/api-reference.json");
    const testingSection = apiReference.sections.find((section) => section.id === "testing");
    expect(testingSection).toBeDefined();
    const testEntry = testingSection?.entries.find((entry) => entry.name === "test");
    const flowTestEntry = testingSection?.entries.find((entry) => entry.name === "flowTest");

    expect(gettingStartedSource).toContain('import { test } from "@flow-state/testing";');
    expect(gettingStartedSource).toContain(
      "Use `test(machine).with(...).run()` for the first executable proof",
    );
    expect(gettingStartedSource).toContain("const harness = test(launchWorkspaceMachine)");
    expect(gettingStartedSource).not.toContain("test.app(App).scenario(machine)");
    expect(guideTestingSource).toContain("`test(machine).with(...).run()`");
    expect(guideTestingSource).toContain("`test.app(App).scenario(machine)`");
    expect(guideTestingSource).toContain("`flowTest(machine).start()`");
    expect(guidePatternsSource).toContain(
      "Prefer `test(machine).with(...).run()` before `test.app(App).scenario(machine)`",
    );
    expect(apiSource).toContain("<ApiReferenceSections sections={apiReference.sections} />");
    expect(testEntry?.description).toBe(
      "Preferred builder for focused `test(machine).with(...).run()` scenarios.",
    );
    expect(flowTestEntry?.description).toBe(
      "Narrow migration alias for `flowTest(machine).start()`.",
    );
    expect(apiSource).toContain(
      "reach for `test.app(App).scenario(machine)` only when fixtures, resource",
    );
  });
});
