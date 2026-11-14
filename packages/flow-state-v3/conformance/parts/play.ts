import { Formatter, HashSet, Option, Result, Schema } from "effect";
import { parts } from "../../fixtures/index.ts";
import type { Part } from "../../fixtures/part.ts";
import { captureMsOf } from "../actors/lifetime.scenarios.ts";
import { nullPort } from "../adapters/null.ts";
import { productionPort } from "../adapters/production.ts";
import { openCase } from "../dsl/case.ts";
import { type Rules, rules } from "../dsl/lifecycle-rules.ts";
import { Fact } from "../dsl/oracle.ts";
import { type Script, scenarioOf } from "../dsl/script.ts";
import { Observation, type Turn } from "../port.ts";
import { verdictOf } from "../runner/run.ts";
import type { CaseVerdict } from "../runner/verdict.ts";
import { oracles } from "../suite.ts";
import { Answer, type Request } from "../world/network.ts";
import type { Code } from "./codes.ts";
import { type PartOwed, partsOwed } from "./owed.ts";
import { partFixture } from "./reference.ts";

/**
 * The runtimes a part's script may be asked to run on.
 */
export type PartRuntime = "production" | "null" | "round-14";

/**
 * One played part script: its verdict, the facts its run recorded, how many `answer` steps found
 * no open request, and the violations an owed row excused (`kept`), each with its subject.
 */
export type Played = {
  readonly verdict: CaseVerdict;
  readonly facts: ReadonlyArray<Fact>;
  readonly skipped: number;
  readonly kept: ReadonlyArray<{
    readonly oracle: string;
    readonly invariant: string;
    readonly subject: Option.Option<string>;
    readonly text: string;
  }>;
};

const fixtures = parts.map(partFixture);

/**
 * The world seed a part script runs at: the seed its id ends with (`PART-transfers-stress-7`,
 * shrunk or not), else 1 (Conformance R8).
 */
export const worldSeedOf = (id: string) => Number(/-(\d+)(?:-shrunk)?$/u.exec(id)?.[1] ?? "1");

/**
 * Plays a part's script on a runtime through the Port, under the suite's oracles and the Spec
 * model's compare (Conformance R15, R19); a part on round-14 is refused (R22).
 *
 * **Details**
 *
 * The world runs at the script's own seed ({@link worldSeedOf}), so one script seed fixes the
 * run (R8). `given` are the lifecycle tables the model applies: the design's, or a model mutant
 * (R19). A violation one of the script's `owed` rows names (its check, Invariant and subject)
 * does not stop the run: it is kept, the run is judged to its end, and the verdict fails by every
 * kept one beside whatever else failed, so a row holds only over the run's sole failures.
 */
// RETURN_TYPE: both branches build the named Played, the refusal with an empty fact list.
export const playPart = (
  script: Script,
  runtime: PartRuntime,
  given: Rules = rules,
  owed: ReadonlyArray<PartOwed> = partsOwed,
): Played => {
  if (runtime === "round-14")
    return {
      verdict: {
        _tag: "Fail",
        id: script.id,
        oracles: [],
        why: "refused: composite parts run on production only, never on round-14 (Conformance R22, I48)",
      },
      facts: [],
      skipped: 0,
      kept: [],
    };

  let skipped = 0;
  const seed = worldSeedOf(script.id);

  const scenario = scenarioOf(script, fixtures, () => {
    skipped += 1;
  });

  const opened = openCase({
    port: runtime === "production" ? productionPort : nullPort,
    fixtures: scenario.fixtures,
    oracles,
    seed,
    graphs: [],
    overdue: () => false,
    crashAt: Option.none(),
    replay: Option.none(),
    captureMs: captureMsOf(scenario.id),
    rules: given,
    judge: true,
    excuse: (oracle, invariant, subject) =>
      runtime === "production" &&
      owed.some(
        (o) =>
          o.case === script.id &&
          o.check === oracle &&
          o.invariant === invariant &&
          Option.exists(subject, (s) => o.subjects.includes(s)),
      ),
  });

  const ran = Result.try({
    try: () => {
      scenario.run(opened.driven);
      opened.end();
    },
    catch: (failure) => verdictOf(script.id, seed, failure),
  });

  const excused = opened.excused();
  const kept = excused.map((e) => e.text);
  const failed = Result.isFailure(ran) ? Option.some(ran.failure) : Option.none<CaseVerdict>();

  const verdict: CaseVerdict = Option.match(failed, {
    onNone: () =>
      excused.length === 0
        ? { _tag: "Pass", id: script.id }
        : {
            _tag: "Fail",
            id: script.id,
            oracles: [...new Set(excused.map((e) => e.oracle))],
            why: `seed ${seed}: ${kept.join(" | ")}`,
          },
    onSome: (failure) =>
      failure._tag !== "Fail" || excused.length === 0
        ? failure
        : {
            ...failure,
            oracles: [...new Set([...excused.map((e) => e.oracle), ...failure.oracles])],
            why: `seed ${seed}: ${[...kept, failure.why.replace(/^seed \d+: /u, "")].join(" | ")}`,
          },
  });

  return {
    verdict,
    facts: opened.facts(),
    skipped,
    kept: excused,
  };
};

