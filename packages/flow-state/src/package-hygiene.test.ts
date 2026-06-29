import { describe, expect, it } from "vite-plus/test";

import packageJson from "../package.json";

type CorePackageJson = Readonly<{
  readonly files?: ReadonlyArray<string>;
  readonly sideEffects?: boolean | ReadonlyArray<string>;
  readonly exports?: Readonly<Record<string, unknown>>;
  readonly scripts?: Readonly<Record<string, string>>;
}>;

describe("@flow-state/core package hygiene", () => {
  it("publishes only dist artifacts with tree-shakeable package metadata", () => {
    const corePackageJson = packageJson as CorePackageJson;

    expect(corePackageJson.files).toEqual(["dist"]);
    expect(corePackageJson.sideEffects).toBe(false);
    expect(corePackageJson.exports).toMatchObject({
      ".": {
        types: "./dist/index.d.mts",
        import: "./dist/index.mjs",
      },
      "./package.json": "./package.json",
    });
  });

  it("runs a build-output smoke gate as part of the core build", () => {
    const corePackageJson = packageJson as CorePackageJson;

    expect(corePackageJson.scripts).toMatchObject({
      "check:build-output": expect.any(String),
    });
    expect(corePackageJson.scripts?.build).toContain("check:build-output");
    expect(corePackageJson.scripts?.pack).toContain("check:build-output");
  });
});
