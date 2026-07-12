import { describe, expect, it } from "vite-plus/test";

import packageJson from "../package.json";

type CorePackageJson = Readonly<{
  readonly bin?: string | Readonly<Record<string, string>>;
  readonly dependencies?: Readonly<Record<string, string>>;
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
  "../scripts/{behavior-cli.mjs,check-build-output.mjs,check-typescript-mode-proofs.mjs,build-output-size-baseline.json,inspect-local-proof.mjs,inspect-feature-receipts.mjs,module-app-audit-receipts.mjs,flow-state-cli.mjs}",
  {
    query: "?raw",
    import: "default",
    eager: true,
  },
) as Record<string, string>;

const cliSourceFiles = import.meta.glob(
  "./cli/{index.ts,shared.ts,gateway.ts,output-projections.ts,story-read.ts,story-run.ts,story-registry.ts,behavior-contract.ts,trace-input.ts,story-paths.ts,trace-diff.ts}",
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

function requireCliSource(path: string): string {
  const source = cliSourceFiles[path];
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
    expect(corePackageJson.bin).toEqual({
      "flow-state": "./dist/cli/index.mjs",
    });
    expect(corePackageJson.dependencies).toMatchObject({
      "@effect/platform-node": "4.0.0-beta.86",
    });
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
      "check:cli-source-types": "pnpm exec tsc -p tsconfig.json --noEmit",
      "check:typescript-mode-proofs": expect.any(String),
    });
    expect(corePackageJson.scripts?.build).toContain("check:cli-source-types");
    expect(corePackageJson.scripts?.build).toContain("check:build-output");
    expect(corePackageJson.scripts?.pack).toContain("check:cli-source-types");
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
      "p0-1c:measure": "node ./scripts/measure-p0-1c-baseline.mjs",
    });
    expect(localProofSource).toContain('from "../dist/inspect.mjs"');
    expect(localProofSource).toContain("createLocalInspectionProof");
    expect(localProofSource).toContain("runtime.inspection.entries()");
    expect(localProofSource).toContain("captureTrace(actor.getSnapshot()");
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

  it("keeps the canonical CLI source under src/cli and leaves scripts as compatibility wrappers", () => {
    const flowStateCliWrapperSource = requireSource("../scripts/flow-state-cli.mjs");
    const behaviorCliWrapperSource = requireSource("../scripts/behavior-cli.mjs");
    const flowStateCliSource = requireCliSource("./cli/index.ts");
    const sharedCliSource = requireCliSource("./cli/shared.ts");
    const gatewaySource = requireCliSource("./cli/gateway.ts");
    const outputProjectionsSource = requireCliSource("./cli/output-projections.ts");
    const storyReadSource = requireCliSource("./cli/story-read.ts");
    const storyRunSource = requireCliSource("./cli/story-run.ts");
    const storyRegistrySource = requireCliSource("./cli/story-registry.ts");
    const behaviorContractSource = requireCliSource("./cli/behavior-contract.ts");
    const traceInputSource = requireCliSource("./cli/trace-input.ts");
    const storyPathsSource = requireCliSource("./cli/story-paths.ts");
    const traceDiffSource = requireCliSource("./cli/trace-diff.ts");

    expect(flowStateCliWrapperSource).toContain('from "../dist/cli/index.mjs"');
    expect(behaviorCliWrapperSource).toContain('from "../dist/cli/index.mjs"');
    expect(flowStateCliSource).toContain('from "./shared.js"');
    expect(flowStateCliSource).toContain('from "./behavior-contract.js"');
    expect(flowStateCliSource).toContain('from "./output-projections.js"');
    expect(flowStateCliSource).toContain('from "../inspect.js"');
    expect(flowStateCliSource).toContain('from "../testing.js"');
    expect(flowStateCliSource).not.toContain('from "../../dist/inspect.mjs"');
    expect(flowStateCliSource).not.toContain('from "../../dist/testing.mjs"');
    expect(flowStateCliSource).not.toContain("@ts-nocheck");
    expect(flowStateCliSource).not.toContain("as never");
    expect(flowStateCliSource).not.toContain("async function readBehaviorContract");
    expect(flowStateCliSource).not.toContain("async function resolveBehaviorDiffContract");
    expect(flowStateCliSource).not.toContain("function behaviorDiffMode");
    expect(sharedCliSource).toContain('from "./gateway.js"');
    expect(sharedCliSource).toContain('from "./story-registry.js"');
    expect(sharedCliSource).toContain('from "./story-read.js"');
    expect(sharedCliSource).toContain('from "./story-run.js"');
    expect(sharedCliSource).toContain('from "./trace-input.js"');
    expect(sharedCliSource).toContain('from "./story-paths.js"');
    expect(sharedCliSource).toContain('from "./trace-diff.js"');
    expect(sharedCliSource).toContain('from "../inspect.js"');
    expect(sharedCliSource).not.toContain('from "../../dist/inspect.mjs"');
    expect(sharedCliSource).not.toContain("@ts-nocheck");
    expect(sharedCliSource).not.toContain("export async function loadBehaviorGateway");
    expect(sharedCliSource).not.toContain("export function createStoryRegistry");
    expect(sharedCliSource).not.toContain("export async function normalizeTraceInput");
    expect(sharedCliSource).not.toContain("export async function normalizeTraceProofInput");
    expect(sharedCliSource).not.toContain("export function normalizeStoryPathRequest");
    expect(sharedCliSource).not.toContain("export function formatStoryListText");
    expect(sharedCliSource).not.toContain("export function formatStoryDescribeText");
    expect(sharedCliSource).not.toContain("export function storyListJson");
    expect(sharedCliSource).not.toContain("export function storyDescribeJson");
    expect(sharedCliSource).not.toContain("export function createStoryRunEnvelope");
    expect(sharedCliSource).not.toContain("export function formatStoryRunPretty");
    expect(sharedCliSource).not.toContain("export function formatStoryRunCompact");
    expect(sharedCliSource).not.toContain("export function createStoryPathListEnvelope");
    expect(sharedCliSource).not.toContain("export const traceDiffSectionNames = Object.freeze([");
    expect(sharedCliSource).not.toContain("export function createTraceDiffEnvelope");
    expect(outputProjectionsSource).toContain("behaviorDiffProjection");
    expect(outputProjectionsSource).toContain("traceSummaryEnvelopeProjection");
    expect(outputProjectionsSource).toContain("contextualizedTraceSummaryProjection");
    expect(outputProjectionsSource).toContain("traceDiffProjection");
    expect(outputProjectionsSource).not.toContain("Effect");
    expect(gatewaySource).toContain("loadBehaviorGateway");
    expect(gatewaySource).toContain("loadGatewayTarget");
    expect(storyReadSource).toContain("formatStoryListText");
    expect(storyReadSource).toContain("formatStoryDescribeText");
    expect(storyReadSource).toContain("storyListJson");
    expect(storyReadSource).toContain("storyDescribeJson");
    expect(storyReadSource).toContain("export type FlowCliStoryListEnvelope");
    expect(storyReadSource).toContain("export type FlowCliStoryDescribeEnvelope");
    expect(storyReadSource).not.toContain("runFlowStory");
    expect(storyReadSource).not.toContain("receiptSummary");
    expect(storyReadSource).not.toContain("summarizeTrace");
    expect(storyRunSource).toContain("createStoryRunEnvelope");
    expect(storyRunSource).toContain("formatStoryRunPretty");
    expect(storyRunSource).toContain("formatStoryRunCompact");
    expect(storyRunSource).toContain("export type FlowCliStoryRunEnvelope");
    expect(storyRunSource).not.toContain("summarizeTrace");
    expect(storyRunSource).not.toContain("createTraceProofEnvelope");
    expect(storyRunSource).not.toContain("normalizeTraceInput");
    expect(storyRegistrySource).toContain("createMachineRegistry");
    expect(storyRegistrySource).toContain("createStoryRegistry");
    expect(behaviorContractSource).toContain("readBehaviorContract");
    expect(behaviorContractSource).toContain("resolveBehaviorDiffContract");
    expect(behaviorContractSource).toContain("behaviorDiffMode");
    expect(behaviorContractSource).toContain('from "../inspect.js"');
    expect(behaviorContractSource).not.toContain('from "../../dist/inspect.mjs"');
    expect(behaviorContractSource).not.toContain("TS5097");
    expect(behaviorContractSource).not.toContain("@ts-expect-error");
    expect(traceInputSource).toContain("normalizeTraceInput");
    expect(traceInputSource).toContain("normalizeTraceProofInput");
    expect(traceInputSource).toContain("createLocalInspectionProof");
    expect(traceInputSource).toContain("importTraceArtifact");
    expect(storyPathsSource).toContain("normalizeStoryPathRequest");
    expect(storyPathsSource).toContain("createStoryPathListEnvelope");
    expect(storyPathsSource).toContain("createStoryPathCheckEnvelope");
    expect(storyPathsSource).toContain("formatStoryPathListText");
    expect(storyPathsSource).toContain("formatStoryPathCheckText");
    expect(storyPathsSource).toContain("export type FlowCliStoryPathListEnvelope");
    expect(storyPathsSource).toContain("export type FlowCliStoryPathCheckEnvelope");
    expect(storyPathsSource).not.toContain("runFlowStory");
    expect(storyPathsSource).not.toContain("receiptSummary");
    expect(storyPathsSource).not.toContain("summarizeTrace");
    expect(traceDiffSource).toContain("traceDiffSectionNames");
    expect(traceDiffSource).toContain("createTraceDiffEnvelope");
    expect(traceDiffSource).toContain("createTraceDiffSectionEnvelope");
    expect(traceDiffSource).toContain("formatTraceDiffText");
    expect(traceDiffSource).toContain("formatTraceDiffSectionText");
    expect(flowStateCliSource).not.toContain("inspect-feature-receipts");
    expect(flowStateCliSource).not.toContain("module-app-audit-receipts");
    expect(flowStateCliSource).not.toContain("formatHarnessTracePretty");
    expect(sharedCliSource).toContain("summarizeTrace");
    expect(sharedCliSource).toContain("export type FlowCliBehaviorCoverageEnvelope");
    expect(sharedCliSource).toContain("export type FlowCliTraceSummaryEnvelope");
    expect(sharedCliSource).toContain("export type FlowCliTraceContextualizedSummaryEnvelope");
    expect(sharedCliSource).toContain("export type FlowCliTraceProofEnvelope");
    expect(sharedCliSource).not.toContain("diffTrace");
    expect(sharedCliSource).not.toContain("createLocalInspectionProof");
    expect(sharedCliSource).not.toContain("No legal path matched the supplied event sequence.");
    expect(sharedCliSource).not.toContain("inspect-feature-receipts");
    expect(sharedCliSource).not.toContain("module-app-audit-receipts");
  });

  it("keeps exploratory proof generators separate from the generic public CLI", () => {
    const corePackageJson = packageJson as CorePackageJson;
    const flowStateCliSource = requireSource("../scripts/flow-state-cli.mjs");
    const featureReceiptSource = requireSource("../scripts/inspect-feature-receipts.mjs");
    const auditReceiptSource = requireSource("../scripts/module-app-audit-receipts.mjs");

    expect(corePackageJson.scripts).not.toHaveProperty("inspect:feature-receipts");
    expect(corePackageJson.scripts).not.toHaveProperty("audit:receipts");
    expect(flowStateCliSource).not.toContain("inspect-feature-receipts");
    expect(flowStateCliSource).not.toContain("module-app-audit-receipts");
    expect(flowStateCliSource).not.toContain("local-proof");
    expect(featureReceiptSource).toContain("inspect.demo.machine");
    expect(featureReceiptSource).toContain("flowStories");
    expect(auditReceiptSource).toContain("audit.project");
    expect(auditReceiptSource).toContain("flowTest");
  });

  it("drives the important TypeScript mode proofs through dedicated packages", () => {
    const packagePaths = Object.keys(proofPackageJsons).sort();
    const tsconfigPaths = Object.keys(proofTsconfigs).sort();
    const typescriptProofSource = requireSource("../scripts/check-typescript-mode-proofs.mjs");

    expect(packagePaths).toEqual([
      "../../../examples/typescript-proof-isolated-declarations/package.json",
      "../../../examples/typescript-proof-isolated-modules/package.json",
      "../../../examples/typescript-proof-multi-entry/package.json",
      "../../../examples/typescript-proof-packed-react-18/package.json",
      "../../../examples/typescript-proof-packed-react-19/package.json",
      "../../../examples/typescript-proof-strict/package.json",
    ]);
    expect(tsconfigPaths).toEqual([
      "../../../examples/typescript-proof-isolated-declarations/tsconfig.json",
      "../../../examples/typescript-proof-isolated-modules/tsconfig.json",
      "../../../examples/typescript-proof-multi-entry/tsconfig.json",
      "../../../examples/typescript-proof-packed-react-18/tsconfig.json",
      "../../../examples/typescript-proof-packed-react-19/tsconfig.json",
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
    expect(typescriptProofSource).toContain("typescript-proof-packed-react-18");
    expect(typescriptProofSource).toContain("typescript-proof-packed-react-19");
    expect(typescriptProofSource).toContain('resolve(repoRoot, "examples"');
  });
});
