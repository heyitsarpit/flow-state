/// <reference types="node" />
import { Console, Effect } from "effect";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { falsifyProduction } from "./falsify.ts";

const OPERATORS: ReadonlyArray<readonly [string, string]> = [
  [" === ", " !== "],
  [" !== ", " === "],
  [" && ", " || "],
  [" || ", " && "],
  [" < ", " <= "],
  [" >= ", " > "],
];

/**
 * One generic mutant of the core: a line of `src/core` with one operator flipped.
 */
type CoreMutant = {
  readonly file: string;
  readonly line: number;
  readonly find: string;
  readonly replace: string;
};

/**
 * Every operator flip in `src/core` whose line is unique in its file, in file and line order
 * (advisor Q7: a small operator mutator, the StrykerJS fallback).
 */
export const coreMutants = (packageDir: string) =>
  readdirSync(join(packageDir, "src", "core"))
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .toSorted()
    .flatMap((f) => {
      const text = readFileSync(join(packageDir, "src", "core", f), "utf8");
      const lines = text.split("\n");

      return lines.flatMap((line, i) => {
        const trimmed = line.trim();

        if (trimmed.startsWith("//") || trimmed.startsWith("*") || text.split(line).length !== 2)
          return [];

        return OPERATORS.flatMap(([from, to]) =>
          line.split(from).length === 2
            ? [{ file: `src/core/${f}`, line: i + 1, find: line, replace: line.replace(from, to) }]
            : [],
        );
      });
    });

const pick = <A>(all: ReadonlyArray<A>, limit: number) => {
  const step = Math.max(1, Math.floor(all.length / limit));

  return all.filter((_, i) => i % step === 0).slice(0, limit);
};

/**
 * Runs up to `limit` core mutants, spread over the core, each on its own copy of the package
 * against the production cases. A mutant is killed when any case goes red. Writes every result to
 * `core-mutants.tsv` and lists the survivors: the review's work list.
 */
export const runCoreMutants = (options: {
  readonly packageDir: string;
  readonly scratch: string;
  readonly cases: ReadonlyArray<string>;
  readonly limit: number;
  readonly parallel: number;
}) =>
  Effect.gen(function* () {
    const all = coreMutants(options.packageDir);
    const chosen = pick(all, options.limit);

    const results = yield* Effect.forEach(
      chosen,
      (m: CoreMutant) =>
        falsifyProduction(options.packageDir, options.scratch, "any", {
          name: `${m.file}:${m.line}`,
          says: `flip: ${m.replace.trim()}`,
          expects: "Turn I2",
          runtime: "production",
          cases: options.cases,
          edits: [{ file: m.file, find: m.find, replace: m.replace }],
        }).pipe(
          Effect.map(({ rows }) => {
            const ran = rows.every(
              (r) => !r.endsWith("\tno verdict") && !r.endsWith("\tnot applied"),
            );

            const killed = rows.some(
              (r) =>
                / (?:caught|red) |\ttime$/u.test(r) ||
                r.includes("\tcaught ") ||
                r.includes("\tred "),
            );

            if (!ran) return `ERROR\t${m.file}:${m.line}\t${rows.join(" ")}`;

            return `${killed ? "killed" : "SURVIVED"}\t${m.file}:${m.line}\t${m.replace.trim()}`;
          }),
        ),
      { concurrency: options.parallel },
    );

    writeFileSync(
      join(options.packageDir, "conformance", "core-mutants.tsv"),
      `${results.join("\n")}\n`,
    );
    const survivors = results.filter((r) => !r.startsWith("killed"));

    for (const s of survivors) yield* Console.log(s);
    yield* Console.log(
      `VERDICT core mutants: ${results.length - survivors.length}/${results.length} killed (${all.length} candidates)`,
    );
  });
