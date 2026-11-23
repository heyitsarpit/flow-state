import { Schema } from "effect";
import { resource } from "../../../src/index.ts";
import { CartViewApi } from "../services.ts";

/**
 * A whole cart, read fresh for ten seconds.
 */
export const cart = resource({
  id: "Shop/cart",
  input: { cartId: Schema.String },
  key: ["cartId"],
  services: [CartViewApi],
  staleTime: "10 seconds",
  gcTime: "1 minute",
  lookup: (input) => CartViewApi.use((api) => api.cart(input)),
});
