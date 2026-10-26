// The in-memory server. It is also the entity property test's oracle (testing/), so it filters,
// orders, pages and deduplicates exactly as the real server does; the domain's declarations are
// checked against it, never the other way round (entity-domain.md section 8.3).
import { Context, Effect, Layer, PubSub, Stream } from "effect";
import { TicketApi } from "../features/Tickets/ticket-api.js";
import {
  TicketNotFound,
  TitleRejected,
  type TicketEvent,
  type TicketKey,
  type TicketRow,
} from "../features/Tickets/types.js";

const PAGE = 20;

// Code-point order, never localeCompare: the declared asc(ticketId) is the same on every host.
const byCodePoint = (a: string, b: string) => {
  if (a < b) return -1;

  if (a > b) return 1;

  return 0;
};

// The order ticket.domain.ts declares: updatedAt descending, then the key.
const declaredOrder = (a: TicketRow, b: TicketRow) =>
  b.updatedAt - a.updatedAt ||
  byCodePoint(a.workspaceId, b.workspaceId) ||
  byCodePoint(a.ticketId, b.ticketId);

// Two named tickets the Stories use, plus enough filler that the queue has three pages.
const seed = (): TicketRow[] => [
  {
    workspaceId: "north",
    ticketId: "T-42",
    title: "Replace lobby light",
    status: "assigned",
    assignee: "dispatcher-7",
    updatedAt: 1,
    revision: 1,
  },
  {
    workspaceId: "north",
    ticketId: "T-43",
    title: "Fix loading dock door",
    status: "open",
    assignee: null,
    updatedAt: 1,
    revision: 1,
  },
  ...Array.from({ length: 43 }, (_, index): TicketRow => ({
    workspaceId: "north",
    ticketId: `T-${String(100 + index)}`,
    title: `Routine inspection ${index + 1}`,
    status: index % 3 === 0 ? "closed" : "open",
    assignee: null,
    updatedAt: 0,
    revision: 1,
  })),
];

// The server itself, so fixtures can change it the way another dispatcher would: through the
// same state the API reads, followed by the push the real server sends.
export class DemoServer extends Context.Service<
  DemoServer,
  {
    api: typeof TicketApi.Service;
    externalSave: (
      key: TicketKey,
      change: Partial<Pick<TicketRow, "title" | "status" | "assignee">>,
    ) => Effect.Effect<TicketRow, TicketNotFound>;
    externalRemove: (key: TicketKey) => Effect.Effect<void, TicketNotFound>;
  }
>()("DispatchDesk/DemoServer") {}

// Each Layer build gets fresh state, so Story runs and Runtimes never share tickets.
const DemoServerLive = Layer.effect(
  DemoServer,
  Effect.gen(function* () {
    const pushes = yield* PubSub.unbounded<TicketEvent>();
    let clock = 1;
    let tickets = seed();
    const settled = new Map<string, TicketRow>(); // idempotency key → the result first returned

    const find = (key: TicketKey) =>
      tickets.find(
        (ticket) => ticket.workspaceId === key.workspaceId && ticket.ticketId === key.ticketId,
      );

    const update = (ticket: TicketRow, change: Partial<TicketRow>) => {
      const next = { ...ticket, ...change, updatedAt: ++clock, revision: ticket.revision + 1 };
      tickets = tickets.map((current) => (current === ticket ? next : current));

      return { ...next };
    };

    // A repeated idempotency key returns the first result and changes nothing.
    const once = <E>(idempotencyKey: string, apply: () => Effect.Effect<TicketRow, E>) =>
      Effect.suspend(() => {
        const previous = settled.get(idempotencyKey);

        if (previous) return Effect.succeed({ ...previous });

        return apply().pipe(
          Effect.tap((row) => Effect.sync(() => settled.set(idempotencyKey, row))),
        );
      });

    const api = TicketApi.of({
      load: (key) =>
        Effect.suspend(() => {
          const ticket = find(key);

          return ticket
            ? Effect.succeed({ ...ticket })
            : Effect.fail(new TicketNotFound({ ticketId: key.ticketId }));
        }),
      list: ({ workspaceId, status, assignee, search, page = 0 }) =>
        Effect.sync(() => {
          const needle = search?.trim().toLowerCase() ?? "";

          const matching = tickets
            .filter(
              (ticket) =>
                ticket.workspaceId === workspaceId &&
                (status === undefined || ticket.status === status) &&
                (assignee === undefined || ticket.assignee === assignee) &&
                ticket.title.toLowerCase().includes(needle),
            )
            .sort(declaredOrder);

          const slice = matching.slice(page * PAGE, page * PAGE + PAGE);
          const nextPage = (page + 1) * PAGE < matching.length ? page + 1 : undefined;

          return { tickets: slice.map((ticket) => ({ ...ticket })), nextPage };
        }),
      openCount: ({ workspaceId }) =>
        Effect.sync(
          () =>
            tickets.filter(
              (ticket) => ticket.workspaceId === workspaceId && ticket.status === "open",
            ).length,
        ),
      saveTitle: ({ idempotencyKey, title, ...key }) =>
        once(idempotencyKey, (): Effect.Effect<TicketRow, TicketNotFound | TitleRejected> => {
          const ticket = find(key);

          if (!ticket) return Effect.fail(new TicketNotFound({ ticketId: key.ticketId }));

          if (title.trim() === "")
            return Effect.fail(new TitleRejected({ reason: "Enter a ticket title" }));

          return Effect.sync(() => update(ticket, { title }));
        }),
      assign: ({ idempotencyKey, assignee, ...key }) =>
        once(idempotencyKey, () => {
          const ticket = find(key);

          return ticket
            ? Effect.sync(() => update(ticket, { assignee, status: "assigned" }))
            : Effect.fail(new TicketNotFound({ ticketId: key.ticketId }));
        }),
      technicianUpdates: () =>
        Stream.fromIterable([
          { stage: "assigned" as const, at: 0 },
          { stage: "on-site" as const, at: 60_000 },
        ]),
      events: ({ workspaceId }) =>
        Stream.fromPubSub(pushes).pipe(
          Stream.filter((event) =>
            event._tag === "TicketSaved"
              ? event.ticket.workspaceId === workspaceId
              : event.workspaceId === workspaceId,
          ),
        ),
    });

    return DemoServer.of({
      api,
      externalSave: (key, change) =>
        Effect.suspend(() => {
          const ticket = find(key);

          if (!ticket) return Effect.fail(new TicketNotFound({ ticketId: key.ticketId }));
          const next = update(ticket, change);

          return PubSub.publish(pushes, { _tag: "TicketSaved", ticket: next }).pipe(
            Effect.as(next),
          );
        }),
      externalRemove: (key) =>
        Effect.suspend(() => {
          const ticket = find(key);

          if (!ticket) return Effect.fail(new TicketNotFound({ ticketId: key.ticketId }));
          tickets = tickets.filter((current) => current !== ticket);

          return PubSub.publish(pushes, {
            _tag: "TicketRemoved",
            ...key,
            revision: ticket.revision + 1,
          }).pipe(Effect.asVoid);
        }),
    });
  }),
);

// The API the app uses, over the server fixtures can reach. Both come from one build.
export const DemoTicketApi = Layer.effect(
  TicketApi,
  DemoServer.useSync((server) => server.api),
).pipe(Layer.provideMerge(DemoServerLive));
