import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const packageRoot = resolve(repoRoot, "packages", "flow-state");
const outputRoot = mkdtempSync(join(tmpdir(), "flow-state-example-cli-"));
const examples = [
  "launch-workspace",
  "basic-cached-posts",
  "optimistic-transactions",
  "bounded-infinite-feed",
  "server-prefetch-hydration",
  "offline-recovery",
];
const consumerRoots = new Map();

function executeProcess(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    env: { ...process.env, CI: "true" },
    ...options,
  });
}

function runProcess(command, args, options = {}) {
  const result = executeProcess(command, args, options);
  if (result.status !== 0) {
    throw new Error(
      [
        `${command} ${args.join(" ")} failed in ${options.cwd ?? process.cwd()}.`,
        result.stdout.trim(),
        result.stderr.trim(),
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
  }
  return result.stdout;
}

function preparePackedConsumers() {
  const packRoot = join(outputRoot, "pack");
  mkdirSync(packRoot);
  runProcess("pnpm", ["pack", "--pack-destination", packRoot], { cwd: packageRoot });
  const tarball = join(packRoot, "flow-state-0.0.0.tgz");
  assert(readFileSync(tarball).length > 0, "pnpm pack did not produce a non-empty tarball.");

  for (const example of examples) {
    const sourceRoot = resolve(repoRoot, "examples", example);
    const consumerRoot = join(outputRoot, "consumers", example);
    cpSync(sourceRoot, consumerRoot, {
      recursive: true,
      filter: (source) => ![".next", "node_modules"].includes(basename(source)),
    });
    const manifestPath = join(consumerRoot, "package.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    for (const section of ["dependencies", "devDependencies"]) {
      for (const name of Object.keys(manifest[section] ?? {})) {
        if (name !== "flow-state") {
          manifest[section][name] = `link:${join(sourceRoot, "node_modules", ...name.split("/"))}`;
        }
      }
    }
    manifest.dependencies["flow-state"] = `file:${tarball}`;
    manifest.pnpm = {
      ...manifest.pnpm,
      overrides: {
        ...manifest.pnpm?.overrides,
        "@effect/platform-node": `link:${join(packageRoot, "node_modules/@effect/platform-node")}`,
        "@tanstack/store": `link:${join(packageRoot, "node_modules/@tanstack/store")}`,
        effect: `link:${join(sourceRoot, "node_modules/effect")}`,
        esbuild: `link:${join(packageRoot, "node_modules/esbuild")}`,
      },
    };
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    runProcess(
      "pnpm",
      [
        "install",
        "--offline",
        "--ignore-scripts",
        "--no-frozen-lockfile",
        "--strict-peer-dependencies",
      ],
      { cwd: consumerRoot },
    );
    consumerRoots.set(example, consumerRoot);
  }
}

function execute(example, args, options = {}) {
  const consumerRoot = consumerRoots.get(example);
  assert(consumerRoot !== undefined, `${example}: packed consumer was not prepared.`);
  return executeProcess("pnpm", ["exec", "flow-state", ...args], {
    cwd: consumerRoot,
    ...options,
  });
}

function run(example, args) {
  const result = execute(example, args);
  if (result.status !== 0) {
    throw new Error(
      [
        `${example}: flow-state ${args.join(" ")} failed.`,
        result.stdout.trim(),
        result.stderr.trim(),
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
  }
  return result.stdout;
}

function parseJson(label, source) {
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`${label} did not emit JSON.`, { cause: error });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  preparePackedConsumers();
  for (const example of examples) {
    const help = run(example, ["--help"]);
    for (const family of ["behavior", "story", "trace"]) {
      assert(help.includes(family), `${example}: root help omitted '${family}'.`);
      run(example, [family, "--help"]);
    }

    const firstContractPath = join(outputRoot, `${example}-contract-a.json`);
    const secondContractPath = join(outputRoot, `${example}-contract-b.json`);
    run(example, ["behavior", "build", "--project-root", ".", "--output", firstContractPath]);
    run(example, ["behavior", "build", "--project-root", ".", "--output", secondContractPath]);
    const firstContract = readFileSync(firstContractPath, "utf8");
    const secondContract = readFileSync(secondContractPath, "utf8");
    assert(
      firstContract === secondContract,
      `${example}: behavior artifacts were not deterministic.`,
    );
    const contract = parseJson(`${example} behavior contract`, firstContract);

    const renderedText = run(example, ["behavior", "render", "--input", firstContractPath]);
    const renderedJson = parseJson(
      `${example} behavior render`,
      run(example, ["behavior", "render", "--input", firstContractPath, "--format", "json"]),
    );
    assert(
      renderedText.includes(contract.app.id) && renderedJson.app?.id === contract.app.id,
      `${example}: behavior text/JSON projections disagreed on app identity.`,
    );

    const storyText = run(example, ["story", "list", "--project-root", "."]);
    const firstStoryJson = run(example, [
      "story",
      "list",
      "--project-root",
      ".",
      "--format",
      "json",
    ]);
    const secondStoryJson = run(example, [
      "story",
      "list",
      "--project-root",
      ".",
      "--format",
      "json",
    ]);
    assert(
      firstStoryJson === secondStoryJson,
      `${example}: story discovery was not deterministic.`,
    );
    const storyList = parseJson(`${example} story list`, firstStoryJson);
    assert(storyList.kind === "story-list", `${example}: story JSON used the wrong envelope.`);
    for (const story of storyList.stories) {
      assert(storyText.includes(story.id), `${example}: story text omitted '${story.id}'.`);
    }

    const rejected = execute(example, [
      "story",
      "describe",
      "missing-story",
      "--project-root",
      ".",
    ]);
    assert(
      rejected.status !== 0 && rejected.stderr.includes("error [invalid-input]"),
      `${example}: missing story did not return typed non-success output.`,
    );
  }

  const optimisticStory = parseJson(
    "optimistic story run",
    run("optimistic-transactions", [
      "story",
      "run",
      "draft-example",
      "--project-root",
      ".",
      "--format",
      "json",
    ]),
  );
  assert(optimisticStory.evidence?.ok === true, "Optimistic story execution did not pass.");

  const pathText = run("bounded-infinite-feed", [
    "story",
    "paths",
    "--project-root",
    ".",
    "--machine",
    "feed.window",
    "--strategy",
    "shortest",
    "--event",
    '{"type":"NEXT"}',
  ]);
  assert(pathText.includes("story.paths feed.window"), "Bounded-feed path proof was missing.");

  const tracePath = join(outputRoot, "launch-assistant-running.json");
  run("launch-workspace", [
    "story",
    "run",
    "assistant-running",
    "--project-root",
    ".",
    "--save-trace",
    tracePath,
  ]);
  const traceText = run("launch-workspace", ["trace", "summarize", tracePath]);
  const traceJson = parseJson(
    "launch trace summary",
    run("launch-workspace", ["trace", "summarize", tracePath, "--format", "json"]),
  );
  assert(
    traceText.includes(traceJson.machineId) && traceJson.summary?.finalState === "runningAssistant",
    "Launch trace text/JSON projections disagreed.",
  );
  const selfDiff = parseJson(
    "launch trace self-diff",
    run("launch-workspace", ["trace", "diff", tracePath, tracePath, "--format", "json"]),
  );
  assert(selfDiff.summary?.matches === true, "Launch trace self-diff was not reflexive.");

  console.log("Example CLI acceptance ok for all six applications.");
} finally {
  rmSync(outputRoot, { force: true, recursive: true });
}
