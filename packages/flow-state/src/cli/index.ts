import { NodeServices } from "@effect/platform-node";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Effect, Exit, ManagedRuntime, Option } from "effect";
import { Argument, CliError, Command, Flag } from "effect/unstable/cli";

import type { AnyFlowMachine, FlowEvent } from "../core/api/types.js";

import {
  type FlowCliBehaviorDiffOptions,
  behaviorDiffMode,
  readBehaviorContract,
  resolveBehaviorDiffContract,
} from "./behavior-contract.js";
import type { FlowCliGatewayOptions } from "./gateway.js";
import type { FlowCliStoryRegistry, FlowCliStoryRegistryEntry } from "./story-registry.js";
import {
  createBehaviorCoverageEnvelope,
  createMachineRegistry,
  createTraceContextualizedSummaryEnvelope,
  createTraceDiffEnvelope,
  createTraceDiffSectionEnvelope,
  createTraceProofEnvelope,
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
  formatTraceContextualizedSummaryText,
  formatTraceDiffSectionText,
  formatTraceDiffText,
  formatTraceProofText,
  formatTraceSummaryText,
  normalizeTraceInput,
  normalizeTraceProofInput,
  normalizeStoryPathRequest,
  storyDescribeJson,
  storyListJson,
  traceDiffSectionNames,
} from "./shared.js";
import {
  buildBehaviorContract,
  diffBehaviorContracts,
  exportTraceArtifact,
  graphOf,
  renderBehaviorContract,
  renderBehaviorDiff,
  sliceBehaviorContract,
} from "../inspect.js";
import { runFlowStory, storyToTest, test } from "../testing.js";

const projectRoot = Flag.string("project-root").pipe(
  Flag.withDescription("Project root that owns the behavior gateway."),
  Flag.withDefault(process.cwd()),
);

