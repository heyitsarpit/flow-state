// The technician panel's port: each technician's device pulse (polled), nudges, breaks and dispatch. Effect-only;
// written on Effect's `HttpClient`, so Stories run it over `Fake.fetch` (testing/desk.technicians.fake.ts).
//
// Where the data comes from: the technicians' phones report a pulse (online, where, battery) to the server every
// few seconds; the desk asks for each shown technician's latest pulse with `GET …/technicians/:id/pulse`. A failed
// GET is `PollFailed`, a transient drop the polling recipe retries (technicians.contracts.ts). A nudge is a push
// notification to the phone (`POST …/nudge`), safe to repeat. Breaks are a small server table the panel reads.
import { Context, Effect, Layer, Schema } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import { AlreadyAssigned, NoResponse, ServerError, TicketNotFound, TicketRow } from "../types.js";

export const Pulse = Schema.Struct({
  online: Schema.Boolean,
  location: Schema.String,
  battery: Schema.Int,
  reportedAt: Schema.Number, // the phone's own clock: the quiet-feed recipe compares it with `useNow`
});

export type Pulse = typeof Pulse.Type;

// Who is on a break: `{ [technicianId]: true }`.
export const Breaks = Schema.Record(Schema.String, Schema.Boolean);

export type Breaks = typeof Breaks.Type;

export class PollFailed extends Schema.TaggedError<PollFailed>()("PollFailed", {
  status: Schema.Int,
}) {}

export class NudgeRefused extends Schema.TaggedError<NudgeRefused>()("NudgeRefused", {
  reason: Schema.String,
}) {}

type Technician = { workspaceId: string; technicianId: string };

type Write = { idempotencyKey: string; signal: AbortSignal };

type Lost = NoResponse | ServerError;

export class TechniciansApi extends Context.Service<
  TechniciansApi,
  {
    pulse: (key: Technician) => Effect.Effect<Pulse, PollFailed>;
    breaks: (input: { workspaceId: string }) => Effect.Effect<Breaks, NoResponse>;
    setBreak: (
      input: Technician & { onBreak: boolean },
      options: Write,
    ) => Effect.Effect<Breaks, Lost>;
    nudge: (
      input: Technician & { from: string; text: string },
      options: Write,
    ) => Effect.Effect<void, NudgeRefused | Lost>;
    // Dispatching a ticket to a technician: the ticket's assignee, and the technician's status on the server.
    dispatch: (
      input: { workspaceId: string; ticketId: string; technicianId: string },
      options: Write,
    ) => Effect.Effect<TicketRow, TicketNotFound | AlreadyAssigned | Lost>;
  }
>()("DispatchDesk/TechniciansApi") {}

export const TechniciansHttp = (origin: string) =>
  Layer.effect(
    TechniciansApi,
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      const ws = (workspaceId: string) =>
        new URL(`/api/workspaces/${encodeURIComponent(workspaceId)}`, origin).toString();
      const tech = (key: Technician) =>
        `${ws(key.workspaceId)}/technicians/${encodeURIComponent(key.technicianId)}`;

      const send = (request: HttpClientRequest.HttpClientRequest) =>
        client.execute(request).pipe(Effect.mapError(() => new NoResponse()));

      const decode =
        <S extends Schema.Constraint>(schema: S) =>
        (response: HttpClientResponse.HttpClientResponse) =>
          HttpClientResponse.schemaBodyJson(schema)(response).pipe(Effect.orDie);

      const post = (url: string, body: object, key: string) =>
        send(
          HttpClientRequest.post(url).pipe(
            HttpClientRequest.setHeader("Idempotency-Key", key),
            HttpClientRequest.bodyJsonUnsafe(body),
          ),
        );

      return TechniciansApi.of({
        pulse: (key) =>
          send(HttpClientRequest.get(`${tech(key)}/pulse`)).pipe(
            Effect.mapError(() => new PollFailed({ status: 0 })),
            Effect.flatMap((response) =>
              Effect.gen(function* () {
                if (response.status !== 200)
                  return yield* new PollFailed({ status: response.status });

                return yield* decode(Pulse)(response);
              }),
            ),
          ),
        breaks: ({ workspaceId }) =>
          send(HttpClientRequest.get(`${ws(workspaceId)}/breaks`)).pipe(
            Effect.flatMap((response) =>
              Effect.gen(function* () {
                if (response.status >= 500) return yield* new NoResponse();

                return yield* decode(Breaks)(response);
              }),
            ),
          ),
        setBreak: ({ onBreak, ...key }, { idempotencyKey }) =>
          post(`${tech(key)}/break`, { onBreak }, idempotencyKey).pipe(
            Effect.flatMap((response) =>
              Effect.gen(function* () {
                if (response.status === 200) return yield* decode(Breaks)(response);

                return yield* new ServerError({ status: response.status });
              }),
            ),
          ),
        nudge: ({ from, text, ...key }, { idempotencyKey }) =>
          post(`${tech(key)}/nudge`, { from, text }, idempotencyKey).pipe(
            Effect.flatMap((response) =>
              Effect.gen(function* () {
                if (response.status === 202) return;

                if (response.status === 409)
                  return yield* new NudgeRefused(
                    yield* decode(Schema.Struct({ reason: Schema.String }))(response),
                  );

                return yield* new ServerError({ status: response.status });
              }),
            ),
          ),
        dispatch: ({ technicianId, ...ticket }, { idempotencyKey }) =>
          post(
            `${ws(ticket.workspaceId)}/tickets/${encodeURIComponent(ticket.ticketId)}/dispatch`,
            { technicianId },
            idempotencyKey,
          ).pipe(
            Effect.flatMap((response) =>
              Effect.gen(function* () {
                if (response.status === 200) return yield* decode(TicketRow)(response);

                if (response.status === 404)
                  return yield* new TicketNotFound({ ticketId: ticket.ticketId });

                if (response.status === 409)
                  return yield* new AlreadyAssigned(
                    yield* decode(Schema.Struct({ assignee: Schema.String }))(response),
                  );

                return yield* new ServerError({ status: response.status });
              }),
            ),
          ),
      });
    }),
  );
