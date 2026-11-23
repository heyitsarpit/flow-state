import { samplesOf, Story } from "../../../src/host/testing/index.ts";
import { RuntimeDefaults } from "../../../src/index.ts";
import { Saved } from "../machines/saved.ts";
import { SearchPage } from "../machines/search-page.ts";
import { adaSaved, otherPage, page, searchResultsSetup } from "../results-app.ts";
import { Catalog } from "../server/catalog.ts";
import { SearchFake, SearchFakeSteadfast } from "../server/layer.ts";

/**
 * The grown search app over its port fake, with the results page ensured.
 */
export const resultsStory = (id: string) =>
  Story.app(searchResultsSetup, { id, fixtures: [SearchFake] }).ensure(page);

/**
 * "sho" shows its first page; the second page is read; back to the first, shown from what was
 * read; 40 seconds on, a refresh reads the first page again.
 */
export const resultsUsual = resultsStory("search/results-usual")
  .send(page, SearchPage.E.Search({ q: "sho" }))
  .checkpoint("first")
  .send(page, SearchPage.E.Page({ page: 1 }))
  .checkpoint("second")
  .send(page, SearchPage.E.Page({ page: 0 }))
  .checkpoint("back")
  .advance("40 seconds")
  .send(page, SearchPage.E.Refresh())
  .checkpoint("refreshed");

/**
 * Two pages show one query while its first page is on the wire: one request.
 */
export const sharedResults = resultsStory("search/shared-results")
  .ensure(otherPage)
  .world(Catalog.results.hold())
  .send(page, SearchPage.E.Search({ q: "sho" }))
  .send(otherPage, SearchPage.E.Search({ q: "sho" }))
  .checkpoint("placed")
  .world(Catalog.results.release())
  .checkpoint("shown");

/**
 * A refresh while the shown page's read is on the wire joins it; a merchant adds a product and a
 * refresh after it lands reads the page again.
 */
export const refreshJoins = resultsStory("search/refresh-joins")
  .world(Catalog.results.hold())
  .send(page, SearchPage.E.Search({ q: "sho" }))
  .send(page, SearchPage.E.Refresh())
  .checkpoint("joined")
  .world(Catalog.results.release())
  .world(Catalog.addProduct({ name: "shoe horn" }))
  .send(page, SearchPage.E.Refresh())
  .checkpoint("refreshed");

/**
 * Clearing the shown results drops them, and the placed page is read again at once.
 */
export const clearResults = resultsStory("search/clear-results")
  .send(page, SearchPage.E.Search({ q: "sho" }))
  .world(Catalog.addProduct({ name: "shoe horn" }))
  .send(page, SearchPage.E.ClearResults())
  .checkpoint("cleared");

/**
 * The page closes while its read is on the wire: nothing holds the read, so it is stopped.
 */
export const closedMidRead = resultsStory("search/closed-mid-read")
  .world(Catalog.results.hold())
  .send(page, SearchPage.E.Search({ q: "sho" }))
  .send(page, SearchPage.E.Close())
  .checkpoint("closed")
  .world(Catalog.results.release())
  .checkpoint("released");

/**
 * Over a network that never stops a results read, the page turns while page one is on the wire:
 * page one's read is told to stop and goes on; turning back holds its key again. An issue shows
 * once the disposal bound passes, and goes when that read ends.
 */
export const turnedMidRead = Story.app(searchResultsSetup, {
  id: "search/turned-mid-read",
  fixtures: [SearchFakeSteadfast],
})
  .ensure(page)
  .send(page, SearchPage.E.Search({ q: "sho" }))
  .world(Catalog.results.hold())
  .send(page, SearchPage.E.Page({ page: 1 }))
  .send(page, SearchPage.E.Page({ page: 2 }))
  .send(page, SearchPage.E.Page({ page: 1 }))
  .checkpoint("turned")
  .advance(RuntimeDefaults.disposalBound)
  .checkpoint("past bound")
  .world(Catalog.results.release())
  .checkpoint("ended");

/**
 * Ada's saved searches are on the wire when she saves one: the save's answer is written into the
 * read, and the older read's answer, asked before it, never replaces it.
 */
export const savedWriteWins = resultsStory("search/saved-write-wins")
  .world(Catalog.saved.hold({ at: "response" }))
  .ensure(adaSaved)
  .send(adaSaved, Saved.E.Save({ q: "shoes" }))
  .checkpoint("written")
  .world(Catalog.saved.release())
  .checkpoint("old answer");

/**
 * Ada saves a search and its answer is lost while her list is on the wire: the unsure save marks
 * the list stale, the older read's answer lands on nothing, and the read that follows shows the
 * saved search.
 */
export const savedUnsure = resultsStory("search/saved-unsure")
  .world(Catalog.saved.hold({ at: "response" }))
  .ensure(adaSaved)
  .world(Catalog.save.drop({ at: "response" }))
  .send(adaSaved, Saved.E.Save({ q: "shoes" }))
  .checkpoint("unsure")
  .world(Catalog.saved.release())
  .checkpoint("read again");

/**
 * What shoppers and the catalog can do around the results page and saved searches, for generated
 * runs: search, turn pages, refresh, clear and close two pages; save searches; the merchant adds
 * products; reads and saves are held, dropped and answered in any order.
 */
export const resultsSamples = samplesOf({
  id: "search-results",
  story: Story.app(searchResultsSetup, { id: "search-results/samples", fixtures: [SearchFake] }),
  names: { setup: "searchResultsSetup", fixtures: ["SearchFake"] },
  actors: { page, otherPage, adaSaved },
  servers: { Catalog },
  failures: [],
  landedFailures: [],
  values: {},
  controls: [Catalog.addProduct({ name: "shoe horn" })],
  steps: (story) =>
    story
      .send(page, SearchPage.E.Search({ q: "sho" }))
      .send(page, SearchPage.E.Search({ q: "socks" }))
      .send(page, SearchPage.E.Search({ q: "   " }))
      .send(otherPage, SearchPage.E.Search({ q: "sho" }))
      .send(page, SearchPage.E.Page({ page: 1 }))
      .send(otherPage, SearchPage.E.Page({ page: 2 }))
      .send(otherPage, SearchPage.E.Page({ page: 0 }))
      .send(page, SearchPage.E.Refresh())
      .send(otherPage, SearchPage.E.Refresh())
      .send(page, SearchPage.E.ClearResults())
      .send(page, SearchPage.E.Close())
      .send(adaSaved, Saved.E.Save({ q: "shoes" }))
      .send(adaSaved, Saved.E.Save({ q: "" })),
});

/**
 * Every results Story, by name.
 */
export const resultsStories = {
  resultsUsual,
  sharedResults,
  refreshJoins,
  clearResults,
  closedMidRead,
  turnedMidRead,
  savedWriteWins,
  savedUnsure,
};
