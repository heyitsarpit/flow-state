import { type Data, Equal, Option, Result } from "effect";
import {
  callSlot,
  type Operation,
  type Placement as Placing,
  type Previous,
  type Values,
} from "./compiled.ts";
import {
  Cue,
  type Entry,
  type EntryKey,
  entryKeyOf,
  type Holder,
  Placement,
  ReadEnding,
  withOne,
} from "./entry-view.ts";
import { Origin } from "./ledger.ts";
import type { Tx } from "./tx.ts";
import type { ActorId, Incarnation, OwnedBy } from "./world.ts";

/**
 * A placement holding its entry, with its holder.
 */
export type Placed = {
  readonly h: Holder;
  readonly placed: Data.TaggedEnum.Value<Placement, "Placed">;
};

/**
 * What the placements need of the entry table: its holds and holders, an entry made for a new
 * hold, a cue applied, a row owed, and the key text an input names.
 */
export type PlacementParts = {
  readonly hold: (key: EntryKey, h: Holder, held: boolean) => void;
  readonly holdersOf: (key: EntryKey) => ReadonlyMap<string, Holder>;
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
    origin: Origin,
  ) => void;
  readonly keyOf: (operation: Operation, input: Values) => Option.Option<string>;
};

/**
 * The placements of the entry table, the only writer of `placements`: a placement is placed at
 * its select's key, kept at its last key when the select names none, shown its entry's data, and
 * left.
 */
export const makeEntryPlacements = (tx: Tx, parts: PlacementParts) => {
  const { hold, holdersOf, held, apply, owe, keyOf } = parts;

  /**
   * A holder's placement, if it has one.
   */
  const placementOf = (h: Holder) =>
    Option.fromUndefinedOr(tx.world().placements.get(h.life)?.get(h.operation));

  const setPlacement = (h: Holder, placement: Option.Option<Placement>) => {
    const placements = withOne(
      tx.world().placements.get(h.life) ?? new Map<string, Placement>(),
      h,
      placement,
    );

    if (placements.size === 0) tx.drop("placements", h.life);
    else tx.put("placements", h.life, placements);
  };

  /**
   * The placements that hold an entry.
   */
  const placedOn = (key: EntryKey) =>
    [...holdersOf(key).values()].flatMap((h) =>
      Option.toArray(
        Option.map(
          Option.filter(
            Option.filter(placementOf(h), Placement.$is("Placed")),
            (p) => p.entry === key,
          ),
          (placed) => ({ h, placed }),
        ),
      ),
    );

  /**
   * Show: each placement of an entry is owed its confirmed data once that differs, by
   * `Equal.equals`, from what it was last owed; an optimistic value never shows.
   */
  const show = (key: EntryKey, entry: Entry) => {
    for (const data of Option.toArray(entry.data))
      for (const { h, placed } of placedOn(key))
        if (!Option.exists(placed.shown, (shown) => Equal.equals(shown, data.value))) {
          setPlacement(h, Option.some({ ...placed, shown: Option.some(data.value) }));
          owe(h, placed, entry, ReadEnding.Landed({ value: data.value }), Origin.Decided());
        }
  };

  // A placement's last key's input and data, for the next key's placeholder.
  const previousOf = (placement: Option.Option<Placement>) =>
    Option.flatMap(placement, (p) =>
      Placement.$match(p, {
        Placed: ({ entry }) =>
          Option.flatMap(Option.fromUndefinedOr(tx.world().entries.get(entry)), (e) =>
            Option.map(e.data, (d) => ({ input: e.key, data: d.value })),
          ),
        Unkeyed: ({ previous }) => previous,
        Left: ({ previous }) => previous,
      }),
    );

  // A new key's first look: its data when it has some, else the placement's placeholder, marked.
  const shownAt = (
    { h, placed }: Placed,
    key: EntryKey,
    placing: Placing,
    { previous, input }: { readonly previous: Option.Option<Previous>; readonly input: Values },
  ) => {
    const entry = tx.world().entries.get(key);

    if (entry === undefined) return;

    if (Option.isSome(entry.data)) return show(key, entry);

    for (const slot of Option.toArray(placing.placeholder)) {
      const given = callSlot(slot, { previous: Option.getOrUndefined(previous), input });

      if (Result.isSuccess(given) && given.success !== undefined)
        owe(h, placed, entry, ReadEnding.Landed({ value: given.success }), Origin.Placeholder());
    }
  };

  // A select that named no key: the last key is kept with the select's slot as its issue.
  const failed = (h: Holder, current: Option.Option<Placement>, slot: string) =>
    setPlacement(
      h,
      Option.some(
        Option.match(Option.filter(current, Placement.$is("Placed")), {
          onSome: (p) => ({ ...p, failed: Option.some(slot) }),
          onNone: () => Placement.Unkeyed({ failed: slot, previous: previousOf(current) }),
        }),
      ),
    );

  /**
   * A placement's select ran: a key places the read there (a new key leaves the old entry, holds
   * the new one, asks it by nobody, and shows its data, or the placeholder while it has none); a
   * select that threw, or a key its Schema refuses, keeps the last key with the select's issue.
   */
  const place = (
    incarnation: Incarnation,
    operation: Operation,
    placing: Placing,
    selected: Result.Result<Values, string>,
    owner: OwnedBy,
  ) => {
    const h = { life: incarnation.id, operation: operation.name };
    const current = placementOf(h);
    const input = Result.map(selected, (given) => tx.env.admit(given));

    const text = Result.flatMap(input, (i) =>
      Result.fromOption(keyOf(operation, i), () => placing.select.slot),
    );

    if (Result.isFailure(text) || Result.isFailure(input))
      return failed(h, current, Result.isFailure(text) ? text.failure : placing.select.slot);

    const key = entryKeyOf(operation.contract, text.success);
    const at = Option.filter(current, Placement.$is("Placed"));

    if (Option.isSome(at) && at.value.entry === key)
      return setPlacement(h, Option.some({ ...at.value, owner, failed: Option.none() }));

    const previous = previousOf(current);

    for (const p of Option.toArray(at)) hold(p.entry, h, false);

    held(key, incarnation, operation, input.success);

    const placed = Placement.Placed({
      entry: key,
      actor: incarnation.actor,
      owner,
      shown: Option.none(),
      failed: Option.none(),
    });

    setPlacement(h, Option.some(placed));
    hold(key, h, true);
    apply(key, Cue.Ask({ asker: Option.none(), refetch: false }));
    shownAt({ h, placed }, key, placing, { previous, input: input.success });
  };

  /**
   * A placement left: its hold goes, and its last key's input and data stay for the next one.
   */
  const unplace = (incarnation: Incarnation, operation: string) => {
    const h = { life: incarnation.id, operation };
    const current = placementOf(h);

    if (Option.isNone(current) || Placement.$is("Left")(current.value)) return;

    const previous = previousOf(current);

    for (const p of Option.toArray(Option.filter(current, Placement.$is("Placed"))))
      hold(p.entry, h, false);

    setPlacement(h, Option.some(Placement.Left({ previous })));
  };

  /**
   * The operations a life's placements hold or keep, placed or left.
   */
  const placementsOf = (incarnation: Incarnation) => [
    ...(tx.world().placements.get(incarnation.id)?.keys() ?? []),
  ];

  return { place, unplace, placementsOf, placementOf, placedOn, show };
};
