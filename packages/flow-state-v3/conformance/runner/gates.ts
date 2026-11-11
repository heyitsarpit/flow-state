/// <reference types="node" />
import { Console, Effect, Option } from "effect";
import { writeFileSync } from "node:fs";
import { productionFixtures } from "../adapters/production.ts";
import { scenarios } from "../suite.ts";
import { runChild } from "./child.ts";

/**
 * The cases the production runtime boots: every fixture of each is in the production adapter.
 */
export const productionCases = scenarios
  .filter((s) => s.fixtures.every((f) => productionFixtures.has(f.name)))
  .map((s) => s.id);

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

/**
 * The gate file (advisor Q6): runs every machine gate in a child process at the current revision
 * and writes their verdict lines to `gates.json`, which notes and reports cite instead of
 * hand-copied numbers. The crash generator runs on its own (`crash`): it is not a gate yet.
 */
export const writeGates = (main: string, path: string, scratch: string) =>
  Effect.gen(function* () {
    const revision = yield* runChild("git", ["rev-parse", "--short", "HEAD"], 30).pipe(
      Effect.map((out) => out.stdout.trim()),
      Effect.catchTag("ChildFailed", () => Effect.succeed("unknown")),
    );

    const only = productionCases.join(",");

    const gates = [
      { gate: "suite round-14", args: ["suite", "--parallel", "6"] },
      {
        gate: "suite production",
        args: ["suite", "--runtime", "production", "--only", only, "--parallel", "6"],
      },
      { gate: "falsify round-14", args: ["falsify", "--parallel", "8", "--scratch", scratch] },
      {
        gate: "falsify production",
        args: ["falsify", "--runtime", "production", "--parallel", "6", "--scratch", scratch],
      },
      { gate: "coverage", args: ["coverage"] },
    ];

    const results = yield* Effect.forEach(
      gates,
      ({ gate, args }) =>
        runChild("bun", [main, ...args], 280).pipe(
          Effect.map((out) => ({ gate, verdict: verdictLine(out.stdout) })),
          Effect.catchTag("ChildFailed", (e) =>
            Effect.succeed({ gate, verdict: `failed: ${e.why}` }),
          ),
        ),
      { concurrency: 1 },
    );

    writeFileSync(path, `${JSON.stringify({ revision, gates: results }, null, 2)}\n`);

    for (const r of results) yield* Console.log(`${r.gate}: ${r.verdict}`);
  });
