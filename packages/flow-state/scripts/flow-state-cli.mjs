#!/usr/bin/env node

import { Effect, Exit, Option } from "effect";
import { Argument, CliError, Command, Flag } from "effect/unstable/cli";

import {
  createStoryRegistry,
  formatStoryDescribeText,
  formatStoryListText,
  loadGatewayTarget,
  storyDescribeJson,
  storyListJson,
} from "./cli-shared.mjs";

const projectRoot = Flag.string("project-root").pipe(
  Flag.withDescription("Project root that owns the behavior gateway."),
  Flag.withDefault(process.cwd()),
);

const gateway = Flag.string("gateway").pipe(
  Flag.withDescription("Gateway entrypoint. Defaults to src/app/behavior.ts under the project root."),
  Flag.optional,
);

const storyFormat = Flag.choice("format", ["text", "json"]).pipe(
  Flag.withDescription("Output format."),
  Flag.withDefault("text"),
);

function asUserError(cause) {
  return new CliError.UserError({
    cause: cause instanceof Error ? cause : new Error(String(cause)),
  });
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
    format: storyFormat,
  },
  Effect.fn(function*({ machine, tag, format }) {
    const parent = yield* story;
    const gatewayPath = Option.getOrUndefined(parent.gateway);
    const selectedMachine = Option.getOrUndefined(machine);
    const selectedTag = Option.getOrUndefined(tag);
    const target = yield* Effect.tryPromise({
      try: () =>
        loadGatewayTarget({
          "project-root": parent["project-root"],
          ...(gatewayPath === undefined ? {} : { gateway: gatewayPath }),
        }),
      catch: asUserError,
    });
    const registry = yield* Effect.try({
      try: () => createStoryRegistry(target.gateway),
      catch: asUserError,
    });
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
    format: storyFormat,
  },
  Effect.fn(function*({ "story-id": storyId, format }) {
    const parent = yield* story;
    const gatewayPath = Option.getOrUndefined(parent.gateway);
    const target = yield* Effect.tryPromise({
      try: () =>
        loadGatewayTarget({
          "project-root": parent["project-root"],
          ...(gatewayPath === undefined ? {} : { gateway: gatewayPath }),
        }),
      catch: asUserError,
    });
    const registry = yield* Effect.try({
      try: () => createStoryRegistry(target.gateway),
      catch: asUserError,
    });
    const entry = registry.storiesById.get(storyId);

    if (entry === undefined) {
      yield* Effect.fail(
        new CliError.UserError({
          cause: new Error(
            `Unknown story '${storyId}'. Available story ids: ${registry.stories
              .map((candidate) => candidate.story.id)
              .sort()
              .join(", ")}.`,
          ),
        }),
      );
    }

    const output =
      format === "json"
        ? JSON.stringify(storyDescribeJson(entry), null, 2)
        : formatStoryDescribeText(entry);

    yield* Effect.sync(() => {
      process.stdout.write(`${output}\n`);
    });
  }),
).pipe(Command.withDescription("Describe one declared story without running it."));

const root = Command.make("flow-state").pipe(
  Command.withDescription("Flow State agent-facing CLI."),
  Command.withSubcommands([story.pipe(Command.withSubcommands([storyList, storyDescribe]))]),
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
