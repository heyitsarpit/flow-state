import { Option, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { draftSetup, library } from "../../fixtures/draft/app.ts";
import { Docs } from "../../fixtures/draft/server/docs.ts";
import { DocsFake } from "../../fixtures/draft/server/layer.ts";
import { Doc, DocsApi } from "../../fixtures/draft/services.ts";
import {
  closeClears,
  saveAfterClose,
  savedAfterWrite,
} from "../../fixtures/draft/stories/document.ts";
import {
  outlineKeptNoTime,
  savedEntry,
  savedEntryExpired,
} from "../../fixtures/draft/stories/usual.ts";
import { Fake, Story, type Cut } from "../../src/host/testing/index.ts";
import { resource } from "../../src/index.ts";
import { loose } from "../../src/test/loose.ts";

// Persisted reads: `resource({ persist: true, output })`, its saved entry and its install. Expected
// results are Operations' Entry store and Records' Data layer records: an entry saves
// `entry/<contract>|<keyText>` with `{ data, at }` when data lands; `install` at boot gives an unheld
// Idle entry with `asked: none`, never fresh, so the first ask starts a request; a saved copy at
// least `gcTime` old, or one `output` does not decode, starts missing and its bytes go (a cache
// record carries no obligation: every failure is Discard); `persist: true` requires `output`
// (Plan Operations O1). The open document's module loads inside its tests.

const DOCUMENT = "entry/Draft/document|";

const OUTLINE = "entry/Draft/outline|";

// A saved entry's envelope as Records' Data layer records give it: the format and `{ data, at }`.
const SavedEntry = Schema.Struct({
  format: Schema.Number,
  body: Schema.Struct({ data: Schema.Unknown, at: Schema.Number }),
});

const codec = Schema.fromJsonString(SavedEntry);

// The `data` each saved entry of one contract holds at a cut; a text that is no saved entry reads
// as itself, so the comparison shows it.
const entries = (cut: Cut, prefix: string) =>
  [...cut.records.stored].flatMap(([key, text]) =>
    key.startsWith(prefix)
      ? [
          Option.match(Schema.decodeUnknownOption(codec)(text), {
            onNone: () => text,
            onSome: (entry) => entry.body.data,
          }),
        ]
      : [],
  );

const first = { title: "Plan", body: "# Goals\nfirst draft\n# Risks", revision: 1 };

describe("a persisted read's saved entry (Operations R12, I24; Records R18)", () => {
  it("Operations Entry store, R12, I24: the plan's read is saved when it lands, kept across a reload, and the first ask after it starts a request", async () => {
    const run = await savedEntry.run();

    expect(entries(run.checkpoints.loaded, DOCUMENT)).toEqual([first]);
    expect(entries(run.checkpoints.reloaded, DOCUMENT)).toEqual([first]);
    expect(run.checkpoints.asked.read(Docs.document)).toHaveLength(2);
    expect(run.checkpoints.asked.read(library)?.memory.revision).toBe(1);
  });

  it("Operations Entry store (install, `now - at >= gcTime`): a saved copy older than a day is dropped at the boot", async () => {
    const run = await savedEntryExpired.run();

    expect(entries(run.checkpoints.loaded, DOCUMENT)).toEqual([first]);
    expect(entries(run.checkpoints.reloaded, DOCUMENT)).toEqual([]);
  });

  it("Operations Q15, I24: a persisted read kept no time is never shown after a reload", async () => {
    const run = await outlineKeptNoTime.run();

    expect(entries(run.checkpoints.reloaded, OUTLINE)).toEqual([]);
  });

  it("Operations Q15, build-time choice A (deciding): a persisted read kept no time writes no saved entry", async () => {
    const run = await outlineKeptNoTime.run();

    expect(entries(run.checkpoints.loaded, OUTLINE)).toEqual([]);
  });

  it("Records R18, Operations Entry store (does not decode by `output`): a saved copy whose data fails `output` starts missing, with no issue, and its bytes go", async () => {
    const written = await savedEntry.run();

    const [key, text] = Option.getOrThrow(
      Option.fromUndefinedOr(
        [...written.checkpoints.loaded.records.stored].find(([k]) => k.startsWith(DOCUMENT)),
      ),
    );

    const envelope = Schema.decodeUnknownSync(codec)(text);

    const damaged = Schema.encodeSync(codec)({
      ...envelope,
      body: { ...envelope.body, data: { title: 7 } },
    });

    const run = await Story.app(draftSetup, { id: "draft/undecodable-entry", fixtures: [DocsFake] })
      .world(Fake.storage.put(key, damaged))
      .reload({ reattach: false })
      .checkpoint("booted")
      .ensure(library)
      .checkpoint("ensured")
      .run();

    expect(run.checkpoints.booted.records.stored.has(key)).toBe(false);
    expect(run.checkpoints.ensured.read(library)?.issues).toEqual([]);
  });

  it("Plan Operations O1 (persisted resources require output): `persist: true` without `output` is refused at construction", () => {
    const declare: (config: unknown) => unknown = loose(resource);

    expect(() =>
      declare({
        id: "Draft/untyped",
        input: { id: Schema.String },
        key: ["id"],
        services: [DocsApi],
        staleTime: 0,
        gcTime: 0,
        persist: true,
        lookup: () => Schema.decodeUnknownEffect(Doc)({}),
      }),
    ).toThrow(/output/u);
  });
});

describe("writes into a persisted read (Operations R4; Entry store)", () => {
  it("Operations R4, entry table (Written): a saved edit written into the read is the saved copy across a reload", async () => {
    const run = await savedAfterWrite.run();
    const second = { title: "Plan", body: "second draft", revision: 2 };

    expect(entries(run.checkpoints.saved, DOCUMENT)).toEqual([second]);
    expect(entries(run.checkpoints.reloaded, DOCUMENT)).toEqual([second]);
  });

  it("Operations Entry store, Clear (decided: the saved copy mirrors the entry's data): closing the plan clears its read, and its saved copy goes with it", async () => {
    const run = await closeClears.run();

    expect(entries(run.checkpoints.loaded, DOCUMENT)).toEqual([first]);
    expect(entries(run.checkpoints.closed, DOCUMENT)).toEqual([]);
  });

  it("Plan Operations O5 (clear blocks old results), Entry store: a save answered after the plan was closed does not bring its saved copy back", async () => {
    const run = await saveAfterClose.run();

    expect(run.checkpoints.answered.read(Docs.save)).toHaveLength(1);
    expect(entries(run.checkpoints.answered, DOCUMENT)).toEqual([]);
  });
});
