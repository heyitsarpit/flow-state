import { Option } from "effect";
import { Fact, oracle, violation } from "../dsl/oracle.ts";
import { type ActorRef, Observation } from "../port.ts";

type Seen = { readonly state: string; readonly content: string };

type State = { readonly published: ReadonlyMap<string, Seen> };

type Refusal = {
  readonly actor: ActorRef;
  readonly rule: "Turn I14" | "Turn I15";
  readonly what: string;
  readonly from: number;
  readonly at: number;
};

const keyOf = (actor: ActorRef) => `${actor.machine} ${actor.id}`;

const reportOf = (fact: Fact) =>
  Fact.$is("Reported")(fact) ? Option.some(fact.observation) : Option.none<Observation>();

const isOf = (actor: ActorRef, of: Option.Option<ActorRef>) =>
  Option.isSome(of) && keyOf(of.value) === keyOf(actor);

const lastIndex = (step: ReadonlyArray<Fact>, before: number, found: (fact: Fact) => boolean) =>
  step.slice(0, before).findLastIndex(found);

const refusalOfIssue = (step: ReadonlyArray<Fact>, at: number, o: Observation) => {
  if (!Observation.$is("Issue")(o) || o.code !== "InvalidTurn" || Option.isNone(o.ending))
    return [];

  const ending = o.ending.value;

  const from = lastIndex(step, at, (fact) =>
    Option.exists(
      reportOf(fact),
      (d) =>
        Observation.$is("Delivered")(d) &&
        d.operation === ending.operation &&
        Option.getOrNull(d.attempt) === Option.getOrNull(ending.attempt) &&
        isOf(ending.actor, d.actor),
    ),
  );

  return from < 0
    ? []
    : [
        {
          actor: ending.actor,
          rule: "Turn I14" as const,
          what: `refused turn of ${ending.operation}'s ending`,
          from,
          at,
        },
      ];
};

const refusalOfEvent = (step: ReadonlyArray<Fact>, at: number, o: Observation) => {
  if (!Observation.$is("Unhandled")(o) && !Observation.$is("Denied")(o)) return [];

  const from = lastIndex(
    step,
    at,
    (fact) =>
      (Fact.$is("Drove")(fact) && fact.event === o.event) ||
      Option.exists(
        reportOf(fact),
        (d) => Observation.$is("Delivered")(d) && d.event === o.event && Option.isSome(d.actor),
      ),
  );

  const source = step[from];

  if (source === undefined) return [];

  const actor = Fact.$is("Drove")(source)
    ? Option.some(source.actor)
    : Option.flatMap(reportOf(source), (d) =>
        Observation.$is("Delivered")(d) ? d.actor : Option.none(),
      );

  return Option.match(actor, {
    onNone: () => [],
    onSome: (who) => [
      { actor: who, rule: "Turn I15" as const, what: `${o._tag} ${o.event}`, from, at },
    ],
  });
};

const workOf = (actor: ActorRef, o: Observation) =>
  (Observation.$is("Turn")(o) && keyOf(o.actor) === keyOf(actor)) ||
  (Observation.$is("Minted")(o) && isOf(actor, o.actor));

const workBetween = (step: ReadonlyArray<Fact>, r: Refusal) =>
  step
    .slice(r.from + 1, r.at)
    .flatMap((fact) => Option.toArray(reportOf(fact)))
    .filter((o) => workOf(r.actor, o))
    .map(
      (o) =>
        `${r.rule}: ${keyOf(r.actor)}'s ${r.what} reported work of its own (${o._tag} ${Observation.$is("Turn")(o) ? `${o.from} to ${o.to}` : ""})`,
    );

// RETURN_TYPE: an Option of Seen; the branches infer Some and None apart.
const seenOf = (o: Observation): Option.Option<Seen> =>
  Observation.$is("Published")(o)
    ? Option.some({ state: o.state, content: `${o.state} ${JSON.stringify(o.memory)}` })
    : Option.none();

const reportsIn = (step: ReadonlyArray<Fact>) =>
  step.flatMap((fact) => Option.toArray(reportOf(fact)));

