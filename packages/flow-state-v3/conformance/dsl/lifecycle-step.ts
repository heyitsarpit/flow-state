import { Option } from "effect";
import type { Request } from "../world/network.ts";
import { reported } from "./compare.ts";
import {
  acknowledged,
  ended,
  isWrite,
  type LifeStep,
  onSuiteFact,
  pushed,
  type Walk,
} from "./expect.ts";
import { type Model, Move } from "./lifecycle-model.ts";
import type { Known, Predicted } from "./lifecycle-owed.ts";
import { type Rules, rules } from "./lifecycle-rules.ts";
import { Fact, isRuntimeFact } from "./oracle.ts";

const onFact = (
  walk: Walk,
  fact: Fact,
  known: Known,
  earlier: ReadonlyArray<Request>,
  given: Rules,
) => {
  if (!isRuntimeFact(fact)) return onSuiteFact(walk, fact, known, given);

  if (Fact.$is("Reported")(fact)) {
    const second = fact.observation._tag === "Turn" && walk.seen === 1;
    const counted = { ...walk, seen: walk.seen + (fact.observation._tag === "Turn" ? 1 : 0) };
    const marked = second ? { ...counted, least: Option.some(walk.model) } : counted;

    return reported(marked, known, fact.observation, earlier, given);
  }

  if (Fact.$is("Acknowledges")(fact)) return acknowledged(walk, fact.attempts);

  return Fact.$is("Disposal")(fact) ? pushed(walk, Move.RuntimeDisposed(), given) : walk;
};

/**
 * Turns one step's facts into lifecycle moves, in order, and applies each by the tables: the
 * suite's own facts through the expect half (`dsl/expect.ts`), each report through the compare
 * half (`dsl/compare.ts`), which matches it to a move the expect half allows.
 *
 * **When to use**
 *
 * The Case runs it once per step, before the oracles; each lifecycle oracle reads the refusals of
 * its own Invariants from `applied`, and its own views from `before` and `after`.
 *
 * **Details**
 *
 * - `turns` are selection's predictions of the step's turns, in order (`turn/selection.ts`):
 *   each reported turn opens with the members its prediction owes.
 * - Sends are the step's server log: a write request the step's reports did not match is still a
 *   send, applied at the step's end.
 * - At the step's end: the turn closes, a reload's boot settles, every Attempt and ending sees
 *   `StepEnds`, and the obligations due by then are refused on that move.
 * - The uses the suite holds (`held`) follow its `Ensured`, `Released`, `Disposed` and `Forgot`
 *   facts, and a reload drops them until the boot re-attaches them: an actor with a held use is
 *   live by the suite's own facts, whatever the runtime reports.
 * - Two runtime answers are applied as stated limits: a batch's purpose (with its `Wrote`) and
 *   the Attempts a landing acknowledges. The disposal's exit ends the disposal; its value
 *   (`CleanupFailed`) is not read yet.
 */
export const step = (
  model: Model,
  known: Known,
  facts: ReadonlyArray<Fact>,
  requests: ReadonlyArray<Request>,
  given: Rules = rules,
  turns: ReadonlyArray<Predicted> = [],
  leaves: ReadonlyMap<string, string> = new Map(),
) => {
  const fresh = facts.flatMap((f) => (Fact.$is("Requested")(f) ? [f.request.seq] : []));
  const earlier = requests.filter((r) => !fresh.includes(r.seq));

  const unsent = facts.flatMap((f) =>
    Fact.$is("Requested")(f) && isWrite(known, f.request.operation)
      ? Option.toArray(f.request.key)
      : [],
  );

  const start: Walk = {
    model,
    applied: [],
    reloaded: false,
    used: [],
    incarnated: [],
    incarnationsHeard: [],
    ends: [],
    endsHeard: [],
    leaves,
    writes: 0,
    stirred: false,
    planned: turns.length,
    unsent,
    purposes: facts.flatMap((f) => (Fact.$is("Purposed")(f) ? [f.purpose] : [])),
    turns,
    requests,
    answers: facts.flatMap((f) =>
      Fact.$is("Answered")(f) ? [{ request: f.request, answer: f.answer }] : [],
    ),
    unmatched: [],
    seen: 0,
    least: Option.none(),
  };

  const walk = facts.reduce((w, fact) => onFact(w, fact, known, earlier, given), start);

  const sent = walk.unsent.reduce<Walk>((w, attempt) => pushed(w, Move.Send({ attempt }), given), {
    ...walk,
    unsent: [],
  });

  const walked = ended(sent, given);

  const result: LifeStep = { before: model, after: walked.model, applied: walked.applied };

  return result;
};
