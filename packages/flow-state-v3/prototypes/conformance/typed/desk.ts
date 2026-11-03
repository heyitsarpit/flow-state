// Round 11: `fixtures/desk.compiled.ts`, written in the public API where it has no `domain`: TraitWrite, EachWrite, LateFill, EachReset. Desk/Tickets and
// TraitStore carry a `domain` (and Tickets streams) and wait for the entity step (finding F5): re-exported hand.
import { Effect, Schema } from "effect";
import type { Api } from "../fake-world.ts";
import type { Op } from "../fixtures/compiled.ts";
import { definition, Flow, fragment, machine, resource, transaction } from "./flow.ts";
import { call, fixture, write } from "./lab.ts";

export { ticketRef, deskServer, thingRef, traitStoreFixture, type StoreShape } from "../fixtures/desk.compiled.ts";
import { deskServer, ticketRef } from "../fixtures/desk.compiled.ts";

const S = Schema;
const U = S.Unknown;
const Strs = S.Array(S.String);

// ── Desk/Tickets: the confirm path's real shapes (review H3, H8, M14), the machine in the public API and the domain and feed in `Compiled`'s shape (D209).
// `markRead` has no `id`: the hand key was `{ id: i.id ?? "many" }`, a key no field list makes (finding F2), so here it is one lane by an empty key list.
type DeskOpts = { readonly versioned: boolean; readonly listen?: boolean; readonly lexical?: boolean; readonly twoFeeds?: boolean };
const deskWrite = (id: string, concurrency: Op["concurrency"], input: Readonly<Record<string, Schema.Top>>, key: readonly string[]) =>
  transaction({ id: `tickets/${id}`, input, key: key as never, concurrency, commit: write<unknown, "Refused">(id) });
const deskList = resource({ id: "tickets/list", input: {}, key: [], commit: (i) => call<unknown, "NoResponse">("list")(i) });
const changes = (api: Api, id: string, E: { readonly Unused: { readonly tag: "Unused" }; readonly Failed: { readonly tag: "Failed" } }) => ({
  id,
  listen: true as const,
  key: () => ({}),
  position: "revision",
  reconnect: true,
  idleMs: Number.MAX_SAFE_INTEGER / 2,
  healthyMs: 60_000,
  backoff: (n: number) => Math.min(30_000, 1000 * 2 ** n),
  subscribe: (i: unknown, { from }: { readonly from: unknown }) => api.socket(id, i, from),
  value: E.Unused,
  missed: E.Unused,
  failure: E.Failed,
});
type Change = { readonly _tag: string; readonly ticketId: string; readonly revision: unknown; readonly ticket: { readonly id: string } };
const listen = (e: Change) =>
  e._tag === "TicketRemoved" ? [{ ref: ticketRef(e.ticketId), removed: true as const, version: e.revision }] : [{ ref: ticketRef(e.ticket.id), fields: e.ticket }];