/**
 * The faults of played part scripts on production (Conformance R15, R22): a run that does not
 * pass, unless it failed (not timed out) only by violations its owed rows kept and each row kept
 * one (by its check and Invariant on one of its subjects); a passing run whose answers mostly found
 * no open request (a script that tested little); an owed row naming no script in `scope` (the
 * gates pass every script the suite plays); and no run.
 */
export const partFaults = (
  runs: ReadonlyArray<{ readonly script: Script; readonly run: Played }>,
  owed: ReadonlyArray<PartOwed> = partsOwed,
  scope: ReadonlySet<string> = new Set(owed.map((o) => o.case)),
) => {
  const empty = runs.length === 0 ? ["BAD  no part script ran: the gate judged nothing"] : [];

  const ghosts = owed
    .filter((o) => !scope.has(o.case))
    .map((o) => `BAD  ${o.case}: owed to ${o.owner}, but no script the suite plays has this id`);

  return [...empty, ...ghosts, ...judged(runs, owed)];
};

const owes = (row: PartOwed, kept: Played["kept"][number]) =>
  kept.oracle === row.check &&
  kept.invariant === row.invariant &&
  Option.exists(kept.subject, (s) => row.subjects.includes(s));

const unowedFailures = (run: Played, rows: ReadonlyArray<PartOwed>) =>
  run.verdict._tag === "Fail"
    ? run.verdict.why
        .replace(/^seed \d+: /u, "")
        .split(" | ")
        .filter(
          (failure) => !run.kept.some((k) => k.text === failure && rows.some((r) => owes(r, k))),
        )
    : [];

const heldBy = (row: PartOwed, run: Played) => run.kept.some((k) => owes(row, k));

const judged = (
  runs: ReadonlyArray<{ readonly script: Script; readonly run: Played }>,
  owed: ReadonlyArray<PartOwed>,
) =>
  runs.flatMap(({ script, run }) => {
    const rows = owed.filter((o) => o.case === script.id);

    if (rows.length > 0 && run.verdict._tag === "Timeout")
      return [`BAD  ${script.id}: ${Formatter.format(run.verdict)}, which no owed row excuses`];

    if (rows.length > 0)
      return [
        ...rows.flatMap((row) =>
          heldBy(row, run)
            ? []
            : [
                `BAD  ${script.id}: owed to ${row.owner}, but no kept failure is ${row.check} ${row.invariant} on ${row.subjects.join(", ") || "no subject"}`,
              ],
        ),
        ...unowedFailures(run, rows).map(
          (failure) => `BAD  ${script.id}: fails by ${failure}, which no owed row names`,
        ),
      ];

    if (run.verdict._tag !== "Pass") return [`BAD  ${script.id}: ${Formatter.format(run.verdict)}`];

    const answers = script.steps.filter((s) => s._tag === "answer").length;

    return run.skipped * 2 > answers
      ? [`BAD  ${script.id}: ${run.skipped} of ${answers} answers found no open request`]
      : [];
  });

const isRecord = Schema.is(Schema.Record(Schema.String, Schema.Json));

const partOfMachine = (machine: string) =>
  Option.fromUndefinedOr(parts.find((p) => p.machine.compiled.id === machine));

const partOfOperation = (operation: string) =>
  Option.fromUndefinedOr(parts.find((p) => p.machine.compiled.operations.has(operation)));

const writeOf = (part: Part, operation: string) => {
  const o = part.machine.compiled.operations.get(operation);

  return o?._tag === "Write" ? Option.some(o) : Option.none();
};

type Reached = readonly [Option.Option<Part>, Code];

