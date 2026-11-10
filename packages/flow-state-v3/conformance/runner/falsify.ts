/// <reference types="node" />
import { Data, Effect, Option, Schema } from "effect";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { Mutant } from "../dsl/oracle.ts";
import { type ChildFailed, runChild } from "./child.ts";
import { type CaseVerdict, VERDICTS_LINE, VerdictsJson } from "./verdict.ts";

/**
 * What became of one mutant: caught by its oracle, red for another reason, green, or not run.
 * `red` lists every case the mutant turned red; `caughtIn` those its own oracle named.
 */
export type MutantVerdict = Data.TaggedEnum<{
  Caught: {
    mutant: string;
    why: string;
    red: ReadonlyArray<string>;
    caughtIn: ReadonlyArray<string>;
  };
  WrongReason: { mutant: string; why: string; red: ReadonlyArray<string> };
  Survived: { mutant: string };
  NotApplied: { mutant: string; why: string };
  NoVerdict: { mutant: string; why: string };
}>;

/**
 * Constructors and matchers for {@link MutantVerdict}.
 */
export const MutantVerdict = Data.taggedEnum<MutantVerdict>();

class Unapplied extends Data.TaggedError("Unapplied")<{ readonly why: string }> {}

const occurrences = (text: string, find: string) => text.split(find).length - 1;

/**
 * A child run printed no readable verdicts: it died, or printed something else.
 */
export class NoVerdicts extends Data.TaggedError("NoVerdicts")<{ readonly why: string }> {}

const copyRuntime = (runtimeDir: string, scratch: string) =>
  Effect.acquireRelease(
    Effect.try({
      try: () => {
        const root = mkdtempSync(join(scratch, "flow-mutant-"));
        const prototypes = join(root, "prototypes");
        cpSync(runtimeDir, join(prototypes, basename(runtimeDir)), {
          recursive: true,
          filter: (f) => basename(f) !== "node_modules",
        });
        symlinkSync(resolve(runtimeDir, "..", "conformance"), join(prototypes, "conformance"));
        symlinkSync(
          resolve(runtimeDir, "..", "..", "..", "..", "node_modules"),
          join(root, "node_modules"),
        );

        return { root, runtime: join(prototypes, basename(runtimeDir)) };
      },
      catch: (cause) => new NoVerdicts({ why: `could not copy the runtime: ${String(cause)}` }),
    }),
    ({ root }) => Effect.sync(() => rmSync(root, { recursive: true, force: true })),
  );

const applyEdit = (runtime: string, edit: Mutant["edits"][number]) =>
  Effect.try({
    try: () => {
      const path = join(runtime, edit.file);
      const text = readFileSync(path, "utf8");

      return { path, text, n: occurrences(text, edit.find) };
    },
    catch: (cause) => new Unapplied({ why: `${edit.file}: ${String(cause)}` }),
  }).pipe(
    Effect.flatMap(({ path, text, n }) =>
      n === 1
        ? Effect.try({
            try: () =>
              writeFileSync(
                path,
                text.replace(edit.find, () => edit.replace),
              ),
            catch: (cause) => new Unapplied({ why: `${edit.file}: ${String(cause)}` }),
          })
        : Effect.fail(new Unapplied({ why: `${edit.file}: the edit's text occurs ${n} times` })),
    ),
  );

const applyEdits = (runtime: string, mutant: Mutant) =>
  Effect.forEach(mutant.edits, (edit) => applyEdit(runtime, edit), { concurrency: 1 });

const verdictsOf = (stdout: string, stderr: string, code: number) =>
  Option.match(
    Option.fromUndefinedOr(stdout.split("\n").find((line) => line.startsWith(VERDICTS_LINE))),
    {
      onNone: () =>
        Effect.fail(new NoVerdicts({ why: `exit ${code}, no verdicts: ${stderr.slice(-300)}` })),
      onSome: (line) =>
        Schema.decodeEffect(VerdictsJson)(line.slice(VERDICTS_LINE.length)).pipe(
          Effect.mapError(
            (issue) =>
              new NoVerdicts({ why: `unreadable verdicts: ${String(issue).slice(0, 300)}` }),
          ),
        ),
    },
  );

// RETURN_TYPE: each branch builds one variant; the union keeps them one MutantVerdict.
const judge = (
  mutant: Mutant,
  oracle: string,
  verdicts: ReadonlyArray<CaseVerdict>,
): MutantVerdict => {
  const red = verdicts.flatMap((v) => (v._tag === "Fail" ? [v] : []));
  const ids = red.map((v) => v.id);
  const named = `${oracle}: ${mutant.expects}:`;
  const caughtIn = red.filter((v) => v.oracles.includes(oracle) && v.why.includes(named));
  const [caught] = caughtIn;

  if (caught !== undefined)
    return MutantVerdict.Caught({
      mutant: mutant.name,
      why: `${caught.id}: ${caught.why}`,
      red: ids,
      caughtIn: caughtIn.map((v) => v.id),
    });
  const [other] = red;

  if (other !== undefined)
    return MutantVerdict.WrongReason({
      mutant: mutant.name,
      why: `${other.id}: ${other.why}`,
      red: ids,
    });

  return MutantVerdict.Survived({ mutant: mutant.name });
};

/**
 * Runs the suite's own cases, in a child process, on a runtime and returns their verdicts.
 *
 * **Details**
 *
 * `main` is the runner's entry file; the child runs `bun <main> suite --json`. A child that dies,
 * runs past `seconds` or prints no readable verdicts fails with `NoVerdicts`.
 */
export const suiteIn = (
  main: string,
  runtime: string,
  cases: ReadonlyArray<string>,
  seconds: number,
) =>
  runChild(
    "bun",
    [main, "suite", "--runtime", runtime, "--only", cases.join(","), "--json"],
    seconds,
  ).pipe(
    Effect.mapError((e: ChildFailed) => new NoVerdicts({ why: e.why })),
    Effect.flatMap((out) => verdictsOf(out.stdout, out.stderr, out.code)),
  );

/**
 * Applies one mutant to a fresh copy of the runtime, runs its cases there and judges the result:
 * caught only when `oracle`, the oracle of the guarantee that holds the mutant, failed a case with a
 * violation that names the Invariant the mutant `expects`.
 *
 * **Details**
 *
 * The copy lives in `scratch` and is removed when the run ends, whatever its outcome.
 */
export const falsifyOne = (
  main: string,
  runtimeDir: string,
  scratch: string,
  oracle: string,
  mutant: Mutant,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const copy = yield* copyRuntime(runtimeDir, scratch);
      yield* applyEdits(copy.runtime, mutant);

      return judge(mutant, oracle, yield* suiteIn(main, copy.runtime, mutant.cases, 120));
    }),
  ).pipe(
    Effect.catchTags({
      Unapplied: (e: Unapplied) =>
        Effect.succeed(MutantVerdict.NotApplied({ mutant: mutant.name, why: e.why })),
      NoVerdicts: (e: NoVerdicts) =>
        Effect.succeed(MutantVerdict.NoVerdict({ mutant: mutant.name, why: e.why })),
    }),
  );
