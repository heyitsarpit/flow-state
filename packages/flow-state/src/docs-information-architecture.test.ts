import { describe, expect, it } from "vite-plus/test";

const docsSources = {
  ...(import.meta.glob("../../../apps/docs/src/pages/concepts.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../../../apps/docs/src/pages/guide/app-structure.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../../../apps/docs/src/pages/guide/ownership-and-runtime-facts.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../../../apps/docs/src/pages/reference/api.mdx", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../../../apps/docs/src/pages/reference/runtime.md", {
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

describe("docs information architecture", () => {
  it("gives concepts ownership work instead of app assembly walkthroughs", () => {
    const conceptsSource = requireDoc("../../../apps/docs/src/pages/concepts.md");

    expect(conceptsSource).not.toContain("## Apps And Layers");
    expect(conceptsSource).toContain("## Read This Next");
    expect(conceptsSource).toContain("[App Structure](/guide/app-structure)");
    expect(conceptsSource).toContain("[Runtime](/reference/runtime)");
  });

  it("keeps api as the short index and routes module/app rationale elsewhere", () => {
    const apiSource = requireDoc("../../../apps/docs/src/pages/reference/api.mdx");

    expect(apiSource).not.toContain("## Why `module` And `app` Exist");
    expect(apiSource).toContain(
      "[Ownership And Runtime Facts](/guide/ownership-and-runtime-facts)",
    );
    expect(apiSource).toContain("[Runtime](/reference/runtime)");
  });

  it("keeps runtime focused on handles and boundaries instead of repeating ownership rationale", () => {
    const runtimeSource = requireDoc("../../../apps/docs/src/pages/reference/runtime.md");
    const appStructureSource = requireDoc("../../../apps/docs/src/pages/guide/app-structure.md");
    const ownershipFactsSource = requireDoc(
      "../../../apps/docs/src/pages/guide/ownership-and-runtime-facts.md",
    );

    expect(runtimeSource).not.toContain("If you want the concrete receipts");
    expect(runtimeSource).toContain("## Runtime Handle");
    expect(runtimeSource).toContain("## Request-Scoped Server Boot");
    expect(runtimeSource).toContain("## Read This Next");
    expect(appStructureSource).toContain("## Read This Next");
    expect(ownershipFactsSource).toContain("## Read This Next");
  });
});
