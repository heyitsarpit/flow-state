import { actorRef } from "flow-state";
import { TechniciansMachine } from "./technicians.machine.js";

// One panel per workspace, beside the queue. Not persisted: who is free is only true now.
export const techniciansRef = (workspaceId: string) => actorRef(TechniciansMachine, workspaceId);
