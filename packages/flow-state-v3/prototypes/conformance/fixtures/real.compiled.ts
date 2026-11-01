// Round 4 (review H7): compiled data copied from the real files as written, not flattened to what the runtime does. Sources, each
// line a real path under workflow/plans/flow/references/: checkout/features/Pay/address.subroutine.ts and pay.machine.ts's ADDRESS;
// dispatch-desk/features/Resolve/resolve-wizard.subroutine.ts and confirm-discard.subroutine.ts; dispatch-desk/features/Attachments/
// upload.trait.ts; dispatch-desk/features/Tickets/panels/panels.machine.ts and history.trait.ts. Still left out, stated per fixture.
import { Effect } from "effect";
import type { Api, ServerModel } from "../fake-world.ts";
import type { Fixture } from "../harness.ts";
import { fixtureOf, unknownWhenLost } from "./build.ts";
import { deny, type Compiled, type Fragment, type Node, type Op, type ScheduleSpec } from "./compiled.ts";

type NodeSpec = {
  parent?: string;
  default?: string;
  on?: any;
  schedules?: readonly ScheduleSpec[];
  placements?: any;
  subroutine?: any;
};
const tree = (D: string, base: string, spec: Record<string, NodeSpec>) => {
  const f = fixtureOf(D);
  return Object.fromEntries(
    Object.entries(spec).map(([id, s]): [string, Node] => {
      const n = f.node(id, {}, s.schedules ?? []);
      const parent = s.parent ?? (id === "root" ? undefined : "root");
      return [
        id,
        {
          ...n,
          on: f.on(id === "root" ? base : `${base}states.${id}`, s.on ?? {}),
          ...(parent ? { parent } : {}),
          ...(s.default ? { default: s.default } : {}),
          ...(s.placements ? { placements: s.placements } : {}),
          ...(s.subroutine ? { subroutine: s.subroutine } : {}),
        },
      ];
    }),
  );
};
const write = (api: Api, id: string, extra: Partial<Op> & Pick<Op, "key" | "concurrency" | "outcomes">): Op => ({
  id,
  contract: `real/${id}`,
  kind: "write",
  commit: (input, { attempt }) =>
    api.call(id, input, { idempotencyKey: attempt.id }).pipe(unknownWhenLost) as Effect.Effect<unknown, unknown>,
  ...extra,
});

