// The replaceable service port, over `fetch`. Each call returns an Effect with exact success and
// failure channels: `NoResponse` when `fetch` rejects (reads and writes alike: a lost read is a network
// fact, not a defect), `ServerError` for a 5xx write, and the tagged 4xx failures the contract knows. The commit classifies them (machine-design 2.7.2); this port
// never decides what is definite and what is unknown. Live feeds are not here: they moved to
// feed/desk-socket.ts.
import { Context, type Effect } from "effect";
import { Effect as E, Exit, Request, RequestResolver } from "effect";
import type {
  AssignResult,
  ClosePage,
  ActivityPage,
  AlreadyAssigned,
  ArchiveRefused,
  NewTicket,
  TicketRejected,
  Cursor,
  NoResponse,
  QueueUnavailable,
  ServerError,
  TicketKey,
  TicketListInput,
  TicketLocked,
  TicketNotFound,
  TicketPage,
  TicketRow,
  TitleRejected,
} from "./types.js";

// Reads take the lifetime `signal` the lookup was handed.
type Read = { signal: AbortSignal };

// Writes also carry Flow's `attempt.id`, which the author puts on the wire as the idempotency key
// (rule 19); the server dedupes on it.
type Write = { idempotencyKey: string; signal: AbortSignal };

export class TicketApi extends Context.Service<
  TicketApi,
  {
    load: (key: TicketKey, options: Read) => Effect.Effect<TicketRow, TicketNotFound | NoResponse>;
    list: (
      input: TicketListInput,
      options: Read,
    ) => Effect.Effect<TicketPage, QueueUnavailable | NoResponse>;
    openCount: (input: { workspaceId: string }, options: Read) => Effect.Effect<number, NoResponse>;
    saveTitle: (
      input: TicketKey & { title: string },
      options: Write,
    ) => Effect.Effect<
      TicketRow,
      TicketNotFound | TicketLocked | TitleRejected | NoResponse | ServerError
    >;
    assign: (
      input: TicketKey & { assignee: string },
      options: Write,
    ) => Effect.Effect<TicketRow, TicketNotFound | AlreadyAssigned | NoResponse | ServerError>;
    // The queue's other two lists (ticket.domain.ts): tickets nobody holds, and the triage view, whose
    // condition reads the caller's clock (`now`, rounded to the minute by the queue: OD4, normalised in the caller).
    unassigned: (
      input: { workspaceId: string; page?: number },
      options: Read,
    ) => Effect.Effect<TicketPage, NoResponse>;
    triage: (
      input: { workspaceId: string; now: number },
      options: Read,
    ) => Effect.Effect<TicketPage, NoResponse>;
    // Every ticket of one customer: what a customer merge re-points (features/Roster).
    byCustomer: (
      input: { workspaceId: string; customerId: string },
      options: Read,
    ) => Effect.Effect<ReadonlyArray<TicketRow>, NoResponse>;
    create: (
      input: NewTicket,
      options: Write,
    ) => Effect.Effect<TicketRow, TicketRejected | NoResponse | ServerError>;
    // One ticket's assignee (or none). Each call is its own commit and Attempt; the adapter batches the calls of
    // one moment into one request below the commit (`assignResolver`).
    setAssignee: (
      input: TicketKey & { assignee: string | null },
      options: Write,
    ) => Effect.Effect<TicketRow, TicketNotFound | AlreadyAssigned | NoResponse | ServerError>;
    closeMany: (
      input: { workspaceId: string; tickets: ReadonlyArray<TicketKey> },
      options: Write,
    ) => Effect.Effect<ClosePage, NoResponse | ServerError>;
    archive: (
      input: TicketKey,
      options: Write,
    ) => Effect.Effect<void, TicketNotFound | ArchiveRefused | NoResponse | ServerError>;
    // One page of the workspace's activity after a position: the catch-up behind the socket's
    // `activity` frames (pending merge 6: feed.contracts.ts pages it from `catchUp`).
    eventsSince: (
      input: { workspaceId: string; after: Cursor },
      options: Read,
    ) => Effect.Effect<ActivityPage, NoResponse>;
  }
>()("DispatchDesk/TicketApi") {}

// Per-item results of a batch (MD 2.7.11). Each `setAssignee` is one commit with its own Attempt and lane; the
// resolver waits a moment, sends every assignment that arrived in one request, and completes each entry from its own
// item: one 409 among ten fails that one commit only. A lost request fails every entry with `NoResponse` (each
// Attempt is then unknown on its own), a 5xx with `ServerError`. Shared by the HTTP adapter and the Story fake.
class AssignRequest extends Request.TaggedClass("Assign")<
  { readonly input: TicketKey & { assignee: string | null }; readonly idempotencyKey: string },
  TicketRow,
  TicketNotFound | AlreadyAssigned | NoResponse | ServerError
> {}

export const assignResolver = (
  sendBatch: (
    items: ReadonlyArray<{
      input: TicketKey & { assignee: string | null };
      idempotencyKey: string;
    }>,
  ) => Effect.Effect<ReadonlyArray<AssignResult>, NoResponse | ServerError>,
  errors: {
    gone: (ticketId: string) => TicketNotFound;
    held: (assignee: string) => AlreadyAssigned;
  },
) => {
  const resolver = RequestResolver.make<AssignRequest>((entries) =>
    sendBatch(
      entries.map(({ request }) => ({
        input: request.input,
        idempotencyKey: request.idempotencyKey,
      })),
    ).pipe(
      E.matchEffect({
        onFailure: (error) =>
          E.sync(() => entries.forEach((entry) => entry.completeUnsafe(Exit.fail(error)))),
        onSuccess: (items) =>
          E.sync(() =>
            entries.forEach((entry, index) => {
              const item = items[index];

              if (item === undefined)
                return entry.completeUnsafe(Exit.fail(errors.gone(entry.request.input.ticketId)));

              if (item.status === 404)
                return entry.completeUnsafe(Exit.fail(errors.gone(item.ticketId)));

              if (item.status === 409)
                return entry.completeUnsafe(Exit.fail(errors.held(item.assignee)));

              return entry.completeUnsafe(Exit.succeed(item.ticket));
            }),
          ),
      }),
    ),
  ).pipe(RequestResolver.setDelay("10 millis"));

  return (input: TicketKey & { assignee: string | null }, idempotencyKey: string) =>
    E.request(new AssignRequest({ input, idempotencyKey }), resolver);
};
