import { describe, expect, it } from "vite-plus/test";
import { command, shortcutsOf } from "../../fixtures/command-palette/commands.ts";
import { palette } from "../../fixtures/command-palette/machine.ts";
import { Commands } from "../../fixtures/command-palette/server.ts";
import {
  commands,
  configure,
  fuzzy,
  paletteStory,
  usual,
} from "../../fixtures/command-palette/stories.ts";
import { played } from "../rules/played.ts";
import { callsAt, denials, highlightAt, memoryAt, pendingAt, resultsAt, shownAt } from "./reads.ts";

const started = (id: string) => paletteStory(id).ensure(palette).send(palette, configure(commands));

describe("command palette: highlight", () => {
  it("PALETTE-1: the first command is highlighted at first, without a highlight being written", async () => {
    const run = await played(started("PALETTE-1").checkpoint("start"));

    expect(highlightAt(run.checkpoints.start)).toBe("calendar");
    expect(memoryAt(run.checkpoints.start).highlighted).toBeNull();
  });

  it("PALETTE-2: typing ranks the commands and highlights the best match", async () => {
    const run = await played(
      started("PALETTE-2").send(palette, { _tag: "Typed", text: "se" }).checkpoint("typed"),
    );

    expect(shownAt(run.checkpoints.typed)).toEqual(["settings", "emoji"]);
    expect(highlightAt(run.checkpoints.typed)).toBe("settings");
  });

  it("PALETTE-3: moving skips disabled commands and wraps", async () => {
    const run = await played(
      started("PALETTE-3")
        .send(palette, { _tag: "Move", by: 1 })
        .checkpoint("one")
        .send(palette, { _tag: "Move", by: 1 })
        .checkpoint("two")
        .send(palette, { _tag: "Move", by: -1 })
        .send(palette, { _tag: "Move", by: -1 })
        .send(palette, { _tag: "Move", by: -1 })
        .checkpoint("wrapped"),
    );

    expect(highlightAt(run.checkpoints.one)).toBe("emoji");
    expect(highlightAt(run.checkpoints.two)).toBe("profile");
    expect(highlightAt(run.checkpoints.wrapped)).toBe("settings");
  });

  it("PALETTE-11: results that keep the highlighted command keep the highlight", async () => {
    const run = await played(
      paletteStory("PALETTE-11")
        .ensure(palette)
        .send(palette, configure([command("Alpha", "Alpha"), command("Beta", "Beta")]))
        .send(palette, { _tag: "Highlight", key: "Beta" })
        .send(palette, configure([command("Gamma", "Gamma"), command("Beta", "Beta")]))
        .checkpoint("kept")
        .send(palette, configure([command("Gamma", "Gamma")]))
        .checkpoint("gone"),
    );

    expect(highlightAt(run.checkpoints.kept)).toBe("Beta");
    expect(highlightAt(run.checkpoints.gone)).toBe("Gamma");
  });

  it("PALETTE-12: without auto-highlight, nothing is highlighted until a move", async () => {
    const run = await played(
      paletteStory("PALETTE-12")
        .ensure(palette)
        .send(palette, configure(commands, { ...fuzzy, autoHighlight: false }))
        .checkpoint("start")
        .send(palette, { _tag: "Typed", text: "cal" })
        .checkpoint("typed")
        .send(palette, { _tag: "Move", by: 1 })
        .checkpoint("moved"),
    );

    expect(highlightAt(run.checkpoints.start)).toBeNull();
    expect(highlightAt(run.checkpoints.typed)).toBeNull();
    expect(highlightAt(run.checkpoints.moved)).toBe("calendar");
  });
});

