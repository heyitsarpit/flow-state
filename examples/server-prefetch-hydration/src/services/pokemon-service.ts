import { Context, Effect } from "effect";

import type { Pokemon, PokemonName, PokemonUnavailable } from "../domain/pokemon";

export interface PokemonServiceShape {
  readonly get: (name: PokemonName) => Effect.Effect<Pokemon, PokemonUnavailable>;
}

export class PokemonService extends Context.Service<PokemonService, PokemonServiceShape>()(
  "server-prefetch-hydration/PokemonService",
) {}
