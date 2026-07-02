import { describe, expect, it } from "vite-plus/test";

const docsSources = {
  ...(import.meta.glob("../../../apps/docs/src/pages/guide/*.md", {
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

describe("recipes docs architecture", () => {
  it("keeps recipes as five decision buckets instead of a snippet catalog", () => {
    const recipesSource = requireDoc("../../../apps/docs/src/pages/guide/recipes.md");
    const bucketHeadings = recipesSource.match(/^## /gm) ?? [];

    expect(bucketHeadings).toHaveLength(5);
    expect(recipesSource).toContain("## Prerequisites And Freshness");
    expect(recipesSource).toContain("## Previewable Writes And Retry");
    expect(recipesSource).toContain("## Child And Stream Work");
    expect(recipesSource).toContain("## Boot And Restore");
    expect(recipesSource).toContain("## Runtime Escape Hatches");
    expect(recipesSource).not.toContain("## Require Data Before A State Can Proceed");
    expect(recipesSource).not.toContain("## Keep Data Fresh While A State Is Visible");
    expect(recipesSource).not.toContain("## Save With Preview And Rollback");
    expect(recipesSource).not.toContain("## Retry Or Reset A Failed Transaction");
    expect(recipesSource).not.toContain("## Select A View Outside React");
    expect(recipesSource).not.toContain("## Supervise A Child Workflow");
    expect(recipesSource).not.toContain("## Stream Progress Into A Flow");
    expect(recipesSource).not.toContain("## Delay A One-Shot Transition");
    expect(recipesSource).not.toContain("## Restore A Booted Actor");
    expect(recipesSource).not.toContain("## Start A Runtime Actor Manually");
  });

  it("starts each bucket with a decision rule and links out to owner docs", () => {
    const recipesSource = requireDoc("../../../apps/docs/src/pages/guide/recipes.md");
    const useThisWhenCount = recipesSource.match(/Use this when/g) ?? [];
    const readNextCount = recipesSource.match(/Read next:/g) ?? [];

    expect(useThisWhenCount).toHaveLength(5);
    expect(readNextCount).toHaveLength(5);
    expect(recipesSource).toContain("[Resources](/reference/resources)");
    expect(recipesSource).toContain("[Machines](/reference/machines)");
    expect(recipesSource).toContain("[Transactions](/reference/transactions)");
    expect(recipesSource).toContain("[Streams And Time](/reference/streams-time)");
    expect(recipesSource).toContain("[Server And Hydration](/guide/server-hydration)");
    expect(recipesSource).toContain("[Runtime](/reference/runtime)");
    expect(recipesSource).toContain("[React And Views](/reference/views-react)");
    expect(recipesSource).toContain("[Testing](/guide/testing)");
  });
});
