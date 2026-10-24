// Imperative application host. Exact ownership and ordered cleanup failure truth stay here.
import { Effect, Result, Stream } from "effect";
import { EditorMachine } from "../features/Tickets/editor/editor.machine.js";
import { editorDefinition } from "../features/Tickets/editor/editor.definition.js";
import { TicketApi } from "../features/Tickets/ticket-api.js";
import { SessionRef, EditorRef } from "./actors.js";
import { DeskSetup } from "./setup.js";

export async function runDeskHost() {
  const runtime = DeskSetup.construct(); // Inert: no storage, services, actors, or work.
  const failures: unknown[] = [];

  try {
    await Effect.runPromise(runtime.ready());
    const session = runtime.ensureActor(SessionRef, {});

    const editor = runtime.ensureActor(EditorRef, {
      input: { workspaceId: "north", ticketId: "T-42", title: "Replace lobby light" },
      contextBindings: { canEdit: SessionRef },
    });

    const existing = runtime.getActor(EditorRef); // Lookup only. No extra lease or actor.

    const local = runtime.createActor(EditorMachine, {
      input: { workspaceId: "north", ticketId: "T-42", title: "Replace lobby light" },
      contextBindings: { canEdit: SessionRef },
    }); // Always a distinct opaque local actor. No stable ID option.

    existing.send(Result.getOrThrow(editorDefinition.E.TitleChanged("Replace foyer light")));
    // send synchronously admits and returns void; the snapshot is not a dispatch receipt.
    const current = existing.getSnapshot();
    console.log(current.memory.draft, current.lifecycle);

    // A new stream subscriber sees current truth; this is not historical replay.
    await runtime.runPromise(
      existing.snapshots.pipe(
        Stream.take(1),
        Stream.runForEach((snapshot) => Effect.sync(() => console.log(snapshot.memory.draft))),
      ),
    );

    // Bridges reuse installed services. Reusable application services return Effects.
    const remoteTitle = await runtime.runPromise(
      Effect.gen(function* () {
        const api = yield* TicketApi;

        const ticket = yield* api.load(
          { workspaceId: "north", ticketId: "T-42" },
          new AbortController().signal,
        );

        return ticket.title;
      }),
    );

    const reportExit = await runtime.runPromiseExit(Effect.fail("report-unavailable"));
    console.log(remoteTitle, reportExit);

    // Dispose consumers before their provider. Dropping a lease does not dispose it.
    await local.dispose();
    await editor.dispose();
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
    // Application host aggregation: body first, then cleanup. No original error is replaced.
    throw new AggregateError(failures, "Dispatch Desk host and cleanup failed");
  }
}
/**
 * Complete provider supersets are valid; duplicates reject instead of last-wins.
 * runtimeSetup({ app }) is available when the application's requirements are never.
 * DeskApp needs TicketApi, so the app-only form is intentionally not used here.
 *
 * Same stable ref + Runtime => one shared actor/lease; first accepted input wins.
 * Fixed context bindings cannot be changed on a later ensure. getActor creates nothing.
 * Provider disposal fails while active or suspended consumers remain bound.
 * Disposed stable refs are tombstoned within that Runtime, reusable in another Runtime.
 *
 * Actor lifecycle: prepared -> active <-> suspended -> disposed.
 * CLOSED in the machine is an ordinary state, not actor disposal or stream completion.
 * Prepared commands buffer within a finite bound; suspended commands reject.
 * Handles expose ref/send/getSnapshot/snapshots, never disposal authority.
 *
 * Every request owns a separate constructed Runtime and its finalization path. Never share
 * the browser Runtime across requests. SSR preparation is inert; abandoned render starts no work.
 * Request helper call signatures are unspecified; no invented request API is demonstrated.
 *
 * Authority: ../../ApplicationsAndActors.plan, ../../ReactAndHosts.plan,
 * ../../../archive/Runtime.plan and ../../../archive/Hosts.plan.
 */