// ── AddressStep, as written: nested FORM, `.history`, an exit, whenAbandoned. Its host: pay.machine.ts's ADDRESS, with only the
// `summary` raise replaced by a memory write (order-summary is FRAG-09's business).
const A = fixtureOf("AddressStep");
const H = fixtureOf("Checkout/Addr");
export const emptyAddress = { name: "", street: "", postcode: "" };
const AddressStep: Fragment = {
  id: "AddressStep",
  root: "root",
  default: "FORM",
  nodes: tree("AddressStep", "", {
    root: {
      on: {
        Changed: [{ patch: ({ event }: any) => ({ address: event.address }) }],
        Help: [{ target: "POSTCODE_HELP" }],
      },
    },
    FORM: { default: "NAME" },
    NAME: {
      parent: "FORM",
      on: {
        Next: [
          {
            target: "STREET",
            guards: [({ memory }: any) => memory.address.name.trim() !== "" || deny("NoName")],
          },
        ],
      },
    },
    STREET: { parent: "FORM", on: { Next: [{ target: "POSTCODE" }], Back: [{ target: "NAME" }] } },
    POSTCODE: {
      parent: "FORM",
      on: {
        Back: [{ target: "STREET" }],
        Changed: [
          {
            patch: ({ event }: any) => ({ address: event.address }),
            notify: [
              {
                name: "onPostcode",
                from: A.slot("states.POSTCODE.on.Changed.notify", ({ event }: any) => ({
                  postcode: event.address.postcode,
                })),
              },
            ],
          },
        ],
        Confirm: [
          {
            guards: [({ memory }: any) => /^[A-Z0-9 ]{5,8}$/.test(memory.address.postcode) || deny("BadPostcode")],
            exit: {
              name: "Done",
              from: A.slot("states.POSTCODE.on.Confirm.exit", ({ memory }: any) => ({ address: memory.address })),
            },
          },
        ],
      },
    },
    POSTCODE_HELP: { on: { CloseHelp: [{ target: "FORM", history: true }] } },
  }),
  memory: { initial: A.slot("memory.initial", (i: any) => ({ address: i.address })) },
  whenAbandoned: {
    notify: [
      {
        name: "onDraft",
        from: A.slot("whenAbandoned.onDraft", ({ memory }: any) => ({ address: memory.address })),
      },
    ],
  },
};
export const addressFixture: Fixture = {
  id: "Checkout/Addr",
  make: (): Compiled => ({
    id: "Checkout/Addr",
    root: "root",
    default: "IDLE",
    fragments: { AddressStep },
    nodes: tree("Checkout/Addr", "", {
      root: { on: { Leave: [{ target: "LEFT" }], Go: [{ target: "ADDRESS" }] } },
      IDLE: {},
      LEFT: {},
      CARD: {},
      ADDRESS: {
        subroutine: {
          name: "ADDRESS",
          fragment: "AddressStep",
          input: H.slot("states.ADDRESS.input", ({ memory }: any) => ({ address: memory.addressDraft })),
          callbacks: {
            onPostcode: H.alts("states.ADDRESS.callbacks.onPostcode", [
              { patch: ({ memory, event }: any) => ({ quotes: [...memory.quotes, event.postcode] }) },
            ]),
            onDraft: H.alts("states.ADDRESS.callbacks.onDraft", [
              { patch: ({ event }: any) => ({ addressDraft: event.address }) },
            ]),
          },
          exits: {
            Done: H.alts("states.ADDRESS.exits.Done", [
              {
                target: "CARD",
                patch: ({ event }: any) => ({ address: event.address, addressDraft: emptyAddress }),
              },
            ]),
          },
        },
      },
    }),
    memory: H.memory(() => ({ address: null, addressDraft: emptyAddress, quotes: [] as string[] })),
    ops: {},
    persisted: false,
    uses: [],
  }),
};

