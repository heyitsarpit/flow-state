// @effect-diagnostics unstableApiUsage:off -- the CLI is built on effect/cli and its Path service, which Effect marks unstable; chosen over parsing argv by hand.
import { Cause, Console, Data, Effect, Option, Path } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import type { StoryRun } from "../testing/run.ts";
import { render } from "../trace.ts";
import { discover, type Found } from "./discover.ts";

class UnknownStory extends Data.TaggedError("UnknownStory")<{ readonly id: string }> {
  override get message() {
    return `no Story has the id ${this.id}`;
  }
}

class RunRejected extends Data.TaggedError("RunRejected")<{
  readonly id: string;
  readonly problem: string;
}> {
  override get message() {
    return `the Story ${this.id} was rejected: ${this.problem}`;
  }
}

const document = (texts: ReadonlyArray<string>) => Console.log(texts.join("\n"));

const projectRoot = Flag.String("project-root").pipe(
  Flag.withDescription("The folder that holds flow.config.ts"),
  Flag.withDefault("."),
);

const storyId = Argument.String("story-id").pipe(Argument.withDescription("The Story's own id"));

const stories = Effect.fn("stories")(function* (root: string) {
  const path = yield* Path.Path;

  return yield* discover(path.resolve(root));
});

const find = Effect.fn("find")(function* (root: string, id: string) {
  const story = (yield* stories(root)).find((found) => found.id === id);

  if (story === undefined) return yield* new UnknownStory({ id });

  return story;
});

const runOnce = Effect.fn("runOnce")(function* (story: Found) {
  return yield* Effect.mapError(
    story.run,
    (fault) => new RunRejected({ id: story.id, problem: fault.message }),
  );
});

const checkpointLines = (run: StoryRun<string>) =>
  run.trace.events.flatMap(({ sequence, record }) =>
    record._tag === "Step" && record.step._tag === "checkpoint"
      ? [
          `checkpoint ${record.step.name} ${sequence}`,
          ...(run.checkpoints[record.step.name]?.inspection.actors ?? []).map(
            ({ actor, snapshot }) => `  ${actor} ${snapshot.state}`,
          ),
        ]
      : [],
  );

const list = Command.make("list", { projectRoot }, ({ projectRoot }) =>
  Effect.flatMap(stories(projectRoot), (found) =>
    document(found.map(({ id, app }) => `${id} ${Option.getOrElse(app, () => "-")}`)),
  ),
).pipe(Command.withDescription("Name every Story the config lists, with its app"));

const run = Command.make("run", { projectRoot, storyId }, ({ projectRoot, storyId }) =>
  Effect.gen(function* () {
    const story = yield* find(projectRoot, storyId);
    const ran = yield* runOnce(story);

    yield* document([`story ${story.id}`, ...checkpointLines(ran)]);
  }),
).pipe(Command.withDescription("Run a Story once and print its checkpoints"));

const trace = Command.make("trace", { projectRoot, storyId }, ({ projectRoot, storyId }) =>
  Effect.gen(function* () {
    const ran = yield* runOnce(yield* find(projectRoot, storyId));

    // The text render ends with one newline of its own; `Console.log` adds that one.
    yield* document([render(ran.trace, "text").replace(/\n$/, "")]);
  }),
).pipe(Command.withDescription("Run a Story once and print its trace"));

const flow = Command.make("flow").pipe(
  Command.withSubcommands([
    Command.make("story").pipe(
      Command.withDescription("List and run Stories"),
      Command.withSubcommands([list, run]),
    ),
    trace,
  ]),
);

/**
 * Runs the `flow` command line over its arguments and returns the process's exit code.
 *
 * **When to use**
 *
 * The `flow` bin calls it with the process's arguments; tests call it directly.
 *
 * **Details**
 *
 * `flow story list` names every Story `flow.config.ts` lists, with its app id; `flow story run
 * <story-id>` runs the Story once and prints each checkpoint with its trace sequence and each
 * actor's state; `flow trace <story-id>` runs it once and prints `render(run.trace, "text")`. Each
 * takes `--project-root`, the folder holding `flow.config.ts`, by default the working folder.
 * Every result is one newline-terminated document written with `Console.log`. A config that does
 * not load, an unknown Story or a rejected run writes one `flow: ` line with `Console.error` and
 * returns 2. A usage error prints the command's help with `Console.log` and its errors with
 * `Console.error`, as effect/cli renders them, and returns 2; help asked for, or a command named
 * without its subcommand, prints help and returns 0. Otherwise it returns 0.
 *
 * **Gotchas**
 *
 * - It needs effect/cli's environment (`Command.Environment`); stories are found with its
 *   `FileSystem.glob`, so the caller provides a real file system.
 *
 * @example
 * ```ts
 * const code = await Effect.runPromise(main(["trace", "shop/usual"]).pipe(Effect.provide(platform)))
 * ```
 */
export const main = (argv: ReadonlyArray<string>) =>
  Command.runWith(flow, { version: "0.0.0" })(argv).pipe(
    Effect.as(0),
    Effect.catchTag(["ConfigLoadFailed", "UnknownStory", "RunRejected"], (error) =>
      Effect.as(Console.error(`flow: ${error.message}`), 2),
    ),
    Effect.catchTag("ShowHelp", (help) => Effect.succeed(help.errors.length === 0 ? 0 : 2)),
    Effect.catchCause((cause) => Effect.as(Console.error(`flow: ${Cause.pretty(cause)}`), 2)),
  );
