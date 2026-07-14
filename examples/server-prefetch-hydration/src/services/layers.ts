import { Effect, Layer } from "effect";

import type { PokemonName, PokemonUnavailable } from "../domain/pokemon";
import { PokemonService } from "./pokemon-service";

export type PokemonServiceLayerOptions = Readonly<{
  readonly beforeRead?: Effect.Effect<void>;
  readonly failWith?: PokemonUnavailable;
  readonly onFinalize?: () => void;
}>;

export const pokemonFixture = (name: PokemonName, requestId: string) => ({
  name,
  displayName: name === "pikachu" ? "Pikachu" : "Eevee",
  sprite: `/sprites/${name}.png`,
  requestId,
});

export const createPokemonServiceLayer = (
  requestId: string,
  options: PokemonServiceLayerOptions = {},
) =>
  Layer.effect(
    PokemonService,
    Effect.acquireRelease(
      Effect.succeed(
        PokemonService.of({
          get: Effect.fn("PokemonService.get")((name: PokemonName) =>
            Effect.andThen(
              options.beforeRead ?? Effect.void,
              options.failWith === undefined
                ? Effect.succeed(pokemonFixture(name, requestId))
                : Effect.fail(options.failWith),
            ),
          ),
        }),
      ),
      () => Effect.sync(() => options.onFinalize?.()),
    ),
  );

export const PokemonClientLive = createPokemonServiceLayer("client");
