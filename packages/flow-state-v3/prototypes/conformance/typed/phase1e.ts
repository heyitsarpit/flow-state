// Phase 1 area E (entities): fixtures for the runner's 0a, D3's send-time join, rule 32 (U10), a module's defect (U7), and a real source shape.
import { Effect, Schema } from "effect";
import { definition, Flow, machine, resource, transaction } from "../compile/index.ts";
import type { Api, ServerModel } from "../fake-world.ts";
import { Outcome, type OutcomeUnknown } from "../fixtures/compiled.ts";
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

// The real source shape: supabase-js's PostgREST update, `sb.from("tickets").update({ title }).eq("id", id).eq("revision", revision).select("title, revision")`,
// resolves (it does not reject) to a `PostgrestResponse`. Optimistic concurrency is the `revision` filter: a stale write updates no row and answers
// `data: []` with status 200, not a 412; a dropped connection answers `error` with status 0. In an app, `run` is `Effect.promise(() => query)` inside the
// app's own service; here the fake world is the transport and answers the same shape. Flow sees only what the adapter decodes.
type PostgrestError = { readonly message: string; readonly code: string; readonly details: string | null; readonly hint: string | null };
export type PostgrestResponse<T> = { readonly data: T | null; readonly error: PostgrestError | null; readonly count: number | null; readonly status: number; readonly statusText: string };
const TitleSaved = S.Struct({ title: S.String, revision: S.Number });
// PostgREST takes no idempotency key; the `revision` filter is what makes a duplicate harmless. The fake world files the request under the Attempt's id.
const saveTitle = (i: { readonly id: string; readonly title: string; readonly revision: number }, attempt: string) =>
  call<PostgrestResponse<readonly unknown[]>, "NoResponse">("save")({ table: "tickets", patch: { title: i.title }, match: { id: i.id, revision: i.revision }, select: "title, revision" }, attempt).pipe(
    Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)),
    Effect.flatMap((res): Effect.Effect<typeof TitleSaved.Type, { readonly _tag: "Refused" } | { readonly _tag: "TicketChanged" } | OutcomeUnknown<{ readonly _tag: "ServerError" }>> =>
      res.error !== null
        ? res.status === 0 || res.status >= 500
          ? Outcome.unknown({ _tag: "ServerError" as const })
          : Effect.fail({ _tag: "Refused" as const })
        : res.data === null || res.data.length === 0
          ? Effect.fail({ _tag: "TicketChanged" as const })
          : Effect.orDie(Schema.decodeUnknownEffect(TitleSaved)(res.data[0])),
    ),
  );
export const p1TicketRef = (id: string) => `Ticket|${id}`;
const ticketRows = S.Array(S.Struct({ id: S.String, title: S.String, slug: S.String, revision: S.Number }));
const ticketServer: ServerModel = {
  init: () => ({ tickets: { t1: { id: "t1", title: "Old", slug: "old", revision: 1 } } }),
  apply(op, i, s) {
    if (op !== "save") return { s };
    const cur = s.tickets[i.match.id];
    if (!cur || cur.revision !== i.match.revision) return { s, value: { data: [], error: null, count: null, status: 200, statusText: "OK" } };
    const next = { ...cur, title: i.patch.title, slug: i.patch.title.toLowerCase(), revision: cur.revision + 1 };
    return { s: { tickets: { ...s.tickets, [cur.id]: next } }, value: { data: [{ title: next.title, revision: next.revision }], error: null, count: null, status: 200, statusText: "OK" } };
  },
  read: (op, i, s) => (op === "tickets" ? Object.values(s.tickets) : (s.tickets[i.ref.split("|")[1]] ?? null)),
};
export const P1TicketId = "Lab/P1Ticket";
const save = transaction({ id: "lab/p1Save", input: { id: S.String, title: S.String, revision: S.Number }, key: ["id"], concurrency: "latest", services: [FakeApi], commit: (i, c) => saveTitle(i, c.attempt.id) });
const tickets = resource({ id: "lab/p1Tickets", input: {}, key: [], services: [FakeApi], lookup: (i) => Effect.flatMap(call<unknown, "NoResponse">("tickets")(i), (v) => Effect.orDie(Schema.decodeUnknownEffect(ticketRows)(v))) });
const ticketFx = fixture(
  (api: Api) =>
    machine(
      definition({
        id: P1TicketId,
        persist: false,
        states: ["A"],
        events: { Load: {}, Save: { id: S.String, title: S.String, revision: S.Number } },
        internalEvents: { Listed: {}, ListFailed: {}, Saved: {}, Changed: {}, Failed: {}, Unsure: Flow.uncertain({}) },
        memory: {},
        uses: ["entities"],
        domain: {
          writes: {
            save: {
              predicts: (i: { readonly id: string; readonly title: string }) => [{ ref: p1TicketRef(i.id), patch: { title: i.title, slug: i.title.toLowerCase() } }],
              confirms: (v: { readonly title: string; readonly revision: number }, i: { readonly id: string }) => [{ ref: p1TicketRef(i.id), fields: { title: v.title, revision: v.revision } }],
            },
          },
          reads: { tickets: (v: ReadonlyArray<{ readonly id: string }>) => v.map((row) => ({ ref: p1TicketRef(row.id), fields: row })) },
          repair: (ref: string) => api.call("repair", { ref }) as Effect.Effect<unknown, unknown, never>,
          version: () => "revision",
        },
        operations: ({ E }) => ({
          save: save.outcomes({ success: E.Saved, failure: { TicketChanged: E.Changed, Refused: E.Failed, NotSent: E.Failed }, unknown: E.Unsure }),
          tickets: tickets.outcomes({ success: E.Listed, failure: { NoResponse: E.ListFailed, Defect: E.ListFailed, Interrupted: E.ListFailed } }),
        }),
      }),
      ({ S: St, O }) => ({
        default: St.A,
        on: {
          Load: { actions: [O.tickets.lookup(() => ({}))] },
          Save: { actions: [O.save.commit(({ event }) => ({ id: event.id, title: event.title, revision: event.revision }))] },
          Listed: {},
          ListFailed: {},
          Saved: {},
          Changed: {},
          Failed: {},
          Unsure: {},
        },
      }),
    ),
  ticketServer,
);
export const p1TicketFixture = () => ticketFx;
