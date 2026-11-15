import { describe, expect, it } from "vite-plus/test";
import { command, group, separator } from "../../fixtures/command-palette/commands.ts";
import { palette } from "../../fixtures/command-palette/machine.ts";
import {
  commands,
  configure,
  fuzzy,
  paletteStory,
} from "../../fixtures/command-palette/stories.ts";
import { played } from "../rules/played.ts";
import { resultsAt, shownAt } from "./reads.ts";

const scored = (scores: Readonly<Record<string, number>>) => ({ ...fuzzy, scores });

const labelled = (...labels: ReadonlyArray<string>) => labels.map((l) => command(l, l));

describe("command palette: ranking", () => {
  it("PALETTE-RANK-1: the whole text beats a prefix, which beats a word start, a substring and scattered letters, and all of them show", async () => {
    const run = await played(
      paletteStory("PALETTE-RANK-1")
        .ensure(palette)
        .send(
          palette,
          configure(labelled("Show emoji teams", "Assets", "Quick setup", "Settings", "Set")),
        )
        .send(palette, { _tag: "Typed", text: "set" })
        .checkpoint("typed"),
    );

    expect(shownAt(run.checkpoints.typed)).toEqual([
      "Set",
      "Settings",
      "Quick setup",
      "Assets",
      "Show emoji teams",
    ]);
  });

  it("PALETTE-RANK-2: letters in order match across words, word starts count most, and letters out of order hide", async () => {
    const run = await played(
      paletteStory("PALETTE-RANK-2")
        .ensure(palette)
        .send(palette, configure(labelled("Grep", "Git push", "Calendar")))
        .send(palette, { _tag: "Typed", text: "gp" })
        .checkpoint("gp")
        .send(palette, { _tag: "Typed", text: "git ps" })
        .checkpoint("spaced")
        .send(palette, { _tag: "Typed", text: "xyz" })
        .checkpoint("none")
        .send(palette, { _tag: "Typed", text: "rac" })
        .checkpoint("reversed"),
    );

    expect(shownAt(run.checkpoints.gp)).toEqual(["Git push", "Grep"]);
    expect(shownAt(run.checkpoints.spaced)).toEqual(["Git push"]);
    expect(shownAt(run.checkpoints.none)).toEqual([]);
    expect(shownAt(run.checkpoints.reversed)).toEqual([]);
  });

  it("PALETTE-RANK-3: case and accents are ignored, so ECL is a prefix of Éclair and beats a substring", async () => {
    const run = await played(
      paletteStory("PALETTE-RANK-3")
        .ensure(palette)
        .send(palette, configure(labelled("Reclaim", "Éclair")))
        .send(palette, { _tag: "Typed", text: "ECL" })
        .checkpoint("typed"),
    );

    expect(shownAt(run.checkpoints.typed)).toEqual(["Éclair", "Reclaim"]);
  });

  it("PALETTE-RANK-4: the best matches come first within groups and among them, without separators", async () => {
    const run = await played(
      paletteStory("PALETTE-RANK-4")
        .ensure(palette)
        .send(palette, configure(commands))
        .send(palette, { _tag: "Typed", text: "se" })
        .checkpoint("typed"),
    );

    expect(resultsAt(run.checkpoints.typed)).toEqual([
      group("Settings", [command("settings", "Settings", { shortcuts: ["mod+s"] })]),
      group("Suggestions", [command("emoji", "Search Emoji", { keywords: ["smiley"] })]),
    ]);
  });

  it("PALETTE-RANK-5: an empty query keeps the list in its own order", async () => {
    const run = await played(
      paletteStory("PALETTE-RANK-5")
        .ensure(palette)
        .send(palette, configure(commands))
        .send(palette, { _tag: "Typed", text: "se" })
        .send(palette, { _tag: "Typed", text: "" })
        .checkpoint("empty"),
    );

    expect(resultsAt(run.checkpoints.empty)).toEqual(commands);
  });

  it("PALETTE-RANK-6: the app's own scores rank, and a score of 0 hides", async () => {
    const run = await played(
      paletteStory("PALETTE-RANK-6")
        .ensure(palette)
        .send(palette, configure(labelled("a", "bb", "ccc"), scored({ a: 0, bb: 1, ccc: 2 })))
        .send(palette, { _tag: "Typed", text: "x" })
        .checkpoint("typed"),
    );

    expect(shownAt(run.checkpoints.typed)).toEqual(["ccc", "bb"]);
  });

  it("PALETTE-RANK-7: separators stay while scores move no entry, and go once they do", async () => {
    const list = [...labelled("Apple", "Apricot"), separator, ...labelled("Avocado", "Banana")];

    const run = await played(
      paletteStory("PALETTE-RANK-7")
        .ensure(palette)
        .send(palette, configure(list, scored({ Apple: 1, Apricot: 1, Avocado: 1 })))
        .send(palette, { _tag: "Typed", text: "a" })
        .checkpoint("still")
        .send(palette, configure(list, scored({ Apple: 1, Apricot: 1, Avocado: 2, Banana: 1 })))
        .checkpoint("moved"),
    );

    expect(resultsAt(run.checkpoints.still)).toEqual([
      ...labelled("Apple", "Apricot"),
      separator,
      ...labelled("Avocado"),
    ]);
    expect(resultsAt(run.checkpoints.moved)).toEqual(
      labelled("Avocado", "Apple", "Apricot", "Banana"),
    );
  });
});
