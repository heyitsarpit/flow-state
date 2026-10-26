// The four exports of flow-state/inspect (FlowState D11). Observation never starts work.
import { readFile } from "node:fs/promises";
import { attachInspector, inspect, render, trace } from "flow-state/inspect";
import { DeskApp } from "../app/app.js";
import { DeskSetup } from "../app/setup.js";
import { SessionRef } from "../features/Session/session.ref.js";
import { Editor } from "../features/Tickets/editor/editor.definition.js";
import { editorRef } from "../features/Tickets/editor/editor.ref.js";

// The internal representation, built by inert construction: no callback runs. It holds every
// state, target, guard deny code, operation, outcome edge, activity, schedule, context read,
// actor send (Editor --Saved--> Toasts.Push) and the recorded ticket domain.
export async function describeDesk() {
  const model = await inspect(DeskApp); // loads every declared lazy entry, but starts no actor

  return {
    text: render(model, "text"),
    json: render(model, "json"),
    mermaid: render(model, "mermaid"),
  };
}

// The supported production observer: it receives committed evidence as it happens and never
// delays a turn. In-process snapshots and checkpoints are faithful. Sensitive values become
// keyed HMAC digests only on export to artifacts, traces, CLI output or external sinks. SSR
// payloads omit sensitive fields (ruling 30); the host must not log raw live snapshots.
export async function observeLiveDesk(sink: (event: unknown) => void) {
  const runtime = DeskSetup.construct();
  const observer = attachInspector(runtime, sink);

  try {
    await runtime.runPromise(runtime.ready());
    runtime.ensureActor(SessionRef, { input: { userId: "dispatcher-7" } });

    const editor = runtime.ensureActor(editorRef({ workspaceId: "north", ticketId: "T-42" }), {
      input: { workspaceId: "north", ticketId: "T-42" },
    });

    editor.send(Editor.E.TitleChanged({ title: "" }));
    editor.send(Editor.E.SaveRequested()); // denied with EmptyTitle; the denial is evidence

    // One passive revision-consistent cut: domains, frontiers, predictions and queues.
    // No activity is started or drained by inspecting the live Runtime.
    const live = inspect(runtime);

    return live;
  } finally {
    try {
      await runtime.dispose();
    } finally {
      try {
        await observer.drain(); // include final evidence even when Runtime cleanup fails
      } finally {
        observer.dispose();
      }
    }
  }
}

// Trace artifacts written by `flow story run --trace-output`; summarise and diff are CLI leaves.
export async function loadTrace(path: string) {
  const imported = trace.import(new Uint8Array(await readFile(path)));

  return { imported, bytes: trace.export(imported) };
}