const gateway = Flag.string("gateway").pipe(
  Flag.withDescription(
    "Gateway entrypoint. Defaults to src/app/behavior.ts under the project root.",
  ),
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

const traceContextualize = Flag.boolean("contextualize").pipe(
  Flag.withDescription("Attach codebase-linked machine context to the trace summary."),
);

const traceContextMachine = Flag.string("machine").pipe(
  Flag.withDescription("Machine id to use when contextualizing a saved trace."),
  Flag.optional,
);

const traceDiffFormat = Flag.choice("format", ["text", "json"]).pipe(
  Flag.withDescription("Output format."),
  Flag.withDefault("text"),
);

const traceProofFormat = Flag.choice("format", ["pretty", "json"]).pipe(
  Flag.withDescription("Output format."),
  Flag.withDefault("pretty"),
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

const defaultBehaviorContractPath = resolve(process.cwd(), "behavior-contract.json");

type FlowCliGatewayFlagValues = Readonly<{
  readonly "project-root": string;
  readonly gateway?: Option.Option<string>;
}>;

function optionValue<Value>(option: Option.Option<Value> | undefined): Value | undefined {
  return option === undefined ? undefined : Option.getOrUndefined(option);
}

function withOptionalProperty<Key extends string, Value>(
  key: Key,
  value: Value | undefined,
): Partial<Record<Key, Value>> {
  return value === undefined ? {} : ({ [key]: value } as Partial<Record<Key, Value>>);
}

function asUserError(cause: unknown) {
  return new CliError.UserError({
    cause: cause instanceof Error ? cause : new Error(String(cause)),
  });
}

function isMainEntry() {
  return (
    process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  );
}

function parseEventJson(source: string): FlowEvent {
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

function storyGatewayOptions(parent: FlowCliGatewayFlagValues): FlowCliGatewayOptions {
  return gatewayOptions(parent);
}

function gatewayOptions(options: FlowCliGatewayFlagValues): FlowCliGatewayOptions {
  const gatewayPath = optionValue(options.gateway);
  return {
    "project-root": options["project-root"],
    ...withOptionalProperty("gateway", gatewayPath),
  };
}

function traceMachineOrThrow<Machine extends AnyFlowMachine>(
  registry: ReadonlyMap<string, Machine>,
  machineId: string,
): Machine {
  const machine = registry.get(machineId);

  if (machine === undefined) {
    throw new Error(
      `Unknown machine '${machineId}'. Available machine ids: ${[...registry.keys()].sort().join(", ")}.`,
    );
  }

  return machine;
}

const loadStoryContext = Effect.fn(function* (parent: FlowCliGatewayFlagValues) {
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

function storyEntryOrThrow(
  registry: FlowCliStoryRegistry,
  storyId: string,
): FlowCliStoryRegistryEntry {
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
  Effect.fn(function* ({ output, ...options }) {
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
).pipe(
  Command.withDescription("Build the declared behavior contract from a live behavior gateway."),
);

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
  Effect.fn(function* ({ input, section, module, format, ...options }) {
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

      const target = yield* Effect.tryPromise({
        try: () => loadGatewayTarget(gatewayOptions(options)),
        catch: asUserError,
      });
      const output = yield* Effect.try({
        try: () =>
          format === "json"
            ? JSON.stringify(
                createBehaviorCoverageEnvelope(
                  target.gateway,
                  moduleId === undefined ? {} : { moduleId },
                ),
                null,
                2,
              )
            : createBehaviorCoverageEnvelope(
                target.gateway,
                moduleId === undefined ? {} : { moduleId },
              ).rendered,
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
          : renderBehaviorContract(contract, moduleId === undefined ? {} : { moduleId }),
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
  Effect.fn(function* ({
    "left-input": leftInput,
    "right-input": rightInput,
    "left-project-root": leftProjectRoot,
    "right-project-root": rightProjectRoot,
    "left-gateway": leftGateway,
    "right-gateway": rightGateway,
    module,
    format,
  }) {
    const options: FlowCliBehaviorDiffOptions = {
      ...withOptionalProperty("left-input", optionValue(leftInput)),
      ...withOptionalProperty("right-input", optionValue(rightInput)),
      ...withOptionalProperty("left-project-root", optionValue(leftProjectRoot)),
      ...withOptionalProperty("right-project-root", optionValue(rightProjectRoot)),
      ...withOptionalProperty("left-gateway", optionValue(leftGateway)),
      ...withOptionalProperty("right-gateway", optionValue(rightGateway)),
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
        const diff = diffBehaviorContracts(
          left!,
          right!,
          moduleId === undefined ? {} : { moduleId },
        );

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
    tag: Flag.string("tag").pipe(Flag.withDescription("Filter by story tag."), Flag.optional),
    format: storyReadFormat,
  },
  Effect.fn(function* ({ machine, tag, format }) {
    const parent = yield* story;
    const selectedMachine = optionValue(machine);
    const selectedTag = optionValue(tag);
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
  Effect.fn(function* ({ "story-id": storyId, format }) {
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
  Effect.fn(function* ({ "story-id": storyId, check, "save-trace": saveTrace, format }) {
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
    const saveTracePath = optionValue(saveTrace);

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

    const envelope = createStoryRunEnvelope(
      entry,
      outcome,
      check ? storyToTest(outcome) : undefined,
    );
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
    contextualize: traceContextualize,
    "project-root": projectRoot,
    gateway,
    machine: traceContextMachine,
    format: traceReadFormat,
  },
  Effect.fn(function* ({
    "trace-or-proof": traceOrProof,
    contextualize,
    machine,
    format,
    ...options
  }) {
    const normalized = yield* Effect.tryPromise({
      try: () => normalizeTraceInput(traceOrProof),
      catch: asUserError,
    });
    const selectedMachineId = optionValue(machine);
    const selectedGateway = optionValue(options.gateway);
    const selectedProjectRoot = options["project-root"];

    if (
      !contextualize &&
      (selectedMachineId !== undefined ||
        selectedGateway !== undefined ||
        selectedProjectRoot !== process.cwd())
    ) {
      yield* Effect.fail(
        asUserError(
          new Error(
            "`trace summarize` only accepts --project-root, --gateway, and --machine together with --contextualize.",
          ),
        ),
      );
    }

    const output = contextualize
      ? yield* Effect.gen(function* () {
          const target = yield* Effect.tryPromise({
            try: () => loadGatewayTarget(gatewayOptions(options)),
            catch: asUserError,
          });
          const machines = yield* Effect.try({
            try: () => createMachineRegistry(target.gateway.app),
            catch: asUserError,
          });
          const resolvedMachine = yield* Effect.try({
            try: () =>
              traceMachineOrThrow(
                machines,
                selectedMachineId ?? normalized.trace.snapshot.machine.id,
              ),
            catch: asUserError,
          });
          const envelope = createTraceContextualizedSummaryEnvelope(normalized, resolvedMachine);

          return format === "json"
            ? JSON.stringify(envelope, null, 2)
            : formatTraceContextualizedSummaryText(envelope);
        })
      : (() => {
          const envelope = createTraceSummaryEnvelope(normalized);
          return format === "json"
            ? JSON.stringify(envelope, null, 2)
            : formatTraceSummaryText(envelope);
        })();

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
  Effect.fn(function* ({ left, right, section, format }) {
    const leftNormalized = yield* Effect.tryPromise({
      try: () => normalizeTraceInput(left),
      catch: asUserError,
    });
    const rightNormalized = yield* Effect.tryPromise({
      try: () => normalizeTraceInput(right),
      catch: asUserError,
    });
    const envelope = createTraceDiffEnvelope(leftNormalized, rightNormalized);
    const selectedSection = optionValue(section);
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

const traceProof = Command.make(
  "proof",
  {
    "trace-or-proof": Argument.string("trace-or-proof").pipe(
      Argument.withDescription("Trace artifact or local proof JSON to inspect."),
    ),
    actor: Flag.string("actor").pipe(
      Flag.withDescription("Focus on one actor subtree by actor id."),
      Flag.optional,
    ),
    correlation: Flag.string("correlation").pipe(
      Flag.withDescription("Focus on one correlation by correlation id."),
      Flag.optional,
    ),
    issues: Flag.boolean("issues").pipe(Flag.withDescription("Focus on the recorded issue slice.")),
    timeline: Flag.boolean("timeline").pipe(
      Flag.withDescription("Focus on the inspection timeline slice."),
    ),
    format: traceProofFormat,
  },
  Effect.fn(function* ({
    "trace-or-proof": traceOrProof,
    actor,
    correlation,
    issues,
    timeline,
    format,
  }) {
    const actorId = optionValue(actor);
    const correlationId = optionValue(correlation);
    const selectors = [
      ...(actorId === undefined ? [] : [Object.freeze({ kind: "actor", actorId })]),
      ...(correlationId === undefined
        ? []
        : [Object.freeze({ kind: "correlation", correlationId })]),
      ...(issues ? [Object.freeze({ kind: "issues" })] : []),
      ...(timeline ? [Object.freeze({ kind: "timeline" })] : []),
    ];

    if (selectors.length !== 1) {
      yield* Effect.fail(
        asUserError(
          new Error(
            "`trace proof` requires exactly one selector: --actor, --correlation, --issues, or --timeline.",
          ),
        ),
      );
    }

    const normalized = yield* Effect.tryPromise({
      try: () => normalizeTraceProofInput(traceOrProof),
      catch: asUserError,
    });
    const envelope = yield* Effect.try({
      try: () => createTraceProofEnvelope(normalized, selectors[0]!),
      catch: asUserError,
    });
    const output =
      format === "json" ? JSON.stringify(envelope, null, 2) : formatTraceProofText(envelope);

    yield* Effect.sync(() => {
      process.stdout.write(`${output}\n`);
    });
  }),
).pipe(
  Command.withDescription("Inspect one selector-first proof slice from saved runtime evidence."),
);

const storyPaths = Command.make(
  "paths",
  {
    machine: Flag.string("machine").pipe(Flag.withDescription("Machine id to explore.")),
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
  Effect.fn(function* ({
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
          ...withOptionalProperty("from-state", optionValue(fromState)),
          ...withOptionalProperty("to-state", optionValue(toState)),
          ...withOptionalProperty("limit", optionValue(limit)),
          check,
        } satisfies Parameters<typeof normalizeStoryPathRequest>[1]),
      catch: asUserError,
    });

    const output = request.check
      ? (() => {
          const path = graphOf(request.machine).pathFromEvents(
            request.events,
            request.graphOptions,
          );
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
).pipe(
  Command.withDescription("Discover or validate legal machine paths without running a story."),
);

const root = Command.make("flow-state").pipe(
  Command.withDescription("Flow State agent-facing CLI."),
  Command.withSubcommands([
    behavior.pipe(Command.withSubcommands([behaviorBuild, behaviorRender, behaviorDiff])),
    story.pipe(Command.withSubcommands([storyList, storyDescribe, storyRun, storyPaths])),
    trace.pipe(Command.withSubcommands([traceSummarize, traceProof, traceDiff])),
  ]),
);

export async function runFlowStateCli(args: ReadonlyArray<string> = process.argv.slice(2)) {
  const runtime = ManagedRuntime.make(NodeServices.layer);
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

  const exit = await runtime.runPromiseExit(program);

  await runtime.dispose();

  if (Exit.isFailure(exit)) {
    process.exitCode = 1;
  }

  return exit;
}

if (isMainEntry()) {
  await runFlowStateCli();
}
