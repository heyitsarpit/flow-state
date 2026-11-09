/// <reference types="node" />
import { Console, Data, Effect, Option, Schema } from "effect";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { nullPort } from "../adapters/null.ts";
import { loadPrototype } from "../adapters/prototype.ts";
import { guarantees, oracles, scenarios } from "../suite.ts";
import { falsifyOne, LieVerdict, suiteIn } from "./falsify.ts";
import { runCases } from "./run.ts";
import { type CaseVerdict, VERDICTS_LINE, VerdictsJson } from "./verdict.ts";

const MAIN = fileURLToPath(import.meta.url);
const NULL_RUNTIME = "null";
const DEFAULT_RUNTIME = resolve(dirname(MAIN), "..", "..", "prototypes", "round-14");

type RuntimeChoice = Data.TaggedEnum<{ Null: {}; Prototype: { readonly dir: string } }>;

const RuntimeChoice = Data.taggedEnum<RuntimeChoice>();

const flag = (args: ReadonlyArray<string>, name: string) => {
  const at = args.indexOf(name);

  return at < 0 ? Option.none<string>() : Option.fromUndefinedOr(args[at + 1]);
};

const runtimeChoice = (args: ReadonlyArray<string>) => {
  const given = Option.getOrElse(flag(args, "--runtime"), () => DEFAULT_RUNTIME);

  return given === NULL_RUNTIME
    ? RuntimeChoice.Null()
    : RuntimeChoice.Prototype({ dir: resolve(given) });
};

const runtimeArg = RuntimeChoice.$match({ Null: () => NULL_RUNTIME, Prototype: ({ dir }) => dir });

const portOf = RuntimeChoice.$match({
  Null: () => Effect.succeed(nullPort),
  Prototype: ({ dir }) => loadPrototype(dir),
});

const list = (value: Option.Option<string>) =>
  Option.match(value, {
    onNone: () => Option.none<ReadonlyArray<string>>(),
    onSome: (v) => Option.some(v.split(",").filter((x) => x !== "")),
  });

const parallelOf = (args: ReadonlyArray<string>) =>
  Math.min(8, Math.max(1, Number(Option.getOrElse(flag(args, "--parallel"), () => "1")) || 1));

const caughtBy = (oracles: ReadonlyArray<string>) =>
  oracles.length > 0 ? oracles.join(",") : "case";

const lineOf = (v: CaseVerdict) =>
  v._tag === "Pass" ? `pass ${v.id}` : `FAIL ${v.id}  ${caughtBy(v.oracles)}: ${v.why}`;

const failed = (id: string, why: string) =>
  ({ _tag: "Fail", id, oracles: [], why }) satisfies CaseVerdict;

const report = (verdicts: ReadonlyArray<CaseVerdict>, json: boolean) =>
  Effect.gen(function* () {
    const passed = verdicts.filter((v) => v._tag === "Pass").length;
    const ok = passed === verdicts.length && verdicts.length > 0;

    if (!ok) process.exitCode = 1;

    if (json) {
      yield* Console.log(`${VERDICTS_LINE}${Schema.encodeSync(VerdictsJson)(verdicts)}`);

      return;
    }

    for (const v of verdicts) yield* Console.log(lineOf(v));
    yield* Console.log(`VERDICT ${ok ? "pass" : "fail"} ${passed}/${verdicts.length}`);
  });

const sliceVerdicts = (runtime: RuntimeChoice, ids: ReadonlyArray<string>) =>
  suiteIn(MAIN, runtimeArg(runtime), ids, 240).pipe(
    Effect.map((verdicts) => [
      ...verdicts,
      ...ids.flatMap((id) =>
        verdicts.some((v) => v.id === id) ? [] : [failed(id, "its child stated no verdict for it")],
      ),
    ]),
    Effect.catchTag("NoVerdicts", (e) => Effect.succeed(ids.map((id) => failed(id, e.why)))),
  );

