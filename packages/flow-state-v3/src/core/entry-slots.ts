import { Option } from "effect";
import type { Operation, Values } from "./compiled.ts";
import {
  type Asker,
  Cue,
  type Entry,
  type EntryKey,
  entryKeyOf,
  type Holder,
  ReadEnding,
  type ReadSlot,
  viewOf,
  withOne,
} from "./entry-view.ts";
import { Act } from "./evidence-of.ts";
import { type LedgerSteps, Route } from "./ledger.ts";
import type { Tx } from "./tx.ts";
import type { ActorId, Incarnation, OwnedBy } from "./world.ts";

/**
 * What the slots need of the entry table: its holds and holders, an entry made for a new hold, a
 * cue applied, a row owed, and the key text an input names.
 */
export type SlotParts = {
  readonly holdersOf: (key: EntryKey) => ReadonlyMap<string, Holder>;
  readonly hold: (key: EntryKey, h: Holder, held: boolean) => void;
  readonly held: (
    key: EntryKey,
    incarnation: Incarnation,
    operation: Operation,
    input: Values,
  ) => void;
  readonly apply: (key: EntryKey, cue: Cue) => void;
  readonly owe: (
    h: Holder,
    to: { readonly actor: ActorId; readonly owner: OwnedBy },
    entry: Entry,
    ending: ReadEnding,
  ) => void;
  readonly keyOf: (operation: Operation, input: Values) => Option.Option<string>;
};

/**
 * The read slots of the entry table, the only writer of `slots`: one wait per life and operation,
 * served, waiting or owed its entry's ending, made by a lookup and dropped by a cancel or an end.
 */
export const makeEntrySlots = (tx: Tx, ledger: LedgerSteps, parts: SlotParts) => {
  const { holdersOf, hold, held, apply, owe, keyOf } = parts;

  /**
   * A holder's slot, if it has one.
   */
  const slotOf = (h: Holder) =>
    Option.fromUndefinedOr(tx.world().slots.get(h.life)?.get(h.operation));

  const setSlot = (h: Holder, slot: Option.Option<ReadSlot>) => {
    const slots = withOne(tx.world().slots.get(h.life) ?? new Map<string, ReadSlot>(), h, slot);

    if (slots.size === 0) tx.drop("slots", h.life);
    else tx.put("slots", h.life, slots);
  };

  const waitersOf = (key: EntryKey) =>
    [...holdersOf(key).values()].flatMap((h) =>
      Option.toArray(
        Option.map(
          Option.filter(slotOf(h), (s) => s.waiting),
          (slot) => ({ h, slot }),
        ),
      ),
    );

  /**
   * Whether a slot of an entry waits for its request.
   */
  const waited = (key: EntryKey) => waitersOf(key).length > 0;

  /**
   * Serve: the asking slot is owed the data with each live update applied; no request.
   */
  const serve = (asker: Asker, entry: Entry) => {
    for (const { h, slot } of Option.toArray(asker))
      for (const data of Option.toArray(entry.data))
        owe(h, slot, entry, ReadEnding.Landed({ value: viewOf(entry, data.value) }));
  };

  /**
   * The asking slot waits for the entry's request.
   */
  const wait = (asker: Asker) => {
    for (const { h, slot } of Option.toArray(asker))
      setSlot(h, Option.some({ ...slot, waiting: true }));
  };

  /**
   * Owe: every waiting slot of an entry is owed the ending once, and waits no more.
   */
  const oweWaiters = (key: EntryKey, entry: Entry, ending: ReadEnding) => {
    for (const { h, slot } of waitersOf(key)) {
      setSlot(h, Option.some({ ...slot, waiting: false }));
      owe(h, slot, entry, ending);
    }
  };

  // The input a lookup's Schema refuses: one Defect row and its evidence, nothing asked.
  const refused = (incarnation: Incarnation, operation: string, input: Values, owner: OwnedBy) => {
    tx.act(Act.InvalidInput({ actor: incarnation.actor, operation }));
    ledger.owe({
      actor: incarnation.actor,
      life: Option.some(incarnation.id),
      operation,
      input: Option.some(input),
      attempt: Option.none(),
      lane: Option.none(),
      channel: "failure",
      reason: "Defect",
      value: undefined,
      route: Route.From({ owner }),
    });
  };

  /**
   * A lookup through a life's slot: its input checked by the operation's Schema, its entry made if
   * absent and held by the slot, then asked. A slot on another entry ends its old wait as
   * superseded and leaves it; an ask through a slot that already waits keeps its one wait.
   */
  const lookup = (
    incarnation: Incarnation,
    operation: Operation,
    given: Values,
    owner: OwnedBy,
  ) => {
    const input = tx.env.admit(given);

    const text = keyOf(operation, input);

    if (Option.isNone(text)) return refused(incarnation, operation.name, input, owner);

    const key = entryKeyOf(operation.contract, text.value);
    const h = { life: incarnation.id, operation: operation.name };

    for (const slot of Option.toArray(slotOf(h))) {
      if (slot.waiting) tx.act(Act.ReadReplaced({ operation: operation.name }));

      if (slot.entry !== key) hold(slot.entry, h, false);
    }

    const slot = { entry: key, actor: incarnation.actor, owner, waiting: false };

    held(key, incarnation, operation, input);
    setSlot(h, Option.some(slot));
    hold(key, h, true);
    apply(key, Cue.Ask({ asker: Option.some({ h, slot }), refetch: false }));
  };

  /**
   * A read's cancel: its slot is dropped with no row.
   */
  const cancel = (incarnation: Incarnation, operation: string) => {
    const h = { life: incarnation.id, operation };

    for (const slot of Option.toArray(slotOf(h))) {
      setSlot(h, Option.none());
      hold(slot.entry, h, false);
    }
  };

  /**
   * A life ended: each of its slots is dropped with no row.
   */
  const end = (incarnation: Incarnation) => {
    for (const operation of Array.from(tx.world().slots.get(incarnation.id)?.keys() ?? []))
      cancel(incarnation, operation);
  };

  return { slotOf, waited, serve, wait, oweWaiters, lookup, cancel, end };
};