describe("command palette: running (WriteLanes R2, I13)", () => {
  it("PALETTE-4: Enter runs the highlighted command, which is pending until its answer and cannot run again meanwhile", async () => {
    const run = await played(
      started("PALETTE-4")
        .world(Commands.run.hold())
        .send(palette, { _tag: "Enter" })
        .checkpoint("pending")
        .send(palette, { _tag: "Run", key: "calendar" })
        .checkpoint("again")
        .world(Commands.run.release())
        .checkpoint("settled"),
    );

    expect(callsAt(run.checkpoints.pending)).toEqual(["calendar"]);
    expect(pendingAt(run.checkpoints.pending)).toEqual(["calendar"]);
    expect(denials(run)).toEqual(["Run NoPage,InFlight,InFlight"]);
    expect(callsAt(run.checkpoints.again)).toEqual(["calendar"]);
    expect(pendingAt(run.checkpoints.settled)).toEqual([]);
  });

  it("PALETTE-5: a run of a disabled or pending command is denied, so the view leaves a link where it is", async () => {
    const run = await played(
      started("PALETTE-5")
        .send(palette, { _tag: "Run", key: "calculator" })
        .world(Commands.run.hold())
        .send(palette, { _tag: "Run", key: "calendar" })
        .send(palette, { _tag: "Run", key: "calendar" })
        .checkpoint("end")
        .world(Commands.run.release()),
    );

    expect(denials(run)).toEqual([
      "Run Disabled,Disabled,Disabled",
      "Run NoPage,InFlight,InFlight",
    ]);
    expect(callsAt(run.checkpoints.end)).toEqual(["calendar"]);
  });

  it("PALETTE-6: a refused action keeps its reason as the command's error until it runs again", async () => {
    const run = await played(
      started("PALETTE-6")
        .world(Commands.fail({ command: "profile", reason: "offline" }))
        .send(palette, { _tag: "Run", key: "profile" })
        .checkpoint("failed")
        .advance("1 second")
        .checkpoint("kept")
        .world(Commands.heal({ command: "profile" }), Commands.run.hold())
        .send(palette, { _tag: "Run", key: "profile" })
        .checkpoint("again")
        .world(Commands.run.release())
        .checkpoint("ran"),
    );

    expect(memoryAt(run.checkpoints.failed).errors).toEqual({ profile: "offline" });
    expect(memoryAt(run.checkpoints.kept).errors).toEqual({ profile: "offline" });
    expect(memoryAt(run.checkpoints.again).errors).toEqual({});
    expect(pendingAt(run.checkpoints.again)).toEqual(["profile"]);
    expect(memoryAt(run.checkpoints.ran).errors).toEqual({});
  });

  it("PALETTE-7: a command that fails while another runs leaves the other pending", async () => {
    const run = await played(
      started("PALETTE-7")
        .world(Commands.run.hold(), Commands.run.hold())
        .send(palette, { _tag: "Run", key: "profile" })
        .send(palette, { _tag: "Run", key: "settings" })
        .world(Commands.fail({ command: "profile", reason: "offline" }), Commands.run.release())
        .checkpoint("failed")
        .world(Commands.run.release()),
    );

    expect(pendingAt(run.checkpoints.failed)).toEqual(["settings"]);
    expect(memoryAt(run.checkpoints.failed).errors).toEqual({ profile: "offline" });
  });

  it("PALETTE-8: a pending command waits while another runs, and runs again once settled", async () => {
    const run = await played(
      started("PALETTE-8")
        .world(Commands.run.hold(), Commands.run.hold())
        .send(palette, { _tag: "Run", key: "profile" })
        .send(palette, { _tag: "Run", key: "settings" })
        .send(palette, { _tag: "Run", key: "profile" })
        .checkpoint("both")
        .world(Commands.run.release())
        .checkpoint("one")
        .send(palette, { _tag: "Run", key: "profile" })
        .checkpoint("again")
        .world(Commands.run.release()),
    );

    expect(callsAt(run.checkpoints.both)).toEqual(["profile", "settings"]);
    expect(pendingAt(run.checkpoints.both)).toEqual(["profile", "settings"]);
    expect(pendingAt(run.checkpoints.one)).toEqual(["settings"]);
    expect(callsAt(run.checkpoints.again)).toEqual(["profile", "settings", "profile"]);
  });
});

