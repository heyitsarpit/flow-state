// The upload port, its Schemas, and `PendingFiles`. Editor memory holds `{ ref, name, size }` and
// is persisted, so it cannot hold a `File` (it must decode on restore). The bytes wait here, in
// this tab's memory, keyed by `ref`. After a reload they are gone: a copy found mid-upload (`unknown { Restored }`) ends
// `FileGone` through its `Lost` event, and a restored draft that never started fails `FileGone` at `take`.
import { Context, Effect, Layer, Schema } from "effect";
import type { NoResponse, ServerError, TicketKey } from "../Tickets/types.js";

// A stored file is a record (`Attachment`, attachments.domain.ts): the ticket's file list holds it, and a
// remove predicts its delete everywhere at once.
export const StoredAttachment = Schema.Struct({
  workspaceId: Schema.String,
  ticketId: Schema.String,
  ref: Schema.String,
  name: Schema.String,
  size: Schema.Number,
  url: Schema.String,
  uploadedBy: Schema.String,
  revision: Schema.Number,
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

// 403 on a remove: only the uploader, or an admin, removes a file. Definite: the record comes back (E3).
export class RemoveRefused extends Schema.TaggedError<RemoveRefused>()("RemoveRefused", {
  uploadedBy: Schema.String,
}) {}

export class AttachmentsApi extends Context.Service<
  AttachmentsApi,
  {
    // `onProgress` is a plain callback: the adapter wires it to the XHR event, and the
    // commit forwards it to the lane's `progress` setter (S5 Q11).
    files: (
      ticket: TicketKey,
      options: { signal: AbortSignal },
    ) => Effect.Effect<ReadonlyArray<StoredAttachment>, NoResponse>;
    remove: (
      input: TicketKey & { ref: string },
      options: { idempotencyKey: string; signal: AbortSignal },
    ) => Effect.Effect<void, RemoveRefused | NoResponse | ServerError>;
    put: (
      ticket: TicketKey,
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
