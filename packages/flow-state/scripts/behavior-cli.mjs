import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildBehaviorContract,
  diffBehaviorContracts,
  renderBehaviorContract,
  renderBehaviorCoverage,
  renderBehaviorDiff,
} from "../dist/inspect.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const repoRoot = resolve(packageRoot, "..", "..");
const defaultOutputPath = resolve(repoRoot, "apps/docs/src/generated/behavior-contract.json");
const defaultInputPath = defaultOutputPath;

function usage() {
  return [
    "Usage:",
    "  flow-state behavior build [--project-root <path>] [--gateway <path>] [--output <path>]",
    "  flow-state behavior render [--input <path>] [--module <id>]",
    "  flow-state behavior render [--section coverage] [--project-root <path>] [--gateway <path>] [--module <id>]",
    "  flow-state behavior diff --left-input <path> --right-input <path> [--module <id>] [--format text|json]",
    "  flow-state behavior diff [--left-project-root <path>] [--left-gateway <path>] [--right-project-root <path>] [--right-gateway <path>] [--module <id>] [--format text|json]",
  ].join("\n");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(values) {
  const parsed = {};

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === undefined) {
      continue;
    }
    if (!value.startsWith("--")) {
      fail(usage());
    }

    const next = values[index + 1];
    if (next === undefined || next.startsWith("--")) {
      fail(`Missing value for ${value}.`);
    }

    parsed[value.slice(2)] = next;
    index += 1;
  }

  return parsed;
}

function gatewayPathFromOptions(options) {
  const projectRoot = resolve(options["project-root"] ?? process.cwd());
  const gatewayPath = resolve(options.gateway ?? join(projectRoot, "src/app/behavior.ts"));

  return {
    projectRoot,
    gatewayPath,
  };
}

async function loadBehaviorGateway(gatewayPath, projectRoot) {
  const tempRoot = await mkdtemp(join(projectRoot, ".flow-state-behavior-"));
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
      fail(`Expected named export BehaviorGateway from ${gatewayPath}.`);
    }

    return gateway;
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

async function readBehaviorContract(inputPath) {
  let source;

  try {
    source = await readFile(inputPath, "utf8");
  } catch (error) {
    fail(`Unable to read behavior contract at ${inputPath}: ${error.message}`);
  }

  let contract;

  try {
    contract = JSON.parse(source);
  } catch (error) {
    fail(`Unable to parse behavior contract JSON at ${inputPath}: ${error.message}`);
  }

  if (contract?.version !== "flow-state/behavior-contract.v1") {
    fail(`Expected a behavior contract JSON file at ${inputPath}.`);
  }

  return contract;
}

function outputFormat(options) {
  const format = options.format ?? "text";

  if (format !== "text" && format !== "json") {
    fail(`Unknown diff format '${format}'. Expected 'text' or 'json'.`);
  }

  return format;
}

async function resolveDiffContract(options, side) {
  const inputKey = `${side}-input`;
  const projectRootKey = `${side}-project-root`;
  const gatewayKey = `${side}-gateway`;
  const inputPath = options[inputKey];
  const projectRootOption = options[projectRootKey];
  const gatewayOption = options[gatewayKey];

  if (inputPath !== undefined) {
    if (projectRootOption !== undefined || gatewayOption !== undefined) {
      fail(
        `Do not mix --${inputKey} with --${projectRootKey} or --${gatewayKey}; compare either contract files or live build targets.`,
      );
    }

    return readBehaviorContract(resolve(inputPath));
  }

  if (projectRootOption === undefined && gatewayOption === undefined) {
    return undefined;
  }

  const projectRoot = resolve(projectRootOption ?? process.cwd());
  const gatewayPath = resolve(gatewayOption ?? join(projectRoot, "src/app/behavior.ts"));
  const gateway = await loadBehaviorGateway(gatewayPath, projectRoot);

  return buildBehaviorContract(gateway);
}

function diffMode(options) {
  const usingInputs = options["left-input"] !== undefined || options["right-input"] !== undefined;
  const usingTargets =
    options["left-project-root"] !== undefined ||
    options["left-gateway"] !== undefined ||
    options["right-project-root"] !== undefined ||
    options["right-gateway"] !== undefined;

  if (usingInputs && usingTargets) {
    fail("Do not mix contract-file inputs with live build-target flags in one diff command.");
  }

  if (usingInputs) {
    return "input";
  }

  if (usingTargets) {
    return "target";
  }

  fail(
    "Expected either --left-input/--right-input or left/right project-root or gateway flags for live build targets.",
  );
}

async function buildCommand(options) {
  const { projectRoot, gatewayPath } = gatewayPathFromOptions(options);
  const outputPath = resolve(options.output ?? defaultOutputPath);
  const gateway = await loadBehaviorGateway(gatewayPath, projectRoot);
  const contract = buildBehaviorContract(gateway);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
  console.log(`Wrote behavior contract to ${outputPath}.`);
}

async function renderCommand(options) {
  if (options.section !== undefined && options.section !== "coverage") {
    fail(`Unknown render section '${options.section}'.`);
  }

  if (options.section === "coverage") {
    if (options.input !== undefined) {
      fail(
        "`behavior render --section coverage` derives live story coverage from the behavior gateway, so `--input` is not supported.",
      );
    }

    const { projectRoot, gatewayPath } = gatewayPathFromOptions(options);
    const gateway = await loadBehaviorGateway(gatewayPath, projectRoot);

    console.log(
      renderBehaviorCoverage(gateway, {
        moduleId: options.module,
      }),
    );
    return;
  }

  const inputPath = resolve(options.input ?? defaultInputPath);
  const contract = await readBehaviorContract(inputPath);

  console.log(
    renderBehaviorContract(contract, {
      moduleId: options.module,
    }),
  );
}

async function diffCommand(options) {
  const format = outputFormat(options);
  diffMode(options);
  const left = await resolveDiffContract(options, "left");
  const right = await resolveDiffContract(options, "right");

  if (left === undefined || right === undefined) {
    fail(
      "Expected either --left-input/--right-input or left/right project-root or gateway flags for live build targets.",
    );
  }

  const diff = diffBehaviorContracts(left, right, {
    moduleId: options.module,
  });

  console.log(format === "json" ? JSON.stringify(diff, null, 2) : renderBehaviorDiff(diff));
}

const [namespace, command, ...rest] = process.argv.slice(2);

if (namespace !== "behavior" || command === undefined) {
  fail(usage());
}

const options = parseArgs(rest);

switch (command) {
  case "build":
    await buildCommand(options);
    break;
  case "render":
    await renderCommand(options);
    break;
  case "diff":
    await diffCommand(options);
    break;
  default:
    fail(usage());
}
