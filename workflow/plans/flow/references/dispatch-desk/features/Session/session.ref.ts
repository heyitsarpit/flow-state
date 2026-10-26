import { actorRef } from "flow-state";
import { SessionMachine } from "./session.machine.js";

export const SessionRef = actorRef(SessionMachine, "coordinator", { persist: true });
