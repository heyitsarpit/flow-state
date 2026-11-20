import { Context, Effect, Exit, Fiber, Layer, Option, Scope } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Store, StoreScope, type StoreWrite } from "../store.ts";

// RETURN_TYPE: a StoreWrite, whose value the literal alone would narrow to Some.
const set = (key: string, text: string): StoreWrite => ({ key, value: Option.some(text) });

// RETURN_TYPE: a StoreWrite, whose value the literal alone would narrow to None.
const removal = (key: string): StoreWrite => ({ key, value: Option.none() });

// The texts a store keeps exactly: empty, an emoji, a line separator, and one of a megabyte.
const texts = ["", "\u{1F600} café", "a b", "x".repeat(1_000_000)];

// Keys with the characters Flow's own keys use.
const keys = ["actor/A/b", "lane/A/b|pay|{}", 'actor/A/{"id":1}'];

/**
 * Checks a `Store` Layer against the store's contract, as Flow checks its own adapters.
 *
 * **When to use**
 *
 * Once per store adapter, in its own test file: `storeContract("my store", layerMyStore)`.
 *
 * **Details**
 *
 * Each case builds the Layer for its own app and scope, through `StoreScope`, so a durable store
 * can be checked on one database. The cases: an empty scope loads empty; a load gives exactly what
 * landed, writes and removals; two batches issued back to back commit in issue order; text is kept
 * exactly; 5,000 records land in one batch; an interrupted write does not block the next; and a
 * fresh build after the first one's scope closed loads what landed.
 *
 * **Gotchas**
 *
 * - A refused or torn batch cannot be arranged through the port: test those in the adapter.
 */
// RETURN_TYPE: void, not the suite describe returns, so a caller registers it and keeps nothing.
export const storeContract = (
  name: string,
  // FLOW_STATE_ALLOW_UNKNOWN: a store's Layer may fail with its own error while it builds.
  layer: Layer.Layer<Store, unknown, StoreScope>,
): void => {
  describe(`storeContract: ${name}`, () => {
    const storeIn = (scope: string) =>
      Layer.build(
        Layer.provide(layer, Layer.succeed(StoreScope, { app: `contract/${name}`, scope })),
      ).pipe(Effect.map((built) => Context.get(built, Store)));

    // Each case runs in its own Scope, which releases every store it built.
    // FLOW_STATE_ALLOW_UNKNOWN: a store's Layer may fail with its own error while it builds.
    const check = (title: string, body: Effect.Effect<void, unknown, Scope.Scope>) =>
      // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- a test case is the edge that runs its Effect
      it(title, () => Effect.runPromise(Effect.scoped(body)));

    check(
      "an empty scope loads empty",
      Effect.gen(function* () {
        const store = yield* storeIn("empty");

        expect([...(yield* store.load)]).toEqual([]);
      }),
    );

    check(
      "a load gives exactly what landed, removals included",
      Effect.gen(function* () {
        const store = yield* storeIn("landed");
        yield* store.write([set("a", "1"), set("b", "2")]);
        yield* store.write([removal("a"), set("c", "3"), removal("never")]);

        expect(new Map(yield* store.load)).toEqual(
          new Map([
            ["b", "2"],
            ["c", "3"],
          ]),
        );
      }),
    );

    check(
      "two batches issued back to back on one key commit in issue order",
      Effect.gen(function* () {
        const store = yield* storeIn("order");
        yield* Effect.all([store.write([set("k", "first")]), store.write([set("k", "second")])], {
          concurrency: "unbounded",
        });

        expect((yield* store.load).get("k")).toBe("second");
      }),
    );

    check(
      "text and keys are kept exactly",
      Effect.gen(function* () {
        const store = yield* storeIn("text");

        const written = new Map([
          ...texts.map((text, n) => [`text-${String(n)}`, text] as const),
          ...keys.map((key) => [key, key] as const),
        ]);

        yield* store.write([...written].map(([key, text]) => set(key, text)));

        expect(new Map(yield* store.load)).toEqual(written);
      }),
    );

    check(
      "5,000 records land in one batch",
      Effect.gen(function* () {
        const store = yield* storeIn("many");
        const many = Array.from({ length: 5000 }, (_, n) => set(`r${String(n)}`, String(n)));
        yield* store.write(many);

        expect((yield* store.load).size).toBe(5000);
      }),
    );

    check(
      "an interrupted write does not block the next",
      Effect.gen(function* () {
        const store = yield* storeIn("interrupted");
        const cut = yield* Effect.forkChild(store.write([set("a", "cut")]));
        yield* Fiber.interrupt(cut);
        yield* store.write([set("b", "next")]);

        expect((yield* store.load).get("b")).toBe("next");
      }),
    );

    check(
      "a fresh build after the first one's scope closed loads what landed",
      Effect.gen(function* () {
        const first = yield* Scope.make();
        const store = yield* storeIn("reopened").pipe(Scope.provide(first));
        yield* store.write([set("kept", "yes")]);
        yield* Scope.close(first, Exit.void);
        const again = yield* storeIn("reopened");

        expect((yield* again.load).get("kept")).toBe("yes");
      }),
    );
  });
};
