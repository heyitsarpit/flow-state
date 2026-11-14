/// <reference types="node" />
import { Console, Effect, Option, Schema } from "effect";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { HELD } from "../dsl/held-traces.ts";
import { flag, MAIN, PACKAGE, parallelOf } from "./args.ts";
import { runChild } from "./child.ts";
import { applyEdits, copyPackage } from "./falsify.ts";
import { OPERATORS } from "./mutate.ts";

/**
 * The lifecycle model's fold files the held traces are judged against (T61; the 57 held traces).
 */
const FOLD_FILES: ReadonlyArray<string> = [
  "conformance/dsl/lifecycle.ts",
  "conformance/dsl/lifecycle-lanes.ts",
  "conformance/dsl/lifecycle-lives.ts",
  "conformance/dsl/lifecycle-fold.ts",
];

/**
 * One fold-code mutant: a file, the line it edits, and the line's text before and after.
 */
export type FoldMutant = { readonly file: string; readonly find: string; readonly replace: string };

/**
 * Every operator flip on a line that occurs once in its fold file.
 */
// RETURN_TYPE: the named mutant type the runner and its child share.
export const foldMutants = (packageDir: string): ReadonlyArray<FoldMutant> =>
  FOLD_FILES.flatMap((file) => {
    const lines = readFileSync(join(packageDir, file), "utf8").split("\n");

    return lines.flatMap((line) =>
      lines.filter((l) => l === line).length !== 1 || line.trimStart().startsWith("*")
        ? []
        : OPERATORS.flatMap(([from, to]) =>
            line.includes(from) ? [{ file, find: line, replace: line.replace(from, to) }] : [],
          ),
    );
  });

const Kills = Schema.fromJsonString(Schema.Array(Schema.String));

const killsUnder = (scratch: string, mutant: FoldMutant) =>
  Effect.scoped(
    Effect.gen(function* () {
      const { copy } = yield* copyPackage(PACKAGE, scratch);
      yield* applyEdits(copy, { edits: [mutant] });
      const out = yield* runChild("bun", [join(copy, "conformance/runner/trace-kills.ts")], 120);
      const line = out.stdout.split("\n").find((l) => l.startsWith("TRACE-KILLS "));

      return Option.match(Option.fromUndefinedOr(line), {
        onNone: () => Option.none<ReadonlyArray<string>>(),
        onSome: (l) => Option.some(Schema.decodeUnknownSync(Kills)(l.slice("TRACE-KILLS ".length))),
      });
    }),
  ).pipe(Effect.catch(() => Effect.succeed(Option.none<ReadonlyArray<string>>())));

/**
 * Each held trace's fold kills no other trace makes: the held traces that pin fold code.
 */
export const heldVerdicts = (runs: ReadonlyArray<ReadonlyArray<string>>) =>
  HELD.map((name) => {
    const unique = runs.filter((killed) => killed.includes(name) && killed.length === 1).length;

    return { name, unique };
  });

/**
 * The fold-mutant mode (T61): every operator flip in the lifecycle fold files (`--limit`, default
 * all), each on its own copy of the package, judged by which lifecycle traces stop holding. A held
 * trace that alone kills some mutant pins fold code and stays; one that kills none alone is
 * redundant. Writes `held-traces.tsv` (trace, mutants it alone kills) beside the suite.
 */
export const foldMutantsMode = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const scratch = resolve(Option.getOrElse(flag(args, "--scratch"), () => tmpdir()));
    const all = foldMutants(PACKAGE);
    const limit = Number(Option.getOrElse(flag(args, "--limit"), () => String(all.length)));
    const chosen = all.slice(0, limit);

    const runs = yield* Effect.forEach(chosen, (m) => killsUnder(scratch, m), {
      concurrency: parallelOf(args),
    });

    const judged = runs.flatMap((r) => Option.toArray(r));
    const verdicts = heldVerdicts(judged);
    const survived = judged.filter((k) => k.length === 0).length;

    yield* Effect.sync(() =>
      writeFileSync(
        resolve(dirname(MAIN), "..", "held-traces.tsv"),
        `${verdicts.map((v) => `${v.name}\t${v.unique}`).join("\n")}\n`,
      ),
    );

    for (const v of verdicts)
      yield* Console.log(`${v.unique > 0 ? "pins" : "REDUNDANT"} ${v.name}  (${v.unique} alone)`);

    yield* Console.log(
      `VERDICT ${verdicts.filter((v) => v.unique > 0).length}/${verdicts.length} held traces pin fold code; ${judged.length}/${chosen.length} mutants judged, ${survived} survived every trace`,
    );
  });
