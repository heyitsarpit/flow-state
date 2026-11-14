import { Equal, HashSet, MutableRef, Option, type Schema } from "effect";
import type { Part, ServerAnswer } from "../../fixtures/part.ts";
import type { Fixture } from "../fixtures/fixture.ts";
import type { Folded, Labels } from "../fixtures/folds.ts";
import { Answer } from "../world/network.ts";

type Compiled = Part["machine"]["compiled"];

type CompiledAlternative = NonNullable<ReturnType<Compiled["root"]["get"]>>[number];

/**
 * A request the generator expects open: whose actor it answers, and its lane's key.
 */
export type Open = { readonly actor: number; readonly key: Schema.Json };

/**
 * Lane keys by value: two equal keys are one, whatever their fields' order (Effect's Equal).
 */
export type Keys = HashSet.HashSet<Schema.Json>;

/**
 * What the generator believes of one actor, to steer its user model (never a verdict: the oracles
 * judge what the runtime did).
 */
export type Believed = {
  readonly part: Part;
  readonly fixture: Fixture;
  readonly by: number;
  readonly attached: MutableRef.MutableRef<boolean>;
  readonly leaf: MutableRef.MutableRef<string>;
  readonly fields: MutableRef.MutableRef<Folded>;
  readonly timers: MutableRef.MutableRef<
    ReadonlyArray<{ readonly send: string; readonly due: number }>
  >;
  readonly busy: MutableRef.MutableRef<Keys>;
  readonly unsure: MutableRef.MutableRef<Keys>;
  readonly parked: MutableRef.MutableRef<
    ReadonlyArray<{ readonly event: string; readonly labels: Labels }>
  >;
};

/**
 * The generator's belief of the whole app: its actors, the requests it expects open by operation
 * (oldest first), the writes not yet acknowledged, and the clock.
 */
export type World = {
  readonly actors: ReadonlyArray<Believed>;
  readonly open: Map<string, ReadonlyArray<Open>>;
  readonly unacked: Array<{ readonly operation: string; readonly request: Open }>;
  readonly now: MutableRef.MutableRef<number>;
};

const keyOf = (fixture: Fixture, operation: string, labels: Labels, fields: Folded, at: string) =>
  Option.getOrNull(
    Option.flatMap(Option.fromUndefinedOr(fixture.handlers.folds.keys[operation]), (key) =>
      key(labels, fields, Option.some(at)),
    ),
  );

const alternativesFor = (compiled: Compiled, leaf: string, event: string) => [
  ...(compiled.states.get(leaf)?.on.get(event) ?? []),
  ...(compiled.root.get(event) ?? []),
];

const passes = (a: Believed, alternative: CompiledAlternative, labels: Labels) => {
  const fold = a.fixture.handlers.folds.guards[alternative.at];
  const checks = fold === undefined ? Option.some(true) : fold(labels, a.fields.current);

  if (Option.exists(checks, (ok) => !ok)) return false;

  return alternative.guards.every((g) => {
    if (g._tag === "InState") return g.states.includes(a.leaf.current);

    if (g._tag === "Idle")
      return !HashSet.has(
        a.busy.current,
        keyOf(a.fixture, g.operation, labels, a.fields.current, alternative.at),
      );

    if (g._tag === "Retryable")
      return HashSet.has(
        a.unsure.current,
        keyOf(a.fixture, g.operation, labels, a.fields.current, alternative.at),
      );

    return true;
  });
};

/**
 * The schedules a leaf arms on entry, due from `now`.
 */
export const armed = (a: Believed, now: number) =>
  (a.part.machine.compiled.states.get(a.leaf.current)?.schedules ?? []).flatMap((s) => {
    if (!s.onEntry) return [];

    const ms =
      s.delay._tag === "Fixed"
        ? s.delay.ms
        : Option.getOrElse(
            Option.flatMap(Option.fromUndefinedOr(a.fixture.handlers.folds.delays[s.name]), (d) =>
              d(a.fields.current),
            ),
            () => 0,
          );

    return [{ send: s.send, due: now + ms }];
  });

const opened = (world: World, operation: string, request: Open) =>
  world.open.set(operation, [...(world.open.get(operation) ?? []), request]);

type LaneAction = Exclude<CompiledAlternative["actions"][number], { readonly _tag: "Lookup" }>;

const acted = (world: World, a: Believed, action: LaneAction, key: Schema.Json, acked: boolean) => {
  const request = { actor: a.by, key };

  if (action._tag === "Commit" && !HashSet.has(a.busy.current, key)) {
    MutableRef.set(a.busy, HashSet.add(a.busy.current, key));

    if (acked || !a.part.machine.compiled.persist) opened(world, action.operation, request);
    else world.unacked.push({ operation: action.operation, request });
  }

  if (action._tag === "Retry" && HashSet.has(a.unsure.current, key)) {
    MutableRef.set(a.unsure, HashSet.remove(a.unsure.current, key));
    opened(world, action.operation, request);
  }

  if (action._tag === "Cancel") {
    MutableRef.set(a.busy, HashSet.remove(a.busy.current, key));
    MutableRef.set(a.unsure, HashSet.remove(a.unsure.current, key));
    world.open.set(
      action.operation,
      (world.open.get(action.operation) ?? []).filter(
        (r) => r.actor !== a.by || !Equal.equals(r.key, key),
      ),
    );
  }
};

/**
 * Applies one event to the generator's belief of an actor: the first alternative whose guards
 * pass moves its leaf, folds its update, opens its lookups' requests, and opens, resends or drops
 * its lane members' requests.
 */
