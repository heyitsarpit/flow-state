// The description fields and the body. Each field's text is its copy's nested Field (`s.memory.fields[i].check`),
// its save is the copy's lane (`Autosave.O.save.get(s, { ...ticket, field })`): "Saving…", "Waiting" when a newer
// value waits behind an unsure one, "?" while held. The body shows a conflict side by side.
// design gap: "Not saved on this device" reads the tab's persistence status from a view, through `useRuntime()`
// and `inspect` (REVIEW gap 15); the design names the status for Stories, not for views.
import { inspect } from "flow-state";
import { useRuntime, useView } from "flow-state/react";
import { Autosave } from "./autosave.trait.js";
import type { EditorCommands } from "./useEditor.js";

export function DescriptionFields({ commands }: { commands: EditorCommands }) {
  const fields = useView(commands.editor, (s) => s.memory.fields);
  const body = useView(commands.editor, (s) => s.memory.body);
  const lastSaved = useView(commands.editor, (s) => s.memory.lastFieldSaved);
  const runtime = useRuntime();
  const notPersisted = inspect(runtime).persistence.status === "SecondTabNoPersistence";

  return (
    <fieldset>
      {notPersisted && <p role="status">Not saved on this device</p>}
      {fields.map((copy) => (
        <FieldRow key={copy.key} commands={commands} copy={copy} />
      ))}
      {lastSaved !== null && <span role="status">Saved {lastSaved}</span>}
      <textarea
        aria-label="Description"
        value={body.body}
        disabled={body.status === "conflict"}
        onChange={(event) => commands.editBody(event.target.value)}
      />
      {body.status === "unsure" && <em>Not sure the description saved. Trying again…</em>}
      {body.status === "conflict" && (
        <div role="alert">
          <p>Someone else changed the description:</p>
          <blockquote>{body.theirs}</blockquote>
          <button onClick={commands.keepMine}>Keep mine</button>
          <button onClick={commands.takeTheirs}>Take theirs</button>
        </div>
      )}
    </fieldset>
  );
}

// One copy's public memory, as the editor's view reads it (rule 9: each copy with its `key`).
type Copy = {
  key: "summary" | "locationNote" | "accessCode";
  saved: string;
  problem: string | null;
  reason: string | null;
  check: { value: string; error: { code: string } | null; touched: boolean };
};

function FieldRow({ commands, copy }: { commands: EditorCommands; copy: Copy }) {
  const lane = useView(commands.editor, (s) =>
    Autosave.O.save.get(s, { ...commands.ticket, field: copy.key }),
  );
  const label = { summary: "Summary", locationNote: "Where", accessCode: "Access code" }[copy.key];

  return (
    <label>
      {label}
      <input
        aria-label={label}
        value={copy.check.value}
        onChange={(event) => commands.typeField(copy.key, event.target.value)}
      />
      {copy.check.touched && copy.check.error?.code === "TooLong" && <em>Too long</em>}
      {lane.pending && <em>Saving…</em>}
      {lane.waiting && <em>Waiting for the last save</em>}
      {lane.uncertain && <em>?</em>}
      {copy.problem === "rejected" && <strong role="alert">{copy.reason}</strong>}
    </label>
  );
}
