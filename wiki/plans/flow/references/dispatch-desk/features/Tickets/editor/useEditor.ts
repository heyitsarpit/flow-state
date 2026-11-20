// The feature's one hook (minimal-library decision 3): an actor and its commands, nothing else.
// Business logic stays in the machine, where graph, explain and Stories can see it.
import { useActorByRef, useRuntime } from "flow-state/react";
import { PendingFiles } from "../../Attachments/attachments-api.js";
import type { TicketKey } from "../types.js";
import { Editor } from "./editor.definition.js";
import { editorRef } from "./editor.ref.js";

const { E } = Editor;

export function useEditor(ticket: TicketKey) {
  // With input it ensures the durable per-ticket actor; the handle is stable across renders
  // even though editorRef(ticket) is a new object each time (compared by id).
  const editor = useActorByRef(editorRef(ticket), { input: ticket });

  // design gap: a React hook for the Runtime is not in the design (it shows useActorByRef and useView).
  // Needed because a dropped file's bytes go to the `PendingFiles` service, not into the event.
  const runtime = useRuntime();

  return {
    editor,
    ticket,
    rename: (title: string) => editor.send(E.TitleChanged({ title })),
    save: () => editor.send(E.SaveRequested()),
    cancel: () => editor.send(E.CancelSave()),
    escape: () => editor.send(E.Escape()),
    close: () => editor.send(E.Close()),
    reopen: () => editor.send(E.Reopen()),
    refresh: () => editor.send(E.RefreshRequested()),

    // The view mints the ref (2.9.5: a key must exist before the commit), keeps the bytes in this tab, then
    // tells the editor. Memory gets `{ ref, name, size }` only, so the persisted editor still decodes on restore.
    attach: (file: File) => {
      const ref = crypto.randomUUID();

      runtime.runSync(PendingFiles.use((files) => files.keep(ref, file)));
      editor.send(E.AttachFile({ ref, name: file.name, size: file.size }));
    },
    // Removing the entry ends its copy, which releases the upload (rule 60); the bytes are no use any more.
    removeAttachment: (ref: string) => {
      editor.send(E.RemoveAttachment({ ref }));
      runtime.runSync(PendingFiles.use((files) => files.discard(ref)));
    },
    // The row's Cancel button: an event for one copy (`E.<instance>.key(k).<Event>`).
    cancelUpload: (ref: string) => editor.send(E.uploads.key(ref).Cancel()),

    // A description field's keystroke goes to its copy's nested Field (rule 9's `key`, rule 10's path).
    typeField: (field: "summary" | "locationNote" | "accessCode", value: string) =>
      editor.send(E.fields.key(field).check.Changed({ value })),
    editBody: (body: string) => editor.send(E.body.Edited({ body })),
    keepMine: () => editor.send(E.body.KeepMine()),
    takeTheirs: () => editor.send(E.body.TakeTheirs()),

    // The comments thread's events, for `CommentsPanel`: it sends to the host's namespace (rule 2).
    comments: E.comments,
  };
}

export type EditorCommands = ReturnType<typeof useEditor>;
