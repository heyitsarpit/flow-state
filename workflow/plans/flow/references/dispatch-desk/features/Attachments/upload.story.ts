// Fragment Stories (2.10.12): the trait alone, in the stand-in host Flow builds. Each step settles
// (rule 61); the world is the `Desk` fake, driven with wire words, never with injected results.
// `PendingFiles` is tab memory, so a fixture provides it (desk.fake.ts leaves it to setup).
import { Effect, Layer } from "effect";
import { Story } from "flow-state/testing";
import { DeskSetup } from "../../app/setup.js";
import { Desk, DeskClient } from "../../testing/desk.fake.js";
import { editorRef } from "../Tickets/editor/editor.ref.js";
import { Editor } from "../Tickets/editor/editor.definition.js";
import { PendingFiles, PendingFilesLive } from "./attachments-api.js";
import { AttachmentUpload } from "./upload.trait.js";

const { E, O } = AttachmentUpload;

const draft = (ref: string, bytes: number) => ({ ref, name: `${ref}.jpg`, size: bytes });

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

// One upload alone. `subject` is the `.each` key the editor would give it, so the lane's subject path
// is [ref] as in the editor.
const upload = (id: string, d: ReturnType<typeof draft>) =>
  Story.make(AttachmentUpload, { id, fixtures: [DeskClient, Kept] }).enter(d, { subject: d.ref });

// design gap: the full bar. The client half reports half then all of the bytes before the request
// is held, so the row reads 100% while the server has nothing: "Waiting for the server…".
export const uploaded = upload("upload/uploaded", Photo)
  .world(Desk.putFile.hold()) // in transit, unseen by the server
  .expect({
    memory: { status: "sending" },
    operations: { put: { pending: true, progress: { sent: 40_000, total: 40_000 } } },
  })
  .world(Desk.putFile.release())
  .expect({
    memory: { status: "stored", url: "/uploads/r-1" },
    operations: { put: { pending: false, uncertain: false } },
  })
  .expect(Desk, { desk: { files: { "r-1": { name: "r-1.jpg", size: 40_000 } } } });

// Cancel on the wire: the fiber is interrupted, `unknown { Cancelled }` arrives as `Stopped`, and the
// handler's key-less cancel releases it. The request already left, so the server may still store it.
export const cancelled = Story.make(AttachmentUpload, {
  id: "upload/cancelled",
  fixtures: [DeskClient, Kept],
  world: [Desk.putFile.hold()],
})
  .enter(Photo, { subject: Photo.ref })
  .send(E.Cancel())
  .expect({
    memory: { status: "stopped" },
    operations: { put: { pending: false, uncertain: false } },
  })
  .expect(Story.inspection, { lanes: [] }) // nothing held
  .world(Desk.putFile.release()) // the server handles it and the answer goes nowhere
  .expect(Desk.putFile, [{ phase: "orphan", via: { attempts: [Story.attempt(O.put)] } }]);

// The answer is lost after the server stored the file. The same Attempt is sent again three seconds
// later with the same idempotency key, so the server stores it once.
export const lostThenResent = upload("upload/lost-then-resent", Photo)
  .world(Desk.putFile.drop({ at: "response", times: 1 }))
  .expect({ memory: { status: "unsure" }, operations: { put: { uncertain: true } } })
  .advance("3 seconds")
  .expect({ memory: { status: "stored" }, operations: { put: { uncertain: false } } })
  .expect(Desk.putFile, [
    { phase: "dropped", via: { attempts: [Story.attempt(O.put)] } },
    { phase: "answered", via: { attempts: [Story.attempt(O.put)] } },
  ]);

// Nothing arrives: three re-sends at 3, 6 and 9 seconds, then the fourth tick gives up and releases.
export const gaveUp = Story.make(AttachmentUpload, {
  id: "upload/gave-up",
  fixtures: [DeskClient, Kept],
  world: [Desk.putFile.drop({ times: "always" })],
})
  .enter(Photo, { subject: Photo.ref })
  .advance("12 seconds")
  .expect({
    memory: { status: "failed", problem: "GaveUp" },
    operations: { put: { pending: false, uncertain: false } },
  })
  .expect(Story.inspection, { lanes: [] });

export const tooLarge = upload("upload/too-large", Huge).expect({
  memory: { status: "failed", problem: "TooLarge", limit: 5_000_000 },
  operations: { put: { pending: false, uncertain: false } },
});

// A restored draft after a reload: `PendingFiles` starts empty, so `take` fails `FileGone` before
// anything is sent. Definite, so no re-send.
export const fileGone = upload("upload/file-gone", Lost)
  .expect({ memory: { status: "failed", problem: "FileGone" } })
  .expect(Desk.putFile, []);

// Remove while uploading (rule 60): leaving ends the copy, and the lane on the wire is interrupted and
// released, so nothing is parked for a copy that will never return.
export const removedWhileUploading = upload("upload/removed-while-uploading", Photo)
  .world(Desk.putFile.hold())
  .leave()
  .expect(Story.inspection, { lanes: [] });

// The same walk across a reload, in the editor (an app Story, so tabs close and open). Nothing is parked
// and no write is unsettled afterwards.
// `AttachFile` and `RemoveAttachment` are the editor's events (editor.definition.ts); `Kept` seeds the bytes
// in every tab, which is enough here because nothing needs them after the reload.
const T42 = { workspaceId: "north", ticketId: "T-42" };

const Editor42 = editorRef(T42);

export const removedUploadingThenReload = Story.make(DeskSetup, {
  id: "upload/removed-uploading-then-reload",
  fixtures: [DeskClient, Kept],
})
  .ensure(Editor42, { input: T42 })
  .world(Desk.putFile.hold())
  .send(Editor42, Editor.E.AttachFile(Photo))
  .send(Editor42, Editor.E.RemoveAttachment({ ref: Photo.ref }))
  .closeTab("main")
  .world(Desk.putFile.release()) // the request still travels; the answer goes nowhere
  .openTab("main", { from: "main" })
  .expect(Story.inspection, { lanes: [] });
