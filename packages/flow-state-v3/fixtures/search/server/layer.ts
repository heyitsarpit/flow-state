import { Effect, Layer } from "effect";
import { SearchApi } from "../services.ts";
import { Catalog } from "./catalog.ts";

const searchApi = (steadfast: boolean) =>
  Effect.map(Catalog, (catalog) =>
    SearchApi.of({
      suggest: catalog.suggest,
      results: (input) =>
        steadfast ? Effect.uninterruptible(catalog.results(input)) : catalog.results(input),
      saved: catalog.saved,
      save: (input, { idempotencyKey }) => catalog.save({ ...input, key: idempotencyKey }),
    }),
  );

/**
 * The search port over the catalog server; a lost answer is the port's NoResponse.
 */
export const SearchFake = Layer.effect(SearchApi, searchApi(false));

/**
 * The search port over a network that will not stop a results read once sent, as a fetch whose
 * abort the server never sees.
 */
export const SearchFakeSteadfast = Layer.effect(SearchApi, searchApi(true));
