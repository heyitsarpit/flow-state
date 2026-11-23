// The imperative host: construction, readiness, actors and cleanup outside React.
import { Effect, Schema, Stream } from "effect";
import { FlowError } from "flow-state";
import { Session } from "../features/Session/session.definition.js";
import { SessionRef } from "../features/Session/session.ref.js";
import { Editor } from "../features/Tickets/editor/editor.definition.js";
import { EditorMachine } from "../features/Tickets/editor/editor.machine.js";
import { editorRef } from "../features/Tickets/editor/editor.ref.js";
import { feedRef } from "../features/Tickets/feed/feed.ref.js";
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
    runtime.ensureActor(feedRef("north"), { input: { workspaceId: "north" } });
    // The same ref twice names the same actor; the first accepted input wins.
    const editor = runtime.ensureActor(editorRef({ workspaceId: "north", ticketId: "T-42" }), {
      input: { workspaceId: "north", ticketId: "T-42" },
    });

    // A local actor: anonymous, distinct each time, wired by the app default.
    const scratch = runtime.createActor(EditorMachine, {
      input: { workspaceId: "north", ticketId: "T-43" },
    });

    // A write on the wire outlives this page: the browser asks before it leaves. The Runtime lists every lane
    // whose ending is not yet known, including one whose editor was closed (rule 44, C43, C64).
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (runtime.unsettledWrites().length === 0) return;
      event.preventDefault(); // the browser shows its own wording; the page cannot set it
    };

    addEventListener("beforeunload", warnBeforeLeaving);

    editor.send(Editor.E.TitleChanged({ title: "Replace foyer light" }));
    console.log(editor.getSnapshot().memory.draft, Editor.S.OPEN.is(editor.getSnapshot()));

    // A new subscriber sees current truth; this is not a history.
    await runtime.runPromise(
      editor.snapshots.pipe(
        Stream.take(1),
        Stream.runForEach((snapshot: { readonly state: string }) =>
          Effect.sync(() => console.log(snapshot.state)),
        ),
      ),
    );

    // Boundaries decode untrusted input with the definition's own Schema. Decoding an internal
    // event such as Saved fails, so a URL cannot forge an outcome (Machines.plan O1).
    const fromUrl = await runtime.runPromise(
      Schema.decodeUnknownEffect(Editor.Event)({ _tag: "Close" }),
    );

    editor.send(fromUrl);

    // Effects run with the installed services. runPromiseExit is gone: use Effect.exit.
    const exit = await runtime.runPromise(
      Effect.exit(
        TicketApi.use((api) =>
          api.load(
            { workspaceId: "north", ticketId: "T-42" },
            { signal: new AbortController().signal },
          ),
        ),
      ),
    );

    console.log(exit._tag);

    // Disposal cancels nothing: an in-flight save keeps its lane, and its ending is parked or adopted (rule 44).
    await runtime.disposeActor(scratch);
    await runtime.disposeActor(editor);
    removeEventListener("beforeunload", warnBeforeLeaving);
  } finally {
    await runtime.dispose(); // owns everything left, in reverse dependency order
  }
}

// Every Flow failure at a host boundary is one FlowError with a closed code (Diagnostics.plan O1).
export function describeHostFailure(failure: unknown) {
  return failure instanceof FlowError
    ? `${failure.code}: ${failure.diagnostics[0]?.summary ?? ""}`
    : String(failure);
}

// Call from the authenticated browser host; use browserSetup(userId) for durable sessions.
// Sign-out refuses while a write is unsettled (a save on the wire or one held as unknown), because
// `forget: true` would drop the record that lets the next sign-in find out how it ended (rule 44).
// `confirmDiscard` is the host's own dialog; it receives what would be lost, one line per lane.
// design gap: the shape of an `unsettledWrites()` entry is not shown in the design; `contract` and `key`
// follow the lane's identity (actor, contract, key), as tools/inspection.ts lists them.
export async function signOut(
  runtime: ReturnType<typeof DeskSetup.construct>,
  userId: string,
  confirmDiscard: (lost: ReadonlyArray<string>) => Promise<boolean>,
): Promise<"SignedOut" | "Refused"> {
  const unsettled = runtime.unsettledWrites();

  if (unsettled.length > 0) {
    const lost = unsettled.map((write) => `${write.contract} ${JSON.stringify(write.key)}`);

    if (!(await confirmDiscard(lost))) return "Refused";
  }

  const session = runtime.ensureActor(SessionRef, { input: { userId } });
  session.send(Session.E.SignedOut());
  await runtime.dispose({ forget: true });
  // The host now switches to its signed-out UI. Other tabs require their own auth notification;
  // v1 does not mirror actors or broadcast sign-out (Persistence.plan O7).
  return "SignedOut";
}
