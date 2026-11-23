import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "@effect/vitest";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect, FileSystem, Layer, Result } from "effect";
import { AnnouncementFile, AnnouncementMemory, announcementBanner } from "./announcements.ts";

// This fixture owns only real files and their lifetime. It implements no source or consumer behavior.
const fileSource = (text: string) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "lint-bomb-announcements-" });
      const path = join(directory, "announcement.json");

      yield* fs.writeFileString(path, text);

      return AnnouncementFile.layer(path);
    }),
  ).pipe(Layer.provide(NodeFileSystem.layer));

describe("One consumer, alternative AnnouncementSource implementation Layers", () => {
  for (const implementation of [
    { name: "memory", layer: AnnouncementMemory.layer },
    { name: "real filesystem", layer: fileSource },
  ]) {
    describe(implementation.name, () => {
      it.effect("A01 the unchanged consumer renders valid announcement content", () =>
        Effect.gen(function* () {
          const banner = yield* announcementBanner().pipe(
            Effect.provide(
              implementation.layer(
                '{"title":"Maintenance","message":"Checkout resumes at 14:00 UTC"}',
              ),
            ),
          );

          assert.equal(banner, "Maintenance: Checkout resumes at 14:00 UTC");
        }),
      );

      it.effect("A02 invalid content is rejected at the same schema boundary", () =>
        Effect.gen(function* () {
          for (const text of [
            "{",
            '{"title":"","message":"Missing title"}',
            '{"title":"Maintenance","message":"Soon","extra":true}',
          ]) {
            const result = yield* announcementBanner().pipe(
              Effect.provide(implementation.layer(text)),
              Effect.result,
            );

            assert(Result.isFailure(result));
            assert.equal(result.failure._tag, "SchemaError");
          }
        }),
      );
    });
  }

  it.effect(
    "A03 a file failure retains its platform cause instead of becoming invalid content",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;

        const directory = yield* fs.makeTempDirectoryScoped({
          prefix: "lint-bomb-missing-announcement-",
        });

        const result = yield* announcementBanner().pipe(
          Effect.provide(AnnouncementFile.layer(join(directory, "missing.json"))),
          Effect.result,
        );

        assert(Result.isFailure(result));
        assert.equal(result.failure._tag, "AnnouncementUnavailable");

        assert.equal(result.failure.cause.reason._tag, "NotFound");
      }).pipe(Effect.provide(NodeFileSystem.layer)),
  );
});
