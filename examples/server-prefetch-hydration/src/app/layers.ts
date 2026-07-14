import * as flow from "flow-state";

import { PokemonClientLive } from "../services/layers";
import { PokemonApp } from "./app";

export const PokemonClientAppLayer = PokemonApp.layer({
  store: flow.store.memory(),
  orchestrators: flow.orchestrators.live(),
  services: [PokemonClientLive],
});

export const PokemonTestAppLayer = PokemonApp.layer({
  store: flow.store.test(),
  orchestrators: flow.orchestrators.test(),
  services: [PokemonClientLive],
});
