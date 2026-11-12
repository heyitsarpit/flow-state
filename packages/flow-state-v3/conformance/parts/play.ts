import { Option, Result, Schema } from "effect";
import { parts } from "../../fixtures/index.ts";
import type { Part } from "../../fixtures/part.ts";
import type { Limit } from "../limits.ts";
import { captureMsOf } from "../actors/lifetime.scenarios.ts";
import { nullPort } from "../adapters/null.ts";
import { productionPort } from "../adapters/production.ts";
import { openCase } from "../dsl/case.ts";
import { Fact } from "../dsl/oracle.ts";
import { type Script, scenarioOf } from "../dsl/script.ts";
import { Observation, type Turn } from "../port.ts";
import { verdictOf } from "../runner/run.ts";
import type { CaseVerdict } from "../runner/verdict.ts";
import { oracles } from "../suite.ts";
import { Answer, type Request } from "../world/network.ts";
import type { Code } from "./codes.ts";
import { partFixture } from "./reference.ts";

/**
 * The runtimes a part's script may be asked to run on.
 */
export type PartRuntime = "production" | "null" | "round-14";

/**
 * One played part script: its verdict, the facts its run recorded, and how many `answer` steps
 * found no open request.
 */
export type Played = {
  readonly verdict: CaseVerdict;
  readonly facts: ReadonlyArray<Fact>;
  readonly skipped: number;
};

const fixtures = parts.map(partFixture);

/**
 * Production's owed reds among the part scripts (Conformance R22): a generated script it fails by
 * a production bug a Task owns, as `productionOwed` lists hand cases. Each is checked to still fail
 * by its check and Invariant, so a fix shows; every other script passes.
 */
export const partsOwed: ReadonlyArray<Limit & { readonly owner: string }> = [
  {
    case: "MIX-sync+transfers+sign-in-stress-109",
    check: "lane-queue",
    invariant: "WriteLanes I12",
    why: "a re-send's retryCount is never re-captured (`invoke` sets the lane, `persist` is not called), so a boot restores the count from before the re-send and a spent `retryable({ times: 1 })` passes again (WriteAhead R5, R7; WriteLanes I7)",
    owner: "@task.V3.T19",
  },
  {
    case: "MIX-sync+transfers+sign-in-stress-2",
    check: "lane-queue",
    invariant: "WriteLanes I8",
    why: "a forgotten actor's unacknowledged Attempt whose batch the store then refuses is never ended (only StorageFailure evidence), so the adopting incarnation mints a second Attempt on its lane (WriteAhead R13, Actors R20, R21, WriteLanes I27)",
    owner: "@task.V3.T19",
  },
];

/**
 * Plays a part's script on a runtime through the Port, under the suite's oracles and the Spec
 * model's compare (Conformance R15, R19); a part on round-14 is refused (R22).
 *
 * **Details**
 *
 * One seed, in the suite's world; the gate's runs add the second seed and the replay (Turn I17).
 */
// RETURN_TYPE: both branches build the named Played, the refusal with an empty fact list.
export const playPart = (script: Script, runtime: PartRuntime): Played => {
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
    };

  let skipped = 0;

  const scenario = scenarioOf(script, fixtures, () => {
    skipped += 1;
  });

  const opened = openCase({
    port: runtime === "production" ? productionPort : nullPort,
    fixtures: scenario.fixtures,
    oracles,
    seed: 1,
    graphs: [],
    overdue: () => false,
    crashAt: Option.none(),
    replay: Option.none(),
    captureMs: captureMsOf(scenario.id),
  });

  const ran = Result.try({
    try: () => {
      scenario.run(opened.driven);
      opened.end();
    },
    catch: (failure) => verdictOf(script.id, 1, failure),
  });

  const pass: CaseVerdict = { _tag: "Pass", id: script.id };

  return {
    verdict: Result.isSuccess(ran) ? pass : ran.failure,
    facts: opened.facts(),
    skipped,
  };
};

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
  readonly keys: Map<string, Set<string>>;
  readonly sentKeys: Set<string>;
  readonly ensured: Map<string, Set<string>>;
  readonly ended: Set<string>;
  readonly now: Set<"landed" | "reloaded" | "advanced">;
};

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
  const text = JSON.stringify(keyFields.map((f) => (isRecord(input) ? input[f] : null)));
  const distinct = grown(seen.keys, operation, text);
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

const handles = (part: Part, event: string) =>
  [...part.machine.compiled.states.values()].some((n) => n.on.has(event)) ||
  part.machine.compiled.root.has(event);

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

  if (Observation.$is("Denied")(o))
    return parts.filter((p) => handles(p, o.event)).flatMap((p) => one(Option.some(p), "gd"));

  if (Observation.$is("Turn")(o)) return turnCodes(seen, o);

  const part = Observation.$is("Incarnated")(o) ? partOfMachine(o.actor.machine) : Option.none();

  const restored =
    seen.now.has("reloaded") && Option.exists(part, (p) => p.machine.compiled.persist);

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

const refusedCodes = (seen: Seen) =>
  parts
    .filter((p) => p.machine.compiled.persist && seen.ensured.has(p.machine.compiled.id))
    .flatMap((p) => one(Option.some(p), "sr"));

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

const clockOf = (seen: Seen, fact: Fact) => {
  if (Fact.$is("Stepped")(fact)) {
    seen.now.delete("landed");
    seen.now.delete("advanced");
  }

  const marks = [
    [Fact.$is("Landed")(fact), "landed"],
    [Fact.$is("Reloaded")(fact), "reloaded"],
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
 * - `gd`: a guard denied an event. `du`: a turn ran on a scheduled event after the clock moved.
 * - `wa`: a persisted write's request after its batch landed. `rl`: an actor restored after a
 *   reload. `dp`: an actor disposed or forgotten. `gr`: a use released. `ma`: two actors of one
 *   machine.
 */
export const reachOf = (played: Played) => {
  const seen: Seen = {
    keys: new Map(),
    sentKeys: new Set(),
    ensured: new Map(),
    ended: new Set(),
    now: new Set(),
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
