import { describe, expect, it } from "vite-plus/test";

import { createControlledStream, flowTest } from "@flow-state/core";

import { UploadService, createUploadTestLayer } from "./uploadApi";
import {
  applyProgress,
  dismissCompleted,
  formatBytes,
  selectUploadSummary,
  uploadMachine,
  uploadProgress,
} from "./uploadFlow";
import type { UploadCandidate, UploadFailure, UploadProgress } from "./uploadFlow";

const releaseFiles: readonly UploadCandidate[] = [
  { name: "demo.mov", size: 1_000 },
  { name: "notes.pdf", size: 500 },
];

function createUploadHarness() {
  return flowTest(uploadMachine);
}

describe("Example 2 Streaming Upload Manager API pressure", () => {
  it("records the final stream and timer API shape", () => {
    expect(uploadProgress.kind).toBe("stream");
    expect(uploadProgress.config).toMatchObject({
      id: "upload.progress",
      pressure: {
        strategy: "coalesce-latest",
      },
      routes: {
        value: expect.any(Function),
        done: expect.any(Function),
        failure: expect.any(Function),
        defect: expect.any(Function),
        interrupt: expect.any(Function),
      },
    });
    expect(
      uploadProgress.config.pressure.key({
        fileId: "file-1",
        uploadedBytes: 1,
        totalBytes: 2,
      }),
    ).toBe("file-1");

    expect(dismissCompleted).toEqual({
      kind: "after",
      config: {
        id: "upload.dismiss-completed",
        delay: "2 seconds",
        target: "idle",
        update: expect.any(Function),
      },
    });
  });

  it("records the upload service and test layer path without running stream runtime", () => {
    const progress = createControlledStream<UploadProgress, UploadFailure>("upload.progress");
    const uploadFiles = (): AsyncIterable<UploadProgress> => progress.stream();
    const layer = createUploadTestLayer({ progress, uploadFiles });

    expect(layer.progress.name).toBe("upload.progress");
    expect(layer.layer.kind).toBe("testLayer");
    expect(layer.layer.service).toBe(UploadService);
    expect(layer.layer.implementation.uploadFiles).toBe(uploadFiles);
  });

  it("exposes the controlled stream handle needed by future runtime tests", () => {
    const stream = createControlledStream<UploadProgress, UploadFailure>("upload.progress");

    stream.stream();
    stream.emit({ fileId: "file-1", uploadedBytes: 250, totalBytes: 1_000 });
    stream.end();

    expect(stream.events()).toEqual([
      { type: "start" },
      {
        type: "value",
        value: { fileId: "file-1", uploadedBytes: 250, totalBytes: 1_000 },
      },
      { type: "done" },
    ]);
  });

  it("keeps runtime stream and timer slots separate from resources", () => {
    const harness = createUploadHarness();

    expect(harness.snapshot()).toMatchObject({
      resources: {},
      mutations: {},
      streams: {},
      timers: {},
    });
    expect(harness.streams().get("upload.progress")).toBeNull();
    expect(harness.timers().get("upload.dismiss-completed")).toBeNull();
  });
});

describe("Example 2 Streaming Upload Manager product flow", () => {
  it("stages files and gates upload start", () => {
    const harness = createUploadHarness();

    expect(harness.state()).toBe("idle");
    expect(harness.can({ type: "START_UPLOAD" })).toBe(false);

    harness.send({ type: "CHOOSE_FILES", files: releaseFiles });

    expect(harness.state()).toBe("ready");
    expect(harness.can({ type: "START_UPLOAD" })).toBe(true);
    expect(harness.context().files.map((file) => [file.id, file.name, file.status])).toEqual([
      ["file-1", "demo.mov", "queued"],
      ["file-2", "notes.pdf", "queued"],
    ]);
  });

  it("applies progress through product events while stream runtime is pending", () => {
    const harness = createUploadHarness()
      .send({ type: "CHOOSE_FILES", files: releaseFiles })
      .send({ type: "START_UPLOAD" });

    expect(harness.state()).toBe("uploading");

    harness.send({
      type: "UPLOAD_PROGRESS",
      progress: {
        fileId: "file-1",
        uploadedBytes: 500,
        totalBytes: 1_000,
      },
    });

    expect(harness.context().files[0]).toMatchObject({
      id: "file-1",
      uploadedBytes: 500,
      status: "uploading",
    });
    expect(selectUploadSummary(harness.context())).toMatchObject({
      totalBytes: 1_500,
      uploadedBytes: 500,
      percent: 33,
    });
  });

  it("routes completion, cancellation, retry, and failure with ordinary machine events", () => {
    const harness = createUploadHarness()
      .send({ type: "CHOOSE_FILES", files: releaseFiles })
      .send({ type: "START_UPLOAD" });

    harness.send({ type: "CANCEL_UPLOAD" });
    expect(harness.state()).toBe("cancelled");
    expect(harness.context().files.every((file) => file.status === "cancelled")).toBe(true);

    harness.send({ type: "RETRY_UPLOAD" });
    expect(harness.state()).toBe("uploading");

    harness.send({
      type: "UPLOAD_FAILED",
      error: {
        _tag: "NetworkUnavailable",
        message: "Transfer window closed.",
      },
    });
    expect(harness.state()).toBe("failed");
    expect(harness.context().failure).toMatchObject({
      _tag: "NetworkUnavailable",
    });
  });

  it("keeps pure helpers deterministic", () => {
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(1_500)).toBe("1.5 KB");
    expect(
      applyProgress({
        context: {
          files: [
            {
              id: "file-1",
              name: "demo.mov",
              size: 1_000,
              uploadedBytes: 0,
              status: "uploading",
            },
          ],
          nextFileId: 2,
          failure: null,
          defect: null,
        },
        event: {
          type: "UPLOAD_PROGRESS",
          progress: {
            fileId: "file-1",
            uploadedBytes: 2_000,
            totalBytes: 1_000,
          },
        },
        snapshot: uploadMachine.getInitialSnapshot(),
        runtime: { now: Date.now },
      }),
    ).toEqual({
      files: [
        {
          id: "file-1",
          name: "demo.mov",
          size: 1_000,
          uploadedBytes: 1_000,
          status: "complete",
        },
      ],
    });
  });
});
