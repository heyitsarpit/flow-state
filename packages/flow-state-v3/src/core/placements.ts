import { Option } from "effect";
import { type Change, PLACES } from "./change.ts";
import { callSlot, Operation, type Placement } from "./compiled.ts";
import type { EntrySteps } from "./entries.ts";
import { readsOf, scopeOf } from "./reads.ts";
import type { Tx } from "./tx.ts";
import { type Incarnation, OwnedBy } from "./world.ts";

/**
 * The placements' one decision: after a change to an incarnation, each read its active states
 * place is placed at the key its select reads on the committed view, and every other placement of
 * the life leaves.
 *
 * **Details**
 *
 * A state places a read while it is active, owned by that state's activation; when two active
 * states place one read, the deeper one's placement is the read's. An exit, a re-keyed select and
 * an end are all this one comparison: what the states place now against what the life holds.
 */
export const makePlacements = (tx: Tx, entries: EntrySteps) => {
  // Each read the incarnation's active states place, the deepest state's last, with its owner.
  const activeOf = (incarnation: Incarnation) => {
    const compiled = tx.machines.get(incarnation.actor.machine);
    const chain = compiled?.states.get(incarnation.state)?.chain ?? [];
    const active = new Map<string, { readonly placing: Placement; readonly owner: OwnedBy }>();

    for (const [depth, path] of chain.entries()) {
      const activation = incarnation.activations[depth];

      if (activation === undefined) continue;

      for (const placing of compiled?.states.get(path)?.placements ?? [])
        // oxlint-disable-next-line lint-bomb/no-allocation-in-loop -- one owner per placed read: the decision's record
        active.set(placing.operation, { placing, owner: OwnedBy.State({ activation }) });
    }

    return active;
  };

  // Places and unplaces the incarnation's reads by its states and its committed view.
  const placeAll = (incarnation: Incarnation) => {
    const active = activeOf(incarnation);

    for (const operation of entries.placementsOf(incarnation))
      if (!active.has(operation)) entries.unplace(incarnation, operation);

    if (active.size === 0) return;

    const view = readsOf(scopeOf(incarnation), "Place", {});
    const operations = tx.machines.get(incarnation.actor.machine)?.operations;

    for (const [name, { placing, owner }] of active)
      for (const read of Option.toArray(
        Option.filter(Option.fromUndefinedOr(operations?.get(name)), Operation.$is("Read")),
      ))
        entries.place(incarnation, read, placing, callSlot(placing.select, view), owner);
  };

  /**
   * After a change that moves the state or the committed view, the incarnation's placements
   * follow it; any other change places nothing.
   */
  const decide = (change: Change, written: Option.Option<Incarnation>) => {
    if (PLACES[change._tag])
      for (const incarnation of Option.toArray(written)) placeAll(incarnation);
  };

  return { decide };
};
