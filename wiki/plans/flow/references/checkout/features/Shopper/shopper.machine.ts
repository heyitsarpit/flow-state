import { machine } from "flow-state";
import { Shopper } from "./shopper.definition.js";

export const ShopperMachine = machine(Shopper, ({ S }) => ({
  default: S.GUEST,
  on: {
    SignedIn: {
      target: S.SIGNED_IN,
      updateMemory: ({ event }) => ({ customerId: event.customerId, savedAddress: event.address }),
    },
    SignedOut: { target: S.GUEST, updateMemory: () => ({ customerId: null, savedAddress: null }) },
  },
  states: { GUEST: {}, SIGNED_IN: {} },
}));
