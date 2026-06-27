import { Context } from "effect";

import { createControlledStream, createTestLayer } from "@flow-state/core";
import type { ControlledStreamHandle, FlowTestLayer } from "@flow-state/core";

import type { UploadFailure, UploadFile, UploadProgress } from "./uploadFlow";

export interface UploadServiceImplementation {
  readonly uploadFiles: (files: readonly UploadFile[]) => AsyncIterable<UploadProgress>;
}

export class UploadService extends Context.Service<UploadService, UploadServiceImplementation>()(
  "example/UploadService",
) {}

export interface UploadTestLayerOptions {
  readonly progress?: ControlledStreamHandle<UploadProgress, UploadFailure>;
  readonly uploadFiles?: (files: readonly UploadFile[]) => AsyncIterable<UploadProgress>;
}

export function createUploadTestLayer(options: UploadTestLayerOptions = {}): {
  readonly layer: FlowTestLayer<UploadService, UploadServiceImplementation>;
  readonly progress: ControlledStreamHandle<UploadProgress, UploadFailure>;
} {
  const progress =
    options.progress ?? createControlledStream<UploadProgress, UploadFailure>("upload.progress");

  return {
    progress,
    layer: createTestLayer(
      UploadService,
      UploadService.of({
        uploadFiles: options.uploadFiles ?? (() => progress.stream()),
      }),
    ),
  };
}
