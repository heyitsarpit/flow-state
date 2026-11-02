// Real shapes for the confirm path (review H3, H8, M14). A copy of what desk's domains write: `Ticket.archive`, `Attachments.remove`
// and `Comments.markRead` are `write(x).predicts(...)` with no `.one`, so a success carries no row; `Comments.edit` and `Roster` carry
// one, with `revision`. `entity({ version: "revision" })` compiles to `version`. Two fixtures: with the version and without, so the
// fallback stays tested. Plus a persisted trait with a write, for rebind and reload (review H5, H6), and copies for rule 51.
import { Effect, Stream } from "effect";
import type { Api, ServerModel } from "../fake-world.ts";
import type { Fixture } from "../harness.ts";
import { fixtureOf, unknownWhenLost } from "./build.ts";
import { deny, type Compiled, type DomainSpec, type Fragment, type Op } from "./compiled.ts";

const D = "Desk/Tickets";
const f = fixtureOf(D);
export const ticketRef = (id: string) => `Ticket|${id}`;
const named = ({ event }: any) => ({ id: event.id });

const write = (api: Api, id: string, concurrency: Op["concurrency"]): Op => ({
  id,
  contract: `tickets/${id}`,
  kind: "write",
  key: f.key(id, (i: any) => ({ id: i.id ?? "many" })),
  concurrency,
  commit: (input, { attempt }) =>
    api.call(id, input, { idempotencyKey: attempt.id }).pipe(unknownWhenLost) as Effect.Effect<
      unknown,
      unknown
    >,
  outcomes: {
    success: { event: "Settled" },
    failure: {
      Refused: { event: "Failed" },
      NotSent: { event: "Failed" },
    },
    unknown: f.mapped(id, "unknown", "Unsure", (_v, c) => ({ id: c.key.id, op: id })),
  },
});
const domain = (api: Api, versioned: boolean): DomainSpec => ({
  writes: {
    // ticket.domain.ts's archive, attachments.domain.ts's remove, comments.domain.ts's markRead: no `.one`.
    archive: {
      predicts: f.slot("domain.archive.predicts", (i: any) => [
        { ref: ticketRef(i.id), patch: { archived: true } },
      ]),
    },
    remove: {
      predicts: f.slot("domain.remove.predicts", (i: any) => [
        { ref: ticketRef(i.id), remove: true },
      ]),
    },
    markRead: {
      predicts: f.slot("domain.markRead.predicts", (i: any) =>
        i.ids.map((id: string) => ({ ref: ticketRef(id), patch: { readAt: i.at } })),
      ),
    },
    // comments.domain.ts's edit: `.one(Comment)`, the whole row.
    rename: {
      predicts: f.slot("domain.rename.predicts", (i: any) => [
        { ref: ticketRef(i.id), patch: { title: i.title, slug: i.title.toLowerCase() } },
      ]),
      confirms: (v: any) => [{ ref: ticketRef(v.id), fields: v }],
    },
    // A response with part of the row: the title and the new revision. `slug` stays unconfirmed.
    retitle: {
      predicts: f.slot("domain.retitle.predicts", (i: any) => [
        { ref: ticketRef(i.id), patch: { title: i.title, slug: i.title.toLowerCase() } },
      ]),
      confirms: (v: any, i: any) => [
        { ref: ticketRef(i.id), fields: { title: v.title, ...(versioned ? { revision: v.revision } : {}) } },
      ],
    },
    // A delete that answers with the tombstone's version: `Ticket.delete(key, { version })`.
    purge: {
      predicts: f.slot("domain.purge.predicts", (i: any) => [
        { ref: ticketRef(i.id), remove: true },
      ]),
      confirms: (v: any, i: any) => [
        { ref: ticketRef(i.id), removed: true, version: versioned ? v.revision : undefined },
      ],
    },
  },
  reads: {
    list: (v: any[]) => v.map((row) => ({ ref: ticketRef(row.id), fields: row })),
  },
  repair: (ref) => api.call("repair", { ref }) as Effect.Effect<any, any, never>,
  ...(versioned ? { version: () => "revision" } : {}),
});
const make =
  (versioned: boolean) =>
  (api: Api): Compiled => ({
    id: D,
    root: "root",
    default: "READY",
    nodes: {
      root: f.node("root", {
        Load: [{ members: f.lookup("list", () => ({})) }],
        Listed: [{}],
        ListFailed: [{}],
        Archive: [{ members: f.commit("archive", ({ event }) => ({ id: event.id })) }],
        Remove: [{ members: f.commit("remove", ({ event }) => ({ id: event.id })) }],
        Purge: [{ members: f.commit("purge", ({ event }) => ({ id: event.id })) }],
        MarkRead: [{ members: f.commit("markRead", ({ event }) => ({ ids: event.ids, at: event.at })) }],
        Rename: [
          { members: f.commit("rename", ({ event }) => ({ id: event.id, title: event.title })) },
        ],
        Retitle: [
          { members: f.commit("retitle", ({ event }) => ({ id: event.id, title: event.title })) },
        ],
        Reconcile: [
          {
            members: (p) => [
              {
                op: "archive",
                verb: "retry",
                key: f.slot(`${p}.actions[0].key`, named),
              },
            ],
          },
        ],
        Settled: [{}],
        Failed: [{}],
        Unsure: [{}],
      }),
      READY: f.node("READY"),
    },
    memory: f.memory(() => ({})),
    ops: {
      archive: write(api, "archive", "reject"),
      remove: write(api, "remove", "reject"),
      purge: write(api, "purge", "reject"),
      markRead: write(api, "markRead", "reject"),
      rename: write(api, "rename", "latest"),
      retitle: write(api, "retitle", "latest"),
      list: {
        id: "list",
        contract: "tickets/list",
        kind: "read",
        key: f.key("list", () => ({})),
        concurrency: "reject",
        commit: (i) => api.call("list", i) as Effect.Effect<unknown, unknown>,
        outcomes: {
          success: { event: "Listed" },
          failure: {
            NoResponse: { event: "ListFailed" },
            Defect: { event: "ListFailed" },
            Interrupted: { event: "ListFailed" },
          },
        },
      },
    },
    persisted: false,
    uses: ["entities"],
    domain: domain(api, versioned),
  });
