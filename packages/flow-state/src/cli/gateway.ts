import { access, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, parse, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

import { buildBehaviorContract } from "../inspect.js";
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

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidGateway(path: string, expectation: string): never {
  throw new Error(`Invalid BehaviorGateway at ${path}: expected ${expectation}.`);
}

function requireString(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string") {
    invalidGateway(path, "a string");
  }
}

function requireFunction(
  value: unknown,
  path: string,
): asserts value is (...args: never[]) => unknown {
  if (typeof value !== "function") {
    invalidGateway(path, "a function");
  }
}

function requireStringArray(value: unknown, path: string): void {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    invalidGateway(path, "an array of strings");
  }
}

function validateStoryEntry(value: unknown, path: string): void {
  if (!isRecord(value)) {
    invalidGateway(path, "a story object");
  }
  requireString(value.id, `${path}.id`);
  requireString(value.title, `${path}.title`);
  if (!Array.isArray(value.events)) {
    invalidGateway(`${path}.events`, "an array of typed event objects");
  }
  for (const [eventIndex, event] of value.events.entries()) {
    if (!isRecord(event)) {
      invalidGateway(`${path}.events[${eventIndex}]`, "an event object");
    }
    requireString(event.type, `${path}.events[${eventIndex}].type`);
  }
  if (value.expectedState !== undefined) {
    requireString(value.expectedState, `${path}.expectedState`);
  }
  if (value.tags !== undefined) {
    requireStringArray(value.tags, `${path}.tags`);
  }
}

function validateStories(value: unknown): asserts value is FlowBehaviorGateway["stories"] {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    invalidGateway("stories", "an array of story descriptors");
  }
  for (const [descriptorIndex, descriptor] of value.entries()) {
    const path = `stories[${descriptorIndex}]`;
    if (!isRecord(descriptor) || descriptor.kind !== "stories") {
      invalidGateway(path, "a stories descriptor");
    }
    if (!isRecord(descriptor.machine) || descriptor.machine.kind !== "machine") {
      invalidGateway(`${path}.machine`, "a machine descriptor");
    }
    if (!Array.isArray(descriptor.stories)) {
      invalidGateway(`${path}.stories`, "an array of stories");
    }
    for (const [storyIndex, story] of descriptor.stories.entries()) {
      validateStoryEntry(story, `${path}.stories[${storyIndex}]`);
    }
  }
}

function validateApp(value: unknown): asserts value is FlowBehaviorGateway["app"] {
  if (!isRecord(value) || value.kind !== "app") {
    invalidGateway("app", "a Flow app descriptor");
  }
  requireString(value.id, "app.id");
  requireString(value.label, "app.label");
  if (!Array.isArray(value.modules)) {
    invalidGateway("app.modules", "an array of module descriptors");
  }
  requireFunction(value.inventory, "app.inventory");
  requireFunction(value.layer, "app.layer");
  for (const [moduleIndex, module] of value.modules.entries()) {
    const path = `app.modules[${moduleIndex}]`;
    if (!isRecord(module) || module.kind !== "module") {
      invalidGateway(path, "a module descriptor");
    }
    requireString(module.id, `${path}.id`);
    requireFunction(module.inventory, `${path}.inventory`);
    if (!isRecord(module.meta)) {
      invalidGateway(`${path}.meta`, "a module metadata object");
    }
  }
}

function validateFlowBehaviorGateway(value: unknown): asserts value is FlowBehaviorGateway {
  if (!isRecord(value)) {
    invalidGateway("export", "an object with an app descriptor");
  }
  validateApp(value.app);
  validateStories(value.stories);

  try {
    buildBehaviorContract(
      value.stories === undefined ? { app: value.app } : { app: value.app, stories: value.stories },
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid BehaviorGateway descriptor graph: ${detail}`);
  }
}

export function resolveProjectRoot(projectRootOption?: string): string {
  return resolve(projectRootOption ?? process.cwd());
}

export function resolveGatewayPath(projectRoot: string, gatewayOption?: string): string {
  return gatewayOption === undefined
    ? resolve(projectRoot, "src/app/behavior.ts")
    : resolve(projectRoot, gatewayOption);
}

async function findNodeModulesRoot(projectRoot: string): Promise<string | undefined> {
  let directory = projectRoot;
  const root = parse(directory).root;

  while (true) {
    const candidate = join(directory, "node_modules");
    try {
      await access(candidate);
      return candidate;
    } catch {
      if (directory === root) {
        return undefined;
      }
      directory = dirname(directory);
    }
  }
}

export async function loadBehaviorGateway(
  gatewayPath: string,
  projectRoot: string,
): Promise<FlowBehaviorGateway> {
  const tempRoot = await mkdtemp(join(tmpdir(), "flow-state-cli-"));
  const bundledPath = join(tempRoot, "behavior-gateway.mjs");

  try {
    const nodeModulesRoot = await findNodeModulesRoot(projectRoot);
    if (nodeModulesRoot !== undefined) {
      await symlink(nodeModulesRoot, join(tempRoot, "node_modules"), "dir");
    }

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

    if (gateway === undefined) {
      throw new Error(
        [
          `Expected named export BehaviorGateway from ${gatewayPath}.`,
          gatewayExportRecoveryHint(),
        ].join("\n"),
      );
    }

    validateFlowBehaviorGateway(gateway);

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
