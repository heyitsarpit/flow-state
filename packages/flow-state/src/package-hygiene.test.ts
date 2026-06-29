import { describe, expect, it } from "vite-plus/test";

import packageJson from "../package.json";

type CorePackageJson = Readonly<{
  readonly files?: ReadonlyArray<string>;
  readonly sideEffects?: boolean | ReadonlyArray<string>;
  readonly exports?: Readonly<Record<string, unknown>>;
  readonly scripts?: Readonly<Record<string, string>>;
}>;

type BundleSizeBaseline = Readonly<{
  readonly entry: "dist/index.mjs";
  readonly bundleBytes: number;
  readonly gzipBytes: number;
  readonly maxGrowthRatio: number;
}>;

const supportFiles = import.meta.glob(
  "../scripts/{check-build-output.mjs,build-output-size-baseline.json}",
  {
    query: "?raw",
    import: "default",
    eager: true,
  },
) as Record<string, string>;

function requireSource(path: string): string {
  const source = supportFiles[path];
  expect(source).toBeDefined();
  if (!source) {
    throw new Error(`Missing ${path} source`);
  }

  return source;
}

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
      "./inspect": {
        types: "./dist/inspect.d.mts",
        import: "./dist/inspect.mjs",
      },
      "./server": {
        types: "./dist/server.d.mts",
        import: "./dist/server.mjs",
      },
      "./testing": {
        types: "./dist/testing.d.mts",
        import: "./dist/testing.mjs",
      },
      "./package.json": "./package.json",
    });
  });

  it("runs a build-output smoke gate as part of the core build", () => {
    const corePackageJson = packageJson as CorePackageJson;

    expect(corePackageJson.scripts).toMatchObject({
      "check:build-output": expect.any(String),
      "check:typescript-mode-proofs": expect.any(String),
    });
    expect(corePackageJson.scripts?.build).toContain("check:build-output");
    expect(corePackageJson.scripts?.build).toContain("check:typescript-mode-proofs");
    expect(corePackageJson.scripts?.pack).toContain("check:build-output");
    expect(corePackageJson.scripts?.pack).toContain("check:typescript-mode-proofs");
  });

  it("tracks a bundle-size baseline as part of the build-output smoke gate", () => {
    const baseline = JSON.parse(
      requireSource("../scripts/build-output-size-baseline.json"),
    ) as BundleSizeBaseline;
    const buildOutputCheckSource = requireSource("../scripts/check-build-output.mjs");

    expect(baseline).toMatchObject({
      entry: "dist/index.mjs",
      bundleBytes: expect.any(Number),
      gzipBytes: expect.any(Number),
      maxGrowthRatio: 1.05,
    });
    expect(baseline.bundleBytes).toBeGreaterThan(0);
    expect(baseline.gzipBytes).toBeGreaterThan(0);
    expect(buildOutputCheckSource).toContain("bundle-size baseline");
    expect(buildOutputCheckSource).toContain("maxGrowthRatio");
    expect(buildOutputCheckSource).toContain("gzipBytes");
  });
});
