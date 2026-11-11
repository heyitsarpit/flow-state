import { Option, Result } from "effect";
import { answerLabels, handlersFor, referenceFor, rowsFor } from "../fixtures/fixture.ts";
import { Unreadable } from "../port.ts";
import { anchorOf, judgedStep } from "../turn/selection.ts";
import { RequestPhase } from "../world/network.ts";
import type { World } from "../world/world.ts";
import { type CaseOptions, Crashed } from "./case.ts";
import { empty } from "./lifecycle-model.ts";
import { step as lifeStep } from "./lifecycle-step.ts";
import { Fact, type RuntimeFact, steps, Violated } from "./oracle.ts";
import { decodeReports } from "./reports.ts";

/**
 * A case's step engine: each step records itself, runs, settles the world, notes what the world
 * saw, replays a reference run's runtime facts under the liar gate, and judges.
 *
 * **Details**
 *
 * - `judge` folds the turn anchor and the lifecycle once over each new step, then runs every
 *   oracle with that fold; any violation throws `Violated`, naming every oracle that found one.
 * - The world's notes (requests, an answer given at once, batches written) follow the step's
 *   reports, as they were seen at the settle.
 * - Under the crash generator, the step it names ends with a kill and reload, and `Crashed`.
 */
export const stepEngine = (
  options: CaseOptions,
  world: World,
  facts: ReadonlyArray<Fact>,
  record: (fact: Fact) => void,
  pending: () => boolean,
  unread: () => Option.Option<Unreadable>,
  replaceReports: (from: number, noted: number, replayed: ReadonlyArray<RuntimeFact>) => void,
) => {
  const { network, storage } = world.hosts;
  const reference = referenceFor(options.fixtures);
  const machines = handlersFor(options.fixtures);
  const known = { reference, rows: rowsFor(options.fixtures) };
  let anchor = anchorOf(machines);

  const judges = options.oracles.map((o) => ({
    name: o.name,
    next: o.open(reference, options.graphs, machines),
  }));

  let stepped = 0;
  let crashing = true;
  let noted = 0;
  let wrote = 0;
  let judged = 0;
  let model = empty;

  const noteWorld = () => {
    for (const request of network.requests().slice(noted)) {
      record(Fact.Requested({ request }));

      if (RequestPhase.$is("Answered")(request.phase))
        record(
          Fact.Answered({
            request,
            answer: request.phase.answer,
            labels: answerLabels(options.fixtures, request.operation, request.phase.answer),
          }),
        );
    }

    for (const purpose of storage.written().slice(wrote)) {
      record(Fact.Wrote());
      record(Fact.Purposed({ purpose }));
    }

    noted = network.requests().length;
    wrote = storage.written().length;
  };

  const stopIfUnread = (what: string) =>
    Option.match(unread(), {
      onNone: () => undefined,
      onSome: (failure) => {
        throw new Unreadable({ report: failure.report, issue: `${failure.issue} (at ${what})` });
      },
    });

  const judge = (what: string) => {
    stopIfUnread(what);
    decodeReports(reference, facts.slice(judged));
    const fresh = steps(facts.slice(judged));
    const requests = network.requests();
    judged = facts.length;

    const cuts = fresh.map((cut) => {
      const judgedCut = judgedStep(anchor, cut);
      anchor = judgedCut.state;
      const life = lifeStep(model, known, judgedCut.facts, requests);
      model = life.after;

      return { cut, life };
    });

    const found = judges.flatMap(({ name, next }) =>
      cuts.flatMap(({ cut, life }) => next(cut, requests, life)).map((v) => ({ name, v })),
    );

    if (found.length > 0)
      throw new Violated({
        oracles: [...new Set(found.map((f) => f.name))],
        violation: found.map((f) => `${f.name}: ${f.v.invariant}: ${f.v.text}`).join(" | "),
        step: what,
      });
  };

  const act = (what: string, run: () => void, crash: () => void = () => undefined) => {
    stepped += 1;
    record(Fact.Stepped({ step: stepped, what }));
    const from = facts.length;
    run();
    // FLOW_STATE_ALLOW_UNKNOWN: settling throws a world failure (Unsettled, Overdue); it is rethrown unread.
    const settled = Result.try({ try: () => world.settle(pending), catch: (e: unknown) => e });
    stopIfUnread(what);

    if (Result.isFailure(settled)) throw settled.failure;

    const notedAt = facts.length;
    noteWorld();
    // The liar gate (advisor Q1): the runtime under test acts, and a correct runtime's reports
    // and answers for this step replace its own; what the world noted at the settle stays last.
    Option.match(options.replay, {
      onNone: () => undefined,
      onSome: (replays) => replaceReports(from, notedAt, replays[stepped - 1] ?? []),
    });
    judge(what);

    if (crashing && Option.contains(options.crashAt, stepped)) {
      crash();
      throw new Crashed({ after: stepped });
    }
  };

  return { act, judge, stopCrashing: () => void (crashing = false) };
};
