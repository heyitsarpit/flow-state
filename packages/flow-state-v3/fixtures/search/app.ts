import { Layer } from "effect";
import { layerIndexedDb } from "../../src/host/persistence.ts";
import { actorRef, app, runtimeSetup } from "../../src/index.ts";
import { SearchLive } from "./adapters/search.ts";
import { ResultListMachine } from "./machines/result-list.ts";
import { TypeaheadMachine } from "./machines/typeahead.ts";

/**
 * The search box.
 */
export const box = actorRef(TypeaheadMachine, "box");

/**
 * A second search box, in another tab of the page.
 */
export const otherBox = actorRef(TypeaheadMachine, "other-box");

/**
 * The `n`th of many search boxes.
 */
export const boxOf = (n: number) => actorRef(TypeaheadMachine, `box-${String(n)}`);

/**
 * The search app: the search box.
 */
export const searchApp = app({
  id: "search",
  machines: { box: TypeaheadMachine, lists: ResultListMachine },
});

/**
 * The search app's real setup: the search service over HTTP, with a store; each capture written at
 * once.
 */
export const searchSetup = runtimeSetup({
  app: searchApp,
  services: Layer.merge(SearchLive("https://search.example"), layerIndexedDb()),
  scope: "search",
  persistence: { captureMs: 0 },
});