// ── Resolve's wizard shape: nested STEPS, a nested subroutine whose `Kept` targets `S.STEPS.history` and whose `Discarded` fills
// the wizard's own exit, whenAbandoned "Not on an exit". Left out: parts, signature, the guards port.
const W = fixtureOf("Wizard");
const CD = fixtureOf("ConfirmDiscard");
const T = fixtureOf("Desk/Ticket");
const ConfirmDiscard: Fragment = {
  id: "ConfirmDiscard",
  root: "root",
  default: "root",
  nodes: tree("ConfirmDiscard", "", {
    root: { on: { Keep: [{ exit: { name: "Kept" } }], Discard: [{ exit: { name: "Discarded" } }] } },
  }),
  memory: { initial: CD.slot("memory.initial", () => ({})) },
  whenAbandoned: { notify: [{ name: "onDialogGone" }] },
};
const Wizard: Fragment = {
  id: "Wizard",
  root: "root",
  default: "STEPS",
  nodes: tree("Wizard", "", {
    root: { on: { AskDiscard: [{ target: "DISCARD" }] } },
    STEPS: { default: "REASON" },
    REASON: {
      parent: "STEPS",
      on: {
        Next: [{ target: "PARTS", patch: ({ event }: any) => ({ reason: event.reason }) }],
      },
    },
    PARTS: {
      parent: "STEPS",
      on: {
        Back: [{ target: "REASON" }],
        Submit: [
          {
            exit: {
              name: "Resolved",
              from: W.slot("states.PARTS.on.Submit.exit", ({ memory }: any) => ({ reason: memory.reason })),
            },
          },
        ],
      },
    },
    DISCARD: {
      subroutine: {
        name: "DISCARD",
        fragment: "ConfirmDiscard",
        callbacks: {
          onDialogGone: W.alts("states.DISCARD.callbacks.onDialogGone", [
            { patch: ({ memory }: any) => ({ dialogGone: memory.dialogGone + 1 }) },
          ]),
        },
        exits: {
          Kept: W.alts("states.DISCARD.exits.Kept", [{ target: "STEPS", history: true }]),
          Discarded: W.alts("states.DISCARD.exits.Discarded", [
            {
              exit: {
                name: "Abandoned",
                from: W.slot("states.DISCARD.exits.Discarded.exit", ({ memory }: any) => ({ reason: memory.reason })),
              },
            },
          ]),
        },
      },
    },
  }),
  memory: { initial: W.slot("memory.initial", () => ({ reason: "", dialogGone: 0 })) },
  whenAbandoned: {
    notify: [
      { name: "onDraft", from: W.slot("whenAbandoned.onDraft", ({ memory }: any) => ({ reason: memory.reason })) },
    ],
  },
};
export const ticketFixture: Fixture = {
  id: "Desk/Ticket",
  make: (): Compiled => ({
    id: "Desk/Ticket",
    root: "root",
    default: "OPEN",
    fragments: { Wizard, ConfirmDiscard },
    nodes: tree("Desk/Ticket", "", {
      root: { on: { Close: [{ target: "CLOSED" }], Resolve: [{ target: "RESOLVING" }] } },
      OPEN: {},
      CLOSED: {},
      RESOLVED: {},
      RESOLVING: {
        subroutine: {
          name: "wizard",
          fragment: "Wizard",
          callbacks: {
            onDraft: T.alts("states.RESOLVING.callbacks.onDraft", [
              { patch: ({ memory, event }: any) => ({ drafts: [...memory.drafts, event.reason] }) },
            ]),
          },
          exits: {
            Resolved: T.alts("states.RESOLVING.exits.Resolved", [
              { target: "RESOLVED", patch: ({ event }: any) => ({ resolved: event.reason }) },
            ]),
            Abandoned: T.alts("states.RESOLVING.exits.Abandoned", [
              { target: "OPEN", patch: ({ event }: any) => ({ discarded: event.reason }) },
            ]),
          },
        },
      },
    }),
    memory: T.memory(() => ({ drafts: [] as string[], resolved: null, discarded: null })),
    ops: {},
    persisted: false,
    uses: [],
  }),
};