const desk = (o: DeskOpts) => (api: Api) => {
  const ops = {
    archive: deskWrite("archive", "reject", { id: U }, ["id"]),
    remove: deskWrite("remove", "reject", { id: U }, ["id"]),
    purge: deskWrite("purge", "reject", { id: U }, ["id"]),
    markRead: deskWrite("markRead", "reject", { ids: U, at: U }, []),
    rename: deskWrite("rename", "latest", { id: U, title: U }, ["id"]),
    retitle: deskWrite("retitle", "latest", { id: U, title: U }, ["id"]),
  };
  type I = { readonly id: string; readonly title: string; readonly ids: readonly string[]; readonly at: unknown };
  type V = { readonly id: string; readonly title: string; readonly revision: unknown };
  const d = definition({
    id: "Desk/Tickets",
    states: { READY: {} },
    events: { Load: {}, Archive: { id: U }, Remove: { id: U }, Purge: { id: U }, MarkRead: { ids: U, at: U }, Rename: { id: U, title: U }, Retitle: { id: U, title: U }, Reconcile: { id: U } },
    internalEvents: { Listed: {}, ListFailed: {}, Settled: {}, Failed: {}, Unsure: { id: U, op: U }, Unused: {} },
    memory: {},
    persisted: false,
    uses: o.listen ? ["entities", "sessions"] : ["entities"],
    domain: {
      writes: {
        // ticket.domain.ts's archive, attachments.domain.ts's remove, comments.domain.ts's markRead: no `.one`.
        archive: { predicts: (i: I) => [{ ref: ticketRef(i.id), patch: { archived: true } }] },
        remove: { predicts: (i: I) => [{ ref: ticketRef(i.id), remove: true }] },
        markRead: { predicts: (i: I) => i.ids.map((id) => ({ ref: ticketRef(id), patch: { readAt: i.at } })) },
        // comments.domain.ts's edit: `.one(Comment)`, the whole row.
        rename: { predicts: (i: I) => [{ ref: ticketRef(i.id), patch: { title: i.title, slug: i.title.toLowerCase() } }], confirms: (v: V) => [{ ref: ticketRef(v.id), fields: v }] },
        // A response with part of the row: the title and the new revision. `slug` stays unconfirmed.
        retitle: {
          predicts: (i: I) => [{ ref: ticketRef(i.id), patch: { title: i.title, slug: i.title.toLowerCase() } }],
          confirms: (v: V, i: I) => [{ ref: ticketRef(i.id), fields: { title: v.title, ...(o.versioned ? { revision: v.revision } : {}) } }],
        },
        // A delete that answers with the tombstone's version: `Ticket.delete(key, { version })`.
        purge: { predicts: (i: I) => [{ ref: ticketRef(i.id), remove: true }], confirms: (v: V, i: I) => [{ ref: ticketRef(i.id), removed: true, version: o.versioned ? v.revision : undefined }] },
      },
      reads: { list: (v: readonly { readonly id: string }[]) => v.map((row) => ({ ref: ticketRef(row.id), fields: row })) },
      ...(o.listen ? { listens: { changes: listen, ...(o.twoFeeds ? { changes2: listen } : {}) } } : {}),
      repair: (ref: string) => api.call("repair", { ref }) as Effect.Effect<unknown, unknown, never>,
      ...(o.versioned ? { version: () => "revision" } : {}),
      ...(o.lexical ? { versionOrder: "lexical" as const } : {}),
    },
    ...(o.listen ? { streams: ({ E }) => ({ changes: changes(api, "changes", E), ...(o.twoFeeds ? { changes2: changes(api, "changes2", E) } : {}) }) } : {}),
    operations: ({ E }) => {
      const outcomes = (id: string) => ({ success: E.Settled, failure: { Refused: E.Failed, NotSent: E.Failed }, unknown: E.Unsure.from((_v, c) => ({ id: (c.key as { readonly id?: unknown }).id, op: id })) });
      return {
        archive: ops.archive.outcomes(outcomes("archive")),
        remove: ops.remove.outcomes(outcomes("remove")),
        purge: ops.purge.outcomes(outcomes("purge")),
        markRead: ops.markRead.outcomes(outcomes("markRead")),
        rename: ops.rename.outcomes(outcomes("rename")),
        retitle: ops.retitle.outcomes(outcomes("retitle")),
        list: deskList.outcomes({ success: E.Listed, failure: { NoResponse: E.ListFailed, Defect: E.ListFailed, Interrupted: E.ListFailed } }),
      };
    },
  });
  return machine(d, ({ S: St, O }) => ({
    default: St.READY,
    on: {
      Load: { actions: [O.list.lookup(() => ({}))] },
      Listed: {},
      ListFailed: {},
      Archive: { actions: [O.archive.commit(({ event }) => ({ id: event.id }))] },
      Remove: { actions: [O.remove.commit(({ event }) => ({ id: event.id }))] },
      Purge: { actions: [O.purge.commit(({ event }) => ({ id: event.id }))] },
      MarkRead: { actions: [O.markRead.commit(({ event }) => ({ ids: event.ids, at: event.at }))] },
      Rename: { actions: [O.rename.commit(({ event }) => ({ id: event.id, title: event.title }))] },
      Retitle: { actions: [O.retitle.commit(({ event }) => ({ id: event.id, title: event.title }))] },
      Reconcile: { actions: [O.archive.retry.key(({ event }) => ({ id: event.id }))] },
      Settled: {},
      Failed: {},
      Unsure: {},
    },
    states: o.listen ? { READY: { activities: [{ op: "changes", input: () => ({}) }, ...(o.twoFeeds ? [{ op: "changes2", input: () => ({}) }] : [])] } } : {},
  }));
};
export const deskFixture = fixture(desk({ versioned: true }), deskServer);
export const deskNoVersionFixture = fixture(desk({ versioned: false }), deskServer);
export const deskListenFixture = fixture(desk({ versioned: true, listen: true }), deskServer);
export const deskListenNoVersionFixture = fixture(desk({ versioned: false, listen: true }), deskServer);
// D75: a string version with a declared order.
export const deskListenLexicalFixture = fixture(desk({ versioned: true, listen: true, lexical: true }), deskServer);
// Review, item 3: two feeds on one entity, each its own connection. Frames may cross.
export const deskTwoFeedsFixture = fixture(desk({ versioned: true, listen: true, twoFeeds: true }), deskServer);
export const deskTwoFeedsNoVersionFixture = fixture(desk({ versioned: false, listen: true, twoFeeds: true }), deskServer);

