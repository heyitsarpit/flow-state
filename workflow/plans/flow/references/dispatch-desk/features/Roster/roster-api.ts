// The roster port: technicians, teams and customers of one workspace, for an admin. Effect-only: it names no
// Flow API, so it type-checks with Effect alone.
//
// Where the data comes from. Unlike the other desk ports (next/http-api.ts wraps `fetch` by hand), this adapter
// is written on Effect's `HttpClient`. In production `FetchHttpClient.layer` provides it over the browser's
// `fetch`; in Stories the same adapter runs and only the transport is replaced, by `Fake.fetch(Desk, route)`,
// which provides `FetchHttpClient.Fetch` (MD 2.10.4 "transport bindings"; Y6). So the status classification
// below is what every Story exercises, as it is in production.
//
// Two more real APIs enter here:
//   - invitations are batched below the commit with `RequestResolver` (MD 2.7.11): each invite is its own
//     commit with its own Attempt, and the resolver sends one `POST /invites:batch` and completes each entry from
//     the per-item statuses the server returns;
//   - `changes(after)` is one GET of the roster's change log after a cursor, which the polling recipe loops
//     (pending merge 6, M6 4.7 "Polling with a cursor": roster.contracts.ts).
import { Context, Effect, Exit, Layer, Request, RequestResolver, Schema } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import { NoResponse, ServerError, type TicketKey } from "../Tickets/types.js";

export const TechnicianStatus = Schema.Literals(["free", "busy", "break", "off"]);

export type TechnicianStatus = typeof TechnicianStatus.Type;

export const TechnicianRow = Schema.Struct({
  workspaceId: Schema.String,
  technicianId: Schema.String,
  name: Schema.String,
  teamId: Schema.NullOr(Schema.String), // names a `Team`; null while unplaced
  skills: Schema.Array(Schema.String),
  status: TechnicianStatus,
  lastSeenAt: Schema.Number, // churns every minute; no list reads it (roster.domain.ts)
  revision: Schema.Number,
});

export type TechnicianRow = typeof TechnicianRow.Type;

export type TechnicianKey = { workspaceId: string; technicianId: string };

export const TeamRow = Schema.Struct({
  workspaceId: Schema.String,
  teamId: Schema.String,
  name: Schema.String,
  technicianCount: Schema.Int, // the server counts; a move predicts both teams' counts
  revision: Schema.Number,
});

export type TeamRow = typeof TeamRow.Type;

export const CustomerRow = Schema.Struct({
  workspaceId: Schema.String,
  customerId: Schema.String,
  name: Schema.String,
  ticketCount: Schema.Int,
  revision: Schema.Number,
});

export type CustomerRow = typeof CustomerRow.Type;

export const RosterPage = Schema.Struct({
  technicians: Schema.Array(TechnicianRow),
  nextPage: Schema.optional(Schema.Int),
});

export type RosterPage = typeof RosterPage.Type;

// Technicians per team, computed by the server: `{ [teamId]: count }` (a derived read, E15).
export const TeamSizes = Schema.Record(Schema.String, Schema.Int);

// The roster's change log. `seq` is dense per workspace; the log is the source of the polling feed.
export const RosterChange = Schema.Union([
  Schema.TaggedStruct("TechnicianSaved", { seq: Schema.Int, technician: TechnicianRow }),
  Schema.TaggedStruct("TechnicianRemoved", {
    seq: Schema.Int,
    workspaceId: Schema.String,
    technicianId: Schema.String,
    revision: Schema.Number,
  }),
]);

export type RosterChange = typeof RosterChange.Type;

// One poll: the changes after `after`, and the cursor to ask from next (the last seq, or `after` when empty).
export const ChangeBatch = Schema.Struct({
  changes: Schema.Array(RosterChange),
  cursor: Schema.Int,
});

export type ChangeBatch = typeof ChangeBatch.Type;

// --- errors: definite 4xx the server meant -----------------------------------------------------------

// 409: a technician who still holds open tickets cannot be removed. The record comes back (E3).
export class HasOpenTickets extends Schema.TaggedError<HasOpenTickets>()("HasOpenTickets", {
  open: Schema.Int,
}) {}

// 409: one of the two customers changed or was merged already. Nothing was merged.
export class MergeConflict extends Schema.TaggedError<MergeConflict>()("MergeConflict", {
  reason: Schema.String,
}) {}

// 422: an invite the server refuses (an address already on the roster, a malformed one).
export class InviteRejected extends Schema.TaggedError<InviteRejected>()("InviteRejected", {
  reason: Schema.String,
}) {}