// ── AttachmentUpload, as written: `by: "ref"`, `item`, by-reason `unknown`, `resend` with `disarmOn`, `Lost`, whenAbandoned.
// Left out: progress, and the bytes (PendingFiles). `attachDomain` adds the store, so a persisted host has entities.
const U = fixtureOf("AttachmentUpload");
const E = fixtureOf("Desk/Attach");
export const MAX_RESENDS = 3;
const own = ({ memory }: any) => ({ ref: memory.ref });
const failedNotify = (problem: string) => [
  { name: "onFailed", from: U.slot(`notify.onFailed.${problem}`, ({ memory }: any) => ({ ref: memory.ref, problem })) },
];
const AttachmentUpload: Fragment = {
  id: "AttachmentUpload",
  root: "root",
  default: "root",
  nodes: tree("AttachmentUpload", "", {
    root: {
      schedules: [
        { id: "start", send: "StartDue", schedule: { ms: 0 }, armOn: ["entry"], disarmOn: [] },
        {
          id: "resend",
          send: "ResendDue",
          schedule: { ms: 3000 },
          armOn: ["Unsure"],
          disarmOn: ["Cancel", "Stored", "Gone", "TooBig", "Stopped", "Lost"],
        },
      ],
      on: {
        StartDue: [
          {
            guards: [({ memory }: any) => memory.status === "queued" || deny("NotQueued")],
            tokens: [{ op: "put", verb: "idle", key: U.slot("on.StartDue[0].guard[1]", own) }],
            patch: () => ({ status: "sending" }),
            members: U.commit("put", ({ memory }: any) => ({ ref: memory.ref })),
          },
          {},
        ],
        Cancel: [
          {
            guards: [
              ({ memory }: any) =>
                ["queued", "sending", "unsure"].includes(memory.status) || deny("NothingToCancel"),
            ],
            patch: () => ({ status: "stopped" }),
            members: U.member("put", "cancel", own),
          },
        ],
        Stopped: [{ members: U.member("put", "cancel") }],
        Lost: [
          {
            patch: () => ({ status: "failed", problem: "FileGone" }),
            members: U.member("put", "cancel"),
            notify: failedNotify("FileGone"),
          },
        ],
        NotSent: [{}],
        Unsure: [{ patch: () => ({ status: "unsure" }) }],
        ResendDue: [
          {
            tokens: [
              { op: "put", verb: "retryable", times: MAX_RESENDS, key: U.slot("on.ResendDue[0].guard[0]", own) },
            ],
            patch: () => ({ status: "sending" }),
            members: U.member("put", "retry", own),
          },
          {
            patch: () => ({ status: "failed", problem: "GaveUp" }),
            members: U.member("put", "cancel", own),
            notify: failedNotify("GaveUp"),
          },
        ],
        Stored: [
          {
            patch: ({ event }: any) => ({ status: "stored", url: event.url }),
            notify: [
              {
                name: "onStored",
                from: U.slot("on.Stored.notify", ({ memory, event }: any) => ({ ref: memory.ref, url: event.url })),
              },
            ],
          },
        ],
        TooBig: [
          {
            patch: ({ event }: any) => ({ status: "failed", problem: "TooLarge", limit: event.limit }),
            notify: failedNotify("TooLarge"),
          },
        ],
        Gone: [{ patch: () => ({ status: "failed", problem: "FileGone" }), notify: failedNotify("FileGone") }],
      },
    },
  }),
  memory: {
    initial: U.slot("memory.initial", (i: any) => ({
      ref: i.ref,
      name: i.name,
      status: "queued",
      url: null,
      problem: null,
      limit: null,
    })),
  },
  whenAbandoned: { release: ["put"] },
};
const MarkT: Fragment = {
  id: "MarkT",
  root: "root",
  default: "root",
  nodes: tree("MarkT", "", { root: {} }),
  memory: { initial: U.slot("mark.memory.initial", () => ({})) },
};
const putOp = (api: Api, omit: readonly string[] = []): Op =>
  write(api, "put", {
    fragment: "AttachmentUpload",
    key: E.key("put", (i) => ({ ref: i.ref })),
    concurrency: "reject",
    outcomes: {
      success: E.mapped("put", "success", "Stored", (v) => ({ url: v?.url ?? "u" })),
      failure: {
        TooLarge: E.mapped("put", "failure.TooLarge", "TooBig", (r) => ({ limit: r.limit })),
        FileGone: { event: "Gone" },
        NotSent: { event: "NotSent" },
      },
      unknown: {
        byReason: Object.fromEntries(
          Object.entries({
            Cancelled: "Stopped",
            NoResponse: "Unsure",
            ServerError: "Unsure",
            Restored: "Lost",
            Interrupted: "Unsure",
            Defect: "Unsure",
            StillUnknown: "Unsure",
            StorageRefused: "Unsure",
          })
            .filter(([r]) => !omit.includes(r))
            .map(([r, event]) => [r, { event }]),
        ),
      },
    },
  });
