import { Effect, Layer } from "effect";
import { IdentityApi, WorkspaceApi } from "../services.ts";
import { Identity } from "./identity.ts";
import { Workspace } from "./workspace.ts";

/**
 * The port fake: `IdentityApi` over the identity provider's server, whose lost answer is the port's
 * NoResponse.
 */
export const IdentityFake = Layer.effect(
  IdentityApi,
  Effect.map(Identity, (identity) =>
    IdentityApi.of({
      signIn: (input, { idempotencyKey }) => identity.signIn({ ...input, key: idempotencyKey }),
    }),
  ),
);

/**
 * The workspace port over its fake: `WorkspaceApi` over the workspace server, whose rename carries
 * the attempt's key.
 */
export const WorkspaceFake = Layer.effect(
  WorkspaceApi,
  Effect.map(Workspace, (server) =>
    WorkspaceApi.of({
      profile: server.profile,
      teams: server.teams,
      rename: (input, { idempotencyKey }) => server.rename({ ...input, key: idempotencyKey }),
    }),
  ),
);
