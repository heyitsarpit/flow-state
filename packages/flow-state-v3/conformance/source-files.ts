import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Predicate, Result } from "effect";

const SCRATCH = /^dsl-(?:mutant|leak)-/u;

/**
 * The suite's own files under `dir` whose names match `name`, walked from disk.
 *
 * **Details**
 *
 * Other tests copy `dsl/` beside it while the suite runs (`dsl-mutant-*`, `dsl-leak-*`) and remove
 * the copy afterwards: those copies are skipped, and a directory or file that vanished mid-walk
 * (ENOENT) is left out rather than thrown; any other read error is thrown.
 */
// RETURN_TYPE: a recursive walk names its type.
export const sourceFiles = (dir: string, name: RegExp): ReadonlyArray<string> =>
  unlessVanished(
    () => readdirSync(dir, { withFileTypes: true }),
    () => [],
  ).flatMap((e) => {
    if (e.isDirectory()) return SCRATCH.test(e.name) ? [] : sourceFiles(join(dir, e.name), name);

    return name.test(e.name) ? [join(dir, e.name)] : [];
  });

/**
 * A file's text, or empty when it vanished since it was listed.
 *
 * **Gotchas**
 *
 * - Only a missing file (ENOENT) reads as empty; any other read error is thrown.
 */
export const sourceOf = (file: string) =>
  unlessVanished(
    () => readFileSync(file, "utf8"),
    () => "",
  );

const unlessVanished = <A>(read: () => A, gone: () => A) =>
  Result.getOrElse(Result.try(read), (error) => {
    if (Predicate.hasProperty(error, "code") && error.code === "ENOENT") return gone();

    throw error;
  });
