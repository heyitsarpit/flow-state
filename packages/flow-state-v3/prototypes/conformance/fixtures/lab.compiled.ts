// Small machines for round 3's rules. Each cites the design or a desk fragment it is cut from; none is a whole feature.
// The Field and Autosave traits are machine-design 2.9.6 and 3.3; `uploads` is desk Attachments/upload.trait.ts, flattened
// (no resend schedule); `tail` is 2.9.6's catch-up trait (rule 52).
import { Effect } from "effect";
import type { Fixture } from "../harness.ts";
import type { Api, ServerModel } from "../fake-world.ts";
import { deny, type Compiled, type Fragment, type Node, type Op } from "./compiled.ts";
import { fixtureOf, unknownWhenLost } from "./build.ts";
import { issuesFixture } from "./issues.compiled.ts";
import { s1Fixture } from "./s1.compiled.ts";

const tree = (
  D: string,
  spec: Record<
    string,
    {
      parent?: string;
      default?: string;
      on?: any;
      schedules?: any;
      placements?: any;
      subroutine?: any;
    }
  >,
) => {
  const f = fixtureOf(D);
  return Object.fromEntries(
    Object.entries(spec).map(([id, s]) => {
      const n = f.node(id, s.on ?? {}, s.schedules ?? []);
      return [
        id,
        {
          ...n,
          ...(s.parent ? { parent: s.parent } : {}),
          ...(s.default ? { default: s.default } : {}),
          ...(s.placements ? { placements: s.placements } : {}),
          ...(s.subroutine ? { subroutine: s.subroutine } : {}),
        } as Node,
      ];
    }),
  );
};
const write = (
  api: Api,
  id: string,
  extra: Partial<Op> & Pick<Op, "key" | "concurrency" | "outcomes">,
): Op => ({
  id,
  contract: `lab/${id}`,
  kind: "write",
  commit: (input, { attempt }) =>
    api.call(id, input, { idempotencyKey: attempt.id }).pipe(unknownWhenLost) as Effect.Effect<
      unknown,
      unknown
    >,
  ...extra,
});

// ── Docs: a domain write owned by a state, so its ending can be late. Rule 15, rule 27, E13.
const docsD = fixtureOf("Docs");
const docRef = (id: string) => `Doc|${id}`;
export { docRef };
const docsMake = (api: Api): Compiled => ({
  id: "Docs",
  root: "root",
  default: "LIST",
  nodes: tree("Docs", {
    root: {
      on: {
        Open: [{ target: "DETAIL" }],
        Close: [{ target: "LIST" }],
        Saved: [
          { target: "LIST", patch: ({ memory }: any) => ({ lateSaved: memory.lateSaved + 1 }) },
        ],
        Touched: [{}],
        Unsure: [{}],
        Failed: [{}],
      },
    },
    LIST: {},
    DETAIL: {
      on: {
        Save: [
          { members: docsD.commit("save", ({ event }) => ({ id: event.id, title: event.title })) },
        ],
        Touch: [{ members: docsD.commit("touch", ({ event }) => ({ id: event.id })) }],
        Saved: [{ patch: ({ memory }: any) => ({ saved: memory.saved + 1 }) }],
      },
    },
  }),
  memory: docsD.memory(() => ({ saved: 0, lateSaved: 0 })),
  ops: {
    save: write(api, "save", {
      key: docsD.key("save", (i) => ({ id: i.id })),
      concurrency: "reject",
      outcomes: {
        success: { event: "Saved" },
        failure: { NotSent: { event: "Failed" }, Refused: { event: "Failed" } },
        unknown: { event: "Unsure" },
      },
    }),
    touch: write(api, "touch", {
      key: docsD.key("touch", (i) => ({ id: i.id })),
      concurrency: "reject",
      outcomes: {
        success: { event: "Touched" },
        failure: { NotSent: { event: "Failed" } },
        unknown: { event: "Unsure" },
      },
    }),
  },
  persisted: false,
  uses: ["entities"],
  domain: {
    writes: {
      save: {
        predicts: docsD.slot("domain.save.predicts", (i: any) => [
          { ref: docRef(i.id), patch: { title: i.title } },
        ]),
        confirms: (v, i) => [{ ref: docRef(i.id), fields: { title: v?.title ?? i.title } }],
      },
    },
    reads: {},
    repair: (ref) => api.call("repair", { ref }) as Effect.Effect<any, any, never>,
  },
});
const docsServer: ServerModel = {
  init: () => ({ docs: {} }),
  apply: (op, i, s) =>
    op === "save"
      ? { s: { docs: { ...s.docs, [i.id]: i.title } }, value: { title: i.title } }
      : { s, value: {} },
  read: (_op, i, s) => {
    const id = i.ref.split("|")[1];
    return s.docs[id] === undefined ? null : { title: s.docs[id] };
  },
};
export const docsFixture: Fixture = { id: "Docs", make: docsMake, server: docsServer };

