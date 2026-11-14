/// <reference types="node" />
import { Console, Effect, Formatter, Option, Result } from "effect";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { captureMsOf } from "../actors/lifetime.scenarios.ts";
import { Crashed, openCase, type Scenario } from "../dsl/case.ts";
import { rules } from "../dsl/lifecycle-rules.ts";
import type { Fact } from "../dsl/oracle.ts";
import type { Script } from "../dsl/script.ts";
import { playPart } from "../parts/play.ts";
import { heldOutScripts } from "../parts/records.ts";
import type { Port } from "../port.ts";
import { scenarios } from "../suite.ts";
import type { Surface } from "../surface.ts";
import {
  flag,
  graphsFor,
  PACKAGE,
  PRODUCTION_RUNTIME,
  runtimePort,
  runtimeSurface,
} from "./args.ts";
import { productionCases } from "./gates.ts";
import { partsGateScripts } from "./parts-gates.ts";
import { CASE_SECONDS } from "./run.ts";

/**
 * Where the differential baseline lives: one line per run, `id`, its digest and its step count.
 */
export const BASELINE = resolve(PACKAGE, "conformance", "baseline.tsv");

/**
 * A run whose timeline may differ from the baseline: a named entry citing the pending case whose
 * fix changes it (T54, C3 item 2). An entry whose run no longer differs fails the compare.
 */
export type Allowed = { readonly run: string; readonly pending: string; readonly why: string };

/**
 * The named differences the steps since the baseline brought, each with its pending case.
 */
export const allowed: ReadonlyArray<Allowed> = [];

const SEEDS = [1, 2];

// Minted ids are numbered by their first appearance in a run, so a change to how ids are minted
// (the Attempts' own counter, a wider seed) is not a difference; a change in which id a fact
// names still is.
const MINTED = /\b(att|call|ticket|timer|inc|kept)-[0-9a-zA-Z]+(?:-[0-9a-zA-Z]+)*/gu;

const normalized = (lines: ReadonlyArray<string>) => {
  const seen = new Map<string, string>();

  return lines.map((line) =>
    line.replaceAll(MINTED, (id, kind: string) => {
      const known = seen.get(id);

      if (known !== undefined) return known;
      const named = `${kind}#${seen.size + 1}`;
      seen.set(id, named);

      return named;
    }),
  );
};

/**
 * A run's timeline as text: every fact in order, the suite's inputs, the world's answers, the
 * runtime's reports, requests (its commands) and store writes, with minted ids renumbered.
 */
export const timelineOf = (facts: ReadonlyArray<Fact>) =>
  normalized(facts.map((fact) => Formatter.format(fact)));

const caseFacts = (port: Port, surface: Surface, scenario: Scenario, seed: number) => {
  const end = Date.now() + CASE_SECONDS * 1000;

  const opened = openCase({
    port,
    fixtures: scenario.fixtures,
    oracles: [],
    seed,
    graphs: graphsFor(surface, [scenario])(scenario),
    overdue: () => Date.now() > end,
    crashAt: Option.none(),
    replay: Option.none(),
    captureMs: captureMsOf(scenario.id),
    rules,
    judge: false,
    excuse: () => false,
  });

  // FLOW_STATE_ALLOW_UNKNOWN: a case throws its verdicts; the timeline up to the throw is the run.
  const played = Result.try({ try: () => scenario.run(opened.driven), catch: (e: unknown) => e });
  const failed = Result.isFailure(played) && !(played.failure instanceof Crashed);

  if (failed) return [...timelineOf(opened.facts()), "stopped by a failed check"];
  opened.end();

  return timelineOf(opened.facts());
};

const partFacts = (script: Script) =>
  playPart(script, "production", rules, undefined, Option.none(), []).facts;

type Run = { readonly id: string; readonly lines: ReadonlyArray<string> };

const digestOf = (lines: ReadonlyArray<string>) =>
  createHash("sha256").update(lines.join("\n")).digest("hex");

const rowOf = (run: Run) => `${run.id}\t${digestOf(run.lines)}\t${run.lines.length}`;

const runs = (port: Port, surface: Surface) => {
  const cases = scenarios
    .filter((s) => productionCases.includes(s.id))
    .flatMap((s) =>
      SEEDS.map((seed) => ({ id: `${s.id}@${seed}`, lines: caseFacts(port, surface, s, seed) })),
    );

  const scripts = new Map(
    [...partsGateScripts(), ...heldOutScripts()].map((s) => [s.id, s] as const),
  );

  const parts = [...scripts.values()].map((s) => ({ id: s.id, lines: timelineOf(partFacts(s)) }));

  return [...cases, ...parts];
};

const recorded = () =>
  new Map(
    readFileSync(BASELINE, "utf8")
      .split("\n")
      .filter((l) => l !== "")
      .map((l) => {
        const [id = "", digest = ""] = l.split("\t");

        return [id, digest] as const;
      }),
  );

/**
 * The differential baseline (T54, X-1): `baseline --record` writes one digest per run of every
 * production case at seeds 1 and 2 and every gate and held-out part script on production;
 * `baseline` replays them and fails on a run that differs with no {@link allowed} entry, on an
 * entry whose run no longer differs, and on a run added or lost. `--dump DIR` writes each run's
 * timeline to `DIR/<id>.txt` to read a difference.
 */
export const baseline = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const port = yield* runtimePort(PRODUCTION_RUNTIME);
    const surface = yield* runtimeSurface(PRODUCTION_RUNTIME);
    const now = runs(port, surface);
    const dump = flag(args, "--dump");

    if (Option.isSome(dump)) {
      mkdirSync(dump.value, { recursive: true });

      for (const run of now)
        writeFileSync(
          resolve(dump.value, `${run.id.replaceAll("/", "~")}.txt`),
          `${run.lines.join("\n")}\n`,
        );
    }

    if (args.includes("--record")) {
      writeFileSync(BASELINE, `${now.map(rowOf).join("\n")}\n`);

      return yield* Console.log(`VERDICT pass ${now.length} runs recorded in ${BASELINE}`);
    }

    if (!existsSync(BASELINE)) {
      process.exitCode = 1;

      return yield* Console.log(`VERDICT fail no baseline at ${BASELINE}`);
    }

    const was = recorded();
    const ids = new Set(now.map((r) => r.id));

    const bad = [
      ...now.flatMap((run) => {
        const digest = was.get(run.id);

        if (digest === undefined) return [`BAD  ${run.id}: not in the baseline`];
        const differs = digest !== digestOf(run.lines);
        const entry = allowed.find((a) => a.run === run.id);

        if (differs && entry === undefined) return [`BAD  ${run.id}: differs, with no named entry`];

        return !differs && entry !== undefined
          ? [`BAD  ${run.id}: its entry (${entry.pending}) is stale, the run is equal`]
          : [];
      }),
      ...[...was.keys()].filter((id) => !ids.has(id)).map((id) => `BAD  ${id}: lost`),
    ];

    for (const line of bad) yield* Console.log(line);

    for (const entry of allowed)
      yield* Console.log(`ok   ${entry.run}: allowed by ${entry.pending} (${entry.why})`);

    if (bad.length > 0) process.exitCode = 1;

    return yield* Console.log(
      `VERDICT ${bad.length === 0 ? "pass" : "fail"} ${now.length - bad.length}/${now.length} runs equal to the baseline or named`,
    );
  });
