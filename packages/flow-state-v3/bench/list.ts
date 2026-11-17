import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Data, Effect, Predicate } from "effect";
import type { Bench } from "./declare.ts";

/**
 * The module the bench list comes from by default: every bench the manifests derive.
 */
export const BENCHES = join(import.meta.dirname, "benches", "index.ts");

class ListFailed extends Data.TaggedError("ListFailed")<{ readonly problem: string }> {}

// FLOW_STATE_ALLOW_UNKNOWN: a module's export is whatever it exports; each entry is checked.
// RETURN_TYPE: a type guard states the type it narrows to.
const isBench = (value: unknown): value is Bench =>
  Predicate.hasProperty(value, "id") &&
  Predicate.hasProperty(value, "concern") &&
  Predicate.hasProperty(value, "load") &&
  Predicate.isString(value.id) &&
  Predicate.isFunction(value.load);

/**
 * The benches a module exports as `benches`: the manifests' by default, or a planted list a test
 * gives with `--benches`.
 */
export const benchesFrom = Effect.fn("benchesFrom")(function* (file: string) {
  // FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: loading a bench list is a dynamic import, a Promise.
  const loaded = yield* Effect.tryPromise({
    try: () => import(pathToFileURL(file).href),
    catch: (fault) => new ListFailed({ problem: `${file} did not load: ${String(fault)}` }),
  });

  const list = Predicate.hasProperty(loaded, "benches") ? loaded.benches : [];

  return Array.isArray(list) ? list.filter(isBench) : [];
});
