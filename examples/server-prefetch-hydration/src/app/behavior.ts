import type { FlowBehaviorGateway } from "flow-state/inspect";

import { PokemonApp } from "./app";

export const BehaviorGateway: FlowBehaviorGateway = { app: PokemonApp };
