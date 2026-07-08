#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Effect, Exit, Option } from "effect";
import { Argument, CliError, Command, Flag } from "effect/unstable/cli";

import {
  createTraceDiffEnvelope,
  createTraceDiffSectionEnvelope,
  loadGatewayTarget,
  createTraceSummaryEnvelope,
  createStoryRegistry,
  createStoryPathCheckEnvelope,
  createStoryPathListEnvelope,
  createStoryRunEnvelope,
  formatStoryDescribeText,
  formatStoryListText,
  formatStoryPathCheckText,
  formatStoryPathListText,
  formatStoryRunCompact,
  formatStoryRunPretty,
  formatTraceDiffSectionText,
  formatTraceDiffText,
  formatTraceSummaryText,
  normalizeTraceInput,
  normalizeStoryPathRequest,
  storyDescribeJson,
  storyListJson,
  traceDiffSectionNames,
} from "./cli-shared.mjs";
import {
  buildBehaviorContract,
  diffBehaviorContracts,
  exportTraceArtifact,
  graphOf,
  renderBehaviorContract,
  renderBehaviorCoverage,
  renderBehaviorDiff,
  sliceBehaviorContract,
} from "../dist/inspect.mjs";
import { runFlowStory, storyToTest, test } from "../dist/testing.mjs";

const projectRoot = Flag.string("project-root").pipe(
  Flag.withDescription("Project root that owns the behavior gateway."),
  Flag.withDefault(process.cwd()),
);

const gateway = Flag.string("gateway").pipe(
  Flag.withDescription("Gateway entrypoint. Defaults to src/app/behavior.ts under the project root."),
  Flag.optional,
);

const storyReadFormat = Flag.choice("format", ["text", "json"]).pipe(
  Flag.withDescription("Output format."),
  Flag.withDefault("text"),
);

const storyRunFormat = Flag.choice("format", ["pretty", "compact", "json"]).pipe(
  Flag.withDescription("Output format."),
  Flag.withDefault("pretty"),
);

const storyPathsFormat = Flag.choice("format", ["text", "json"]).pipe(
  Flag.withDescription("Output format."),
  Flag.withDefault("text"),
);

const traceReadFormat = Flag.choice("format", ["text", "json"]).pipe(
  Flag.withDescription("Output format."),
  Flag.withDefault("text"),
);

const traceDiffFormat = Flag.choice("format", ["text", "json"]).pipe(
  Flag.withDescription("Output format."),
  Flag.withDefault("text"),
);

const behaviorRenderSection = Flag.choice("section", ["contract", "coverage"]).pipe(
  Flag.withDescription("Behavior render section."),
  Flag.withDefault("contract"),
);

const behaviorRenderFormat = Flag.choice("format", ["text", "json"]).pipe(
  Flag.withDescription("Output format."),
  Flag.withDefault("text"),
);

const behaviorDiffFormat = Flag.choice("format", ["text", "json"]).pipe(
  Flag.withDescription("Output format."),
  Flag.withDefault("text"),
);

const behaviorModule = Flag.string("module").pipe(
  Flag.withDescription("Limit output to one module id."),
  Flag.optional,
);

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..", "..");
const defaultBehaviorContractPath = resolve(repoRoot, "apps/docs/src/generated/behavior-contract.json");

function asUserError(cause) {
  return new CliError.UserError({
    cause: cause instanceof Error ? cause : new Error(String(cause)),
  });
}

function isMainEntry() {
  return process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function parseEventJson(source) {
  const value = JSON.parse(source);

  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("type" in value) ||
    typeof value.type !== "string"
  ) {
    throw new Error("Expected object with a string `type` field.");
  }

  return value;
}

function storyGatewayOptions(parent) {
  const gatewayPath = Option.getOrUndefined(parent.gateway);

  return {
    "project-root": parent["project-root"],
    ...(gatewayPath === undefined ? {} : { gateway: gatewayPath }),
  };
}

