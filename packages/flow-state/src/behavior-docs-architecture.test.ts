import { describe, expect, it } from "vite-plus/test";

const docsSources = import.meta.glob("../../../apps/docs/src/pages/reference/*.{md,mdx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const componentSources = import.meta.glob("../../../apps/docs/src/components/*.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

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

function requireComponent(path: string): string {
  const source = componentSources[path];
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

describe("behavior docs architecture", () => {
  it("keeps the docs page as a hand-written wrapper around generated behavior-contract data", () => {
    const behaviorSource = requireDoc("../../../apps/docs/src/pages/reference/behavior.mdx");
    const behaviorArtifact = requireGenerated<{
      readonly version: string;
      readonly app: Readonly<{ readonly id: string }>;
    }>("../../../apps/docs/src/generated/behavior-contract.json");

    expect(behaviorSource).toContain(
      'import behaviorContract from "../../generated/behavior-contract.json";',
    );
    expect(behaviorSource).toContain(
      'import { BehaviorBriefSections } from "../../components/behavior-brief-sections";',
    );
    expect(behaviorSource).toContain("<BehaviorBriefSections contract={behaviorContract} />");
    expect(behaviorArtifact.version).toBe("flow-state/behavior-contract.v1");
    expect(behaviorArtifact.app.id.length > 0).toBe(true);
  });

  it("keeps the behavior docs page in the same section order as the shared brief contract", () => {
    const componentSource = requireComponent(
      "../../../apps/docs/src/components/behavior-brief-sections.tsx",
    );

    expect(componentSource.indexOf("App") < componentSource.indexOf("Modules")).toBe(true);
    expect(componentSource.indexOf("Modules") < componentSource.indexOf("Screens")).toBe(true);
    expect(componentSource.indexOf("Screens") < componentSource.indexOf("Machines")).toBe(true);
    expect(
      componentSource.indexOf("Machines") < componentSource.indexOf("Runtime Work By State"),
    ).toBe(true);
    expect(
      componentSource.indexOf("Runtime Work By State") <
        componentSource.indexOf("Transactions And Streams"),
    ).toBe(true);
    expect(
      componentSource.indexOf("Transactions And Streams") < componentSource.indexOf("Views"),
    ).toBe(true);
    expect(componentSource.indexOf("Views") < componentSource.indexOf("Stories And Coverage")).toBe(
      true,
    );
    expect(
      componentSource.indexOf("Stories And Coverage") <
        componentSource.indexOf("Links To Deeper Owner Docs"),
    ).toBe(true);
    expect(componentSource).toContain("Resources:");
    expect(componentSource).toContain("; resources ");
  });
});
