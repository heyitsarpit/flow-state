// @effect-diagnostics unstableApiUsage:off -- the CLI is built on effect/cli, Stdio and Path, which Effect marks unstable; chosen over parsing argv by hand.
import { Data, Effect, Option, Path, Stdio, Stream } from "effect";
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

const write = (to: "stdout" | "stderr", text: string) =>
  Stdio.Stdio.use((stdio) => Stream.run(Stream.make(text), stdio[to]()));

const document = (lines: ReadonlyArray<string>) => write("stdout", [...lines, ""].join("\n"));

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
  const found = yield* stories(root);

  return yield* Option.match(Option.fromUndefinedOr(found.find((story) => story.id === id)), {
    onNone: () => Effect.fail(new UnknownStory({ id })),
    onSome: Effect.succeed,
  });
});

const runOnce = (story: Found) =>
  // FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: a Story's run() is the tooling's public Promise; it rejects with StoryFailed or StoryTurnLimit.
  Effect.tryPromise({
    try: story.run,
    catch: (fault) =>
      new RunRejected({
        id: story.id,
        problem: fault instanceof Error ? fault.message : String(fault),
      }),
  });

const checkpointLines = (run: StoryRun) =>
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

    yield* write("stdout", render(ran.trace, "text"));
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
 * Results go to standard output. A usage error, a config that does not load, an unknown Story or a
 * rejected run prints one message to standard error and returns 2; otherwise it returns 0.
 *
 * @example
 * ```ts
 * const code = await Effect.runPromise(
 *   main(["trace", "pay/usual"]).pipe(Effect.provide(NodeServices.layer)),
 * )
 * ```
 */
export const main = (argv: ReadonlyArray<string>) =>
  Command.runWith(flow, { version: "0.0.0" })(argv).pipe(
    Effect.as(0),
    Effect.catchTags({
      ConfigLoadFailed: (error) => Effect.as(write("stderr", `flow: ${error.message}\n`), 2),
      UnknownStory: (error) => Effect.as(write("stderr", `flow: ${error.message}\n`), 2),
      RunRejected: (error) => Effect.as(write("stderr", `flow: ${error.message}\n`), 2),
    }),
    Effect.catch(() => Effect.succeed(2)),
  );
