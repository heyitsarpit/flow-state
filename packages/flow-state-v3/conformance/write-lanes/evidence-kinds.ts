import { Option, Schema } from "effect";
import { Move, Phase } from "../dsl/lifecycle-model.ts";
import type { LifeStep } from "../dsl/lifecycle-step.ts";
import { Fact, oracle, violation } from "../dsl/oracle.ts";
import { EvidenceKind, Observation } from "../port.ts";

type Ending = { readonly operation: string; readonly attempt: Option.Option<string> };

const same = (a: Ending, b: Ending) =>
  a.operation === b.operation && Option.getOrNull(a.attempt) === Option.getOrNull(b.attempt);

const isEvidence = Schema.is(EvidenceKind);

/**
 * Evidence kinds (WriteLanes I4): no ending whose reason is an evidence kind is delivered.
 *
 * **Details**
 *
 * - A `Delivered` of an Attempt after its `Superseded` or `Released`, which the Case's lifecycle
 *   accepted (it owed it from a turn's members and rows, or a cancel's history), breaks I4,
 *   whatever label the runtime gives the delivery. An unretained unknown is delivered, then
 *   released: the order matters.
 * - An `Ended` whose reason is an evidence kind, then a `Delivered` of it, breaks I4 too (report
 *   consistency).
 * - A reload forgets an evidence ending the lifecycle rolled back: no landing saved it, so the
 *   boot may restore the head it left (WriteAhead R10, I10).
 *
 * **Gotchas**
 *
 * - "No author tag equals a Flow reason" is a construction rule on the fixtures' failure tags,
 *   not judged here (Compile's).
 */
const evidenceEnded = (lives: LifeStep) =>
  lives.applied.flatMap(({ move, refusals }) =>
    Move.$is("Evidence")(move) && refusals.length === 0 ? [move.attempt] : [],
  );

const goneAtReload = (lives: LifeStep, id: string) =>
  lives.applied.some(
    ({ move, on }) =>
      Move.$is("Reload")(move) &&
      on.attempts.some((a) => a.id === id && Phase.$is("Gone")(a.phase)),
  );

const evidenceOnly = (earlier: ReadonlySet<string>, lives: LifeStep, step: ReadonlyArray<Fact>) => {
  const accepted = evidenceEnded(lives);

  return step.reduce<{
    readonly ended: ReadonlySet<string>;
    readonly found: ReadonlyArray<string>;
  }>(
    (acc, fact) => {
      if (Fact.$is("Reloaded")(fact))
        return { ...acc, ended: new Set([...acc.ended].filter((id) => goneAtReload(lives, id))) };

      if (!Fact.$is("Reported")(fact)) return acc;

      const o = fact.observation;

      if (Observation.$is("Evidence")(o) && Option.exists(o.attempt, (id) => accepted.includes(id)))
        return { ...acc, ended: new Set([...acc.ended, ...Option.toArray(o.attempt)]) };

      if (!Observation.$is("Delivered")(o) || !Option.exists(o.attempt, (id) => acc.ended.has(id)))
        return acc;

      return {
        ...acc,
        found: [
          ...acc.found,
          `WriteLanes I4: ${o.operation} ${Option.getOrElse(o.attempt, () => "")} ended as evidence (superseded or released) and was then delivered as ${o.event}`,
        ],
      };
    },
    { ended: earlier, found: [] },
  );
};

type State = { readonly held: ReadonlyArray<Ending>; readonly ended: ReadonlySet<string> };

export const evidenceKinds = oracle<State>({
  name: "evidence-kinds",
  guarantee: ["WriteLanes I4"],
  start: () => ({ held: [], ended: new Set() }),
  step: (state, step, _requests, lives) => {
    const walked = step.reduce<{
      readonly held: ReadonlyArray<Ending>;
      readonly found: ReadonlyArray<string>;
    }>(
      (acc, fact) => {
        if (Fact.$is("Reloaded")(fact)) return { held: [], found: acc.found };

        if (!Fact.$is("Reported")(fact)) return acc;

        const o = fact.observation;

        if (Observation.$is("Ended")(o) && isEvidence(o.reason))
          return {
            held: [...acc.held, { operation: o.operation, attempt: o.attempt }],
            found: acc.found,
          };

        if (Observation.$is("Delivered")(o) && acc.held.some((e) => same(e, o)))
          return {
            held: acc.held.filter((e) => !same(e, o)),
            found: [
              ...acc.found,
              `WriteLanes I4: ${o.operation} ${Option.getOrElse(o.attempt, () => "(decline)")} ended with an evidence kind and was delivered as ${o.event}`,
            ],
          };

        return acc;
      },
      { held: state.held, found: [] },
    );

    const judged = evidenceOnly(state.ended, lives, step);

    return [
      { held: walked.held, ended: judged.ended },
      [...new Set([...walked.found, ...judged.found])].map(violation),
    ];
  },
});
