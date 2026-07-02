import { describe, expect, it } from "vite-plus/test";

const docsSources = import.meta.glob("../../../apps/docs/src/pages/reference/*.{md,mdx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const sourceModules = {
  ...(import.meta.glob("./{index,inspect,react-entry,server,testing}.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("./core/api/flow-core.ts", {
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

function requireSource(path: string): string {
  const source = sourceModules[path];
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

function extractNamedValueExports(source: string): Array<string> {
  return [...source.matchAll(/export\s*\{([\s\S]*?)\}\s*from/g)].flatMap((match) => {
    const exportList = match[1];
    if (!exportList) {
      return [];
    }

    return exportList
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0 && !part.startsWith("type "))
      .map((part) => {
        const aliasMatch = part.match(/\bas\s+([A-Za-z0-9_]+)/);
        return aliasMatch?.[1] ?? part;
      });
  });
}

function extractFlowMembers(source: string): Array<string> {
  const objectMatch = source.match(/export const flow = Object\.freeze\(\{([\s\S]*?)\}\);/);
  if (!objectMatch) {
    throw new Error("Missing exported flow compatibility object.");
  }

  const objectBody = objectMatch[1];
  if (!objectBody) {
    throw new Error("Missing exported flow compatibility members.");
  }

  return [...objectBody.matchAll(/^\s*([A-Za-z0-9_]+),?$/gm)]
    .map((match) => match[1])
    .filter((name): name is string => typeof name === "string");
}

describe("api reference generation architecture", () => {
  it("keeps the generated api reference artifact current with live exports", () => {
    const apiReference = requireGenerated<{
      readonly sections: ReadonlyArray<{
        readonly id: string;
        readonly entries: ReadonlyArray<{
          readonly name: string;
        }>;
      }>;
    }>("../../../apps/docs/src/generated/api-reference.json");

    const expectedBySection = new Map<string, ReadonlyArray<string>>([
      [
        "core",
        extractNamedValueExports(requireSource("./index.ts")).filter((name) => name !== "flow"),
      ],
      ["react", extractNamedValueExports(requireSource("./react-entry.ts"))],
      ["testing", extractNamedValueExports(requireSource("./testing.ts"))],
      ["server", extractNamedValueExports(requireSource("./server.ts"))],
      ["inspect", extractNamedValueExports(requireSource("./inspect.ts"))],
      [
        "flow",
        extractFlowMembers(requireSource("./core/api/flow-core.ts")).map((name) => `flow.${name}`),
      ],
    ]);

    for (const section of apiReference.sections) {
      const expectedEntries = expectedBySection.get(section.id);
      expect(expectedEntries).toBeDefined();
      expect(new Set(section.entries.map((entry) => entry.name))).toEqual(new Set(expectedEntries));
    }
  });

  it("keeps the api route as a hand-written wrapper around generated export data", () => {
    const apiSource = requireDoc("../../../apps/docs/src/pages/reference/api.mdx");

    expect(apiSource).toContain('import apiReference from "../../generated/api-reference.json";');
    expect(apiSource).toContain(
      'import { ApiReferenceSections } from "../../components/api-reference-sections";',
    );
    expect(apiSource).toContain("## Export-Driven Quick Reference");
    expect(apiSource).toContain("<ApiReferenceSections sections={apiReference.sections} />");
    expect(apiSource).toContain("`App.layer(...)` still matters");
  });
});
