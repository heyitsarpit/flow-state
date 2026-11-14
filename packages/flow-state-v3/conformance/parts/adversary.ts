import { Formatter, Option, Predicate } from "effect";
import { captureMsOf } from "../actors/lifetime.scenarios.ts";
import { productionPort } from "../adapters/production.ts";
import { openCase } from "../dsl/case.ts";
import type { AttemptLife, Ending, Model } from "../dsl/lifecycle-model.ts";
import { type Rules, rules } from "../dsl/lifecycle-rules.ts";
import { Fact, type RuntimeFact } from "../dsl/oracle.ts";
import { runtimeStepsOf } from "../dsl/play.ts";
import { type Script, scenarioOf } from "../dsl/script.ts";
import { referenceFor } from "../fixtures/fixture.ts";
import { registered } from "../fixtures/registry.ts";
import { FLOW_DECLINES, mappedEvent, type Reference } from "../fixtures/reference.ts";
import { DisposeExit, Observation } from "../port.ts";
import type { Judged } from "../dsl/engine.ts";
import type { CaseVerdict } from "../runner/verdict.ts";
import { oracles } from "../suite.ts";
import { type CellAt, cellName, cellsOf, recording, valueAt } from "./cells.ts";
import { playPart, worldSeedOf } from "./play.ts";

/**
 * The lifecycle rows a runtime's own report makes, so one forged report reaches their cells:
 * Table A's endings, evidence and disposal answer, and Table C's delivery, issue, park and record
 * moves. Sends come from the server log, the instants (`StepEnds`, `Reload`) from the suite, and
 * Table B's idle cancels from moves the suite drives. A forged delivery names the event its
 * ending maps to, so it is never refused as a misdelivery; an ending with no mapped event is not
 * forged.
 */
export const FORGED_ROWS: ReadonlySet<string> = new Set([
  "tableA.EndDefinite",
  "tableA.EndNotSent",
  "tableA.EndUnknown",
  "tableA.Released",
  "tableA.Superseded",
  "tableA.RuntimeDisposed",
  "tableC.Delivered",
  "tableC.InvalidTurn",
  "tableC.Unmapped",
  "tableC.Parked",
  "tableC.Unparked",
  "tableC.RecordedLetGo",
  "tableC.RecordedOther",
]);

/**
 * Every refusal cell of the tables: a cell whose value refuses its move, loudly or quietly.
 */
export const refusalCells = (given: Rules = rules) =>
  cellsOf(given).filter((cell) => {
    const value = valueAt(given, cell);

    return value?._tag === "Refuse" || value?._tag === "Quiet";
  });

const invariantOf = (given: Rules, cell: CellAt) => {
  const value = valueAt(given, cell);

  return value?._tag === "Refuse" || value?._tag === "Quiet" ? value.invariant : "";
};

// RETURN_TYPE: a runtime fact the liar replay takes, not the narrower Reported variant.
const reported = (observation: Observation): RuntimeFact => Fact.Reported({ observation });

const ended = (a: AttemptLife, channel: "success" | "failure" | "unknown", reason: string) =>
  reported(
    Observation.Ended({
      operation: a.lane.operation,
      attempt: Option.some(a.id),
      channel,
      reason,
      actor: Option.some(a.lane.actor),
      failure: Option.none(),
    }),
  );

const ATTEMPT_ROWS = {
  EndDefinite: (a) => ended(a, "success", "success"),
  EndNotSent: (a) => ended(a, "failure", FLOW_DECLINES[0] ?? "Rejected"),
  EndUnknown: (a) => ended(a, "unknown", "Lost"),
  Released: (a) =>
    reported(
      Observation.Evidence({
        kind: "Released",
        operation: a.lane.operation,
        attempt: Option.some(a.id),
      }),
    ),
  Superseded: (a) =>
    reported(
      Observation.Evidence({
        kind: "Superseded",
        operation: a.lane.operation,
        attempt: Option.some(a.id),
      }),
    ),
  RuntimeDisposed: () => Fact.Disposal({ exit: DisposeExit.Done() }),
} satisfies Readonly<Record<string, (a: AttemptLife) => RuntimeFact>>;

const ref = (e: Ending) => ({ operation: e.operation, attempt: e.attempt, actor: e.actor });

const mappedEventOf = (e: Ending, reference: Reference) =>
  Option.flatMap(Option.fromUndefinedOr(reference[e.actor.machine]?.[e.operation]), (o) =>
    mappedEvent(o, e.channel, e.reason),
  );

