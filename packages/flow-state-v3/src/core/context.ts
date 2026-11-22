import { Data, Equal, Option, Result } from "effect";
import { InternalsId, callSlot, type Compiled, type ContextRead, type Values } from "./compiled.ts";
import { sameValue } from "./same.ts";
import { readsOf, scopeOf } from "./reads.ts";
import { type Selected, sameSlot, selectedOf } from "./slots.ts";
import { atOrBelow } from "./tree.ts";
import type { Tx } from "./tx.ts";
import {
  type ActorId,
  type ActorRecord,
  actorKey,
  type Incarnation,
  IssueSource,
  type StoredIssue,
  type StoredSource,
  type Use,
  type Wiring,
} from "./world.ts";

/**
 * What context needs of incarnations: ensuring a provider with a use, and releasing that use.
 */
export type ContextNeeds = {
  readonly ensure: (actor: ActorId, use: Option.Option<Use>, wiring: Option.Option<Wiring>) => void;
  readonly release: (actor: ActorId, use: Use) => void;
};

/**
 * A change to a source's outcome a context read decided: its issue raised, replacing the source's
 * earlier one, or its issue cleared by a clean read.
 */
export type OutcomeEdit = Data.TaggedEnum<{
  Raise: { issue: StoredIssue };
  Clear: { source: StoredSource };
}>;

/**
 * Constructors and matchers for {@link OutcomeEdit}.
 */
export const OutcomeEdit = Data.taggedEnum<OutcomeEdit>();

/**
 * What a consumer's context update decided, for its `Inputs` change: each slot's selection, the
 * reactions' baselines when they ran (none when no slot changed and none owed a comparison), the
 * outcomes it changed, the reactions' events in declaration order, and whether a slot's value
 * changed.
 */
export type Read = {
  readonly context: ReadonlyMap<string, Selected>;
  readonly baselines: Option.Option<ReadonlyArray<Option.Option<Selected>>>;
  readonly outcomes: ReadonlyArray<OutcomeEdit>;
  readonly events: ReadonlyArray<{ readonly tag: string; readonly payload: Values }>;
  readonly changed: boolean;
};

// What a consumer's selection reads of it: its bindings, its last selections and its open issues.
type Selecting = Pick<Incarnation, "bound" | "context" | "issues">;

// What one read takes from a provider: a public memory field, whether it is at a state or below
// it, or its state's name.
const readOf = (read: ContextRead, provider: Incarnation) => {
  switch (read.kind) {
    case "memory":
      return provider.memory[read.field];
    case "state":
      return atOrBelow(provider.state, read.path);
    case "stateName":
      return provider.state;
  }
};

// Whether a slot's last selection was read from these very values: a select is pure, and an
// immutable memory keeps an unchanged field's identity, so the same reads select it again.
// FLOW_STATE_ALLOW_UNKNOWN: each read has its field's or state's type.
const sameReads = (last: Selected, reads: ReadonlyArray<unknown>) =>
  Option.exists(last.reads, (r) => r.length === reads.length && r.every((v, i) => v === reads[i]));

const openOf = (issues: ReadonlyArray<StoredIssue>, source: StoredSource) =>
  issues.some((i) => Equal.equals(i.source, source));

// Whether a reaction owes its slot's value a comparison: its slot has a value it has not compared.
const differs = (baseline: Option.Option<Selected>, current: Option.Option<Selected>) =>
  Option.exists(current, (c) =>
    Option.match(baseline, {
      onNone: () => true,
      onSome: (b) => !sameValue(b.value, c.value),
    }),
  );

const sameSlot_ = Option.makeEquivalence(Equal.equals);

/**
 * Context binding and waves: a consumer binds each slot to one provider for its life and holds a
 * use of it; a provider's change owes each consumer one context update; the update reads every
 * provider's latest snapshot and runs the consumer's `onContext` reactions. Every read here is a
 * decision returned as data: only `apply` writes it.
 */
