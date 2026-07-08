import { describe, expect, it } from "vite-plus/test";

import packageJson from "../package.json";

type CorePackageJson = Readonly<{
  readonly files?: ReadonlyArray<string>;
  readonly sideEffects?: boolean | ReadonlyArray<string>;
  readonly exports?: Readonly<Record<string, unknown>>;
  readonly scripts?: Readonly<Record<string, string>>;
}>;

type ProofPackageJson = Readonly<{
  readonly scripts?: Readonly<Record<string, string>>;
}>;

type BundleSizeBaseline = Readonly<{
  readonly entry: "dist/index.mjs";
  readonly bundleBytes: number;
  readonly gzipBytes: number;
  readonly maxGrowthRatio: number;
}>;

const supportFiles = import.meta.glob(
  "../scripts/{behavior-cli.mjs,check-build-output.mjs,check-typescript-mode-proofs.mjs,build-output-size-baseline.json,inspect-local-proof.mjs}",
  {
    query: "?raw",
    import: "default",
    eager: true,
  },
) as Record<string, string>;

const proofPackageJsons = import.meta.glob("../../../examples/typescript-proof-*/package.json", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const proofTsconfigs = import.meta.glob("../../../examples/typescript-proof-*/tsconfig.json", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const obsoletePackageJsons = import.meta.glob(
  "../../../packages/flow-state-{react,testing,server,inspect}/package.json",
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

describe("flow-state package hygiene", () => {
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
      "./package.json": "./package.json",
      "./react": {
        types: "./dist/react-entry.d.mts",
        import: "./dist/react-entry.mjs",
      },
      "./server": {
        types: "./dist/server.d.mts",
        import: "./dist/server.mjs",
      },
      "./testing": {
        types: "./dist/testing.d.mts",
        import: "./dist/testing.mjs",
      },
    });
    expect(Object.keys(corePackageJson.exports ?? {}).sort()).toEqual([
      ".",
      "./inspect",
      "./package.json",
      "./react",
      "./server",
      "./testing",
    ]);
  });

  it("does not keep wrapper publishing packages around the single-package surface", () => {
    expect(Object.keys(obsoletePackageJsons)).toEqual([]);
  });

  it("runs a build-output smoke gate as part of the core build", () => {
    const corePackageJson = packageJson as CorePackageJson;

    expect(corePackageJson.scripts).toMatchObject({
      "check:build-output": expect.any(String),
      "check:typescript-mode-proofs": expect.any(String),
    });
    expect(corePackageJson.scripts?.build).toContain("check:build-output");
    expect(corePackageJson.scripts?.pack).toContain("check:build-output");
    expect(corePackageJson.scripts?.build).toContain("src/index.ts");
    expect(corePackageJson.scripts?.build).toContain("src/react-entry.ts");
    expect(corePackageJson.scripts?.build).toContain("src/testing.ts");
    expect(corePackageJson.scripts?.build).toContain("src/server.ts");
    expect(corePackageJson.scripts?.build).toContain("src/inspect.ts");
    expect(corePackageJson.scripts?.pack).toContain("src/index.ts");
    expect(corePackageJson.scripts?.pack).toContain("src/react-entry.ts");
    expect(corePackageJson.scripts?.pack).toContain("src/testing.ts");
    expect(corePackageJson.scripts?.pack).toContain("src/server.ts");
    expect(corePackageJson.scripts?.pack).toContain("src/inspect.ts");
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

  it("runs a multi-entry declaration proof as part of the TypeScript mode gate", () => {
    const typescriptProofSource = requireSource("../scripts/check-typescript-mode-proofs.mjs");

    expect(typescriptProofSource).toContain("multi-entry declaration emit");
    expect(typescriptProofSource).toContain("typescript-proof-multi-entry");
  });

  it("ships a dedicated local inspection proof script for CLI-first debugging", () => {
    const corePackageJson = packageJson as CorePackageJson;
    const localProofSource = requireSource("../scripts/inspect-local-proof.mjs");

    expect(corePackageJson.scripts).toMatchObject({
      "inspect:local-proof": "node ./scripts/inspect-local-proof.mjs",
    });
    expect(localProofSource).toContain('from "../dist/inspect.mjs"');
    expect(localProofSource).toContain("createLocalInspectionProof");
    expect(localProofSource).toContain("runtime.inspection.entries()");
    expect(localProofSource).toContain("captureTrace(actor.snapshot()");
  });

  it("ships a dedicated behavior CLI script for contract build, rendering, and diffing", () => {
    const corePackageJson = packageJson as CorePackageJson;
    const cliSource = requireSource("../scripts/behavior-cli.mjs");

    expect(corePackageJson.scripts).toMatchObject({
      "behavior:cli": "node ./scripts/behavior-cli.mjs",
    });
    expect(cliSource).toContain("flow-state behavior build");
    expect(cliSource).toContain("flow-state behavior render");
    expect(cliSource).toContain("flow-state behavior diff");
    expect(cliSource).toContain("--gateway");
    expect(cliSource).toContain("--module");
    expect(cliSource).toContain("--section");
    expect(cliSource).toContain("coverage");
    expect(cliSource).toContain("--left-input");
    expect(cliSource).toContain("--right-input");
    expect(cliSource).toContain("--left-project-root");
    expect(cliSource).toContain("--right-project-root");
    expect(cliSource).toContain("--left-gateway");
    expect(cliSource).toContain("--right-gateway");
    expect(cliSource).toContain("--format");
  });

  it("drives the important TypeScript mode proofs through dedicated packages", () => {
    const packagePaths = Object.keys(proofPackageJsons).sort();
    const tsconfigPaths = Object.keys(proofTsconfigs).sort();
    const typescriptProofSource = requireSource("../scripts/check-typescript-mode-proofs.mjs");

    expect(packagePaths).toEqual([
      "../../../examples/typescript-proof-isolated-declarations/package.json",
      "../../../examples/typescript-proof-isolated-modules/package.json",
      "../../../examples/typescript-proof-multi-entry/package.json",
      "../../../examples/typescript-proof-strict/package.json",
    ]);
    expect(tsconfigPaths).toEqual([
      "../../../examples/typescript-proof-isolated-declarations/tsconfig.json",
      "../../../examples/typescript-proof-isolated-modules/tsconfig.json",
      "../../../examples/typescript-proof-multi-entry/tsconfig.json",
      "../../../examples/typescript-proof-strict/tsconfig.json",
    ]);

    for (const packagePath of packagePaths) {
      const proofPackageJson = JSON.parse(
        proofPackageJsons[packagePath] ?? "{}",
      ) as ProofPackageJson;

      expect(proofPackageJson.scripts).toMatchObject({
        "check:typescript-mode-proofs": expect.any(String),
      });
    }

    expect(typescriptProofSource).toContain("typescript-proof-strict");
    expect(typescriptProofSource).toContain("typescript-proof-isolated-modules");
    expect(typescriptProofSource).toContain("typescript-proof-isolated-declarations");
    expect(typescriptProofSource).toContain("typescript-proof-multi-entry");
    expect(typescriptProofSource).toContain('resolve(repoRoot, "examples"');
  });
});