const row = (id: string) => ({
  id,
  title: `title ${id}`,
  slug: `title ${id}`,
  archived: false,
  readAt: null as number | null,
  revision: 1,
});
export const deskServer: ServerModel = {
  init: () => ({ tickets: { t1: row("t1"), t2: row("t2") } }),
  apply(op, i, s) {
    if (op === "markRead") {
      const tickets = { ...s.tickets };
      for (const id of i.ids) tickets[id] = { ...tickets[id], readAt: i.at, revision: tickets[id].revision + 1 };
      return { s: { tickets } };
    }
    const cur = s.tickets[i.id];
    if (!cur) return { s, fail: { _tag: "Refused" } };
    const revision = cur.revision + 1;
    if (op === "remove") {
      const { [i.id]: _gone, ...rest } = s.tickets;
      return { s: { tickets: rest } }; // 204
    }
    if (op === "purge") {
      const { [i.id]: _gone, ...rest } = s.tickets;
      return { s: { tickets: rest }, value: { revision } };
    }
    if (op === "archive") {
      const r = { ...cur, archived: true, revision };
      return { s: { tickets: { ...s.tickets, [i.id]: r } } }; // 204
    }
    const r = { ...cur, title: i.title, slug: i.title.toLowerCase(), revision };
    const tickets = { ...s.tickets, [i.id]: r };
    return { s: { tickets }, value: op === "rename" ? r : { title: i.title, revision } };
  },
  read: (op, i, s) =>
    op === "list" ? Object.values(s.tickets) : (s.tickets[i.ref.split("|")[1]] ?? null),
};
export const deskFixture: Fixture = { id: D, make: make(true), server: deskServer };
export const deskNoVersionFixture: Fixture = { id: D, make: make(false), server: deskServer };

