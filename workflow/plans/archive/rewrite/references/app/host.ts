// Imperative application host. Exact ownership and ordered cleanup failure truth stay here.
import { Effect, Schema, Stream } from "effect";
import { FlowError } from "flow-state";
import { Editor } from "../features/Tickets/editor/editor.definition.js";
import { EditorMachine } from "../features/Tickets/editor/editor.machine.js";
import { TicketApi } from "../features/Tickets/ticket-api.js";
import { EditorRef, QueueRef, SessionRef } from "./actors.js";
import { DeskSetup } from "./setup.js";

export async function runDeskHost() {
  const runtime = DeskSetup.construct(); // Inert: no storage, services, actors or work.
  const failures: unknown[] = [];

  try {
    await runtime.runPromise(runtime.ready());

    // Wiring lives on the refs, so ensure takes only input (D11).
    const session = runtime.ensureActor(SessionRef);
    const queue = runtime.ensureActor(QueueRef, { input: { workspaceId: "north" } });

    const editor = runtime.ensureActor(EditorRef, {
      input: { workspaceId: "north", ticketId: "T-42", title: "Replace lobby light" },
    });

    const existing = runtime.getActor(EditorRef); // Lookup only. No extra lease or actor.

    // A local actor has no ref, so it binds its providers itself. Always distinct and opaque.
    const local = runtime.createActor(EditorMachine, {
      input: { workspaceId: "north", ticketId: "T-43", title: "Fix loading dock door" },
      contextBindings: { canEdit: SessionRef },
    });

    existing.send(Editor.E.TitleChanged({ title: "Replace foyer light" }));

    const current = existing.getSnapshot();
    console.log(current.memory.draft, current.lifecycle, Editor.S.OPEN.is(current));

    // A new stream subscriber sees current truth; this is not historical replay.
    await runtime.runPromise(
      existing.snapshots.pipe(
        Stream.take(1),
        Stream.runForEach((snapshot) => Effect.sync(() => console.log(snapshot.memory.draft))),
      ),
    );

    // Boundaries decode untrusted input with the definition's own Schema (D55).
    const fromUrl = await runtime.runPromise(
      Schema.decodeUnknownEffect(Editor.Event)({ _tag: "Close" }),
    );

    existing.send(fromUrl);

    // Bridges reuse installed services. Reusable application services return Effects.
    const remoteTitle = await runtime.runPromise(
      TicketApi.use((api) =>
        api.load({ workspaceId: "north", ticketId: "T-42" }, new AbortController().signal),
      ).pipe(Effect.map((ticket) => ticket.title)),
    );

    console.log(remoteTitle);

    // Dispose consumers before their provider. Dropping a lease does not dispose.
    await local.dispose();
    await editor.dispose();
    await queue.dispose();
    await session.dispose();
  } catch (failure) {
    failures.push(failure);
  }

  try {
    // Whole-Runtime cleanup also owns any leases left after an earlier failure.
    await runtime.dispose();
  } catch (failure) {
    failures.push(failure);
  }

  if (failures.length === 1) throw failures[0];

  if (failures.length > 1) {
    throw new AggregateError(failures, "Dispatch Desk host and cleanup failed");
  }
}

// Every Flow failure at a host boundary is one FlowError with a closed code (D14).
export function describeHostFailure(failure: unknown) {
  if (failure instanceof FlowError)
    return `${failure.code}: ${failure.diagnostics[0]?.summary ?? ""}`;

  return String(failure);
}

/**
 * Same stable ref + Runtime => one shared actor and lease; the first accepted input wins.
 * Provider disposal fails while active or suspended consumers remain bound.
 * Disposed stable refs are tombstoned within that Runtime and reusable in another Runtime.
 * Lifecycle: prepared -> active <-> suspended -> disposed. CLOSED is an ordinary machine state.
 * Each request owns a separate constructed Runtime; never share the browser Runtime.
 */
