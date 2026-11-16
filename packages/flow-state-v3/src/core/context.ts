import { Equal, Option, Result } from "effect";
import type { Compiled, Values } from "./compiled.ts";
import { Act } from "./evidence-of.ts";
import { type Tx, withEntry } from "./tx.ts";
import { type ActorId, actorKey, type Incarnation, type Issue, Mail, type Use } from "./world.ts";

/**
 * What context needs of incarnations: ensuring a provider with a use, releasing that use, and
 * publishing a changed incarnation.
 */
export type ContextNeeds = {
  readonly ensure: (actor: ActorId, use: Option.Option<Use>) => void;
  readonly release: (actor: ActorId, use: Use) => void;
  readonly publish: (incarnation: Incarnation) => void;
};

// An actor's outside snapshot, as a provider's selector reads it: its leaf and memory without its
// Flow.private fields.
const outsideOf = (compiled: Compiled, incarnation: Incarnation) => {
  const hidden = new Set(compiled.fields.filter((f) => f.private).map((f) => f.name));

  return {
    state: incarnation.state,
    memory: Object.fromEntries(
      Object.entries(incarnation.memory).filter(([name]) => !hidden.has(name)),
    ),
  };
};

/**
 * Context binding and waves: a consumer binds each slot to one
 * provider for its life and holds a use of it; a provider's change enqueues one context update
 * per consumer; the update reads every provider's latest snapshot and runs the consumer's
 * `onContext` reactions, each enqueuing its event when its selection changed.
 */