// ── Form: traits with no operations. Field (3.3), a node trait with a schedule, `.each`, `resetOn`, whenAbandoned, callbacks.
const formD = fixtureOf("Form");
const fieldD = fixtureOf("Field");
const flashD = fixtureOf("Flash");
const oscD = fixtureOf("Osc");
const Field: Fragment = {
  id: "Field",
  root: "root",
  default: "root",
  nodes: tree("Field", {
    root: {
      on: {
        Changed: [
          {
            patch: ({ event }: any) => ({ value: event.value, touched: true }),
            notify: [
              {
                name: "onDirty",
                from: fieldD.slot("on.Changed.notify", ({ event }: any) => ({
                  value: event.value,
                })),
              },
            ],
          },
        ],
        Clear: [{ patch: () => ({ value: "" }) }],
        Refuse: [{ guards: [() => deny("Refused")] }],
      },
    },
  }),
  memory: {
    initial: fieldD.slot("memory.initial", (i: any) => ({ value: i?.value ?? "", touched: false })),
  },
  whenAbandoned: {
    notify: [
      {
        name: "onGone",
        from: fieldD.slot("whenAbandoned.onGone", ({ memory }: any) => ({
          value: memory.value,
          key: memory.key,
        })),
      },
    ],
  },
};
const Flash: Fragment = {
  id: "Flash",
  root: "root",
  default: "root",
  nodes: tree("Flash", {
    root: {
      on: { Expired: [{ notify: [{ name: "onExpired" }] }] },
      schedules: [
        { id: "expire", send: "Expired", schedule: { ms: 1000 }, armOn: ["entry"], disarmOn: [] },
      ],
    },
  }),
  memory: { initial: flashD.slot("memory.initial", () => ({ n: 0 })) },
};
// A whenAbandoned that writes what its own resetOn watches: rule 1's lag, and D35's bound.
const Osc: Fragment = {
  id: "Osc",
  root: "root",
  default: "root",
  nodes: tree("Osc", { root: {} }),
  memory: { initial: oscD.slot("memory.initial", () => ({})) },
  whenAbandoned: { notify: [{ name: "onGone" }] },
};
const fillGone = formD.alts("traits.check.callbacks.onGone", [
  { patch: ({ memory, event }: any) => ({ gone: [...memory.gone, event.value] }) },
]);
// A part that writes what resetOn watches: "subject:x" sets the subject, so a pending reset follows at commit (rule 1).
const fillDirty = formD.alts("traits.check.callbacks.onDirty", [
  {
    patch: ({ memory, event }: any) => ({
      dirty: [...memory.dirty, event.value],
      ...(event.value.startsWith("subject:") ? { subject: event.value.slice(8) } : {}),
    }),
  },
]);
const formMake = (): Compiled => ({
  id: "Form",
  root: "root",
  default: "EDIT",
  fragments: { Field, Flash, Osc },
  nodes: tree("Form", {
    root: {
      placements: [
        {
          name: "check",
          fragment: "Field",
          input: formD.slot("traits.check.input", ({ memory }: any) => ({ value: memory.subject })),
          resetOn: formD.slot("traits.check.resetOn", ({ memory }: any) => memory.subject),
          callbacks: { onDirty: fillDirty, onGone: fillGone },
        },
        {
          name: "rows",
          fragment: "Field",
          each: { of: "rowIds", max: 2 },
          input: formD.slot("traits.rows.input", ({ key }: any) => ({ value: `seed ${key}` })),
          callbacks: {
            onDirty: formD.alts("traits.rows.callbacks.onDirty", [{}]),
            onGone: formD.alts("traits.rows.callbacks.onGone", [
              {
                patch: ({ memory, event }: any) => ({ goneRows: [...memory.goneRows, event.key] }),
              },
            ]),
          },
        },
        {
          name: "osc",
          fragment: "Osc",
          resetOn: formD.slot("traits.osc.resetOn", ({ memory }: any) =>
            String(memory.spin + memory.kick),
          ),
          callbacks: {
            onGone: formD.alts("traits.osc.callbacks.onGone", [
              {
                patch: ({ memory }: any) => ({
                  spin: memory.spinning ? memory.spin + 1 : memory.spin,
                  resets: memory.resets + 1,
                }),
              },
            ]),
          },
        },
      ],
      on: {
        SetSubject: [{ patch: ({ event }: any) => ({ subject: event.subject }) }],
        // A key written by a part reaches resetOn only at commit: a pending reset (rule 1).
        SetAndRaise: [
          {
            patch: ({ event }: any) => ({ subject: event.subject }),
            raises: [
              {
                to: "check",
                event: "Changed",
                from: formD.slot("on.SetAndRaise.raise", () => ({ value: "into fresh" })),
              },
            ],
          },
        ],
        SetIds: [{ patch: ({ event }: any) => ({ rowIds: event.ids }) }],
        AddAndRaise: [
          {
            patch: ({ memory, event }: any) => ({ rowIds: [...memory.rowIds, event.key] }),
            raises: [
              {
                to: "rows",
                key: formD.slot("on.AddAndRaise.key", ({ event }: any) => event.key),
                event: "Changed",
                from: formD.slot("on.AddAndRaise.from", () => ({ value: "raised" })),
              },
            ],
          },
        ],
        RaiseGone: [
          {
            raises: [
              {
                to: "rows",
                key: formD.slot("on.RaiseGone.key", ({ event }: any) => event.key),
                event: "Changed",
                from: formD.slot("on.RaiseGone.from", () => ({ value: "x" })),
              },
            ],
          },
        ],
        RefuseChild: [
          { patch: () => ({ moved: true }), raises: [{ to: "check", event: "Refuse" }] },
        ],
        Spin: [{ patch: ({ memory }: any) => ({ kick: memory.kick + 1, spinning: true }) }],
        Go: [{ target: "DONE" }],
        Back: [{ target: "EDIT" }],
      },
    },
    EDIT: {
      placements: [
        {
          name: "flash",
          fragment: "Flash",
          callbacks: {
            onExpired: formD.alts("states.EDIT.traits.flash.callbacks.onExpired", [
              { patch: ({ memory }: any) => ({ flashes: memory.flashes + 1 }) },
            ]),
          },
        },
      ],
    },
    DONE: {},
  }),
  memory: formD.memory(() => ({
    subject: "s1",
    viaPart: false,
    rowIds: [] as string[],
    gone: [] as string[],
    goneRows: [] as string[],
    dirty: [] as string[],
    spin: 0,
    kick: 0,
    spinning: false,
    resets: 0,
    flashes: 0,
    moved: false,
  })),
  ops: {},
  persisted: false,
  uses: [],
});
export const formFixture: Fixture = { id: "Form", make: formMake };