const ENDING_ROWS = {
  Delivered: (e, reference) =>
    reported(
      Observation.Delivered({
        operation: e.operation,
        attempt: e.attempt,
        event: Option.getOrElse(mappedEventOf(e, reference), () => ""),
        actor: Option.some(e.actor),
      }),
    ),
  InvalidTurn: (e) =>
    reported(Observation.Issue({ code: "InvalidTurn", ending: Option.some(ref(e)) })),
  Unmapped: (e) =>
    reported(Observation.Issue({ code: "UnmappedEnding", ending: Option.some(ref(e)) })),
  Parked: (e) => reported(Observation.Parked({ operation: e.operation, attempt: e.attempt })),
  Unparked: (e) => reported(Observation.Unparked({ operation: e.operation, attempt: e.attempt })),
  RecordedLetGo: (e) =>
    reported(Observation.Recorded({ operation: e.operation, attempt: e.attempt, why: "letGo" })),
  RecordedOther: (e) =>
    reported(Observation.Recorded({ operation: e.operation, attempt: e.attempt, why: "ignored" })),
} satisfies Readonly<Record<string, (e: Ending, reference: Reference) => RuntimeFact>>;

const forAttempts = new Map(Object.entries(ATTEMPT_ROWS));

const forEndings = new Map(Object.entries(ENDING_ROWS));

/**
 * One step as an adversary sees it: its runtime facts, the models it started and ended from, and
 * the reference of the script's fixtures.
 */
export type Seen = {
  readonly facts: ReadonlyArray<RuntimeFact>;
  readonly before: Model;
  readonly after: Model;
  readonly reference: Reference;
};

/**
 * What an adversary forges for one row in one step: each report it adds and where, as an index
 * into the step's runtime facts.
 */
export type Forge = (
  table: CellAt["table"],
  row: string,
  step: Seen,
  columns: ReadonlySet<string>,
) => ReadonlyArray<{ readonly at: number; readonly fact: RuntimeFact }>;

const attemptOf = (observation: Observation) => {
  if (!("attempt" in observation)) return undefined;

  const { attempt } = observation;

  return Option.isOption(attempt) ? Option.getOrUndefined(attempt) : attempt;
};

const mentions = (facts: ReadonlyArray<RuntimeFact>) =>
  facts.flatMap((fact, at) => {
    const id = Fact.$is("Reported")(fact) ? attemptOf(fact.observation) : undefined;

    return id === undefined ? [] : [{ at: at + 1, id }];
  });

/**
 * The adversary's forge: the row's report for a subject right after each report that names it,
 * where it is likeliest in a phase or life a step passes through, and at the step's end for each
 * subject the step started with.
 */
export const forgeAll: Forge = (table, row, step, columns) => {
  const known = [...step.before.attempts, ...step.after.attempts];
  const lives = [...step.before.endings, ...step.after.endings];

  const inColumn = [
    ...step.before.attempts.filter((a) => table === "tableA" && columns.has(a.phase._tag)),
    ...step.before.endings.flatMap((e) =>
      table === "tableC" && columns.has(e.life._tag) ? Option.toArray(e.attempt) : [],
    ),
  ].map((a) => ({ at: step.facts.length, id: Predicate.isString(a) ? a : a.id }));

  const places = [...inColumn, ...mentions(step.facts)];
  const forAttempt = forAttempts.get(row);
  const forEnding = forEndings.get(row);

  const made = places.flatMap(({ at, id }) => {
    if (table === "tableA" && forAttempt !== undefined)
      return known
        .filter((a) => a.id === id)
        .slice(0, 1)
        .map((a) => ({ at, fact: forAttempt(a) }));

    return table === "tableC" && forEnding !== undefined
      ? lives
          .filter((e) => Option.contains(e.attempt, id))
          .filter((e) => row !== "Delivered" || Option.isSome(mappedEventOf(e, step.reference)))
          .slice(0, 1)
          .map((e) => ({ at, fact: forEnding(e, step.reference) }))
      : [];
  });

  return [...new Map(made.map((m) => [`${m.at} ${Formatter.format(m.fact)}`, m])).values()];
};

/**
 * One reached refusal cell: the script, the step and the forged report that reach it, the
 * runtime steps replayed with it, what the Spec model's design gives (`design`), the cells it
 * read, and the cell's Invariant.
 */
export type Forgery = {
  readonly cell: string;
  readonly invariant: string;
  readonly script: Script;
  readonly step: number;
  readonly replay: ReadonlyArray<ReadonlyArray<RuntimeFact>>;
  readonly design: CaseVerdict;
  readonly reads: ReadonlyArray<string>;
};

const recorded = (script: Script) => {
  const scenario = scenarioOf(script, registered, () => undefined);

  const opened = openCase({
    port: productionPort,
    fixtures: scenario.fixtures,
    oracles,
    seed: worldSeedOf(script.id),
    graphs: [],
    overdue: () => false,
    crashAt: Option.none(),
    replay: Option.none(),
    captureMs: captureMsOf(scenario.id),
    rules,
    judge: true,
    excuse: () => false,
  });

  scenario.run(opened.driven);
  opened.end();

  return {
    steps: runtimeStepsOf(opened.facts()),
    before: opened.modelsBefore(),
    reference: referenceFor(scenario.fixtures),
  };
};

const MAX_TRIES = 40;

/**
 * The rows no report makes, reached by a dropped report instead (combined review N1): the step's
 * end, which judges what the step owed, and a boot. Dropping a delivery, an unpark or an ending
 * leaves the model's obligation or row open where a lying runtime would.
 */