// ── A persisted trait with a write. `.resumable()` on its tab. For rebind and reload (review H5, H6).
const TW = "Lab/TraitWrite";
const tw = fixtureOf(TW);
const tt = fixtureOf("TW");
const push = (s: string) => ({ memory }: any) => ({ got: [...memory.got, s] });
const Trait: Fragment = {
  id: "TW",
  root: "root",
  default: "root",
  nodes: {
    root: tt.node("root", {
      Go: [
        {
          members: (p) => [
            { op: "put", verb: "commit", input: tt.slot(`${p}.actions[0]`, ({ event }: any) => ({ k: event.k ?? "a" })) },
          ],
        },
      ],
      Resend: [
        { members: (p) => [{ op: "put", verb: "retry", key: tt.slot(`${p}.actions[0].key`, () => ({ k: "a" })) }] },
      ],
      Ok: [{ patch: ({ memory, event }: any) => push(`ok:${event.k}`)({ memory }) }],
      No: [{ patch: ({ memory, event }: any) => push(`no:${event.k}:${event.why}`)({ memory }) }],
      Unsure: [{ patch: ({ memory, event }: any) => push(`unsure:${event.k}:${event.why}`)({ memory }) }],
    }),
  },
  memory: { initial: tt.slot("memory.initial", () => ({ got: [] as string[] })) },
};
const traitMake =
  (policy: Op["concurrency"], persisted: boolean) =>
  (api: Api): Compiled => ({
    id: TW,
    root: "root",
    default: "TAB",
    fragments: { TW: Trait },
    nodes: {
      root: tw.node("root", { Away: [{ target: "AWAY" }], Back: [{ target: "TAB" }] }),
      TAB: {
        ...tw.node("TAB"),
        placements: [{ name: "t", fragment: "TW", resumable: true }],
      },
      AWAY: tw.node("AWAY"),
    },
    memory: tw.memory(() => ({})),
    ops: {
      put: {
        id: "put",
        contract: "lab/put",
        kind: "write",
        fragment: "TW",
        key: tw.key("put", (i: any) => ({ k: i.k })),
        concurrency: policy,
        commit: (input, { attempt }) =>
          api.call("put", input, { idempotencyKey: attempt.id }).pipe(unknownWhenLost) as Effect.Effect<
            unknown,
            unknown
          >,
        outcomes: {
          success: tw.mapped("put", "success", "Ok", (_v, c) => ({ k: c.key.k })),
          failure: {
            Refused: tw.mapped("put", "failure", "No", (_v, c) => ({ k: c.key.k, why: "Refused" })),
            NotSent: tw.mapped("put", "failure", "No", (v, c) => ({ k: c.key.k, why: v.why })),
          },
          unknown: tw.mapped("put", "unknown", "Unsure", (_v, c) => ({ k: c.key.k, why: c.reason })),
        },
      },
    },
    persisted,
    uses: [],
  });
export const traitWriteFixture: Fixture = { id: TW, make: traitMake("serialize", true) };

// ── Copies under `.each` with one key across them: rule 51 under `serialize`, where the lane's own decline cannot hide it.
const EW = "Lab/EachWrite";
const ew = fixtureOf(EW);
const ec = fixtureOf("Copy");
const Copy: Fragment = {
  id: "Copy",
  root: "root",
  default: "root",
  nodes: {
    root: ec.node("root", {
      Go: [
        {
          members: (p) => [
            { op: "put", verb: "commit", input: ec.slot(`${p}.actions[0]`, () => ({ k: "shared" })) },
          ],
        },
      ],
      Ok: [{ patch: ({ memory }: any) => ({ got: [...memory.got, "ok"] }) }],
      No: [{ patch: ({ memory, event }: any) => ({ got: [...memory.got, `no:${event.why}`] }) }],
      Unsure: [{}],
    }),
  },
  memory: { initial: ec.slot("memory.initial", () => ({ got: [] as string[] })) },
};
export const eachWriteFixture: Fixture = {
  id: EW,
  make: (api) => ({
    id: EW,
    root: "root",
    default: "root",
    fragments: { Copy },
    nodes: {
      root: {
        ...ew.node("root"),
        placements: [{ name: "c", fragment: "Copy", each: { of: "ids", max: 8 } }],
      },
    },
    memory: ew.memory(() => ({ ids: ["x", "y"] })),
    ops: {
      put: {
        id: "put",
        contract: "lab/put",
        kind: "write",
        fragment: "Copy",
        key: ew.key("put", (i: any) => ({ k: i.k })),
        concurrency: "serialize",
        commit: (input, { attempt }) =>
          api.call("put", input, { idempotencyKey: attempt.id }) as Effect.Effect<unknown, unknown>,
        outcomes: {
          success: { event: "Ok" },
          failure: { NotSent: ew.mapped("put", "failure", "No", (v) => ({ why: v.why })) },
          unknown: { event: "Unsure" },
        },
      },
    },
    persisted: false,
    uses: [],
  }),
};

