// The upload copy's checks, read from its Stories' checkpoints (2.10.6): each test runs its Story once and
// destructures what it names. A fragment-alone Story's cut carries the fragment's own snapshot, re-rooted at it
// (2.10.12): `cp.memory`, `cp.operations.put`, `cp.lane(O.put, key)`. The last two Stories are app Stories over the
// editor, so their cuts are reads of an actor.
import { expect, test } from "vite-plus/test";
import { Desk } from "../../testing/desk.fake.js";
import {
  cancelled,
  fileGone,
  gaveUp,
  lostThenResent,
  removedUploadingThenReload,
  removedWhileUploading,
  removeRefused,
  Editor42,
  tooLarge,
  uploaded,
} from "./upload.story.js";
import { Attachment } from "./attachments.domain.js";
import { AttachmentUpload } from "./upload.trait.js";

const { O } = AttachmentUpload;

const r1 = { ref: "r-1" };

// design gap: the full bar. The client half reports half then all of the bytes before the request is held, so
// the row reads 100% while the server has nothing: "Waiting for the server…" (gap 30).
test("the bar reads full while the server has nothing, then the file is stored", async () => {
  const { fullBar, stored } = (await uploaded.run()).checkpoints;

  expect(fullBar.memory.status).toBe("sending");
  expect(fullBar.lane(O.put, r1)).toMatchObject({
    pending: true,
    progress: { sent: 40_000, total: 40_000 },
  });
  expect(stored.memory).toMatchObject({ status: "stored", url: "/uploads/r-1" });
  expect(stored.lane(O.put, r1)).toBeUndefined(); // settled: the lane is gone
  expect(stored.read(Desk).desk.files["r-1"]).toMatchObject({ name: "r-1.jpg", size: 40_000 });
});

test("cancel on the wire stops the row, and the server may still store the file", async () => {
  const { stopped, orphaned } = (await cancelled.run()).checkpoints;

  expect(stopped.memory.status).toBe("stopped");
  expect(stopped.inspection.lanes).toEqual([]); // nothing held
  expect(orphaned.read(Desk.putFile)).toMatchObject([{ phase: "orphan" }]);
});

test("a lost answer is sent again with the same key, and the server stores it once", async () => {
  const { unsure, stored } = (await lostThenResent.run()).checkpoints;

  expect(unsure.memory.status).toBe("unsure");
  expect(unsure.lane(O.put, r1)).toMatchObject({ uncertain: true });
  expect(stored.memory.status).toBe("stored");
  const attempt = stored.attempt(O.put);
  expect(stored.read(Desk.putFile).map((request) => request.input.key)).toEqual([attempt, attempt]);
});

test("nothing arrives: three re-sends, then it gives up and releases the lane", async () => {
  const { gaveUp: gone } = (await gaveUp.run()).checkpoints;

  expect(gone.memory).toMatchObject({ status: "failed", problem: "GaveUp" });
  expect(gone.inspection.lanes).toEqual([]);
});

test("a file over the limit is refused", async () => {
  const { refused } = (await tooLarge.run()).checkpoints;

  expect(refused.memory).toMatchObject({ status: "failed", problem: "TooLarge", limit: 5_000_000 });
});

test("a restored draft with no bytes fails FileGone before anything is sent", async () => {
  const { fileGone: gone } = (await fileGone.run()).checkpoints;

  expect(gone.memory).toMatchObject({ status: "failed", problem: "FileGone" });
  expect(gone.read(Desk.putFile)).toEqual([]); // definite and local: nothing was sent
});

test("removing while uploading releases the lane and parks nothing", async () => {
  const { released } = (await removedWhileUploading.run()).checkpoints;

  expect(released.inspection.lanes).toEqual([]); // rule 60: released, nothing parked
});

test("removing while uploading, then a reload, leaves nothing behind", async () => {
  const { reopened } = (await removedUploadingThenReload.run()).checkpoints;

  expect(reopened.inspection?.lanes).toEqual([]);
});

test("a refused remove of a stored file brings the record back in place", async () => {
  const { removePredicted, removeRefusedRestored } = (await removeRefused.run()).checkpoints;
  const old = { ref: "r-old" };

  expect(removePredicted.entity(Attachment, old)).toBeUndefined(); // hidden at once
  expect(removeRefusedRestored.entity(Attachment, old)).toMatchObject({
    data: { name: "before.jpg", uploadedBy: "dispatcher-2" },
    predicted: false,
  });
  expect(removeRefusedRestored.read(Editor42)?.memory.error).toBe(
    "Only dispatcher-2 can remove that file",
  );
});
