import { actorRef } from "flow-state";
import { ToastsMachine } from "./toasts.machine.js";

// A shared actor named by a ref; any machine may send it public events.
export const ToastsRef = actorRef(ToastsMachine, "toasts");
