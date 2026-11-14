/// <reference types="node" />
import { Console, Effect, Option, Schema } from "effect";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { traces } from "../dsl/lifecycle.traces.ts";
import { flag, MAIN, PACKAGE, parallelOf } from "./args.ts";
import { runChild } from "./child.ts";
import { applyEdits, copyPackage } from "./falsify.ts";
import { OPERATORS } from "./mutate.ts";

/**
 * The lifecycle model's fold files the traces are judged against (T61; the held traces).
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
 * Each trace's fold kills, keyed by the mutant's place in the run, and how many no other trace
 * makes.
 */
export const heldVerdicts = (runs: ReadonlyArray<Option.Option<ReadonlyArray<string>>>) =>
  traces.map(({ name }) => {
    const killed = runs.flatMap((r, i) => (Option.exists(r, (k) => k.includes(name)) ? [i] : []));

    const unique = killed.filter((i) =>
      Option.exists(runs[i] ?? Option.none(), (k) => k.length === 1),
    );

    return { name, keys: killed.map((i) => `m${i}`), unique: unique.length };
  });

/**
 * The fold-mutant mode (T61): every operator flip in the lifecycle fold files (`--limit`, default
 * all), each on its own copy of the package, judged by which lifecycle traces stop holding. Writes
 * `held-traces.tsv` (each trace and the fold mutants it kills) beside the suite, which the
 * lifecycle test's redundancy gate reads: a trace goes when every table and fold kill it makes a
 * kept trace makes too.
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
    const verdicts = heldVerdicts(runs);
    const survived = judged.filter((k) => k.length === 0).length;

    yield* Effect.sync(() =>
      writeFileSync(
        resolve(dirname(MAIN), "..", "held-traces.tsv"),
        `${verdicts.map((v) => `${v.name}\t${v.keys.join(" ")}`).join("\n")}\n`,
      ),
    );

    for (const v of verdicts.filter((x) => x.unique > 0))
      yield* Console.log(`pins ${v.name}  (${v.unique} alone)`);

    for (const [i, r] of runs.entries())
      if (Option.exists(r, (k) => k.length === 0))
        yield* Console.log(`SURVIVED ${chosen[i]?.file}: ${chosen[i]?.replace.trim()}`);

    yield* Console.log(
      `VERDICT ${verdicts.filter((v) => v.unique > 0).length}/${verdicts.length} traces pin fold code; ${judged.length}/${chosen.length} mutants judged, ${survived} survived every trace`,
    );
  });
