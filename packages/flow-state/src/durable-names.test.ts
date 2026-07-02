import { describe, expect, it } from "vite-plus/test";

const forbiddenModuleName = ["phase0", "design.ts"].join("-");
const phaseToken = ["h", "a", "s", "e"].join("");
const currentModulePath = "./durable-names.test.ts";
const publicTypesModulePath = "./core/api/types.ts";
const sourceModules = import.meta.glob("./**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function basename(path: string): string {
  const segments = path.split("/");
  return segments[segments.length - 1] ?? path;
}

describe("durable package naming", () => {
  const sourceFiles = Object.entries(sourceModules).filter(([path]) => path !== currentModulePath);

  it("uses behavior-based filenames for shared support modules", () => {
    expect(sourceFiles.map(([path]) => basename(path))).not.toContain(forbiddenModuleName);
  });

  it("keeps package sources free of rebuild-phase labels once behavior is stable", () => {
    const phasePattern = new RegExp(`\\b[Pp]${phaseToken}\\s+\\d+\\b|${forbiddenModuleName}`);
    const offenders = sourceFiles.flatMap(([path, contents]) =>
      contents
        .split("\n")
        .flatMap((line, index) =>
          phasePattern.test(line) ? [`${path}:${index + 1}:${line.trim()}`] : [],
        ),
    );

    expect(offenders).toEqual([]);
  });

  it("keeps the public type surface decomposed into dedicated modules", () => {
    const publicTypesSource = sourceModules[publicTypesModulePath];
    expect(publicTypesSource).toBeDefined();
    if (!publicTypesSource) {
      throw new Error(`Missing ${publicTypesModulePath} source module`);
    }

    const lineCount = publicTypesSource.split("\n").length;
    expect(lineCount < 120).toBe(true);
    expect(publicTypesSource).toContain("export type { FlowConcurrencyPolicy, SelectionSource }");
    expect(publicTypesSource).toContain('export * from "./app-types.js"');
    expect(publicTypesSource).toContain('export * from "./data-types.js"');
    expect(publicTypesSource).toContain('export * from "./inspect-types.js"');
    expect(publicTypesSource).toContain('export * from "./machine-types.js"');
    expect(publicTypesSource).toContain('export * from "./testing-types.js"');
  });
});
