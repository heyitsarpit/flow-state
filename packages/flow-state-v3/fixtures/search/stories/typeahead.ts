import { Fake, samplesOf, Story } from "../../../src/host/testing/index.ts";
import { box, otherBox, searchSetup } from "../app.ts";
import { ResultListMachine } from "../machines/result-list.ts";
import { Typeahead } from "../machines/typeahead.ts";
import { Catalog } from "../server/catalog.ts";
import { SearchFake } from "../server/layer.ts";

/**
 * The search app over its port fake, with the search box ensured.
 */
export const searchStory = (id: string) =>
  Story.app(searchSetup, { id, fixtures: [SearchFake] }).ensure(box);

const typed = (text: string) => Typeahead.E.Type({ text });

const LONG_QUERY = "shoes, running and trail and more";

/**
 * Three keystrokes while every suggestion request is on the wire: only the last query's
 * suggestions show, and the two older requests are stopped.
 */
export const latestWins = searchStory("search/latest-wins")
  .world(Catalog.suggest.hold(), Catalog.suggest.hold(), Catalog.suggest.hold())
  .send(box, typed("s"))
  .send(box, typed("sh"))
  .send(box, typed("sho"))
  .checkpoint("typed")
  .world(Catalog.suggest.release(), Catalog.suggest.release(), Catalog.suggest.release())
  .checkpoint("settled");

/**
 * "shoe", then "shoes", then "shoe" and "shoes" again 30 seconds later: each repeat is shown from
 * what was read. Two minutes on, nobody having shown "shoe" for over a minute, it was dropped, so
 * typing it again reads it.
 */
export const repeatQuery = searchStory("search/repeat-query")
  .send(box, typed("shoe"))
  .send(box, typed("shoes"))
  .checkpoint("moved on")
  .advance("30 seconds")
  .send(box, typed("shoe"))
  .send(box, typed("shoes"))
  .checkpoint("repeated")
  .advance("2 minutes")
  .checkpoint("collected")
  .send(box, typed("shoe"))
  .checkpoint("read again");

/**
 * Two search boxes type the same query while its request is on the wire: one request, and both
 * show its suggestions.
 */
export const twoBoxes = searchStory("search/two-boxes")
  .ensure(otherBox)
  .world(Catalog.suggest.hold())
  .send(box, typed("sho"))
  .send(otherBox, typed("sho"))
  .checkpoint("typed")
  .world(Catalog.suggest.release())
  .checkpoint("settled");

/**
 * Spaces only: the suggestion read's input fails its Schema, nothing is asked, and the box shows
 * none.
 */
export const blankQuery = searchStory("search/blank-query")
  .send(box, typed("   "))
  .checkpoint("refused");

/**
 * "shoes, running" typed a key at a time, fourteen keystrokes, the first while its request is held.
 */
export const typingBurst = Array.from("shoes, running")
  .reduce(
    (story, _, n) => story.send(box, typed("shoes, running".slice(0, n + 1))),
    searchStory("search/stress-typing-burst").world(Catalog.suggest.hold()),
  )
  .checkpoint("typed")
  .world(Catalog.suggest.release())
  .checkpoint("settled");

/**
 * Result lists a view makes for itself, a first guess the bench re-measures.
 */
export const LISTS = 64;

/**
 * {@link LISTS} result lists, each made by a view for the same query while its first page is on
 * the wire: one request serves them all (S2 under one read).
 */
export const manyLists = Array.from({ length: LISTS }, (_, n) => n)
  .reduce(
    (story, n) => story.create(ResultListMachine, { input: { list: `view-${String(n)}` } }),
    searchStory("search/stress-many-lists").world(Catalog.results.hold()),
  )
  .checkpoint("made")
  .world(Catalog.results.release())
  .checkpoint("shown");

/**
 * The app booted without the search service its reads list: refused at boot, by name.
 */
export const missingSearch = () =>
  // @ts-expect-error Operations O1: a setup that lacks a listed service does not compile
  Story.app(searchSetup, { id: "search/missing-search", fixtures: [] })
    .ensure(box)
    .checkpoint("booted");

/**
 * The stress run the search box samples print from seed 36: blank queries among real ones, held
 * and dropped requests whose cleanups die, a forgotten box, reloads and an offline spell.
 */