const suite = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const runtime = runtimeChoice(args);
    const only = list(flag(args, "--only"));

    const chosen = scenarios.filter((s) =>
      Option.match(only, { onNone: () => true, onSome: (ids) => ids.includes(s.id) }),
    );

    const missing = Option.getOrElse(only, () => []).flatMap((id) =>
      scenarios.some((s) => s.id === id) ? [] : [failed(id, "no such case")],
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

      return yield* report([...runs.flat(), ...missing], json);
    }

    const port = yield* portOf(runtime);

    return yield* report([...(yield* runCases(port, chosen, oracles)), ...missing], json);
  });

const falsify = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const runtime = resolve(Option.getOrElse(flag(args, "--runtime"), () => DEFAULT_RUNTIME));
    const scratch = resolve(Option.getOrElse(flag(args, "--scratch"), () => tmpdir()));
    const only = list(flag(args, "--lie"));
    const sweep = args.includes("--sweep");

    const runnable = guarantees.map((g) => ({
      oracle: g.oracle.name,
      lies: g.lies.filter((l) => l.runtime === "prototype"),
    }));

    const unfalsified = runnable.filter((g) => g.lies.length === 0).map((g) => g.oracle);

    yield* Console.log(
      `${unfalsified.length === 0 ? "ok  " : "BAD "} every oracle has a lie${unfalsified.length === 0 ? "" : `; none for: ${unfalsified.join(" ")}`}`,
    );

    const chosen = runnable.flatMap((g) =>
      g.lies
        .filter((l) =>
          Option.match(only, { onNone: () => true, onSome: (names) => names.includes(l.name) }),
        )
        .map((lie) => ({
          oracle: g.oracle,
          lie: sweep ? { ...lie, cases: scenarios.map((s) => s.id) } : lie,
        })),
    );

    const stated = (run: string, ids: ReadonlyArray<string>) =>
      suiteIn(MAIN, run, ids, 120).pipe(
        Effect.map(Option.some),
        Effect.catchTag("NoVerdicts", () =>
          Effect.succeed(Option.none<ReadonlyArray<CaseVerdict>>()),
        ),
      );

    const onNull = yield* stated(
      NULL_RUNTIME,
      scenarios.map((s) => s.id),
    );

    const nullRed = Option.match(onNull, {
      onNone: () => false,
      onSome: (v) => v.length === scenarios.length && v.every((x) => x._tag === "Fail"),
    });

    yield* Console.log(`${nullRed ? "ok  " : "BAD "} null runtime: every case states a failure`);

    const control = yield* stated(runtime, [...new Set(chosen.flatMap(({ lie }) => lie.cases))]);

    const controlGreen = Option.match(control, {
      onNone: () => false,
      onSome: (v) => v.length > 0 && v.every((x) => x._tag === "Pass"),
    });

    yield* Console.log(
      `${controlGreen ? "ok  " : "BAD "} control: the lies' cases pass on the unedited runtime`,
    );

    const verdicts = yield* Effect.forEach(
      chosen,
      ({ oracle, lie }) => falsifyOne(MAIN, runtime, scratch, oracle, lie),
      { concurrency: parallelOf(args) },
    );

    for (const v of verdicts)
      yield* Console.log(
        LieVerdict.$match(v, {
          Caught: ({ lie, why, red, caughtIn }) =>
            `ok   ${lie}  caught: ${why}${sweep ? `\n     red ${red.length}: ${red.join(" ")}\n     by its oracle ${caughtIn.length}: ${caughtIn.join(" ")}` : ""}`,
          WrongReason: ({ lie, why, red }) =>
            `BAD  ${lie}  red by another check: ${why}${sweep ? `\n     red ${red.length}: ${red.join(" ")}` : ""}`,
          Survived: ({ lie }) => `BAD  ${lie}  survived`,
          NotApplied: ({ lie, why }) => `BAD  ${lie}  does not apply: ${why}`,
          NoVerdict: ({ lie, why }) => `BAD  ${lie}  no verdict: ${why}`,
        }),
      );
    const caught = verdicts.filter(LieVerdict.$is("Caught")).length;

    const ok =
      unfalsified.length === 0 &&
      nullRed &&
      controlGreen &&
      caught === verdicts.length &&
      verdicts.length > 0;

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
