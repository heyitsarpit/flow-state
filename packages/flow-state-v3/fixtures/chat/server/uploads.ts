import { Exit, Schema } from "effect";
import { Fake } from "../../../src/host/testing/index.ts";
import { NoResponse } from "../services.ts";

const UploadsTruth = Schema.Struct({
  chunks: Schema.Record(Schema.String, Schema.Array(Schema.Number)),
});

type Truth = typeof UploadsTruth.Type;

/**
 * The uploads server's truth: the chunks each upload has received.
 */
export const Uploads = Fake.server("Uploads", {
  truth: UploadsTruth,
  initial: { chunks: {} },
  endpoints: {
    chunk: Fake.call({
      request: { uploadId: Schema.String, chunk: Schema.Number, of: Schema.Number },
      success: Schema.Struct({}),
      failure: Schema.Never,
      handle: (truth: Truth, { uploadId, chunk }) => ({
        truth: {
          chunks: { ...truth.chunks, [uploadId]: [...(truth.chunks[uploadId] ?? []), chunk] },
        },
        exit: Exit.succeed({}),
      }),
    }),
  },
  controls: {},
  lost: () => new NoResponse(),
});
