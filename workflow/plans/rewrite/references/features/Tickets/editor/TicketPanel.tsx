// Feature UI depends on exact machines/refs supplied by its host, never on app setup.
import { Result } from "effect";
import type { ActorRef } from "flow-state";
import { useActor, useActorByRef, useShallow, useView } from "flow-state/react";
import type { SessionMachine } from "../../Session/session.machine.js";
import { EditorMachine } from "./editor.machine.js";
import { editorDefinition } from "./editor.definition.js";

export function TicketPanel({ editorRef }: { editorRef: ActorRef<typeof EditorMachine> }) {
  const actor = useActorByRef(editorRef); // Lookup only. Never ensures, leases, or subscribes.

  const view = useView(
    actor,
    useShallow(({ memory, O, can }) => {
      const key = O.ticketById.key({
        workspaceId: memory.workspaceId,
        ticketId: memory.ticketId,
      });

      return {
        draft: memory.draft,
        ticket: O.ticketById.getData(key),
        resource: O.ticketById.getState(key),
        saveAllowed: can(Result.getOrThrow(editorDefinition.E.SaveRequested("eligibility-only"))),
      };
    }),
  );

  return (
    <section>
      <h2>{view.ticket?.title ?? "Repair ticket"}</h2>
      <input
        aria-label="Ticket title"
        value={view.draft}
        onChange={(event) =>
          actor.send(Result.getOrThrow(editorDefinition.E.TitleChanged(event.target.value)))
        }
      />
      <button
        disabled={!view.saveAllowed}
        onClick={() =>
          actor.send(Result.getOrThrow(editorDefinition.E.SaveRequested(crypto.randomUUID())))
        }
      >
        Save title
      </button>
      {view.resource.status === "failure" && <p role="alert">{view.resource.error.message}</p>}
    </section>
  );
}

export function LocalTicketPanel({ sessionRef }: { sessionRef: ActorRef<typeof SessionMachine> }) {
  const actor = useActor(EditorMachine, {
    input: { workspaceId: "north", ticketId: "T-42", title: "Replace lobby light" },
    contextBindings: { canEdit: sessionRef },
  });

  const draft = useView(actor, ({ memory }) => memory.draft);

  return <p>{draft}</p>;
}

/**
 * useActor prepares a fresh local actor in render; commit attaches the same ref/handle/memory.
 * Render registers nothing, subscribes to nothing, and starts no operation.
 * A changed construction identity requires a keyed remount, not mutation of this actor.
 * Cleanup suspends; reconnect resumes after finalizers without replaying finite saves.
 * Strict Mode and Activity reconnection preserve actor continuity.
 *
 * useView is the reactive read path. Its O exposes only key/getData/getState.
 * Named plain records compare fixed fields with Object.is; scalars use whole-value Object.is.
 * useShallow makes record memoization explicit. No custom comparator is accepted.
 * can(event) tests authored eligibility, not lifecycle admission or queue capacity.
 * Provider receives runtime only, never App/services/storage/startup props.
 *
 * Authority: ../../../../ReactAndHosts.plan.
 */