// ── Rule 15 in step 3: a late ending's filling may not leave what the host's state still owns.
const LF = "Lab/LateFill";
const lf = fixtureOf(LF);
const lk = fixtureOf("Kid");
const Kid: Fragment = {
  id: "Kid",
  root: "root",
  default: "A",
  nodes: {
    root: lk.node("root", {
      Done: [{ exit: { name: "Finished" } }],
      Failed: [{}],
      Unsure: [{}],
    }),
    A: lk.node("A", {
      Go: [
        {
          members: (p) => [
            { op: "kidPut", verb: "commit", input: lk.slot(`${p}.actions[0]`, () => ({})) },
          ],
        },
      ],
      Move: [{ target: "B" }],
    }),
    B: lk.node("B"),
  },
  memory: { initial: lk.slot("memory.initial", () => ({})) },
};
const plainWrite = (api: Api, id: string, event: string, fragment?: string): Op => ({
  id,
  contract: `lab/${id}`,
  kind: "write",
  ...(fragment ? { fragment } : {}),
  key: lf.key(id, () => ({})),
  concurrency: "reject",
  commit: (input, { attempt }) =>
    api.call(id, input, { idempotencyKey: attempt.id }) as Effect.Effect<unknown, unknown>,
  outcomes: {
    success: { event },
    failure: { NotSent: { event: "Failed" } },
    unknown: { event: "Unsure" },
  },
});
export const lateFillFixture: Fixture = {
  id: LF,
  make: (api) => ({
    id: LF,
    root: "root",
    default: "HOST",
    fragments: { Kid },
    nodes: {
      root: lf.node("root", {
        Failed: [{}],
        Unsure: [{}],
        HostDone: [{}],
      }),
      HOST: {
        ...lf.node("HOST", {
          HostGo: [{ members: lf.commit("hostPut", () => ({})) }],
        }),
        placements: [
          {
            name: "kid",
            fragment: "Kid",
            exits: {
              Finished: lf.alts("states.HOST.traits.kid.exits.Finished", [{ target: "OTHER" }]),
            },
          },
        ],
      },
      OTHER: lf.node("OTHER"),
    },
    memory: lf.memory(() => ({})),
    ops: {
      hostPut: plainWrite(api, "hostPut", "HostDone"),
      kidPut: plainWrite(api, "kidPut", "Done", "Kid"),
    },
    persisted: false,
    uses: [],
  }),
};
void deny;
void Stream;

