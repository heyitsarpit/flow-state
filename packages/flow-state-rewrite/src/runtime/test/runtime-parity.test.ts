// @ts-expect-error The package typecheck intentionally has no Node ambient types; the test runs in Node.
import { readFileSync } from "node:fs";
// @ts-expect-error The package typecheck intentionally has no Node ambient types; the test runs in Node.
import { basename, dirname, join } from "node:path";
// @ts-expect-error The package typecheck intentionally has no Node ambient types; the test runs in Node.
import { fileURLToPath } from "node:url";

import { assert, describe, it } from "@effect/vitest";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const stubTitlePattern = /\bit\.todo\(\s*["`]([^"`]+)["`]/gu;
const executableTitlePattern = /\bit(?:\.effect)?\(\s*["`]([^"`]+)["`]/gu;

const titlesIn = (file: string, pattern: RegExp) => {
  const source = readFileSync(file, "utf8");
  return [...source.matchAll(pattern)]
    .map((match) => match[1])
    .filter((title) => title !== undefined);
};

describe("runtime TODO parity inventory", () => {
  it("represents every stub case exactly once in its actual suite", () => {
    const stubFiles = [
      "actor-admission.stub.test.ts",
      "actor-engine.stub.test.ts",
      "context-wave.stub.test.ts",
      "evidence.stub.test.ts",
      "lifecycle.stub.test.ts",
      "runtime-architecture.stub.test.ts",
      "runtime-owner.stub.test.ts",
      "turn-plan.stub.test.ts",
    ];
    const inventory = stubFiles.map((stubFile) => {
      const actualFile = join(testDirectory, stubFile.replace(".stub", ""));
      const expected = titlesIn(join(testDirectory, stubFile), stubTitlePattern);
      const actual = titlesIn(actualFile, executableTitlePattern);
      const represented = actual.filter((title) => expected.includes(title));
      const duplicates = [
        ...new Set(represented.filter((title, index) => represented.indexOf(title) !== index)),
      ];
      const missing = expected.filter((title) => !actual.includes(title));
      return {
        suite: basename(stubFile, ".stub.test.ts"),
        expectedCount: expected.length,
        actualCount: represented.length,
        duplicateTitles: duplicates,
        missingTitles: missing,
      };
    });

    assert.deepStrictEqual(
      inventory.map((entry) => entry.expectedCount),
      [25, 27, 22, 21, 20, 21, 16, 20],
    );
    assert.deepStrictEqual(
      inventory.map((entry) => entry.actualCount - entry.expectedCount),
      [0, 0, 0, 0, 0, 0, 0, 0],
    );
    for (const entry of inventory) {
      assert.deepStrictEqual(entry.missingTitles, []);
      assert.deepStrictEqual(entry.duplicateTitles, []);
    }
  });
});
