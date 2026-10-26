// Feature UI depends on exact machines and refs supplied by its host, never on app setup.
import type { Actor, ActorRef } from "flow-state";
import { useActor, useActorByRef, useView } from "flow-state/react";
import type { SessionMachine } from "../../Session/session.machine.js";
import type { Ticket } from "../types.js";
import { Editor } from "./editor.definition.js";
import { EditorMachine } from "./editor.machine.js";
import { editorView } from "./editor.selectors.js";

const { E } = Editor;

// Containers obtain the actor; the panel only renders it, so both share one UI.

// A host-owned, durable editor (EditorRef in app/actors.ts).
export function PinnedTicket({ editorRef }: { editorRef: ActorRef<typeof EditorMachine> }) {
  const editor = useActorByRef(editorRef); // Lookup only: never ensures, leases or subscribes.

  return <TicketPanel editor={editor} />;
}

// A ticket opened from the queue: a component-owned local actor, keyed by the caller per ticket.
// It has no stable ref, so it passes its provider bindings itself (D11) and is not persisted.
export function OpenTicket({
  ticket,
  sessionRef,
}: {
  ticket: Ticket;
  sessionRef: ActorRef<typeof SessionMachine>;
}) {
  const editor = useActor(EditorMachine, {
    input: { workspaceId: ticket.workspaceId, ticketId: ticket.ticketId, title: ticket.title },
    contextBindings: { canEdit: sessionRef },
  });

  return <TicketPanel editor={editor} />;
}

type EditorViewModel = ReturnType<typeof editorView>;

type EditorActor = Actor<typeof EditorMachine>;

export function TicketPanel({ editor }: { editor: EditorActor }) {
  const view = useView(editor, editorView);

  if (view.loading) return <TicketSkeleton />;

  if (!view.ticket && view.loadFailed) {
    return (
      <Notice tone="error">
        This ticket could not be loaded.{" "}
        <button onClick={() => editor.send(E.RefreshRequested())}>Try again</button>
      </Notice>
    );
  }

  if (view.closed) {
    return (
      <section>
        <h2>{view.ticket?.title}</h2>
        <button onClick={() => editor.send(E.Reopen())}>Edit</button>
      </section>
    );
  }

  return (
    <section>
      <TicketHeader view={view} />
      <TitleField view={view} editor={editor} />
      <SaveControls view={view} editor={editor} />
      <SaveNotices view={view} editor={editor} />
    </section>
  );
}

function TicketHeader({ view }: { view: EditorViewModel }) {
  return (
    <header>
      <h2>{view.ticket?.title ?? view.draft}</h2>
      {view.stage && <span className="badge">Technician {view.stage}</span>}
      {view.ticket && view.loadFailed && <span className="muted">Showing last loaded copy</span>}
    </header>
  );
}

function TitleField({ view, editor }: { view: EditorViewModel; editor: EditorActor }) {
  return (
    <>
      <label>
        Title
        <input
          value={view.draft}
          maxLength={240}
          onChange={(event) => editor.send(E.TitleChanged({ title: event.target.value }))}
        />
      </label>
      {view.blockedBy === "TitleTooLong" && <Hint>Titles are limited to 200 characters.</Hint>}
    </>
  );
}

function SaveControls({ view, editor }: { view: EditorViewModel; editor: EditorActor }) {
  return (
    <footer>
      <button
        disabled={view.blockedBy !== null || view.saving}
        onClick={() => editor.send(E.SaveRequested())}
      >
        {view.saving ? "Saving…" : "Save"}
      </button>
      {view.saving && <button onClick={() => editor.send(E.CancelSave())}>Cancel</button>}
      {view.saved && <span role="status">Saved</span>}
      <button onClick={() => editor.send(E.Close())}>Done</button>
    </footer>
  );
}

function SaveNotices({ view, editor }: { view: EditorViewModel; editor: EditorActor }) {
  return (
    <>
      {view.locked && <Notice tone="warning">{view.error}. Retrying automatically…</Notice>}
      {view.error && !view.locked && <Notice tone="error">{view.error}</Notice>}
      {view.blockedBy === "NoPermission" && (
        <Notice tone="info">You can view but not edit this ticket.</Notice>
      )}
      {view.maybeSaved && (
        <Notice tone="warning">
          We couldn't confirm your last save.{" "}
          <button onClick={() => editor.send(E.RefreshRequested())}>Check again</button>
        </Notice>
      )}
    </>
  );
}

function TicketSkeleton() {
  return <section aria-busy="true" className="skeleton" />;
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="hint">{children}</p>;
}

function Notice({
  tone,
  children,
}: {
  tone: "info" | "warning" | "error";
  children: React.ReactNode;
}) {
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`notice ${tone}`}>
      {children}
    </p>
  );
}