// 404 on a roster write: the technician is gone.
export class TechnicianGone extends Schema.TaggedError<TechnicianGone>()("TechnicianGone", {
  technicianId: Schema.String,
}) {}

// A failed poll. Transient by definition: the polling recipe retries it (M6 4.7).
export class PollFailed extends Schema.TaggedError<PollFailed>()("PollFailed", {}) {}

type Read = { signal: AbortSignal };

type Write = { idempotencyKey: string; signal: AbortSignal };

type Lost = NoResponse | ServerError;

export type Invite = { workspaceId: string; draftId: string; name: string; email: string };

export class RosterApi extends Context.Service<
  RosterApi,
  {
    technicians: (
      input: { workspaceId: string; teamId: string; locale: string; page?: number },
      options: Read,
    ) => Effect.Effect<RosterPage, NoResponse>;
    technician: (
      key: TechnicianKey,
      options: Read,
    ) => Effect.Effect<TechnicianRow, TechnicianGone | NoResponse>;
    teams: (
      input: { workspaceId: string },
      options: Read,
    ) => Effect.Effect<ReadonlyArray<TeamRow>, NoResponse>;
    teamSizes: (
      input: { workspaceId: string },
      options: Read,
    ) => Effect.Effect<typeof TeamSizes.Type, NoResponse>;
    customers: (
      input: { workspaceId: string },
      options: Read,
    ) => Effect.Effect<ReadonlyArray<CustomerRow>, NoResponse>;
    changes: (
      input: { workspaceId: string; after: number },
      options: Read,
    ) => Effect.Effect<ChangeBatch, PollFailed>;
    move: (
      input: TechnicianKey & { from: string; to: string },
      options: Write,
    ) => Effect.Effect<TechnicianRow, TechnicianGone | Lost>;
    rename: (
      input: TechnicianKey & { name: string },
      options: Write,
    ) => Effect.Effect<TechnicianRow, TechnicianGone | Lost>;
    setSkills: (
      input: TechnicianKey & { skills: ReadonlyArray<string> },
      options: Write,
    ) => Effect.Effect<TechnicianRow, TechnicianGone | Lost>;
    remove: (
      input: TechnicianKey,
      options: Write,
    ) => Effect.Effect<void, HasOpenTickets | TechnicianGone | Lost>;
    merge: (
      input: {
        workspaceId: string;
        survivorId: string;
        mergedId: string;
        tickets: ReadonlyArray<TicketKey>;
      },
      options: Write,
    ) => Effect.Effect<CustomerRow, MergeConflict | Lost>;
    invite: (input: Invite, options: Write) => Effect.Effect<TechnicianRow, InviteRejected | Lost>;
    // Fire and forget per Attempt: many at once, each answered on its own (`allow`, roster.contracts.ts).
    sendInviteEmail: (
      input: TechnicianKey,
      options: Write,
    ) => Effect.Effect<void, TechnicianGone | Lost>;
    rebuildIndex: (input: { workspaceId: string }, options: Write) => Effect.Effect<void, Lost>;
  }
>()("DispatchDesk/RosterApi") {}

// --- the HTTP adapter ---------------------------------------------------------------------------------

// One invite as a batched request. Each carries its own idempotency key: the server dedupes item by item.
class InviteRequest extends Request.TaggedClass("Invite")<
  { readonly invite: Invite; readonly idempotencyKey: string },
  TechnicianRow,
  InviteRejected | NoResponse | ServerError
> {}

const BatchItem = Schema.Union([
  Schema.Struct({ status: Schema.Literal(201), technician: TechnicianRow }),
  Schema.Struct({ status: Schema.Literal(422), reason: Schema.String }),
  Schema.Struct({ status: Schema.Literal(503) }),
]);

