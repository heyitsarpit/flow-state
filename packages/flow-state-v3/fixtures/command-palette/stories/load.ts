import { Fake } from "../../../src/host/testing/index.ts";
import { palette } from "../app.ts";
import { commands, configure, paletteStory } from "./usual.ts";

/**
 * A query typed, then cleared.
 */
export const emptyQueryOrder = paletteStory("palette/empty-query-order")
  .ensure(palette)
  .send(palette, configure(commands))
  .send(palette, { _tag: "Typed", text: "pro" })
  .send(palette, { _tag: "Typed", text: "" })
  .checkpoint("cleared");

const keystrokes = ["s", "se", "set", "sett", "setti", "settin", "setting", "settings"];

/**
 * "settings" typed a letter at a time while the store holds every write; the store answers and the
 * tab reloads.
 */
export const typingUnderHeldStore = keystrokes
  .reduce(
    (story, text) => story.send(palette, { _tag: "Typed", text }),
    paletteStory("palette/typing-under-held-store")
      .ensure(palette)
      .send(palette, configure(commands))
      .world(Fake.storage.hold()),
  )
  .checkpoint("typed")
  .world(Fake.storage.release())
  .reload()
  .checkpoint("reloaded");
