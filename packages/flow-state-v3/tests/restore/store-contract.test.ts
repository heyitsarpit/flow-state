import { Effect, Layer, Option } from "effect";
import { Store, StoreScope } from "../../src/host/persistence.ts";
import { Fake, storeContract } from "../../src/host/testing/index.ts";

storeContract("Fake.storage", Fake.storage.layer());

// A store a user writes over plain Maps, as a custom adapter would be: one Map per app and scope,
// kept outside the Layer so a later build loads what an earlier one wrote.
const mapStore = () => {
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
            for (const w of batch)
              Option.match(w.value, {
                onNone: () => records.delete(w.key),
                onSome: (text) => records.set(w.key, text),
              });
          }),
      });
    }),
  );
};

storeContract("a plain Map store", mapStore());
