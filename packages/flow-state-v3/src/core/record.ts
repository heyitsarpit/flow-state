import { Option, Result } from "effect";
import { CodecFailure, encodeCanonical } from "./codec.ts";
import { InternalsId, type Compiled, Source, type Values } from "./compiled.ts";
import { LOCAL_PREFIX } from "./identity.ts";
import { parseOwner } from "./record-key.ts";
import { FORMAT } from "./record-shape.ts";
import { sameForm, type Selected } from "./slots.ts";
import type { ActorId, ActorRecord } from "./world.ts";

const reasonOf = (failure: CodecFailure) =>
  CodecFailure.$match(failure, { Malformed: ({ reason, path }) => `${reason} at ${path}` });

/**
 * A record's canonical text in its envelope, or why it has none.
 */
export const textOf = (body: Values) =>
  Result.mapError(encodeCanonical({ body, format: FORMAT }), reasonOf);

const isLocal = (actor: ActorId) => actor.name.startsWith(LOCAL_PREFIX);

// A memory's fields as canonical text, each kept by its value, without the fields its name holds.
const memoryText = (compiled: Compiled, memory: Values) =>
  Result.map(
    Result.all(
      compiled[InternalsId].fields
        .filter((f) => !Source.$is("Input")(f.source) && Object.hasOwn(memory, f.name))
        .map((f) =>
          Result.mapBoth(f.walk.text(memory[f.name]), {
            onFailure: (why) => why.replace(" at $", ` at $.body.memory.${f.name}`),
            onSuccess: (text) => [f.name, text] as const,
          }),
        ),
    ),
    (fields) => Object.fromEntries(fields),
  );

// A saved baseline of a reaction: its value, none with no `value`.
const savedOf = (baseline: Option.Option<Selected>) =>
  Option.match(baseline, { onNone: () => ({}), onSome: (b) => ({ value: b.text }) });

// Each slot's entry: its provider (never a local actor, which saves nothing), its last selection,
// and the baselines of its reactions that differ from that selection, by event.
const slotsOf = (compiled: Compiled, record: ActorRecord) => {
  const baselines = new Map<string, Record<string, ReturnType<typeof savedOf>>>();

  for (const [at, reaction] of compiled[InternalsId].reactions.entries()) {
    const baseline = record.baselines[at] ?? Option.none();

    if (!sameForm(baseline, Option.fromUndefinedOr(record.seen.get(reaction.slot))))
      baselines.set(reaction.slot, {
        ...baselines.get(reaction.slot),
        [reaction.event.event]: savedOf(baseline),
      });
  }

  const bound = [...record.context].filter(([, p]) => !isLocal(p));

  const slots = new Set([
    ...bound.map(([slot]) => slot),
    ...record.seen.keys(),
    ...baselines.keys(),
  ]);

  const provider = new Map(bound);

  return Object.fromEntries(
    [...slots].map((slot) => {
      const p = provider.get(slot);
      const seen = record.seen.get(slot);

      return [
        slot,
        {
          ...Option.match(Option.fromUndefinedOr(p), {
            onNone: () => ({}),
            onSome: (bound) => ({ provider: { machine: bound.machine, name: bound.name } }),
          }),
          ...Option.match(Option.fromUndefinedOr(seen), {
            onNone: () => ({}),
            onSome: (selected) => ({ seen: { value: selected.text } }),
          }),
          baselines: baselines.get(slot) ?? {},
        },
      ] as const;
    }),
  );
};

// The wiring of the providers up the graph that keep no record of their own: a persisted provider's
// record holds its own, and a local actor saves nothing.
const graphOf = (machines: ReadonlyMap<string, Compiled>, record: ActorRecord) =>
  Object.fromEntries(
    [...record.graph].flatMap(([owner, wired]) => {
      const provider = Option.getOrUndefined(parseOwner(owner));
      const providers = [...wired].filter(([, p]) => !isLocal(p));

      return provider === undefined ||
        isLocal(provider) ||
        machines.get(provider.machine)?.persist === true ||
        providers.length === 0
        ? []
        : [
            [
              owner,
              Object.fromEntries(
                providers.map(([slot, p]) => [slot, { machine: p.machine, name: p.name }]),
              ),
            ] as const,
          ];
    }),
  );

/**
 * A position as its record's canonical text: its state, its memory without the fields its name
 * holds, its schedules, one entry per slot, the wiring of providers that keep no record of their
 * own, and no instances; or why it cannot encode.
 */
export const encodePosition = (
  machines: ReadonlyMap<string, Compiled>,
  compiled: Compiled,
  record: ActorRecord,
) =>
  Result.flatMap(memoryText(compiled, record.memory), (memory) =>
    textOf({
      state: record.state,
      memory,
      schedules: record.schedules,
      slots: slotsOf(compiled, record),
      graph: graphOf(machines, record),
      instances: {},
    }),
  );
