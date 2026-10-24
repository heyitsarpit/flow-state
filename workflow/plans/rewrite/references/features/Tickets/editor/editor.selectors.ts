import { Result } from "effect";
import { can, type ActorSnapshot, type CanonicalKeyInput } from "flow-state";
import type { EditorMachine } from "./editor.machine.js";
import { editorDefinition } from "./editor.definition.js";

/** Passive reads: these functions start no work and retain their captured snapshot cut. */

export function ticketView(snapshot: ActorSnapshot<typeof EditorMachine>) {
  const key = snapshot.O.ticketById.key({
    workspaceId: snapshot.memory.workspaceId,
    ticketId: snapshot.memory.ticketId,
  });

  const data = snapshot.O.ticketById.getData(key); // Ticket | undefined; missing does not fetch.
  const resource = snapshot.O.ticketById.getState(key);

  const saveKey = snapshot.O.saveTitle.key({
    workspaceId: snapshot.memory.workspaceId,
    ticketId: snapshot.memory.ticketId,
    title: snapshot.memory.draft,
    requestId: "view-only",
  });

  const save = snapshot.O.saveTitle.getState(saveKey);
  const eligible = can(snapshot, Result.getOrThrow(editorDefinition.E.SaveRequested("view-only")));

  let resourceTitle: string | undefined;

  if ("data" in resource) resourceTitle = resource.data.title;

  const resourceError = resource.status === "failure" ? resource.error.message : undefined;
  const savedTitle = save.status === "success" ? save.value.title : undefined;
  const saveError = save.status === "failure" ? save.error.message : undefined;
  const requiresReconciliation = save.status === "unknown" && save.reconcileRequired;

  return {
    data,
    resource,
    save,
    eligible,
    resourceTitle,
    resourceError,
    savedTitle,
    saveError,
    requiresReconciliation,
  };
}

export const exampleKey: CanonicalKeyInput = ["north", "T-42"];

/**
 * Key(P) separates executable parameters from canonical identity K.
 * Include every result-changing tenant/account/permission discriminator. Never embed raw secrets.
 * Allowed: null, booleans, finite numbers, strings, dense arrays, plain records.
 * Reject undefined/functions/classes/cycles/accessors/non-finite numbers before work.
 * Keys are copied/frozen; source mutation cannot rename work. Record insertion order is irrelevant.
 * Bounds: 16 nested levels, 256 value nodes, 8192 UTF-8 bytes. No custom hash/equality.
 *
 * Resource state lanes: missing, pending, ready, refreshing, failure, defect, interrupted.
 * Missing has no generation/data. Pending has generation only. Ready/refreshing have data.
 * Failure has typed error; defect has defect. Failure/defect/interrupted may retain data.
 * Undefined means absence or declined updater, never an admitted resource success value.
 *
 * Transaction lanes: idle, pending, success, failure, defect, interrupted, unknown.
 * Idle has no generation. Success has value; failure error; unknown reconcileRequired:true.
 * Exact families expose no history, registry, occurrence handle, transaction getData, or retry.
 *
 * All operation authoring calls in features/Tickets/editor/editor.machine.ts construct inert plans.
 * Finite lookup/refetch/commit/cancel/write plans execute only when returned by accepted events.
 * Continuing subscribe belongs in activities/onMemory; a read or unreturned plan starts nothing.
 *
 * Additional setData updater fragment inside an accepted event action:
 *   O.ticketById.setData([memory.workspaceId, memory.ticketId], (base) =>
 *     base ? { ...base, title: memory.draft } : undefined)
 * Updaters read committed base; undefined declines. This is authoritative, not an optimistic option.
 * Canonical writes fence older lookups. Transaction completion writes precede mapped outcome events.
 * Another actor sees canonical data, never another actor's optimistic layer or local draft.
 * Preview behavior exists in the Plans, but no authoring option is specified; do not invent one.
 *
 * invalidate([O.ticketById,K]) retains data, marks stale, starts no lookup directly.
 * clear([O.ticketById,K]) removes/fences data; surviving subscriptions may reacquire.
 * invalidate(O.ticketById) targets an admitted family. Tag syntax remains unresolved.
 * Whole-batch validation prevents a valid-prefix write; missing exact targets are no-ops.
 *
 * Explicit transaction concurrency, same actor/descriptor/K:
 * reject: decline a second active attempt, consuming no occurrence.
 * cancel: cancel prior, admit replacement; allow: independent generations/current projection fence.
 * serialize: FIFO; canceled queued work never starts its adapter. Omitted default is unresolved.
 * Cancellation after adapter invocation yields conservative unknown/reconcileRequired.
 * The remote adapter journals requestId before dispatch and reconciles with that same identity.
 *
 * Resource outcome names: finite success(A)/failure(E)/defect()/interrupt(); continuing uses value(A).
 * Mapper container is unresolved. E=never forbids a failure mapper. Planned release maps no interrupt.
 * Archive policy examples: staleTime:"30 seconds", gcTime:"5 minutes". They establish no defaults.
 * Complete duration domain and tag/placeholder authoring remain Resources.Q1.
 *
 * Authority: ../../../../Resources.plan, ../../../../Transactions.plan, ../../../../../archive/Operations.plan.
 */