// ── Notes: writing traits. Autosave under `.each` (2.9.6, no release), an upload under `.each` (desk upload.trait.ts, rule 60),
// a shared key across copies (rule 51's decline). Persisted.
const notesD = fixtureOf("Notes");
const autoD = fixtureOf("Autosave");
const upD = fixtureOf("Upload");
const Autosave: Fragment = {
  id: "Autosave",
  root: "root",
  default: "root",
  nodes: tree("Autosave", {
    root: {
      on: {
        Edited: [
          {
            patch: ({ event }: any) => ({ body: event.body, status: "saving" }),
            members: autoD.commit("save", ({ memory, event }: any) => ({
              docId: memory.key,
              body: event.body,
            })),
          },
        ],
        Shared: [{ members: autoD.commit("shared", ({ memory }: any) => ({ from: memory.key })) }],
        Resend: [
          {
            tokens: [
              {
                op: "save",
                verb: "retryable",
                times: 3,
                key: autoD.slot("on.Resend.key", ({ memory }: any) => ({ docId: memory.key })),
              },
            ],
            members: autoD.member("save", "retry", ({ memory }: any) => ({ docId: memory.key })),
          },
        ],
        Drop: [
          { members: autoD.member("save", "cancel", ({ memory }: any) => ({ docId: memory.key })) },
        ],
        Saved: [{ patch: ({ event }: any) => ({ status: "clean", saved: event.body }) }],
        // Rule 55: an adopted handler reads what it needs from the event.
        RetryShared: [
          {
            tokens: [
              {
                op: "shared",
                verb: "retryable",
                times: 3,
                key: autoD.slot("on.RetryShared.key", () => ({})),
              },
            ],
            members: autoD.member("shared", "retry", () => ({})),
          },
          { patch: () => ({ shared: "retry-denied" }) },
        ],
        CancelShared: [{ members: autoD.member("shared", "cancel", () => ({})) }],
        IdleShared: [
          {
            tokens: [
              { op: "shared", verb: "idle", key: autoD.slot("on.IdleShared.key", () => ({})) },
            ],
            patch: () => ({ shared: "idle" }),
          },
          { patch: () => ({ shared: "busy" }) },
        ],
        Conflict: [{ patch: ({ event }: any) => ({ status: "conflict", mine: event.mine }) }],
        NotSent: [{ patch: ({ event }: any) => ({ status: "notSent", why: event.why }) }],
        Unsure: [{ patch: ({ event }: any) => ({ status: "unsure", reason: event.reason }) }],
        SharedDone: [{ patch: () => ({ shared: "done" }) }],
        SharedNotSent: [{ patch: ({ event }: any) => ({ shared: event.why }) }],
      },
    },
  }),
  memory: {
    initial: autoD.slot("memory.initial", () => ({
      body: "",
      status: "clean",
      saved: null,
      mine: null,
      why: null,
      reason: null,
      shared: null,
    })),
  },
};
const Upload: Fragment = {
  id: "Upload",
  root: "root",
  default: "root",
  nodes: tree("Upload", {
    root: {
      schedules: [
        { id: "start", send: "StartDue", schedule: { ms: 0 }, armOn: ["entry"], disarmOn: [] },
      ],
      on: {
        StartDue: [
          {
            guards: [({ memory }: any) => memory.status === "queued" || deny("NotQueued")],
            tokens: [
              {
                op: "put",
                verb: "idle",
                key: upD.slot("on.StartDue.key", ({ memory }: any) => ({ ref: memory.key })),
              },
            ],
            patch: () => ({ status: "sending" }),
            members: upD.commit("put", ({ memory }: any) => ({ ref: memory.key })),
          },
          {},
        ],
        Stored: [
          {
            patch: () => ({ status: "stored" }),
            notify: [
              {
                name: "onStored",
                from: upD.slot("on.Stored.notify", ({ memory }: any) => ({ ref: memory.key })),
              },
            ],
          },
        ],
        NotSent: [{}],
        Unsure: [{ patch: () => ({ status: "unsure" }) }],
      },
    },
  }),
  memory: { initial: upD.slot("memory.initial", () => ({ status: "queued" })) },
  whenAbandoned: { release: ["put"] },
};
const notesMake = (api: Api): Compiled => ({
  id: "Notes",
  root: "root",
  default: "READY",
  fragments: { Autosave, Upload },
  nodes: tree("Notes", {
    root: {
      placements: [
        { name: "docs", fragment: "Autosave", each: { of: "docs", max: 4 } },
        {
          name: "uploads",
          fragment: "Upload",
          each: { of: "files", max: 4 },
          callbacks: {
            onStored: notesD.alts("traits.uploads.callbacks.onStored", [
              { patch: ({ memory, event }: any) => ({ stored: [...memory.stored, event.ref] }) },
            ]),
          },
        },
      ],
      on: {
        SetDocs: [{ patch: ({ event }: any) => ({ docs: event.docs }) }],
        SetFiles: [{ patch: ({ event }: any) => ({ files: event.files }) }],
      },
    },
    READY: {},
  }),
  memory: notesD.memory(() => ({
    docs: [] as string[],
    files: [] as string[],
    stored: [] as string[],
  })),
  ops: {
    save: write(api, "save", {
      fragment: "Autosave",
      key: notesD.key("save", (i) => ({ docId: i.docId })),
      concurrency: "reject",
      outcomes: {
        success: notesD.mapped("save", "success", "Saved", (_v, c) => ({
          body: c.input?.body ?? c.key.docId,
        })),
        failure: {
          Conflict: notesD.mapped("save", "failure.Conflict", "Conflict", (_e, c) => ({
            mine: c.input.body,
          })),
          NotSent: notesD.mapped("save", "failure.NotSent", "NotSent", (e) => ({ why: e.why })),
        },
        unknown: notesD.mapped("save", "unknown", "Unsure", (_v, c) => ({ reason: c.reason })),
      },
    }),
    shared: write(api, "shared", {
      fragment: "Autosave",
      key: notesD.key("shared", () => ({})),
      concurrency: "reject",
      outcomes: {
        success: { event: "SharedDone" },
        failure: {
          NotSent: notesD.mapped("shared", "failure.NotSent", "SharedNotSent", (e) => ({
            why: e.why,
          })),
        },
        unknown: notesD.mapped("shared", "unknown", "Unsure", (_v, c) => ({ reason: c.reason })),
      },
    }),
    put: write(api, "put", {
      fragment: "Upload",
      key: notesD.key("put", (i) => ({ ref: i.ref })),
      concurrency: "reject",
      outcomes: {
        success: { event: "Stored" },
        failure: { NotSent: { event: "NotSent" } },
        unknown: { event: "Unsure" },
      },
    }),
  },
  persisted: true,
  uses: [],
});
const notesServer: ServerModel = {
  init: () => ({ docs: {}, uploads: [] }),
  apply: (op, i, s) =>
    op === "save"
      ? { s: { ...s, docs: { ...s.docs, [i.docId]: i.body } }, value: {} }
      : { s: { ...s, uploads: [...s.uploads, i.ref] }, value: {} },
};
export const notesFixture: Fixture = { id: "Notes", make: notesMake, server: notesServer };

