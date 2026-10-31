import { actorRef } from "flow-state";
import { PayMachine } from "./pay.machine.js";

// One checkout per shopper, persisted: a payment on the wire survives a closed tab and a reload (rules 44, 46).
// Its context (signed in, saved address) comes from the app's wiring default (app/app.ts).
export const payRef = actorRef(PayMachine, "checkout", { persist: true });