export const makeContext = (tx: Tx, needs: ContextNeeds) => {
  const { incarnationOf } = tx;

  // An issue of a context source, replacing that source's earlier one; context is not part of the
  // record, so this writes nothing.
  const raise = (incarnation: Incarnation, issue: Issue) => {
    tx.act(
      Act.Refused({
        code: issue.code,
        actor: incarnation.actor,
        ending: Option.none(),
        source: issue.source,
        slot: issue.slot,
      }),
    );

    return {
      ...incarnation,
      issues: [...incarnation.issues.filter((i) => i.source !== issue.source), issue],
    };
  };

  const keep = (incarnation: Incarnation) =>
    tx.set({
      ...tx.world(),
      incarnations: withEntry(tx.world().incarnations, actorKey(incarnation.actor), incarnation),
    });

  // Each slot's value from its provider's current snapshot; a selector that throws keeps the
  // slot's last value and raises one issue.
  const selected = (compiled: Compiled, incarnation: Incarnation) => {
    let next: Incarnation = incarnation;
    const values = new Map(incarnation.context);

    for (const [slot, declared] of compiled.context) {
      const provider = Option.flatMap(Option.fromUndefinedOr(incarnation.bound.get(slot)), (id) =>
        Option.fromUndefinedOr(incarnationOf(id)),
      );

      const providing = Option.flatMap(provider, (p) =>
        Option.fromUndefinedOr(tx.machines.get(p.actor.machine)),
      );

      if (Option.isNone(provider) || Option.isNone(providing)) continue;

      const value = Result.try({
        try: () => declared.select.run(outsideOf(providing.value, provider.value)),
        catch: () => declared.select.slot,
      });

      if (Result.isFailure(value))
        next = raise(next, {
          source: `context ${slot}`,
          code: "CallbackDefect",
          slot: Option.some(value.failure),
        });
      else values.set(slot, value.success);
    }

    return { ...next, context: values };
  };

  const contextValues = (incarnation: Incarnation) => Object.fromEntries(incarnation.context);

  // Each reaction's selection now; a select that throws raises one issue and keeps its baseline.
  const selections = (compiled: Compiled, incarnation: Incarnation) =>
    compiled.reactions.map((reaction) =>
      Result.try({
        try: () =>
          reaction.select.run({ context: contextValues(incarnation), memory: incarnation.memory }),
        catch: () => reaction.select.slot,
      }),
    );

  /**
   * Binds a starting consumer's slots to their providers, ensuring each with a use, and sets the
   * silent baselines of its context and reactions.
   */
  const bind = (incarnation: Incarnation, wiring: ReadonlyMap<string, ActorId>) => {
    const compiled = tx.machines.get(incarnation.actor.machine);

    if (compiled === undefined || compiled.context.size === 0) return incarnation;

    const bound = new Map<string, ActorId>();

    for (const slot of compiled.context.keys()) {
      const provider = wiring.get(slot);

      if (provider !== undefined) {
        needs.ensure(provider, Option.some("context"));
        bound.set(slot, provider);
      }
    }

    const withValues = selected(compiled, { ...incarnation, bound });

    return {
      ...withValues,
      baselines: selections(compiled, withValues).map((s) => Result.getOrUndefined(s)),
    };
  };

  /**
   * Releases the uses an ending consumer holds of its providers.
   */
  const unbind = (incarnation: Incarnation) => {
    for (const provider of incarnation.bound.values()) needs.release(provider, "context");
  };

  /**
   * A provider changed: each live consumer bound to it gets one context update, unless one already
   * waits in its mailbox.
   */
  const wave = (provider: ActorId) => {
    for (const consumer of tx.world().incarnations.values())
      if ([...consumer.bound.values()].some((p) => actorKey(p) === actorKey(provider))) {
        const waiting = (tx.world().mail.get(actorKey(consumer.actor)) ?? []).some(
          Mail.$is("Context"),
        );

        if (!waiting) tx.enqueue(Mail.Context({ actor: consumer.actor }));
      }
  };

  /**
   * Serves a context update: reads every provider again; when a slot changed, publishes the new
   * context and runs the reactions, each enqueuing its event, in declaration order, when its
   * selection changed and its `when` allows it. An equal selection is silent.
   */
  const update = (actor: ActorId) => {
    const incarnation = incarnationOf(actor);
    const compiled = tx.machines.get(actor.machine);

    if (incarnation === undefined || compiled === undefined) return;

    const read = selected(compiled, incarnation);

    const changed = [...read.context].some(
      ([slot, value]) =>
        !incarnation.context.has(slot) || !Equal.equals(incarnation.context.get(slot), value),
    );

    if (!changed) {
      if (read.issues !== incarnation.issues) {
        keep(read);
        needs.publish(read);
      }

      return;
    }

    let next: Incarnation = read;
    const baselines = [...read.baselines];
    const events: Array<{ readonly tag: string; readonly payload: Values }> = [];

    for (const [at, reaction] of compiled.reactions.entries()) {
      const current = selections(compiled, next)[at];

      if (current === undefined) continue;

      if (Result.isFailure(current)) {
        next = raise(next, {
          source: `onContext ${at}`,
          code: "CallbackDefect",
          slot: Option.some(current.failure),
        });
        continue;
      }

      const previous = baselines[at];

      if (Equal.equals(previous, current.success)) continue;
      baselines[at] = current.success;

      const allowed = Option.match(reaction.when, {
        onNone: () => Result.succeed(true),
        onSome: (when) =>
          Result.try({ try: () => when.run(current.success, previous), catch: () => when.slot }),
      });

      const payload = Result.flatMap(allowed, (yes) =>
        Option.match(reaction.event.from, {
          onNone: () => Result.succeed(Option.some<Values>({})),
          onSome: (from) =>
            Result.try({
              try: () => Option.some(from.run(current.success)),
              catch: () => from.slot,
            }),
        }).pipe(Result.map((p) => (yes ? p : Option.none<Values>()))),
      );

      Result.match(payload, {
        onFailure: (slot) => {
          next = raise(next, {
            source: `onContext ${at}`,
            code: "CallbackDefect",
            slot: Option.some(slot),
          });
        },
        onSuccess: (given) =>
          Option.match(given, {
            onNone: () => undefined,
            onSome: (p) => void events.push({ tag: reaction.event.event, payload: p }),
          }),
      });
    }

    const after = { ...next, baselines };
    keep(after);
    needs.publish(after);

    for (const event of events) tx.enqueue(Mail.Event({ actor, ...event }));
  };

  return { bind, unbind, wave, update };
};

/**
 * Context binding and waves.
 */
export type ContextSteps = ReturnType<typeof makeContext>;