// ── Feed: a resumable trait with a lookup. Rule 52, 2.9.6's catch-up, FP RV3 H1. Persisted.
const feedD = fixtureOf("Feed");
const tailD = fixtureOf("Tail");
const Tail: Fragment = {
  id: "Tail",
  root: "root",
  default: "root",
  nodes: tree("Tail", {
    root: {
      schedules: [
        { id: "tick", send: "Tick", schedule: { ms: 1000 }, armOn: ["Sync"], disarmOn: [] },
      ],
      on: {
        Sync: [{ members: tailD.lookup("catchUp", () => ({ from: 0 })) }],
        Tick: [{ patch: ({ memory }: any) => ({ ticks: memory.ticks + 1 }) }],
        Caught: [{ patch: ({ memory }: any) => ({ caught: memory.caught + 1 }) }],
        CatchUpFailed: [
          { patch: ({ memory, event }: any) => ({ failed: [...memory.failed, event.why] }) },
        ],
      },
    },
  }),
  memory: {
    initial: tailD.slot("memory.initial", () => ({ ticks: 0, caught: 0, failed: [] as string[] })),
  },
};
const feedMake = (api: Api): Compiled => ({
  id: "Feed",
  root: "root",
  default: "LIVE",
  fragments: { Tail },
  nodes: tree("Feed", {
    root: { on: { Away: [{ target: "AWAY" }], Live: [{ target: "LIVE" }] } },
    LIVE: { placements: [{ name: "tail", fragment: "Tail", resumable: true }] },
    AWAY: {},
  }),
  memory: feedD.memory(() => ({})),
  ops: {
    catchUp: {
      id: "catchUp",
      contract: "lab/catchUp",
      kind: "read",
      fragment: "Tail",
      key: feedD.key("catchUp", () => ({})),
      concurrency: "reject",
      commit: (i) => api.call("catchUp", i) as Effect.Effect<unknown, unknown>,
      outcomes: {
        success: { event: "Caught" },
        failure: {
          Interrupted: feedD.mapped("catchUp", "failure.Interrupted", "CatchUpFailed", () => ({
            why: "Interrupted",
          })),
          NoResponse: feedD.mapped("catchUp", "failure.NoResponse", "CatchUpFailed", () => ({
            why: "NoResponse",
          })),
          Defect: feedD.mapped("catchUp", "failure.Defect", "CatchUpFailed", () => ({
            why: "Defect",
          })),
        },
      },
    },
  },
  persisted: true,
  uses: [],
});
export const feedFixture: Fixture = { id: "Feed", make: feedMake };

