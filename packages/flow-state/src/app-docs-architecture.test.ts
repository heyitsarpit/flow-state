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

function requireDoc(path: string): string {
  const source = docsSources[path];
  expect(source).toBeDefined();
  if (!source) {
    throw new Error(`Missing ${path} source`);
  }

  return source;
}

describe("app docs architecture", () => {
  it("keeps moduleMap out of the headline app value pitch", () => {
    const gettingStartedSource = requireDoc("../../../apps/docs/src/pages/getting-started.md");
    const apiSource = requireDoc("../../../apps/docs/src/pages/reference/api.mdx");

    expect(gettingStartedSource).not.toContain("typed `moduleMap`");
    expect(gettingStartedSource).not.toContain("typed module lookup");
    expect(apiSource).not.toContain("typed module lookup");
    expect(apiSource).toContain("fixture-backed app tests");
    expect(apiSource).toContain("duplicate-id validation");
  });

  it("keeps moduleMap as a supporting detail behind fixtures, inventory, and App.layer", () => {
    const appStructureSource = requireDoc("../../../apps/docs/src/pages/guide/app-structure.md");
    const ownershipFactsSource = requireDoc(
      "../../../apps/docs/src/pages/guide/ownership-and-runtime-facts.md",
    );

    expect(appStructureSource).toContain("`App.moduleMap.<id>` stays");
    expect(ownershipFactsSource).toContain("`fixtures` because they produce real test-time");
    expect(ownershipFactsSource).toContain("`App.layer(...)` because it is the cleanest");
    expect(ownershipFactsSource).toContain("duplicate-id validation because it catches");
    expect(ownershipFactsSource).toContain("typed `moduleMap` as a supporting convenience");
  });
});
