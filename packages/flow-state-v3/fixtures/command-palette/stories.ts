import { Fake, samplesOf, Story } from "../../src/host/testing/index.ts";
import { command, type Entries, group, type Scores, separator } from "./commands.ts";
import { palette, paletteSetup } from "./machine.ts";
import { Commands, CommandsFake } from "./server.ts";

/**
 * The palette app over its port fake, with no steps yet: every palette Story starts here.
 */
export const paletteStory = (id: string) =>
  Story.app(paletteSetup, { id, fixtures: [CommandsFake] });

/**
 * Two groups and a page: Suggestions (calendar, emoji with a keyword, a disabled calculator), a
 * separator, then Settings (profile, a theme page of light and dark, settings), some with
 * shortcuts.
 */
export const commands: typeof Entries.Type = [
  group("Suggestions", [
    command("calendar", "Calendar"),
    command("emoji", "Search Emoji", { keywords: ["smiley"] }),
    command("calculator", "Calculator", { disabled: true }),
  ]),
  separator,
  group("Settings", [
    command("profile", "Profile", { shortcuts: ["mod+p"] }),
    command("theme", "Change theme…", {
      items: [command("light", "Light", { shortcuts: ["mod+shift+l"] }), command("dark", "Dark")],
    }),
    command("settings", "Settings", { shortcuts: ["mod+s"] }),
  ]),
];

/**
 * The palette's props besides its list: auto-highlight on and the fuzzy score.
 */
export const fuzzy = { autoHighlight: true, scores: null } as const;

/**
 * The props event a view sends for a list.
 */
export const configure = (
  list: typeof Entries.Type,
  props: { readonly autoHighlight: boolean; readonly scores: typeof Scores.Type } = fuzzy,
) => ({ _tag: "Configure", commands: list, ...props }) as const;

/**
 * A person types "pro" and presses Enter on Profile, whose action is held; opens the theme page,
 * types "da" and runs Dark, also held; Escape clears the text and Escape goes back; then both
 * answers land, Profile's first.
 */
export const usual = paletteStory("palette/usual")
  .ensure(palette)
  .send(palette, configure(commands))
  .send(palette, { _tag: "Typed", text: "pro" })
  .checkpoint("ranked")
  .world(Commands.run.hold(), Commands.run.hold())
  .send(palette, { _tag: "Enter" })
  .send(palette, { _tag: "Typed", text: "" })
  .send(palette, { _tag: "Run", key: "theme" })
  .send(palette, { _tag: "Typed", text: "da" })
  .send(palette, { _tag: "Enter" })
  .checkpoint("pending")
  .send(palette, { _tag: "Escape" })
  .send(palette, { _tag: "Escape" })
  .checkpoint("back")
  .world(Commands.run.release(), Commands.run.release())
  .checkpoint("settled");

type PaletteStory = ReturnType<typeof paletteStory>;

type Held = { readonly key: string; readonly live: boolean };

type Model = {
  readonly story: PaletteStory;
  readonly held: ReadonlyArray<Held>;
  readonly unsure: ReadonlyArray<string>;
};

type Draw = { readonly key: string; readonly seed: number };

const KEYS = ["calendar", "emoji", "profile", "settings", "dark"] as const;

const QUERIES = ["", "se", "pro", "da"] as const;

const nextSeed = (seed: number) => (Math.imul(seed, 1_103_515_245) + 12_345) >>> 0;

const run = (s: PaletteStory, key: string) => s.send(palette, { _tag: "Run", key });

const busy = (m: Model, key: string) =>
  m.held.some((h) => h.live && h.key === key) || m.unsure.includes(key);

const held = (m: Model, { key }: Draw) => ({
  ...m,
  story: run(m.story.world(Commands.run.hold()), key),
  held: [...m.held, { key, live: true }],
});

const landed = (m: Model, { key }: Draw) => ({ ...m, story: run(m.story, key) });

const lost = (m: Model, { key }: Draw) => ({
  ...m,
  story: run(m.story.world(Commands.run.drop({ at: "response" })), key),
  unsure: [...m.unsure, key],
});

const refused = (m: Model, { key }: Draw) => ({
  ...m,
  story: run(m.story.world(Commands.fail({ command: key, reason: "offline" })), key).world(
    Commands.heal({ command: key }),
  ),
});

