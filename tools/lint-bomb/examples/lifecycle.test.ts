import assert from "node:assert/strict";
import { describe, it } from "@effect/vitest";
import { Result } from "effect";
import { Upload, UploadEvent, advanceUpload } from "./lifecycle.ts";

describe("A lifecycle at its transition boundary", () => {
  it("L01 an upload moves only through named transitions, carrying each phase's facts", () => {
    const sending = advanceUpload(Upload.Queued({ file: "a.png" }), UploadEvent.Begin());

    assert(Result.isSuccess(sending));

    const failed = advanceUpload(sending.success, UploadEvent.Fail({ reason: "offline" }));

    assert(Result.isSuccess(failed));
    assert.deepEqual(failed.success, Upload.Failed({ file: "a.png", reason: "offline" }));

    const retried = advanceUpload(failed.success, UploadEvent.Retry());

    assert(Result.isSuccess(retried));

    const done = advanceUpload(retried.success, UploadEvent.Succeed({ url: "/a.png" }));

    assert(Result.isSuccess(done));
    assert.deepEqual(done.success, Upload.Done({ file: "a.png", url: "/a.png" }));
  });

  it("L02 every event a phase does not accept is refused with its phase and event", () => {
    const queued = Upload.Queued({ file: "a.png" });
    const sending = Upload.Sending({ file: "a.png" });
    const done = Upload.Done({ file: "a.png", url: "/a.png" });
    const failed = Upload.Failed({ file: "a.png", reason: "offline" });

    const refusals = [
      { upload: queued, event: UploadEvent.Succeed({ url: "/a.png" }) },
      { upload: queued, event: UploadEvent.Fail({ reason: "offline" }) },
      { upload: queued, event: UploadEvent.Retry() },
      { upload: sending, event: UploadEvent.Begin() },
      { upload: sending, event: UploadEvent.Retry() },
      { upload: done, event: UploadEvent.Begin() },
      { upload: done, event: UploadEvent.Succeed({ url: "/b.png" }) },
      { upload: done, event: UploadEvent.Fail({ reason: "offline" }) },
      { upload: done, event: UploadEvent.Retry() },
      { upload: failed, event: UploadEvent.Begin() },
      { upload: failed, event: UploadEvent.Succeed({ url: "/a.png" }) },
      { upload: failed, event: UploadEvent.Fail({ reason: "offline" }) },
    ];

    for (const { upload, event } of refusals) {
      const result = advanceUpload(upload, event);

      assert(Result.isFailure(result));
      assert.equal(result.failure.phase, upload._tag);
      assert.equal(result.failure.event, event._tag);
    }
  });
});
