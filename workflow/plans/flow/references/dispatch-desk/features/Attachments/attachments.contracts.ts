// The upload contract. Plain request, no trait or domain imports: the trait (upload.trait.ts) maps its
// endings. Every contract states `input`, `output` and `key` (rule 39).
import { Effect, Schema } from "effect";
import { transaction } from "flow-state";
import { unknownWhenLost } from "../shared/outcomes.js";
import { AttachmentsApi, PendingFiles, StoredAttachment } from "./attachments-api.js";

// Input is the ref only. The bytes are not input: the editor is persisted and its memory must decode
// on restore, so the commit takes them from `PendingFiles` (REWRITE-PLAN section 6, item 2).
// One lane per ref (key), `reject`, so ten uploads are ten lanes, each with its own progress.
export const putAttachment = transaction({
  id: "DispatchDesk/put-attachment",
  input: { ref: Schema.String },
  output: StoredAttachment,
  key: ["ref"],
  concurrency: "reject",
  progress: { sent: Schema.Number, total: Schema.Number }, // the row's `progress`; `sent` is an upper bound
  commit: ({ ref }, { attempt, signal, progress }) =>
    PendingFiles.use((files) => files.take(ref)).pipe(
      // FileGone: definite and local, nothing was sent
      Effect.flatMap((file) =>
        AttachmentsApi.use((api) =>
          api.put(ref, file, {
            idempotencyKey: attempt.id, // a re-send of this Attempt carries the same key (rule 19)
            signal,
            onProgress: (p) => progress(p), // pending merge 6: the commit context's `progress(p)` setter (S5 Q11)
          }),
        ),
      ),
      // TooLarge (413): definite
      unknownWhenLost, // NoResponse and ServerError (5xx): unknown. TooLarge (413) and FileGone stay failures
    ),
});
