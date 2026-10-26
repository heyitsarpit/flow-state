// The imperative host: construction, readiness, actors and cleanup outside React.
import { Effect, Schema, Stream } from "effect";
import { FlowError } from "flow-state";
import { Session } from "../features/Session/session.definition.js";
import { SessionRef } from "../features/Session/session.ref.js";
import { Editor } from "../features/Tickets/editor/editor.definition.js";
import { EditorMachine } from "../features/Tickets/editor/editor.machine.js";
import { editorRef } from "../features/Tickets/editor/editor.ref.js";
import { queueRef } from "../features/Tickets/queue/queue.ref.js";
import { TicketApi } from "../features/Tickets/ticket-api.js";
import { ToastsRef } from "../features/Toasts/toasts.ref.js";
import { DeskSetup } from "./setup.js";

export async function runDeskHost() {
  const runtime = DeskSetup.construct(); // inert: no storage, services, actors or work

  try {
    await runtime.runPromise(runtime.ready()); // one shared bootstrap; later calls join it

    // Providers before consumers. Wiring comes from the refs and the app defaults.
    runtime.ensureActor(SessionRef, { input: { userId: "dispatcher-7" } });
    runtime.ensureActor(ToastsRef);
    runtime.ensureActor(queueRef("north"), { input: { workspaceId: "north" } });

    // The same ref twice names the same actor; the first accepted input wins.
    const editor = runtime.ensureActor(editorRef({ workspaceId: "north", ticketId: "T-42" }), {
      input: { workspaceId: "north", ticketId: "T-42" },
    });

    // A local actor: anonymous, distinct each time, wired by the app default.
    const scratch = runtime.createActor(EditorMachine, {
      input: { workspaceId: "north", ticketId: "T-43" },
    });

    editor.send(Editor.E.TitleChanged({ title: "Replace foyer light" }));
    console.log(editor.getSnapshot().memory.draft, Editor.S.OPEN.is(editor.getSnapshot()));

    // A new subscriber sees current truth; this is not a history.
    await runtime.runPromise(
      editor.snapshots.pipe(
        Stream.take(1),
        Stream.runForEach((snapshot) => Effect.sync(() => console.log(snapshot.state))),
      ),
    );

    // Boundaries decode untrusted input with the definition's own Schema. Decoding an internal
    // event such as Saved fails, so a URL cannot forge an outcome (FlowState D19).
    const fromUrl = await runtime.runPromise(
      Schema.decodeUnknownEffect(Editor.Event)({ _tag: "Close" }),
    );

    editor.send(fromUrl);

    // Effects run with the installed services. runPromiseExit is gone: use Effect.exit.
    const exit = await runtime.runPromise(
      Effect.exit(
        TicketApi.use((api) =>
          api.load({ workspaceId: "north", ticketId: "T-42" }, new AbortController().signal),
        ),
      ),
    );

    console.log(exit._tag);

    // Disposal is bounded: a save that cannot settle is recorded as unknown.
    await runtime.disposeActor(scratch);
    await runtime.disposeActor(editor);
  } finally {
    await runtime.dispose(); // owns everything left, in reverse dependency order
  }
}

// Every Flow failure at a host boundary is one FlowError with a closed code (FlowState D10).
export function describeHostFailure(failure: unknown) {
  return failure instanceof FlowError
    ? `${failure.code}: ${failure.diagnostics[0]?.summary ?? ""}`
    : String(failure);
}

// Call from the authenticated browser host; use browserSetup(userId) for durable sessions.
export async function signOut(runtime: ReturnType<typeof DeskSetup.construct>, userId: string) {
  const session = runtime.ensureActor(SessionRef, { input: { userId } });
  session.send(Session.E.SignedOut());
  await runtime.dispose({ forget: true });
  // The host now switches to its signed-out UI. Other tabs require their own auth notification;
  // v1 does not mirror actors or broadcast sign-out (binding ruling 38).
}
