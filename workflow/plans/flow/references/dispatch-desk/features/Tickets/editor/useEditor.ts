// The feature's one hook (minimal-library decision 3): an actor and its commands, nothing else.
// Business logic stays in the machine, where graph, explain and Stories can see it.
import { useActorByRef } from "flow-state/react";
import type { TicketKey } from "../types.js";
import { Editor } from "./editor.definition.js";
import { editorRef } from "./editor.ref.js";

const { E } = Editor;

export function useEditor(ticket: TicketKey) {
  // With input it ensures the durable per-ticket actor; the handle is stable across renders
  // even though editorRef(ticket) is a new object each time (compared by id).
  const editor = useActorByRef(editorRef(ticket), { input: ticket });

  return {
    editor,
    rename: (title: string) => editor.send(E.TitleChanged({ title })),
    save: () => editor.send(E.SaveRequested()),
    cancel: () => editor.send(E.CancelSave()),
    escape: () => editor.send(E.Escape()),
    close: () => editor.send(E.Close()),
    reopen: () => editor.send(E.Reopen()),
    refresh: () => editor.send(E.RefreshRequested()),
  };
}

export type EditorCommands = ReturnType<typeof useEditor>;
