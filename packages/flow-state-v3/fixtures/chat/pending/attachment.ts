// @effect-diagnostics unstableApiUsage:off -- the setup's adapter runs over Effect's fetch client, as the app's real Layer would
import { Context, Effect, Exit, Layer, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import { Fake } from "../../../src/host/testing/index.ts";
import { layerIndexedDb } from "../../../src/host/persistence.ts";
import {
  actorRef,
  app,
  definition,
  Flow,
  machine,
  Outcome,
  runtimeSetup,
  transaction,
} from "../../../src/index.ts";
import { NoResponse } from "../services.ts";

/**
 * The uploads port: one chunk of an attachment, sent with the upload's id as its key.
 */
export class UploadsApi extends Context.Service<
  UploadsApi,
  {
    readonly chunk: (input: {
      readonly uploadId: string;
      readonly chunk: number;
      readonly of: number;
    }) => Effect.Effect<void, NoResponse>;
  }
>()("flow-state-v3/fixtures/chat/UploadsApi") {}

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

/**
 * The uploads port over its fake.
 */
export const UploadsFake = Layer.effect(
  UploadsApi,
  Effect.map(Uploads, (server) =>
    UploadsApi.of({ chunk: (input) => server.chunk(input).pipe(Effect.asVoid) }),
  ),
);

/**
 * The uploads port over HTTP: `PUT /uploads/:id/chunks/:n`.
 */
export const UploadsHttp = (origin: string) =>
  Layer.effect(
    UploadsApi,
    Effect.map(HttpClient.HttpClient, (http) => {
      const client = HttpClient.mapRequest(http, HttpClientRequest.prependUrl(origin));
      const lost = () => Effect.fail(new NoResponse());

      return UploadsApi.of({
        chunk: ({ uploadId, chunk, of }) =>
          HttpClientRequest.put(
            `/uploads/${encodeURIComponent(uploadId)}/chunks/${String(chunk)}`,
          ).pipe(
            HttpClientRequest.setHeader("Upload-Length", String(of)),
            client.execute,
            Effect.asVoid,
            Effect.catchTags({ HttpClientError: lost }),
          ),
      });
    }),
  );

/**
 * An attachment sent in chunks, keyed by its upload id, reporting the share sent after each chunk.
 */
export const upload = transaction({
  id: "Chat/upload",
  input: { uploadId: Schema.String, chunks: Schema.Number },
  key: ["uploadId"],
  concurrency: "reject",
  idempotency: ["uploadId"],
  progress: Schema.Number,
  services: [UploadsApi],
  commit: (input, context) =>
    Effect.forEach(
      Array.from({ length: input.chunks }, (_, n) => n),
      (n) =>
        UploadsApi.use((api) =>
          api.chunk({ uploadId: input.uploadId, chunk: n, of: input.chunks }),
        ).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              context.progress((n + 1) / input.chunks);
            }),
          ),
        ),
      { concurrency: 1 },
    ).pipe(Effect.catchTag("NoResponse", (e) => Outcome.unknown(e))),
});

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

/**
 * A photo attached to a message.
 */
export const photo = actorRef(AttachmentMachine, { uploadId: "up-1" });

/**
 * The chat app grown with attachments.
 */
export const attachmentSetup = runtimeSetup({
  app: app({ id: "chat", machines: { attachment: AttachmentMachine } }),
  services: Layer.merge(
    UploadsHttp("https://uploads.chat.example").pipe(Layer.provide(FetchHttpClient.layer)),
    layerIndexedDb(),
  ),
  scope: "chat",
  persistence: { captureMs: 0 },
});
