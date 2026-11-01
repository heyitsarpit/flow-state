import { actorRef } from "flow-state";
import { FindMachine } from "./find.machine.js";

// One palette per workspace. Not persisted: a half-typed query is not worth keeping across a reload.
export const findRef = (workspaceId: string) => actorRef(FindMachine, workspaceId);