const attachMake =
  (omit: readonly string[], store: boolean) =>
  (api: Api): Compiled => ({
    id: "Desk/Attach",
    root: "root",
    default: "EDIT",
    fragments: { AttachmentUpload, MarkT },
    nodes: tree("Desk/Attach", "", {
      root: {
        on: {
          SetFiles: [{ patch: ({ event }: any) => ({ attachments: event.attachments }) }],
          SetSubject: [{ patch: ({ event }: any) => ({ subject: event.subject }) }],
          Touch: [{ patch: ({ memory }: any) => ({ touched: memory.touched + 1 }) }],
        },
        placements: [
          {
            name: "uploads",
            fragment: "AttachmentUpload",
            each: { of: "attachments", by: "ref", max: 10 },
            input: E.slot("traits.uploads.input", ({ item }: any) => ({ ref: item.ref, name: item.name })),
            callbacks: {
              onStored: E.alts("traits.uploads.callbacks.onStored", [
                { patch: ({ memory, event }: any) => ({ stored: [...memory.stored, event.ref] }) },
              ]),
              onFailed: E.alts("traits.uploads.callbacks.onFailed", [
                { patch: ({ memory, event }: any) => ({ failed: [...memory.failed, [event.ref, event.problem]] }) },
              ]),
            },
          },
          // A plain `resetOn`, so a user's value reaches a reset (D57).
          {
            name: "mark",
            fragment: "MarkT",
            resetOn: E.slot("traits.mark.resetOn", ({ memory }: any) => memory.subject),
          },
        ],
      },
      EDIT: {},
    }),
    memory: E.memory(() => ({
      attachments: [] as unknown[],
      subject: "s1" as unknown,
      stored: [] as string[],
      failed: [] as unknown[],
      touched: 0,
    })),
    ops: { put: putOp(api, omit) },
    persisted: true,
    uses: store ? ["entities"] : [],
    ...(store
      ? {
          domain: {
            writes: {
              put: {
                predicts: E.slot("domain.put.predicts", (i: any) => [
                  { ref: `File|${i.ref}`, patch: { state: "stored" } },
                ]),
                confirms: (v: any, i: any) => [{ ref: `File|${i.ref}`, fields: { state: "stored", url: v?.url ?? "u" } }],
              },
            },
            reads: {},
            repair: (ref: string) => api.call("repair", { ref }) as Effect.Effect<any, any, never>,
          },
        }
      : {}),
  });
const attachServer: ServerModel = {
  init: () => ({ uploads: [] as string[] }),
  apply: (_op, i, s) => ({ s: { uploads: [...s.uploads, i.ref] }, value: { url: `u/${i.ref}` } }),
  read: (_op, i, s) => {
    const ref = i.ref.slice("File|".length);
    return s.uploads.includes(ref) ? { state: "stored", url: `u/${ref}` } : null;
  },
};
export const attachFixture: Fixture = { id: "Desk/Attach", make: attachMake([], false), server: attachServer };
export const attachDomainFixture: Fixture = { id: "Desk/Attach", make: attachMake([], true), server: attachServer };
export const attachMissingReason: Fixture = {
  id: "Desk/Attach",
  make: attachMake(["StillUnknown"], false),
  server: attachServer,
};

