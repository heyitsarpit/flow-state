// Each component selects the narrowest thing it needs (minimal-library decision 8): only the
// title field re-renders per keystroke, only the badge per technician update.
import type { ReactNode } from "react";
import { check } from "flow-state";
import { useView } from "flow-state/react";
import type { TicketKey } from "../types.js";
import { Editor } from "./editor.definition.js";
import { useEditor, type EditorCommands } from "./useEditor.js";

const { S, E } = Editor;

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
    UNCERTAIN: null, // UncertainNotice below covers it, in CLOSED too
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
      <UncertainNotice commands={commands} />
    </>
  );
}

function TicketHeader({ commands }: { commands: EditorCommands }) {
  // A lane is undefined while its activity is not running, so optional chaining covers CLOSED.
  const title = useView(commands.editor, (s) =>
    S.OPEN.is(s) ? s.activities.ticket?.data?.title : undefined,
  );
  const stage = useView(commands.editor, (s) =>
    S.OPEN.is(s) ? s.activities.progress?.data?.stage : undefined,
  );
  const loadFailed = useView(
    commands.editor,
    (s) => S.OPEN.is(s) && s.activities.ticket?._tag === "Failure",
  );

  if (loadFailed && title === undefined) {
    return (
      <p role="alert">
        This ticket could not be loaded. <button onClick={commands.refresh}>Try again</button>
      </p>
    );
  }

  return (
    <header>
      <h2>{title ?? "Loading…"}</h2>
      {stage && <span className="badge">Technician {stage}</span>}
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
  // selector re-renders only when the verdict changes (minimal-library 8a).
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

function UncertainNotice({ commands }: { commands: EditorCommands }) {
  // An honest unknown outcome becomes memory through SaveUncertain; views never read transactions.
  // Shown open or closed: a save cancelled by Close can be just as uncertain.
  const uncertain = useView(commands.editor, (s) => s.memory.uncertain !== null);
  const canRetry = useView(commands.editor, (s) => S.OPEN.UNCERTAIN.is(s));

  if (!uncertain) return null;

  return (
    <p role="status">
      We couldn't confirm your last save.{" "}
      {canRetry && <button onClick={commands.save}>Retry the same save</button>}
    </p>
  );
}

function ClosedTicket({ commands }: { commands: EditorCommands }) {
  const title = useView(commands.editor, (s) => s.memory.saved);

  return (
    <>
      <h2>{title}</h2>
      <button onClick={commands.reopen}>Edit</button>
      <UncertainNotice commands={commands} />
    </>
  );
}
