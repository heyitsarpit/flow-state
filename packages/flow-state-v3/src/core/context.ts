import { Equal, Option, Predicate, Result } from "effect";
import type { Compiled, Values } from "./compiled.ts";
import { Act } from "./evidence-of.ts";
import { sameValue } from "./same.ts";
import { type Frame, type Selected, sameSlot, selectedOf, type Source } from "./slots.ts";
import type { Tx } from "./tx.ts";
import {
  type ActorId,
  type ActorRecord,
  actorKey,
  type Incarnation,
  type Issue,
  Mail,
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

  // An issue of a context source, replacing that source's earlier one; the same issue still open
  // is raised once, not at every wave. Context is not part of the record, so this writes nothing.
  const raise = (incarnation: Incarnation, issue: Issue) => {
    const open = incarnation.issues.some(
      (i) =>
        i.source === issue.source &&
        i.code === issue.code &&
        Option.makeEquivalence(Equal.equals)(i.slot, issue.slot),
    );

    if (open) return incarnation;

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

  // A source that succeeds clears its own issue, never another source's.
  const clear = (incarnation: Incarnation, source: string) =>
    incarnation.issues.some((i) => i.source === source)
      ? { ...incarnation, issues: incarnation.issues.filter((i) => i.source !== source) }
      : incarnation;

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

      return clear(incarnation, `context ${slot}`);
    }

    return raise(incarnation, {
      source: `context ${slot}`,
      code: "Defect",
      slot: Option.some(value.failure),
    });
  };

  // Each slot's selection from its provider's current snapshot, through its Schema; a selector that
  // throws, or returns what its Schema cannot encode, keeps the slot's last selection and raises one
  // issue.
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

      const providing = Option.flatMap(provider, (p) =>
        Option.fromUndefinedOr(tx.machines.get(p.actor.machine)),
      );

      if (Option.isNone(provider) || Option.isNone(providing)) continue;

      const value = Result.flatMap(
        Result.try({
          try: () => declared.select.run(outsideOf(providing.value, provider.value)),
          catch: () => declared.select.slot,
        }),
        (raw) =>
          last !== undefined && Option.exists(last.raw, (r) => r === raw)
            ? Result.succeed(last)
            : Result.mapBoth(selectedOf(declared.walk, raw), {
                onFailure: () => declared.select.slot,
                onSuccess: (selected) => ({
                  ...selected,
                  value: tx.env.admit(selected.value),
                }),
              }),
      );

      next = settle(next, slot, value, values);
    }

    return { ...next, context: values };
  };

  // A reaction's selection over these slots and memory, with the inputs it read: the context and
  // memory it is handed record each slot and field read, so its baseline can be read again from
  // them after a reload.
  const selectionOf = (
    compiled: Compiled,
    reaction: Compiled["reactions"][number],
    slots: ReadonlyMap<string, Option.Option<Selected>>,
    memory: Values,
  ) => {
    const readSlots = new Map<string, Option.Option<Selected>>();
    // FLOW_STATE_ALLOW_UNKNOWN: a memory field has its field Schema's type.
    const readFields = new Map<string, unknown>();

    const present = Object.fromEntries(
      [...slots].flatMap(([slot, s]) => Option.toArray(Option.map(s, (v) => [slot, v.value]))),
    );

    // A slot asked for by `in` or listed by its keys is read as well: its presence is an input.
    const context = new Proxy(present, {
      has: (target, key) => {
        if (Predicate.isString(key) && compiled.context.has(key))
          readSlots.set(key, slots.get(key) ?? Option.none());

        return key in target;
      },
      getOwnPropertyDescriptor: (target, key) => {
        if (Predicate.isString(key) && compiled.context.has(key))
          readSlots.set(key, slots.get(key) ?? Option.none());

        return Reflect.getOwnPropertyDescriptor(target, key);
      },
      ownKeys: (target) => {
        for (const slot of compiled.context.keys())
          readSlots.set(slot, slots.get(slot) ?? Option.none());

        return Reflect.ownKeys(target);
      },
      get: (target, key) => {
        if (!Predicate.isString(key)) return undefined;

        if (compiled.context.has(key)) readSlots.set(key, slots.get(key) ?? Option.none());

        return target[key];
      },
    });

    const fields = new Proxy(memory, {
      get: (target, key) => {
        if (!Predicate.isString(key)) return undefined;

        if (Object.hasOwn(target, key)) readFields.set(key, target[key]);

        return target[key];
      },
    });

    const selection = Result.try({
      try: () => reaction.select.run({ context, memory: fields }),
      catch: () => reaction.select.slot,
    });

    return Result.map(selection, (value) => ({
      selection: value,
      frame: { slots: readSlots, memory: readFields, source: memory } satisfies Frame,
    }));
  };

  // Each slot's current selection, none for one never selected.
  const slotsOf = (compiled: Compiled, incarnation: Incarnation) =>
    new Map(
      [...compiled.context.keys()].map((slot) => [
        slot,
        Option.fromUndefinedOr(incarnation.context.get(slot)),
      ]),
    );

  const baselinesOf = (compiled: Compiled, incarnation: Incarnation) => {
    const slots = slotsOf(compiled, incarnation);

    return compiled.reactions.map((reaction) =>
      Result.getSuccess(selectionOf(compiled, reaction, slots, incarnation.memory)),
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
   * waits in its mailbox.
   */
  const wave = (provider: ActorId) => {
    for (const consumer of tx.consumersOf(provider)) {
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
  // An equal selection keeps its baseline, read from the new inputs. A select, when or mapper that
  // throws raises one issue of its reaction and keeps its baseline.
  const react = (compiled: Compiled, read: Incarnation) => {
    let next: Incarnation = read;
    const baselines = [...read.baselines];
    const events: Array<{ readonly tag: string; readonly payload: Values }> = [];
    const slots = slotsOf(compiled, read);

    for (const [at, reaction] of compiled.reactions.entries()) {
      const previous = baselines[at] ?? Option.none();

      const current = Result.flatMap(selectionOf(compiled, reaction, slots, read.memory), (now) =>
        Result.try({
          try: () => ({
            now,
            equal: Option.exists(previous, (p) => sameValue(p.selection, now.selection)),
          }),
          catch: () => reaction.select.slot,
        }),
      );

      if (Result.isFailure(current)) {
        next = raise(next, {
          source: `onContext ${at}`,
          code: "Defect",
          slot: Option.some(current.failure),
        });
        continue;
      }

      const { now, equal } = current.success;

      if (equal) {
        baselines[at] = Option.some(now);
        next = clear(next, `onContext ${at}`);
        continue;
      }

      const allowed = Option.match(reaction.when, {
        onNone: () => Result.succeed(true),
        onSome: (when) =>
          Result.try({
            try: () =>
              when.run(
                now.selection,
                Option.getOrUndefined(Option.map(previous, (p) => p.selection)),
              ),
            catch: () => when.slot,
          }),
      });

      const payload = Result.flatMap(allowed, (yes) =>
        Option.match(reaction.event.from, {
          onNone: () => Result.succeed(Option.some<Values>({})),
          onSome: (from) =>
            Result.try({
              try: () => Option.some(from.run(now.selection)),
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
        // A changed selection becomes the baseline even when `when` declines; a defect keeps it.
        onSuccess: (given) => {
          baselines[at] = Option.some(now);
          next = clear(next, `onContext ${at}`);
          Option.match(given, {
            onNone: () => undefined,
            onSome: (p) => void events.push({ tag: reaction.event.event, payload: p }),
          });
        },
      });
    }

    return { next, baselines, events };
  };

  /**
   * Serves a context update: reads every provider again; when a slot changed, or a start from a
   * record still owes its reactions the selections they missed, runs the reactions, each enqueuing
   * its event, in declaration order, when its selection changed and its `when` allows it. An equal
   * selection is silent. It publishes only a changed slot or issue.
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
   * A consumer starting from a record: its context is its providers' current one, and each slot
   * whose saved selection differs stays owed to its reactions. Each reaction's baseline is read
   * again from the inputs it was last read from, so a reload restores what it last saw, a kept
   * baseline included. A reload of a consistent saved world owes nothing.
   */
  const restore = (incarnation: Incarnation, record: ActorRecord) => {
    const compiled = tx.machines.get(incarnation.actor.machine);

    if (compiled === undefined) return incarnation;

    const stale = new Map(
      [...incarnation.bound.keys()].flatMap((slot) => {
        const last = Option.fromUndefinedOr(record.seen.get(slot));

        return sameSlot(last, Option.fromUndefinedOr(incarnation.context.get(slot)))
          ? []
          : [[slot, last] as const];
      }),
    );

    const seen = new Map(
      [...compiled.context.keys()].map((slot) => [
        slot,
        Option.fromUndefinedOr(record.seen.get(slot)),
      ]),
    );

    // Baselines read from one saved copy read one memory object, so a save shares it again.
    const memories = new Map<Source, Values>();

    const memoryOf = (frame: Frame) => {
      const known = memories.get(frame.source);

      if (known !== undefined) return known;

      const memory =
        frame.memory.size === 0
          ? record.memory
          : { ...record.memory, ...Object.fromEntries(frame.memory) };

      memories.set(frame.source, memory);

      return memory;
    };

    const baselines = compiled.reactions.map((reaction, at) =>
      Option.flatMap(record.frames[at] ?? Option.none(), (frame) =>
        Result.getSuccess(
          selectionOf(compiled, reaction, new Map([...seen, ...frame.slots]), memoryOf(frame)),
        ),
      ),
    );

    return { ...incarnation, stale, baselines };
  };

  return { bind, unbind, wave, settling, update, restore };
};

/**
 * Context binding and waves.
 */
export type ContextSteps = ReturnType<typeof makeContext>;