// ── History under Panels, as written: resumable + resetOn on a tab node; a lookup a freeze cuts; a write that outlives it; a
// raise from the host. Left out: `latest` (a live read, round 5), and customer and parts, which are plain tabs here.
const Hi = fixtureOf("History");
const Pa = fixtureOf("Desk/Panels");
const ticket = ({ memory }: any) => ({ ticketId: memory.ticketId });
const look = Hi.lookup("earlier", ({ memory }: any) => ({ ticketId: memory.ticketId, page: memory.earlier.length }));
const History: Fragment = {
  id: "History",
  root: "root",
  default: "root",
  nodes: tree("History", "", {
    root: {
      on: {
        LoadEarlier: [{ members: look }],
        EarlierLoaded: [{ patch: ({ memory, event }: any) => ({ earlier: [...memory.earlier, event.entry] }) }],
        EarlierCut: [{ patch: ({ memory }: any) => ({ cuts: memory.cuts + 1 }), members: look }],
        Highlight: [{ patch: ({ event }: any) => ({ highlighted: event.entryId }) }],
        Pin: [
          {
            tokens: [
              {
                op: "pin",
                verb: "idle",
                // Written by hand, in another order than the contract's key: one lane all the same (D57).
                key: Hi.slot("on.Pin[0].guard[0]", ({ memory, event }: any) => ({
                  entryId: event.entryId,
                  ...ticket({ memory }),
                })),
              },
            ],
            members: Hi.commit("pin", ({ memory, event }: any) => ({
              ...ticket({ memory }),
              entryId: event.entryId,
              pinned: event.pinned,
            })),
          },
        ],
        Pinned: [{ patch: ({ memory, event }: any) => ({ pins: [...memory.pins, event.entryId] }) }],
        PinFailed: [{}],
        PinUnsure: [
          { tokens: [{ op: "pin", verb: "retryable", times: 2 }], members: Hi.member("pin", "retry") },
          { members: Hi.member("pin", "cancel") },
        ],
      },
    },
  }),
  memory: {
    initial: Hi.slot("memory.initial", (i: any) => ({
      ticketId: i.ticketId,
      earlier: [] as string[],
      cuts: 0,
      highlighted: null,
      pins: [] as string[],
    })),
  },
  whenAbandoned: {
    notify: [{ name: "onGone", from: Hi.slot("whenAbandoned.onGone", ({ memory }: any) => ({ ticketId: memory.ticketId })) }],
  },
};
const panelsMake = (api: Api): Compiled => ({
  id: "Desk/Panels",
  root: "root",
  default: "TABS",
  fragments: { History },
  nodes: tree("Desk/Panels", "", {
    root: {
      on: {
        ShowTicket: [{ patch: ({ event }: any) => ({ ticketId: event.ticketId }) }],
      },
    },
    TABS: {
      default: "HISTORY",
      on: {
        OpenTab: [
          { target: "HISTORY", guards: [({ event }: any) => event.tab === "history" || deny("OtherTab")] },
          { target: "CUSTOMER", guards: [({ event }: any) => event.tab === "customer" || deny("OtherTab")] },
          { target: "PARTS" },
        ],
      },
    },
    HISTORY: {
      parent: "TABS",
      placements: [
        {
          name: "history",
          fragment: "History",
          resumable: true,
          input: Pa.slot("states.TABS.states.HISTORY.traits.history.input", ({ memory }: any) => ({
            ticketId: memory.ticketId,
          })),
          resetOn: Pa.slot("states.TABS.states.HISTORY.traits.history.resetOn", ({ memory }: any) => memory.ticketId),
          callbacks: {
            onGone: Pa.alts("states.TABS.states.HISTORY.traits.history.callbacks.onGone", [
              { patch: ({ memory, event }: any) => ({ goneFor: [...memory.goneFor, event.ticketId] }) },
            ]),
          },
        },
      ],
      on: {
        ShowEntry: [
          {
            raises: [
              {
                to: "history",
                event: "Highlight",
                from: Pa.slot("states.TABS.states.HISTORY.on.ShowEntry.raise", ({ event }: any) => ({
                  entryId: event.entryId,
                })),
              },
            ],
          },
        ],
      },
    },
    CUSTOMER: { parent: "TABS" },
    PARTS: { parent: "TABS" },
  }),
  memory: Pa.memory(() => ({ ticketId: "T-1", goneFor: [] as string[] })),
  ops: {
    earlier: {
      id: "earlier",
      contract: "real/historyOf",
      kind: "read",
      fragment: "History",
      key: Pa.key("earlier", (i) => ({ ticketId: i.ticketId })),
      concurrency: "reject",
      commit: (i) => api.call("earlier", i) as Effect.Effect<unknown, unknown>,
      outcomes: {
        success: Pa.mapped("earlier", "success", "EarlierLoaded", (v) => ({ entry: v?.entry ?? "e" })),
        failure: {
          NoResponse: { event: "EarlierCut" },
          Defect: { event: "EarlierCut" },
          Interrupted: { event: "EarlierCut" },
        },
      },
    },
    pin: write(api, "pin", {
      fragment: "History",
      key: Pa.key("pin", (i) => ({ ticketId: i.ticketId, entryId: i.entryId })),
      concurrency: "reject",
      outcomes: {
        success: Pa.mapped("pin", "success", "Pinned", (_v, c) => ({ entryId: c.key.entryId })),
        failure: { NotSent: { event: "PinFailed" } },
        unknown: { event: "PinUnsure" },
      },
    }),
  },
  persisted: true,
  uses: [],
});
export const panelsFixture: Fixture = { id: "Desk/Panels", make: panelsMake };

