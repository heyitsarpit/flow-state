import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vite-plus/test";

const maintainedExamples = [
  "basic-cached-posts",
  "optimistic-transactions",
  "bounded-infinite-feed",
  "server-prefetch-hydration",
  "offline-recovery",
] as const;

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
  ...(import.meta.glob("../../../apps/docs/src/pages/index.mdx", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../../../apps/docs/src/pages/concepts.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../../../examples/FEATURE_COVERAGE.md", {
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

describe("status docs architecture", () => {
  it("routes high-level docs back through the curated status contract", () => {
    const apiSource = requireDoc("../../../apps/docs/src/pages/reference/api.mdx");
    const runtimeSource = requireDoc("../../../apps/docs/src/pages/reference/runtime.md");
    const inspectionSource = requireDoc("../../../apps/docs/src/pages/reference/inspection.md");
    const gettingStartedSource = requireDoc("../../../apps/docs/src/pages/getting-started.md");
    const conceptsSource = requireDoc("../../../apps/docs/src/pages/concepts.md");
    const homeSource = requireDoc("../../../apps/docs/src/pages/index.mdx");

    expect(apiSource).toContain("[Supported Today](/reference/status)");
    expect(runtimeSource).toContain("[Current Status](/reference/status)");
    expect(inspectionSource).toContain("[Supported Today](/reference/status)");
    expect(gettingStartedSource).toContain("[Current Status](/reference/status)");
    expect(conceptsSource).toContain("[Current Status](/reference/status)");
    expect(homeSource).toContain("[Current Status](/reference/status)");
  });

  it("keeps app-validation claims selective instead of implying broad duplicate-id coverage", () => {
    const statusSource = requireDoc("../../../apps/docs/src/pages/reference/status.mdx");
    const apiSource = requireDoc("../../../apps/docs/src/pages/reference/api.mdx");

    expect(statusSource).toContain("dependency and cycle validation plus duplicate");
    expect(statusSource).toContain("module ids and duplicate resource ids across modules");
    expect(statusSource).toContain("not every cross-module");
    expect(statusSource).toContain("descriptor collision is checked");
    expect(apiSource).toContain("selective duplicate module or");
    expect(apiSource).not.toContain("duplicate-id validation");
  });

  it("keeps the public surface separate from package helpers and maintained recipe evidence", () => {
    const statusSource = requireDoc("../../../apps/docs/src/pages/reference/status.mdx");

    expect(statusSource).toContain("## Public Surface Boundaries");
    expect(statusSource).toContain("families `behavior`, `story`, and `trace`");
    expect(statusSource).toContain("`flow-state/testing`");
    expect(statusSource).toContain("`flow-state/inspect`");
    expect(statusSource).toContain("`packages/flow-state/scripts/**`");
    expect(statusSource).toContain("`examples/FEATURE_COVERAGE.md`");
    expect(statusSource).not.toContain("examples/launch-workspace");
  });

  it("keeps the maintained five-recipe coverage matrix complete and path-valid", () => {
    const coverageSource = requireDoc("../../../examples/FEATURE_COVERAGE.md");
    const rows = coverageSource
      .split("\n")
      .filter((line) => line.startsWith("| ") && line.endsWith("Covered |"))
      .map((line) =>
        line
          .split("|")
          .slice(1, -1)
          .map((cell) => cell.trim()),
      );

    expect(rows.length).toBeGreaterThan(40);
    for (const row of rows) {
      expect(row).toHaveLength(7);
      expect(row.at(-1)).toBe("Covered");
      expect(row.slice(1, -1)).toContain("C");
      for (const marker of row.slice(1, -1)) {
        expect(["C", "—"]).toContain(marker);
      }
    }

    for (const example of maintainedExamples) {
      expect(existsSync(resolve(process.cwd(), "examples", example, "package.json"))).toBe(true);
      const coverageName =
        example === "server-prefetch-hydration" ? "server prefetch" : example.replaceAll("-", " ");
      expect(coverageSource.toLowerCase()).toContain(coverageName);
    }
  });

  it("keeps coverage claims tied to visible behavior and deterministic evidence", () => {
    const coverageSource = requireDoc("../../../examples/FEATURE_COVERAGE.md");

    expect(coverageSource).toContain("visibly exercise");
    expect(coverageSource).toContain("deterministic test");
    expect(coverageSource).toContain("each `C` remains a required visible behavior");
    expect(coverageSource).toContain("CLIENT_STRUCTURE_CONTRACT.md");
  });
});
