import { actorRef } from "flow-state";
import { RosterMachine } from "./roster.machine.js";

// One roster screen per workspace. Persisted, so a merge on the wire when the admin leaves is adopted by the next
// roster screen (rule 44, O14); retained for a minute, so stepping away and back keeps it warm (P2).
export const rosterRef = (workspaceId: string) =>
  actorRef(RosterMachine, workspaceId, { persist: true, retain: "1 minute" });
