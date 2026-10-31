// The upload copy's checks, read from its Stories' checkpoints (`@flow-state/vitest`, proposed; COVERAGE.md
// section 6 and features/Tickets/editor/editor.test.ts say what `at` is). A fragment-alone Story's cut carries
// the fragment's own snapshot, re-rooted at it (2.10.12): `at.x.memory`, `at.x.operations.put`.
import { storyTest } from "@flow-state/vitest"; // NEW (proposed)
import { Story } from "flow-state/testing";
import { expect } from "vite-plus/test";
import { Desk } from "../../testing/desk.fake.js";
import {
  cancelled,
  fileGone,
  gaveUp,
  lostThenResent,
  removedUploadingThenReload,
  removedWhileUploading,
  tooLarge,
  uploaded,
} from "./upload.story.js";
import { AttachmentUpload } from "./upload.trait.js";

const { O } = AttachmentUpload;

// design gap: the full bar. The client half reports half then all of the bytes before the request is held, so
// the row reads 100% while the server has nothing: "Waiting for the server…" (gap 30).
storyTest(uploaded, ({ at }) => {
  expect(at["full-bar"].memory.status).toBe("sending");
  expect(at["full-bar"].operations.put).toMatchObject([
    { key: { ref: "r-1" }, pending: true, progress: { sent: 40_000, total: 40_000 } },
  ]);
  expect(at.stored.memory).toMatchObject({ status: "stored", url: "/uploads/r-1" });
  expect(at.stored.operations.put).toEqual([]); // settled: the lane is gone
  expect(at.stored.read(Desk).desk.files["r-1"]).toMatchObject({ name: "r-1.jpg", size: 40_000 });
});

storyTest(cancelled, ({ at }) => {
  expect(at.stopped.memory.status).toBe("stopped");
  expect(at.stopped.read(Story.inspection).lanes).toEqual([]); // nothing held
  expect(at.orphaned.read(Desk.putFile)).toMatchObject([{ phase: "orphan" }]);
});

storyTest(lostThenResent, ({ at }) => {
  expect(at.unsure.memory.status).toBe("unsure");
  expect(at.unsure.operations.put).toMatchObject([{ key: { ref: "r-1" }, uncertain: true }]);
  expect(at.stored.memory.status).toBe("stored");
  const attempt = at.stored.read(Story.attempt(O.put));
  expect(at.stored.read(Desk.putFile).map((request) => request.input.key)).toEqual([
    attempt,
    attempt,
  ]);
});

storyTest(gaveUp, ({ at }) => {
  expect(at["gave-up"].memory).toMatchObject({ status: "failed", problem: "GaveUp" });
  expect(at["gave-up"].read(Story.inspection).lanes).toEqual([]);
});

storyTest(tooLarge, ({ at }) => {
  expect(at.refused.memory).toMatchObject({
    status: "failed",
    problem: "TooLarge",
    limit: 5_000_000,
  });
});

storyTest(fileGone, ({ at }) => {
  expect(at["file-gone"].memory).toMatchObject({ status: "failed", problem: "FileGone" });
  expect(at["file-gone"].read(Desk.putFile)).toEqual([]); // definite and local: nothing was sent
});

storyTest(removedWhileUploading, ({ at }) => {
  expect(at.released.read(Story.inspection).lanes).toEqual([]); // rule 60: released, nothing parked
});

storyTest(removedUploadingThenReload, ({ at }) => {
  expect(at.reopened.read(Story.inspection).lanes).toEqual([]);
});
