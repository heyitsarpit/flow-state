#!/usr/bin/env node

import { Effect, Exit, Option } from "effect";
import { Argument, CliError, Command, Flag } from "effect/unstable/cli";

import {
  createStoryRegistry,
  createStoryRunEnvelope,
  formatStoryDescribeText,
  formatStoryListText,
  formatStoryRunCompact,
  formatStoryRunPretty,
  loadGatewayTarget,
  storyDescribeJson,
  storyListJson,
} from "./cli-shared.mjs";
import { runFlowStory, storyToTest } from "../dist/testing.mjs";

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

function asUserError(cause) {
  return new CliError.UserError({
    cause: cause instanceof Error ? cause : new Error(String(cause)),
  });
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
    format: storyRunFormat,
  },
  Effect.fn(function*({ "story-id": storyId, check, format }) {
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

const root = Command.make("flow-state").pipe(
  Command.withDescription("Flow State agent-facing CLI."),
  Command.withSubcommands([story.pipe(Command.withSubcommands([storyList, storyDescribe, storyRun]))]),
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
