import { Predicate } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { type Attachment, photo } from "../../fixtures/chat/machines/attachment.ts";
import { uploadProgress, uploadStopped } from "../../fixtures/chat/stories/attachments.ts";
import type { Cut } from "../../src/host/testing/index.ts";
import type { ActorRef } from "../../src/index.ts";

// A message's attachment, uploaded in chunks. Expected results are Plan Operations O6: a write row's
// `progress` is set by the commit's `progress(p)` with no turn, and stays on the row while its
// Attempt is held unsure.

const load = async () => Promise.resolve({ uploadProgress, uploadStopped, photo });

const progressOf = (cut: Cut, ref: ActorRef<typeof Attachment>) => {
  const row = cut.read(ref)?.operations.get("upload")?.get('{"uploadId":"up-1"}');

  return Predicate.hasProperty(row, "progress") ? row.progress : undefined;
};

describe("an attachment's upload (Plan Operations O6)", () => {
  it("Plan Operations O6: an upload's row shows the share sent after each chunk, and the photo is attached", async () => {
    const { uploadProgress, photo } = await load();
    const run = await uploadProgress.run();

    expect(progressOf(run.checkpoints["one chunk"], photo)).toBe(1 / 4);
    expect(run.checkpoints.attached.read(photo)?.state).toBe("ATTACHED");
  });

  it("Plan Operations O3, O6: a stopped upload is unsure, its row at the share it sent", async () => {
    const { uploadStopped, photo } = await load();
    const run = await uploadStopped.run();

    expect(run.checkpoints.stopped.read(photo)?.memory.notice).toBe("upload stopped");
    expect(progressOf(run.checkpoints.stopped, photo)).toBe(1 / 4);
  });
});