type Seen = {
  readonly keys: Map<string, HashSet.HashSet<Schema.Json>>;
  readonly sentKeys: Set<string>;
  readonly ensured: Map<string, Set<string>>;
  readonly ended: Set<string>;
  readonly now: Set<"landed" | "advanced">;
  readonly drove: Map<string, string>;
  readonly unlanded: Set<string>;
  readonly beforeReload: Set<string>;
};

const actorKey = (actor: { readonly machine: string; readonly id: string }) =>
  `${actor.machine} ${actor.id}`;

// RETURN_TYPE: every helper returns this one list type, so their branches join without widening.
const one = (part: Option.Option<Part>, code: Code): ReadonlyArray<Reached> => [[part, code]];

const grown = (map: Map<string, Set<string>>, key: string, value: string) => {
  const values = map.get(key) ?? new Set<string>();
  values.add(value);
  map.set(key, values);

  return values.size;
};

const writeCodes = (
  seen: Seen,
  request: Request,
  part: Option.Option<Part>,
  keyFields: ReadonlyArray<string>,
) => {
  const { operation, input, key } = request;
  const persisted = Option.exists(part, (p) => p.machine.compiled.persist);
  const values = keyFields.map((f) => (isRecord(input) ? (input[f] ?? null) : null));
  const keys = HashSet.add(seen.keys.get(operation) ?? HashSet.empty<Schema.Json>(), values);
  seen.keys.set(operation, keys);
  const distinct = HashSet.size(keys);
  const resent = Option.exists(key, (k) => seen.sentKeys.has(k));

  Option.map(key, (k) => seen.sentKeys.add(k));

  const codes: ReadonlyArray<readonly [boolean, Code]> = [
    [true, "rj"],
    [seen.now.has("landed") && persisted, "wa"],
    [keyFields.length > 0 && distinct >= 2, "ky"],
    [resent, "rt"],
  ];

  return codes.flatMap(([hit, code]) => (hit ? one(part, code) : []));
};

const requestCodes = (seen: Seen, request: Request) => {
  const part = partOfOperation(request.operation);

  return Option.match(
    Option.flatMap(part, (p) => writeOf(p, request.operation)),
    {
      onNone: () => one(part, "lk"),
      onSome: (write) => writeCodes(seen, request, part, write.keyFields),
    },
  );
};

const scheduledBy = (part: Part, event: string) =>
  [...part.machine.compiled.states.values()].some((n) => n.schedules.some((s) => s.send === event));

const turnCodes = (seen: Seen, turn: Turn) => {
  const part = partOfMachine(turn.actor.machine);
  const cancels = turn.members.some((m) => m.kind === "cancel");
  const due = seen.now.has("advanced") && Option.exists(part, (p) => scheduledBy(p, turn.event));

  return [...(cancels ? one(part, "cm") : []), ...(due ? one(part, "du") : [])];
};

const reportCodes = (seen: Seen, o: Observation) => {
  if (Observation.$is("Ended")(o)) Option.map(o.attempt, (a) => seen.ended.add(a));

  if (Observation.$is("Denied")(o)) {
    const machine = seen.drove.get(o.event);

    return machine === undefined ? [] : one(partOfMachine(machine), "gd");
  }

  if (Observation.$is("Turn")(o)) return turnCodes(seen, o);

  if (!Observation.$is("Incarnated")(o)) return [];

  const part = partOfMachine(o.actor.machine);

  const restored =
    seen.beforeReload.has(actorKey(o.actor)) &&
    Option.exists(part, (p) => p.machine.compiled.persist);

  return restored ? one(part, "rl") : [];
};

const lostWrite = (fact: Fact) =>
  Fact.$is("Answered")(fact) &&
  Answer.$is("Lost")(fact.answer) &&
  Option.isSome(
    Option.flatMap(partOfOperation(fact.request.operation), (p) =>
      writeOf(p, fact.request.operation),
    ),
  );

const lateAnswer = (seen: Seen, fact: Fact) =>
  Fact.$is("Answered")(fact) && Option.exists(fact.request.key, (k) => seen.ended.has(k));

const refusedCodes = (seen: Seen) => {
  const refused = parts
    .filter((p) => p.machine.compiled.persist && seen.unlanded.has(p.machine.compiled.id))
    .flatMap((p) => one(Option.some(p), "sr"));

  seen.unlanded.clear();

  return refused;
};

