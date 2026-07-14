import { Effect } from "effect";

import * as flow from "flow-state";
import { withRequestRuntime } from "flow-state/server";
import type { FlowRuntimeBootPayload } from "flow-state/server";

import type { PokemonName } from "../domain/pokemon";
import { pokemonResource } from "../features/pokemon/resources";
import { createPokemonServiceLayer } from "../services/layers";
import type { PokemonServiceLayerOptions } from "../services/layers";
import { PokemonService } from "../services/pokemon-service";
import { PokemonApp } from "../app/app";

export type PokemonRequest = Readonly<{
  readonly requestId: string;
  readonly name?: PokemonName;
  readonly service?: PokemonServiceLayerOptions;
}>;

export async function createPokemonRequestBoot({
  requestId,
  name = "pikachu",
  service,
}: PokemonRequest): Promise<FlowRuntimeBootPayload> {
  const serviceLayer = createPokemonServiceLayer(requestId, service);
  const requestLayer = PokemonApp.layer({
    store: flow.store.memory(),
    orchestrators: flow.orchestrators.live(),
    services: [serviceLayer],
  });

  return withRequestRuntime(requestLayer, async (runtime) => {
    const result = await runtime.runPromise(
      Effect.match(
        Effect.flatMap(PokemonService, (pokemonService) => pokemonService.get(name)),
        {
          onFailure: (error) => ({ _tag: "Failure", error }) as const,
          onSuccess: (value) => ({ _tag: "Success", value }) as const,
        },
      ),
    );
    const ref = pokemonResource.ref(name);
    if (result._tag === "Success") {
      runtime.resources.seedResources([{ ref, value: result.value }]);
    } else {
      runtime.resources.hydrate([
        {
          ref,
          snapshot: {
            id: ref.id,
            status: "failure",
            availability: "failure",
            activity: "idle",
            freshness: "fresh",
            isPlaceholderData: false,
            updatedAt: 0,
            error: {
              _tag: result.error._tag,
              name: result.error.name,
              message: result.error.message,
            },
          },
        },
      ]);
    }
    return structuredClone(runtime.dehydrateBoot());
  });
}
