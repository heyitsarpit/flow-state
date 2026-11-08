// Phase 1 area E (entities): fixtures for the runner's 0a, D3's send-time join, rule 32 (U10), a module's defect (U7), and a real source shape.
import { Effect, Schema } from "effect";
import { changesOf, definition, deny, entity, Flow, machine, resource, transaction } from "../compile/index.ts";
import type { Api, ServerModel } from "../fake-world.ts";
import { Outcome, OutcomeUnknown } from "../fixtures/compiled.ts";
import { call, FakeApi, fixture, write } from "./lab.ts";

const S = Schema;
// 0a: one unkeyed `latest` lane; `Stop` cancels it. A cancel waiting for the head's acknowledgement must survive a later commit.
export const P1StopId = "Lab/P1Stop";
const look = transaction({ id: "lab/p1Look", input: { q: S.String }, key: [], concurrency: "latest", services: [FakeApi], commit: write("look") });
const stopFx = fixture(
  machine(
    definition({
      id: P1StopId,
      persist: true,
      states: ["A"],
      events: { Go: { q: S.String }, Stop: {} },
      internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}) },
      memory: {},
      operations: ({ E }) => ({ look: look.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }) }),
    }),
    ({ S: St, O }) => ({ default: St.A, on: { Go: { actions: [O.look.commit(({ event }) => ({ q: event.q }))] }, Stop: { actions: [O.look.cancel] }, Ok: {}, No: {}, Unsure: {} } }),
  ),
);
export const p1StopFixture = () => stopFx;

// 0b: rule 15's check (Q4 A) with the stay-put alternative written at the owner state itself, `W`, not at a strict ancestor. A late `Unsure` that lands
// after `W` is left and re-entered picks it; the root's alternatives all leave.
export const P1OwnerStayId = "Lab/P1OwnerStay";
const lateCharge = transaction({ id: "lab/p1OwnerCharge", input: { who: S.Unknown }, key: [], concurrency: "serialize", services: [FakeApi], commit: write("charge") });
const ownerStayFx = fixture(
  machine(
    definition({
      id: P1OwnerStayId,
      persist: true,
      states: ["A", "W"],
      events: { Go: {} },
      internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}) },
      memory: {},
      operations: ({ E }) => ({ charge: lateCharge.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }) }),
    }),
    ({ S: St, O }) => ({
      default: St.A,
      on: { Go: { target: St.W, actions: [O.charge.commit(() => ({ who: "a" }))] }, Ok: St.A, No: St.A, Unsure: St.A },
      states: { W: { on: { Unsure: { actions: [O.charge.cancelAll] } } } },
    }),
  ),
);
export const p1OwnerStayFixture = () => ownerStayFx;

// The real source shape: supabase-js's PostgREST update, `sb.from("tickets").update({ title }).eq("id", id).eq("revision", basedOn).select("title, revision")`,
// resolves (it does not reject) to a `PostgrestResponse`. Optimistic concurrency is the `revision` filter: a stale write updates no row and answers
// `data: []` with status 200, not a 412; a dropped connection answers `error` with status 0. PostgREST has no idempotency key, so a re-send of a write
// that landed matches no row. In an app, the adapter is `Effect.promise(() => query)` inside the app's own service; here the fake world is the transport
// (with no dedupe) and answers the same shape. `basedOn` is Flow's: the version of the row this write was minted over, rebased per OD19 Q32 A, narrowed.
type PostgrestError = { readonly message: string; readonly code: string; readonly details: string | null; readonly hint: string | null };
export type PostgrestResponse<T> = { readonly data: T | null; readonly error: PostgrestError | null; readonly count: number | null; readonly status: number; readonly statusText: string };
const TitleSaved = S.Struct({ title: S.String, revision: S.Number });
type SaveError = { readonly _tag: "Refused" } | { readonly _tag: "TicketChanged" } | OutcomeUnknown<{ readonly _tag: "NoResponse" } | { readonly _tag: "ServerError" } | { readonly _tag: "Undecodable" }>;
const postgrest = <A>(op: string) => (input: unknown, label: string): Effect.Effect<A, { readonly _tag: "NoResponse" }, FakeApi> =>
  Effect.flatMap(Effect.service(FakeApi), (api) => api.call(op, input, { idempotencyKey: label, dedupe: false }) as Effect.Effect<A, { readonly _tag: "NoResponse" }>);
