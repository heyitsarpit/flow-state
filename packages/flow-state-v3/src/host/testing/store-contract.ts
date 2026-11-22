import {
  Context,
  Data,
  Effect,
  Exit,
  Fiber,
  Formatter,
  Layer,
  Option,
  Schema,
  Scope,
} from "effect";
import { Store, StoreScope, type StoreWrite } from "../store.ts";
import { entry } from "../../entry.ts";

// RETURN_TYPE: a StoreWrite, whose value the literal alone would narrow to Some.
const set = (key: string, text: string): StoreWrite => ({ key, value: Option.some(text) });

// RETURN_TYPE: a StoreWrite, whose value the literal alone would narrow to None.
const removal = (key: string): StoreWrite => ({ key, value: Option.none() });

// The texts a store keeps exactly: empty, an emoji, a line separator, and one of a megabyte.
const texts = ["", "\u{1F600} café", "a b", "x".repeat(1_000_000)];

// Keys with the characters Flow's own keys use.
const keys = ["actor/A/b", "lane/A/b|pay|{}", 'actor/A/{"id":1}'];

// A store broke a case: what it loaded against what the case expected.
class StoreContractBroken extends Data.TaggedError("StoreContractBroken")<{
  readonly message: string;
}> {}

const sameRecords = Schema.toEquivalence(Schema.ReadonlyMap(Schema.String, Schema.String));

// A record's text as a failure shows it: a long text by its start and length.
const shownText = (text: string) =>
  text.length > 40 ? `${text.slice(0, 40)}… (${text.length} chars)` : text;

const shown = (records: ReadonlyMap<string, string>) =>
  Formatter.format([...records].map(([key, text]) => [key, shownText(text)]));

// The case passes when the store loaded exactly these records.
const loadsExactly =
  (expected: ReadonlyMap<string, string>) => (loaded: ReadonlyMap<string, string>) =>
    sameRecords(loaded, expected)
      ? Effect.void
      : Effect.fail(
          new StoreContractBroken({
            message: `loaded ${shown(loaded)}, expected ${shown(expected)}`,
          }),
        );

// The case passes when the store loaded this text under this key, whatever else it holds.
const loadsKey = (key: string, text: string) => (loaded: ReadonlyMap<string, string>) =>
  loaded.get(key) === text
    ? Effect.void
    : Effect.fail(
        new StoreContractBroken({
          message: `loaded ${key} as ${Formatter.format(Option.map(Option.fromUndefinedOr(loaded.get(key)), shownText))}, expected ${Formatter.format(text)}`,
        }),
      );

/**
 * The two functions of a test runner `storeContract` registers its cases with: `describe` and
 * `it` from Vitest, Jest, Bun's or Node's test runner.
 */
export type ContractRunner = {
  readonly describe: (name: string, body: () => void) => unknown;
  readonly it: (name: string, body: () => Promise<void>) => unknown;
};

/**
 * Checks a `Store` Layer against the store's contract, as Flow checks its own adapters.
 *
 * **When to use**
 *
 * Once per store adapter, in its own test file, with your runner's `describe` and `it`:
 *
 * ```ts
 * import { describe, it } from "vitest"
 *
 * storeContract("my store", layerMyStore, { describe, it })
 * ```
 *
 * **Details**
 *
 * Each case builds the Layer for its own scope of the app `contract/<name>`, through `StoreScope`,
 * so a durable store can be checked on one database. A durable store keeps what the cases wrote:
 * run the contract on a store that starts empty, such as a fresh browser profile. The cases: an
 * empty scope loads empty; a load gives exactly what landed, writes and removals; two batches
 * issued back to back commit in issue order; text is kept exactly; 5,000 records land in one
 * batch; an interrupted write does not block the next; and a fresh build after the first one's
 * scope closed loads what landed.
 *
 * **Gotchas**
 *
 * - A refused or torn batch cannot be arranged through the port: test those in the adapter.
 * - The runner is an argument so that importing `flow-state/testing` loads no test runner.
 */
export const storeContract = entry(
  "storeContract",
  // RETURN_TYPE: void, not the suite describe returns, so a caller registers it and keeps nothing.
  (
    name: string,
    // FLOW_STATE_ALLOW_UNKNOWN: a store's Layer may fail with its own error while it builds.
    layer: Layer.Layer<Store, unknown, StoreScope>,
    runner: ContractRunner,
  ): void => {
    runner.describe(`storeContract: ${name}`, () => {
      const storeIn = (scope: string) =>
        Layer.build(
          Layer.provide(layer, Layer.succeed(StoreScope, { app: `contract/${name}`, scope })),
        ).pipe(Effect.map((built) => Context.get(built, Store)));

      // Each case runs in its own Scope, which releases every store it built.
      // FLOW_STATE_ALLOW_UNKNOWN: a store's Layer may fail with its own error while it builds.
      const check = (title: string, body: Effect.Effect<void, unknown, Scope.Scope>) =>
        // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- a test case is the edge that runs its Effect
        runner.it(title, () => Effect.runPromise(Effect.scoped(body)));

      check(
        "an empty scope loads empty",
        Effect.gen(function* () {
          const store = yield* storeIn("empty");

          yield* loadsExactly(new Map())(yield* store.load);
        }),
      );

      check(
        "a load gives exactly what landed, removals included",
        Effect.gen(function* () {
          const store = yield* storeIn("landed");
          yield* store.write([set("a", "1"), set("b", "2")]);
          yield* store.write([removal("a"), set("c", "3"), removal("never")]);

          yield* loadsExactly(
            new Map([
              ["b", "2"],
              ["c", "3"],
            ]),
          )(yield* store.load);
        }),
      );

      check(
        "two batches issued back to back on one key commit in issue order",
        Effect.gen(function* () {
          const store = yield* storeIn("order");

          // Each write starts at once, so the first is issued before the second.
          const first = yield* Effect.forkChild(store.write([set("k", "first")]), {
            startImmediately: true,
          });

          const second = yield* Effect.forkChild(store.write([set("k", "second")]), {
            startImmediately: true,
          });

          yield* Fiber.join(first);
          yield* Fiber.join(second);

          yield* loadsKey("k", "second")(yield* store.load);
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

          yield* loadsExactly(written)(yield* store.load);
        }),
      );

      check(
        "5,000 records land in one batch",
        Effect.gen(function* () {
          const store = yield* storeIn("many");

          const many = Array.from(
            { length: 5000 },
            (_, n) => [`r${String(n)}`, String(n)] as const,
          );

          yield* store.write(many.map(([key, text]) => set(key, text)));

          yield* loadsExactly(new Map(many))(yield* store.load);
        }),
      );

      check(
        "an interrupted write does not block the next",
        Effect.gen(function* () {
          const store = yield* storeIn("interrupted");

          // The write starts at once and is interrupted while the store has it.
          const cut = yield* Effect.forkChild(store.write([set("a", "cut")]), {
            startImmediately: true,
          });

          yield* Effect.yieldNow;
          yield* Fiber.interrupt(cut);
          yield* store.write([set("b", "next")]);

          yield* loadsKey("b", "next")(yield* store.load);
        }),
      );

      check(
        "a fresh build after the first one's scope closed loads what landed",
        Effect.gen(function* () {
          const first = yield* Scope.make();
          yield* storeIn("reopened").pipe(
            Effect.flatMap((store) => store.write([set("kept", "yes")])),
            Scope.provide(first),
            Effect.ensuring(Scope.close(first, Exit.void)),
          );
          const again = yield* storeIn("reopened");

          yield* loadsKey("kept", "yes")(yield* again.load);
        }),
      );
    });
  },
);
