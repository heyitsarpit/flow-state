// The upload port, its Schemas, and `PendingFiles`. Editor memory holds `{ ref, name, size }` and
// is persisted, so it cannot hold a `File` (it must decode on restore). The bytes wait here, in
// this tab's memory, keyed by `ref`. After a reload they are gone, and the upload ends `FileGone`.
import { Context, Effect, Layer, Schema } from "effect";
import type { NoResponse, ServerError } from "../Tickets/types.js";

export const StoredAttachment = Schema.Struct({
  ref: Schema.String,
  name: Schema.String,
  size: Schema.Number,
  url: Schema.String,
});

export type StoredAttachment = typeof StoredAttachment.Type;

// What `XMLHttpRequest.upload.onprogress` reports. `sent` is an upper bound on what the server has
// (the browser counts bytes handed to the network, not bytes acknowledged), so a full bar still
// reads "Waiting for the server…".
export type UploadProgress = { sent: number; total: number };

// 413: the file is over the limit. Definite, so a retry would only fail again.
export class TooLarge extends Schema.TaggedError<TooLarge>()("TooLarge", {
  limit: Schema.Number,
}) {}

// The bytes for a draft are not in this tab: a reload cleared them. Definite and local, since
// nothing was sent.
export class FileGone extends Schema.TaggedError<FileGone>()("FileGone", { ref: Schema.String }) {}

export class AttachmentsApi extends Context.Service<
  AttachmentsApi,
  {
    // `onProgress` is a plain callback: the adapter wires it to the XHR event (M6 4.5), and the
    // commit forwards it to the lane's `progress` setter (pending merge 6, S5 Q11).
    put: (
      ref: string,
      bytes: Blob,
      options: {
        idempotencyKey: string;
        signal: AbortSignal;
        onProgress: (progress: UploadProgress) => void;
      },
    ) => Effect.Effect<StoredAttachment, TooLarge | NoResponse | ServerError>;
  }
>()("DispatchDesk/AttachmentsApi") {}

export class PendingFiles extends Context.Service<
  PendingFiles,
  {
    keep: (ref: string, file: File) => Effect.Effect<void>;
    // Fails `FileGone` when the bytes are not here (a restored draft after a reload).
    take: (ref: string) => Effect.Effect<File, FileGone>;
    discard: (ref: string) => Effect.Effect<void>;
  }
>()("DispatchDesk/PendingFiles") {}

// A tab-lifetime store. Each build starts empty, which is what a reload does.
export const PendingFilesLive = Layer.sync(PendingFiles, () => {
  const files = new Map<string, File>();

  return PendingFiles.of({
    keep: (ref, file) => Effect.sync(() => void files.set(ref, file)),
    take: (ref) => {
      const file = files.get(ref);

      return file ? Effect.succeed(file) : Effect.fail(new FileGone({ ref }));
    },
    discard: (ref) => Effect.sync(() => void files.delete(ref)),
  });
});