export const heard = (world: World, a: Believed, event: string, labels: Labels, acked: boolean) => {
  const chosen = alternativesFor(a.part.machine.compiled, a.leaf.current, event).find((alt) =>
    passes(a, alt, labels),
  );

  if (chosen === undefined) return;

  const update = a.fixture.handlers.folds.updates[chosen.at];

  if (update !== undefined)
    MutableRef.set(a.fields, { ...a.fields.current, ...update(labels, a.fields.current) });

  for (const action of chosen.actions) {
    const key = keyOf(a.fixture, action.operation, labels, a.fields.current, chosen.at);

    if (action._tag === "Lookup") opened(world, action.operation, { actor: a.by, key });
    else acted(world, a, action, key, acked);
  }

  Option.map(chosen.target, (target) => {
    MutableRef.set(a.leaf, target);
    MutableRef.set(a.timers, armed(a, world.now.current));
  });
};

/**
 * Forgets an actor's belief: back to its initial leaf and fields, nothing timed. Its lanes, busy
 * and unsure, go too unless `keepLanes`: a disposed or forgotten actor's lanes outlive it (Actors
 * R20, R21), which only the varied profile believes, so the usual and stress scripts stay as their
 * owed rows name them.
 */
export const reset = (a: Believed, keepLanes = false) => {
  MutableRef.set(a.leaf, a.part.machine.compiled.initial);
  MutableRef.set(a.fields, a.fixture.handlers.folds.initial);
  MutableRef.set(a.timers, []);

  if (keepLanes) return;
  MutableRef.set(a.busy, HashSet.empty());
  MutableRef.set(a.unsure, HashSet.empty());
};

/**
 * A server model's answer as the world's.
 */
export const answerFor = (answer: ServerAnswer) =>
  answer._tag === "ok"
    ? Answer.Ok({ value: answer.value })
    : Answer.Fail({ tag: answer.tag, fields: answer.fields });

const eventOfAnswer = (a: Believed, operation: string, answer: Answer) => {
  const reference = a.fixture.operations[operation]?.reference;

  if (reference === undefined) return Option.none<string>();

  const channel = reference.classify(answer, false);

  if (channel === "success") return Option.some(reference.success);

  if (channel === "unknown")
    return reference.unknown === "ignore" || reference.unknown === "bare"
      ? Option.none<string>()
      : Option.some(reference.unknown.event);

  return Answer.$is("Fail")(answer)
    ? Option.fromUndefinedOr(reference.failure[answer.tag])
    : Option.none<string>();
};

/**
 * The open request of `operation` `skip` places after the oldest answered (the oldest by
 * default): its actor hears the mapped event, or with `parks`, the varied profile's belief, keeps
 * it until the actor is attached again when it has no live incarnation (Actors R20).
 */
export const answered = (
  world: World,
  operation: string,
  answer: Answer,
  skip = 0,
  parks = false,
) => {
  const open = world.open.get(operation) ?? [];
  const head = open[skip];

  if (head === undefined) return;
  world.open.set(operation, open.toSpliced(skip, 1));

  const a = world.actors[head.actor];

  if (a === undefined) return;

  const lost = !Answer.$is("Ok")(answer) && !Answer.$is("Fail")(answer);

  if (lost) MutableRef.set(a.unsure, HashSet.add(a.unsure.current, head.key));
  else MutableRef.set(a.busy, HashSet.remove(a.busy.current, head.key));

  const labels = a.fixture.handlers.folds.answers[operation]?.(answer) ?? {};

  Option.match(eventOfAnswer(a, operation, answer), {
    onNone: () => undefined,
    onSome: (event) => {
      if (parks && !a.attached.current)
        MutableRef.set(a.parked, [...a.parked.current, { event, labels }]);
      else heard(world, a, event, labels, true);
    },
  });
};

/**
 * An actor attached again hears the endings parked for it while it had no live incarnation.
 */
export const unparked = (world: World, a: Believed) => {
  const waiting = a.parked.current;
  MutableRef.set(a.parked, []);

  for (const { event, labels } of waiting) heard(world, a, event, labels, true);
};

/**
 * The clock moved `ms`: each attached actor hears its timers that came due.
 */
export const advanced = (world: World, ms: number) => {
  MutableRef.update(world.now, (n) => n + ms);

  for (const a of world.actors) {
    const due = a.timers.current.filter((t) => t.due <= world.now.current);
    MutableRef.set(
      a.timers,
      a.timers.current.filter((t) => t.due > world.now.current),
    );

    for (const t of due) if (a.attached.current) heard(world, a, t.send, {}, true);
  }
};

/**
 * The store refused the held batch: its writes are never sent, so their lanes are free again.
 */
export const refused = (world: World) => {
  for (const { request } of world.unacked.splice(0)) {
    const a = world.actors[request.actor];

    if (a !== undefined) MutableRef.set(a.busy, HashSet.remove(a.busy.current, request.key));
  }
};

/**
 * A reload: unacknowledged writes are gone, open requests become unsure, local actors reset.
 */
export const reloaded = (world: World) => {
  world.unacked.splice(0);

  for (const [operation, requests] of world.open) {
    for (const r of requests) {
      const a = world.actors[r.actor];

      if (a !== undefined) MutableRef.set(a.unsure, HashSet.add(a.unsure.current, r.key));
    }

    world.open.set(operation, []);
  }

  for (const a of world.actors)
    if (!a.part.machine.compiled.persist) {
      reset(a);
      MutableRef.set(a.attached, false);
    }
};
