// The exports of flow-state/inspect (Inspection.plan). Observation never starts work. In Stories the same
// listing is `cp.inspection` (2.10.6): `expect(cp.inspection, { lanes: [...] })`.
import { readFile } from "node:fs/promises";
import { attachInspector, inspect, render, trace } from "flow-state/inspect";
import { DeskApp } from "../app/app.js";
import { DeskSetup } from "../app/setup.js";
import { SessionRef } from "../features/Session/session.ref.js";
import { Editor } from "../features/Tickets/editor/editor.definition.js";
import { editorRef } from "../features/Tickets/editor/editor.ref.js";

// The internal representation, built by inert construction: no callback runs. It holds every state, target,
// guard deny code, operation (a fragment's under its placement), outcome edge, activity, schedule, context read,
// actor send (Editor --Saved--> Toasts.Push) and the recorded ticket domain.
export async function describeDesk() {
  const model = await inspect(DeskApp); // loads every declared lazy entry, but starts no actor

  return {
    text: render(model, "text"),
    json: render(model, "json"),
    mermaid: render(model, "mermaid"),
  };
}

// What a live Runtime says about writes (C64, C78). `inspect(runtime)` is one passive, revision-consistent cut.
// A lane is listed while it is not `Idle`, by identity (actor identity, contract id, key), so a save whose
// editor was closed and disposed is still here. Held wire items are not Runtime facts: the fake's endpoints
// show those (2.10.6).
//
// design gap: the field names of a lane entry follow 2.10.7's list (state, flags, subject path, `binding`,
// `releasing`, queued commits, parked endings); its exact shape is not shown.
export function listWrites(runtime: ReturnType<typeof DeskSetup.construct>) {
  const live = inspect(runtime);

  return {
    // Every non-Idle write lane. `binding`: `bound` (its actor lives and owns the placement), `unbound` (the
    // actor is gone, the lane lives on: a save that outlived its screen) or `unplaced` (the actor lives, the
    // `.each` copy does not: a comment post held for a ticket the drawer no longer shows).
    lanes: live.lanes.map((lane) => ({
      actor: lane.actor,
      contract: lane.contract, // "DispatchDesk/save-title"
      key: lane.key,
      subject: lane.subject, // [] for the editor's save, [previewId] for the queue's comments
      binding: lane.binding,
      releasing: lane.releasing, // a cancel is on its way (rule 60); finishes after a reload too
      state: lane.state, // "InFlight" | "Held"
      uncertain: lane.uncertain,
      queued: lane.queued, // commits waiting behind the head
      parked: lane.parked, // endings that arrived with no incarnation, waiting for an adopter
    })),

    // The fragment copies alive or frozen, with their instance paths: one row per file upload.
    incarnations: live.incarnations,

    // What a host's `beforeunload` and sign-out read: the lanes whose ending is not yet known. It lists unplaced
    // lanes and drops a releasing lane once its ending lands.
    unsettled: runtime.unsettledWrites(),
  };
}

// Streams are not write lanes and never appear in `lanes`; each open stream is a session,
// listed per actor, operation and key with its `connection`, the last drop, each start's answer and basis
// (`pending`, then `proven` or `lost`, or `abandoned`), `reconnect`'s phase, `missed` reports, the bound and
// the release state; a ring of the last 256 entries per session. Flags: UnprovenValues, RegistrationChurn,
// ReleaseOverdue. Stream values are redacted like any other.
export function listSessions(runtime: ReturnType<typeof DeskSetup.construct>) {
  return inspect(runtime).sessions.map((session) => ({
    actor: session.actor, // DeskFeed:north, Presence:north/T-42, Assistant:north/T-42
    operation: session.operation,
    key: session.key,
    connection: session.connection, // "Connecting" | "Live" | "CatchingUp" | "Waiting"
    drop: session.drop,
    answer: session.answer, // { basis: "pending" | "proven" | "lost" | "abandoned", at }
    missed: session.missed,
    flags: session.flags,
  }));
}

// The supported production observer: it receives committed evidence as it happens and never delays a turn.
// In-process snapshots and checkpoints are faithful. Sensitive values become keyed HMAC digests only on export
// to artifacts, traces, CLI output or external sinks. SSR payloads omit sensitive fields (ServerRendering.plan
// O3); the host must not log raw live snapshots.
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

    // No activity is started or drained by inspecting the live Runtime.
    return listWrites(runtime);
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
