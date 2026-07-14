import * as flow from "flow-state";
import type { FlowAppDefinition } from "flow-state";

import { PokemonModule } from "../features/pokemon/module";

type PokemonModules = readonly [typeof PokemonModule];

export const PokemonApp: FlowAppDefinition<PokemonModules> = flow.app({
  modules: [PokemonModule] as const,
});
