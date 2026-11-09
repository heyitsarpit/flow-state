/// <reference types="node" />
import { Data, Effect, Option, Schema } from "effect";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { Lie } from "../oracles/oracle.ts";
import { type ChildFailed, runChild } from "./child.ts";
import { type CaseVerdict, VERDICTS_LINE, VerdictsJson } from "./verdict.ts";

/**
 * What became of one lie: caught by its oracle, red for another reason, green, or not run.
 */
export type LieVerdict = Data.TaggedEnum<{
  Caught: { readonly lie: string; readonly why: string };
  WrongReason: { readonly lie: string; readonly why: string };
  Survived: { readonly lie: string };
  NotApplied: { readonly lie: string; readonly why: string };
  NoVerdict: { readonly lie: string; readonly why: string };
}>;

/**
 * Constructors and matchers for {@link LieVerdict}.
 */
export const LieVerdict = Data.taggedEnum<LieVerdict>();

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
        const root = mkdtempSync(join(scratch, "flow-lie-"));
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

const applyEdit = (runtime: string, edit: Lie["edits"][number]) =>
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

const applyEdits = (runtime: string, lie: Lie) =>
  Effect.forEach(lie.edits, (edit) => applyEdit(runtime, edit), { concurrency: 1 });

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

// RETURN_TYPE: each branch builds one variant; the union keeps them one LieVerdict.
const judge = (lie: Lie, verdicts: ReadonlyArray<CaseVerdict>): LieVerdict => {
  const red = verdicts.flatMap((v) => (v._tag === "Fail" ? [v] : []));
  const caught = red.find((v) => Option.contains(v.oracle, lie.oracle));

  if (caught !== undefined)
    return LieVerdict.Caught({ lie: lie.name, why: `${caught.id}: ${caught.why}` });
  const [other] = red;

  if (other !== undefined)
    return LieVerdict.WrongReason({ lie: lie.name, why: `${other.id}: ${other.why}` });

  return LieVerdict.Survived({ lie: lie.name });
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
 * Applies one lie to a fresh copy of the runtime, runs its cases there and judges the result.
 *
 * **Details**
 *
 * The copy lives in `scratch` and is removed when the run ends, whatever its outcome.
 */
export const falsifyOne = (main: string, runtimeDir: string, scratch: string, lie: Lie) =>
  Effect.scoped(
    Effect.gen(function* () {
      const copy = yield* copyRuntime(runtimeDir, scratch);
      yield* applyEdits(copy.runtime, lie);

      return judge(lie, yield* suiteIn(main, copy.runtime, lie.cases, 120));
    }),
  ).pipe(
    Effect.catchTags({
      Unapplied: (e: Unapplied) =>
        Effect.succeed(LieVerdict.NotApplied({ lie: lie.name, why: e.why })),
      NoVerdicts: (e: NoVerdicts) =>
        Effect.succeed(LieVerdict.NoVerdict({ lie: lie.name, why: e.why })),
    }),
  );
