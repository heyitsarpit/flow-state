import { describe, expect, it } from "vite-plus/test";

const forbiddenModuleName = ["phase0", "design.ts"].join("-");
const phaseToken = ["h", "a", "s", "e"].join("");
const currentModulePath = "./durable-names.test.ts";
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
});