const actorCodes = (seen: Seen, fact: Fact) => {
  if (Fact.$is("Disposed")(fact) || Fact.$is("Forgot")(fact))
    return one(partOfMachine(fact.actor.machine), "dp");

  if (Fact.$is("Released")(fact)) return one(partOfMachine(fact.actor.machine), "gr");

  if (Fact.$is("Ensured")(fact))
    return grown(seen.ensured, fact.actor.machine, fact.actor.id) >= 2
      ? one(partOfMachine(fact.actor.machine), "ma")
      : [];

  return [];
};

const writerOf = (fact: Fact) => {
  if (Fact.$is("Answered")(fact))
    return Option.map(partOfOperation(fact.request.operation), (p) => p.machine.compiled.id);

  return "actor" in fact ? Option.some(fact.actor.machine) : Option.none();
};

const clockOf = (seen: Seen, fact: Fact) => {
  if (Fact.$is("Stepped")(fact)) {
    seen.now.delete("landed");
    seen.now.delete("advanced");
    seen.drove.clear();
  }

  if (Fact.$is("Drove")(fact)) seen.drove.set(fact.event, fact.actor.machine);

  if (Fact.$is("Landed")(fact)) seen.unlanded.clear();

  if (Fact.$is("Reloaded")(fact)) {
    seen.unlanded.clear();

    for (const [machine, ids] of seen.ensured)
      for (const id of ids) seen.beforeReload.add(actorKey({ machine, id }));
  }

  if (!Fact.$is("Reported")(fact)) Option.map(writerOf(fact), (m) => seen.unlanded.add(m));

  const marks = [
    [Fact.$is("Landed")(fact), "landed"],
    [Fact.$is("Advanced")(fact), "advanced"],
  ] as const;

  for (const [hit, mark] of marks) if (hit) seen.now.add(mark);
};

const factCodes = (seen: Seen, fact: Fact) => {
  clockOf(seen, fact);

  if (Fact.$is("Requested")(fact)) return requestCodes(seen, fact.request);

  if (Fact.$is("Reported")(fact)) return reportCodes(seen, fact.observation);

  if (lateAnswer(seen, fact) && Fact.$is("Answered")(fact))
    return one(partOfOperation(fact.request.operation), "lr");

  if (lostWrite(fact) && Fact.$is("Answered")(fact))
    return one(partOfOperation(fact.request.operation), "un");

  if (Fact.$is("Dropped")(fact)) return refusedCodes(seen);

  return actorCodes(seen, fact);
};

/**
 * The feature codes a played run reached, from its suite facts and the reports its oracles
 * accepted, by composite (Conformance R17): never from a part's declared codes or its steps.
 *
 * **Details**
 *
 * - `rj` and `ky`: a write's request reached the server; two of one operation with different
 *   keys. `rt`: a request resent under an earlier Attempt's idempotency key. `un`: a write's
 *   answer lost. `lk`: a read's request. `cm`: a turn ran a `cancel` member.
 * - `gd`: a guard denied an event the step drove, credited to the driven actor's part. `du`: a
 *   turn ran on a scheduled event after the clock moved. `sr`: a refused batch, credited to each
 *   persisted part that wrote since the last landing.
 * - `wa`: a persisted write's request after its batch landed. `rl`: an actor known before a
 *   reload incarnated after it. `dp`: an actor disposed or forgotten. `gr`: a use released. `ma`: two actors of one
 *   machine.
 */
export const reachOf = (played: Played) => {
  const seen: Seen = {
    keys: new Map(),
    sentKeys: new Set(),
    ensured: new Map(),
    ended: new Set(),
    now: new Set(),
    drove: new Map(),
    unlanded: new Set(),
    beforeReload: new Set(),
  };

  const reached = new Map<string, Set<Code>>();

  for (const fact of played.facts)
    for (const [part, code] of factCodes(seen, fact))
      Option.map(part, (p) => {
        const codes = reached.get(p.composite) ?? new Set<Code>();
        codes.add(code);
        reached.set(p.composite, codes);
      });

  return Object.fromEntries(reached);
};

/**
 * Every code the passing runs reached, over all composites: the reach the matrix gate counts. A
 * failing run reached nothing a gate may credit.
 */
export const reachedBy = (runs: ReadonlyArray<{ readonly run: Played }>) =>
  new Set(
    runs.flatMap(({ run }) =>
      run.verdict._tag === "Pass" ? Object.values(reachOf(run)).flatMap((s) => [...s]) : [],
    ),
  );
