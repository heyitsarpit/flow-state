import { Predicate } from "effect";
import { describe, expect, it } from "vite-plus/test";
import type { Cut } from "../../src/host/testing/index.ts";
import { box, otherBox } from "../../fixtures/search/app.ts";
import {
  blankQuery,
  latestWins,
  missingSearch,
  repeatQuery,
  twoBoxes,
  typingBurst,
} from "../../fixtures/search/stories/typeahead.ts";
import { Catalog } from "../../fixtures/search/server/catalog.ts";
import { played } from "../rules/played.ts";

// The search box's suggestion read. Expected results: a slot moved to another key ends its old
// wait (Superseded, no row), and the old key's request, holding nothing, is released (Slot cells,
// entry table: Last hold left, Running); equal contract and key share one request across actors
// (R3); data younger than `staleTime` (ten minutes) serves an ask (R4); a lookup's input fails its
// Schema at run time with nothing asked (Slot cells); the boot refuses a missing service.

const suggestions = ["shoe rack", "shoes, running", "shoes, trail"];

describe("the search box (Operations R3, R4, R5)", () => {
  it("Operations, Slot cells (lookup on another entry), Last hold left: only the last query's suggestions show and older requests are stopped", async () => {
    const run = await played(latestWins);

    expect(run.checkpoints.typed.read(Catalog.suggest).map((c) => c.input.q)).toEqual([
      "s",
      "sh",
      "sho",
    ]);
    expect(run.checkpoints.settled.read(Catalog.suggest).map((c) => c.status)).toEqual([
      "handled",
      "handled",
      "answered",
    ]);
    expect(run.checkpoints.settled.read(box)?.memory.suggestions).toEqual(suggestions);
  });

  it.fails("Operations R4, entry table (fresh): queries asked again 30 seconds on are shown from what was read", async () => {
    const run = await repeatQuery.run();

    expect(run.checkpoints.repeated.read(Catalog.suggest)).toHaveLength(2);
    expect(run.checkpoints.repeated.read(box)?.memory.suggestions).toEqual([
      "shoes, running",
      "shoes, trail",
    ]);
  });

  it.fails("Operations I12, I22, entry table (Last hold left, Idle; Collect due): a query nobody shows has one Collect alarm, is removed by it a minute on, and is read again when typed", async () => {
    const run = await repeatQuery.run();
    const collects = (cut: Cut) => cut.inspection.timers.filter((t) => t.kind === "Collect");

    expect(collects(run.checkpoints["moved on"])).toHaveLength(1);
    expect(collects(run.checkpoints.collected)).toEqual([]);
    expect(run.checkpoints["read again"].read(Catalog.suggest).map((c) => c.input.q)).toEqual([
      "shoe",
      "shoes",
      "shoe",
    ]);
  });

  it.fails("Operations R3: two boxes typing one query share its request", async () => {
    const run = await twoBoxes.run();

    expect(run.checkpoints.typed.read(Catalog.suggest)).toHaveLength(1);
    expect(run.checkpoints.settled.read(box)?.memory.suggestions).toEqual(suggestions);
    expect(run.checkpoints.settled.read(otherBox)?.memory.suggestions).toEqual(suggestions);
  });

  it.fails("Operations, Slot cells (input refused by intake): a query of spaces asks nothing and shows no suggestions", async () => {
    const run = await blankQuery.run();

    expect(run.checkpoints.refused.read(Catalog.suggest)).toEqual([]);
    expect(run.checkpoints.refused.read(box)?.memory.suggestions).toEqual([]);
    expect(run.checkpoints.refused.read(box)?.state).toBe("IDLE");
    expect(run.evidence.filter((e) => Predicate.isTagged(e, "InvalidInput"))).toHaveLength(1);
  });

  it("Operations OneWait under L5: fourteen keystrokes leave the last query's suggestions", async () => {
    const run = await played(typingBurst);

    expect(run.checkpoints.settled.read(box)?.memory.suggestions).toEqual(["shoes, running"]);
  });

  it.fails("Operations Rows, S7: a setup that lacks the search service is refused at boot, by name", async () => {
    await expect(missingSearch().run()).rejects.toThrow(
      /MissingService.*Search\/suggestions.*SearchApi/su,
    );
  });
});