describe("command palette: pages", () => {
  it("PALETTE-9: a command with sub-commands opens its page, and Back in the empty field goes back with the text", async () => {
    const run = await played(
      started("PALETTE-9")
        .send(palette, { _tag: "Typed", text: "them" })
        .send(palette, { _tag: "Run", key: "theme" })
        .checkpoint("opened")
        .send(palette, { _tag: "Back" })
        .checkpoint("back"),
    );

    const { opened, back } = run.checkpoints;

    expect(memoryAt(opened)).toEqual(
      expect.objectContaining({ frames: [{ page: "theme", query: "them" }], query: "" }),
    );
    expect(shownAt(opened)).toEqual(["light", "dark"]);
    expect(highlightAt(opened)).toBe("light");
    expect(callsAt(opened)).toEqual([]);
    expect(memoryAt(back)).toEqual(expect.objectContaining({ frames: [], query: "them" }));
  });

  it("PALETTE-10: Escape clears the text, then goes back a page, then is denied so an outer dialog gets it (Turn R2)", async () => {
    const run = await played(
      started("PALETTE-10")
        .send(palette, { _tag: "Run", key: "theme" })
        .send(palette, { _tag: "Typed", text: "da" })
        .send(palette, { _tag: "Escape" })
        .checkpoint("cleared")
        .send(palette, { _tag: "Escape" })
        .checkpoint("back")
        .send(palette, { _tag: "Escape" })
        .checkpoint("left"),
    );

    expect(memoryAt(run.checkpoints.cleared)).toEqual(
      expect.objectContaining({ frames: [{ page: "theme", query: "" }], query: "" }),
    );
    expect(memoryAt(run.checkpoints.back).frames).toEqual([]);
    expect(denials(run)).toEqual(["Escape Empty,TopPage"]);
  });

  it("PALETTE-PAGE-1: a page shows the items of the command with that value, the top page the whole list, and a value no command has opens nothing", async () => {
    const run = await played(
      started("PALETTE-PAGE-1")
        .checkpoint("top")
        .send(palette, { _tag: "Run", key: "theme" })
        .checkpoint("theme")
        .send(palette, { _tag: "Run", key: "missing" })
        .checkpoint("missing"),
    );

    expect(resultsAt(run.checkpoints.top)).toEqual(commands);
    expect(shownAt(run.checkpoints.theme)).toEqual(["light", "dark"]);
    expect(denials(run)).toEqual(["Run Unknown,Unknown,Unknown"]);
    expect(memoryAt(run.checkpoints.missing).frames.map((f) => f.page)).toEqual(["theme"]);
  });

  it("PALETTE-PAGE-2: commands and their shortcuts are found on every page", async () => {
    const run = await played(
      started("PALETTE-PAGE-2").send(palette, { _tag: "Run", key: "dark" }).checkpoint("ran"),
    );

    expect(shortcutsOf(memoryAt(run.checkpoints.ran).commands)).toEqual([
      "profile",
      "light",
      "settings",
    ]);
    expect(
      shortcutsOf([command("locked", "Locked", { disabled: true, shortcuts: ["mod+l"] })]),
    ).toEqual([]);
    expect(memoryAt(run.checkpoints.ran).frames).toEqual([]);
    expect(callsAt(run.checkpoints.ran)).toEqual(["dark"]);
  });
});

describe("command palette: the usual Story", () => {
  it("PALETTE-13: ranks, runs two commands across a page change, steps back, and both answers land", async () => {
    const run = await played(usual);
    const { ranked, pending, back, settled } = run.checkpoints;

    expect(shownAt(ranked)).toEqual(["profile"]);
    expect(callsAt(pending)).toEqual(["profile", "dark"]);
    expect(pendingAt(pending)).toEqual(["profile", "dark"]);
    expect(memoryAt(pending)).toEqual(
      expect.objectContaining({ frames: [{ page: "theme", query: "" }], query: "da" }),
    );
    expect(memoryAt(back)).toEqual(expect.objectContaining({ frames: [], query: "" }));
    expect(pendingAt(settled)).toEqual([]);
    expect(Object.values(settled.read(Commands).ran).toSorted()).toEqual(["dark", "profile"]);
  });
});
