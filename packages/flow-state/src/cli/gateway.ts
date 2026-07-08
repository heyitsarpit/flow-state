import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

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
    execFileSync(
      "pnpm",
      [
        "exec",
        "esbuild",
        gatewayPath,
        "--bundle",
        "--format=esm",
        "--platform=node",
        "--target=node22",
        `--outfile=${bundledPath}`,
        "--external:effect",
        "--external:flow-state",
        "--external:flow-state/*",
        "--external:next",
        "--external:react",
        "--external:react-dom",
      ],
      {
        cwd: projectRoot,
        encoding: "utf8",
        stdio: "pipe",
      },
    );

    const module = (await import(pathToFileURL(bundledPath).href)) as Readonly<{
      readonly BehaviorGateway?: unknown;
    }>;
    const gateway = module.BehaviorGateway;

    if (!isFlowBehaviorGateway(gateway)) {
      throw new Error(`Expected named export BehaviorGateway from ${gatewayPath}.`);
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
