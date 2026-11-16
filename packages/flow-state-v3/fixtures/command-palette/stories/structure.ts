import { actorRef } from "../../../src/index.ts";
import { type Command, command } from "../commands.ts";
import { palette, PaletteMachine } from "../machine.ts";
import { commands, configure, paletteStory } from "../stories.ts";

/**
 * A second palette, an identity of its own.
 */
export const secondPalette = actorRef(PaletteMachine, "palette-2");

// A command whose page holds one command, whose page holds one more, `depth` pages down.
// RETURN_TYPE: a recursive function names its result, or its type is circular.
const nested = (level: number, depth: number): Command =>
  command(`level-${String(level)}`, `Level ${String(level)}`, {
    items: level < depth ? [nested(level + 1, depth)] : [],
  });

const levels = (depth: number) => Array.from({ length: depth }, (_, n) => `level-${String(n)}`);

const deep = (id: string, depth: number) =>
  levels(depth)
    .reduce(
      (story, key) => story.send(palette, { _tag: "Run", key }),
      paletteStory(id)
        .ensure(palette)
        .send(palette, configure([nested(0, depth)])),
    )
    .checkpoint("deep");

/**
 * Eight pages opened one in another; the tab reloads at the deepest; Back steps out of all eight.
 */
export const framesEight = levels(8)
  .reduce(
    (story) => story.send(palette, { _tag: "Back" }),
    deep("palette/frames-8", 8).reload().checkpoint("reloaded"),
  )
  .checkpoint("top");

/**
 * 64 pages opened one in another, past a record's depth bound; the tab reloads. A stress Story,
 * built on call and kept out of `stories`: its list cannot be saved or traced.
 */
export const stressFramesSixtyFour = () =>
  deep("palette/stress-frames-64", 64).reload().checkpoint("reloaded");

/**
 * Two palettes, each with its own list and query.
 */
export const twoPalettes = paletteStory("palette/two-palettes")
  .ensure(palette)
  .ensure(secondPalette)
  .send(palette, configure(commands))
  .send(secondPalette, configure([command("light", "Light"), command("dark", "Dark")]))
  .send(palette, { _tag: "Typed", text: "pro" })
  .send(secondPalette, { _tag: "Typed", text: "li" })
  .checkpoint("typed");
