import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { storyToDoc } from "../dist/inspect.mjs";

function isMachine(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    "kind" in value &&
    value.kind === "machine" &&
    "id" in value &&
    typeof value.id === "string"
  );
}

export function resolveProjectRoot(projectRootOption) {
  return resolve(projectRootOption ?? process.cwd());
}

export function resolveGatewayPath(projectRoot, gatewayOption) {
  return gatewayOption === undefined
    ? resolve(projectRoot, "src/app/behavior.ts")
    : resolve(projectRoot, gatewayOption);
}

export async function loadBehaviorGateway(gatewayPath, projectRoot) {
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

    const module = await import(pathToFileURL(bundledPath).href);
    const gateway = module.BehaviorGateway;

    if (
      typeof gateway !== "object" ||
      gateway === null ||
      !("app" in gateway) ||
      typeof gateway.app !== "object" ||
      gateway.app === null ||
      gateway.app.kind !== "app"
    ) {
      throw new Error(`Expected named export BehaviorGateway from ${gatewayPath}.`);
    }

    return gateway;
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

export async function loadGatewayTarget(options = {}) {
  const projectRoot = resolveProjectRoot(options["project-root"]);
  const gatewayPath = resolveGatewayPath(projectRoot, options.gateway);
  const gateway = await loadBehaviorGateway(gatewayPath, projectRoot);

  return {
    projectRoot,
    gatewayPath,
    gateway,
  };
}

export function createMachineRegistry(app) {
  const machines = new Map();

  for (const module of app.modules) {
    const registry = module.machines;
    if (registry === undefined || registry === null || typeof registry !== "object") {
      continue;
    }

    for (const machine of Object.values(registry)) {
      if (!isMachine(machine)) {
        continue;
      }

      const existing = machines.get(machine.id);
      if (existing !== undefined && existing !== machine) {
        throw new Error(
          `Duplicate machine id '${machine.id}' in the assembled app. Rename one machine before using the shared story registry.`,
        );
      }

      machines.set(machine.id, machine);
    }
  }

  return machines;
}

export function createStoryRegistry(gateway) {
  const machinesById = createMachineRegistry(gateway.app);
  const entries = [];
  const seenIds = new Set();

  for (const descriptor of gateway.stories ?? []) {
    const ownedMachine = machinesById.get(descriptor.machine.id);
    if (ownedMachine !== descriptor.machine) {
      throw new Error(
        `BehaviorGateway stories reference machine '${descriptor.machine.id}', but the assembled app does not own it.`,
      );
    }

    for (const story of descriptor.stories) {
      if (seenIds.has(story.id)) {
        throw new Error(
          `Duplicate story id '${story.id}' in BehaviorGateway.stories. Rename the story so agents can resolve it unambiguously.`,
        );
      }

      seenIds.add(story.id);
      entries.push(
        Object.freeze({
          machine: descriptor.machine,
          machineId: descriptor.machine.id,
          story,
          doc: storyToDoc(story),
        }),
      );
    }
  }

  return Object.freeze({
    app: gateway.app,
    machinesById,
    stories: Object.freeze(entries),
    storiesById: new Map(entries.map((entry) => [entry.story.id, entry])),
  });
}

export function formatStoryListText(entries) {
  const lines = ["# Stories"];

  if (entries.length === 0) {
    lines.push("", "- No stories matched the current filters.");
    return lines.join("\n");
  }

  for (const entry of entries) {
    const detailParts = [`start=${entry.doc.start.kind}`];

    if (entry.story.expectedState !== undefined) {
      detailParts.push(`expectedState=${entry.story.expectedState}`);
    }

    if (entry.doc.tags.length > 0) {
      detailParts.push(`tags=${entry.doc.tags.join(",")}`);
    }

    if (entry.doc.seed !== undefined) {
      detailParts.push(`seed=${entry.doc.seed.label}`);
    }

    lines.push(
      "",
      `- ${entry.story.id} [${entry.machineId}] ${entry.story.title}`,
      `  ${detailParts.join(" | ")}`,
    );
  }

  return lines.join("\n");
}

function formatList(values) {
  return values.length === 0 ? "none" : values.join(", ");
}

export function formatStoryDescribeText(entry) {
  const lines = [
    `# Story: ${entry.story.id}`,
    `Machine: ${entry.machineId}`,
    `Title: ${entry.story.title}`,
  ];

  if (entry.story.description !== undefined) {
    lines.push(`Description: ${entry.story.description}`);
  }

  lines.push(`Start: ${entry.doc.start.label}`);

  if (entry.doc.seed !== undefined) {
    lines.push(`Seed: ${entry.doc.seed.label}`);
  }

  lines.push(`Tags: ${formatList(entry.doc.tags)}`);
  lines.push("Events:");

  if (entry.doc.events.length === 0) {
    lines.push("- none");
  } else {
    for (const event of entry.doc.events) {
      lines.push(`- ${event.label}`);
    }
  }

  lines.push("Expectations:");
  if (entry.doc.expectations.length === 0) {
    lines.push("- none");
  } else {
    for (const expectation of entry.doc.expectations) {
      lines.push(`- ${expectation.label}`);
    }
  }

  return lines.join("\n");
}

export function storyListJson(entries) {
  return Object.freeze({
    kind: "story-list",
    stories: Object.freeze(
      entries.map((entry) =>
        Object.freeze({
          id: entry.story.id,
          machineId: entry.machineId,
          title: entry.story.title,
          description: entry.story.description,
          start: entry.doc.start.kind,
          expectedState: entry.story.expectedState,
          tags: entry.doc.tags,
          ...(entry.doc.seed === undefined
            ? {}
            : {
                seed: Object.freeze({
                  label: entry.doc.seed.label,
                  fixtures: entry.doc.seed.fixtures,
                  resourceCount: entry.doc.seed.resourceCount,
                  hasBoot: entry.doc.seed.hasBoot,
                  ...(entry.doc.seed.actorId === undefined
                    ? {}
                    : { actorId: entry.doc.seed.actorId }),
                }),
              }),
        }),
      ),
    ),
  });
}

export function storyDescribeJson(entry) {
  return Object.freeze({
    kind: "story-describe",
    machineId: entry.machineId,
    story: entry.doc,
  });
}
