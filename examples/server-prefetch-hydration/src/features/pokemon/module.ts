import * as flow from "flow-state";

import { pokemonResource } from "./resources";

export const PokemonModule = flow.module("Pokemon", {
  resources: { detail: pokemonResource },
});
