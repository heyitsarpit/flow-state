/// <reference types="node" />
import { Data, Effect, Option, Schema } from "effect";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
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

const copyRuntime = (runtimeDir: string, scratch: string) =>
  Effect.acquireRelease(
    Effect.sync(() => {
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
    }),
    ({ root }) => Effect.sync(() => rmSync(root, { recursive: true, force: true })),
  );

const applyEdits = (runtime: string, lie: Lie) =>
  Effect.forEach(
    lie.edits,
    (edit) =>
      Effect.suspend(() => {
        const path = join(runtime, edit.file);
        const text = readFileSync(path, "utf8");
        const n = occurrences(text, edit.find);

        if (n !== 1)
          return Effect.fail(
            new Unapplied({ why: `${edit.file}: the edit's text occurs ${n} times` }),
          );
        writeFileSync(
          path,
          text.replace(edit.find, () => edit.replace),
        );

        return Effect.void;
      }),
    { concurrency: 1 },
  );

const verdictsOf = (stdout: string) =>
  Option.match(
    Option.fromUndefinedOr(stdout.split("\n").find((line) => line.startsWith(VERDICTS_LINE))),
    {
      onNone: () => Effect.succeed(Option.none<ReadonlyArray<CaseVerdict>>()),
      onSome: (line) =>
        Schema.decodeEffect(VerdictsJson)(line.slice(VERDICTS_LINE.length)).pipe(
          Effect.map(Option.some),
          Effect.orElseSucceed(() => Option.none()),
        ),
    },
  );

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
 * `main` is the runner's entry file; the child runs `bun <main> suite --json`.
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
    Effect.flatMap((out) =>
      verdictsOf(out.stdout).pipe(Effect.map((verdicts) => ({ out, verdicts }))),
    ),
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
      const { out, verdicts } = yield* suiteIn(main, copy.runtime, lie.cases, 120);

      return Option.match(verdicts, {
        onNone: () =>
          LieVerdict.NoVerdict({
            lie: lie.name,
            why: `exit ${out.code}: ${out.stderr.slice(-300)}`,
          }),
        onSome: (v) => judge(lie, v),
      });
    }),
  ).pipe(
    Effect.catchTags({
      Unapplied: (e: Unapplied) =>
        Effect.succeed(LieVerdict.NotApplied({ lie: lie.name, why: e.why })),
      ChildFailed: (e: ChildFailed) =>
        Effect.succeed(LieVerdict.NoVerdict({ lie: lie.name, why: e.why })),
    }),
  );

/**
 * The directory the runner's own files live in, from its entry file.
 */
export const runnerDir = (main: string) => dirname(main);
