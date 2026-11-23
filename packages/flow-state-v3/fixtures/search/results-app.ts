import { Layer } from "effect";
import { layerIndexedDb } from "../../src/host/persistence.ts";
import { actorRef, app, runtimeSetup } from "../../src/index.ts";
import { SearchLive } from "./adapters/search.ts";
import { ResultListMachine } from "./machines/result-list.ts";
import { SavedMachine } from "./machines/saved.ts";
import { SearchPageMachine } from "./machines/search-page.ts";
import { TypeaheadMachine } from "./machines/typeahead.ts";

/**
 * The results page.
 */
export const page = actorRef(SearchPageMachine, "page");

/**
 * A second results page, in another tab of the page.
 */
export const otherPage = actorRef(SearchPageMachine, "other-page");

/**
 * Ada's saved searches.
 */
export const adaSaved = actorRef(SavedMachine, { shopper: "ada" });

/**
 * The search app grown with the results page and saved searches around the search box and its
 * result lists: every machine of the fixture.
 */
export const searchResultsApp = app({
  id: "search",
  machines: {
    box: TypeaheadMachine,
    lists: ResultListMachine,
    page: SearchPageMachine,
    saved: SavedMachine,
  },
});

/**
 * The grown search app's real setup: the search service over HTTP, with a store; each capture
 * written at once.
 */
export const searchResultsSetup = runtimeSetup({
  app: searchResultsApp,
  services: Layer.merge(SearchLive("https://search.example"), layerIndexedDb()),
  scope: "search",
  persistence: { captureMs: 0 },
});