const released = (failing: boolean) => (m: Model) => {
  const [oldest, ...rest] = m.held;

  if (oldest === undefined) return { ...m, story: m.story.advance("15 millis") };

  const story =
    failing && oldest.live
      ? m.story.world(
          Commands.fail({ command: oldest.key, reason: "denied" }),
          Commands.run.release(),
          Commands.heal({ command: oldest.key }),
        )
      : m.story.world(Commands.run.release());

  return { ...m, story, held: rest };
};

const typed = (m: Model, { seed }: Draw) => ({
  ...m,
  story: m.story.send(palette, { _tag: "Typed", text: QUERIES[seed % QUERIES.length] ?? "" }),
});

const moved = (m: Model) => ({ ...m, story: m.story.send(palette, { _tag: "Move", by: 1 }) });

const escaped = (m: Model) => ({ ...m, story: m.story.send(palette, { _tag: "Escape" }) });

const paged = (m: Model) => ({ ...m, story: run(m.story, "theme").advance("5 millis") });

const reloaded = (m: Model) => {
  const pending = m.held.filter((h) => h.live && !m.unsure.includes(h.key)).map((h) => h.key);

  return {
    story: m.story.reload().send(palette, configure(commands)),
    held: m.held.map((h) => ({ ...h, live: false })),
    unsure: [...m.unsure, ...pending],
  };
};

const GESTURES: ReadonlyArray<(m: Model, draw: Draw) => Model> = [
  held,
  held,
  landed,
  lost,
  refused,
  released(false),
  released(true),
  typed,
  moved,
  escaped,
  paged,
  reloaded,
];

const retried = (m: Model, { key }: Draw) => ({
  ...m,
  story: run(m.story, key),
  unsure: m.unsure.filter((k) => k !== key),
});

const gesture = (m: Model, seed: number) => {
  const pick = seed % GESTURES.length;
  const draw = { key: KEYS[(seed >>> 8) % KEYS.length] ?? "profile", seed: seed >>> 4 };

  if (pick < 6 && m.unsure.includes(draw.key)) return retried(m, draw);

  if (pick < 6 && busy(m, draw.key)) return landed(m, draw);

  return (GESTURES[pick] ?? landed)(m, draw);
};

const seeds = Array.from({ length: 150 }).reduce<ReadonlyArray<number>>(
  (all) => [...all, nextSeed(all.at(-1) ?? 11)],
  [],
);

const ended = seeds.reduce(gesture, {
  story: paletteStory("palette/stress").ensure(palette).send(palette, configure(commands)),
  held: [],
  unsure: [],
});

/**
 * A hundred and fifty gestures on five commands: runs while answers are held, released oldest first,
 * failed, lost, and run again; typing, moving and Escape between them; and reloads while commands
 * are pending, each followed by the props again. Every held answer is released at the end.
 */
export const stress = ended.held
  .reduce((s) => s.world(Commands.run.release()), ended.story)
  .checkpoint("end");

const configured = configure(commands);
const typingPro = { _tag: "Typed", text: "pro" } as const;
const clearing = { _tag: "Typed", text: "" } as const;
const moving = { _tag: "Move", by: 1 } as const;
const highlighting = { _tag: "Highlight", key: "settings" } as const;
const runningProfile = { _tag: "Run", key: "profile" } as const;
const runningTheme = { _tag: "Run", key: "theme" } as const;
const runningDark = { _tag: "Run", key: "dark" } as const;
const entering = { _tag: "Enter" } as const;
const goingBack = { _tag: "Back" } as const;
const escaping = { _tag: "Escape" } as const;

const sampleEvents = {
  configured,
  typingPro,
  clearing,
  moving,
  highlighting,
  runningProfile,
  runningTheme,
  runningDark,
  entering,
  goingBack,
  escaping,
};

/**
 * A stress run from seed 36, printed by the generator and pasted here. The reload sweep and the
 * bench run it as any Story.
 */
