"use client";

import { useState } from "react";

import { can } from "flow-state";
import { useActor, useResource, useView } from "flow-state/react";

import { todoEditorMachine } from "../features/todos/machine";
import type { TodoEditorEvent } from "../features/todos/machine-types";
import { todoResource } from "../features/todos/resources";
import { todoEditorView } from "../features/todos/view";

export function TodoEditor() {
  const actor = useActor(todoEditorMachine, { id: "todos.editor" });
  const view = useView(actor, todoEditorView);
  const todo = useResource(todoResource.ref());
  const [text, setText] = useState("");
  const submitEvent: TodoEditorEvent = { type: "SUBMIT", text };
  const canSubmit = can(actor.getSnapshot(), submitEvent);

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
          if (!can(actor.getSnapshot(), submitEvent)) return;
          actor.send(submitEvent);
          setText("");
        }}
      >
        <input
          aria-label="Todo text"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button disabled={text.length === 0 || view.pending || !canSubmit}>Save</button>
      </form>
      {view.feedback === "success" ? <p role="status">Saved.</p> : null}
      {view.feedback === "failure" ? <p role="alert">Save rejected and rolled back.</p> : null}
    </main>
  );
}

