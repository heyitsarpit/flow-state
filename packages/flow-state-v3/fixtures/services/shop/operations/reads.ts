import { Schema } from "effect";
import { resource } from "../../../../src/index.ts";
import { ShopApi } from "../services.ts";

/**
 * Reads an intent's status.
 */
export const intentStatus = resource({
  id: "Checkout/intent-status",
  input: { intentId: Schema.String },
  key: ["intentId"],
  services: [ShopApi],
  staleTime: 0,
  gcTime: 0,
  lookup: (input) => ShopApi.use((api) => api.intent(input)),
});

/**
 * Reads a cart's order, null when it has none.
 */
export const orderForCart = resource({
  id: "Checkout/order-for-cart",
  input: { cartId: Schema.String },
  key: ["cartId"],
  services: [ShopApi],
  staleTime: 0,
  gcTime: 0,
  lookup: (input) => ShopApi.use((api) => api.orderFor(input)),
});
