/// <reference types="node" />
import { Console, Effect, Formatter, Option, Result, Schema } from "effect";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { captureMsOf } from "../actors/lifetime.scenarios.ts";
import { type Scenario, Crashed, openCase } from "../dsl/case.ts";
import type { Judged } from "../dsl/engine.ts";
import type { LifeStep } from "../dsl/expect.ts";
import { rules } from "../dsl/lifecycle-rules.ts";
import type { AttemptLife, Model } from "../dsl/lifecycle-model.ts";
import { Fact, isRuntimeFact, oracle } from "../dsl/oracle.ts";
import { type Script, scenarioOf } from "../dsl/script.ts";
import { Serialize } from "../fixtures/one-lane.ts";
import { Cells, Pay } from "../fixtures/pay.ts";
import { generatedScenarios, isPartScript, RegressionJson } from "../generated.ts";
import { type PartRuntime, playPart } from "../parts/play.ts";
import { scriptById } from "../parts/records.ts";
import type { Port } from "../port.ts";
import { oracles, scenarios } from "../suite.ts";
import type { Surface } from "../surface.ts";
import {
  flag,
  graphsFor,
  NULL_RUNTIME,
  PRODUCTION_RUNTIME,
  runtimeOf,
  runtimePort,
  runtimeSurface,
} from "./args.ts";
import { verdictOf } from "./run.ts";
import type { CaseVerdict } from "./verdict.ts";

const WIDTH = 400;

const clip = (text: string) => (text.length > WIDTH ? `${text.slice(0, WIDTH)}…` : text);

// FLOW_STATE_ALLOW_UNKNOWN: display only; Effect's formatter takes any value.
const shown = (value: unknown) => clip(Formatter.format(value));

/**
 * A judge that finds nothing and keeps each step's lifecycle: the Spec model's expected outcome
 * the trace prints beside what the runtime did.
 */
const recorder = (into: Map<number, LifeStep>) =>
  oracle<number>({
    name: "trace",
    guarantee: [],
    start: () => 0,
    step: (n, cut, _requests, lives) => {
      const [head] = cut;

      if (head !== undefined && Fact.$is("Stepped")(head)) into.set(head.step, lives);

      return [n + 1, []];
    },
  });

type Run = {
  readonly id: string;
  readonly runtime: string;
  readonly verdict: CaseVerdict;
  readonly facts: ReadonlyArray<Fact>;
  readonly violations: ReadonlyArray<Judged>;
  readonly lives: ReadonlyMap<number, LifeStep>;
};

const observed = (fact: Fact) =>
  isRuntimeFact(fact) || Fact.$is("Requested")(fact) || Fact.$is("Wrote")(fact);

const factLine = (fact: Fact) => {
  if (Fact.$is("Reported")(fact)) return shown(fact.observation);

  if (Fact.$is("Requested")(fact))
    return `request ${fact.request.operation} #${fact.request.seq} ${shown(fact.request.input)}`;

  if (Fact.$is("Answered")(fact))
    return `answer ${fact.request.operation} #${fact.request.seq} ${shown(fact.answer)}`;

  return shown(fact);
};

const phaseOf = (life: AttemptLife) =>
  `${life.id} ${life.lane.operation} ${life.phase._tag === "Gone" ? `Gone ${life.phase.why}` : life.phase._tag}`;

const attemptsMoved = (before: Model, after: Model) =>
  after.attempts.flatMap((life) => {
    const was = before.attempts.find((a) => a.id === life.id);
    const now = phaseOf(life);

    if (was === undefined) return [`${now} (new)`];

    return phaseOf(was) === now ? [] : [`${phaseOf(was)} -> ${now}`];
  });

const expectedLines = (life: LifeStep) => {
  const moves = life.applied.map(
    (a) =>
      `move ${shown(a.move)}${a.refusals.map((r) => `; refused ${r.invariant} on ${r.subject}: ${r.text}`).join("")}`,
  );

  const endings = life.after.endings
    .slice(life.before.endings.length)
    .map(
      (e) =>
        `ending ${Option.getOrElse(e.attempt, () => "-")} ${e.operation} ${e.channel} ${e.reason}`,
    );

  const owing = life.after.obligations.map((o) => `owes ${shown(o)}`);

  return [...moves, ...attemptsMoved(life.before, life.after), ...endings, ...owing];
};

