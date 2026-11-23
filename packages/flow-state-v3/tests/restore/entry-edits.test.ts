import { Effect, Layer, Option, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { DocsLive } from "../../fixtures/draft/adapters/docs.ts";
import { DocsFake } from "../../fixtures/draft/server/layer.ts";
import { Doc, DocsApi } from "../../fixtures/draft/services.ts";
import { layerIndexedDb } from "../../src/host/persistence.ts";
import { Fake, Story } from "../../src/host/testing/index.ts";
import {
  actorRef,
  app,
  definition,
  Flow,
  machine,
  resource,
  runtimeSetup,
} from "../../src/index.ts";

// Restore after the definition is edited: a reorder, an add, a remove and a rename. A persisted
// read's saved entry is decoded by the contract's own `output` Schema at install: what decodes
// installs, stale; what does not starts missing and its bytes go (Records R18: every failure of a
// cache record is Discard); a saved entry under a contract the build no longer declares is a cache
// record nothing reads, so it is discarded too.

// The document read with an edited `output`: its lookup reads a document by that Schema, as an app
// edits its server Schema and its output together.
const persisted = <A>(id: string, output: Schema.Codec<A, unknown>) =>
  resource({
    id,
    input: { id: Schema.String },
    key: ["id"],
    services: [DocsApi],
    staleTime: "1 minute",
    gcTime: "1 day",
    persist: true,
    output,
    lookup: (input) =>
      DocsApi.use((api) => api.document(input)).pipe(
        Effect.flatMap((doc) => Effect.orDie(Schema.decodeUnknownEffect(output)(doc))),
      ),
  });

// One build of the draft app whose document read is `read`: a document machine that reads it on
// Open, persisted, over the documents fake.
const build = <A>(read: ReturnType<typeof persisted<A>>) => {
  const Reader = definition({
    id: "Draft/Document",
    persist: true,
    states: ["IDLE"],
    events: { Open: {} },
    internalEvents: { Loaded: {}, Failed: {} },
    memory: { id: Flow.input(Schema.String) },
    operations: ({ E }) => ({
      document: read.outcomes({
        success: E.Loaded,
        failure: { NoResponse: E.Failed, Defect: E.Failed, Interrupted: E.Failed },
      }),
    }),
  });

  const ReaderMachine = machine(Reader, ({ S, O }) => ({
    default: S.IDLE,
    on: { Open: { actions: [O.document.lookup(({ memory }) => ({ id: memory.id }))] } },
  }));

  const setup = runtimeSetup({
    app: app({ id: "draft", machines: { document: ReaderMachine } }),
    services: Layer.merge(DocsLive("https://docs.example"), layerIndexedDb()),
    scope: "draft",
    persistence: { captureMs: 0 },
  });

  return { setup, ref: actorRef(ReaderMachine, { id: "doc-1" }), open: Reader.E.Open() };
};

const original = build(persisted("Draft/document", Doc));

// The saved entry the original build writes when the plan's read lands.
const savedText = async () => {
  const run = await Story.app(original.setup, { id: "draft/edit-source", fixtures: [DocsFake] })
    .ensure(original.ref)
    .send(original.ref, original.open)
    .checkpoint("loaded")
    .run();

  return Option.getOrThrow(
    Option.fromUndefinedOr(
      [...run.checkpoints.loaded.records.stored].find(([k]) =>
        k.startsWith("entry/Draft/document|"),
      ),
    ),
  );
};

// Whether the edited build's boot keeps the original's saved entry.
const keptBy = async (edited: ReturnType<typeof build>) => {
  const [key, text] = await savedText();

  const run = await Story.app(edited.setup, { id: "draft/edit-target", fixtures: [DocsFake] })
    .world(Fake.storage.put(key, text))
    .reload({ reattach: false })
    .checkpoint("booted")
    .run();

  return run.checkpoints.booted.records.stored.has(key);
};

const { title, body, revision } = Doc.fields;

describe("a saved entry after the definition is edited (Records R18; Operations Entry store)", () => {
  it("reordered `output` fields: the saved entry installs", async () => {
    expect(
      await keptBy(build(persisted("Draft/document", Schema.Struct({ revision, body, title })))),
    ).toBe(true);
  });

  it("an optional `output` field added: the saved entry installs", async () => {
    const tags = Schema.optional(Schema.Array(Schema.String));

    expect(
      await keptBy(
        build(persisted("Draft/document", Schema.Struct({ title, body, revision, tags }))),
      ),
    ).toBe(true);
  });

  it("a required `output` field added: the saved entry does not decode and its bytes go", async () => {
    const tags = Schema.Array(Schema.String);

    expect(
      await keptBy(
        build(persisted("Draft/document", Schema.Struct({ title, body, revision, tags }))),
      ),
    ).toBe(false);
  });

  it("an `output` field removed: the saved entry still decodes and installs", async () => {
    expect(
      await keptBy(build(persisted("Draft/document", Schema.Struct({ body, revision })))),
    ).toBe(true);
  });

  it("an `output` field renamed: the saved entry does not decode and its bytes go", async () => {
    expect(
      await keptBy(
        build(persisted("Draft/document", Schema.Struct({ title, text: body, revision }))),
      ),
    ).toBe(false);
  });

  it("the resource renamed: the old saved entry names a contract no build declares and its bytes go", async () => {
    expect(await keptBy(build(persisted("Draft/doc", Doc)))).toBe(false);
  });
});
