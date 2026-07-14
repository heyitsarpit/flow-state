import { NodeServices } from "@effect/platform-node";
import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Effect, Exit, ManagedRuntime, Option } from "effect";
import * as FileSystem from "effect/FileSystem";
import { Argument, CliError, Command, Flag } from "effect/unstable/cli";

import type { AnyFlowMachine, FlowEvent } from "../core/api/types.js";
import { recoverMachineFamily } from "../core/machines/machine-family.js";

import {
  type FlowCliBehaviorDiffOptions,
  behaviorDiffMode,
  readBehaviorContract,
  resolveBehaviorDiffContract,
} from "./behavior-contract.js";
import type { FlowCliGatewayOptions } from "./gateway.js";
import {
  behaviorDiffProjection,
  contextualizedTraceSummaryProjection,
  traceDiffProjection,
  traceSummaryEnvelopeProjection,
} from "./output-projections.js";
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
  createScenarioEnvelope,
  formatStoryDescribeText,
  formatStoryListText,
  formatStoryPathCheckText,
  formatStoryPathListText,
  formatScenarioCompact,
  formatScenarioPretty,
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
import {
  createScenarioEvidence,
  runFlowScenarioWithDiagnostics,
  scenarioToReport,
  test,
} from "../testing.js";

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

type FlowCliFailureStatus = "invalid-input" | "unsupported-environment" | "internal-error";

class FlowCliFailure extends Error {
  readonly status: FlowCliFailureStatus;

  constructor(status: FlowCliFailureStatus, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = "FlowCliFailure";
    this.status = status;
  }
}

function optionValue<Value>(option: Option.Option<Value> | undefined): Value | undefined {
  return option === undefined ? undefined : Option.getOrUndefined(option);
}

function asUserError(cause: unknown, status: FlowCliFailureStatus = "invalid-input") {
  return new CliError.UserError({
    cause: cause instanceof FlowCliFailure ? cause : new FlowCliFailure(status, cause),
  });
}

function userError(message: string) {
  return asUserError(new Error(message));
}

const writeOutput = Effect.fn("FlowCli.writeOutput")((output: string) =>
  Effect.sync(() => process.stdout.write(`${output}\n`)),
);

export function isMainEntry(
  argvEntry: string | undefined = process.argv[1],
  moduleUrl: string | URL = import.meta.url,
) {
  const canonicalPath = (path: string): string => {
    const absolute = resolve(path);
    try {
      return realpathSync(absolute);
    } catch {
      return absolute;
    }
  };

  return (
    argvEntry !== undefined && canonicalPath(argvEntry) === canonicalPath(fileURLToPath(moduleUrl))
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
    ...(gatewayPath === undefined ? {} : { gateway: gatewayPath }),
  };
}

function storyListRecoveryHint(options: FlowCliGatewayFlagValues): string {
  const gatewayPath = optionValue(options.gateway);
  const command = [
    "flow-state",
    "story",
    "--project-root",
    options["project-root"],
    ...(gatewayPath === undefined ? [] : ["--gateway", gatewayPath]),
    "list",
  ];

  return `Next step: run \`${command.join(" ")}\` to inspect the declared story ids.`;
}

function traceMachine<Machine extends AnyFlowMachine>(
  registry: ReadonlyMap<string, Machine>,
  machineId: string,
): Effect.Effect<Machine, CliError.UserError> {
  const machine = registry.get(machineId);

  if (machine === undefined) {
    return Effect.fail(
      userError(
        `Unknown machine '${machineId}'. Available machine ids: ${[...registry.keys()].sort().join(", ")}.`,
      ),
    );
  }

  return Effect.succeed(machine);
}

const loadStoryContext = Effect.fn("FlowCli.loadStoryContext")(function* (
  parent: FlowCliGatewayFlagValues,
) {
  const target = yield* Effect.tryPromise({
    try: () => loadGatewayTarget(storyGatewayOptions(parent)),
    catch: (cause) => asUserError(cause, "unsupported-environment"),
  });
  const registry = yield* Effect.try({
    try: () => createStoryRegistry(target.gateway),
    catch: asUserError,
  });

  return registry;
});

