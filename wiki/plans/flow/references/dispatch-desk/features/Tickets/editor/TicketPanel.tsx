// Each component selects the narrowest thing it needs (minimal-library decision 8): only the
// title field re-renders per keystroke, only the notice when the save lane changes.
//
// Two stores are read, and told apart (2.8.1): the shared record (`Ticket.get`: what every copy of the ticket
// shows, `predicted` while a write is unconfirmed) and this actor's lane (`O.save.get`: this editor's save,
// `pending` while it is on the wire, `uncertain` while it is held).
import type { ReactNode } from "react";
import { check } from "flow-state";
import { useView } from "flow-state/react";
import { Attachments } from "../../Attachments/Attachments.js";
import { CommentsPanel } from "../../Comments/CommentsPanel.js";
import { Ticket } from "../ticket.domain.js";
import type { TicketKey } from "../types.js";
import { Editor, MAX_RESENDS } from "./editor.definition.js";
import { DescriptionFields } from "./DescriptionFields.js";
import { useEditor, type EditorCommands } from "./useEditor.js";

const { S, E, O } = Editor;

export function TicketPanel({ ticket }: { ticket: TicketKey }) {
  const commands = useEditor(ticket);
  const top = useView(commands.editor, (s) => S.root.child(s)); // "OPEN" | "CLOSED"

  const body = {
    OPEN: <OpenTicket commands={commands} />,
    CLOSED: <ClosedTicket commands={commands} />,
  } satisfies Record<typeof top, ReactNode>; // a new top-level state fails to compile

  return (
    <section onKeyDown={(event) => event.key === "Escape" && commands.escape()}>
      {body[top]}
    </section>
  );
}

function OpenTicket({ commands }: { commands: EditorCommands }) {
  const step = useView(commands.editor, (s) => S.OPEN.child(s)); // the active child of OPEN

  // What each step adds to the footer; a new child of OPEN fails to compile until it is mapped.
  const status = {
    EDITING: null,
    SAVING: <button onClick={commands.cancel}>Cancel</button>,
    SAVED: <span role="status">Saved</span>,
    FAILED: <ErrorNotice commands={commands} />,
    LOCKED: <LockNotice commands={commands} />,
    UNSURE: <UnsureNotice commands={commands} />,
  } satisfies Record<typeof step, ReactNode>;

  return (
    <>
      <TicketHeader commands={commands} />
      <TitleField commands={commands} />
      <footer>
        <SaveButton commands={commands} />
        {status[step]}
        <button onClick={commands.close}>Done</button>
      </footer>
      <Attachments commands={commands} />
      <DescriptionFields commands={commands} />
      <CommentsPanel
        host={commands.editor}
        instance="comments"
        events={commands.comments}
        ticket={commands.ticket}
      />
    </>
  );
}

// The shared record's title, with what the record says about it: a prediction every copy shows, or a value
// the server has not confirmed. A lane is `undefined` while its activity is not running (CLOSED).
function TicketHeader({ commands }: { commands: EditorCommands }) {
  const record = useView(commands.editor, (s) =>
    Ticket.get(
      s,
      { workspaceId: s.memory.workspaceId, ticketId: s.memory.ticketId },
      Ticket.pick("title"),
    ),
  );

  const loadFailed = useView(commands.editor, (s) => s.operations.ticket?._tag === "Failure");

  if (loadFailed && record.data === undefined) {
    return (
      <p role="alert">
        This ticket could not be loaded. <button onClick={commands.refresh}>Try again</button>
      </p>
    );
  }

  return (
    <header>
      <h2>{record.data?.title ?? "Loading…"}</h2>
      {record.predicted && <span className="badge">Saving…</span>}
      {record.uncertain && <span className="badge">Not confirmed</span>}
    </header>
  );
}

function TitleField({ commands }: { commands: EditorCommands }) {
  const draft = useView(commands.editor, (s) => s.memory.draft); // the only per-keystroke render

  return (
    <label>
      Title
      <input
        value={draft}
        maxLength={240}
        onChange={(event) => commands.rename(event.target.value)}
      />
    </label>
  );
}

// Messages for the deny codes a user can act on; the others leave the button disabled silently.
const saveHints = new Map([
  ["TitleTooLong", "Titles are limited to 200 characters."],
  ["EmptyTitle", "A ticket needs a title."],
  ["NoPermission", "You can view this ticket but not edit it."],
]);

function SaveButton({ commands }: { commands: EditorCommands }) {
  // Enablement and its explanation come only from check, which returns a Data value: the
  // selector re-renders only when the verdict changes (minimal-library 8a). `O.save.idle` is among the
  // guards, so a save on the wire or unconfirmed disables the button with no extra line here.
  const save = useView(commands.editor, (s) => check(s, E.SaveRequested()));

  const hint =
    save._tag === "Denied"
      ? save.reasons.map((reason) => saveHints.get(reason.code)).find(Boolean)
      : undefined;

  return (
    <>
      <button disabled={save._tag !== "Allowed"} onClick={commands.save}>
        Save
      </button>
      {hint && <p className="hint">{hint}</p>}
    </>
  );
}

function LockNotice({ commands }: { commands: EditorCommands }) {
  const error = useView(commands.editor, (s) => s.memory.error);

  return <p role="status">{error}. Retrying automatically…</p>;
}

function ErrorNotice({ commands }: { commands: EditorCommands }) {
  const error = useView(commands.editor, (s) => s.memory.error);

  return <p role="alert">{error}</p>;
}

// The hold, read from the lane: the Attempt is not in memory. `retryCount` counts the re-sends so far.
function UnsureNotice({ commands }: { commands: EditorCommands }) {
  const retries = useView(
    commands.editor,
    (s) =>
      O.save.get(s, { workspaceId: s.memory.workspaceId, ticketId: s.memory.ticketId }).retryCount,
  );

  return (
    <p role="status">
      We couldn't confirm your last save. Trying again ({retries} of {MAX_RESENDS})…{" "}
      <button onClick={commands.save}>Try again now</button>
    </p>
  );
}

// A closed ticket can still own a save: the Runtime keeps the lane after the panel is gone.
function ClosedTicket({ commands }: { commands: EditorCommands }) {
  const title = useView(commands.editor, (s) => s.memory.saved);

  const lane = useView(commands.editor, (s) =>
    O.save.get(s, { workspaceId: s.memory.workspaceId, ticketId: s.memory.ticketId }),
  );

  return (
    <>
      <h2>{title}</h2>
      <button onClick={commands.reopen}>Edit</button>
      {lane.pending && <p role="status">Still saving your last change…</p>}
      {lane.uncertain && (
        <p role="status">We couldn't confirm your last save. Open the ticket to finish it.</p>
      )}
    </>
  );
}
