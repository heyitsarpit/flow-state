import { actorRef } from "flow-state";
import { PanelsMachine } from "./panels.machine.js";

// One panel column per workspace window. Persisted, so a reload keeps which tab was open, the frozen slices (with
// their deadlines and parked endings) and a pin still on the wire (rule 46).
export const panelsRef = (workspaceId: string) =>
  actorRef(PanelsMachine, workspaceId, { persist: true });
