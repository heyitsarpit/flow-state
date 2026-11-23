import { Schema } from "effect";
import { resource } from "../../../src/index.ts";
import { WorkspaceApi } from "../services.ts";

/**
 * The signed-in user's profile, fresh for a minute.
 */
export const profile = resource({
  id: "Workspace/profile",
  input: { user: Schema.String },
  key: ["user"],
  services: [WorkspaceApi],
  staleTime: "1 minute",
  gcTime: "10 minutes",
  lookup: (input) => WorkspaceApi.use((api) => api.profile(input)),
});

/**
 * An org's team names, fresh for a minute.
 */
export const teams = resource({
  id: "Workspace/teams",
  input: { org: Schema.NonEmptyString },
  key: ["org"],
  services: [WorkspaceApi],
  staleTime: "1 minute",
  gcTime: "10 minutes",
  lookup: (input) => WorkspaceApi.use((api) => api.teams(input)),
});
