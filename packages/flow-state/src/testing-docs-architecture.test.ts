import { describe, expect, it } from "vite-plus/test";

const docsSources = {
  ...(import.meta.glob("../../../apps/docs/src/pages/guide/*.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../../../apps/docs/src/pages/reference/*.md", {
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

function requireDoc(path: string): string {
  const source = docsSources[path];
  expect(source).toBeDefined();
  if (!source) {
    throw new Error(`Missing ${path} source`);
  }

  return source;
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
    const apiSource = requireDoc("../../../apps/docs/src/pages/reference/api.md");

    expect(gettingStartedSource).toContain('import { test } from "@flow-state/testing";');
    expect(gettingStartedSource).toContain("Use `test(machine).with(...).run()` when shared data");
    expect(gettingStartedSource).toContain(
      "Use `test.app(App).scenario(machine)` when resource ownership",
    );
    expect(guideTestingSource).toContain("`test(machine).with(...).run()`");
    expect(guideTestingSource).toContain("`test.app(App).scenario(machine)`");
    expect(guideTestingSource).toContain("`flowTest(machine).start()`");
    expect(guidePatternsSource).toContain(
      "Prefer `test(machine).with(...).run()` before `test.app(App).scenario(machine)`",
    );
    expect(apiSource).toContain(
      "| `test`                   | Preferred builder for `test(machine).with(...).run()` focused scenarios. |",
    );
    expect(apiSource).toContain(
      "| `flowTest`               | Narrow migration alias for `flowTest(machine).start()`.    |",
    );
    expect(apiSource).toContain(
      "reach for `test.app(App).scenario(machine)` only when fixtures, resource",
    );
  });
});
