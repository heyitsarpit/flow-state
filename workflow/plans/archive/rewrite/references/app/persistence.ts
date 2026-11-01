// Optional durable browser setup. Target API: persistence exports are deferred until owner proofs.
import { Effect } from "effect";
import { indexedDbStorage, runtimeSetup, webStorage, type PersistenceStorage } from "flow-state";
import { DeskApp } from "./app.js";
import { DemoTicketApi } from "./demo-api.js";

// A plain options object (D21). What persists is decided only by persist flags on refs and
// resources; there is no filter.
export function browserSetup(storage: Storage) {
  return runtimeSetup({
    app: DeskApp,
    services: DemoTicketApi,
    persistence: { storage: webStorage(storage), scope: "dispatch-desk:user-42", version: "1" },
  });
}

export function indexedDbSetup(storage: Parameters<typeof indexedDbStorage>[0]) {
  return runtimeSetup({
    app: DeskApp,
    services: DemoTicketApi,
    persistence: {
      storage: indexedDbStorage(storage),
      scope: "dispatch-desk:user-42",
      version: "1",
    },
  });
}

export function memoryStorage(): PersistenceStorage {
  let stored: Uint8Array | undefined;

  return {
    read: () => Effect.sync(() => stored?.slice()),
    write: (value) => Effect.sync(() => void (stored = value.slice())),
    remove: () => Effect.sync(() => void (stored = undefined)),
  };
}

/**
 * What a reload restores here:
 * - SessionRef and EditorRef (persist: true), including the editor's save facts, which follow
 *   the actor (D34). The editor's technician stream opted out with persist: false.
 * - ticketById cache data (persist: true, encoded with its Ticket Schema). ticketList is not
 *   persisted, and QueueRef is not durable.
 * - Memory decodes through Editor.Memory, the Schema the definition already declares (D45/D55),
 *   so no hand-written codec is needed for these values.
 *
 * A durable editor needs its session provider to be durable too; a non-durable provider fails
 * capture with NonDurableContextProvider. Restore never replays input, initial, saves or old
 * stream values. A pending save restores as Unknown (reconciliation required) unless evidence
 * shows the request was never sent. Bump `version` when stored shapes change incompatibly.
 */
