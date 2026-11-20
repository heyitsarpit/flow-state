import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "@effect/vitest";
import { Cause, Effect, Result, Schema } from "effect";
import {
  CounterAndSettings,
  CounterLive,
  Quantity,
  Settings,
  defineSetting,
  increment,
  readTextFile,
  readTotal,
} from "./style.ts";

describe("Style recipes at consumer boundaries", () => {
  it.effect("S01 a checked setting crosses its codec and drives the real counter service", () =>
    Effect.gen(function* () {
      const setting = defineSetting(Schema.NumberFromString, 2);

      assert(Result.isSuccess(setting));

      const encoded = Schema.encodeSync(setting.success.schema)(setting.success.defaultValue);

      assert.equal(encoded, "2");
      assert(Result.isFailure(defineSetting(Quantity, 0)));

      // @ts-expect-error Defaults must already use the decoded number representation.
      const invalidDefault = defineSetting(Schema.NumberFromString, "2");

      assert(Result.isFailure(invalidDefault));

      const admitted = Schema.decodeSync(setting.success.schema)(encoded);
      const total = yield* increment(admitted);

      assert.equal(total, 2);
      assert.deepEqual(yield* readTotal(), { name: "demo", total: 2 });
    }).pipe(Effect.provide(CounterLive)),
  );

  it.effect(
    "S02 the filesystem adapter reads real text and retains the foreign failure cause",
    () =>
      Effect.gen(function* () {
        const directory = yield* Effect.acquireRelease(
          Effect.sync(() => mkdtempSync(join(tmpdir(), "lint-bomb-style-"))),
          (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true })),
        );

        const path = join(directory, "message.txt");
        const text = "Checkout degraded\nNotify the on-call team";

        yield* Effect.sync(() => writeFileSync(path, text));

        assert.equal(yield* readTextFile(path), text);

        yield* Effect.sync(() => rmSync(path));

        const missing = yield* Effect.result(readTextFile(path));

        assert(Result.isFailure(missing));
        assert.equal(missing.failure.path, path);
        assert(Cause.isUnknownError(missing.failure.cause));
        assert(missing.failure.cause.cause instanceof Error);
      }),
  );

  it.effect("S03 exposed settings agree with the counter's captured configuration", () =>
    Effect.gen(function* () {
      const settings = yield* Settings;

      assert.equal(settings.name, "demo");
      assert.equal(yield* increment(3), 3);
      assert.deepEqual(yield* readTotal(), { name: "demo", total: 3 });
    }).pipe(Effect.provide(CounterAndSettings)),
  );
});
