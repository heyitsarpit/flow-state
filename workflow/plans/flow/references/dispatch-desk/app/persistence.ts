// Durable browser setup (Persistence plan): a scope, a KeyValueStore Layer and a version.
// IndexedDB, not localStorage: the entity store outgrows localStorage's few megabytes.
import { Layer } from "effect";
import { runtimeSetup } from "flow-state";
import { layerIndexedDb } from "flow-state/persistence";
import { DeskApp } from "./app.js";
import { DemoDeskApi } from "./demo-api.js";

export const browserSetup = (userId: string) =>
  runtimeSetup({
    app: DeskApp,
    scope: userId,
    services: Layer.mergeAll(DemoDeskApi, layerIndexedDb({ database: "dispatch-desk" })),
    persistence: { version: "1" },
  });

/**
 * What a reload restores:
 * - SessionRef and every editorRef (persist: true). An editor's memory is its draft and the ticket it
 *   names; a pending save is not in memory. It is a lane record, stored under (identity, contract, key)
 *   with the Attempt (its idempotency key), and restores as `unknown { Restored }`, so the editor opens in
 *   UNSURE and can resend the same key, unless evidence shows the request never left (rule 46).
 * - Lanes of closed editors: a write that outlived its screen keeps its record and its parked ending,
 *   adopted when the ticket is opened again (rule 44). Subject paths are stored with the lane, so a
 *   Comments post held for ticket A under the queue's preview returns to A, not to B (rule 51).
 * - Releasing marks: a lane being released (a removed attachment, a cancelled upload) is stored as
 *   releasing, so the release finishes after the reload instead of reviving the lane (rule 60).
 * - ticketById entries (persist: true) and the confirmed Ticket records they hold; never a
 *   prediction. The queue is not durable and rebuilds from the list.
 * - Memory decodes through Editor.Memory, the Schema the definition already declares. A record
 *   that fails to decode, or was written under another version, is discarded with a diagnostic.
 * - Schedules: autosave keeps its deadline; an overdue one fires once after ready().
 * - Pending merge 6 (M6 2.10): the DeskFeed (persist: true) restores its memory: the activity list, the
 *   stored cursor, the notice and the backoff, with the stream's `registered` mark. The socket session
 *   starts again from that cursor and catches up. The AssistantMachine restores ASKING with the held
 *   Attempt as `unknown { Restored }`, which ends `Cut` with no partial text. The watcher is not
 *   persisted: who is here is only true now.
 *
 * Restore never replays input, initial, events, saves or old stream values. The bytes of a dropped file
 * are not durable either: `PendingFiles` is tab memory, so a restored upload ends `FileGone`.
 * A durable editor needs a durable session (its context provider), or capture fails with
 * NonDurableContextProvider.
 *
 * Several tabs (Persistence.plan O7): ready() requests the scope's Web Lock with ifAvailable.
 * A second tab runs independently without restore or capture and reports SecondTabNoPersistence.
 * There are no mirrors, forwarded sends, peer deltas or automatic handover in v1. Without
 * navigator.locks the check is skipped and persistence proceeds.
 *
 * A different user is a new Runtime: `<FlowProvider key={userId}>`. Signing out sends SignedOut
 * and disposes with `forget: true` to remove this scope's stored records (app/host.ts).
 */
