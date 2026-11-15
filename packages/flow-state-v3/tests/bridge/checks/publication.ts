import { Option } from "effect";
import { Fact } from "../harness/facts.ts";
import type { Fixture } from "../harness/fixture.ts";
import { type ActorRef, type Json, Observation, sameJson } from "../harness/reports.ts";

type Seen = { readonly memoryId: number; readonly content: Json };

type State = {
  readonly contents: ReadonlyMap<number, Json>;
  readonly last: ReadonlyMap<string, Seen>;
};

const keyOf = (actor: ActorRef) => `${actor.machine} ${actor.id}`;

const turnsOf = (step: ReadonlyArray<Fact>) =>
  step.flatMap((fact) =>
    Fact.$is("Reported")(fact) && Observation.$is("Turn")(fact.observation)
      ? [fact.observation]
      : [],
  );

const stepsOf = (facts: ReadonlyArray<Fact>) =>
  facts.reduce<ReadonlyArray<ReadonlyArray<Fact>>>((cut, fact) => {
    const open = cut.at(-1);

    return open === undefined || Fact.$is("Stepped")(fact)
      ? [...cut, [fact]]
      : [...cut.slice(0, -1), [...open, fact]];
  }, []);

const updatesAt = (fixtures: ReadonlyArray<Fixture>, machine: string, at: string) =>
  fixtures
    .filter((f) => f.machine === machine)
    .some((f) => {
      const compiled = f.part.machine.compiled;
      const levels = [compiled.root, ...[...compiled.states.values()].map((n) => n.on)];

      return levels.some((level) =>
        [...level.values()].some((list) =>
          list.some((a) => a.at === at && Option.isSome(a.update)),
        ),
      );
    });

const updatedIn = (fixtures: ReadonlyArray<Fixture>, step: ReadonlyArray<Fact>, actor: ActorRef) =>
  turnsOf(step).some(
    (turn) =>
      keyOf(turn.actor) === keyOf(actor) &&
      turn.parts.some((p) => updatesAt(fixtures, turn.actor.machine, p.at)),
  );

const judged = (state: State, actor: ActorRef, seen: Seen, updated: boolean) => {
  const name = keyOf(actor);
  const before = state.contents.get(seen.memoryId);
  const last = state.last.get(name);

  const mutated =
    before !== undefined && !sameJson(before, seen.content)
      ? [
          `Turn I29: ${name} published memory object #${seen.memoryId} again with other content: a published snapshot was mutated`,
        ]
      : [];

  const copied =
    !updated &&
    last !== undefined &&
    sameJson(last.content, seen.content) &&
    last.memoryId !== seen.memoryId
      ? [
          `Turn I30: ${name} published unchanged memory as a new object (#${last.memoryId} became #${seen.memoryId})`,
        ]
      : [];

  return [...mutated, ...copied];
};

const onFact = (
  fixtures: ReadonlyArray<Fixture>,
  step: ReadonlyArray<Fact>,
  state: State,
  fact: Fact,
) => {
  if (Fact.$is("Reloaded")(fact)) return { state: { contents: new Map(), last: new Map() } };

  if (!Fact.$is("Reported")(fact)) return { state };
  const o = fact.observation;

  if (Observation.$is("Incarnated")(o) || Observation.$is("Finished")(o)) {
    const gone = keyOf(o.actor);

    return { state: { ...state, last: new Map([...state.last].filter(([k]) => k !== gone)) } };
  }

  if (!Observation.$is("Published")(o)) return { state };

  // A copy, so a later write into the published object shows as other content.
  const seen = { memoryId: o.memoryId, content: structuredClone(o.memory) };

  return {
    state: {
      contents: new Map([...state.contents, [seen.memoryId, seen.content]]),
      last: new Map([...state.last, [keyOf(o.actor), seen]]),
    },
    found: judged(state, o.actor, seen, updatedIn(fixtures, step, o.actor)),
  };
};

const unpublished = (step: ReadonlyArray<Fact>) => {
  const turns = turnsOf(step);
  const actors = [...new Set(turns.map((t) => keyOf(t.actor)))];

  return actors.flatMap((name) => {
    const own = turns.filter((t) => keyOf(t.actor) === name);
    const first = own[0];
    const last = own.at(-1);

    const published = step.some(
      (fact) =>
        Fact.$is("Reported")(fact) &&
        Observation.$is("Published")(fact.observation) &&
        keyOf(fact.observation.actor) === name,
    );

    return first === undefined || last === undefined || first.from === last.to || published
      ? []
      : [
          `Turn I9: ${name} moved from ${first.from} to ${last.to} and published nothing: an accepted transition publishes once`,
        ];
  });
};

/**
 * Publication (Turn I9, I29, I30) over a run's reports: in each step, an actor whose turns moved
 * it to another leaf publishes; a published memory object is never published again with other
 * content; and, in a step whose turns ran no `updateMemory`, an actor's unchanged memory is
 * published as the same object. Identity is judged within one page and one incarnation.
 */
export const publicationBreaches = (fixtures: ReadonlyArray<Fixture>, facts: ReadonlyArray<Fact>) =>
  stepsOf(facts).reduce<{ readonly state: State; readonly found: ReadonlyArray<string> }>(
    (acc, step) => {
      const walked = step.reduce(
        (inner, fact) => {
          const next = onFact(fixtures, step, inner.state, fact);

          return { state: next.state, found: [...inner.found, ...(next.found ?? [])] };
        },
        { state: acc.state, found: acc.found },
      );

      return { state: walked.state, found: [...walked.found, ...unpublished(step)] };
    },
    { state: { contents: new Map(), last: new Map() }, found: [] },
  ).found;
