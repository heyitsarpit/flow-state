/// <reference types="node" />
import { Console, Effect, Option, Schema } from "effect";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { productionFixtures } from "../adapters/production.ts";
import type { Limit } from "../limits.ts";
import { scenarios } from "../suite.ts";
import { ROUND_14 } from "./args.ts";
import { runChild } from "./child.ts";

/**
 * Production's owed reds: a case it fails by a production bug a Task owns, left out of its gates
 * until that Task fixes it (the case still runs on round-14 and in `suite --only`). The `limits`
 * gate plays each on production and fails once it no longer fails by its check and Invariant, so
 * a fix shows.
 */
export const productionOwed: ReadonlyArray<Limit & { readonly owner: string }> = [];

/**
 * The cases the production runtime boots: every fixture of each is in the production adapter,
 * less its owed reds.
 */
export const productionCases = scenarios
  .filter((s) => s.fixtures.every((f) => productionFixtures.has(f.name)))
  .map((s) => s.id)
  .filter((id) => !productionOwed.some((o) => o.case === id));

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

    const only = productionCases.join(",");

    const gates = [
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

    const picked = Option.match(chosen, {
      onNone: () => gates,
      onSome: (name) => gates.filter((g) => g.gate === name),
    });

    const fresh = yield* Effect.forEach(
      picked,
      ({ gate, args }) =>
        runChild("bun", [main, ...args], 280).pipe(
          Effect.map((out) => ({ gate, revision, verdict: verdictLine(out.stdout) })),
          Effect.catchTag("ChildFailed", (e) =>
            Effect.succeed({ gate, revision, verdict: `failed: ${e.why}` }),
          ),
        ),
      { concurrency: 1 },
    );

    const before =
      Option.isSome(chosen) && existsSync(path)
        ? Schema.decodeUnknownSync(GatesFile)(JSON.parse(readFileSync(path, "utf8")))
        : { gates: [] };

    const kept = before.gates.map((k) => ({
      gate: k.gate,
      revision: k.revision ?? before.revision ?? "unknown",
      verdict: k.verdict,
    }));

    const results = gates.flatMap(
      (g) => fresh.find((f) => f.gate === g.gate) ?? kept.find((k) => k.gate === g.gate) ?? [],
    );

    writeFileSync(path, `${JSON.stringify({ gates: results }, null, 2)}\n`);

    for (const r of results) yield* Console.log(`${r.gate} (${r.revision}): ${r.verdict}`);
  });
