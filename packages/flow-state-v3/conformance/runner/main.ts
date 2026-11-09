/// <reference types="node" />
import { Console, Effect, Option, Schema } from "effect";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { nullPort } from "../adapters/null.ts";
import { loadPrototype } from "../adapters/prototype.ts";
import { lies, oracles, scenarios } from "../suite.ts";
import { falsifyOne, LieVerdict, suiteIn } from "./falsify.ts";
import { runCases } from "./run.ts";
import { type CaseVerdict, VERDICTS_LINE, VerdictsJson } from "./verdict.ts";

const MAIN = fileURLToPath(import.meta.url);
const NULL_RUNTIME = "null";
const DEFAULT_RUNTIME = resolve(dirname(MAIN), "..", "..", "prototypes", "round-14");

const flag = (args: ReadonlyArray<string>, name: string) => {
  const at = args.indexOf(name);

  return at < 0 ? Option.none<string>() : Option.fromUndefinedOr(args[at + 1]);
};

const list = (value: Option.Option<string>) =>
  Option.match(value, {
    onNone: () => Option.none<ReadonlyArray<string>>(),
    onSome: (v) => Option.some(v.split(",").filter((x) => x !== "")),
  });

const parallelOf = (args: ReadonlyArray<string>) =>
  Math.min(8, Math.max(1, Number(Option.getOrElse(flag(args, "--parallel"), () => "1")) || 1));

const lineOf = (v: CaseVerdict) =>
  v._tag === "Pass"
    ? `pass ${v.id}`
    : `FAIL ${v.id}  ${Option.getOrElse(v.oracle, () => "case")}: ${v.why}`;

const report = (verdicts: ReadonlyArray<CaseVerdict>, json: boolean) =>
  Effect.gen(function* () {
    if (json) {
      yield* Console.log(`${VERDICTS_LINE}${Schema.encodeSync(VerdictsJson)(verdicts)}`);

      return;
    }

    for (const v of verdicts) yield* Console.log(lineOf(v));
    const passed = verdicts.filter((v) => v._tag === "Pass").length;
    yield* Console.log(
      `VERDICT ${passed === verdicts.length && verdicts.length > 0 ? "pass" : "fail"} ${passed}/${verdicts.length}`,
    );

    if (passed !== verdicts.length || verdicts.length === 0) process.exitCode = 1;
  });

const sliceVerdicts = (runtime: string, ids: ReadonlyArray<string>) =>
  suiteIn(MAIN, runtime, ids, 240).pipe(
    Effect.map((run) =>
      Option.getOrElse(run.verdicts, () =>
        ids.map(
          (id) =>
            ({
              _tag: "Fail",
              id,
              oracle: Option.none(),
              why: `no verdict from its child (exit ${run.out.code}): ${run.out.stderr.slice(-200)}`,
            }) satisfies CaseVerdict,
        ),
      ),
    ),
  );

const suite = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const given = Option.getOrElse(flag(args, "--runtime"), () => DEFAULT_RUNTIME);
    const runtime = given === NULL_RUNTIME ? given : resolve(given);
    const only = list(flag(args, "--only"));

    const chosen = scenarios.filter((s) =>
      Option.match(only, { onNone: () => true, onSome: (ids) => ids.includes(s.id) }),
    );

    const json = args.includes("--json");
    const parallel = parallelOf(args);

    if (parallel > 1) {
      const slices = Array.from({ length: parallel }, (_, i) =>
        chosen.filter((_, j) => j % parallel === i).map((s) => s.id),
      ).filter((ids) => ids.length > 0);

      const runs = yield* Effect.forEach(slices, (ids) => sliceVerdicts(runtime, ids), {
        concurrency: parallel,
      });

      return yield* report(runs.flat(), json);
    }

    const port = runtime === NULL_RUNTIME ? nullPort : yield* loadPrototype(runtime);

    return yield* report(yield* runCases(port, chosen, oracles), json);
  });

const falsify = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const runtime = resolve(Option.getOrElse(flag(args, "--runtime"), () => DEFAULT_RUNTIME));
    const scratch = resolve(Option.getOrElse(flag(args, "--scratch"), () => tmpdir()));
    const only = list(flag(args, "--lie"));

    const chosen = lies.filter((l) =>
      Option.match(only, { onNone: () => true, onSome: (names) => names.includes(l.name) }),
    );

    const onNull = yield* sliceVerdicts(
      NULL_RUNTIME,
      scenarios.map((s) => s.id),
    );

    const passedOnNull = onNull.filter((v) => v._tag === "Pass").map((v) => v.id);
    const nullRed = onNull.length === scenarios.length && passedOnNull.length === 0;

    yield* Console.log(
      `${nullRed ? "ok  " : "BAD "} null runtime: every case fails${nullRed ? "" : `; passed: ${passedOnNull.join(" ")}`}`,
    );

    const control = yield* suiteIn(
      MAIN,
      runtime,
      [...new Set(chosen.flatMap((l) => l.cases))],
      120,
    );

    const controlGreen = Option.match(control.verdicts, {
      onNone: () => false,
      onSome: (v) => v.length > 0 && v.every((x) => x._tag === "Pass"),
    });

    yield* Console.log(
      `${controlGreen ? "ok  " : "BAD "} control: the lies' cases pass on the unedited runtime`,
    );

    const verdicts = yield* Effect.forEach(
      chosen,
      (lie) => falsifyOne(MAIN, runtime, scratch, lie),
      { concurrency: parallelOf(args) },
    );

    for (const v of verdicts)
      yield* Console.log(
        LieVerdict.$match(v, {
          Caught: ({ lie, why }) => `ok   ${lie}  caught: ${why}`,
          WrongReason: ({ lie, why }) => `BAD  ${lie}  red by another check: ${why}`,
          Survived: ({ lie }) => `BAD  ${lie}  survived`,
          NotApplied: ({ lie, why }) => `BAD  ${lie}  does not apply: ${why}`,
          NoVerdict: ({ lie, why }) => `BAD  ${lie}  no verdict: ${why}`,
        }),
      );
    const caught = verdicts.filter(LieVerdict.$is("Caught")).length;
    const ok = nullRed && controlGreen && caught === verdicts.length && verdicts.length > 0;
    yield* Console.log(`VERDICT ${ok ? "pass" : "fail"} ${caught}/${verdicts.length} lies caught`);

    if (!ok) process.exitCode = 1;
  });

const main = (args: ReadonlyArray<string>) => {
  const [mode, ...rest] = args;

  if (mode === "suite") return suite(rest);

  if (mode === "falsify") return falsify(rest);

  return Console.error(
    "usage: bun conformance/runner/main.ts suite|falsify [--runtime DIR] [--only IDS] [--lie NAMES] [--parallel N]",
  ).pipe(
    Effect.andThen(
      Effect.sync(() => {
        process.exitCode = 2;
      }),
    ),
  );
};

// oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- the runner's process entry; @effect/platform-node's runMain is pinned to another Effect version and fails at run time
Effect.runFork(
  main(process.argv.slice(2)).pipe(
    Effect.catchCause((cause) =>
      Console.error(`runner failed: ${String(cause)}`).pipe(
        Effect.andThen(
          Effect.sync(() => {
            process.exitCode = 1;
          }),
        ),
      ),
    ),
  ),
);
