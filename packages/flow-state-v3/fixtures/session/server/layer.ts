import { Effect, Layer } from "effect";
import { IdentityApi } from "../services.ts";
import { Identity } from "./identity.ts";

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
