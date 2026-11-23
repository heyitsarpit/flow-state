import { Option } from "effect";
import { type Entry, Placement, ReadEnding, Request, viewOf } from "./entry-view.ts";
import { ReadRow } from "./rows.ts";
import { pick, type Machines } from "./tx.ts";
import type { Incarnation, World } from "./world.ts";

// An entry's row: its tag from its request, its data and its last ending, and what readers see.
const rowOf = (entry: Entry) => {
  const seen = {
    key: entry.key,
    data: Option.getOrUndefined(Option.map(entry.data, (d) => viewOf(entry, d.value))),
    predicted: entry.layers.length > 0,
  };

  const data = Option.isSome(entry.data);

  return Request.$match(entry.request, {
    Running: () => (data ? ReadRow.Refreshing(seen) : ReadRow.Pending(seen)),
    Idle: () =>
      Option.match(entry.last, {
        onNone: () => (data ? ReadRow.Ready(seen) : ReadRow.Pending(seen)),
        onSome: ReadEnding.$match({
          Landed: () => ReadRow.Ready(seen),
          Failed: ({ error }) => ReadRow.Failure({ ...seen, error }),
          Defect: () => ReadRow.Defect(seen),
          Interrupted: () => ReadRow.Interrupted(seen),
        }),
      }),
  });
};

/**
 * The entries an incarnation holds, by its slots and placements, each with the operation that
 * holds it.
 */
export const heldBy = (world: World, incarnation: Incarnation) => [
  ...[...(world.slots.get(incarnation.id) ?? [])].map(([operation, s]) => [operation, s.entry]),
  ...[...(world.placements.get(incarnation.id) ?? [])].flatMap(([operation, p]) =>
    Placement.$is("Placed")(p) ? [[operation, p.entry] as const] : [],
  ),
];

/**
 * The read rows an incarnation shows, by operation and key text: one per slot and per placement
 * that holds an entry, each its entry's row.
 */
export const readRowsOf = (world: World, machines: Machines, incarnation: Incarnation) => {
  const rows = new Map<string, ReadonlyMap<string, ReadRow>>();

  for (const [operation, key] of heldBy(world, incarnation))
    for (const entry of Option.toArray(Option.fromUndefinedOr(world.entries.get(key))))
      for (const op of Option.toArray(
        Option.fromUndefinedOr(machines.get(incarnation.actor.machine)?.operations.get(operation)),
      ))
        for (const text of Option.toArray(op.walk.keyText(pick(entry.key, op.keyFields))))
          rows.set(operation, new Map([[text, rowOf(entry)]]));

  return rows;
};
