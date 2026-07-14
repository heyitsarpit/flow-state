"use client";

import { useState } from "react";

import { useActor, useResource, useView } from "flow-state/react";

import { todoEditorMachine } from "../features/todos/machine";
import { todoResource } from "../features/todos/resources";
import { todoEditorView } from "../features/todos/view";

export function TodoEditor() {
  const actor = useActor(todoEditorMachine, { id: "todos.editor" });
  const view = useView(actor, todoEditorView);
  const todo = useResource(todoResource.ref());
  const [text, setText] = useState("");

  return (
    <main>
      <h1>Optimistic todo</h1>
      <p>The transaction preview updates this canonical resource before the service completes.</p>
      <dl>
        <dt>Saved text</dt>
        <dd>{todo?.value?.text ?? "Loading…"}</dd>
        <dt>Draft</dt>
        <dd>{todo?.value?.draft || "No draft"}</dd>
      </dl>
      <button onClick={() => actor.send({ type: "EDIT_EXAMPLE" })}>Apply example draft</button>
      <button onClick={() => actor.send({ type: "REFRESH" })}>Refetch canonical todo</button>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          actor.send({ type: "SUBMIT", text });
          setText("");
        }}
      >
        <input
          aria-label="Todo text"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button disabled={text.length === 0 || view.pending}>Save</button>
      </form>
      {view.feedback === "success" ? <p role="status">Saved.</p> : null}
      {view.feedback === "failure" ? <p role="alert">Save rejected and rolled back.</p> : null}
    </main>
  );
}
