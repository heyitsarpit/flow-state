// Inspection: the four exports of flow-state/inspect (D39). Observation never starts work.
import { readFile, writeFile } from "node:fs/promises";
import { attachInspector, inspect, render, trace } from "flow-state/inspect";
import { DeskApp } from "../app/app.js";
import { EditorRef, SessionRef } from "../app/actors.js";
import { DeskSetup } from "../app/setup.js";
import { Editor } from "../features/Tickets/editor/editor.definition.js";

// The internal representation: built by inert construction, no callback runs.
export function describeDesk() {
  const model = inspect(DeskApp);

  return {
    mermaid: render(model, "mermaid"), // Diagrams for humans.
    json: render(model, "json"), // The same structure for agents and tools.
  };
}

export async function observeLiveDesk() {
  const runtime = DeskSetup.construct();
  const inspector = attachInspector(runtime, { capacity: 256 }); // Attach before admission.

  try {
    await runtime.runPromise(runtime.ready());
    runtime.ensureActor(SessionRef);

    const { actor } = runtime.ensureActor(EditorRef, {
      input: { workspaceId: "north", ticketId: "T-42", title: "Replace lobby light" },
    });

    actor.send(Editor.E.TitleChanged({ title: "" }));
    actor.send(Editor.E.SaveRequested()); // Denied: EmptyTitle, recorded.

    await inspector.drain();
    const retained = inspector.snapshot(); // Ordered committed evidence, with truncation marker.

    return {
      records: retained.records.length,
      truncatedBeforeSequence: retained.truncatedBeforeSequence,
    };
  } finally {
    await runtime.dispose();
    await inspector.dispose();
  }
}

export async function compareTraces() {
  const before = trace.import(new Uint8Array(await readFile("artifacts/ticket-save.trace.json")));

  const after = trace.import(
    new Uint8Array(await readFile("artifacts/ticket-save.next.trace.json")),
  );

  console.log(trace.summarize(before));
  await writeFile("artifacts/ticket-save.copy.json", trace.export(before));

  return trace.diff(before, after); // Equality requires both traces complete.
}

/**
 * Formatters, analyzers, behaviour contracts, slicing and coverage rendering are CLI internals
 * over the same representation; they are not exports.
 * Graph, explain and diff render from the live app, so nothing goes stale.
 * Callback bodies are opaque: reads seen during Stories are reported as observed, never declared.
 *
 * Authority: ../../InspectionAndArtifacts.plan and ../../SurfaceSimplification.plan (D38–D41).
 */