// ── A persisted trait with a write. `.resumable()` on its tab. For rebind and reload (review H5, H6).
const TW = "Lab/TraitWrite";
const traitWrite = (policy: Op["concurrency"], persisted: boolean) => {
  const put = transaction({ id: "lab/put", input: { k: U }, key: ["k"], concurrency: policy, commit: write<unknown, "Refused">("put") });
  const Trait = fragment(
    {
      id: "TW",
      events: { Go: { k: U }, Resend: {} },
      internalEvents: { Ok: { k: U }, No: { k: U, why: U }, Unsure: { k: U, why: U } },
      memory: { got: Flow.initial(Strs, []) },
      operations: ({ E }) => ({
        put: put.outcomes({
          success: E.Ok.from((_v, c) => ({ k: (c.key as { readonly k: unknown }).k })),
          failure: {
            Refused: E.No.from((_v, c) => ({ k: (c.key as { readonly k: unknown }).k, why: "Refused" })),
            NotSent: E.No.from((v, c) => ({ k: (c.key as { readonly k: unknown }).k, why: v.why })),
          },
          unknown: E.Unsure.from((_v, c) => ({ k: (c.key as { readonly k: unknown }).k, why: c.reason })),
        }),
      }),
    },
    ({ O }) => ({
      on: {
        Go: { actions: [O.put.commit(({ event }) => ({ k: event.k ?? "a" }))] },
        Resend: { actions: [O.put.retry.key(() => ({ k: "a" }))] },
        Ok: { updateMemory: ({ memory, event }) => ({ got: [...memory.got, `ok:${String(event.k)}`] }) },
        No: { updateMemory: ({ memory, event }) => ({ got: [...memory.got, `no:${String(event.k)}:${String(event.why)}`] }) },
        Unsure: { updateMemory: ({ memory, event }) => ({ got: [...memory.got, `unsure:${String(event.k)}:${String(event.why)}`] }) },
      },
    }),
  );
  const d = definition({ id: TW, states: { TAB: {}, AWAY: {} }, events: { Away: {}, Back: {} }, internalEvents: {}, memory: {}, persisted, places: { t: Trait }, operations: () => ({}) });
  return machine(d, ({ S: St }) => ({ default: St.TAB, on: { Away: St.AWAY, Back: St.TAB }, states: { TAB: { traits: { t: { resumable: true } } } } }));
};
export const traitWriteFixture = fixture(traitWrite("serialize", true));

