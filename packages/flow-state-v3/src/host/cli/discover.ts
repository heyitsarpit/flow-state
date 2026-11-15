// @effect-diagnostics unstableApiUsage:off -- discovery runs inside effect/cli's environment and uses its FileSystem and Path services, which Effect marks unstable.
import { Data, Effect, FileSystem, Option, Path, Predicate } from "effect";
import { type Config, ConfigId } from "../testing/config.ts";
import type { StoryRun } from "../testing/run.ts";
import type { Step } from "../testing/steps.ts";
import { StoryId } from "../testing/story.ts";

/**
 * The project's `flow.config.ts` is missing, does not load, or lists Stories it cannot have.
 */
export class ConfigLoadFailed extends Data.TaggedError("ConfigLoadFailed")<{
  readonly problem: string;
}> {
  override get message() {
    return this.problem;
  }
}

/**
 * A Story the config lists, with the id of the app it is listed under.
 */
export type Found = {
  readonly id: string;
  readonly app: Option.Option<string>;
  readonly steps: ReadonlyArray<Step>;
  readonly run: () => Promise<StoryRun>;
};

type Branded = Omit<Found, "app"> & { readonly [StoryId]: string };

// FLOW_STATE_ALLOW_UNKNOWN: a config file's default export is whatever its module exports.
// RETURN_TYPE: a type guard states the type it narrows to.
const isConfig = (value: unknown): value is Config => Predicate.hasProperty(value, ConfigId);

// FLOW_STATE_ALLOW_UNKNOWN: a Story file's exports are whatever its module exports.
// RETURN_TYPE: a type guard states the type it narrows to.
const isStory = (value: unknown): value is Branded => Predicate.hasProperty(value, StoryId);

// FLOW_STATE_ALLOW_UNKNOWN: a module's namespace holds whatever the file exports.
type Module = Readonly<Record<string, unknown>>;

const failed = (problem: string) => new ConfigLoadFailed({ problem });

// FLOW_STATE_ALLOW_UNKNOWN: a rejected import or a platform failure carries any value.
const because = (problem: string) => (fault: unknown) =>
  failed(`${problem}: ${fault instanceof Error ? fault.message : String(fault)}`);

const load = Effect.fn("load")(function* (file: string, what: string) {
  const path = yield* Path.Path;
  const url = yield* Effect.mapError(path.toFileUrl(file), because(`${what} has no file URL`));

  // FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: loading a project's own module is a dynamic import, a Promise.
  return yield* Effect.tryPromise<Module, ConfigLoadFailed>({
    try: () => import(url.href),
    catch: (fault) => because(`${what} did not load`)(fault),
  });
});

const matches = Effect.fn("matches")(function* (root: string, pattern: string) {
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;

  const files = yield* Effect.mapError(
    fs.glob(pattern, { root }),
    because(`the glob ${pattern} could not be read`),
  );

  if (files.length === 0) return yield* failed(`the glob ${pattern} matches no file`);

  const escaping = files.find((file) => {
    const inside = path.relative(root, path.resolve(root, file));

    return inside === ".." || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside);
  });

  if (escaping !== undefined) return yield* failed(`${escaping} is outside the project root`);

  return files.toSorted().map((file) => path.resolve(root, file));
});

const exported = (file: string) =>
  Effect.map(load(file, file), (module) => Object.values(module).filter(isStory));

const storiesIn = Effect.fn("storiesIn")(function* (
  root: string,
  patterns: ReadonlyArray<string>,
  app: Option.Option<string>,
) {
  const files = (yield* Effect.forEach(patterns, (pattern) => matches(root, pattern), {
    concurrency: 1,
  })).flat();

  const stories = [...new Set((yield* Effect.forEach(files, exported, { concurrency: 1 })).flat())];
  const foreign = stories.find((story) => Option.exists(app, (id) => story[StoryId] !== id));

  if (foreign !== undefined)
    return yield* failed(`the Story ${foreign.id} is listed under an app it does not run`);

  return stories.map((story) => ({ id: story.id, app, steps: story.steps, run: story.run }));
});

/**
 * Reads `flow.config.ts` at a project root and returns every Story it lists, in config order:
 * each app's files, then the files of Stories with no app; within a glob, files in path order; within
 * a file, its exports in order.
 */
export const discover = Effect.fn("discover")(function* (root: string) {
  const path = yield* Path.Path;
  const loaded = yield* load(path.join(root, "flow.config.ts"), "flow.config.ts");
  const config = loaded["default"];

  if (!isConfig(config))
    return yield* failed("flow.config.ts does not export a defineConfig result as its default");

  const groups = [
    ...config.apps.map(({ app, stories }) => ({ app: Option.some(app.id), stories })),
    { app: Option.none<string>(), stories: config.stories },
  ];

  const found = (yield* Effect.forEach(
    groups,
    ({ app, stories }) => storiesIn(root, stories, app),
    { concurrency: 1 },
  )).flat();

  const twice = found.find((story, n) => found.findIndex(({ id }) => id === story.id) !== n);

  if (twice !== undefined) return yield* failed(`two Stories have the id ${twice.id}`);

  if (found.length === 0) return yield* failed("flow.config.ts lists no Story");

  return found;
});
