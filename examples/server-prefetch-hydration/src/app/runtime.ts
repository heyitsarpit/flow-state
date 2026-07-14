import * as flow from "flow-state";
import type { FlowRuntime } from "flow-state";

import { PokemonClientAppLayer, PokemonTestAppLayer } from "./layers";
import type { PokemonService } from "../services/pokemon-service";

export const createPokemonClientRuntime = (): FlowRuntime<PokemonService> =>
  flow.runtime(PokemonClientAppLayer);
export const createPokemonTestRuntime = (): FlowRuntime<PokemonService> =>
  flow.runtime(PokemonTestAppLayer);
