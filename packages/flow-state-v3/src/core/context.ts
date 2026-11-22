import { Equal, Option, Result } from "effect";
import { InternalsId, callSlot, type Compiled, type ContextRead, type Values } from "./compiled.ts";
import { sameValue } from "./same.ts";
import { type Selected, sameSlot, selectedOf } from "./slots.ts";
import { atOrBelow } from "./tree.ts";
import type { Tx } from "./tx.ts";
import {
  type ActorId,
  type ActorRecord,
  actorKey,
  type Incarnation,
  type StoredIssue,
  IssueSource,
  Mail,
  withIssue,
  withoutIssue,
  type Use,
  type Wiring,
} from "./world.ts";

/**
 * What context needs of incarnations: ensuring a provider with a use, releasing that use, and
 * publishing a changed incarnation.
 */
export type ContextNeeds = {
  readonly ensure: (actor: ActorId, use: Option.Option<Use>, wiring: Option.Option<Wiring>) => void;
  readonly release: (actor: ActorId, use: Use) => void;
  readonly publish: (incarnation: Incarnation) => void;
  readonly save: (incarnation: Incarnation) => void;
};

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

// Whether a slot's last selection was read from these very values: a select is pure (R19), and an
// immutable memory keeps an unchanged field's identity, so the same reads select it again.
// FLOW_STATE_ALLOW_UNKNOWN: each read has its field's or state's type.
const sameReads = (last: Selected, reads: ReadonlyArray<unknown>) =>
  Option.exists(last.reads, (r) => r.length === reads.length && r.every((v, i) => v === reads[i]));

// Whether a slot's select failed last time: only reading it again can clear its issue.
const failing = (consumer: Incarnation, slot: string) =>
  consumer.issues.some((i) => IssueSource.$is("Context")(i.source) && i.source.slot === slot);

// Whether a reaction owes its slot's value a comparison: its slot has a value it has not compared.
const differs = (baseline: Option.Option<Selected>, current: Option.Option<Selected>) =>
  Option.exists(current, (c) =>
    Option.match(baseline, {
      onNone: () => true,
      onSome: (b) => !sameValue(b.value, c.value),
    }),
  );

/**
 * Context binding and waves: a consumer binds each slot to one
 * provider for its life and holds a use of it; a provider's change enqueues one context update
 * per consumer; the update reads every provider's latest snapshot and runs the consumer's
 * `onContext` reactions, each enqueuing its event when its selection changed.
 */
