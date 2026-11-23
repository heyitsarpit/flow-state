import { Option, Result } from "effect";
import { InternalsId, type Compiled, type ContextSlot, Source, type Values } from "./compiled.ts";
import { actorNamed, namesOf } from "./record-names.ts";
import { parseOwner } from "./record-key.ts";
import type { Position } from "./record-shape.ts";
import { readSelected, type Selected } from "./slots.ts";
import { create } from "./tree.ts";
import { type ActorId, type ActorRecord, actorKey, Quarantine } from "./world.ts";

type Slot = Position["slots"][string];

// A reference map's resolution: what reads, and the names of the leaves it dropped.
type Resolved<A> = { readonly value: A; readonly dropped: ReadonlyArray<string> };

// The saved memory fields the machine reads, without the fields its name holds; a field the machine
// no longer declares is dropped, and one that does not read resets the position.
const memoryOf = (compiled: Compiled, memory: Position["memory"]) => {
  const fields = new Map(compiled[InternalsId].fields.map((f) => [f.name, f]));
  // FLOW_STATE_ALLOW_UNKNOWN: each field holds its own Schema's type, typed at the definition.
  const read: Record<string, unknown> = {};
  const dropped: Array<string> = [];

  for (const [name, json] of Object.entries(memory)) {
    const field = fields.get(name);

    if (field === undefined) dropped.push(`memory.${name}`);
    else if (!Source.$is("Input")(field.source)) {
      const value = field.walk.decode(json);

      if (Result.isFailure(value))
        return Result.fail(Quarantine.Reset({ why: "Memory", detail: `memory.${name}` }));
      read[name] = value.success;
    }
  }

  return Result.succeed<Resolved<Values>>({ value: read, dropped });
};

// The saved schedules under the states the machine declares, each by a name its state declares.
const schedulesOf = (compiled: Compiled, schedules: Position["schedules"]) => {
  const kept: Record<string, Position["schedules"][string]> = {};
  const dropped: Array<string> = [];

  for (const [path, byName] of Object.entries(schedules)) {
    const declared = new Set((compiled.states.get(path)?.schedules ?? []).map((s) => s.name));
    const names = Object.entries(byName);

    if (!compiled.states.has(path)) dropped.push(`schedules.${path}`);
    else {
      dropped.push(
        ...names.filter(([name]) => !declared.has(name)).map(([n]) => `schedules.${path}.${n}`),
      );
      const read = names.filter(([name]) => declared.has(name));

      if (read.length > 0) kept[path] = Object.fromEntries(read);
    }
  }

  return { value: kept, dropped };
};

// A saved selection read by its slot's Schema, or none saved.
const selectionOf = (declared: ContextSlot, entry: Slot) =>
  Option.match(Option.fromUndefinedOr(entry.seen), {
    onNone: () => Result.succeed(Option.none<Selected>()),
    onSome: (s) => Result.map(readSelected(declared.walk, s.value), Option.some),
  });

// A saved provider read by its slot's provider machine's name codec, or none saved.
const providerOf = (machines: ReadonlyMap<string, Compiled>, declared: ContextSlot, entry: Slot) =>
  Option.match(Option.fromUndefinedOr(entry.provider), {
    onNone: () => Result.succeed(Option.none<ActorId>()),
    onSome: (p) =>
      Option.match(
        Option.filter(
          actorNamed(machines, p.machine, p.name),
          () => p.machine === declared.provider,
        ),
        {
          onNone: () => Result.fail("provider"),
          onSome: (a) => Result.succeed(Option.some<ActorId>(a.actor)),
        },
      ),
  });

type Slots = {
  readonly context: Map<string, ActorId>;
  readonly seen: Map<string, Selected>;
  readonly own: Map<number, Option.Option<Selected>>;
};

// One slot's reactions' saved baselines, each by its reaction's event; one the machine no longer
// declares, or that does not read, is dropped.
const baselinesOf = (
  compiled: Compiled,
  slot: string,
  declared: ContextSlot,
  entry: Slot,
  into: Slots,
) =>
  Object.entries(entry.baselines).flatMap(([event, baseline]) => {
    const at = compiled[InternalsId].reactions.findIndex(
      (r) => r.slot === slot && r.event.event === event,
    );

    const read = Option.match(Option.fromUndefinedOr(baseline.value), {
      onNone: () => Result.succeed(Option.none<Selected>()),
      onSome: (value) => Result.map(readSelected(declared.walk, value), Option.some),
    });

    if (at < 0 || Result.isFailure(read)) return [`slots.${slot}.baselines.${event}`];

    into.own.set(at, read.success);

    return [];
  });