const block = (label: string, lines: ReadonlyArray<string>) =>
  lines.length === 0
    ? [`  ${label}: none`]
    : [`  ${label}: ${lines[0]}`, ...lines.slice(1).map((l) => `    ${l}`)];

const cutsOf = (facts: ReadonlyArray<Fact>) =>
  facts.reduce<
    ReadonlyArray<{
      readonly step: number;
      readonly what: string;
      readonly facts: ReadonlyArray<Fact>;
    }>
  >((cuts, fact) => {
    if (Fact.$is("Stepped")(fact))
      return [...cuts, { step: fact.step, what: fact.what, facts: [] }];
    const last = cuts.at(-1);

    return last === undefined
      ? cuts
      : [...cuts.slice(0, -1), { ...last, facts: [...last.facts, fact] }];
  }, []);

const verdictText = (verdict: CaseVerdict) => {
  if (verdict._tag === "Pass") return "pass";

  if (verdict._tag === "Timeout")
    return `fail: past its ${verdict.seconds} s bound at seed ${verdict.seed}`;

  return `fail${verdict.oracles.length === 0 ? "" : ` by ${verdict.oracles.join(", ")}`}: ${verdict.why}`;
};

/**
 * A played run as readable text: per step, its input (what the suite drove and the world
 * answered), the Spec model's expected outcome (the moves it applied, the Attempts it moved, the
 * endings and obligations it holds), the runtime's observed outcome (reports, requests, writes),
 * and each mismatch an oracle found there with its rule; the verdict last.
 */
const rendered = (run: Run) => {
  const steps = cutsOf(run.facts).flatMap((cut) => {
    const life = run.lives.get(cut.step);

    const found = run.violations
      .filter((v) => v.step === cut.step)
      .map(
        (v) =>
          `  MISMATCH ${v.oracle} ${v.invariant}: ${clip(v.text)}${v.excused ? " (excused by an owed row)" : ""}`,
      );

    return [
      "",
      `## step ${cut.step}: ${cut.what}`,
      ...block("input", cut.facts.filter((f) => !observed(f)).map(factLine)),
      ...(life === undefined
        ? ["  expected: not judged (the run stopped before the model reached it)"]
        : block("expected", expectedLines(life))),
      ...block("observed", cut.facts.filter(observed).map(factLine)),
      ...found,
    ];
  });

  return [
    `# trace ${run.id} on ${run.runtime}`,
    ...steps,
    "",
    `verdict: ${verdictText(run.verdict)}`,
    "",
  ].join("\n");
};

/**
 * Traces a part script on a runtime through the part player, with its owed rows (Conformance R22).
 */
export const tracedPart = (script: Script, runtime: PartRuntime) => {
  const lives = new Map<number, LifeStep>();

  const run = playPart(script, runtime, rules, undefined, Option.none(), [
    ...oracles,
    recorder(lives),
  ]);

  return rendered({
    id: script.id,
    runtime,
    verdict: run.verdict,
    facts: run.facts,
    violations: run.violations,
    lives,
  });
};

/**
 * Traces a hand case or a hand fixture's script on a port at one seed, killed and reloaded after
 * step `crashAt` when given (the crash generator's cut), with no owed row.
 */
export const tracedScenario = (
  port: Port,
  surface: Surface,
  scenario: Scenario,
  seed: number,
  crashAt: Option.Option<number>,
  runtime: string,
) => {
  const lives = new Map<number, LifeStep>();

  const opened = openCase({
    port,
    fixtures: scenario.fixtures,
    oracles: [...oracles, recorder(lives)],
    seed,
    graphs: graphsFor(surface, [scenario])(scenario),
    overdue: () => false,
    crashAt,
    replay: Option.none(),
    captureMs: captureMsOf(scenario.id),
    rules,
    judge: true,
    excuse: () => false,
  });

  const ran = Result.try({
    try: () => {
      // FLOW_STATE_ALLOW_UNKNOWN: a case throws its verdicts; only the crash generator's stop is caught here.
      const played = Result.try({
        try: () => scenario.run(opened.driven),
        catch: (e: unknown) => e,
      });

      if (Result.isFailure(played) && !(played.failure instanceof Crashed)) throw played.failure;
      opened.stopCrashing();
      opened.end();
    },
    catch: (failure) => verdictOf(scenario.id, seed, failure),
  });

  const id = Option.match(crashAt, {
    onNone: () => scenario.id,
    onSome: (at) => `${scenario.id}@${at} (crash after step ${at})`,
  });

  return rendered({
    id,
    runtime,
    verdict: Result.isFailure(ran) ? ran.failure : { _tag: "Pass", id: scenario.id },
    facts: opened.facts(),
    violations: opened.violations(),
    lives,
  });
};

