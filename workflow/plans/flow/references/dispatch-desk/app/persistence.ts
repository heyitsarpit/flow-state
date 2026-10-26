// Durable browser setup (Persistence plan): a KeyValueStore Layer plus a scope and a version.
// IndexedDB, not localStorage: the entity store outgrows localStorage's few megabytes.
import { Layer } from "effect";
import { runtimeSetup } from "flow-state";
import { layerIndexedDb } from "flow-state/persistence";
import { DeskApp } from "./app.js";
import { DemoTicketApi } from "./demo-api.js";

export const browserSetup = (userId: string) =>
  runtimeSetup({
    app: DeskApp,
    services: Layer.mergeAll(DemoTicketApi, layerIndexedDb({ database: "dispatch-desk" })),
    persistence: { scope: `dispatch-desk:${userId}`, version: "1" },
  });

/**
 * What a reload restores:
 * - SessionRef and every editorRef (persist: true), including an editor's pending save, which
 *   follows its actor and restores as unknown (with its attempt, so it can be retried) unless
 *   evidence shows it was never sent.
 * - ticketById entries (persist: true) and the confirmed Ticket records they hold; never a
 *   prediction. The queue is not durable and rebuilds from the list.
 * - Memory decodes through Editor.Memory, the Schema the definition already declares. A record
 *   that fails to decode, or was written under another version, is discarded with a diagnostic.
 * - Schedules: autosave keeps its deadline; an overdue one fires once after ready().
 *
 * Restore never replays input, initial, events, saves or old stream values. A durable editor
 * needs a durable session (its context provider), or capture fails with
 * NonDurableContextProvider.
 *
 * Several tabs (binding ruling 38): ready() requests the scope's Web Lock with ifAvailable.
 * A second tab runs independently without restore or capture and reports SecondTabNoPersistence.
 * There are no mirrors, forwarded sends, peer deltas or automatic handover in v1. Without
 * navigator.locks the check is skipped and persistence proceeds.
 *
 * A different user is a new Runtime: `<FlowProvider key={userId}>`. Signing out sends SignedOut
 * and disposes with `forget: true` to remove this scope's stored records (app/host.ts).
 */