export const makeContext = (tx: Tx, needs: ContextNeeds) => {
  const { incarnationOf } = tx;

  // An issue of a context source, replacing that source's earlier one; the same issue still open
  // is raised once, not at every wave. Context is not part of the record, so this writes nothing.
  const raise = (incarnation: Incarnation, issue: StoredIssue) => {
    const open = incarnation.issues.some(
      (i) =>
        Equal.equals(i.source, issue.source) &&
        i.code === issue.code &&
        Option.makeEquivalence(Equal.equals)(i.slot, issue.slot),
    );

    if (open) return incarnation;

    return withIssue(incarnation, tx.refuse(incarnation.actor, issue));
  };

  // A source that succeeds clears its own issue, never another source's.
  const clear = withoutIssue;

  const keep = (incarnation: Incarnation) => tx.putIncarnation(incarnation);

  // One slot's outcome: its selection taken, clearing its issue; or its selector's defect raised.
  const settle = (
    incarnation: Incarnation,
    slot: string,
    value: Result.Result<Selected, string>,
    values: Map<string, Selected>,
  ) => {
    if (Result.isSuccess(value)) {
      values.set(slot, value.success);

      return clear(incarnation, IssueSource.Context({ slot }));
    }

    return raise(incarnation, {
      source: IssueSource.Context({ slot }),
      code: "Defect",
      slot: Option.some(value.failure),
    });
  };

  // Each slot's selection from its provider's current reads, through its Schema. A slot none of
  // whose reads changed keeps its selection and runs no select, unless its last select failed; a
  // select that throws, or returns what its Schema cannot encode, keeps the slot's last selection
  // and raises one issue.
  const selected = (compiled: Compiled, incarnation: Incarnation) => {
    let next: Incarnation = incarnation;
    // In declaration order, whatever order a record held them in.
    const values = new Map<string, Selected>();

    for (const [slot, declared] of compiled.context) {
      const last = incarnation.context.get(slot);

      if (last !== undefined) values.set(slot, last);

      const provider = Option.flatMap(Option.fromUndefinedOr(incarnation.bound.get(slot)), (id) =>
        Option.fromUndefinedOr(incarnationOf(id)),
      );

      if (Option.isNone(provider)) continue;

      const reads = declared.reads.map((read) => readOf(read, provider.value));

      if (last !== undefined && sameReads(last, reads) && !failing(incarnation, slot)) continue;

      const named = Object.fromEntries(declared.reads.map((read, i) => [read.name, reads[i]]));

      const value = Result.flatMap(callSlot(declared.select, named), (raw) =>
        last !== undefined && Option.exists(last.raw, (r) => r === raw)
          ? Result.succeed({ ...last, reads: Option.some(reads) })
          : Result.mapBoth(selectedOf(declared.walk, raw), {
              onFailure: () => declared.select.slot,
              onSuccess: (selected) => ({
                ...selected,
                value: tx.env.admit(selected.value),
                reads: Option.some(reads),
              }),
            }),
      );

      next = settle(next, slot, value, values);
    }

    return { ...next, context: values };
  };

  // Each reaction's baseline as it starts: its slot's value, silently; none for a slot whose select
  // failed, whose first value is then a change.
  const baselinesOf = (compiled: Compiled, incarnation: Incarnation) =>
    compiled[InternalsId].reactions.map((reaction) =>
      Option.fromUndefinedOr(incarnation.context.get(reaction.slot)),
    );

  /**
   * Whether a consumer's reactions owe a comparison: one's slot has a value it has not compared.
   */
  const owes = (incarnation: Incarnation) => {
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
   * in the graph, and sets the silent baselines of its context and reactions.
   */
  const bind = (
    incarnation: Incarnation,
    wiring: ReadonlyMap<string, ActorId>,
    graph: Option.Option<Wiring>,
  ) => {
    const compiled = tx.machines.get(incarnation.actor.machine);

    if (compiled === undefined || compiled.context.size === 0) return incarnation;

    const bound = new Map<string, ActorId>();

    for (const slot of compiled.context.keys()) {
      const provider = wiring.get(slot);

      if (provider !== undefined) {
        needs.ensure(provider, Option.some("context"), graph);
        bound.set(slot, provider);
      }
    }

    const withValues = selected(compiled, { ...incarnation, bound });

    return { ...withValues, baselines: baselinesOf(compiled, withValues) };
  };

  /**
   * Releases the uses an ending consumer holds of its providers.
   */
  const unbind = (incarnation: Incarnation) => {
    for (const provider of incarnation.bound.values()) needs.release(provider, "context");
  };

  /**
   * A provider changed: each live consumer bound to it gets one context update, unless one already
   * waits in its mailbox, which the wave joins.
   */
  const wave = (provider: ActorId) => {
    for (const consumer of tx.consumersOf(provider)) {
      const waiting = (tx.world().mail.get(actorKey(consumer.actor)) ?? []).some(
        Mail.$is("Context"),
      );

      if (!waiting) tx.enqueue(Mail.Context({ actor: consumer.actor, chain: tx.chainNow() }));
      else tx.joinWave(consumer.actor);
    }
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
        const result = tx.world().mail.has(key) || busy(provider);
        judged.set(key, result);

        return result;
      });

    return busy(actor);
  };

  // Runs each reaction whose slot's value differs from its baseline, in declaration order:
  // its baseline becomes the value and, when its `when` allows it, its event is kept to enqueue. An
  // equal value is silent; a first value after none (a select that failed at the start) is a
  // change, which `when` judges with no previous value. A when or mapper that throws raises one
  // issue of its reaction and keeps its baseline.
  const react = (compiled: Compiled, read: Incarnation) => {
    let next: Incarnation = read;

    const baselines = compiled[InternalsId].reactions.map(
      (_, at) => read.baselines[at] ?? Option.none(),
    );

    const events: Array<{ readonly tag: string; readonly payload: Values }> = [];

    for (const [at, reaction] of compiled[InternalsId].reactions.entries()) {
      const current = read.context.get(reaction.slot);
      const previous = baselines[at] ?? Option.none();

      if (current === undefined) continue;

      if (Option.exists(previous, (p) => sameValue(p.value, current.value))) {
        baselines[at] = Option.some(current);
        next = clear(next, IssueSource.OnContext({ at }));
        continue;
      }

      const allowed = Option.match(reaction.when, {
        onNone: () => Result.succeed(true),
        onSome: (when) =>
          callSlot(
            when,
            current.value,
            Option.getOrUndefined(Option.map(previous, (p) => p.value)),
            {
              memory: read.memory,
            },
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
          next = raise(next, {
            source: IssueSource.OnContext({ at }),
            code: "Defect",
            slot: Option.some(slot),
          });
        },
        // A changed value becomes the baseline even when `when` declines; a defect keeps it.
        onSuccess: (given) => {
          baselines[at] = Option.some(current);
          next = clear(next, IssueSource.OnContext({ at }));

          if (Option.isSome(given))
            events.push({ tag: reaction.event.event, payload: given.value });
        },
      });
    }

    return { next, baselines, events };
  };

  // A context update that changed no slot's value and owes no comparison: a select that ran for an
  // equal value still keeps its new reads, so the next turn that changes none of them runs no
  // select; only a changed issue is published.
  const quiet = (incarnation: Incarnation, read: Incarnation) => {
    const reselected = [...read.context].some(([slot, s]) => incarnation.context.get(slot) !== s);
    const raised = read.issues !== incarnation.issues;

    if (reselected || raised) keep(read);

    if (raised) needs.publish(read);
  };

  /**
   * Serves a context update: reads every provider again; when a slot changed, or a reaction owes
   * its slot's value a comparison (a return's one wave),
   * runs the reactions, each enqueuing its event, in declaration order, when its slot's value
   * changed and its `when` allows it. An equal value is silent. It publishes only a changed slot or
   * issue.
   */
  const update = (actor: ActorId) => {
    const incarnation = incarnationOf(actor);
    const compiled = tx.machines.get(actor.machine);

    if (incarnation === undefined || compiled === undefined) return;

    const read = selected(compiled, incarnation);

    const changed = [...compiled.context.keys()].some(
      (slot) =>
        !sameSlot(
          Option.fromUndefinedOr(incarnation.context.get(slot)),
          Option.fromUndefinedOr(read.context.get(slot)),
        ),
    );

    if (!changed && !owes(read)) {
      quiet(incarnation, read);

      return;
    }

    const { next, baselines, events } = react(compiled, read);
    const after = { ...next, baselines };
    needs.save(after);

    if (changed || after.issues !== incarnation.issues) needs.publish(after);

    // The reactions' events take the context update's place in the mailbox: they come before
    // the mail that was behind it.
    tx.enqueueFirst(events.map((event) => Mail.Event({ actor, ...event, chain: tx.chainNow() })));
  };

  /**
   * A consumer starting from a record: its context is its providers' current one, and each
   * reaction's baseline is the one its record saved, a baseline a defect kept included. A reaction
   * whose slot's value differs is owed one wave; a reload of a consistent saved world owes nothing.
   */
  const restore = (incarnation: Incarnation, record: ActorRecord) => {
    const compiled = tx.machines.get(incarnation.actor.machine);

    if (compiled === undefined) return incarnation;

    const baselines = compiled[InternalsId].reactions.map((_, at) =>
      Option.map(record.baselines[at] ?? Option.none(), (b) => ({
        ...b,
        value: tx.env.admit(b.value),
      })),
    );

    return { ...incarnation, baselines };
  };

  return { bind, unbind, wave, settling, update, owes, restore };
};