export const RosterHttp = (origin: string) =>
  Layer.effect(
    RosterApi,
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;

      // A transport failure (no answer at all) is `NoResponse`, as `fetch` rejecting is everywhere in the desk.
      const send = (request: HttpClientRequest.HttpClientRequest, signal: AbortSignal) =>
        client.execute(request).pipe(
          Effect.mapError(() => new NoResponse()),
          Effect.interruptible,
          Effect.raceFirst(abortOf(signal)),
        );

      const url = (path: string) => new URL(path, origin).toString();

      const read = <S extends Schema.Constraint>(schema: S, path: string, signal: AbortSignal) =>
        send(HttpClientRequest.get(url(path)), signal).pipe(
          Effect.flatMap((response) =>
            response.status >= 500
              ? Effect.fail(new NoResponse()) // a read with no usable answer, as in next/http-api.ts
              : HttpClientResponse.schemaBodyJson(schema)(response).pipe(Effect.orDie),
          ),
        );

      const write = (
        method: "POST" | "PATCH" | "DELETE",
        path: string,
        body: object,
        key: string,
        signal: AbortSignal,
      ) =>
        send(
          HttpClientRequest.make(method)(url(path)).pipe(
            HttpClientRequest.setHeader("Idempotency-Key", key),
            HttpClientRequest.bodyJsonUnsafe(body),
          ),
          signal,
        );

      const ok =
        <S extends Schema.Constraint>(schema: S) =>
        (response: HttpClientResponse.HttpClientResponse) =>
          HttpClientResponse.schemaBodyJson(schema)(response).pipe(Effect.orDie);

      const serverError = (response: HttpClientResponse.HttpClientResponse) =>
        Effect.fail(new ServerError({ status: response.status }));

      const unexpected = (response: HttpClientResponse.HttpClientResponse) =>
        Effect.die(new Error(`Unexpected roster status ${String(response.status)}`));

      const techPath = (key: TechnicianKey) =>
        `/api/workspaces/${encodeURIComponent(key.workspaceId)}/technicians/${encodeURIComponent(key.technicianId)}`;

      const gone = (key: TechnicianKey) =>
        Effect.fail(new TechnicianGone({ technicianId: key.technicianId }));

      // A technician write's answer: the row, 404 gone, 5xx unknown (the commit says so).
      const technicianAnswer =
        (key: TechnicianKey) => (response: HttpClientResponse.HttpClientResponse) =>
          Effect.gen(function* () {
            if (response.status === 200) return yield* ok(TechnicianRow)(response);

            if (response.status === 404) return yield* gone(key);

            if (response.status >= 500) return yield* serverError(response);

            return yield* unexpected(response);
          });

      // One HTTP request for every invite committed in the same turn. Each entry completes from its own item.
      const invites = RequestResolver.make<InviteRequest>((entries) =>
        Effect.gen(function* () {
          const workspaceId = entries[0].request.invite.workspaceId;
          const response = yield* send(
            HttpClientRequest.post(
              url(`/api/workspaces/${encodeURIComponent(workspaceId)}/invites:batch`),
            ).pipe(
              HttpClientRequest.bodyJsonUnsafe(
                entries.map(({ request }) => ({
                  ...request.invite,
                  idempotencyKey: request.idempotencyKey,
                })),
              ),
            ),
            new AbortController().signal,
          ).pipe(Effect.catch((error) => Effect.succeed(error)));

          if (response instanceof NoResponse || response.status >= 500) {
            // No per-item answer: every entry may or may not have been created.
            const failure =
              response instanceof NoResponse
                ? response
                : new ServerError({ status: response.status });

            for (const entry of entries) entry.completeUnsafe(Exit.fail(failure));

            return;
          }

          const items = yield* HttpClientResponse.schemaBodyJson(Schema.Array(BatchItem))(
            response,
          ).pipe(Effect.orDie);

          entries.forEach((entry, index) => {
            const item = items[index];

            if (item === undefined || item.status === 503)
              return entry.completeUnsafe(Exit.fail(new ServerError({ status: 503 })));

            if (item.status === 422)
              return entry.completeUnsafe(Exit.fail(new InviteRejected({ reason: item.reason })));

            return entry.completeUnsafe(Exit.succeed(item.technician));
          });
        }),
      ).pipe(RequestResolver.setDelay("10 millis")); // gather one turn's commits into one request

      return RosterApi.of({
        technicians: ({ workspaceId, teamId, locale, page }, { signal }) =>
          read(
            RosterPage,
            `/api/workspaces/${encodeURIComponent(workspaceId)}/technicians?team=${encodeURIComponent(teamId)}&locale=${encodeURIComponent(locale)}&page=${String(page ?? 0)}`,
            signal,
          ),
        technician: (key, { signal }) =>
          send(HttpClientRequest.get(url(techPath(key))), signal).pipe(
            Effect.flatMap((response) =>
              Effect.gen(function* () {
                if (response.status === 404) return yield* gone(key);

                if (response.status >= 500) return yield* new NoResponse();

                return yield* ok(TechnicianRow)(response);
              }),
            ),
          ),
        teams: ({ workspaceId }, { signal }) =>
          read(
            Schema.Array(TeamRow),
            `/api/workspaces/${encodeURIComponent(workspaceId)}/teams`,
            signal,
          ),
        teamSizes: ({ workspaceId }, { signal }) =>
          read(TeamSizes, `/api/workspaces/${encodeURIComponent(workspaceId)}/team-sizes`, signal),
        customers: ({ workspaceId }, { signal }) =>
          read(
            Schema.Array(CustomerRow),
            `/api/workspaces/${encodeURIComponent(workspaceId)}/customers`,
            signal,
          ),
        // A failed poll, whatever the cause, is `PollFailed`: transient, retried by the recipe (M6 4.7).
        changes: ({ workspaceId, after }, { signal }) =>
          read(
            ChangeBatch,
            `/api/workspaces/${encodeURIComponent(workspaceId)}/roster/changes?after=${String(after)}`,
            signal,
          ).pipe(Effect.mapError(() => new PollFailed())),
        move: ({ from, to, ...key }, { idempotencyKey, signal }) =>
          write("PATCH", techPath(key), { from, to }, idempotencyKey, signal).pipe(
            Effect.flatMap(technicianAnswer(key)),
          ),
        rename: ({ name, ...key }, { idempotencyKey, signal }) =>
          write("PATCH", techPath(key), { name }, idempotencyKey, signal).pipe(
            Effect.flatMap(technicianAnswer(key)),
          ),
        setSkills: ({ skills, ...key }, { idempotencyKey, signal }) =>
          write("PATCH", techPath(key), { skills }, idempotencyKey, signal).pipe(
            Effect.flatMap(technicianAnswer(key)),
          ),
        remove: (key, { idempotencyKey, signal }) =>
          write("DELETE", techPath(key), {}, idempotencyKey, signal).pipe(
            Effect.flatMap((response) =>
              Effect.gen(function* () {
                if (response.status === 204) return;

                if (response.status === 409)
                  return yield* new HasOpenTickets(
                    yield* ok(Schema.Struct({ open: Schema.Int }))(response),
                  );

                if (response.status === 404) return yield* gone(key);

                if (response.status >= 500) return yield* serverError(response);

                return yield* unexpected(response);
              }),
            ),
          ),
        merge: ({ workspaceId, ...body }, { idempotencyKey, signal }) =>
          write(
            "POST",
            `/api/workspaces/${encodeURIComponent(workspaceId)}/customers:merge`,
            body,
            idempotencyKey,
            signal,
          ).pipe(
            Effect.flatMap((response) =>
              Effect.gen(function* () {
                if (response.status === 200) return yield* ok(CustomerRow)(response);

                if (response.status === 409)
                  return yield* new MergeConflict(
                    yield* ok(Schema.Struct({ reason: Schema.String }))(response),
                  );

                if (response.status >= 500) return yield* serverError(response);

                return yield* unexpected(response);
              }),
            ),
          ),
        invite: (invite, { idempotencyKey }) =>
          Effect.request(new InviteRequest({ invite, idempotencyKey }), invites),
        sendInviteEmail: (key, { idempotencyKey, signal }) =>
          write("POST", `${techPath(key)}/invite-email`, {}, idempotencyKey, signal).pipe(
            Effect.flatMap((response) =>
              Effect.gen(function* () {
                if (response.status === 202) return;

                if (response.status === 404) return yield* gone(key);

                if (response.status >= 500) return yield* serverError(response);

                return yield* unexpected(response);
              }),
            ),
          ),
        rebuildIndex: ({ workspaceId }, { idempotencyKey, signal }) =>
          write(
            "POST",
            `/api/workspaces/${encodeURIComponent(workspaceId)}/roster:reindex`,
            {},
            idempotencyKey,
            signal,
          ).pipe(
            Effect.flatMap((response) =>
              response.status >= 500 ? serverError(response) : Effect.void,
            ),
          ),
      });
    }),
  );

// The lifetime signal of a call, as an Effect that fails when it aborts. `HttpClient` interrupts its own
// request when the fiber is interrupted; this joins the caller's signal to that.
const abortOf = (signal: AbortSignal) =>
  Effect.callback<never, NoResponse>((resume) => {
    const onAbort = () => resume(Effect.fail(new NoResponse()));

    if (signal.aborted) return onAbort();

    signal.addEventListener("abort", onAbort, { once: true });

    return Effect.sync(() => signal.removeEventListener("abort", onAbort));
  });