const leafBefore = (state: State, step: ReadonlyArray<Fact>, r: Refusal) => {
  const name = keyOf(r.actor);

  const turned = reportsIn(step.slice(0, r.from)).findLast(
    (o) => Observation.$is("Turn")(o) && keyOf(o.actor) === name,
  );

  return turned !== undefined && Observation.$is("Turn")(turned)
    ? Option.some(turned.to)
    : Option.map(Option.fromUndefinedOr(state.published.get(name)), (seen) => seen.state);
};

const movedAfter = (state: State, step: ReadonlyArray<Fact>, r: Refusal) => {
  const name = keyOf(r.actor);

  const next = reportsIn(step.slice(r.at + 1)).find(
    (o) => Observation.$is("Turn")(o) && keyOf(o.actor) === name,
  );

  if (next === undefined || !Observation.$is("Turn")(next)) return [];

  return Option.match(leafBefore(state, step, r), {
    onNone: () => [],
    onSome: (leaf) =>
      next.from === leaf
        ? []
        : [
            `${r.rule}: ${name}'s next turn ran from ${next.from} after a ${r.what} that was refused at ${leaf}`,
          ],
  });
};

const changed = (state: State, step: ReadonlyArray<Fact>, r: Refusal) => {
  const reports = reportsIn(step);
  const name = keyOf(r.actor);

  const ranOrBegan = reports.some(
    (o) =>
      (Observation.$is("Turn")(o) || Observation.$is("Incarnated")(o)) && keyOf(o.actor) === name,
  );

  const before = state.published.get(name);

  if (ranOrBegan || before === undefined) return [];

  return reports
    .filter((o) => Observation.$is("Published")(o) && keyOf(o.actor) === name)
    .flatMap((o) => Option.toArray(seenOf(o)))
    .filter((seen) => seen.content !== before.content)
    .map(
      (seen) =>
        `${r.rule}: ${name} published another state or memory (${seen.content}) in a step whose one turn of it, a ${r.what}, was refused`,
    );
};

// RETURN_TYPE: the oracle's State contract; the reload branch's empty Map infers never.
const published = (state: State, step: ReadonlyArray<Fact>): State =>
  step.reduce<State>((acc, fact) => {
    if (Fact.$is("Reloaded")(fact)) return { published: new Map() };

    return Option.match(reportOf(fact), {
      onNone: () => acc,
      onSome: (o) =>
        Observation.$is("Published")(o)
          ? {
              published: new Map([
                ...acc.published,
                [keyOf(o.actor), Option.getOrThrow(seenOf(o))],
              ]),
            }
          : acc,
    });
  }, state);

/**
 * Refusal (Turn I14, I15): a refused turn, and an Unhandled or Denied event, change nothing of
 * their actor and start no work.
 *
 * **Details**
 *
 * - A refused turn is one the runtime reports with an `InvalidTurn` issue naming an ending; its
 *   span runs from that ending's `Delivered` to the issue. An Unhandled or Denied event's span
 *   runs from the suite's `Drove` of that event, or the ending delivered as it, to the report.
 * - In its span no `Turn` or `Minted` of that actor is reported.
 * - The actor's next turn in the step runs from the leaf it had before the span (its last turn's
 *   `to`, else its last published state).
 * - In a step where that actor ran no turn and began no incarnation, its `Published` state and
 *   memory equal the last ones it published.
 *
 * **Gotchas**
 *
 * - The refusal itself is the runtime's report; a runtime that reports none is caught by the
 *   cases' own expectations (`TURN-01`, `TURN-02`).
 * - A refused turn in a step that also runs another turn of the actor is judged only for its span.
 * - The issue-only snapshot, context, the store and the revision are not on the Port; an
 *   `InvalidTurn` with no ending (an ensure, the follow-up bound) is not judged.
 */
export const refusal = oracle<State>({
  name: "refusal",
  guarantee: ["Turn I14", "Turn I15"],
  start: () => ({ published: new Map() }),
  step: (state, step) => {
    const refusals = step.flatMap((fact, at) =>
      Option.match(reportOf(fact), {
        onNone: () => [],
        onSome: (o) => [...refusalOfIssue(step, at, o), ...refusalOfEvent(step, at, o)],
      }),
    );

    const found = refusals.flatMap((r) => [
      ...workBetween(step, r),
      ...movedAfter(state, step, r),
      ...changed(state, step, r),
    ]);

    return [published(state, step), [...new Set(found)].map(violation)];
  },
});