// ── Persisted variants: S1 and Issues with write-ahead on, for the crossed search and H1, M1.
const persisted = (f: Fixture): Fixture => ({
  ...f,
  make: (api) => ({ ...f.make(api), persisted: true }),
});
export const s1Persisted = persisted(s1Fixture);
export const issuesPersisted = persisted(issuesFixture);
// D21: a local identity of the same list.
export const issuesLocal: Fixture = {
  ...issuesFixture,
  make: (api) => ({ ...issuesFixture.make(api), local: true }),
};

// ── Odd: values core must encode, from user closures. H2, D46.
const oddD = fixtureOf("Odd");
const oddMake = (api: Api): Compiled => ({
  id: "Odd",
  root: "root",
  default: "READY",
  nodes: tree("Odd", {
    root: {
      on: {
        BadKey: [{ members: oddD.commit("bad", () => ({ id: 10n })) }],
        BadMemory: [{ patch: () => ({ big: 10n }) }],
        Fine: [{ patch: ({ memory }: any) => ({ n: memory.n + 1 }) }],
        Done: [{}],
      },
    },
    READY: {},
  }),
  memory: oddD.memory(() => ({ n: 0 })),
  ops: {
    bad: write(api, "bad", {
      key: oddD.key("bad", (i) => ({ id: i.id })),
      concurrency: "reject",
      outcomes: {
        success: { event: "Done" },
        failure: { NotSent: { event: "Done" } },
        unknown: { event: "Done" },
      },
    }),
  },
  persisted: true,
  uses: [],
});
export const oddFixture: Fixture = { id: "Odd", make: oddMake };

