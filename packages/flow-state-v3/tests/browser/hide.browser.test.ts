import { commands } from "vite-plus/test/browser";
import { Context, Duration, Effect, Layer, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { layerIndexedDb, Store, type StoreScope } from "../../src/host/persistence.ts";
import { Story } from "../../src/host/testing/index.ts";
import {
  actorRef,
  app,
  definition,
  Flow,
  machine,
  RuntimeDefaults,
  runtimeSetup,
  transaction,
} from "../../src/index.ts";

declare module "vitest/internal/browser" {
  // oxlint-disable-next-line lint-bomb/use-consistent-type-definitions -- Vitest's commands are declared by merging into its interface
  interface BrowserCommands {
    readonly hidePage: () => Promise<void>;
    readonly showPage: () => Promise<void>;
  }
}

// A remote that takes a sync and never answers it, so the pad's sync stays in flight and the pad
// stays live while its notes wait for the capture interval.
class Remote extends Context.Service<
  Remote,
  { readonly send: (attempt: string) => Effect.Effect<void> }
>()("browser/Remote") {}

const RemoteHangs = Layer.succeed(Remote, Remote.of({ send: () => Effect.never }));

const sync = transaction({
  id: "Browser/sync",
  input: {},
  key: [],
  concurrency: "serialize",
  services: [Remote],
  commit: (_input, { attempt }) => Remote.use((remote) => remote.send(attempt.id)),
});

const Pad = definition({
  id: "Browser/Pad",
  persist: true,
  states: ["OPEN"],
  events: { Write: { text: Schema.String }, Sync: {} },
  internalEvents: { Synced: {}, NotSent: { why: Schema.String }, Unsure: Flow.uncertain({}) },
  memory: { text: Flow.initial(Schema.String, "") },
  operations: ({ E }) => ({
    sync: sync.outcomes({
      success: E.Synced,
      failure: {},
      notSent: E.NotSent.from((e: { readonly why: string }) => ({ why: e.why })),
      unknown: E.Unsure,
    }),
  }),
});

const PadMachine = machine(Pad, ({ S, O }) => ({
  default: S.OPEN,
  on: {
    Write: { updateMemory: ({ event }) => ({ text: event.text }) },
    Sync: { actions: [O.sync.commit(() => ({}))] },
  },
}));

const pads = app({ id: "browser-notes", machines: { pad: PadMachine } });

const note = actorRef(PadMachine, "n1");

const KEY = "actor/Browser/Pad/n1";

// A store over the page's IndexedDB that also keeps the keys of each batch it was given.
const recording = (database: string) => {
  const batches: Array<ReadonlyArray<string>> = [];

  const layer = Layer.effect(
    Store,
    Effect.map(Effect.service(Store), (inner) =>
      Store.of({
        load: inner.load,
        write: (batch) => {
          batches.push(batch.map((w) => w.key));

          return inner.write(batch);
        },
      }),
    ),
  ).pipe(Layer.provide(layerIndexedDb({ database })));

  return { layer, batches };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The note's record as the page's own IndexedDB holds it.
const stored = (database: string) =>
  new Promise<unknown>((resolve, reject) => {
    const opening = indexedDB.open(database);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;

      const reading = db
        .transaction("records", "readonly")
        .objectStore("records")
        .get(["browser-notes", "s", KEY]);

      reading.onsuccess = () => {
        db.close();
        resolve(reading.result);
      };
    };
  });

// The guard before a hide is judged: the page starts shown. A window the system occludes, as
// Safari's is while the display sleeps, starts hidden, and the case cannot be shown there.
const shownAtStart = () => {
  expect(`the page starts ${document.visibilityState}`).toBe("the page starts visible");
};

const setupOver = (layer: Layer.Layer<Store, never, StoreScope>) =>
  runtimeSetup({
    app: pads,
    scope: "s",
    persistence: {},
    services: Layer.merge(RemoteHangs, layer),
  });

describe("the flush on hide in a real page (WriteAhead R10, I12, T5)", () => {
  it("WriteAhead I12: a write waiting for the capture interval lands in IndexedDB when the page hides, long before the interval", async () => {
    shownAtStart();
    const seen: Array<string> = [];
    const heard = () => void seen.push(document.visibilityState);
    document.addEventListener("visibilitychange", heard);
    const runtime = setupOver(layerIndexedDb({ database: "hide-flush" })).construct();
    await Effect.runPromise(runtime.ready());
    const pad = runtime.ensureActor(note);
    pad.send(Pad.E.Sync());
    await sleep(200);
    pad.send(Pad.E.Write({ text: "milk" }));
    await sleep(200);

    expect(String(await stored("hide-flush"))).not.toContain("milk");

    const hidden = Date.now();
    await commands.hidePage();

    for (let n = 0; n < 40 && !String(await stored("hide-flush")).includes("milk"); n++)
      await sleep(50);
    const landedAfter = Date.now() - hidden;
    await commands.showPage();
    document.removeEventListener("visibilitychange", heard);
    await Effect.runPromise(runtime.dispose());

    // The guard: the test's own document saw itself hidden, so the hide was real.
    expect(seen).toContain("hidden");
    expect(String(await stored("hide-flush"))).toContain("milk");
    expect(landedAfter < Duration.toMillis(RuntimeDefaults.captureInterval)).toBe(true);
  });
});

describe("the Fake page against a real page (WriteAhead R10, I12; Stories)", () => {
  it("WriteAhead I12: changes at 0 s and 3 s land once at 5 s, the same batches on the Fake and on the real page; a hide issues one batch at once on both", async () => {
    shownAtStart();

    const fake = await Story.app(setupOver(layerIndexedDb()), {
      id: "browser/fake-page",
      fixtures: [RemoteHangs],
    })
      .ensure(note)
      .send(note, Pad.E.Sync())
      .checkpoint("syncing")
      .send(note, Pad.E.Write({ text: "a" }))
      .advance("3 seconds")
      .send(note, Pad.E.Write({ text: "b" }))
      .advance("2 seconds")
      .checkpoint("interval")
      .send(note, Pad.E.Write({ text: "c" }))
      .hide()
      .checkpoint("hidden")
      .run();

    const fakeBatches = (cut: (typeof fake)["checkpoints"]["hidden"]) =>
      cut.records.batches.map((b) => b.keys);

    const real = recording("fake-against-real");
    const runtime = setupOver(real.layer).construct();
    await Effect.runPromise(runtime.ready());
    const handle = runtime.ensureActor(note);
    handle.send(Pad.E.Sync());
    await sleep(200);
    const atSync = [...real.batches];
    handle.send(Pad.E.Write({ text: "a" }));
    await sleep(3000);
    handle.send(Pad.E.Write({ text: "b" }));
    await sleep(2500);
    const atInterval = [...real.batches];
    handle.send(Pad.E.Write({ text: "c" }));
    await commands.hidePage();
    await sleep(300);
    await commands.showPage();
    const atHidden = [...real.batches];
    await Effect.runPromise(runtime.dispose());

    expect(atSync).toEqual(fakeBatches(fake.checkpoints.syncing));
    expect(atInterval).toEqual(fakeBatches(fake.checkpoints.interval));
    expect(atHidden).toEqual(fakeBatches(fake.checkpoints.hidden));
    expect(atHidden.slice(1)).toEqual([[KEY], [KEY]]);
  });
});
