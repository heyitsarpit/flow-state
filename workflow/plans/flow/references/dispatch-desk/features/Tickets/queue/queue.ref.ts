import { actorRef } from "flow-state";
import { QueueMachine } from "./queue.machine.js";

// One queue per workspace. Not persisted: it rebuilds from the list after a reload. Its
// session wiring is the app's default for the queue machine.
export const queueRef = (workspaceId: string) => actorRef(QueueMachine, workspaceId);
