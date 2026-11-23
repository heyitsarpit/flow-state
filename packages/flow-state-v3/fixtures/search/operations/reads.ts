import { Schema } from "effect";
import { resource } from "../../../src/index.ts";
import { Query, SearchApi } from "../services.ts";

/**
 * Suggestions for what is typed. They change rarely, so a query asked again within ten minutes
 * shows what was read; but a box sees many queries, so one nobody shows is dropped after a minute.
 */
export const suggestions = resource({
  id: "Search/suggestions",
  input: { q: Query },
  key: ["q"],
  services: [SearchApi],
  staleTime: "10 minutes",
  gcTime: "1 minute",
  lookup: (input) => SearchApi.use((api) => api.suggest(input)),
});

/**
 * One page of results, fresh for 30 seconds and kept five minutes after the last page leaves.
 */
export const results = resource({
  id: "Search/results",
  input: { q: Query, page: Schema.Int },
  key: ["q", "page"],
  services: [SearchApi],
  staleTime: "30 seconds",
  gcTime: "5 minutes",
  lookup: (input) => SearchApi.use((api) => api.results(input)),
});

/**
 * The searches a shopper saved.
 */
export const saved = resource({
  id: "Search/saved",
  input: { shopper: Schema.String },
  key: ["shopper"],
  services: [SearchApi],
  staleTime: "1 minute",
  gcTime: "1 minute",
  lookup: (input) => SearchApi.use((api) => api.saved(input)),
});
