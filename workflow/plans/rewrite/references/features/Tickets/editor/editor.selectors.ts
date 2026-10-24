// The editor's view model: the facts its UI needs, read from one captured snapshot.
// Shared by TicketPanel and tests; it starts no work and never re-reads live truth.
import { can, type ActorSnapshot } from "flow-state";
import { Editor } from "./editor.definition.js";
import type { EditorMachine } from "./editor.machine.js";

export function editorView(snapshot: ActorSnapshot<typeof EditorMachine>) {
  const ref = { workspaceId: snapshot.memory.workspaceId, ticketId: snapshot.memory.ticketId };
  const ticket = snapshot.O.ticketById.getState(ref);
  const progress = snapshot.O.technicianUpdates.getState(ref);
  const saveCheck = can(snapshot, Editor.E.SaveRequested(), { explain: true });

  return {
    // The machine already knows the UI phase; components read states, not operation lanes.
    closed: Editor.S.CLOSED.is(snapshot),
    saving: Editor.S.OPEN.SAVING.is(snapshot),
    saved: Editor.S.OPEN.SAVED.is(snapshot),
    locked: Editor.S.OPEN.LOCKED.is(snapshot),
    draft: snapshot.memory.draft,
    error: snapshot.memory.error, // Save failures, already translated by the machine.
    blockedBy: saveCheck.allowed ? null : (saveCheck.denied[0]?.code ?? null),

    // Cached ticket data is kept while refreshing and after a failed refresh.
    ticket: "data" in ticket ? ticket.data : undefined,
    loading: ticket._tag === "Missing" || ticket._tag === "Pending",
    loadFailed: ticket._tag === "Failure" || ticket._tag === "Defect",

    // The one operation lane the UI must surface honestly: a save that may have landed.
    maybeSaved: snapshot.O.saveTitle.getState(ref)._tag === "Unknown",
    stage: progress.hasValue ? progress.latest.stage : null,
  };
}