// ── Deep: review's probes, as data. A late ending at depth (r14); a raise then leave (rule 6's pre-turn read); a resumable under a
// resumable (M2); a frozen `.each` (M3, rule 60); a schedule that always throws once (M5). Small on purpose.
const D = fixtureOf("Deep");
const Ch = fixtureOf("Ch");
const Mid = fixtureOf("Mid");
const Row = fixtureOf("RowT");
const ChT: Fragment = {
  id: "ChT",
  root: "root",
  default: "root",
  nodes: tree("ChT", "", {
    root: {
      schedules: [{ id: "due", send: "Due", schedule: { ms: 5000 }, armOn: ["entry"], disarmOn: [] }],
      on: { Due: [{ patch: ({ memory }: any) => ({ due: memory.due + 1 }) }] },
    },
  }),
  memory: { initial: Ch.slot("memory.initial", () => ({ due: 0 })) },
};
const MidT: Fragment = {
  id: "MidT",
  root: "root",
  default: "X",
  nodes: tree("MidT", "", {
    root: { on: { ToX: [{ target: "X" }], ToY: [{ target: "Y" }] } },
    X: { placements: [{ name: "ch", fragment: "ChT", resumable: true }] },
    Y: {},
  }),
  memory: { initial: Mid.slot("memory.initial", () => ({})) },
};
const RowT: Fragment = {
  id: "RowT",
  root: "root",
  default: "root",
  nodes: tree("RowT", "", {
    root: {
      on: {
        Sync: [{ members: Row.lookup("rowRead", ({ memory }: any) => ({ key: memory.key })) }],
        Read: [{}],
        ReadFailed: [{ patch: ({ event }: any) => ({ why: event.why }) }],
        Send: [{ members: Row.commit("rowPut", ({ memory }: any) => ({ key: memory.key })) }],
        Put: [{ patch: () => ({ put: true }) }],
        PutNo: [{}],
        PutUnsure: [{}],
      },
    },
  }),
  memory: { initial: Row.slot("memory.initial", () => ({ why: null, put: false })) },
  whenAbandoned: { release: ["rowPut"] },
};
const FieldT: Fragment = {
  id: "FieldT",
  root: "root",
  default: "root",
  nodes: tree("FieldT", "", {
    root: {
      on: {
        Typed: [
          {
            patch: ({ event }: any) => ({ value: event.value }),
            notify: [{ name: "onTyped", from: fixtureOf("FieldT").slot("on.Typed.notify", ({ event }: any) => ({ value: event.value })) }],
          },
        ],
      },
    },
  }),
  memory: { initial: fixtureOf("FieldT").slot("memory.initial", () => ({ value: "old" })) },
  whenAbandoned: {
    notify: [{ name: "onGone", from: fixtureOf("FieldT").slot("whenAbandoned.onGone", ({ memory }: any) => ({ value: memory.value })) }],
  },
};
const deepMake = (api: Api): Compiled => ({
  id: "Deep",
  root: "root",
  default: "A",
  fragments: { ChT, MidT, RowT, FieldT },
  nodes: tree("Deep", "", {
    root: {
      on: {
        Done: [{ patch: () => ({ at: "root" }) }],
        Failed: [{}],
        Unsure: [{}],
        Far: [{ target: "FAR" }],
        Near: [{ target: "A" }],
        SetRows: [{ patch: ({ event }: any) => ({ rows: event.rows }) }],
        Away: [{ target: "AWAY" }],
        Back: [{ target: "HERE" }],
        Mid: [{ target: "MID" }],
        Poke: [{ patch: ({ memory }: any) => ({ pokes: memory.pokes + 1 }) }],
        OddEntry: [{ target: "BADMS" }],
      },
    },
    A: {
      default: "B",
      on: { Done: [{ patch: () => ({ at: "A" }) }], ToC: [{ target: "C" }] },
    },
    B: { parent: "A", on: { Run: [{ members: D.commit("job", () => ({ n: 1 })) }] } },
    C: { parent: "A" },
    FAR: {},
    // Rule 6: a part writes the trait's memory, in the turn that leaves it.
    FIELD: {
      placements: [
        {
          name: "field",
          fragment: "FieldT",
          callbacks: {
            onTyped: D.alts("states.FIELD.traits.field.callbacks.onTyped", [{}]),
            onGone: D.alts("states.FIELD.traits.field.callbacks.onGone", [
              { patch: ({ event }: any) => ({ gone: event.value }) },
            ]),
          },
        },
      ],
      on: {
        TypeAndLeave: [
          {
            target: "FAR",
            raises: [
              { to: "field", event: "Typed", from: D.slot("states.FIELD.on.TypeAndLeave.raise", () => ({ value: "late" })) },
            ],
          },
        ],
      },
    },
    MID: { placements: [{ name: "mid", fragment: "MidT", resumable: true }] },
    AWAY: {},
    HERE: {
      placements: [
        { name: "rows", fragment: "RowT", resumable: true, each: { of: "rows", max: 4 } },
        { name: "once", fragment: "RowT" },
      ],
    },
    // A firing whose handler throws once (M5): GiveUp is the only way out, as EXPIRED's is.
    WAIT: {
      schedules: [{ id: "giveUp", send: "GiveUp", schedule: { ms: 1000 }, armOn: ["entry"], disarmOn: [] }],
      on: { GiveUp: [{ target: "FAR", guards: [({ memory }: any) => memory.pokes >= 0 || deny("Never")] }] },
    },
    // A schedule whose length is a user's value (D57).
    BADMS: {
      schedules: [
        {
          id: "bad",
          send: "Poke",
          schedule: D.slot("states.BADMS.schedules.bad", () => Number.NaN),
          armOn: ["entry"],
          disarmOn: [],
        },
      ],
    },
  }),
  memory: D.memory(() => ({ at: null, gone: null, rows: [] as string[], pokes: 0 })),
  ops: {
    job: write(api, "job", {
      key: D.key("job", () => ({})),
      concurrency: "reject",
      outcomes: { success: { event: "Done" }, failure: { NotSent: { event: "Failed" } }, unknown: { event: "Unsure" } },
    }),
    rowRead: {
      id: "rowRead",
      contract: "real/rowRead",
      kind: "read",
      fragment: "RowT",
      key: D.key("rowRead", (i) => ({ key: i.key })),
      concurrency: "reject",
      commit: (i) => api.call("rowRead", i) as Effect.Effect<unknown, unknown>,
      outcomes: {
        success: { event: "Read" },
        failure: {
          NoResponse: D.mapped("rowRead", "failure", "ReadFailed", () => ({ why: "NoResponse" })),
          Defect: D.mapped("rowRead", "failure", "ReadFailed", () => ({ why: "Defect" })),
          Interrupted: D.mapped("rowRead", "failure", "ReadFailed", () => ({ why: "Interrupted" })),
        },
      },
    },
    rowPut: write(api, "rowPut", {
      fragment: "RowT",
      key: D.key("rowPut", (i) => ({ key: i.key })),
      concurrency: "reject",
      outcomes: { success: { event: "Put" }, failure: { NotSent: { event: "PutNo" } }, unknown: { event: "PutUnsure" } },
    }),
  },
  persisted: false,
  uses: [],
});
export const deepFixture: Fixture = { id: "Deep", make: deepMake };
// The states the fixture starts in differ only by `default`, so each scenario enters what it needs.
export const deepAt = (state: string): Fixture => ({
  id: "Deep",
  make: (api) => ({ ...deepMake(api), default: state }),
});