export const makeContext = (tx: Tx, needs: ContextNeeds) => {
  const { incarnationOf } = tx;

  // A source's issue raised: the same issue still open is raised once, not at every wave.
  const raise = (issues: ReadonlyArray<StoredIssue>, issue: StoredIssue) =>
    issues.some(
      (i) =>
        Equal.equals(i.source, issue.source) &&
        i.code === issue.code &&
        sameSlot_(i.slot, issue.slot),
    )
      ? []
      : [OutcomeEdit.Raise({ issue })];

  // A source that succeeds clears its own issue, never another source's.
  const clear = (issues: ReadonlyArray<StoredIssue>, source: StoredSource) =>
    openOf(issues, source) ? [OutcomeEdit.Clear({ source })] : [];

  // Each slot's selection from its provider's current reads, through its Schema. A slot none of
  // whose reads changed keeps its selection and runs no select, unless its last select failed; a
  // select that throws, or returns what its Schema cannot encode, keeps the slot's last selection
  // and raises one issue.
  const selected = (compiled: Compiled, consumer: Selecting) => {
    const outcomes: Array<OutcomeEdit> = [];
    // In declaration order, whatever order a record held them in.
    const values = new Map<string, Selected>();

    for (const [slot, declared] of compiled.context) {
      const last = consumer.context.get(slot);
      const source = IssueSource.Context({ slot });

      if (last !== undefined) values.set(slot, last);

      const provider = Option.flatMap(Option.fromUndefinedOr(consumer.bound.get(slot)), (id) =>
        Option.fromUndefinedOr(incarnationOf(id)),
      );

      if (Option.isNone(provider)) continue;

      const reads = declared.reads.map((read) => readOf(read, provider.value));

      if (last !== undefined && sameReads(last, reads) && !openOf(consumer.issues, source))
        continue;

      const named = Object.fromEntries(declared.reads.map((read, i) => [read.name, reads[i]]));

      const value = Result.flatMap(callSlot(declared.select, named), (raw) =>
        last !== undefined && Option.exists(last.raw, (r) => r === raw)
          ? Result.succeed({ ...last, reads: Option.some(reads) })
          : Result.mapBoth(selectedOf(declared.walk, raw), {
              onFailure: () => declared.select.slot,
              onSuccess: (s) => ({ ...s, value: tx.env.admit(s.value), reads: Option.some(reads) }),
            }),
      );

      if (Result.isSuccess(value)) {
        values.set(slot, value.success);
        outcomes.push(...clear(consumer.issues, source));
      } else
        outcomes.push(
          ...raise(consumer.issues, {
            source,
            code: "Defect",
            slot: Option.some(value.failure),
          }),
        );
    }

    return { context: values, outcomes };
  };

  // Each reaction's baseline as it starts: its slot's value, silently; none for a slot whose select
  // failed, whose first value is then a change.
  const baselinesOf = (compiled: Compiled, context: ReadonlyMap<string, Selected>) =>
    compiled[InternalsId].reactions.map((reaction) =>
      Option.fromUndefinedOr(context.get(reaction.slot)),
    );

  /**
   * Whether a consumer's reactions owe a comparison: one's slot has a value it has not compared.
   */
  const owes = (incarnation: Pick<Incarnation, "actor" | "context" | "baselines">) => {
    const compiled = tx.machines.get(incarnation.actor.machine);

    return (
      compiled !== undefined &&
      compiled[InternalsId].reactions.some((reaction, at) =>
        differs(
          incarnation.baselines[at] ?? Option.none(),
          Option.fromUndefinedOr(incarnation.context.get(reaction.slot)),
        ),
      )
    );
  };

  /**
   * Binds a starting consumer's slots to their providers, ensuring each with a use and its wiring
   * in the graph, and reads its context and the silent baselines of its reactions. `last` holds
   * the selections a restored record saved, kept while a selector throws.
   */
  const bind = (
    actor: ActorId,
    last: ReadonlyMap<string, Selected>,
    wiring: ReadonlyMap<string, ActorId>,
    graph: Option.Option<Wiring>,
  ) => {
    const compiled = tx.machines.get(actor.machine);
    const bound = new Map<string, ActorId>();

    if (compiled === undefined || compiled.context.size === 0)
      return { bound, context: last, baselines: [], outcomes: [] };

    for (const slot of compiled.context.keys()) {
      const provider = wiring.get(slot);

      if (provider !== undefined) {
        needs.ensure(provider, Option.some("context"), graph);
        bound.set(slot, provider);
      }
    }

    const read = selected(compiled, { bound, context: last, issues: [] });

    return { bound, ...read, baselines: baselinesOf(compiled, read.context) };
  };

  /**
   * Releases the uses an ending consumer holds of its providers.
   */
  const unbind = (incarnation: Incarnation) => {
    for (const provider of incarnation.bound.values()) needs.release(provider, "context");
  };

  /**
   * A provider changed: each live consumer bound to it is owed one context update.
   */
  const wave = (provider: ActorId) => {
    for (const consumer of tx.consumersOf(provider)) tx.owe(consumer.actor);
  };

  /**
   * Whether a consumer's wave has not settled yet: one of its providers, or theirs on the way up,
   * still has mail. Its context update waits until they have none, so it never reads a new value
   * beside a stale one of the same cause.
   */
  const settling = (actor: ActorId) => {
    // Each provider is judged once per question: a diamond's shared ancestors are not walked again.
    const judged = new Map<string, boolean>();

    // RETURN_TYPE: recursive: a provider's own providers are read on the way up.
    const busy = (consumer: ActorId): boolean =>
      [...(incarnationOf(consumer)?.bound.values() ?? [])].some((provider) => {
        const key = actorKey(provider);
        const known = judged.get(key);

        if (known !== undefined) return known;
        judged.set(key, false);
        const result = tx.hasMail(provider) || busy(provider);
        judged.set(key, result);

        return result;
      });

    return busy(actor);
  };

  // Runs each reaction whose slot's value differs from its baseline, in declaration order: its
  // baseline becomes the value and, when its `when` allows it, its event is kept. An equal value is
  // silent; a first value after none (a select that failed at the start) is a change, which `when`
  // judges with no previous value. A when or mapper that throws raises one issue of its reaction
  // and keeps its baseline.
  const react = (compiled: Compiled, read: Incarnation) => {
    const outcomes: Array<OutcomeEdit> = [];

    const baselines = compiled[InternalsId].reactions.map(
      (_, at) => read.baselines[at] ?? Option.none(),
    );

    const events: Array<{ readonly tag: string; readonly payload: Values }> = [];

    for (const [at, reaction] of compiled[InternalsId].reactions.entries()) {
      const current = read.context.get(reaction.slot);
      const previous = baselines[at] ?? Option.none();
      const source = IssueSource.OnContext({ at });

      if (current === undefined) continue;

      if (Option.exists(previous, (p) => sameValue(p.value, current.value))) {
        baselines[at] = Option.some(current);
        outcomes.push(...clear(read.issues, source));
        continue;
      }

      const allowed = Option.match(reaction.when, {
        onNone: () => Result.succeed(true),
        onSome: (when) =>
          callSlot(
            when,
            current.value,
            Option.getOrUndefined(Option.map(previous, (p) => p.value)),
            readsOf(scopeOf(read), "Reaction", {}),
          ),
      });

      // A declined change maps no payload, so a mapper never runs for an event that is not sent.
      const payload = Result.flatMap(allowed, (yes) =>
        !yes
          ? Result.succeed(Option.none<Values>())
          : Option.match(reaction.event.from, {
              onNone: () => Result.succeed(Option.some<Values>({})),
              onSome: (from) => Result.map(callSlot(from, current.value), Option.some),
            }),
      );

      Result.match(payload, {
        onFailure: (slot) => {
          outcomes.push(...raise(read.issues, { source, code: "Defect", slot: Option.some(slot) }));
        },
        // A changed value becomes the baseline even when `when` declines; a defect keeps it.
        onSuccess: (given) => {
          baselines[at] = Option.some(current);
          outcomes.push(...clear(read.issues, source));

          if (Option.isSome(given))
            events.push({ tag: reaction.event.event, payload: given.value });
        },
      });
    }

    return { baselines, events, outcomes };
  };

  /**
   * A context update's decision: every provider read again; when a slot changed, or a reaction
   * owes its slot's value a comparison (a return's one wave), the reactions run, each keeping its
   * event, in declaration order, when its slot's value changed and its `when` allows it. None when
   * the update changes nothing: no slot, no selection's reads and no outcome.
   */
  const inputsOf = (incarnation: Incarnation) => {
    const compiled = tx.machines.get(incarnation.actor.machine);

    if (compiled === undefined) return Option.none<Read>();

    const read = selected(compiled, incarnation);

    const changed = [...compiled.context.keys()].some(
      (slot) =>
        !sameSlot(
          Option.fromUndefinedOr(incarnation.context.get(slot)),
          Option.fromUndefinedOr(read.context.get(slot)),
        ),
    );

    const view = { ...incarnation, context: read.context };

    if (!changed && !owes(view)) {
      // A select that ran for an equal value still keeps its new reads, so the next turn that
      // changes none of them runs no select.
      const reselected = [...read.context].some(([slot, s]) => incarnation.context.get(slot) !== s);

      return reselected || read.outcomes.length > 0
        ? Option.some<Read>({
            context: read.context,
            baselines: Option.none(),
            outcomes: read.outcomes,
            events: [],
            changed: false,
          })
        : Option.none<Read>();
    }

    const reacted = react(compiled, view);

    return Option.some<Read>({
      context: read.context,
      baselines: Option.some(reacted.baselines),
      outcomes: [...read.outcomes, ...reacted.outcomes],
      events: reacted.events,
      changed,
    });
  };

  /**
   * The baselines a consumer starting from a record takes: the ones its record saved, a baseline a
   * defect kept included. A reaction whose slot's value differs is owed one wave; a reload of a
   * consistent saved world owes nothing.
   */
  const restoredBaselines = (actor: ActorId, record: ActorRecord) =>
    (tx.machines.get(actor.machine)?.[InternalsId].reactions ?? []).map((_, at) =>
      Option.map(record.baselines[at] ?? Option.none(), (b) => ({
        ...b,
        value: tx.env.admit(b.value),
      })),
    );

  return { bind, unbind, wave, settling, inputsOf, owes, restoredBaselines };
};

/**
 * Context binding and waves.
 */
export type ContextSteps = ReturnType<typeof makeContext>;
