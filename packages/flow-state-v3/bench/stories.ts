import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Option, Predicate } from "effect";
import type { Story } from "../src/host/testing/index.ts";

const fixtures = join(import.meta.dirname, "..", "fixtures");

// Story files in either layout the fixtures have had: `<app>/stories.ts` or `<app>/stories/*.ts`.
const storyFiles = () =>
  readdirSync(fixtures, { recursive: true, encoding: "utf8" })
    .filter((file) => /^[^/]+\/(stories\.ts|stories\/[^/]+\.ts)$/.test(file))
    .toSorted()
    .map((file) => join(fixtures, file));

// FLOW_STATE_ALLOW_UNKNOWN: a Story file's exports are whatever its module exports.
// RETURN_TYPE: a type guard states the type it narrows to.
const isStory = (value: unknown): value is Story<string> =>
  Predicate.hasProperty(value, "id") &&
  Predicate.hasProperty(value, "steps") &&
  Predicate.hasProperty(value, "run") &&
  Predicate.isString(value.id) &&
  Predicate.isFunction(value.run);

/**
 * Finds a fixture Story by its id among the values every Story file exports.
 *
 * **When to use**
 *
 * For a bench that names a Story by id, so the same declaration finds it at a commit whose
 * fixtures lie in another layout.
 *
 * **Details**
 *
 * Only exported Story values are found, not Stories a function builds on call.
 */
export const storyById = async (id: string) => {
  for (const file of storyFiles()) {
    // FLOW_STATE_ALLOW_UNKNOWN: a module's namespace holds whatever the file exports.
    const module: Readonly<Record<string, unknown>> = await import(pathToFileURL(file).href);
    const found = Object.values(module).find((value) => isStory(value) && value.id === id);

    if (isStory(found)) return Option.some(found);
  }

  return Option.none<Story<string>>();
};