export const seededStress = Story.app(searchSetup, {
  id: "search-box/stress-36",
  fixtures: [SearchFake],
})
  .ensure(box)
  .ensure(otherBox)
  .send(otherBox, typed("sho"))
  .send(otherBox, typed("sho"))
  .world(Catalog.suggest.hold(), Catalog.suggest.cleanup("dies"))
  .send(box, typed("sho"))
  .world(Catalog.suggest.drop())
  .world(Catalog.addProduct({ name: "shoe horn" }))
  .send(box, typed("s"))
  .world(Catalog.suggest.hold())
  .send(box, typed("   "))
  .world(Catalog.suggest.hold(), Catalog.suggest.cleanup("dies"))
  .send(otherBox, typed("sho"))
  .send(otherBox, typed("sho"))
  .send(otherBox, typed("sho"))
  .reload({ reattach: false })
  .send(box, typed("sho"))
  .send(box, typed("   "))
  .send(box, typed("sho"))
  .send(otherBox, typed("sho"))
  .send(box, typed("s"))
  .send(box, typed("   "))
  .send(box, typed(LONG_QUERY))
  .send(otherBox, typed("sho"))
  .send(box, typed(LONG_QUERY))
  .send(box, typed("   "))
  .world(Fake.network.offline())
  .send(otherBox, typed("sho"))
  .dispose(box, { how: "forget" })
  .world(Catalog.addProduct({ name: "shoe horn" }))
  .send(box, typed(LONG_QUERY))
  .send(box, typed("sho"))
  .advance("20 millis")
  .disposeRuntime()
  .reload()
  .advance("7 millis")
  .send(box, typed("sho"))
  .advance("20 millis")
  .send(box, typed("   "))
  .advance("3 millis")
  .send(box, typed("s"))
  .send(otherBox, typed("sho"))
  .advance("16 millis")
  .send(otherBox, typed("sho"))
  .send(otherBox, typed("sho"))
  .send(box, typed(LONG_QUERY))
  .send(box, typed("sho"))
  .send(box, typed(LONG_QUERY))
  .send(otherBox, typed("sho"))
  .send(otherBox, typed("sho"))
  .send(box, typed("   "))
  .send(box, typed("s"))
  .advance("5 millis")
  .send(box, typed("   "))
  .advance("2 millis")
  .send(otherBox, typed("sho"))
  .advance("17 millis")
  .send(box, typed("   "))
  .send(box, typed(LONG_QUERY))
  .send(box, typed(LONG_QUERY))
  .advance("18 millis")
  .send(box, typed("s"))
  .send(box, typed("sho"))
  .send(box, typed("sho"))
  .send(box, typed("s"))
  .send(box, typed("sho"))
  .send(box, typed("s"))
  .world(Fake.storage.refuseLoad())
  .reload({ reattach: false })
  .advance("4 millis")
  .send(box, typed("sho"))
  .advance("10 millis")
  .send(otherBox, typed("sho"))
  .send(box, typed(LONG_QUERY))
  .send(box, typed("   "))
  .send(box, typed("sho"))
  .send(box, typed("   "))
  .send(box, typed("s"))
  .send(box, typed("s"))
  .send(box, typed("s"))
  .send(otherBox, typed("sho"))
  .send(box, typed("sho"))
  .send(box, typed("s"))
  .send(box, typed(LONG_QUERY))
  .advance("20 millis")
  .send(otherBox, typed("sho"))
  .send(otherBox, typed("sho"))
  .send(box, typed("   "))
  .send(box, typed(LONG_QUERY))
  .advance("15 millis")
  .send(box, typed("s"))
  .send(box, typed("   "))
  .send(box, typed(LONG_QUERY))
  .advance("8 millis")
  .send(box, typed("   "))
  .send(otherBox, typed("sho"))
  .advance("7 millis")
  .send(box, typed("s"))
  .send(box, typed(LONG_QUERY))
  .send(otherBox, typed("sho"))
  .advance("15 millis")
  .send(box, typed("s"))
  .advance("15 millis")
  .send(box, typed("s"))
  .advance("56438 millis")
  .world(Fake.network.online())
  .advance("2 minutes")
  .world(Catalog.suggest.release())
  .world(Catalog.suggest.release())
  .world(Catalog.suggest.release())
  .advance("2 minutes")
  .advance("2 minutes");

/**
 * Every search box Story, by name.
 */
export const typeaheadStories = {
  latestWins,
  repeatQuery,
  twoBoxes,
  blankQuery,
  typingBurst,
  manyLists,
  seededStress,
};

/**
 * What a shopper and the catalog can do around the search box, for generated runs: type queries
 * (blank, one letter, a long one), in either box; the merchant adds a product.
 */
export const typeaheadSamples = samplesOf({
  id: "search-box",
  story: Story.app(searchSetup, { id: "search-box/samples", fixtures: [SearchFake] }),
  names: { setup: "searchSetup", fixtures: ["SearchFake"] },
  actors: { box, otherBox },
  servers: { Catalog },
  failures: [],
  landedFailures: [],
  values: {},
  controls: [Catalog.addProduct({ name: "shoe horn" })],
  steps: (story) =>
    story
      .send(box, typed("s"))
      .send(box, typed("sho"))
      .send(box, typed("   "))
      .send(box, typed(LONG_QUERY))
      .send(otherBox, typed("sho")),
});
