import { actorRef } from "flow-state";
import { DeskFeedMachine } from "./feed.machine.js";

// One feed per workspace, persisted. The memory (activity, the cursor, the notice, the backoff and
// the stream's `registered` mark) is what a reload restores; the session itself starts again, from
// the stored cursor (pending merge 6: M6 2.10).
export const feedRef = (workspaceId: string) =>
  actorRef(DeskFeedMachine, workspaceId, { persist: true });
