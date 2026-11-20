// The merge dialog over the roster: the `ConfirmMerge` subroutine's memory, read at its state's name, and its
// events sent through the host (rule 2). The tickets each customer holds are the host's read, placed only while
// the dialog is open, one session per customer (`subscribe.each`).
import { check } from "flow-state";
import { type useActorByRef, useView } from "flow-state/react";
import { Roster } from "./roster.definition.js";

const { E, O } = Roster;

export function MergeCustomers({ roster }: { roster: ReturnType<typeof useActorByRef> }) {
  const dialog = useView(roster, (s) => s.memory.MERGING);
  // Ticket counts per customer in the dialog, from the reads its state placed.
  const counts = useView(roster, (s) =>
    s.memory.mergePair === null
      ? {}
      : Object.fromEntries(
          [s.memory.mergePair.first, s.memory.mergePair.second].map((customerId) => [
            customerId,
            O.mergedTickets.get(s, { workspaceId: s.memory.workspaceId, customerId })?.data?.length,
          ]),
        ),
  );
  const verdict = useView(roster, (s) => check(s, E.MERGING.Confirm()));

  if (dialog === undefined) return null;

  return (
    <dialog open aria-label="Merge customers">
      {[dialog.first, dialog.second].map((customerId) => (
        <label key={customerId}>
          <input
            type="radio"
            checked={dialog.survivorId === customerId}
            onChange={() => roster.send(E.MERGING.Pick({ survivorId: customerId }))}
          />
          Keep {customerId} ({counts[customerId] ?? "…"} tickets)
        </label>
      ))}
      <button
        disabled={verdict._tag !== "Allowed"}
        onClick={() => roster.send(E.MERGING.Confirm())}
      >
        Merge
      </button>
      <button onClick={() => roster.send(E.MERGING.Cancel())}>Cancel</button>
    </dialog>
  );
}