function gatewayOptions(options = {}) {
  const gatewayPath = Option.getOrUndefined(options.gateway);

  return {
    "project-root": options["project-root"],
    ...(gatewayPath === undefined ? {} : { gateway: gatewayPath }),
  };
}

async function readBehaviorContract(inputPath) {
  let source;

  try {
    source = await readFile(inputPath, "utf8");
  } catch (error) {
    throw new Error(
      `Unable to read behavior contract at ${inputPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let contract;

  try {
    contract = JSON.parse(source);
  } catch (error) {
    throw new Error(
      `Unable to parse behavior contract JSON at ${inputPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (contract?.version !== "flow-state/behavior-contract.v1") {
    throw new Error(`Expected a behavior contract JSON file at ${inputPath}.`);
  }

  return contract;
}

async function resolveBehaviorDiffContract(options, side) {
  const inputPath = options[`${side}-input`];
  const projectRootOption = options[`${side}-project-root`];
  const gatewayOption = options[`${side}-gateway`];

  if (inputPath !== undefined) {
    if (projectRootOption !== undefined || gatewayOption !== undefined) {
      throw new Error(
        `Do not mix --${side}-input with --${side}-project-root or --${side}-gateway; compare either contract files or live build targets.`,
      );
    }

    return readBehaviorContract(resolve(inputPath));
  }

  if (projectRootOption === undefined && gatewayOption === undefined) {
    return undefined;
  }

  const { gateway } = await loadGatewayTarget({
    "project-root": projectRootOption,
    ...(gatewayOption === undefined ? {} : { gateway: gatewayOption }),
  });

  return buildBehaviorContract(gateway);
}

function behaviorDiffMode(options) {
  const usingInputs = options["left-input"] !== undefined || options["right-input"] !== undefined;
  const usingTargets =
    options["left-project-root"] !== undefined ||
    options["left-gateway"] !== undefined ||
    options["right-project-root"] !== undefined ||
    options["right-gateway"] !== undefined;

  if (usingInputs && usingTargets) {
    throw new Error("Do not mix contract-file inputs with live build-target flags in one diff command.");
  }

  if (usingInputs) {
    return "input";
  }

  if (usingTargets) {
    return "target";
  }

  throw new Error(
    "Expected either --left-input/--right-input or left/right project-root or gateway flags for live build targets.",
  );
}

const loadStoryContext = Effect.fn(function* (parent) {
  const target = yield* Effect.tryPromise({
    try: () => loadGatewayTarget(storyGatewayOptions(parent)),
    catch: asUserError,
  });
  const registry = yield* Effect.try({
    try: () => createStoryRegistry(target.gateway),
    catch: asUserError,
  });

  return registry;
});

function storyEntryOrThrow(registry, storyId) {
  const entry = registry.storiesById.get(storyId);

  if (entry === undefined) {
    throw new Error(
      `Unknown story '${storyId}'. Available story ids: ${registry.stories
        .map((candidate) => candidate.story.id)
        .sort()
        .join(", ")}.`,
    );
  }

  return entry;
}

const behavior = Command.make("behavior").pipe(
  Command.withDescription("Inspect declared app and module behavior facts."),
);

const behaviorBuild = Command.make(
  "build",
  {
    "project-root": projectRoot,
    gateway,
    output: Flag.string("output").pipe(
      Flag.withDescription("Destination path for the built behavior contract."),
      Flag.optional,
    ),
  },
  Effect.fn(function*({ output, ...options }) {
    const outputPath = resolve(Option.getOrUndefined(output) ?? defaultBehaviorContractPath);
    const target = yield* Effect.tryPromise({
      try: () => loadGatewayTarget(gatewayOptions(options)),
      catch: asUserError,
    });
    const contract = yield* Effect.try({
      try: () => buildBehaviorContract(target.gateway),
      catch: asUserError,
    });

    yield* Effect.tryPromise({
      try: async () => {
        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
      },
      catch: asUserError,
    });

    yield* Effect.sync(() => {
      process.stdout.write(`Wrote behavior contract to ${outputPath}.\n`);
    });
  }),
).pipe(Command.withDescription("Build the declared behavior contract from a live behavior gateway."));

const behaviorRender = Command.make(
  "render",
  {
    "project-root": projectRoot,
    gateway,
    input: Flag.string("input").pipe(
      Flag.withDescription("Behavior contract JSON to render."),
      Flag.optional,
    ),
    section: behaviorRenderSection,
    module: behaviorModule,
    format: behaviorRenderFormat,
  },
  Effect.fn(function*({ input, section, module, format, ...options }) {
    const inputPath = Option.getOrUndefined(input);
    const moduleId = Option.getOrUndefined(module);

    if (section === "coverage") {
      if (inputPath !== undefined) {
        yield* Effect.fail(
          asUserError(
            new Error(
              "`behavior render --section coverage` derives live story coverage from the behavior gateway, so `--input` is not supported.",
            ),
          ),
        );
      }

      if (format === "json") {
        yield* Effect.fail(
          asUserError(
            new Error(
              "`behavior render --section coverage` does not yet expose a stable JSON envelope. Use text output for the live coverage renderer.",
            ),
          ),
        );
      }

      const target = yield* Effect.tryPromise({
        try: () => loadGatewayTarget(gatewayOptions(options)),
        catch: asUserError,
      });
      const output = yield* Effect.try({
        try: () =>
          renderBehaviorCoverage(target.gateway, {
            ...(moduleId === undefined ? {} : { moduleId }),
          }),
        catch: asUserError,
      });

      yield* Effect.sync(() => {
        process.stdout.write(`${output}\n`);
      });
      return;
    }

    const contract = yield* Effect.tryPromise({
      try: () => readBehaviorContract(resolve(inputPath ?? defaultBehaviorContractPath)),
      catch: asUserError,
    });
    const output = yield* Effect.try({
      try: () =>
        format === "json"
          ? JSON.stringify(
              moduleId === undefined ? contract : sliceBehaviorContract(contract, moduleId),
              null,
              2,
            )
          : renderBehaviorContract(contract, {
              ...(moduleId === undefined ? {} : { moduleId }),
            }),
      catch: asUserError,
    });

    yield* Effect.sync(() => {
      process.stdout.write(`${output}\n`);
    });
  }),
).pipe(Command.withDescription("Render a saved behavior contract or live story coverage."));

const behaviorDiff = Command.make(
  "diff",
  {
    "left-input": Flag.string("left-input").pipe(
      Flag.withDescription("Left behavior contract JSON file."),
      Flag.optional,
    ),
    "right-input": Flag.string("right-input").pipe(
      Flag.withDescription("Right behavior contract JSON file."),
      Flag.optional,
    ),
    "left-project-root": Flag.string("left-project-root").pipe(
      Flag.withDescription("Project root for the left live build target."),
      Flag.optional,
    ),
    "right-project-root": Flag.string("right-project-root").pipe(
      Flag.withDescription("Project root for the right live build target."),
      Flag.optional,
    ),
    "left-gateway": Flag.string("left-gateway").pipe(
      Flag.withDescription("Gateway entrypoint for the left live build target."),
      Flag.optional,
    ),
    "right-gateway": Flag.string("right-gateway").pipe(
      Flag.withDescription("Gateway entrypoint for the right live build target."),
      Flag.optional,
    ),
    module: behaviorModule,
    format: behaviorDiffFormat,
  },
  Effect.fn(function*({
    "left-input": leftInput,
    "right-input": rightInput,
    "left-project-root": leftProjectRoot,
    "right-project-root": rightProjectRoot,
    "left-gateway": leftGateway,
    "right-gateway": rightGateway,
    module,
    format,
  }) {
    const options = {
      "left-input": Option.getOrUndefined(leftInput),
      "right-input": Option.getOrUndefined(rightInput),
      "left-project-root": Option.getOrUndefined(leftProjectRoot),
      "right-project-root": Option.getOrUndefined(rightProjectRoot),
      "left-gateway": Option.getOrUndefined(leftGateway),
      "right-gateway": Option.getOrUndefined(rightGateway),
    };
    const moduleId = Option.getOrUndefined(module);

    yield* Effect.try({
      try: () => behaviorDiffMode(options),
      catch: asUserError,
    });

    const left = yield* Effect.tryPromise({
      try: () => resolveBehaviorDiffContract(options, "left"),
      catch: asUserError,
    });
    const right = yield* Effect.tryPromise({
      try: () => resolveBehaviorDiffContract(options, "right"),
      catch: asUserError,
    });

    if (left === undefined || right === undefined) {
      yield* Effect.fail(
        asUserError(
          new Error(
            "Expected either --left-input/--right-input or left/right project-root or gateway flags for live build targets.",
          ),
        ),
      );
    }

    const output = yield* Effect.try({
      try: () => {
        const diff = diffBehaviorContracts(left, right, {
          ...(moduleId === undefined ? {} : { moduleId }),
        });

        return format === "json" ? JSON.stringify(diff, null, 2) : renderBehaviorDiff(diff);
      },
      catch: asUserError,
    });

    yield* Effect.sync(() => {
      process.stdout.write(`${output}\n`);
    });
  }),
).pipe(Command.withDescription("Diff two behavior contracts or two live build targets."));

const story = Command.make("story").pipe(
  Command.withDescription("Discover declared codebase stories without executing them."),
  Command.withSharedFlags({
    "project-root": projectRoot,
    gateway,
  }),
);

const storyList = Command.make(
  "list",
  {
    machine: Flag.string("machine").pipe(
      Flag.withDescription("Filter by machine id."),
      Flag.optional,
    ),
    tag: Flag.string("tag").pipe(
      Flag.withDescription("Filter by story tag."),
      Flag.optional,
    ),
    format: storyReadFormat,
  },
  Effect.fn(function*({ machine, tag, format }) {
    const parent = yield* story;
    const selectedMachine = Option.getOrUndefined(machine);
    const selectedTag = Option.getOrUndefined(tag);
    const registry = yield* loadStoryContext(parent);
    const stories = registry.stories.filter((entry) => {
      if (selectedMachine !== undefined && entry.machineId !== selectedMachine) {
        return false;
      }

      if (selectedTag !== undefined && !entry.doc.tags.includes(selectedTag)) {
        return false;
      }

      return true;
    });

    const output =
      format === "json"
        ? JSON.stringify(storyListJson(stories), null, 2)
        : formatStoryListText(stories);

    yield* Effect.sync(() => {
      process.stdout.write(`${output}\n`);
    });
  }),
).pipe(Command.withDescription("List declared stories from the behavior gateway."));

const storyDescribe = Command.make(
  "describe",
  {
    "story-id": Argument.string("story-id").pipe(
      Argument.withDescription("Declared story id to describe."),
    ),
    format: storyReadFormat,
  },
  Effect.fn(function*({ "story-id": storyId, format }) {
    const parent = yield* story;
    const registry = yield* loadStoryContext(parent);
    const entry = yield* Effect.try({
      try: () => storyEntryOrThrow(registry, storyId),
      catch: asUserError,
    });

    const output =
      format === "json"
        ? JSON.stringify(storyDescribeJson(entry), null, 2)
        : formatStoryDescribeText(entry);

    yield* Effect.sync(() => {
      process.stdout.write(`${output}\n`);
    });
  }),
).pipe(Command.withDescription("Describe one declared story without running it."));

const storyRun = Command.make(
  "run",
  {
    "story-id": Argument.string("story-id").pipe(
      Argument.withDescription("Declared story id to run."),
    ),
    check: Flag.boolean("check").pipe(
      Flag.withDescription("Add expectation-check deltas over the same run outcome."),
    ),
    "save-trace": Flag.string("save-trace").pipe(
      Flag.withDescription("Write the run trace as trace-artifact JSON."),
      Flag.optional,
    ),
    format: storyRunFormat,
  },
  Effect.fn(function*({ "story-id": storyId, check, "save-trace": saveTrace, format }) {
    const parent = yield* story;
    const registry = yield* loadStoryContext(parent);
    const entry = yield* Effect.try({
      try: () => storyEntryOrThrow(registry, storyId),
      catch: asUserError,
    });
    const outcome = yield* Effect.tryPromise({
      try: () => runFlowStory(registry.app, entry.machine, entry.story),
      catch: asUserError,
    });
    const saveTracePath = Option.getOrUndefined(saveTrace);

    if (saveTracePath !== undefined) {
      yield* Effect.tryPromise({
        try: async () => {
          if (outcome.kind === "story-run-blocked") {
            throw new Error(
              `Cannot save trace for story '${storyId}' because execution was blocked (${outcome.reason}).`,
            );
          }

          await writeFile(
            saveTracePath,
            `${JSON.stringify(exportTraceArtifact(outcome.trace), null, 2)}\n`,
            "utf8",
          );
        },
        catch: asUserError,
      });
    }

    const envelope = createStoryRunEnvelope(entry, outcome, check ? storyToTest(outcome) : undefined);
    const output =
      format === "json"
        ? JSON.stringify(envelope, null, 2)
        : format === "compact"
          ? formatStoryRunCompact(envelope)
          : formatStoryRunPretty(envelope);

    yield* Effect.sync(() => {
      process.stdout.write(`${output}\n`);
    });
  }),
).pipe(Command.withDescription("Run one declared story and emit compact runtime facts."));

const trace = Command.make("trace").pipe(
  Command.withDescription("Read saved runtime trace evidence."),
);

const traceDiffSection = Flag.choice("section", traceDiffSectionNames).pipe(
  Flag.withDescription("Limit output to one trace diff section."),
  Flag.optional,
);

const traceSummarize = Command.make(
  "summarize",
  {
    "trace-or-proof": Argument.string("trace-or-proof").pipe(
      Argument.withDescription("Trace artifact or local proof JSON to summarize."),
    ),
    format: traceReadFormat,
  },
  Effect.fn(function*({ "trace-or-proof": traceOrProof, format }) {
    const normalized = yield* Effect.tryPromise({
      try: () => normalizeTraceInput(traceOrProof),
      catch: asUserError,
    });
    const envelope = createTraceSummaryEnvelope(normalized);
    const output =
      format === "json"
        ? JSON.stringify(envelope, null, 2)
        : formatTraceSummaryText(envelope);

    yield* Effect.sync(() => {
      process.stdout.write(`${output}\n`);
    });
  }),
).pipe(Command.withDescription("Summarize one saved runtime trace or proof bundle."));

const traceDiff = Command.make(
  "diff",
  {
    left: Argument.string("left").pipe(
      Argument.withDescription("Left trace artifact or local proof JSON."),
    ),
    right: Argument.string("right").pipe(
      Argument.withDescription("Right trace artifact or local proof JSON."),
    ),
    section: traceDiffSection,
    format: traceDiffFormat,
  },
  Effect.fn(function*({ left, right, section, format }) {
    const leftNormalized = yield* Effect.tryPromise({
      try: () => normalizeTraceInput(left),
      catch: asUserError,
    });
    const rightNormalized = yield* Effect.tryPromise({
      try: () => normalizeTraceInput(right),
      catch: asUserError,
    });
    const envelope = createTraceDiffEnvelope(leftNormalized, rightNormalized);
    const selectedSection = Option.getOrUndefined(section);
    const output =
      selectedSection === undefined
        ? format === "json"
          ? JSON.stringify(envelope, null, 2)
          : formatTraceDiffText(envelope)
        : (() => {
            const sectionEnvelope = createTraceDiffSectionEnvelope(envelope, selectedSection);

            return format === "json"
              ? JSON.stringify(sectionEnvelope, null, 2)
              : formatTraceDiffSectionText(sectionEnvelope);
          })();

    yield* Effect.sync(() => {
      process.stdout.write(`${output}\n`);
    });
  }),
).pipe(Command.withDescription("Diff two saved runtime traces or proof bundles."));

const storyPaths = Command.make(
  "paths",
  {
    machine: Flag.string("machine").pipe(
      Flag.withDescription("Machine id to explore."),
    ),
    strategy: Flag.choice("strategy", ["shortest", "simple"]).pipe(
      Flag.withDescription("Path discovery strategy."),
      Flag.withDefault("shortest"),
    ),
    event: Flag.string("event").pipe(
      Flag.withDescription("Candidate or exact event as JSON."),
      Flag.mapTryCatch(
        parseEventJson,
        () => "Expected `--event` JSON object with a string `type` field.",
      ),
      Flag.atLeast(0),
    ),
    "from-state": Flag.string("from-state").pipe(
      Flag.withDescription("Override the starting state before path search."),
      Flag.optional,
    ),
    "to-state": Flag.string("to-state").pipe(
      Flag.withDescription("Limit results to paths that end in this state."),
      Flag.optional,
    ),
    limit: Flag.integer("limit").pipe(
      Flag.withDescription("Maximum number of traversed transitions."),
      Flag.optional,
    ),
    check: Flag.boolean("check").pipe(
      Flag.withDescription("Validate one exact event sequence instead of enumerating paths."),
    ),
    format: storyPathsFormat,
  },
  Effect.fn(function*({
    machine,
    strategy,
    event,
    "from-state": fromState,
    "to-state": toState,
    limit,
    check,
    format,
  }) {
    const parent = yield* story;
    const registry = yield* loadStoryContext(parent);
    const request = yield* Effect.try({
      try: () =>
        normalizeStoryPathRequest(registry, {
          machine,
          strategy,
          events: event,
          "from-state": Option.getOrUndefined(fromState),
          "to-state": Option.getOrUndefined(toState),
          limit: Option.getOrUndefined(limit),
          check,
        }),
      catch: asUserError,
    });

    const output = request.check
      ? (() => {
          const path = graphOf(request.machine).pathFromEvents(request.events, request.graphOptions);
          const envelope = createStoryPathCheckEnvelope(request, path);
          return format === "json"
            ? JSON.stringify(envelope, null, 2)
            : formatStoryPathCheckText(envelope);
        })()
      : (() => {
          const model = test.app(registry.app).model(request.machine);
          const paths =
            request.strategy === "simple"
              ? model.getSimplePaths(request.modelOptions)
              : model.getShortestPaths(request.modelOptions);
          const envelope = createStoryPathListEnvelope(request, paths);
          return format === "json"
            ? JSON.stringify(envelope, null, 2)
            : formatStoryPathListText(envelope);
        })();

    yield* Effect.sync(() => {
      process.stdout.write(`${output}\n`);
    });
  }),
).pipe(Command.withDescription("Discover or validate legal machine paths without running a story."));

const root = Command.make("flow-state").pipe(
  Command.withDescription("Flow State agent-facing CLI."),
  Command.withSubcommands([
    behavior.pipe(Command.withSubcommands([behaviorBuild, behaviorRender, behaviorDiff])),
    story.pipe(Command.withSubcommands([storyList, storyDescribe, storyRun, storyPaths])),
    trace.pipe(Command.withSubcommands([traceSummarize, traceDiff])),
  ]),
);

export async function runFlowStateCli(args = process.argv.slice(2)) {
  const program = Command.runWith(root, {
    version: "0.0.0",
  })(args).pipe(
    Effect.tapError((error) =>
      CliError.isCliError(error) && error._tag === "UserError"
        ? Effect.sync(() => {
            process.stderr.write(
              `${error.cause instanceof Error ? error.cause.message : String(error.cause)}\n`,
            );
          })
        : Effect.void,
    ),
  );

  const exit = await Effect.runPromiseExit(program);

  if (Exit.isFailure(exit)) {
    process.exitCode = 1;
  }

  return exit;
}

if (isMainEntry()) {
  await runFlowStateCli();
}
