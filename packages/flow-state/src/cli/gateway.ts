import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

import type { FlowBehaviorGateway } from "../inspect.js";

export type FlowCliGatewayOptions = Readonly<{
  readonly "project-root"?: string;
  readonly gateway?: string;
}>;

export type FlowCliGatewayTarget = Readonly<{
  projectRoot: string;
  gatewayPath: string;
  gateway: FlowBehaviorGateway;
}>;

function gatewayExportRecoveryHint(): string {
  return "Next step: export `BehaviorGateway` from that module, or omit `--gateway` to use `src/app/behavior.ts` under `--project-root`.";
}

function isFlowBehaviorGateway(value: unknown): value is FlowBehaviorGateway {
  const app = typeof value === "object" && value !== null && "app" in value ? value.app : undefined;

  return (
    typeof value === "object" &&
    value !== null &&
    typeof app === "object" &&
    app !== null &&
    "kind" in app &&
    app.kind === "app"
  );
}

export function resolveProjectRoot(projectRootOption?: string): string {
  return resolve(projectRootOption ?? process.cwd());
}

export function resolveGatewayPath(projectRoot: string, gatewayOption?: string): string {
  return gatewayOption === undefined
    ? resolve(projectRoot, "src/app/behavior.ts")
    : resolve(projectRoot, gatewayOption);
}

export async function loadBehaviorGateway(
  gatewayPath: string,
  projectRoot: string,
): Promise<FlowBehaviorGateway> {
  const tempRoot = await mkdtemp(join(projectRoot, ".flow-state-cli-"));
  const bundledPath = join(tempRoot, "behavior-gateway.mjs");

  try {
    try {
      await build({
        absWorkingDir: projectRoot,
        bundle: true,
        entryPoints: [gatewayPath],
        external: ["effect", "flow-state", "flow-state/*", "next", "react", "react-dom"],
        format: "esm",
        logLevel: "silent",
        outfile: bundledPath,
        platform: "node",
        target: "node22",
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : undefined;
      throw new Error(
        [
          `Failed to bundle BehaviorGateway from ${gatewayPath}.`,
          ...(detail === undefined ? [] : [detail]),
          gatewayExportRecoveryHint(),
        ].join("\n"),
      );
    }

    const module = (await import(pathToFileURL(bundledPath).href)) as Readonly<{
      readonly BehaviorGateway?: unknown;
    }>;
    const gateway = module.BehaviorGateway;

    if (!isFlowBehaviorGateway(gateway)) {
      throw new Error(
        [
          `Expected named export BehaviorGateway from ${gatewayPath}.`,
          gatewayExportRecoveryHint(),
        ].join("\n"),
      );
    }

    return gateway;
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

export async function loadGatewayTarget(
  options: FlowCliGatewayOptions = {},
): Promise<FlowCliGatewayTarget> {
  const projectRoot = resolveProjectRoot(options["project-root"]);
  const gatewayPath = resolveGatewayPath(projectRoot, options.gateway);
  const gateway = await loadBehaviorGateway(gatewayPath, projectRoot);

  return {
    projectRoot,
    gatewayPath,
    gateway,
  };
}
