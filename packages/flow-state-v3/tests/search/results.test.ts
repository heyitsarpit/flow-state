import { describe, expect, it } from "vite-plus/test";
import { adaSaved, otherPage, page } from "../../fixtures/search/results-app.ts";
import {
  clearResults,
  closedMidRead,
  refreshJoins,
  resultsUsual,
  savedUnsure,
  savedWriteWins,
  sharedResults,
  turnedMidRead,
} from "../../fixtures/search/stories/results.ts";
import { Catalog } from "../../fixtures/search/server/catalog.ts";
import type { Cut } from "../../src/host/testing/index.ts";

// The results page and saved searches: placements (`O.x.subscribe` in a state's `activities`),
// `refetch`, `clear`, a save's `writes` and `invalidate`. Expected results are the entry
// table and slot cells of Operations' `algorithm`: a placement holds its entry and asks with no
// waiter; a fresh entry serves; Ask Refetch joins a current request; Clear drops data and starts
// a request for a placed entry; the last hold leaving a Running entry releases its call; Written
// lands at once and no request asked before it lands after it (R4, I7); Invalidate on a Running
// placed entry wants one trailing request (`again`), the behind answer lands nothing.

const results = (cut: Cut) =>
  cut.read(Catalog.results).map((c) => `${c.input.q}#${String(c.input.page)}`);

describe("the results page's placed read (Operations R3, R4, R5; placements)", () => {
  it("Operations O2, entry table (Ask Lookup by a placement; fresh): pages read when missing, the first page shown again from what was read, a refresh after 40 seconds reads it again", async () => {
    const run = await resultsUsual.run();

    expect(run.checkpoints.first.read(page)?.memory.rows).toEqual(["shoe rack", "shoes, running"]);
    expect(run.checkpoints.second.read(page)?.memory.rows).toEqual(["shoes, trail", "shorts"]);
    expect(results(run.checkpoints.back)).toEqual(["sho#0", "sho#1"]);
    expect(run.checkpoints.back.read(page)?.memory.rows).toEqual(["shoe rack", "shoes, running"]);
    expect(results(run.checkpoints.refreshed)).toEqual(["sho#0", "sho#1", "sho#0"]);
  });

  it("Operations R3: two pages placing one query and page share one request", async () => {
    const run = await sharedResults.run();

    expect(results(run.checkpoints.placed)).toEqual(["sho#0"]);
    expect([page, otherPage].map((ref) => run.checkpoints.shown.read(ref)?.memory.rows)).toEqual([
      ["shoe rack", "shoes, running"],
      ["shoe rack", "shoes, running"],
    ]);
  });

  it("Operations, entry table (Ask Refetch, Running current; Idle): a refresh joins the read on the wire, and after it lands reads again", async () => {
    const run = await refreshJoins.run();

    expect(results(run.checkpoints.joined)).toEqual(["sho#0"]);
    expect(results(run.checkpoints.refreshed)).toEqual(["sho#0", "sho#0"]);
    expect(run.checkpoints.refreshed.read(page)?.memory.total).toBe(5);
  });

  it("Operations O5, entry table (Clear, Idle, placed): clearing the shown results reads the placed page again at once", async () => {
    const run = await clearResults.run();

    expect(results(run.checkpoints.cleared)).toEqual(["sho#0", "sho#0"]);
    expect(run.checkpoints.cleared.read(page)?.memory.total).toBe(5);
  });

  it("Operations, placements (unplace at exit), Last hold left (Running): closing the page mid-read stops the read", async () => {
    const run = await closedMidRead.run();

    expect(run.checkpoints.released.read(Catalog.results).map((c) => c.status)).toEqual([
      "handled",
    ]);
  });

  it("Operations R8, I11: a page turned while its read runs on shows ReleaseOverdue past the bound while it holds that page again, and none once the read ends", async () => {
    const run = await turnedMidRead.run();
    const codes = (cut: Cut) => (cut.read(page)?.issues ?? []).map((i) => i.code);

    expect(
      [run.checkpoints.turned, run.checkpoints["past bound"], run.checkpoints.ended].map(codes),
    ).toEqual([[], ["ReleaseOverdue"], []]);
  });
});

describe("writes into saved searches (Operations R4, I7, I9; O5)", () => {
  it("Operations R4, I7, entry table (Written; Settled behind): the save's answer is written into the read and the older answer never replaces it", async () => {
    const run = await savedWriteWins.run();

    expect(run.checkpoints.written.read(adaSaved)?.memory.searches).toEqual(["shoes"]);
    expect(run.checkpoints["old answer"].read(adaSaved)?.memory.searches).toEqual(["shoes"]);
  });

  it("Operations T4.4, entry table (Invalidate, Running, placed; Settled behind with again): an unsure save's invalidate makes the older answer land nothing and the trailing read show the saved search", async () => {
    const run = await savedUnsure.run();

    expect(run.checkpoints["read again"].read(Catalog.saved)).toHaveLength(2);
    expect(run.checkpoints["read again"].read(adaSaved)?.memory.searches).toEqual(["shoes"]);
  });
});