export const seededStress = Story.app(paletteSetup, {
  id: "palette/stress-36",
  fixtures: [CommandsFake],
})
  .world(Commands.fail({ command: "profile", reason: "denied" }))
  .ensure(palette)
  .world(Fake.storage.hold())
  .send(palette, clearing)
  .send(palette, escaping)
  .send(palette, runningDark)
  .world(Commands.heal({ command: "profile" }))
  .send(palette, configured)
  .send(palette, moving)
  .send(palette, escaping)
  .send(palette, escaping)
  .send(palette, escaping)
  .reload({ reattach: false })
  .send(palette, runningProfile)
  .send(palette, clearing)
  .send(palette, runningProfile)
  .send(palette, configured)
  .send(palette, typingPro)
  .send(palette, entering)
  .world(Commands.run.drop({ at: "response" }))
  .send(palette, runningProfile)
  .world(Commands.run.hold())
  .world(Fake.storage.hold())
  .send(palette, escaping)
  .send(palette, clearing)
  .send(palette, moving)
  .world(Fake.network.offline())
  .send(palette, configured)
  .dispose(palette, { how: "forget" })
  .world(Commands.heal({ command: "dark" }))
  .send(palette, runningTheme)
  .send(palette, highlighting)
  .advance("20 millis")
  .disposeRuntime()
  .reload({ heldWrites: "land" })
  .advance("7 millis")
  .send(palette, moving)
  .world(Fake.storage.refuse())
  .advance("20 millis")
  .send(palette, entering)
  .advance("3 millis")
  .send(palette, runningProfile)
  .world(Fake.storage.refuse())
  .send(palette, runningTheme)
  .advance("16 millis")
  .send(palette, escaping)
  .send(palette, typingPro)
  .send(palette, escaping)
  .send(palette, moving)
  .send(palette, highlighting)
  .send(palette, runningDark)
  .world(Fake.storage.hold())
  .send(palette, runningDark)
  .send(palette, typingPro)
  .send(palette, escaping)
  .advance("5 millis")
  .send(palette, typingPro)
  .advance("2 millis")
  .send(palette, runningTheme)
  .advance("17 millis")
  .send(palette, typingPro)
  .send(palette, clearing)
  .send(palette, typingPro)
  .advance("18 millis")
  .send(palette, goingBack)
  .send(palette, moving)
  .send(palette, typingPro)
  .send(palette, runningDark)
  .send(palette, runningProfile)
  .send(palette, runningDark)
  .reload({ reattach: false, heldWrites: "land" })
  .advance("4 millis")
  .send(palette, moving)
  .world(Fake.storage.refuse())
  .advance("10 millis")
  .send(palette, clearing)
  .send(palette, runningDark)
  .send(palette, runningTheme)
  .send(palette, clearing)
  .send(palette, escaping)
  .send(palette, goingBack)
  .send(palette, goingBack)
  .send(palette, clearing)
  .world(Fake.storage.refuse())
  .send(palette, runningDark)
  .send(palette, runningDark)
  .send(palette, clearing)
  .world(Fake.storage.refuse())
  .send(palette, entering)
  .world(Fake.storage.refuse())
  .advance("20 millis")
  .send(palette, runningTheme)
  .send(palette, clearing)
  .send(palette, escaping)
  .send(palette, runningTheme)
  .world(Fake.storage.hold())
  .advance("15 millis")
  .send(palette, configured)
  .send(palette, escaping)
  .send(palette, runningTheme)
  .advance("8 millis")
  .send(palette, runningProfile)
  .send(palette, goingBack)
  .advance("7 millis")
  .send(palette, moving)
  .send(palette, entering)
  .send(palette, highlighting)
  .advance("15 millis")
  .send(palette, runningTheme)
  .advance("15 millis")
  .send(palette, typingPro)
  .advance("56438 millis")
  .world(Fake.network.online())
  .advance("2 minutes")
  .world(Fake.storage.release())
  .world(Commands.run.release())
  .advance("2 minutes")
  .advance("2 minutes");

/**
 * What a person and the command host can do, for generated runs: give the list, type, move,
 * highlight, run commands, Enter, Back and Escape; the host fails a command, and heals it.
 */
export const samples = samplesOf({
  id: "palette",
  story: paletteStory("palette/samples"),
  names: { setup: "paletteSetup", fixtures: ["CommandsFake"] },
  actors: { palette },
  servers: { Commands },
  failures: [
    Commands.fail({ command: "profile", reason: "denied" }),
    Commands.fail({ command: "dark", reason: "offline" }),
  ],
  landedFailures: [],
  values: sampleEvents,
  controls: [Commands.heal({ command: "profile" }), Commands.heal({ command: "dark" })],
  steps: (story) => Object.values(sampleEvents).reduce((s, event) => s.send(palette, event), story),
});

/**
 * Every Story of the fixture, by name.
 */
export const stories = { usual, stress, seededStress };