const scriptFrom = (spec: string) =>
  spec.endsWith(".json")
    ? Option.some(Schema.decodeUnknownSync(RegressionJson)(readFileSync(resolve(spec), "utf8")))
    : scriptById(spec);

const partId = (args: ReadonlyArray<string>) =>
  Option.all([flag(args, "--part"), flag(args, "--profile"), flag(args, "--seed")]).pipe(
    Option.map(([part, profile, seed]) => `PART-${part}-${profile}-${seed}`),
  );

// RETURN_TYPE: the part player's runtime union, not the three literals.
const partRuntimeOf = (runtime: string): PartRuntime => {
  if (runtime === PRODUCTION_RUNTIME) return "production";

  return runtime === NULL_RUNTIME ? "null" : "round-14";
};

const handCase = (id: string) =>
  Option.fromUndefinedOr([...scenarios, ...generatedScenarios].find((s) => s.id === id));

/**
 * The trace mode (T61): `--script ID|FILE.json`, `--part NAME --profile P --seed N`, or `--case ID
 * [--crash N] [--seed N]`, on `--runtime` (production by default), written to
 * `<--scratch>/trace-<id>.txt`, each `/` of a variant case's id written `~`.
 */
export const trace = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const runtime = runtimeOf(args);
    const scratch = Option.getOrElse(flag(args, "--scratch"), () => "");
    const spec = Option.orElse(flag(args, "--script"), () => partId(args));
    const asCase = flag(args, "--case");

    if (scratch === "" || (Option.isNone(spec) && Option.isNone(asCase))) {
      process.exitCode = 2;

      return yield* Console.error(
        "usage: trace (--script ID|FILE.json | --part NAME --profile P --seed N | --case ID [--crash N] [--seed N]) --scratch DIR [--runtime production|null|DIR]",
      );
    }

    const port = yield* runtimePort(runtime);
    const surface = yield* runtimeSurface(runtime);
    const script = Option.flatMap(spec, scriptFrom);

    const traced = Option.match(script, {
      onSome: (s) =>
        isPartScript(s.id)
          ? Option.some({ id: s.id, text: tracedPart(s, partRuntimeOf(runtime)) })
          : Option.some({
              id: s.id,
              text: tracedScenario(
                port,
                surface,
                scenarioOf(s, [Pay, Cells, Serialize]),
                1,
                Option.none(),
                runtime,
              ),
            }),
      onNone: () =>
        Option.map(Option.flatMap(asCase, handCase), (s) => {
          const crashAt = Option.map(flag(args, "--crash"), Number);

          return {
            id: Option.match(crashAt, { onNone: () => s.id, onSome: (at) => `${s.id}@${at}` }),
            text: tracedScenario(
              port,
              surface,
              s,
              Number(Option.getOrElse(flag(args, "--seed"), () => "1")),
              crashAt,
              runtime,
            ),
          };
        }),
    });

    if (Option.isNone(traced)) {
      process.exitCode = 2;

      return yield* Console.error("trace: no such script or case");
    }

    const path = resolve(scratch, `trace-${traced.value.id.replaceAll("/", "~")}.txt`);

    yield* Effect.sync(() => {
      mkdirSync(resolve(scratch), { recursive: true });
      writeFileSync(path, traced.value.text);
    });

    yield* Console.log(`wrote ${path}`);
    yield* Console.log(
      traced.value.text.split("\n").findLast((l) => l.startsWith("verdict:")) ?? "verdict: none",
    );
  });
