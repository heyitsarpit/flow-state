import { Effect, Schema } from "effect";
import { resource } from "../../../src/index.ts";
import { AccountsApi } from "../services.ts";

/**
 * Reads an account's balance in cents.
 */
export const balance = resource({
  id: "Bank/balance",
  input: { account: Schema.String },
  key: ["account"],
  services: [AccountsApi],
  staleTime: 0,
  gcTime: 0,
  lookup: (input) => Effect.flatMap(Effect.service(AccountsApi), (api) => api.balance(input)),
});
