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
  readonly save: (incarnation: Incarnation) => void;
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
          code: "Defect",
          slot: Option.some(value.failure),
        });
      else values.set(slot, value.success);
    }

    return { ...next, context: values };
  };

  // Each reaction's selection, reading each slot's value, or the value `last` says its reactions
  // last saw. A reaction that reads a slot whose last-seen value is unknown, or whose select
  // throws, has none.
  const selections = (
    compiled: Compiled,
    incarnation: Incarnation,
    // FLOW_STATE_ALLOW_UNKNOWN: a slot's last-seen value has the type its selector returns.
    last: ReadonlyMap<string, Option.Option<unknown>> = new Map(),
  ) =>
    compiled.reactions.map((reaction) => {
      const unknownRead = new Set<string>();
      const context = {};

      for (const [slot, value] of incarnation.context)
        Object.defineProperty(context, slot, {
          enumerable: true,
          get: () =>
            Option.getOrElse(last.get(slot) ?? Option.some(value), () => {
              unknownRead.add(slot);

              return value;
            }),
        });

      const selection = Result.try({
        try: () => reaction.select.run({ context, memory: incarnation.memory }),
        catch: () => reaction.select.slot,
      });

      return {
        selection,
        baseline: unknownRead.size > 0 ? Option.none() : Result.getSuccess(selection),
      };
    });

  const baselinesOf = (
    compiled: Compiled,
    incarnation: Incarnation,
    // FLOW_STATE_ALLOW_UNKNOWN: a slot's last-seen value has the type its selector returns.
    last: ReadonlyMap<string, Option.Option<unknown>> = new Map(),
  ) => selections(compiled, incarnation, last).map((s) => s.baseline);

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

  // Runs each reaction whose selection differs from its baseline, in declaration order: its
  // baseline becomes the selection and, when its `when` allows it, its event is kept to enqueue.
  // A callback that throws raises one issue of its reaction.
  const react = (compiled: Compiled, read: Incarnation) => {
    let next: Incarnation = read;
    const baselines = [...read.baselines];
    const events: Array<{ readonly tag: string; readonly payload: Values }> = [];

    for (const [at, reaction] of compiled.reactions.entries()) {
      const current = selections(compiled, next)[at]?.selection;

      if (current === undefined) continue;

      if (Result.isFailure(current)) {
        next = raise(next, {
          source: `onContext ${at}`,
          code: "Defect",
          slot: Option.some(current.failure),
        });
        continue;
      }

      const previous = baselines[at] ?? Option.none();

      if (Option.exists(previous, (p) => Equal.equals(p, current.success))) continue;
      baselines[at] = Option.some(current.success);

      const allowed = Option.match(reaction.when, {
        onNone: () => Result.succeed(true),
        onSome: (when) =>
          Result.try({
            try: () => when.run(current.success, Option.getOrUndefined(previous)),
            catch: () => when.slot,
          }),
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
            code: "Defect",
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

    return { next, baselines, events };
  };

  /**
   * Serves a context update: reads every provider again; when a slot changed, or a start from a
   * record still owes its reactions the values they missed, runs the reactions, each enqueuing its
   * event, in declaration order, when its selection changed and its `when` allows it. An equal
   * selection is silent. It publishes only a changed slot or issue.
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

    if (!changed && incarnation.stale.size === 0) {
      if (read.issues !== incarnation.issues) {
        keep(read);
        needs.publish(read);
      }

      return;
    }

    const { next, baselines, events } = react(compiled, read);
    const after = { ...next, baselines, stale: new Map() };
    needs.save(after);

    if (changed || after.issues !== incarnation.issues) needs.publish(after);

    // The reactions' events take the context update's place in the mailbox: they come before
    // the mail that was behind it.
    tx.enqueueFirst(events.map((event) => Mail.Event({ actor, ...event })));
  };

  /**
   * A consumer starting from a record that saved each slot's last-seen value: its context is its
   * providers' current one, and each slot whose saved value differs, or is unknown, stays owed to
   * its reactions, whose baselines read the saved values. A reload of a consistent saved world
   * owes nothing.
   */
  // FLOW_STATE_ALLOW_UNKNOWN: a slot's saved value, decoded from its record as JSON.
  const rebase = (incarnation: Incarnation, seen: ReadonlyMap<string, Option.Option<unknown>>) => {
    const compiled = tx.machines.get(incarnation.actor.machine);

    if (compiled === undefined) return incarnation;

    const stale = new Map(
      [...seen].filter(
        ([slot, last]) =>
          incarnation.context.has(slot) &&
          !Option.exists(last, (v) => Equal.equals(v, incarnation.context.get(slot))),
      ),
    );

    return { ...incarnation, stale, baselines: baselinesOf(compiled, incarnation, stale) };
  };

  return { bind, unbind, wave, settling, update, rebase };
};

/**
 * Context binding and waves.
 */
export type ContextSteps = ReturnType<typeof makeContext>;
