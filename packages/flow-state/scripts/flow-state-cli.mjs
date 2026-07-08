#!/usr/bin/env node

import { writeFile } from "node:fs/promises";

import { Effect, Exit, Option } from "effect";
import { Argument, CliError, Command, Flag } from "effect/unstable/cli";

import {
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
  formatTraceSummaryText,
  loadGatewayTarget,
  normalizeTraceInput,
  normalizeStoryPathRequest,
  storyDescribeJson,
  storyListJson,
} from "./cli-shared.mjs";
import { exportTraceArtifact, graphOf } from "../dist/inspect.mjs";
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

function asUserError(cause) {
  return new CliError.UserError({
    cause: cause instanceof Error ? cause : new Error(String(cause)),
  });
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
    story.pipe(Command.withSubcommands([storyList, storyDescribe, storyRun, storyPaths])),
    trace.pipe(Command.withSubcommands([traceSummarize])),
  ]),
);

const program = Command.runWith(root, {
  version: "0.0.0",
})(process.argv.slice(2)).pipe(
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
