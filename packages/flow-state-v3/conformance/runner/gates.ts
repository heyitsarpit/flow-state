/// <reference types="node" />
import { Console, Effect, Option, Schema } from "effect";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { productionFixtures } from "../adapters/production.ts";
import type { Limit } from "../limits.ts";
import { scenarios } from "../suite.ts";
import { PACKAGE, ROUND_14 } from "./args.ts";
import { runChild } from "./child.ts";

/**
 * Production's owed reds: a case it fails by a production bug a Task owns, left out of its gates
 * until that Task fixes it (the case still runs on round-14 and in `suite --only`). The `limits`
 * gate plays each on production and fails once it no longer fails by its check and Invariant, so
 * a fix shows.
 */
export const productionOwed: ReadonlyArray<Limit & { readonly owner: string }> = [
  {
    case: "TURN-01/schedule-out-of-range",
    check: "case",
    invariant: "Turn I14",
    why: "a computed delay past 2^31 - 1 ms is armed, where a host timer fires it at once; the turn should be refused as out of range (Turn T6)",
    owner: "@task.V3.T17",
  },
  {
    case: "PAY-05/held-head-sleeps-at-boot",
    check: "case",
    invariant: "WriteAhead I24",
    why: "a StillUnknown hold leaves the saved lane record's inFlight true (`lane-moves.ts` Hold), so the next boot wakes an identity whose head is Held (WriteAhead T18, Restore I1)",
    owner: "@task.V3.T54",
  },
];

/**
 * The cases the production runtime boots: every fixture of each is in the production adapter,
 * less its owed reds.
 */
export const productionCases = scenarios
  .filter((s) => s.fixtures.every((f) => productionFixtures.has(f.name)))
  .map((s) => s.id)
  .filter((id) => !productionOwed.some((o) => o.case === id));

const BENCH = resolve(PACKAGE, "bench", "gate.ts");

const verdictLine = (stdout: string) =>
  Option.getOrElse(
    Option.fromUndefinedOr(
      stdout
        .split("\n")
        .findLast(
          (l) =>
            l.startsWith("VERDICT") ||
            l.startsWith("ok   coverage") ||
            l.startsWith("BAD  coverage"),
        ),
    ),
    () => "no verdict",
  );

const GatesFile = Schema.Struct({
  revision: Schema.optionalKey(Schema.String),
  gates: Schema.Array(
    Schema.Struct({
      gate: Schema.String,
      revision: Schema.optionalKey(Schema.String),
      verdict: Schema.String,
    }),
  ),
});

const GatesJson = Schema.fromJsonString(GatesFile, { space: 2 });

/**
 * Every machine gate the gate file records, in run order: its name, the runner's arguments, and
 * the entry when it is not the runner.
 */
export const machineGates = (scratch: string) => {
  const only = productionCases.join(",");

  return [
    { gate: "suite round-14", args: ["suite", "--runtime", ROUND_14, "--parallel", "6"] },
    {
      gate: "suite production",
      args: ["suite", "--runtime", "production", "--only", only, "--parallel", "6"],
    },
    {
      gate: "falsify round-14",
      args: ["falsify", "--runtime", ROUND_14, "--parallel", "6", "--scratch", scratch],
    },
    {
      gate: "falsify production",
      args: ["falsify", "--runtime", "production", "--parallel", "6", "--scratch", scratch],
    },
    { gate: "coverage", args: ["coverage"] },
    { gate: "parts production", args: ["parts"] },
    { gate: "held-out production", args: ["held-out"] },
    { gate: "matrix", args: ["matrix-gate"] },
    { gate: "pairs production", args: ["pairs"] },
    { gate: "model mutation production", args: ["model-mutation"] },
    { gate: "bench production", args: ["bench"], entry: BENCH },
    { gate: "regressions production", args: ["regressions-production"] },
    { gate: "class gate production", args: ["class-gate"] },
    { gate: "regressions round-14", args: ["regressions", "--runtime", ROUND_14] },
    {
      gate: "liar round-14",
      args: ["liar", "--runtime", ROUND_14, "--parallel", "6", "--scratch", scratch],
    },
    { gate: "limits round-14", args: ["limits"] },
    {
      gate: "liar production",
      args: ["liar", "--runtime", "production", "--parallel", "6", "--scratch", scratch],
    },
    { gate: "crash production", args: ["crash", "--runtime", "production", "--only", only] },
    {
      gate: "core mutants",
      args: ["mutate", "--limit", "100", "--parallel", "6", "--scratch", scratch],
    },
  ];
};

/**
 * The gate file (advisor Q6): runs every machine gate in a child process at the current revision
 * and writes their verdict lines to `gates.json`, which notes and reports cite instead of
 * hand-copied numbers. `--gate NAME` runs one gate and keeps the others' last verdicts, so each
 * run stays under a command's time bound. Each verdict carries the revision it ran at, so a kept
 * one never reads as fresher than it is. A gate's verdict is recorded as it is, red included: the liar gate's
 * greens and the crash generator's red points are open work, not a stop.
 */
export const writeGates = (
  main: string,
  path: string,
  scratch: string,
  chosen: Option.Option<string> = Option.none(),
) =>
  Effect.gen(function* () {
    const revision = yield* runChild("git", ["rev-parse", "--short", "HEAD"], 30).pipe(
      Effect.map((out) => out.stdout.trim()),
      Effect.catchTag("ChildFailed", () => Effect.succeed("unknown")),
    );

    const gates = machineGates(scratch);

    const picked = Option.match(chosen, {
      onNone: () => gates,
      onSome: (name) => gates.filter((g) => g.gate === name),
    });

    const fresh = yield* Effect.forEach(
      picked,
      ({ gate, args, entry = main }) =>
        runChild("bun", [entry, ...args], 280).pipe(
          Effect.map((out) => ({ gate, revision, verdict: verdictLine(out.stdout) })),
          Effect.catchTag("ChildFailed", (e) =>
            Effect.succeed({ gate, revision, verdict: `failed: ${e.why}` }),
          ),
        ),
      { concurrency: 1 },
    );

    const before =
      Option.isSome(chosen) && existsSync(path)
        ? Schema.decodeUnknownSync(GatesJson)(readFileSync(path, "utf8"))
        : { gates: [] };

    const kept = before.gates.map((k) => ({
      gate: k.gate,
      revision: k.revision ?? before.revision ?? "unknown",
      verdict: k.verdict,
    }));

    const results = gates.flatMap(
      (g) => fresh.find((f) => f.gate === g.gate) ?? kept.find((k) => k.gate === g.gate) ?? [],
    );

    writeFileSync(path, `${Schema.encodeSync(GatesJson)({ gates: results })}\n`);

    for (const r of results) yield* Console.log(`${r.gate} (${r.revision}): ${r.verdict}`);
  });
