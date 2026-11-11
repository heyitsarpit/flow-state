import { actorRef } from "flow-state";
import { ShopperMachine } from "./shopper.machine.js";

export const ShopperRef = actorRef(ShopperMachine, "shopper", { persist: true });
