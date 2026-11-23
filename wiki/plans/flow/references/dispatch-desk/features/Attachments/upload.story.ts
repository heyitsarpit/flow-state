// Fragment Stories (`Story.fragment`, 2.10.12): the trait alone, in the stand-in host Flow builds. Each step settles
// (rule 61); the world is the `Desk` fake, driven with wire words, never with injected results. Transcripts:
// inputs and checkpoints only; upload.test.ts reads them. `enter` starts the upload, so a wire rule that has to meet
// the request is set before it, in the `world` option (a rule set after the send is `UnusedWireRule`, 2.10.4).
// `PendingFiles` is tab memory, so a fixture provides it (desk.fake.ts leaves it to setup).
import { Effect, Layer } from "effect";
import { Story } from "flow-state/testing";
import { DeskSetup } from "../../app/setup.js";
import { Desk, DeskClient } from "../../testing/desk.fake.js";
import { editorRef } from "../Tickets/editor/editor.ref.js";
import { Editor } from "../Tickets/editor/editor.definition.js";
import { PendingFiles, PendingFilesLive } from "./attachments-api.js";
import { AttachmentUpload } from "./upload.trait.js";

const { E } = AttachmentUpload;

const draft = (ref: string, bytes: number) => ({
  workspaceId: "north",
  ticketId: "T-42",
  ref,
  name: `${ref}.jpg`,
  size: bytes,
});

export const Photo = draft("r-1", 40_000);

export const Huge = draft("r-big", 6_000_000); // over the server's 5,000,000-byte limit

export const Lost = draft("r-lost", 40_000); // a restored draft: no bytes were ever kept in this tab

// The bytes a dropped file leaves in `PendingFiles`. `Lost` is left out on purpose.
const Kept = Layer.effectDiscard(
  PendingFiles.use((files) =>
    Effect.forEach([Photo, Huge], (d) =>
      files.keep(d.ref, new File([new Uint8Array(d.size)], d.name)),
    ),
  ),
).pipe(Layer.provideMerge(PendingFilesLive));

type World = NonNullable<Parameters<typeof Story.fragment>[1]["world"]>;

// One upload alone. `subject` is the `.each` key the editor would give it, so the lane's subject path
// is [ref] as in the editor.
const upload = (id: string, d: ReturnType<typeof draft>, world: World = []) =>
  Story.fragment(AttachmentUpload, { id, fixtures: [DeskClient, Kept], world }).enter(d, {
    subject: d.ref,
  });

// design gap: the full bar. The client half reports half then all of the bytes before the request
// is held, so the row reads 100% while the server has nothing: "Waiting for the server…".
export const uploaded = upload("upload/uploaded", Photo, [Desk.putFile.hold()]) // in transit, unseen by the server
  .checkpoint("fullBar")
  .world(Desk.putFile.release())
  .checkpoint("stored");

// Cancel on the wire: the fiber is interrupted, `unknown { Cancelled }` arrives as `Stopped`, and the
// handler's key-less cancel releases it. The request already left, so the server may still store it.
export const cancelled = Story.fragment(AttachmentUpload, {
  id: "upload/cancelled",
  fixtures: [DeskClient, Kept],
  world: [Desk.putFile.hold()],
})
  .enter(Photo, { subject: Photo.ref })
  .send(E.Cancel())
  .checkpoint("stopped")
  .world(Desk.putFile.release()) // the server handles it and the answer goes nowhere
  .checkpoint("orphaned");

// The answer is lost after the server stored the file. The same Attempt is sent again three seconds
// later with the same idempotency key, so the server stores it once.
export const lostThenResent = upload("upload/lost-then-resent", Photo, [
  Desk.putFile.drop({ at: "response", times: 1 }),
])
  .checkpoint("unsure")
  .advance("3 seconds")
  .checkpoint("stored");

// Nothing arrives: three re-sends at 3, 6 and 9 seconds, then the fourth tick gives up and releases.
export const gaveUp = Story.fragment(AttachmentUpload, {
  id: "upload/gave-up",
  fixtures: [DeskClient, Kept],
  world: [Desk.putFile.drop({ times: "always" })],
})
  .enter(Photo, { subject: Photo.ref })
  .advance("12 seconds")
  .checkpoint("gaveUp");

export const tooLarge = upload("upload/too-large", Huge).checkpoint("refused");

// A restored draft after a reload: `PendingFiles` starts empty, so `take` fails `FileGone` before
// anything is sent. Definite, so no re-send.
export const fileGone = upload("upload/file-gone", Lost).checkpoint("fileGone");

// Remove while uploading (rule 60): leaving ends the copy, and the lane on the wire is interrupted and
// released, so nothing is parked for a copy that will never return.
export const removedWhileUploading = upload("upload/removed-while-uploading", Photo, [
  Desk.putFile.hold(),
])
  .leave()
  .checkpoint("released");

// The same walk across a reload, in the editor (an app Story, so tabs close and open). Nothing is parked
// and no write is unsettled afterwards.
// `AttachFile` and `RemoveAttachment` are the editor's events (editor.definition.ts); `Kept` seeds the bytes
// in every tab, which is enough here because nothing needs them after the reload.
const T42 = { workspaceId: "north", ticketId: "T-42" };

export const Editor42 = editorRef(T42);

export const removedUploadingThenReload = Story.app(DeskSetup, {
  id: "upload/removed-uploading-then-reload",
  fixtures: [DeskClient, Kept],
})
  .ensure(Editor42, { input: T42 })
  .world(Desk.putFile.hold())
  .send(Editor42, Editor.E.AttachFile({ ref: Photo.ref, name: Photo.name, size: Photo.size }))
  .send(Editor42, Editor.E.RemoveAttachment({ ref: Photo.ref }))
  .closeTab("main")
  .world(Desk.putFile.release()) // the request still travels; the answer goes nowhere
  .openTab("main", { from: "main" })
  .checkpoint("reopened");

// A stored file someone else uploaded (seeded as `r-old`). Removing it predicts its delete, so it leaves the
// editor's file list at once; the server refuses (403: only the uploader removes a file), and the definite failure
// brings the record back in place with no repair (E3).
export const removeRefused = Story.app(DeskSetup, {
  id: "upload/remove-refused-restored",
  fixtures: [DeskClient, Kept],
})
  .ensure(Editor42, { input: T42 })
  .world(Desk.removeFile.hold({ at: "response" }))
  .send(Editor42, Editor.E.RemoveStoredFile({ ref: "r-old" }))
  .checkpoint("removePredicted")
  .world(Desk.removeFile.release())
  .checkpoint("removeRefusedRestored");