function storyEntry(
  registry: FlowCliStoryRegistry,
  storyId: string,
  options: FlowCliGatewayFlagValues,
): Effect.Effect<FlowCliStoryRegistryEntry, CliError.UserError> {
  const entry = registry.storiesById.get(storyId);

  if (entry === undefined) {
    return Effect.fail(
      userError(
        [
          `Unknown story '${storyId}'. Available story ids: ${registry.stories
            .map((candidate) => candidate.story.id)
            .sort()
            .join(", ")}.`,
          storyListRecoveryHint(options),
        ].join("\n"),
      ),
    );
  }

  return Effect.succeed(entry);
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
  Effect.fn("FlowCli.behaviorBuild")(function* ({ output, ...options }) {
    const fs = yield* FileSystem.FileSystem;
    const outputPath = resolve(Option.getOrUndefined(output) ?? defaultBehaviorContractPath);
    const target = yield* Effect.tryPromise({
      try: () => loadGatewayTarget(gatewayOptions(options)),
      catch: (cause) => asUserError(cause, "unsupported-environment"),
    });
    const contract = yield* Effect.try({
      try: () => buildBehaviorContract(target.gateway),
      catch: asUserError,
    });

    yield* fs
      .makeDirectory(dirname(outputPath), { recursive: true })
      .pipe(
        Effect.andThen(fs.writeFileString(outputPath, `${JSON.stringify(contract, null, 2)}\n`)),
        Effect.mapError(asUserError),
      );

    yield* writeOutput(`Wrote behavior contract to ${outputPath}.`);
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
  Effect.fn("FlowCli.behaviorRender")(function* ({ input, section, module, format, ...options }) {
    const inputPath = Option.getOrUndefined(input);
    const moduleId = Option.getOrUndefined(module);

    if (section === "coverage") {
      if (inputPath !== undefined) {
        return yield* Effect.fail(
          asUserError(
            new Error(
              "`behavior render --section coverage` derives live story coverage from the behavior gateway, so `--input` is not supported.",
            ),
          ),
        );
      }

      const target = yield* Effect.tryPromise({
        try: () => loadGatewayTarget(gatewayOptions(options)),
        catch: (cause) => asUserError(cause, "unsupported-environment"),
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
              ).coverage,
        catch: asUserError,
      });

      yield* writeOutput(output);
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

    yield* writeOutput(output);
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
  Effect.fn("FlowCli.behaviorDiff")(function* ({
    "left-input": leftInput,
    "right-input": rightInput,
    "left-project-root": leftProjectRoot,
    "right-project-root": rightProjectRoot,
    "left-gateway": leftGateway,
    "right-gateway": rightGateway,
    module,
    format,
  }) {
    const selectedLeftInput = optionValue(leftInput);
    const selectedRightInput = optionValue(rightInput);
    const selectedLeftProjectRoot = optionValue(leftProjectRoot);
    const selectedRightProjectRoot = optionValue(rightProjectRoot);
    const selectedLeftGateway = optionValue(leftGateway);
    const selectedRightGateway = optionValue(rightGateway);
    const options: FlowCliBehaviorDiffOptions = {
      ...(selectedLeftInput === undefined ? {} : { "left-input": selectedLeftInput }),
      ...(selectedRightInput === undefined ? {} : { "right-input": selectedRightInput }),
      ...(selectedLeftProjectRoot === undefined
        ? {}
        : { "left-project-root": selectedLeftProjectRoot }),
      ...(selectedRightProjectRoot === undefined
        ? {}
        : { "right-project-root": selectedRightProjectRoot }),
      ...(selectedLeftGateway === undefined ? {} : { "left-gateway": selectedLeftGateway }),
      ...(selectedRightGateway === undefined ? {} : { "right-gateway": selectedRightGateway }),
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
      return yield* Effect.fail(
        asUserError(
          new Error(
            "Expected either --left-input/--right-input or left/right project-root or gateway flags for live build targets.",
          ),
        ),
      );
    }

    const output = yield* Effect.try({
      try: () => {
        const diff = diffBehaviorContracts(left, right, moduleId === undefined ? {} : { moduleId });

        return format === "json"
          ? JSON.stringify(behaviorDiffProjection(diff), null, 2)
          : renderBehaviorDiff(diff);
      },
      catch: asUserError,
    });

    yield* writeOutput(output);
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
  Effect.fn("FlowCli.storyList")(function* ({ machine, tag, format }) {
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

    yield* writeOutput(output);
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
  Effect.fn("FlowCli.storyDescribe")(function* ({ "story-id": storyId, format }) {
    const parent = yield* story;
    const registry = yield* loadStoryContext(parent);
    const entry = yield* storyEntry(registry, storyId, parent);

    const output =
      format === "json"
        ? JSON.stringify(storyDescribeJson(entry), null, 2)
        : formatStoryDescribeText(entry);

    yield* writeOutput(output);
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
    "pending-work": Flag.boolean("pending-work").pipe(
      Flag.withDescription("Include pending-work diagnostics captured after the story run."),
    ),
    "save-trace": Flag.string("save-trace").pipe(
      Flag.withDescription("Write the run trace as trace-artifact JSON."),
      Flag.optional,
    ),
    format: storyRunFormat,
  },
  Effect.fn("FlowCli.storyRun")(function* ({
    "story-id": storyId,
    check,
    "pending-work": pendingWork,
    "save-trace": saveTrace,
    format,
  }) {
    const fs = yield* FileSystem.FileSystem;
    const parent = yield* story;
    const registry = yield* loadStoryContext(parent);
    const entry = yield* storyEntry(registry, storyId, parent);
    const execution = yield* Effect.tryPromise({
      try: () =>
        runFlowScenarioWithDiagnostics(
          registry.app,
          recoverMachineFamily(entry.machine),
          entry.story,
        ),
      catch: (cause) => asUserError(cause, "internal-error"),
    });
    const { outcome } = execution;
    const saveTracePath = optionValue(saveTrace);

    if (saveTracePath !== undefined) {
      if (outcome.kind === "story-run-blocked" || outcome.kind === "scenario-internal-error") {
        return yield* Effect.fail(
          asUserError(
            new Error(
              `Cannot save trace for story '${storyId}' because Scenario execution did not produce trace evidence.`,
            ),
          ),
        );
      }

      yield* fs
        .writeFileString(
          saveTracePath,
          `${JSON.stringify(exportTraceArtifact(outcome.trace), null, 2)}\n`,
        )
        .pipe(Effect.mapError(asUserError));
    }

    const evidence = createScenarioEvidence(check ? scenarioToReport(outcome) : outcome);
    const envelope = createScenarioEnvelope(
      entry,
      evidence,
      pendingWork ? execution.pendingWork : undefined,
      saveTracePath,
    );
    const output =
      format === "json"
        ? JSON.stringify(envelope, null, 2)
        : format === "compact"
          ? formatScenarioCompact(envelope)
          : formatScenarioPretty(envelope);

    yield* writeOutput(output);
    if (!evidence.ok) {
      process.exitCode = 1;
    }
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
  Effect.fn("FlowCli.traceSummarize")(function* ({
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
      return yield* Effect.fail(
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
            catch: (cause) => asUserError(cause, "unsupported-environment"),
          });
          const machines = yield* Effect.try({
            try: () => createMachineRegistry(target.gateway.app),
            catch: asUserError,
          });
          const resolvedMachine = yield* traceMachine(
            machines,
            selectedMachineId ?? normalized.trace.snapshot.machine.id,
          );
          const envelope = createTraceContextualizedSummaryEnvelope(normalized, resolvedMachine);

          return format === "json"
            ? JSON.stringify(contextualizedTraceSummaryProjection(envelope), null, 2)
            : formatTraceContextualizedSummaryText(envelope);
        })
      : (() => {
          const envelope = createTraceSummaryEnvelope(normalized);
          return format === "json"
            ? JSON.stringify(traceSummaryEnvelopeProjection(envelope), null, 2)
            : formatTraceSummaryText(envelope);
        })();

    yield* writeOutput(output);
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
  Effect.fn("FlowCli.traceDiff")(function* ({ left, right, section, format }) {
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
          ? JSON.stringify(traceDiffProjection(envelope), null, 2)
          : formatTraceDiffText(envelope)
        : (() => {
            const sectionEnvelope = createTraceDiffSectionEnvelope(envelope, selectedSection);

            return format === "json"
              ? JSON.stringify(sectionEnvelope, null, 2)
              : formatTraceDiffSectionText(sectionEnvelope);
          })();

    yield* writeOutput(output);
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
  Effect.fn("FlowCli.traceProof")(function* ({
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
      return yield* Effect.fail(
        asUserError(
          new Error(
            "`trace proof` requires exactly one selector: --actor, --correlation, --issues, or --timeline.",
          ),
        ),
      );
    }

    const [selector] = selectors;
    if (selector === undefined) {
      return yield* Effect.fail(
        asUserError(new Error("Expected one validated trace proof selector.")),
      );
    }

    const normalized = yield* Effect.tryPromise({
      try: () => normalizeTraceProofInput(traceOrProof),
      catch: asUserError,
    });
    const envelope = yield* createTraceProofEnvelope(normalized, selector).pipe(
      Effect.mapError(asUserError),
    );
    const output =
      format === "json" ? JSON.stringify(envelope, null, 2) : formatTraceProofText(envelope);

    yield* writeOutput(output);
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
  Effect.fn("FlowCli.storyPaths")(function* ({
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
    const selectedFromState = optionValue(fromState);
    const selectedToState = optionValue(toState);
    const selectedLimit = optionValue(limit);
    const request = yield* Effect.try({
      try: () =>
        normalizeStoryPathRequest(registry, {
          machine,
          strategy,
          events: event,
          ...(selectedFromState === undefined ? {} : { "from-state": selectedFromState }),
          ...(selectedToState === undefined ? {} : { "to-state": selectedToState }),
          ...(selectedLimit === undefined ? {} : { limit: selectedLimit }),
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
          const model = test.app(registry.app).model(recoverMachineFamily(request.machine));
          const paths =
            request.strategy === "simple"
              ? model.getSimplePaths(request.modelOptions)
              : model.getShortestPaths(request.modelOptions);
          const envelope = createStoryPathListEnvelope(request, paths);
          return format === "json"
            ? JSON.stringify(envelope, null, 2)
            : formatStoryPathListText(envelope);
        })();

    yield* writeOutput(output);
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
  process.exitCode = 0;
  const runtime = ManagedRuntime.make(NodeServices.layer);
  const program = Command.runWith(root, {
    version: "0.0.0",
  })(args).pipe(
    Effect.tapError((error) =>
      CliError.isCliError(error) && error._tag === "UserError"
        ? Effect.sync(() => {
            const status =
              error.cause instanceof FlowCliFailure ? error.cause.status : "invalid-input";
            process.stderr.write(
              `error [${status}]: ${error.cause instanceof Error ? error.cause.message : String(error.cause)}\n`,
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
