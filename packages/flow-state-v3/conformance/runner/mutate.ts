/// <reference types="node" />
import { Console, Effect, Option } from "effect";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { coreTriage, triageFaults } from "../core-mutants-triage.ts";
import { caught } from "./caught.ts";
import { falsifyProduction, suiteIn } from "./falsify.ts";
import type { CaseVerdict } from "./verdict.ts";

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
 * What one core mutant's run came to, with the reason: `killed` only by a failed case that names
 * an oracle or cites an Invariant, as `judge` reads a catch. A red with neither (a thrown defect,
 * or a case whose child stated no verdict because the copy failed to load) is `NO-ORACLE`, a run
 * past its bound is `TIME`, and a run with no verdict at all is `ERROR`: none of them is a kill.
 */
export const coreOutcome = (result: {
  readonly rows: ReadonlyArray<string>;
  readonly verdicts: ReadonlyArray<CaseVerdict>;
}) => {
  const ran =
    result.verdicts.length > 0 &&
    result.rows.every((r) => !r.endsWith("\tno verdict") && !r.endsWith("\tnot applied"));

  if (!ran) return { status: "ERROR", why: result.rows.join(" ") };
  const fails = result.verdicts.flatMap((v) => (v._tag === "Fail" ? [v] : []));

  const killer = fails.find((v) => caught(Option.none(), v));

  if (killer !== undefined)
    return {
      status: "killed",
      why: `${killer.id}: ${[...killer.oracles, ...(killer.cites ?? [])].join(",")}`,
    };
  const [defect] = fails;

  if (defect !== undefined)
    return { status: "NO-ORACLE", why: `${defect.id}: ${defect.why.slice(0, 160)}` };
  const late = result.verdicts.find((v) => v._tag === "Timeout");

  if (late !== undefined) return { status: "TIME", why: `${late.id}: timed out` };

  return { status: "SURVIVED", why: "" };
};

/**
 * The core mutants' control faults: no case to run (a control over nothing passes vacuously), or
 * a case that did not pass on unedited production.
 */
export const controlFaults = (cases: ReadonlyArray<string>, control: ReadonlyArray<CaseVerdict>) =>
  cases.length === 0
    ? ["BAD  control: no case to run, so it proves nothing"]
    : cases
        .filter((id) => !control.some((v) => v.id === id && v._tag === "Pass"))
        .map((id) => `BAD  control: red on unedited production: ${id}`);

/**
 * Runs up to `limit` core mutants, spread over the core, each on its own copy of the package
 * against the production cases, once the unedited cases all pass (a red control voids the
 * count). A mutant is killed only as {@link coreOutcome} reads a kill. Writes every result with
 * its reason to `core-mutants.tsv`; fails on a mutant not killed and not triaged, and on a
 * triage row whose mutant is now killed (`core-mutants-triage.ts`).
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

    const control = yield* suiteIn(
      join(options.packageDir, "conformance", "runner", "main.ts"),
      "production",
      options.cases,
      240,
      ["--parallel", String(options.parallel)],
    ).pipe(Effect.catchTag("NoVerdicts", () => Effect.succeed([])));

    const voided = controlFaults(options.cases, control);

    if (voided.length > 0) {
      for (const line of voided) yield* Console.log(line);
      yield* Console.log("VERDICT core mutants: void, the control is red");
      process.exitCode = 1;

      return;
    }

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
          Effect.map((result) => {
            const { status, why } = coreOutcome(result);

            return `${status}\t${m.file}:${m.line}\t${m.replace.trim()}\t${why}`;
          }),
        ),
      { concurrency: options.parallel },
    );

    writeFileSync(
      join(options.packageDir, "conformance", "core-mutants.tsv"),
      `${results.join("\n")}\n`,
    );
    const survivors = results.filter((r) => !r.startsWith("killed"));

    const names = (t: { readonly at: string; readonly mutated: string }) => (m: CoreMutant) =>
      `${m.file}:${m.line}` === t.at && m.replace.trim() === t.mutated;

    const ghosts = coreTriage
      .filter((t) => !all.some(names(t)))
      .map((t) => `BAD  ${t.at}: triaged ${t.kind}, but no core mutant matches: ${t.mutated}`);

    const faults = [
      ...ghosts,
      ...triageFaults(
        results.map((r) => {
          const [status = "", at = "", mutated = ""] = r.split("\t");

          return { status, at, mutated };
        }),
        coreTriage.filter((t) => chosen.some(names(t))),
      ),
    ];

    for (const line of faults) yield* Console.log(line);

    if (faults.length > 0) process.exitCode = 1;

    const owing = coreTriage.filter((t) => t.kind === "owed").length;

    yield* Console.log(
      `VERDICT ${faults.length === 0 ? "pass" : "fail"} core mutants: ${results.length - survivors.length}/${results.length} killed, ${owing} owed, ${coreTriage.length - owing} equivalent, ${faults.length} untriaged or stale (${all.length} candidates)`,
    );
  });
