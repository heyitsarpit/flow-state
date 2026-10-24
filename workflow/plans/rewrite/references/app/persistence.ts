import { Effect } from "effect";
import {
  indexedDbStorage,
  persistence,
  runtimeSetup,
  webStorage,
  type PersistenceStorage,
} from "flow-state";
import { DeskApp } from "./app.js";
import { DemoImplementation } from "./implementation.js";

/**
 * Optional durable browser setup for Dispatch Desk.
 * Target API: persistence routes/types are deferred until owner proofs permit restoration.
 */

export function browserSetup(storage: Storage) {
  return runtimeSetup({
    app: DeskApp,
    implementation: DemoImplementation,
    persistence: persistence({
      storage: webStorage(storage),
      scope: "dispatch-desk:user-42",
      filter: ({ kind }) => kind !== "stream",
    }),
  });
}

export function memoryStorage(): PersistenceStorage {
  let stored: Uint8Array | undefined;

  return {
    read: () => Effect.sync(() => stored?.slice()),
    write: (value) =>
      Effect.sync(() => {
        stored = value.slice();
      }),
    remove: () =>
      Effect.sync(() => {
        stored = undefined;
      }),
  };
}

// The adapter input is intentionally inferred instead of inventing IndexedDBStorage members.
export function indexedDbSetup(storage: Parameters<typeof indexedDbStorage>[0]) {
  return runtimeSetup({
    app: DeskApp,
    implementation: DemoImplementation,
    persistence: persistence({
      storage: indexedDbStorage(storage),
      scope: "dispatch-desk:user-42",
    }),
  });
}

/**
 * Browser caller: browserSetup(window.localStorage).construct(), then runtime.ready().
 * Synchronous construction performs no I/O. Read/decode validation precedes service acquisition.
 * Runtime owns restore, ordered writes, and final flush; React receives that Runtime afterward.
 *
 * SessionRef and EditorRef both opt in with persist:true in app/actors.ts.
 * ticketById and saveTitle separately opt in in features/Tickets/ticket.operations.ts. All defaults are false.
 * A durable operation never makes a local actor durable. Filters only exclude declared data.
 * A durable editor requires its exact transitive session provider to be durable too.
 * NonDurableContextProvider cannot be fixed by silently substituting or rebinding providers.
 * ConcurrentCapture instead means retryable context/cut conflict.
 *
 * Default codec: bounded canonical JSON; the sample Ticket and memory need no custom codec.
 * Custom codec option: { encode(value, slot), decode(value, slot) }, synchronous and pure.
 * Validate only application-owned opaque values (for example Date <-> ISO text), not Flow's
 * complete envelope. Slot member spelling is unspecified, so no fabricated discriminator appears.
 * No Effect, storage I/O, actor creation, or work execution belongs inside a codec.
 * PersistenceCodec/PersistenceSlot/PersistenceValue/PersistenceEntry describe these boundaries;
 * their remaining member layouts are listed in api-reference.ts.
 *
 * Restore retains memory without fresh input/initializer replay. Canonical entries remain passive
 * until live executable parameters exist. Never reconstruct parameters from K.
 * Pending remote saves restore unknown/reconcileRequired unless non-invocation is established.
 * Never replay finite lookup/commit, old stream emissions, or context-change events.
 * Running streams may rematerialize from live parameters in a fresh generation; terminal ones do not.
 *
 * A failed write preserves committed live truth and the last good stored record. It cannot fail an
 * already-published turn retroactively. Disposal finalizes the latest accepted write.
 * Runtime persistence never replaces the remote adapter's durable idempotency journal.
 * Concurrent writers/cross-tab synchronization and automatic migrations are not specified.
 *
 * Authority: ../../Persistence.plan, ../../Transactions.plan, ../../../archive/Artifacts.plan.
 */