// ── Copies under `.each` with one key across them: rule 51 under `serialize`, where the lane's own decline cannot hide it.
const EW = "Lab/EachWrite";
// Not `unknownWhenLost`: the hand fixture's commit answers a lost call as a failure.
const ewPut = transaction({ id: "lab/put", input: { k: U }, key: ["k"], concurrency: "serialize", commit: (i, { attempt }) => call("put")(i, attempt.id) });
const Copy = fragment(
  {
    id: "Copy",
    events: { Go: {} },
    internalEvents: { Ok: {}, No: { why: U }, Unsure: {} },
    memory: { got: Flow.initial(Strs, []) },
    operations: ({ E }) => ({ put: ewPut.outcomes({ success: E.Ok, failure: { NotSent: E.No.from((v) => ({ why: v.why })) }, unknown: E.Unsure }) }),
  },
  ({ O }) => ({
    on: {
      Go: { actions: [O.put.commit(() => ({ k: "shared" }))] },
      Ok: { updateMemory: ({ memory }) => ({ got: [...memory.got, "ok"] }) },
      No: { updateMemory: ({ memory, event }) => ({ got: [...memory.got, `no:${String(event.why)}`] }) },
      Unsure: {},
    },
  }),
);
const eachWrite = definition({ id: EW, states: {}, events: {}, internalEvents: {}, memory: { ids: Flow.initial(Strs, ["x", "y"]) }, persisted: false, places: { c: Copy }, operations: () => ({}) });
export const eachWriteFixture = fixture(machine(eachWrite, () => ({ default: { node: "root" }, traits: { c: { each: { of: "ids", max: 8 } } } })));

// ── Rule 15 in step 3: a late ending's filling may not leave what the host's state still owns.
const LF = "Lab/LateFill";
const plain = (id: string) => transaction({ id: `lab/${id}`, input: {}, key: [], concurrency: "reject", commit: (i, { attempt }) => call(id)(i, attempt.id) });
const kidPut = plain("kidPut");
const hostPut = plain("hostPut");
const Kid = fragment(
  {
    id: "Kid",
    states: { A: {}, B: {} },
    default: "A",
    events: { Go: {}, Move: {} },
    internalEvents: { Done: {}, Failed: {}, Unsure: {} },
    exits: { Finished: Flow.Exit({}) },
    operations: ({ E }) => ({ kidPut: kidPut.outcomes({ success: E.Done, failure: { NotSent: E.Failed }, unknown: E.Unsure }) }),
  },
  ({ S: St, O, exits }) => ({
    on: { Done: exits.Finished, Failed: {}, Unsure: {} },
    states: { A: { on: { Go: { actions: [O.kidPut.commit(() => ({}))] }, Move: St.B } } },
  }),
);
const lateFill = definition({
  id: LF,
  states: { HOST: {}, OTHER: {} },
  events: { HostGo: {} },
  internalEvents: { Failed: {}, Unsure: {}, HostDone: {} },
  memory: {},
  persisted: false,
  places: { kid: Kid },
  operations: ({ E }) => ({ hostPut: hostPut.outcomes({ success: E.HostDone, failure: { NotSent: E.Failed }, unknown: E.Unsure }) }),
});
export const lateFillFixture = fixture(
  machine(lateFill, ({ S: St, O }) => ({
    default: St.HOST,
    on: { Failed: {}, Unsure: {}, HostDone: {} },
    states: { HOST: { on: { HostGo: { actions: [O.hostPut.commit(() => ({}))] } }, traits: { kid: { exits: { Finished: St.OTHER } } } } },
  })),
);

// ── Review M2: a callback's patch moves an `.each` placement's reset value, so the reset is a pending one.
const ER = "Lab/EachReset";
const Item = fragment({ id: "Item", events: { Bump: {} }, callbacks: { Bumped: Flow.Callback({}) }, memory: { fresh: Flow.initial(S.Boolean, true) } }, ({ callbacks }) => ({
  on: { Bump: { notify: [callbacks.Bumped] } },
}));
const eachReset = definition({ id: ER, states: {}, events: {}, internalEvents: {}, memory: { ids: Flow.initial(Strs, ["x", "y"]), v: Flow.initial(S.Number, 0) }, persisted: false, places: { c: Item }, operations: () => ({}) });
export const eachResetFixture = fixture(
  machine(eachReset, () => ({
    default: { node: "root" },
    traits: { c: { each: { of: "ids", max: 8 }, resetOn: ({ memory }) => memory.v, callbacks: { Bumped: { updateMemory: ({ memory }) => ({ v: memory.v + 1 }) } } } },
  })),
);
