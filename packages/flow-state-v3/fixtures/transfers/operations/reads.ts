import { Schema } from "effect";
import { resource } from "../../../src/index.ts";
import { AccountsApi, AvailableApi } from "../services.ts";

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
  lookup: (input) => AccountsApi.use((api) => api.balance(input)),
});

/**
 * An account's available cents, fresh for ten seconds.
 */
export const available = resource({
  id: "Bank/available",
  // An account id is never empty.
  input: { account: Schema.String.check(Schema.isNonEmpty()) },
  key: ["account"],
  services: [AvailableApi],
  staleTime: "10 seconds",
  gcTime: "1 minute",
  lookup: (input) => AvailableApi.use((api) => api.available(input)),
});
