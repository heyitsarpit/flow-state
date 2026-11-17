import { Effect, Schema } from "effect";
import { resource } from "../../../src/index.ts";
import { GitApi } from "../services.ts";

/**
 * Reads a repository's remote head.
 */
export const remoteHead = resource({
  id: "Git/remote-head",
  input: { repo: Schema.String },
  key: ["repo"],
  services: [GitApi],
  staleTime: 0,
  gcTime: 0,
  lookup: (input) => Effect.flatMap(Effect.service(GitApi), (api) => api.remoteHead(input)),
});
