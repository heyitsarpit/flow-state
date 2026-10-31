// The ticket's details port: its short description fields, its long body, and its history. Effect-only: it names
// no Flow API. Like the roster's (features/Roster/roster-api.ts), the adapter is written on Effect's `HttpClient`, so
// Stories run it and replace only the transport (`Fake.fetch`, testing/desk.details.fake.ts).
//
// Where the data comes from:
//   - `PATCH …/fields/:field` saves one short field. Last write wins on the server, so the client sends at most the
//     newest value per field (`latest`, fields.contracts.ts).
//   - `PUT …/body` saves the body with `If-Match: <etag>`. A stale etag answers 412 with the server's body and etag,
//     because two people editing one paragraph must not silently overwrite each other.
//   - `GET …/history?before=` pages the ticket's history; `POST …/history/:entry/pin` pins a note to it.
import { Context, Effect, Layer, Schema } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import { NoResponse, ServerError, type TicketKey } from "../types.js";

export const FieldName = Schema.Literals(["summary", "locationNote", "accessCode"]);

export type FieldName = typeof FieldName.Type;

export const TicketDetails = Schema.Struct({
  workspaceId: Schema.String,
  ticketId: Schema.String,
  fields: Schema.Record(Schema.String, Schema.String), // FieldName → text
  body: Schema.String,
  etag: Schema.String,
});

export type TicketDetails = typeof TicketDetails.Type;

export const HistoryEntry = Schema.Struct({
  entryId: Schema.String,
  at: Schema.Number,
  text: Schema.String,
  pinned: Schema.Boolean,
});

export type HistoryEntry = typeof HistoryEntry.Type;

export const HistoryPage = Schema.Struct({
  entries: Schema.Array(HistoryEntry), // newest first
  older: Schema.optional(Schema.String),
});

export type HistoryPage = typeof HistoryPage.Type;

// 412 on a body save: someone saved first. Definite, and it carries what they saved.
export class BodyConflict extends Schema.TaggedError<BodyConflict>()("BodyConflict", {
  body: Schema.String,
  etag: Schema.String,
}) {}

// 422 on a field: too long, or a code that is not one.
export class FieldRejected extends Schema.TaggedError<FieldRejected>()("FieldRejected", {
  reason: Schema.String,
}) {}

type Read = { signal: AbortSignal };

type Write = { idempotencyKey: string; signal: AbortSignal };

type Lost = NoResponse | ServerError;

export class TicketDetailsApi extends Context.Service<
  TicketDetailsApi,
  {
    details: (key: TicketKey, options: Read) => Effect.Effect<TicketDetails, NoResponse>;
    saveField: (
      input: TicketKey & { field: FieldName; value: string },
      options: Write,
    ) => Effect.Effect<TicketDetails, FieldRejected | Lost>;
    saveBody: (
      input: TicketKey & { body: string; ifMatch: string },
      options: Write,
    ) => Effect.Effect<TicketDetails, BodyConflict | Lost>;
    history: (
      input: TicketKey & { before?: string },
      options: Read,
    ) => Effect.Effect<HistoryPage, NoResponse>;
    pinNote: (
      input: TicketKey & { entryId: string; pinned: boolean },
      options: Write,
    ) => Effect.Effect<HistoryEntry, Lost>;
  }
>()("DispatchDesk/TicketDetailsApi") {}

export const DetailsHttp = (origin: string) =>
  Layer.effect(
    TicketDetailsApi,
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;

      const path = (key: TicketKey) =>
        new URL(
          `/api/workspaces/${encodeURIComponent(key.workspaceId)}/tickets/${encodeURIComponent(key.ticketId)}`,
          origin,
        ).toString();

      // A transport failure is `NoResponse`, as `fetch` rejecting is everywhere in the desk.
      const send = (request: HttpClientRequest.HttpClientRequest) =>
        client.execute(request).pipe(Effect.mapError(() => new NoResponse()));

      const decode =
        <S extends Schema.Constraint>(schema: S) =>
        (response: HttpClientResponse.HttpClientResponse) =>
          HttpClientResponse.schemaBodyJson(schema)(response).pipe(Effect.orDie);

      const read = <S extends Schema.Constraint>(schema: S, url: string) =>
        send(HttpClientRequest.get(url)).pipe(
          Effect.flatMap((response) =>
            Effect.gen(function* () {
              if (response.status >= 500) return yield* new NoResponse();

              return yield* decode(schema)(response);
            }),
          ),
        );

      const write = (
        method: "PATCH" | "PUT" | "POST",
        url: string,
        body: object,
        key: string,
        headers = {},
      ) =>
        send(
          HttpClientRequest.make(method)(url).pipe(
            HttpClientRequest.setHeaders({ "Idempotency-Key": key, ...headers }),
            HttpClientRequest.bodyJsonUnsafe(body),
          ),
        );

      return TicketDetailsApi.of({
        details: (key) => read(TicketDetails, path(key)),
        saveField: ({ field, value, ...key }, { idempotencyKey }) =>
          write("PATCH", `${path(key)}/fields/${field}`, { value }, idempotencyKey).pipe(
            Effect.flatMap((response) =>
              Effect.gen(function* () {
                if (response.status === 200) return yield* decode(TicketDetails)(response);

                if (response.status === 422)
                  return yield* new FieldRejected(
                    yield* decode(Schema.Struct({ reason: Schema.String }))(response),
                  );

                return yield* new ServerError({ status: response.status });
              }),
            ),
          ),
        saveBody: ({ body, ifMatch, ...key }, { idempotencyKey }) =>
          write("PUT", `${path(key)}/body`, { body }, idempotencyKey, { "If-Match": ifMatch }).pipe(
            Effect.flatMap((response) =>
              Effect.gen(function* () {
                if (response.status === 200) return yield* decode(TicketDetails)(response);

                if (response.status === 412)
                  return yield* new BodyConflict(
                    yield* decode(Schema.Struct({ body: Schema.String, etag: Schema.String }))(
                      response,
                    ),
                  );

                return yield* new ServerError({ status: response.status });
              }),
            ),
          ),
        history: ({ before, ...key }) =>
          read(
            HistoryPage,
            `${path(key)}/history${before === undefined ? "" : `?before=${encodeURIComponent(before)}`}`,
          ),
        pinNote: ({ entryId, pinned, ...key }, { idempotencyKey }) =>
          write(
            "POST",
            `${path(key)}/history/${encodeURIComponent(entryId)}/pin`,
            { pinned },
            idempotencyKey,
          ).pipe(
            Effect.flatMap((response) =>
              Effect.gen(function* () {
                if (response.status === 200) return yield* decode(HistoryEntry)(response);

                return yield* new ServerError({ status: response.status });
              }),
            ),
          ),
      });
    }),
  );