// ── A trait's write on the store, persisted: the crossing least tried (review, method step 2). `shape` chooses what the server's
// response says: a row with a revision, a row with no version declared, or nothing (204).
export type StoreShape = "row" | "noVersion" | "nothing";
const TS = "Lab/TraitStore";
export const thingRef = "Thing|a";
const ts = fixtureOf(TS);
const tk = fixtureOf("TS");
const TStore: Fragment = {
  id: "TS",
  root: "root",
  default: "root",
  nodes: {
    root: tk.node("root", {
      Go: [
        {
          members: (p) => [
            { op: "put", verb: "commit", input: tk.slot(`${p}.actions[0]`, ({ event }: any) => ({ v: event.v })) },
          ],
        },
      ],
      Resend: [{ members: (p) => [{ op: "put", verb: "retry", key: tk.slot(`${p}.actions[0].key`, () => ({})) }] }],
      GiveUp: [{ members: (p) => [{ op: "put", verb: "cancel", key: tk.slot(`${p}.actions[0].key`, () => ({})) }] }],
      Fetch: [{ members: (p) => [{ op: "fetch", verb: "lookup", input: tk.slot(`${p}.actions[0]`, () => ({})) }] }],
      Fetched: [{}],
      Ok: [{}],
      No: [{}],
      Unsure: [{}],
    }),
  },
  memory: { initial: tk.slot("memory.initial", () => ({})) },
};
export const traitStoreFixture = (shape: StoreShape): Fixture => ({
  id: TS,
  server: {
    init: () => ({ thing: { id: "a", v: 0, revision: 1 } }),
    apply: (_op, i, s) => {
      const thing = { ...s.thing, v: i.v, revision: s.thing.revision + 1 };
      return { s: { thing }, ...(shape === "nothing" ? {} : { value: thing }) };
    },
    read: (_op, _i, s) => s.thing,
  },
  make: (api) => ({
    id: TS,
    root: "root",
    default: "TAB",
    fragments: { TS: TStore },
    nodes: {
      root: ts.node("root", { Away: [{ target: "AWAY" }], Back: [{ target: "TAB" }] }),
      TAB: { ...ts.node("TAB"), placements: [{ name: "t", fragment: "TS", resumable: true }] },
      AWAY: ts.node("AWAY"),
    },
    memory: ts.memory(() => ({})),
    ops: {
      put: {
        id: "put",
        contract: "lab/put",
        kind: "write",
        fragment: "TS",
        key: ts.key("put", () => ({})),
        concurrency: "serialize",
        commit: (input, { attempt }) =>
          api.call("put", input, { idempotencyKey: attempt.id }).pipe(unknownWhenLost) as Effect.Effect<
            unknown,
            unknown
          >,
        outcomes: {
          success: { event: "Ok" },
          failure: { Refused: { event: "No" }, NotSent: { event: "No" } },
          unknown: { event: "Unsure" },
        },
      },
      fetch: {
        id: "fetch",
        contract: "lab/fetch",
        kind: "read",
        fragment: "TS",
        key: ts.key("fetch", () => ({})),
        concurrency: "reject",
        commit: (i) => api.call("fetch", i) as Effect.Effect<unknown, unknown>,
        outcomes: {
          success: { event: "Fetched" },
          failure: { NoResponse: { event: "Fetched" }, Defect: { event: "Fetched" }, Interrupted: { event: "Fetched" } },
        },
      },
    },
    persisted: true,
    uses: ["entities"],
    domain: {
      writes: {
        put: {
          predicts: ts.slot("domain.put.predicts", (i: any) => [{ ref: thingRef, patch: { v: i.v } }]),
          ...(shape === "nothing" ? {} : { confirms: (row: any) => [{ ref: thingRef, fields: row }] }),
        },
      },
      reads: { fetch: (row: any) => [{ ref: thingRef, fields: row }] },
      repair: () => api.call("repair", {}) as Effect.Effect<any, any, never>,
      ...(shape === "noVersion" ? {} : { version: () => "revision" }),
    },
  }),
});

// ── Review M2: a callback's patch moves an `.each` placement's reset value, so the reset is a pending one.
const ER = "Lab/EachReset";
const er = fixtureOf(ER);
const ek = fixtureOf("Item");
const Item: Fragment = {
  id: "Item",
  root: "root",
  default: "root",
  nodes: { root: ek.node("root", { Bump: [{ notify: [{ name: "Bumped" }] }] }) },
  memory: { initial: ek.slot("memory.initial", () => ({ fresh: true })) },
};
export const eachResetFixture: Fixture = {
  id: ER,
  make: () => ({
    id: ER,
    root: "root",
    default: "root",
    fragments: { Item },
    nodes: {
      root: {
        ...er.node("root"),
        placements: [
          {
            name: "c",
            fragment: "Item",
            each: { of: "ids", max: 8 },
            resetOn: er.slot("traits.c.resetOn", ({ memory }: any) => memory.v),
            callbacks: {
              Bumped: er.alts("traits.c.callbacks.Bumped", [
                { patch: ({ memory }: any) => ({ v: memory.v + 1 }) },
              ]),
            },
          },
        ],
      },
    },
    memory: er.memory(() => ({ ids: ["x", "y"], v: 0 })),
    ops: {},
    persisted: false,
    uses: [],
  }),
};
