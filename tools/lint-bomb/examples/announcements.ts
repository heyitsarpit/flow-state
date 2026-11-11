// Flow: source capability -> content admission -> banner; the application chooses the source Layer.
// Concern = responsibility; Boundary = its implementation through a contract.
// Protocol = data with agreed meaning; Established fact = what construction or validation proves.
// Composition level = depth in this workflow, not a required folder or class.
import { Context, Data, Effect, FileSystem, Layer, Schema } from "effect";
import type { PlatformError } from "effect/PlatformError";

/*****************************************************************************/
/* Level 1: Source capability and interchangeable implementations */
/*****************************************************************************/

// Contract: read returns wire text or AnnouncementUnavailable; content validity is established downstream.
export class AnnouncementUnavailable extends Data.TaggedError("AnnouncementUnavailable")<{
  cause: PlatformError;
}> {}

// The contract is a capability to read wire text, not a promise that the content is valid.
// Memory is useful for embedded configuration/tests; files support deployment-managed content.
export class AnnouncementSource extends Context.Service<
  AnnouncementSource,
  { read: Effect.Effect<string, AnnouncementUnavailable> }
>()("lint-bomb/examples/announcements/AnnouncementSource") {}

// Named implementations each expose .layer; consumers only depend on AnnouncementSource.
export const AnnouncementMemory = {
  layer: (text: string) => Layer.succeed(AnnouncementSource)({ read: Effect.succeed(text) }),
};

export const AnnouncementFile = {
  // Capture the capability, not file contents: each read observes the current file.
  // FileSystem remains a construction requirement until the application provides its Layer.
  layer: (path: string) =>
    Layer.effect(
      AnnouncementSource,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;

        return AnnouncementSource.of({
          read: fs
            .readFileString(path)
            .pipe(Effect.mapError((cause) => new AnnouncementUnavailable({ cause }))),
        });
      }),
    ),
};

/*****************************************************************************/
/* Level 1: Content admission */
/*****************************************************************************/

// Protocol: Announcement carries nonempty, bounded content after successful admission.
// Both source implementations share this boundary, so parsing rules have one authority.
const Announcement = Schema.Struct({
  title: Schema.NonEmptyString.check(Schema.isMaxLength(80)),
  message: Schema.NonEmptyString.check(Schema.isMaxLength(500)),
});

const decodeAnnouncement = Schema.decodeEffect(Schema.fromJsonString(Announcement), {
  onExcessProperty: "error",
});

/*****************************************************************************/
/* Level 0: Banner workflow */
/*****************************************************************************/

// Composition site: acquire text -> admit content -> render; source choice stays with the application.
// The consumer only requires AnnouncementSource. It cannot select or inspect an implementation.
// Schema establishes content validity once, after either source crosses the wire boundary.
export const announcementBanner = Effect.fn("announcementBanner")(function* () {
  const source = yield* AnnouncementSource;
  const text = yield* source.read;
  const announcement = yield* decodeAnnouncement(text);

  // Carry established facts: rendering relies on admitted content; it does not recheck required fields.
  return `${announcement.title}: ${announcement.message}`;
});
