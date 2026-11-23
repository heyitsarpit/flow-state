import { Effect, Layer, Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Store, StoreScope, type StoreWrite } from "../../src/host/persistence.ts";
import { Fake, storeContract } from "../../src/host/testing/index.ts";

storeContract("Fake.storage", Fake.storage.layer(), { describe, it });

// What a store does to each batch it is given: a sound store keeps it as it is.
type Flaw = (batch: ReadonlyArray<StoreWrite>) => ReadonlyArray<StoreWrite>;

// A store a user writes over plain Maps, as a custom adapter would be: one Map per app and scope,
// kept outside the Layer so a later build loads what an earlier one wrote.
const mapStore = (flaw: Flaw = (batch) => batch) => {
  const scopes = new Map<string, Map<string, string>>();

  return Layer.effect(
    Store,
    Effect.map(Effect.service(StoreScope), ({ app, scope }) => {
      const records = scopes.get(`${app} ${scope}`) ?? new Map<string, string>();
      scopes.set(`${app} ${scope}`, records);

      return Store.of({
        load: Effect.sync(() => new Map(records)),
        write: (batch) =>
          Effect.sync(() => {
            for (const w of flaw(batch))
              Option.match(w.value, {
                onNone: () => records.delete(w.key),
                onSome: (text) => records.set(w.key, text),
              });
          }),
      });
    }),
  );
};

storeContract("a plain Map store", mapStore(), { describe, it });

// A flaw that changes each text a store writes.
// RETURN_TYPE: a Flaw, so the batch it returns keeps the StoreWrite type its literals would narrow.
const textFlaw =
  (change: (text: string) => Option.Option<string>): Flaw =>
  (batch) =>
    batch.flatMap((w) =>
      Option.match(w.value, {
        onNone: () => [w],
        onSome: (text) =>
          Option.match(change(text), {
            onNone: () => [],
            onSome: (kept) => [{ key: w.key, value: Option.some(kept) }],
          }),
      }),
    );

// The names of the contract's cases a store fails, each case run as a runner would run it.
const failedBy = async (layer: Layer.Layer<Store, never, StoreScope>) => {
  const cases: Array<{ readonly name: string; readonly body: () => Promise<void> }> = [];

  storeContract("flawed", layer, {
    describe: (_, body) => body(),
    it: (name, body) => cases.push({ name, body }),
  });

  const failed = await Promise.all(
    cases.map((c) =>
      c.body().then(
        () => [],
        () => [c.name],
      ),
    ),
  );

  return failed.flat();
};

const keptExactly = "text and keys are kept exactly";

describe("storeContract fails a store that breaks it (Pending D9)", () => {
  it("a sound store fails no case", async () => {
    expect(await failedBy(mapStore())).toEqual([]);
  });

  const mangled: ReadonlyArray<readonly [string, (text: string) => Option.Option<string>]> = [
    ["writes a line separator as a space", (text) => Option.some(text.replaceAll("\u2028", " "))],
    [
      "writes a character outside the BMP as ?",
      (text) => Option.some(text.replaceAll(/\p{Cs}|[\u{10000}-\u{10FFFF}]/gu, "?")),
    ],
    ["drops an empty text", (text) => (text === "" ? Option.none() : Option.some(text))],
    ["cuts a text at 65,535 characters", (text) => Option.some(text.slice(0, 65_535))],
  ];

  for (const [flaw, change] of mangled)
    it(`a store that ${flaw} fails "${keptExactly}"`, async () => {
      expect(await failedBy(mapStore(textFlaw(change)))).toEqual([keptExactly]);
    });

  it("a store that drops the last record of each batch fails what landed", async () => {
    expect(await failedBy(mapStore((batch) => batch.slice(0, -1)))).toContain(
      "a load gives exactly what landed, removals included",
    );
  });
});
