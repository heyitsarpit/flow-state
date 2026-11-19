import { Schema } from "effect";
import { resource } from "../../../src/index.ts";
import { ProfileApi } from "../services.ts";

/**
 * Reads the signed-in account's saved handle.
 */
export const me = resource({
  id: "Auth/me",
  input: { email: Schema.String },
  key: ["email"],
  services: [ProfileApi],
  staleTime: 0,
  gcTime: 0,
  lookup: (input) => ProfileApi.use((api) => api.me(input)),
});