// The saved slots the machine declares, each whole or dropped whole when its provider or its
// selection does not read.
const slotsOf = (
  machines: ReadonlyMap<string, Compiled>,
  compiled: Compiled,
  slots: Position["slots"],
) => {
  const into: Slots = { context: new Map(), seen: new Map(), own: new Map() };

  const dropped = Object.entries(slots).flatMap(([slot, entry]) => {
    const declared = compiled.context.get(slot);

    if (declared === undefined) return [`slots.${slot}`];

    const provider = providerOf(machines, declared, entry);
    const selection = selectionOf(declared, entry);

    if (Result.isFailure(provider) || Result.isFailure(selection)) return [`slots.${slot}`];

    for (const p of Option.toArray(provider.success)) into.context.set(slot, p);

    for (const s of Option.toArray(selection.success)) into.seen.set(slot, s);

    return baselinesOf(compiled, slot, declared, entry, into);
  });

  return { value: into, dropped };
};

// One provider's saved wiring, each slot read by the provider machine's slot and its provider's
// name codec.
const wiringOf = (
  machines: ReadonlyMap<string, Compiled>,
  owned: string,
  owner: ActorId,
  wired: Position["graph"][string],
) => {
  const declaring = machines.get(owner.machine);
  const bound = new Map<string, ActorId>();

  const dropped = Object.entries(wired).flatMap(([slot, p]) => {
    const read = Option.filter(
      actorNamed(machines, p.machine, p.name),
      () => declaring?.context.get(slot)?.provider === p.machine,
    );

    if (Option.isNone(read)) return [`graph.${owned}.${slot}`];

    bound.set(slot, read.value.actor);

    return [];
  });

  return { bound, dropped };
};

// The saved wiring of providers that keep no record of their own, each owner read as an identity.
const graphOf = (machines: ReadonlyMap<string, Compiled>, graph: Position["graph"]) => {
  const read = new Map<string, ReadonlyMap<string, ActorId>>();

  const dropped = Object.entries(graph).flatMap(([owned, wired]) => {
    const owner = Option.filter(
      Option.flatMap(parseOwner(owned), (o) => actorNamed(machines, o.machine, o.name)),
      (a) => actorKey(a.actor) === owned,
    );

    // The writer saves no wiring of a provider that keeps its own record.
    if (Option.isNone(owner) || machines.get(owner.value.actor.machine)?.persist === true)
      return [`graph.${owned}`];

    const wiring = wiringOf(machines, owned, owner.value.actor, wired);
    read.set(owned, wiring.bound);

    return wiring.dropped;
  });

  return { value: read, dropped };
};

/**
 * A position read against its machine through the reference table: Live, with the leaves it
 * dropped (a name the machine lacks or one that does not read), or Reset by a state the machine
 * lacks or a memory field that does not read. A memory field the name holds is not read: the name
 * gives it. Instances no machine declares yet are dropped.
 */
export const resolvePosition = (
  machines: ReadonlyMap<string, Compiled>,
  compiled: Compiled,
  actor: ActorId,
  input: Values,
  body: Position,
) =>
  Option.match(namesOf(compiled).state(body.state), {
    onNone: () => Result.fail(Quarantine.Reset({ why: "State", detail: `state ${body.state}` })),
    onSome: (state) =>
      Result.map(memoryOf(compiled, body.memory), (memory) => {
        const schedules = schedulesOf(compiled, body.schedules);
        const slots = slotsOf(machines, compiled, body.slots);
        const graph = graphOf(machines, body.graph);

        const record: ActorRecord = {
          actor,
          state,
          memory: { ...create(compiled, input), ...memory.value },
          schedules: schedules.value,
          context: slots.value.context,
          seen: slots.value.seen,
          baselines: compiled[InternalsId].reactions.map(
            (r, at) =>
              slots.value.own.get(at) ?? Option.fromUndefinedOr(slots.value.seen.get(r.slot)),
          ),
          graph: graph.value,
        };

        return {
          record,
          dropped: [
            ...memory.dropped,
            ...schedules.dropped,
            ...slots.dropped,
            ...graph.dropped,
            ...Object.keys(body.instances).map((address) => `instances.${address}`),
          ],
        };
      }),
  });
