/// <reference types="node" />
import { Console, Effect, Formatter, Option, Predicate, Result } from "effect";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { captureMsOf } from "../actors/lifetime.scenarios.ts";
import { Crashed, openCase, type Scenario } from "../dsl/case.ts";
import { rules } from "../dsl/lifecycle-rules.ts";
import { Fact } from "../dsl/oracle.ts";
import type { Script } from "../dsl/script.ts";
import { playPart } from "../parts/play.ts";
import { heldOutScripts } from "../parts/records.ts";
import type { Observation, Port } from "../port.ts";
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
 * Where the differential baseline lives: one line per run with its id, the digest of its whole
 * timeline, the digest of its behaviour (the timeline less the store's facts and contents) and its
 * length.
 */
export const BASELINE = resolve(PACKAGE, "conformance", "baseline.tsv");

/**
 * A run whose timeline may differ from the baseline: a named entry citing the pending case whose
 * fix changes it (T54, C3 item 2). An entry whose run no longer differs fails the compare.
 */
export type Allowed = {
  readonly run: string;
  readonly pending: Pending;
  readonly why: string;
};

/**
 * The T54 requirements a baseline difference may cite: the pending cases and the rulings that
 * name them (A-8 for a row's single Ended at its birth, A-6 for an ending applied at settlement;
 * orchestrator, 2026-11-14). Anything else cannot be written.
 */
export const PENDING = [
  "A-1",
  "A-2",
  "A-3",
  "A-6",
  "A-7",
  "A-8",
  "A-10",
  "A-12",
  "O-1",
  "O-2",
] as const;

/**
 * One of {@link PENDING}.
 */
export type Pending = (typeof PENDING)[number];

/**
 * The named differences the steps since the baseline brought, each with its pending case.
 */
export const allowed: ReadonlyArray<Allowed> = [];

const SEEDS = [1, 2];

// The store's own facts: a record's bytes, its landing, the batch's purpose and the Attempts it
// acknowledges. Behaviour leaves them out, so a step that writes other bytes or batches (T54's
// A3) is compared on what a user and a reload see.
const STORAGE = new Set(["Wrote", "Landed", "Purposed", "Acknowledges"]);

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

type Played = {
  readonly id: string;
  readonly crash: boolean;
  readonly facts: ReadonlyArray<Fact>;
  readonly stored: ReadonlyMap<string, string>;
  readonly stopped: boolean;
};

const STOPPED = "stopped by a failed check";

/**
 * A run's whole timeline as text: every fact in order (the suite's inputs, the world's answers,
 * the runtime's reports, requests and store facts), then the store's contents at its end, with
 * minted ids renumbered.
 */
const stopLine = (run: Played) => (run.stopped ? [STOPPED] : []);

// A write's byte count follows the length of the ids it holds, so it is left out like the ids'
// numbers; the store's contents at the run's end still show what was written.
const factLine = (fact: Fact) => (Fact.$is("Wrote")(fact) ? "Wrote" : Formatter.format(fact));

const timelineOf = (run: Played) =>
  normalized([
    ...run.facts.map(factLine),
    ...[...run.stored].toSorted(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`),
    ...stopLine(run),
  ]);

const behaviourOf = (run: Played) =>
  normalized([
    ...run.facts.filter((f) => !STORAGE.has(f._tag)).map((fact) => Formatter.format(fact)),
    ...stopLine(run),
  ]);

const caseRun = (
  port: Port,
  surface: Surface,
  scenario: Scenario,
  seed: number,
  crashAt: Option.Option<number>,
) => {
  const end = Date.now() + CASE_SECONDS * 1000;

  const opened = openCase({
    port,
    fixtures: scenario.fixtures,
    oracles: [],
    seed,
    graphs: graphsFor(surface, [scenario])(scenario),
    overdue: () => Date.now() > end,
    crashAt,
    replay: Option.none(),
    captureMs: captureMsOf(scenario.id),
    rules,
    judge: false,
    excuse: () => false,
  });

  // FLOW_STATE_ALLOW_UNKNOWN: a case throws its verdicts; the timeline up to the throw is the run.
  const played = Result.try({ try: () => scenario.run(opened.driven), catch: (e: unknown) => e });
  const crashed = Result.isFailure(played) && played.failure instanceof Crashed;
  const stopped = Result.isFailure(played) && !crashed;
  opened.stopCrashing();

  if (!stopped) opened.end();

  const id = Option.match(crashAt, {
    onNone: () => `${scenario.id}@${seed}`,
    onSome: (at) => `${scenario.id}@crash-${at}`,
  });

  return {
    run: {
      id,
      crash: Option.isSome(crashAt),
      facts: opened.facts(),
      stored: opened.stored(),
      stopped,
    },
    crashed,
  };
};

// Every crash point of a case at seed 1, as the crash gate cuts them: after step i, until i passes
// the case's last step.
const crashRuns = (port: Port, surface: Surface, scenario: Scenario) => {
  const out: Array<Played> = [];

  for (let at = 1; at <= 400; at += 1) {
    const { run, crashed } = caseRun(port, surface, scenario, 1, Option.some(at));

    if (!crashed) break;
    out.push(run);
  }

  return out;
};

const partRun = (script: Script) => {
  const played = playPart(script, "production", rules, undefined, Option.none(), []);

  return {
    id: script.id,
    crash: false,
    facts: played.facts,
    stored: played.stored,
    stopped: false,
  } satisfies Played;
};

const allRuns = (port: Port, surface: Surface) => {
  const cases = scenarios.filter((s) => productionCases.includes(s.id));

  const seeded = cases.flatMap((s) =>
    SEEDS.map((seed) => caseRun(port, surface, s, seed, Option.none()).run),
  );

  const scripts = new Map(
    [...partsGateScripts(), ...heldOutScripts()].map((s) => [s.id, s] as const),
  );

  return [
    ...seeded,
    ...[...scripts.values()].map(partRun),
    ...cases.flatMap((s) => crashRuns(port, surface, s)),
  ];
};

const observed = (facts: ReadonlyArray<Fact>) =>
  facts.flatMap((f) => (Fact.$is("Reported")(f) ? [f.observation] : []));

const who = (actor: Option.Option<{ readonly machine: string; readonly id: string }>) =>
  Option.match(actor, { onNone: () => "?", onSome: (a) => `${a.machine}/${a.id}` });

/**
 * Conservation with declines (WriteLanes I27; T54 A-9), from a run's reports: per actor and
 * write, the commits its turns admitted equal the Attempts minted plus the declines, an ending
 * with no Attempt (no queue is built under reject). A write is an operation some turn commits.
 */
export const conservation = (facts: ReadonlyArray<Fact>) => {
  const reports = observed(facts);

  const admitted = reports.flatMap((o) =>
    o._tag === "Turn"
      ? o.members
          .filter((m) => m.kind === "commit")
          .map((m) => ({
            operation: m.operation,
            key: `${o.actor.machine}/${o.actor.id} ${m.operation}`,
          }))
      : [],
  );

  const writes = new Set(admitted.map((a) => a.operation));

  const minted = reports.flatMap((o) =>
    o._tag === "Minted" ? [`${who(o.actor)} ${o.operation}`] : [],
  );

  const declined = reports.flatMap((o) =>
    o._tag === "Ended" && Option.isNone(o.attempt) && writes.has(o.operation)
      ? [`${who(o.actor)} ${o.operation}`]
      : [],
  );

  const countOf = (keys: ReadonlyArray<string>, key: string) =>
    keys.filter((k) => k === key).length;

  const keys = new Set([...admitted.map((a) => a.key), ...minted, ...declined]);

  return [...keys].flatMap((key) => {
    const [a, m, d] = [admitted.map((x) => x.key), minted, declined].map((ks) => countOf(ks, key));

    return a === (m ?? 0) + (d ?? 0)
      ? []
      : [`WriteLanes I27: ${key}: ${a} commits admitted, ${m} Attempts minted and ${d} declines`];
  });
};

// What a report or row may never hold (WriteLanes I37): a record key, a minted id other than an
// Attempt's, a lane id (`<identity>|<operation>|<key>`), or a field naming a Delivery.
const INTERNAL =
  /^(?:(?:lane|actor|owed|parked|kept)\/|(?:call|ticket|timer|inc|kept|owed)-)|\|.*\|/u;

// RETURN_TYPE: the walk recurses, so its result type is stated once here.
const internalIn = (
  // FLOW_STATE_ALLOW_UNKNOWN: a report's or row's fields, walked as the JSON they are.
  value: unknown,
  path: string,
): ReadonlyArray<string> => {
  if (Predicate.isString(value)) return INTERNAL.test(value) ? [`${path} = ${value}`] : [];

  if (Array.isArray(value)) return value.flatMap((v, i) => internalIn(v, `${path}[${i}]`));

  if (Predicate.isObject(value))
    return Object.entries(value).flatMap(([k, v]) =>
      k === "delivery" ? [`${path}.delivery`] : internalIn(v, `${path}.${k}`),
    );

  return [];
};

/**
 * Nothing internal crosses (WriteLanes I37; T54 A-17): no report, snapshot or row read in a run
 * carries a row's id, a lane id, a ticket, a timer, a record key or a Delivery.
 */
export const internals = (facts: ReadonlyArray<Fact>) =>
  facts.flatMap((f) => {
    if (Fact.$is("Reported")(f))
      return internalIn(f.observation, f.observation._tag satisfies Observation["_tag"]);

    return Fact.$is("RowRead")(f) ? internalIn(f.row, "row") : [];
  });

const digestOf = (lines: ReadonlyArray<string>) =>
  createHash("sha256").update(lines.join("\n")).digest("hex");

type Row = {
  readonly id: string;
  readonly whole: string;
  readonly behaviour: string;
  readonly wholeLessEnded: string;
  readonly behaviourLessEnded: string;
  readonly ended: string;
};

const ENDED = '"_tag":"Ended"},"_tag":"Reported"}';

const lessEnded = (lines: ReadonlyArray<string>) => lines.filter((l) => !l.endsWith(ENDED));

// A run's Ended reports as a multiset, so where they fall in the run does not count.
const endedOf = (lines: ReadonlyArray<string>) => lines.filter((l) => l.endsWith(ENDED)).toSorted();

const rowOf = (run: Played) => {
  const whole = timelineOf(run);
  const behaviour = behaviourOf(run);

  return {
    id: run.id,
    whole: digestOf(whole),
    behaviour: digestOf(behaviour),
    wholeLessEnded: digestOf(lessEnded(whole)),
    behaviourLessEnded: digestOf(lessEnded(behaviour)),
    ended: digestOf(endedOf(whole)),
  } satisfies Row;
};

const FIELDS = ["whole", "behaviour", "wholeLessEnded", "behaviourLessEnded", "ended"] as const;

const recorded = () =>
  new Map(
    readFileSync(BASELINE, "utf8")
      .split("\n")
      .filter((l) => l !== "")
      .map((l) => {
        const [
          id = "",
          whole = "",
          behaviour = "",
          wholeLessEnded = "",
          behaviourLessEnded = "",
          ended = "",
        ] = l.split("\t");

        return [
          id,
          { id, whole, behaviour, wholeLessEnded, behaviourLessEnded, ended } satisfies Row,
        ] as const;
      }),
  );

/**
 * The ruled classes of difference a step may bring without a per-run entry, each checked by code
 * from the digests (orchestrator, 2026-11-14): A-8, a row's Ended reported once at its birth, may
 * move Ended reports within a run and change nothing else, the Ended reports included.
 */
export const ruled: ReadonlyArray<{ readonly pending: Pending; readonly why: string }> = [
  { pending: "A-8", why: "only Ended reports moved: a row's Ended at its birth (WriteLanes I34)" },
];

const dumped = (dir: string, runs: ReadonlyArray<Played>) => {
  mkdirSync(dir, { recursive: true });

  for (const run of runs)
    writeFileSync(
      resolve(dir, `${run.id.replaceAll("/", "~")}.txt`),
      `${timelineOf(run).join("\n")}\n`,
    );
};

// One run against its baseline row: equal, a ruled class, a named entry, or bad.
const compare = (before: Row, row: Row, onBehaviour: boolean) => {
  const differs = onBehaviour ? before.behaviour !== row.behaviour : before.whole !== row.whole;
  const entry = allowed.find((a) => a.run === row.id);

  if (!differs)
    return entry === undefined
      ? "equal"
      : `BAD  ${row.id}: its entry (${entry.pending}) is stale, the run is equal`;

  if (entry !== undefined) return "named";

  return onlyEndedMoved(before, row, onBehaviour)
    ? `ok   ${row.id}: A-8 (${ruled[0]?.why ?? ""})`
    : `BAD  ${row.id}: differs, with no named entry`;
};

const onlyEndedMoved = (before: Row, row: Row, onBehaviour: boolean) =>
  ruled.some((r) => r.pending === "A-8") &&
  before.ended === row.ended &&
  (onBehaviour
    ? before.behaviourLessEnded === row.behaviourLessEnded
    : before.wholeLessEnded === row.wholeLessEnded);

/**
 * The differential baseline (T54, X-1, A-14): `baseline --record` writes, per run, the digests of
 * its timeline and of its behaviour, over every production case at seeds 1 and 2, every gate and
 * held-out part script, and every crash point of each production case. `baseline` replays them
 * and fails on a run that differs with no {@link allowed} entry, on an entry whose run is equal,
 * and on a run added or lost; crash points, and every run under `--behaviour` (from T54's A3,
 * where bytes may differ), compare behaviour only. Every run is also scanned for conservation
 * with declines ({@link conservation}) and for internals ({@link internals}). `--dump DIR`
 * writes each timeline to `DIR/<id>.txt`.
 */
export const baseline = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const port = yield* runtimePort(PRODUCTION_RUNTIME);
    const surface = yield* runtimeSurface(PRODUCTION_RUNTIME);
    const runs = allRuns(port, surface);

    for (const dir of Option.toArray(flag(args, "--dump"))) dumped(dir, runs);

    const rows = runs.map((run) => ({ run, row: rowOf(run) }));

    const scanned = runs.flatMap((run) =>
      [...conservation(run.facts), ...internals(run.facts)].map((v) => `BAD  ${run.id}: ${v}`),
    );

    const out = Option.getOrElse(flag(args, "--out"), () => BASELINE);

    if (args.includes("--record")) {
      writeFileSync(
        out,
        `${rows.map(({ row }) => [row.id, ...FIELDS.map((f) => row[f])].join("\t")).join("\n")}\n`,
      );

      for (const line of scanned) yield* Console.log(line);

      if (scanned.length > 0) process.exitCode = 1;

      return yield* Console.log(
        `VERDICT ${scanned.length === 0 ? "pass" : "fail"} ${rows.length} runs recorded in ${out}`,
      );
    }

    if (!existsSync(BASELINE)) {
      process.exitCode = 1;

      return yield* Console.log(`VERDICT fail no baseline at ${BASELINE}`);
    }

    const was = recorded();
    const ids = new Set(rows.map(({ row }) => row.id));
    const behaviourOnly = args.includes("--behaviour");

    const judged = rows.map(({ run, row }) =>
      Option.match(Option.fromUndefinedOr(was.get(row.id)), {
        onNone: () => `BAD  ${row.id}: not in the baseline`,
        onSome: (before) => compare(before, row, behaviourOnly || run.crash),
      }),
    );

    const endedMoved = judged.filter((j) => j.startsWith("ok "));
    const compared = judged.filter((j) => j.startsWith("BAD"));

    const unknownRuns = allowed
      .filter((a) => !ids.has(a.run))
      .map((a) => `BAD  ${a.run}: an entry (${a.pending}) for a run that does not exist`);

    const bad = [
      ...compared,
      ...unknownRuns,
      ...[...was.keys()].filter((id) => !ids.has(id)).map((id) => `BAD  ${id}: lost`),
      ...scanned,
    ];

    for (const line of bad) yield* Console.log(line);

    for (const entry of allowed)
      yield* Console.log(`ok   ${entry.run}: allowed by ${entry.pending} (${entry.why})`);

    for (const line of endedMoved) yield* Console.log(line);

    if (bad.length > 0) process.exitCode = 1;

    return yield* Console.log(
      `VERDICT ${bad.length === 0 ? "pass" : "fail"} ${rows.length} runs, ${bad.length} bad (differences with no entry, stale entries, lost runs, conservation or internals)`,
    );
  });
