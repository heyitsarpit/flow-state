// The attachment rows of the ticket panel. Each row reads its copy's public memory (`status`, `url`,
// `problem`) and the lane's row (`progress`, `retryCount`), through the narrowest selector.
// design gap: the plan names the placement `uploads: AttachmentUpload.each({ of: "uploads", … })`, so
// the copies are read here from `s.memory.uploads` (each copy has `key` and its public memory); B6's
// editor definition may name the host's draft list differently.
// design gap: `attach`, `cancelUpload` and `removeAttachment` are B6's `useEditor` commands (the plan
// lists "attach, remove an attachment"; cancel is `E.uploads.key(ref).Cancel()`).
import type { ChangeEvent, ReactNode } from "react";
import { useView } from "flow-state/react";
import type { UploadProgress } from "./attachments-api.js";
import { AttachmentUpload } from "./upload.trait.js";
import type { EditorCommands } from "../Tickets/editor/useEditor.js";

const { O } = AttachmentUpload;

const percent = ({ sent, total }: UploadProgress) => `${String(Math.round((sent / total) * 100))}%`;

export function Attachments({ commands }: { commands: EditorCommands }) {
  const refs = useView(commands.editor, (s) => s.memory.uploads.map((copy) => copy.key));

  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    for (const file of Array.from(event.target.files ?? [])) commands.attach(file);

    event.target.value = ""; // the same file can be chosen again
  };

  return (
    <section aria-label="Attachments">
      <label>
        Attach a file
        <input type="file" multiple onChange={choose} />
      </label>
      <ul>
        {refs.map((ref) => (
          <AttachmentRow key={ref} fileRef={ref} commands={commands} />
        ))}
      </ul>
    </section>
  );
}

// `fileRef`, since `ref` is React's own prop name.
function AttachmentRow({ fileRef, commands }: { fileRef: string; commands: EditorCommands }) {
  const copy = useView(commands.editor, (s) => s.memory.uploads.find((c) => c.key === fileRef));
  const lane = useView(commands.editor, (s) => O.put.get(s, { ref: fileRef }));

  if (!copy) return null; // removed this turn

  // `progress` is an upper bound on what the server has: the browser counts bytes handed to the
  // network. A full bar therefore reads "Waiting for the server…", never "Sent".
  const sending =
    lane.progress && lane.progress.sent < lane.progress.total
      ? `Sending ${percent(lane.progress)}`
      : "Waiting for the server…";

  const failure = {
    TooLarge: `Too large (the limit is ${String(copy.limit ?? 0)} bytes)`,
    FileGone: "The file is no longer in this tab",
    GaveUp: "Couldn't send it",
  } as const;

  const status = {
    queued: "Starting…",
    sending,
    unsure: `Connection lost. Trying again (${String(lane.retryCount)} of 3)…`,
    stored: <a href={copy.url ?? undefined}>Attached</a>,
    stopped: "Stopped",
    failed: failure[copy.problem ?? "GaveUp"],
  } satisfies Record<typeof copy.status, ReactNode>; // a new status fails to compile until it is mapped

  const working = copy.status === "queued" || copy.status === "sending" || copy.status === "unsure";

  return (
    <li>
      <span>{copy.name}</span> <span role="status">{status[copy.status]}</span>
      {working ? <button onClick={() => commands.cancelUpload(fileRef)}>Cancel</button> : null}
      {copy.problem === "FileGone" ? (
        <label>
          Choose the file again
          <input
            type="file"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (!file) return;

              commands.removeAttachment(fileRef); // the old draft's lane is released
              commands.attach(file); // a new ref, new bytes
            }}
          />
        </label>
      ) : null}
      <button onClick={() => commands.removeAttachment(fileRef)}>Remove</button>
    </li>
  );
}
