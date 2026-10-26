// Illustrative HTTP contract: /api/tickets returns Schema-shaped JSON; event endpoints return
// batches since a sequence cursor. Browser requests use same-origin cookies; server requests
// supply the authenticated token. Tokens never enter actor memory or dehydrated payloads.
import { Effect, Layer, Schema, Stream } from "effect";
import { TicketApi } from "../features/Tickets/ticket-api.js";
import {
  QueueUnavailable,
  TechnicianUpdate,
  TicketEvent,
  TicketLocked,
  TicketNotFound,
  TicketPage,
  TicketRow,
  TitleRejected,
  type TicketKey,
} from "../features/Tickets/types.js";

const eventBatch = Schema.Struct({ cursor: Schema.String, events: Schema.Array(TicketEvent) });

const progressBatch = Schema.Struct({
  cursor: Schema.String,
  events: Schema.Array(TechnicianUpdate),
});

export const HttpTicketApi = (token?: string, origin = "http://localhost:3000") => {
  const request = (path: string, signal?: AbortSignal, body?: object) =>
    Effect.tryPromise({
      try: (lifetime) => {
        const headers = new Headers();

        if (token !== undefined) headers.set("Authorization", `Bearer ${token}`);

        if (body !== undefined) headers.set("Content-Type", "application/json");

        return fetch(new URL(path, origin), {
          method: body === undefined ? "GET" : "POST",
          headers,
          credentials: "same-origin",
          cache: "no-store",
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: signal === undefined ? lifetime : AbortSignal.any([signal, lifetime]),
        });
      },
      catch: (cause) => new Error("Ticket HTTP transport failed", { cause }),
    });

  const json = (response: Response) =>
    Effect.tryPromise({
      try: () => response.json() as Promise<unknown>,
      catch: (cause) => new Error("Invalid ticket JSON", { cause }),
    }).pipe(Effect.orDie);

  const checked = (response: Response) =>
    response.ok
      ? json(response)
      : Effect.die(new Error(`Unexpected ticket HTTP status ${response.status}`));

  const ticketPath = (key: TicketKey) =>
    `/api/workspaces/${encodeURIComponent(key.workspaceId)}/tickets/${encodeURIComponent(key.ticketId)}`;

  return Layer.succeed(
    TicketApi,
    TicketApi.of({
      load: (key, signal) =>
        Effect.gen(function* () {
          const response = yield* request(ticketPath(key), signal).pipe(Effect.orDie);

          if (response.status === 404)
            return yield* Effect.fail(new TicketNotFound({ ticketId: key.ticketId }));

          return yield* Schema.decodeUnknownEffect(TicketRow)(yield* checked(response)).pipe(
            Effect.orDie,
          );
        }),
      list: (input, signal) =>
        Effect.gen(function* () {
          const query = new URLSearchParams();

          for (const [key, value] of Object.entries(input)) {
            // Optional filters may be explicitly undefined at runtime (queue listInput).
            // oxlint-disable-next-line typescript/no-unnecessary-condition -- Object.entries loses optional-value information.
            if (value !== undefined) query.set(key, String(value));
          }

          const response = yield* request(`/api/tickets?${query}`, signal).pipe(
            Effect.mapError(() => new QueueUnavailable({ retryAfter: 5 })),
          );

          if (response.status === 503)
            return yield* Effect.fail(new QueueUnavailable({ retryAfter: 5 }));

          return yield* Schema.decodeUnknownEffect(TicketPage)(yield* checked(response)).pipe(
            Effect.orDie,
          );
        }),
      openCount: ({ workspaceId }, signal) =>
        Effect.gen(function* () {
          const response = yield* request(
            `/api/workspaces/${encodeURIComponent(workspaceId)}/open-count`,
            signal,
          ).pipe(Effect.orDie);

          return yield* Schema.decodeUnknownEffect(Schema.Number)(yield* checked(response)).pipe(
            Effect.orDie,
          );
        }),
      saveTitle: (input, signal) =>
        Effect.gen(function* () {
          const response = yield* request(`${ticketPath(input)}/title`, signal, input).pipe(
            Effect.orDie,
          );

          if (response.status === 404)
            return yield* Effect.fail(new TicketNotFound({ ticketId: input.ticketId }));

          if (response.status === 409) {
            const detail = yield* Schema.decodeUnknownEffect(
              Schema.Struct({ lockedBy: Schema.String }),
            )(yield* json(response)).pipe(Effect.orDie);

            return yield* Effect.fail(new TicketLocked(detail));
          }

          if (response.status === 422) {
            const detail = yield* Schema.decodeUnknownEffect(
              Schema.Struct({ reason: Schema.String }),
            )(yield* json(response)).pipe(Effect.orDie);

            return yield* Effect.fail(new TitleRejected(detail));
          }

          return yield* Schema.decodeUnknownEffect(TicketRow)(yield* checked(response)).pipe(
            Effect.orDie,
          );
        }),
      assign: (input, signal) =>
        Effect.gen(function* () {
          const response = yield* request(`${ticketPath(input)}/assignee`, signal, input).pipe(
            Effect.orDie,
          );

          if (response.status === 404)
            return yield* Effect.fail(new TicketNotFound({ ticketId: input.ticketId }));

          return yield* Schema.decodeUnknownEffect(TicketRow)(yield* checked(response)).pipe(
            Effect.orDie,
          );
        }),
      // Cursor state belongs to each Stream subscription. Stream.unwrap allocates it when run;
      // Scope interruption cancels fetch and the polling delay. A new session starts at cursor 0.
      events: ({ workspaceId }) =>
        Stream.unwrap(
          Effect.sync(() => {
            let cursor = "0";

            return Stream.fromEffectRepeat(
              Effect.gen(function* () {
                const response = yield* request(
                  `/api/workspaces/${encodeURIComponent(workspaceId)}/events?cursor=${encodeURIComponent(cursor)}`,
                ).pipe(Effect.orDie);

                const batch = yield* Schema.decodeUnknownEffect(eventBatch)(
                  yield* checked(response),
                ).pipe(Effect.orDie);

                cursor = batch.cursor;

                return batch.events;
              }).pipe(Effect.delay("1 second")),
            ).pipe(Stream.flatMap(Stream.fromIterable));
          }),
        ),
      technicianUpdates: (key) =>
        Stream.unwrap(
          Effect.sync(() => {
            let cursor = "0";

            return Stream.fromEffectRepeat(
              Effect.gen(function* () {
                const response = yield* request(
                  `${ticketPath(key)}/progress?cursor=${encodeURIComponent(cursor)}`,
                ).pipe(Effect.orDie);

                const batch = yield* Schema.decodeUnknownEffect(progressBatch)(
                  yield* checked(response),
                ).pipe(Effect.orDie);

                cursor = batch.cursor;

                return batch.events;
              }).pipe(Effect.delay("1 second")),
            ).pipe(Stream.flatMap(Stream.fromIterable));
          }),
        ),
    }),
  );
};