// ── Prediction with a throwing field function, and a store mapper that throws on a shape it did not expect. M8, H3.
export const issuesThrowing: Fixture = {
  ...issuesFixture,
  make: (api) => {
    const c = issuesFixture.make(api);
    const d = c.domain!;
    const root = c.nodes["root"]!;
    const f = fixtureOf(c.id);
    return {
      ...c,
      nodes: {
        ...c.nodes,
        root: {
          ...root,
          on: {
            ...root.on,
            Poke: f.alts("on.Poke", [
              { members: f.commit("poke", ({ event }) => ({ id: event.id })) },
            ]),
            // Two members, so a module can fail on the first and a closure refuse the turn on the second (L6).
            TwoBad: f.alts("on.TwoBad", [
              {
                members: (p) => [
                  {
                    op: "like",
                    verb: "commit",
                    input: f.slot(`${p}.actions[0]`, ({ event }: any) => ({
                      id: event.id,
                      liked: true,
                    })),
                  },
                  {
                    op: "rename",
                    verb: "commit",
                    input: f.slot(`${p}.actions[1]`, ({ event }: any) => ({
                      id: event.id,
                      title: "t",
                    })),
                  },
                ],
              },
            ]),
          },
        },
      },
      ops: {
        ...c.ops,
        poke: {
          ...c.ops["like"]!,
          id: "poke",
          contract: "issues/poke",
          commit: (i, { attempt }) =>
            api.call("poke", i, { idempotencyKey: attempt.id }) as Effect.Effect<unknown, unknown>,
        },
      },
      domain: {
        ...d,
        writes: {
          ...d.writes,
          poke: {
            predicts: f.slot("domain.poke.predicts", (i: any) => [
              {
                ref: `Issue|${i.id}`,
                patch: {
                  title: () => {
                    throw new Error("field function");
                  },
                },
              },
            ]),
          },
        },
      },
    };
  },
};

// D22, F3.1: an unknown's handler with two key-less cancels; a success whose handler always denies.
const issuesAlt = (tag: string, spec: (f: ReturnType<typeof fixtureOf>) => any): Fixture => ({
  ...issuesFixture,
  make: (api) => {
    const c = issuesFixture.make(api);
    const f = fixtureOf(c.id);
    const root = c.nodes["root"]!;
    return {
      ...c,
      nodes: {
        ...c.nodes,
        root: { ...root, on: { ...root.on, [tag]: f.alts(`on.${tag}`, spec(f)) } },
      },
    };
  },
});
export const issuesDoubleCancel = issuesAlt("LikeUnsure", (f) => [
  { members: (p: string) => [...f.member("like", "cancel")(p), ...f.member("like", "cancel")(p)] },
]);
export const issuesDenySettled = issuesAlt("Settled", () => [{ guards: [() => deny("Nope")] }]);
