import { Effect } from "effect";

import { createKey } from "flow-state";
import * as flow from "flow-state";

import type { Pokemon, PokemonName, PokemonUnavailable } from "../../domain/pokemon";
import { PokemonService } from "../../services/pokemon-service";

export const pokemonResource = flow.resource<
  [PokemonName],
  Pokemon,
  PokemonUnavailable,
  Effect.Effect<Pokemon, PokemonUnavailable, PokemonService>,
  "pokemon.detail"
>({
  id: "pokemon.detail",
  key: (name: PokemonName) => createKey("pokemon", "detail", name),
  lookup: (name: PokemonName) => Effect.flatMap(PokemonService, (service) => service.get(name)),
  freshness: { staleAfter: "1 minute", onInvalidate: "active" },
});