const answerOf = (res: PostgrestResponse<readonly unknown[]>): Effect.Effect<typeof TitleSaved.Type, SaveError> =>
  res.error !== null
    ? res.status === 0 || res.status >= 500
      ? Outcome.unknown({ _tag: "ServerError" as const })
      : Effect.fail({ _tag: "Refused" as const })
    : res.data === null || res.data.length === 0
      ? Effect.fail({ _tag: "TicketChanged" as const }) // zero rows: a moved revision, or a row RLS hides or that is gone. `update` cannot tell them apart
      : Schema.decodeUnknownEffect(TitleSaved)(res.data[0]).pipe(Effect.mapError(() => new OutcomeUnknown({ reason: { _tag: "Undecodable" as const } }))); // it landed; what it did is unread
const saveTitle = (i: { readonly id: string; readonly title: string }, basedOn: unknown, attempt: string) =>
  postgrest<PostgrestResponse<readonly unknown[]>>("save")({ table: "tickets", patch: { title: i.title }, match: { id: i.id, revision: basedOn }, select: "title, revision" }, attempt).pipe(
    Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)),
    Effect.flatMap(answerOf),
  );
export const p1TicketRef = (id: string) => `Ticket|${id}`;
const TicketRow = S.Struct({ id: S.String, title: S.String, slug: S.String, revision: S.Number });
const ticketServer: ServerModel = {
  init: () => ({ tickets: { t1: { id: "t1", title: "Old", slug: "old", revision: 1 } } }),
  apply(op, i, s) {
    if (op !== "save") return { s };
    const cur = s.tickets[i.match.id];
    if (!cur || cur.revision !== i.match.revision) return { s, value: { data: [], error: null, count: null, status: 200, statusText: "OK" } };
    const next = { ...cur, title: i.patch.title, slug: i.patch.title.toLowerCase(), revision: cur.revision + 1 };
    return { s: { tickets: { ...s.tickets, [cur.id]: next } }, value: { data: [{ title: next.title, revision: next.revision }], error: null, count: null, status: 200, statusText: "OK" } };
  },
  // Q2: PostgREST's `.single()` answers a missing row with `PGRST116` and status 406; a plain REST endpoint with 404.
  read: (op, i, s) =>
    op === "tickets"
      ? Object.values(s.tickets)
      : op === "ticket"
        ? (s.tickets[i.id] ?? null)
        : op === "single"
          ? s.tickets[i.id]
            ? { data: s.tickets[i.id], error: null, count: null, status: 200, statusText: "OK" }
            : { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116", details: "The result contains 0 rows", hint: null }, count: null, status: 406, statusText: "Not Acceptable" }
          : op === "rest"
            ? s.tickets[i.id]
              ? { status: 200, body: s.tickets[i.id] }
              : { status: 404, body: { message: "Not Found" } }
            : (s.tickets[i.ref.split("|")[1]] ?? null),
};
export const P1TicketId = "Lab/P1Ticket";
const save = transaction({ id: "lab/p1Save", input: { id: S.String, title: S.String }, key: ["id"], concurrency: "latest", services: [FakeApi], commit: (i, c) => saveTitle(i, c.basedOn, c.attempt.id) });
const tickets = resource({ id: "lab/p1Tickets", input: {}, key: [], services: [FakeApi], lookup: (i) => Effect.flatMap(call<unknown, "NoResponse">("tickets")(i), (v) => Effect.orDie(Schema.decodeUnknownEffect(S.Array(TicketRow))(v))) });
const ticket = resource({ id: "lab/p1TicketOne", input: { id: S.String }, key: ["id"], services: [FakeApi], lookup: (i) => Effect.flatMap(call<unknown, "NoResponse">("ticket")(i), (v) => Effect.orDie(Schema.decodeUnknownEffect(S.NullOr(TicketRow))(v))) });
type ReadError = { readonly _tag: "TicketNotFound" } | { readonly _tag: "NoResponse" };
const notFound = Effect.fail<ReadError>({ _tag: "TicketNotFound" });
const noResponse = Effect.fail<ReadError>({ _tag: "NoResponse" });
const single = resource({
  id: "lab/p1Single",
  input: { id: S.String },
  key: ["id"],
  services: [FakeApi],
  lookup: (i) =>
    Effect.flatMap(call<PostgrestResponse<unknown>, "NoResponse">("single")(i), (res) =>
      res.error?.code === "PGRST116" ? notFound : res.error !== null ? noResponse : Effect.orDie(Schema.decodeUnknownEffect(TicketRow)(res.data))),
});
const rest = resource({
  id: "lab/p1Rest",
  input: { id: S.String },
  key: ["id"],
  services: [FakeApi],
  lookup: (i) =>
    Effect.flatMap(call<{ readonly status: number; readonly body: unknown }, "NoResponse">("rest")(i), (res) =>
      res.status === 404 ? notFound : res.status !== 200 ? noResponse : Effect.orDie(Schema.decodeUnknownEffect(TicketRow)(res.body))),
});
type Row = typeof TicketRow.Type;
const ticketOf = (o: { readonly persist: boolean }) => fixture(
  (api: Api) =>
    machine(
      definition({
        id: P1TicketId,
        persist: o.persist,
        states: ["A"],
        events: { Load: {}, Save: { id: S.String, title: S.String }, Retry: { id: S.String }, Single: { id: S.String }, Rest: { id: S.String } },
        internalEvents: { Listed: {}, ListFailed: {}, Saved: {}, Changed: {}, Failed: {}, Unsure: Flow.uncertain({ id: S.String }), Read: { id: S.String, title: S.NullOr(S.String) }, ReadFailed: {}, Found: {}, NotFound: {} },
        memory: { sent: Flow.initial(S.String, ""), toast: Flow.initial(S.String, "") },
        uses: ["entities"],
        domain: {
          writes: {
            save: {
              predicts: (i: { readonly id: string; readonly title: string }) => [{ ref: p1TicketRef(i.id), patch: { title: i.title, slug: i.title.toLowerCase() } }],
              confirms: (v: { readonly title: string; readonly revision: number }, i: { readonly id: string }) => [{ ref: p1TicketRef(i.id), fields: { title: v.title, revision: v.revision } }],
            },
          },
          reads: {
            tickets: (v: readonly Row[]) => v.map((row) => ({ ref: p1TicketRef(row.id), fields: row })),
            ticket: (v: Row | null, i: { readonly id: string }) => (v ? [{ ref: p1TicketRef(v.id), fields: v }] : [{ ref: p1TicketRef(i.id), removed: true as const }]),
            single: (v: Row) => [{ ref: p1TicketRef(v.id), fields: v }],
            rest: (v: Row) => [{ ref: p1TicketRef(v.id), fields: v }],
          },
          // Q2 A: `read(single).one(Ticket).byKey(({ input }) => ({ id: input.id })).gone("TicketNotFound")`, and the same for `rest`.
          gone: {
            single: { tag: "TicketNotFound", ref: (i: { readonly id: string }) => p1TicketRef(i.id) },
            rest: { tag: "TicketNotFound", ref: (i: { readonly id: string }) => p1TicketRef(i.id) },
          },
          repair: (ref: string) => api.call("repair", { ref }) as Effect.Effect<unknown, unknown, never>,
          version: () => "revision",
        },
        operations: ({ E }) => ({
          save: save.outcomes({ success: E.Saved, failure: { TicketChanged: E.Changed, Refused: E.Failed, NotSent: E.Failed }, unknown: E.Unsure.from((_v, x) => ({ id: (x.key as { readonly id: string }).id })) }),
          single: single.outcomes({ success: E.Found, failure: { TicketNotFound: E.NotFound, NoResponse: E.ReadFailed, Defect: E.ReadFailed, Interrupted: E.ReadFailed } }),
          rest: rest.outcomes({ success: E.Found, failure: { TicketNotFound: E.NotFound, NoResponse: E.ReadFailed, Defect: E.ReadFailed, Interrupted: E.ReadFailed } }),
          tickets: tickets.outcomes({ success: E.Listed, failure: { NoResponse: E.ListFailed, Defect: E.ListFailed, Interrupted: E.ListFailed } }),
          ticket: ticket.outcomes({ success: E.Read.from((v, x) => ({ id: (x.key as { readonly id: string }).id, title: (v as Row | null)?.title ?? null })), failure: { NoResponse: E.ReadFailed, Defect: E.ReadFailed, Interrupted: E.ReadFailed } }),
        }),
      }),
      ({ S: St, O }) => ({
        default: St.A,
        on: {
          Load: { actions: [O.tickets.lookup(() => ({}))] },
          Single: { actions: [O.single.lookup(({ event }) => ({ id: event.id }))] },
          Rest: { actions: [O.rest.lookup(({ event }) => ({ id: event.id }))] },
          Found: {},
          NotFound: {},
          Save: { updateMemory: ({ event }) => ({ sent: event.title }), actions: [O.save.commit(({ event }) => ({ id: event.id, title: event.title }))] },
          Retry: { actions: [O.save.retry(({ event }) => ({ id: event.id }))] },
          // 2.7.20's "the handler settles the unknown by a read": PostgREST cannot dedupe a re-send, so ask the row, not the server again.
          Unsure: { actions: [O.ticket.lookup(({ event }) => ({ id: event.id }))] },
          Read: [
            { guard: [({ memory, event }) => event.title === memory.sent || deny("not ours")], updateMemory: () => ({ toast: "Saved" }), actions: [O.save.cancel(({ event }) => ({ id: event.id }))] },
            { updateMemory: () => ({ toast: "Not saved" }), actions: [O.save.cancel(({ event }) => ({ id: event.id }))] },
          ],
          ReadFailed: {},
          Listed: {},
          ListFailed: {},
          Saved: { updateMemory: () => ({ toast: "Saved" }) },
          Changed: { updateMemory: () => ({ toast: "Changed by someone else" }) },
          Failed: {},
        },
      }),
    ),
  ticketServer,
);
const ticketFx = ticketOf({ persist: false });
const persistedTicketFx = ticketOf({ persist: true });
export const p1TicketFixture = () => ticketFx;
export const p1PersistedTicketFixture = () => persistedTicketFx;

// The judge's equality (runner, item 3): a profile whose `email` the server stores lower-cased. The PATCH answers 204, so the write is confirmed from its
// input; the entity's field Schema says two emails that differ by case are one value (`Schema.overrideToEquivalence`).
export const P1ProfileId = "Lab/P1Profile";
export const p1ProfileRef = (id: string) => `Profile|${id}`;
const Email = S.String.pipe(S.overrideToEquivalence(() => (a: string, b: string) => a.toLowerCase() === b.toLowerCase()));
const profileServer: ServerModel = {
  init: () => ({ profiles: { u1: { id: "u1", email: "old@x.com" } } }),
  apply: (op, i, s) => (op === "setEmail" ? { s: { profiles: { ...s.profiles, [i.id]: { id: i.id, email: String(i.email).toLowerCase() } } } } : { s }),
  read: (op, i, s) => (op === "profile" ? s.profiles[i.id] : (s.profiles[i.ref.split("|")[1]] ?? null)),
};
const setEmail = transaction({ id: "lab/p1SetEmail", input: { id: S.String, email: S.String }, key: ["id"], concurrency: "reject", services: [FakeApi], commit: write("setEmail") });
const profile = resource({ id: "lab/p1Profile", input: { id: S.String }, key: ["id"], services: [FakeApi], lookup: (i) => call<unknown, "NoResponse">("profile")(i) });
const profileOf = (withFields: boolean) => (api: Api) =>
  machine(
    definition({
      id: P1ProfileId,
      persist: false,
      states: ["A"],
      events: { Load: { id: S.String }, SetEmail: { id: S.String, email: S.String } },
      internalEvents: { Done: {}, No: {}, Unsure: Flow.uncertain({}) },
      memory: {},
      uses: ["entities"],
      domain: {
        writes: {
          setEmail: {
            predicts: (i: { readonly id: string; readonly email: string }) => [{ ref: p1ProfileRef(i.id), patch: { email: i.email } }],
            confirms: (_v: unknown, i: { readonly id: string; readonly email: string }) => [{ ref: p1ProfileRef(i.id), fields: { email: i.email } }],
          },
        },
        reads: { profile: (v: { readonly id: string; readonly email: string }) => [{ ref: p1ProfileRef(v.id), fields: v }] },
        repair: (ref: string) => api.call("repair", { ref }) as Effect.Effect<unknown, unknown, never>,
        ...(withFields ? { fields: { id: S.String, email: Email } } : {}),
      },
      operations: ({ E }) => ({
        setEmail: setEmail.outcomes({ success: E.Done, failure: { NotSent: E.No }, unknown: E.Unsure }),
        profile: profile.outcomes({ success: E.Done, failure: { NoResponse: E.No, Defect: E.No, Interrupted: E.No } }),
      }),
    }),
    ({ S: St, O }) => ({
      default: St.A,
      on: {
        Load: { actions: [O.profile.lookup(({ event }) => ({ id: event.id }))] },
        SetEmail: { actions: [O.setEmail.commit(({ event }) => ({ id: event.id, email: event.email }))] },
        Done: {},
        No: {},
        Unsure: {},
      },
    }),
  );
const profileFx = fixture(profileOf(true), profileServer);
export const p1ProfileFixture = () => profileFx;

// Q3 A and Q4 A: a queue of tickets fed by a Supabase Realtime-shaped channel, `postgres_changes` filtered by `queue_id=eq.<queueId>`. An UPDATE
// says whether it carries every column (a whole row) or only the changed ones and the revision (a delta); a DELETE carries the old key and revision.
// Supabase's re-subscribe has no resume proof, so every registration is unproven: a gap.
export const P1QueueId = "Lab/P1Queue";
const QRow = S.Struct({ id: S.String, queueId: S.String, title: S.String, revision: S.Number, note: S.optional(S.String) });
type QRow = typeof QRow.Type;
const QTicket = entity({ id: "QTicket", fields: QRow.fields, primaryKey: ["id"], version: "revision" });
export const qTicketRef = (id: string) => QTicket.ref({ id });
export type QChange =
  | { readonly eventType: "UPDATE"; readonly columns: "all"; readonly new: QRow }
  | { readonly eventType: "UPDATE"; readonly columns: "changed"; readonly new: Pick<QRow, "id" | "revision"> & Partial<QRow> }
  | { readonly eventType: "DELETE"; readonly old: Pick<QRow, "id" | "revision"> };
const toChange = changesOf((e: QChange) =>
  e.eventType === "DELETE"
    ? [QTicket.delete({ id: e.old.id }, { version: e.old.revision })]
    : e.columns === "changed"
      ? [QTicket.delta({ id: e.new.id }, e.new)]
      : [QTicket.row(e.new)],
);
const queueServer: ServerModel = {
  init: () => ({
    tickets: {
      t1: { id: "t1", queueId: "q1", title: "A", revision: 1, note: "n" },
      t2: { id: "t2", queueId: "q2", title: "B", revision: 1 },
    },
  }),
  apply: (_op, _i, s) => ({ s }),
  read: (op, i, s) => (op === "tickets" ? Object.values(s.tickets) : (s.tickets[i.ref.split("|")[1]] ?? null)),
};
const qTickets = resource({ id: "lab/p1QTickets", input: {}, key: [], services: [FakeApi], lookup: (i) => Effect.flatMap(call<unknown, "NoResponse">("tickets")(i), (v) => Effect.orDie(Schema.decodeUnknownEffect(S.Array(QRow))(v))) });
const queueOf = (covers: boolean) => (api: Api) =>
  machine(
    definition({
      id: P1QueueId,
      persist: false,
      states: ["A"],
      events: { Load: {} },
      internalEvents: { Listed: {}, ListFailed: {}, Unused: {}, Failed: {} },
      memory: { queueId: Flow.initial(S.String, "q1") },
      uses: ["entities", "sessions"],
      domain: {
        writes: {},
        reads: { tickets: (v: readonly QRow[]) => v.map((r) => ({ ref: QTicket.ref(r), fields: r })) },
        listens: { changes: toChange },
        // `.covers(({ input, record }) => eq(record.queueId, input.queueId))`
        ...(covers ? { covers: { changes: { entity: QTicket.id, where: [{ field: "queueId", input: "queueId" }] } } } : {}),
        repair: (ref: string) => api.call("repair", { ref }) as Effect.Effect<unknown, unknown, never>,
        version: () => "revision",
      },
      streams: ({ E }) => ({
        changes: {
          id: "changes",
          listen: true as const,
          key: () => ({}),
          position: "revision",
          reconnect: true,
          idleMs: Number.MAX_SAFE_INTEGER / 2,
          healthyMs: 60_000,
          backoff: (n: number) => Math.min(30_000, 1000 * 2 ** n),
          subscribe: (i: unknown, { from }: { readonly from: unknown }) => api.socket("changes", i, from),
          value: E.Unused,
          missed: E.Unused,
          failure: E.Failed,
        },
      }),
      operations: ({ E }) => ({ tickets: qTickets.outcomes({ success: E.Listed, failure: { NoResponse: E.ListFailed, Defect: E.ListFailed, Interrupted: E.ListFailed } }) }),
    }),
    ({ S: St, O }) => ({
      default: St.A,
      on: { Load: { actions: [O.tickets.lookup(() => ({}))] }, Listed: {}, ListFailed: {}, Unused: {}, Failed: {} },
      states: { A: { activities: [{ op: "changes", input: ({ memory }: { readonly memory: { readonly queueId: string } }) => ({ queueId: memory.queueId }) }] } },
    }),
  );
const queueCoversFx = fixture(queueOf(true), queueServer);
const queueFx = fixture(queueOf(false), queueServer);
export const p1QueueCoversFixture = () => queueCoversFx;
export const p1QueueFixture = () => queueFx;