export const DROPPED_ROWS: ReadonlySet<string> = new Set([
  "tableA.StepEnds",
  "tableC.StepEnds",
  "tableC.Reload",
]);

const DROPPABLE: ReadonlyArray<string> = ["Delivered", "Unparked", "Parked", "Ended", "Recorded"];

/**
 * The adversary's drops: a production run replayed with one report of a droppable kind taken out
 * of one step, the first steps first.
 */
const dropsOf = (run: ReturnType<typeof recorded>) =>
  run.steps
    .flatMap((facts, index) =>
      facts.flatMap((fact, at) =>
        Fact.$is("Reported")(fact) && DROPPABLE.includes(fact.observation._tag)
          ? [{ step: index + 1, replay: run.steps.with(index, facts.toSpliced(at, 1)) }]
          : [],
      ),
    )
    .slice(0, MAX_TRIES * 2);

/**
 * The adversarial actor (Conformance I61, T39): for each refusal cell of a row a report makes, a
 * production run of one of `scripts` replayed through the liar hook with one forged report added
 * to one step, chosen so the subject is in the cell's phase or life; the Spec model's design must
 * refuse it by reading that cell. Keyed by cell name; a cell no forgery reached is absent.
 *
 * **Details**
 *
 * - A script that fails on the design is left out: its red is production's or the suite's.
 * - One play may reach any guard of its row and column: the cell read is the one recorded.
 * - At most a few forgeries are tried per row and column and script, first steps first.
 */
export const forgeries = (scripts: ReadonlyArray<Script>, forge: Forge = forgeAll) => {
  const found = new Map<string, Forgery>();

  const targets = refusalCells(rules).filter(
    (c) => FORGED_ROWS.has(`${c.table}.${c.row}`) || DROPPED_ROWS.has(`${c.table}.${c.row}`),
  );

  const rows = Map.groupBy(targets, (c) => `${c.table}.${c.row}`);

  const passing = scripts.filter(
    (s) => playPart(s, "production", rules, []).verdict._tag === "Pass",
  );

  for (const script of passing) {
    const run = recorded(script);
    const control = playPart(script, "production", rules, [], Option.some(run.steps));

    if (control.verdict._tag === "Pass")
      for (const [row, cells] of rows)
        forgeRow(
          found,
          script,
          DROPPED_ROWS.has(row) ? dropsOf(run) : triesOf(run, cells, forge),
          cells,
        );
  }

  return found;
};

const forgeRow = (
  found: Map<string, Forgery>,
  script: Script,
  tries: ReadonlyArray<{
    readonly step: number;
    readonly replay: ReadonlyArray<ReadonlyArray<RuntimeFact>>;
  }>,
  cells: ReadonlyArray<CellAt>,
) => {
  for (const tried of tries) {
    if (cells.every((c) => found.has(cellName(c)))) return;

    for (const f of judgedForgery(script, tried, cells))
      if (!found.has(f.cell)) found.set(f.cell, f);
  }
};

const judgedForgery = (
  script: Script,
  tried: { readonly step: number; readonly replay: ReadonlyArray<ReadonlyArray<RuntimeFact>> },
  cells: ReadonlyArray<CellAt>,
) => {
  const reads: Array<string> = [];
  const given = recording(rules, reads);
  const played = playPart(script, "production", given, [], Option.some(tried.replay));
  const design = played.verdict;

  return cells
    .filter((c) =>
      reachedBy(cellName(c), invariantOf(rules, c), reads, played.violations, tried.step),
    )
    .map((cell) => {
      const forgery: Forgery = {
        cell: cellName(cell),
        invariant: invariantOf(rules, cell),
        script,
        step: tried.step,
        replay: tried.replay,
        design,
        reads,
      };

      return forgery;
    });
};

const reachedBy = (
  name: string,
  invariant: string,
  reads: ReadonlyArray<string>,
  found: ReadonlyArray<Judged>,
  step: number,
) => reads.includes(name) && found.some((v) => v.invariant === invariant && v.step === step);

const triesOf = (run: ReturnType<typeof recorded>, cells: ReadonlyArray<CellAt>, forge: Forge) => {
  const [first] = cells;

  if (first === undefined) return [];

  const perStep = run.steps.map((facts, index) => {
    const before = run.before.get(index + 1);
    const after = run.before.get(index + 2) ?? before;

    if (before === undefined || after === undefined) return [];

    const columns = new Set(cells.map((c) => c.column));

    const seen = { facts, before, after, reference: run.reference };

    return forge(first.table, first.row, seen, columns).map(({ at, fact }) => ({
      step: index + 1,
      replay: run.steps.with(index, facts.toSpliced(at, 0, fact)),
    }));
  });

  const depth = Math.max(0, ...perStep.map((tries) => tries.length));

  return Array.from({ length: depth }, (_, k) => perStep.flatMap((tries) => tries.slice(k, k + 1)))
    .flat()
    .slice(0, MAX_TRIES);
};
