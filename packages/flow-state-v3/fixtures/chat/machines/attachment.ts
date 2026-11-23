import { Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";
import { upload } from "../operations/writes.ts";

/**
 * One attachment of a message, named by its upload id.
 */
export const Attachment = definition({
  id: "Chat/Attachment",
  states: ["PICKED", "UPLOADING", "ATTACHED"],
  events: { Upload: { chunks: Schema.Number }, Stop: {} },
  internalEvents: { Uploaded: {}, Unsure: Flow.uncertain({}) },
  memory: { uploadId: Flow.input(Schema.String), notice: Flow.initial(Schema.String, "") },
  operations: ({ E }) => ({
    upload: upload.outcomes({ success: E.Uploaded, failure: {}, unknown: E.Unsure }),
  }),
});

/**
 * Uploading sends the attachment in chunks; stopping interrupts the chunk on the wire.
 */
export const AttachmentMachine = machine(Attachment, ({ S, O }) => ({
  default: S.PICKED,
  states: {
    PICKED: {
      on: {
        Upload: {
          target: S.UPLOADING,
          actions: [
            O.upload.commit(({ memory, event }) => ({
              uploadId: memory.uploadId,
              chunks: event.chunks,
            })),
          ],
        },
      },
    },
    UPLOADING: {
      on: {
        Stop: { actions: [O.upload.cancel(({ memory }) => ({ uploadId: memory.uploadId }))] },
        Uploaded: { target: S.ATTACHED },
        Unsure: { target: S.PICKED, updateMemory: () => ({ notice: "upload stopped" }) },
      },
    },
    ATTACHED: {},
  },
}));
