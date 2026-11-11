import { Fact, oracle, violation } from "../dsl/oracle.ts";
import { type Machines, updatesAt } from "../fixtures/handlers.ts";
import { type ActorRef, Observation } from "../port.ts";

type Seen = { readonly memoryId: number; readonly content: string };

type State = {
  readonly machines: Machines;
  readonly contents: ReadonlyMap<number, string>;
  readonly last: ReadonlyMap<string, Seen>;
};

const updatedIn = (machines: Machines, step: ReadonlyArray<Fact>, actor: ActorRef) =>
  step.some((fact) => {
    if (!Fact.$is("Reported")(fact) || !Observation.$is("Turn")(fact.observation)) return false;

    const turn = fact.observation;
    const handlers = machines[turn.actor.machine];

    return (
      keyOf(turn.actor) === keyOf(actor) &&
      (handlers === undefined || turn.parts.some((p) => updatesAt(handlers, p.at)))
    );
  });

const keyOf = (actor: ActorRef) => `${actor.machine} ${actor.id}`;

const judged = (state: State, actor: ActorRef, seen: Seen, updated: boolean) => {
  const name = `${actor.machine} ${actor.id}`;
  const before = state.contents.get(seen.memoryId);
  const last = state.last.get(keyOf(actor));

  const mutated =
    before !== undefined && before !== seen.content
      ? [
          `Turn I29: ${name} published memory object #${seen.memoryId} again with other content: a published snapshot was mutated`,
        ]
      : [];

  const copied =
    !updated &&
    last !== undefined &&
    last.content === seen.content &&
    last.memoryId !== seen.memoryId
      ? [
          `Turn I30: ${name} published unchanged memory as a new object (#${last.memoryId} became #${seen.memoryId})`,
        ]
      : [];

  return [...mutated, ...copied];
};

const onPublished = (state: State, fact: Fact, step: ReadonlyArray<Fact>) => {
  if (Fact.$is("Reloaded")(fact))
    return { state: { ...state, contents: new Map(), last: new Map() }, found: [] };

  if (
    Fact.$is("Reported")(fact) &&
    (Observation.$is("Incarnated")(fact.observation) ||
      Observation.$is("Finished")(fact.observation))
  ) {
    const gone = keyOf(fact.observation.actor);

    return {
      state: { ...state, last: new Map([...state.last].filter(([key]) => key !== gone)) },
      found: [],
    };
  }

  if (!Fact.$is("Reported")(fact) || !Observation.$is("Published")(fact.observation))
    return { state, found: [] };

  const { actor, memory, memoryId } = fact.observation;

  if (memoryId === 0) return { state, found: [] };

  const seen = { memoryId, content: JSON.stringify(memory) };

  return {
    state: {
      ...state,
      contents: new Map([...state.contents, [memoryId, seen.content]]),
      last: new Map([...state.last, [keyOf(actor), seen]]),
    },
    found: judged(state, actor, seen, updatedIn(state.machines, step, actor)),
  };
};

const turnsOf = (step: ReadonlyArray<Fact>) =>
  step.flatMap((fact) =>
    Fact.$is("Reported")(fact) && Observation.$is("Turn")(fact.observation)
      ? [fact.observation]
      : [],
  );

/**
 * Each actor whose turns in this step moved it to another leaf and that no `Published` of the step
 * names (Turn I9: an accepted transition publishes).
 */
const unpublished = (step: ReadonlyArray<Fact>) => {
  const turns = turnsOf(step);
  const actors = [...new Map(turns.map((t) => [keyOf(t.actor), t.actor])).values()];

  return actors.flatMap((actor) => {
    const own = turns.filter((t) => keyOf(t.actor) === keyOf(actor));
    const first = own[0];
    const last = own.at(-1);

    const published = step.some(
      (fact) =>
        Fact.$is("Reported")(fact) &&
        Observation.$is("Published")(fact.observation) &&
        keyOf(fact.observation.actor) === keyOf(actor),
    );

    return first === undefined || last === undefined || first.from === last.to || published
      ? []
      : [
          `Turn I9: ${keyOf(actor)} moved from ${first.from} to ${last.to} and published nothing: an accepted transition publishes once`,
        ];
  });
};

/**
 * Publication and snapshot values (Turn I9, I29, I30): a turn that moves its actor publishes it,
 * a published memory object is never published again with other content, and an actor's unchanged
 * memory is published as the same object.
 *
 * **Details**
 *
 * The runtime's `Published` reports carry each memory's content and the adapter's identity for
 * its object. Both checks compare reports with each other: consistency of what the runtime
 * published, as a subscriber would see it. Identity is judged within one page: a reload starts
 * over. I30 is judged where the step's turns ran no `updateMemory` (the handler table's `updates`),
 * and within one incarnation: a fresh one may publish equal memory as a new object (Turn R25).
 *
 * **Gotchas**
 *
 * - I9 is judged per step from the turns' headers (a step whose turns move an actor publishes it);
 *   "at most once per turn" is not judged, since a `Published` names no turn.
 * - Memory as a whole is the one part judged; a snapshot's other parts (context, issues,
 *   operations) are not on the Port yet.
 * - A patch that writes equal values gives round-14 a new memory object with the same content;
 *   R24 would keep its identity. Such turns are not judged for I30 (a round-14 limit).
 */
export const publication = oracle<State>({
  name: "publication",
  guarantee: ["Turn I9", "Turn I29", "Turn I30"],
  start: (_reference, _graphs, machines) => ({ machines, contents: new Map(), last: new Map() }),
  step: (state, step) => {
    const folded = step.reduce<{ readonly state: State; readonly found: ReadonlyArray<string> }>(
      (acc, fact) => {
        const next = onPublished(acc.state, fact, step);

        return { state: next.state, found: [...acc.found, ...next.found] };
      },
      { state, found: [] },
    );

    return [folded.state, [...folded.found, ...unpublished(step)].map(violation)];
  },
});
