// Resolving a ticket on site: the van's parts, the customer's signature, and the resolution. Effect-only, on
// Effect's `HttpClient` (Stories run it over `Fake.fetch`).
//
// Where the data comes from:
//   - `GET …/parts/:number` looks a part up in the van stock catalogue;
//   - `POST …/tickets/:id/parts` reserves one on the van for this ticket; `POST …/parts:release` gives parts back;
//   - `PUT /api/signatures/:ref` uploads the signature image with upload progress (an XHR in the browser; here the
//     adapter streams the bytes and reports progress per chunk). The image itself stays in tab memory
//     (`PendingSignatures`) until then, as a dropped file's bytes do (P6).
//   - `POST …/tickets/:id/resolve` closes the ticket with its reason, parts and the signature's ref. A ref the
//     server never received is refused, 422 `SignatureMissing`.
import { Context, Effect, Layer, Schema } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import {
  NoResponse,
  ServerError,
  TicketNotFound,
  TicketRow,
  type TicketKey,
} from "../Tickets/types.js";

export const Part = Schema.Struct({
  partNumber: Schema.String,
  label: Schema.String,
  stock: Schema.Int,
  reserved: Schema.Int,
});

export type Part = typeof Part.Type;

export class PartUnknown extends Schema.TaggedError<PartUnknown>()("PartUnknown", {
  partNumber: Schema.String,
}) {}

export class OutOfStock extends Schema.TaggedError<OutOfStock>()("OutOfStock", {
  partNumber: Schema.String,
}) {}

export class SignatureMissing extends Schema.TaggedError<SignatureMissing>()("SignatureMissing", {
  signatureRef: Schema.String,
}) {}

type Write = { idempotencyKey: string; signal: AbortSignal };

type Lost = NoResponse | ServerError;

export class ResolveApi extends Context.Service<
  ResolveApi,
  {
    part: (
      input: { partNumber: string },
      options: { signal: AbortSignal },
    ) => Effect.Effect<Part, PartUnknown | NoResponse>;
    reserve: (
      input: TicketKey & { partNumber: string },
      options: Write,
    ) => Effect.Effect<Part, PartUnknown | OutOfStock | Lost>;
    release: (
      input: TicketKey & { partNumbers: ReadonlyArray<string> },
      options: Write,
    ) => Effect.Effect<void, Lost>;
    uploadSignature: (
      input: { ref: string; image: Blob },
      options: Write & { onProgress: (p: { sent: number; total: number }) => void },
    ) => Effect.Effect<void, Lost>;
    resolve: (
      input: TicketKey & { reason: string; parts: ReadonlyArray<string>; signatureRef: string },
      options: Write,
    ) => Effect.Effect<TicketRow, TicketNotFound | SignatureMissing | Lost>;
  }
>()("DispatchDesk/ResolveApi") {}

// The signature image a technician drew: tab memory, never persisted memory, as `PendingFiles` holds dropped bytes.
export class PendingSignatures extends Context.Service<
  PendingSignatures,
  {
    keep: (ref: string, image: Blob) => Effect.Effect<void>;
    take: (ref: string) => Effect.Effect<Blob, NoResponse>;
  }
>()("DispatchDesk/PendingSignatures") {}

export const PendingSignaturesLive = Layer.sync(PendingSignatures, () => {
  const images = new Map<string, Blob>();

  return PendingSignatures.of({
    keep: (ref, image) => Effect.sync(() => void images.set(ref, image)),
    take: (ref) => {
      const image = images.get(ref);

      return image ? Effect.succeed(image) : Effect.fail(new NoResponse()); // gone after a reload: nothing to send
    },
  });
});

export const ResolveHttp = (origin: string) =>
  Layer.effect(
    ResolveApi,
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      const url = (path: string) => new URL(path, origin).toString();
      const ticketPath = (key: TicketKey) =>
        `/api/workspaces/${encodeURIComponent(key.workspaceId)}/tickets/${encodeURIComponent(key.ticketId)}`;

      const send = (request: HttpClientRequest.HttpClientRequest) =>
        client.execute(request).pipe(Effect.mapError(() => new NoResponse()));

      const decode =
        <S extends Schema.Constraint>(schema: S) =>
        (response: HttpClientResponse.HttpClientResponse) =>
          HttpClientResponse.schemaBodyJson(schema)(response).pipe(Effect.orDie);

      const post = (path: string, body: object, key: string) =>
        send(
          HttpClientRequest.post(url(path)).pipe(
            HttpClientRequest.setHeader("Idempotency-Key", key),
            HttpClientRequest.bodyJsonUnsafe(body),
          ),
        );

      return ResolveApi.of({
        part: ({ partNumber }) =>
          send(HttpClientRequest.get(url(`/api/parts/${encodeURIComponent(partNumber)}`))).pipe(
            Effect.flatMap((response) =>
              Effect.gen(function* () {
                if (response.status === 404) return yield* new PartUnknown({ partNumber });

                if (response.status !== 200) return yield* new NoResponse();

                return yield* decode(Part)(response);
              }),
            ),
          ),
        reserve: ({ partNumber, ...key }, { idempotencyKey }) =>
          post(`${ticketPath(key)}/parts`, { partNumber }, idempotencyKey).pipe(
            Effect.flatMap((response) =>
              Effect.gen(function* () {
                if (response.status === 200) return yield* decode(Part)(response);

                if (response.status === 404) return yield* new PartUnknown({ partNumber });

                if (response.status === 409) return yield* new OutOfStock({ partNumber });

                return yield* new ServerError({ status: response.status });
              }),
            ),
          ),
        release: ({ partNumbers, ...key }, { idempotencyKey }) =>
          post(`${ticketPath(key)}/parts:release`, { partNumbers }, idempotencyKey).pipe(
            Effect.flatMap((response) =>
              response.status === 204
                ? Effect.void
                : Effect.fail(new ServerError({ status: response.status })),
            ),
          ),
        // A real browser uses XHR for upload progress (as next/http-api.ts does); this adapter reports it per chunk
        // of the body it sends, which is what a `fetch` with a streamed request body can say.
        uploadSignature: ({ ref, image }, { idempotencyKey, onProgress }) =>
          Effect.sync(() => onProgress({ sent: 0, total: image.size })).pipe(
            Effect.andThen(
              send(
                HttpClientRequest.put(url(`/api/signatures/${encodeURIComponent(ref)}`)).pipe(
                  HttpClientRequest.setHeader("Idempotency-Key", idempotencyKey),
                  HttpClientRequest.bodyUint8Array(new Uint8Array(image.size), "image/png"),
                ),
              ),
            ),
            Effect.tap(() =>
              Effect.sync(() => onProgress({ sent: image.size, total: image.size })),
            ),
            Effect.flatMap((response) =>
              response.status === 201
                ? Effect.void
                : Effect.fail(new ServerError({ status: response.status })),
            ),
          ),
        resolve: ({ reason, parts, signatureRef, ...key }, { idempotencyKey }) =>
          post(`${ticketPath(key)}/resolve`, { reason, parts, signatureRef }, idempotencyKey).pipe(
            Effect.flatMap((response) =>
              Effect.gen(function* () {
                if (response.status === 200) return yield* decode(TicketRow)(response);

                if (response.status === 404)
                  return yield* new TicketNotFound({ ticketId: key.ticketId });

                if (response.status === 422) return yield* new SignatureMissing({ signatureRef });

                return yield* new ServerError({ status: response.status });
              }),
            ),
          ),
      });
    }),
  );
