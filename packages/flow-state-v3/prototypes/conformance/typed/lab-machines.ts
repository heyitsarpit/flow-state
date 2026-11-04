// Round 11: `fixtures/lab.compiled.ts`, written in the public API: Form (traits with no operations), Notes (writing traits under `.each`), Feed (a resumable
// trait with a lookup), Odd (values core must encode). Docs and the Issues variants carry a `domain` and wait for the entity step (finding F5): re-exported hand.
import { Effect, Schema } from "effect";
import { definition, deny, Flow, fragment, machine, resource, transaction } from "./flow.ts";
import { call, FakeApi, fixture, write } from "./lab.ts";
import { notesFixture as handNotes } from "../fixtures/lab.compiled.ts";

export { docRef, docsFixture, s1Persisted } from "./stores.ts";
export { issuesPersisted, issuesLocal, issuesThrowing, issuesDoubleCancel, issuesDenySettled } from "./issues.ts";

const S = Schema;
const U = S.Unknown;
const Strs = S.Array(S.String);

// ── Form: traits with no operations. Field (3.3), a node trait with a schedule, `.each`, `resetOn`, whenAbandoned, callbacks.
const Field = fragment(
  {
    id: "Field",
    events: { Changed: { value: S.String }, Clear: {} },
    hostEvents: { Refuse: {} },
    callbacks: { onDirty: Flow.Callback({ value: S.String }), onGone: Flow.Callback({ value: U, key: U }) },
    memory: { value: Flow.input(U.pipe(S.withDecodingDefaultKey(Effect.succeed("")))), touched: Flow.initial(S.Boolean, false) },
  },
  ({ callbacks }) => ({
    on: {
      Changed: { updateMemory: ({ event }) => ({ value: event.value, touched: true }), notify: [callbacks.onDirty.from(({ event }: { readonly event: { readonly value: string } }) => ({ value: event.value }))] },
      Clear: { updateMemory: () => ({ value: "" }) },
      Refuse: { guard: [() => deny("Refused")] },
    },
    whenAbandoned: [callbacks.onGone.from(({ memory, key }: { readonly memory: { readonly value: unknown }; readonly key?: string }) => ({ value: memory.value, key }))],
  }),
);
const Flash = fragment(
  { id: "Flash", internalEvents: { Expired: {} }, callbacks: { onExpired: Flow.Callback({}) }, memory: { n: Flow.initial(S.Number, 0) } },
  ({ E, callbacks }) => ({
    schedules: { expire: { schedule: "1 second", send: E.Expired } },
    on: { Expired: { notify: [callbacks.onExpired] } },
  }),
);
// A whenAbandoned that writes what its own resetOn watches: rule 1's lag, and D35's bound.
const Osc = fragment({ id: "Osc", callbacks: { onGone: Flow.Callback({}) } }, ({ callbacks }) => ({ whenAbandoned: [callbacks.onGone] }));
const form = definition({
  id: "Form",
  states: { EDIT: {}, DONE: {} },
  events: {
    SetSubject: { subject: S.String }, SetAndRaise: { subject: S.String }, SetIds: { ids: Strs }, AddAndRaise: { key: S.String }, RaiseGone: { key: S.String },
    RefuseChild: {}, Spin: {}, Go: {}, Back: {},
  },
  internalEvents: {},
  memory: {
    subject: Flow.initial(S.String, "s1"), viaPart: Flow.initial(S.Boolean, false), rowIds: Flow.initial(Strs, []), gone: Flow.initial(S.Array(U), []),
    goneRows: Flow.initial(S.Array(U), []), dirty: Flow.initial(Strs, []), spin: Flow.initial(S.Number, 0), kick: Flow.initial(S.Number, 0),
    spinning: Flow.initial(S.Boolean, false), resets: Flow.initial(S.Number, 0), flashes: Flow.initial(S.Number, 0), moved: Flow.initial(S.Boolean, false),
  },
  persisted: false,
  places: { check: Field, rows: Field, osc: Osc },
  operations: () => ({}),
});
export const formFixture = fixture(
  machine(form, ({ S: St, E }) => ({
    default: St.EDIT,
    traits: {
      check: {
        input: ({ memory }) => ({ value: memory.subject }),
        resetOn: ({ memory }) => memory.subject,
        callbacks: {
          // A part that writes what resetOn watches: "subject:x" sets the subject, so a pending reset follows at commit (rule 1).
          onDirty: {
            updateMemory: ({ memory, event }) => {
              const value = (event as { readonly value: string }).value;
              return { dirty: [...memory.dirty, value], ...(value.startsWith("subject:") ? { subject: value.slice(8) } : {}) };
            },
          },
          onGone: { updateMemory: ({ memory, event }) => ({ gone: [...memory.gone, (event as { readonly value: unknown }).value] }) },
        },
      },
      rows: {
        each: { of: "rowIds", max: 2 },
        input: ({ key }) => ({ value: `seed ${key}` }),
        callbacks: {
          onDirty: {},
          onGone: { updateMemory: ({ memory, event }) => ({ goneRows: [...memory.goneRows, (event as { readonly key: unknown }).key] }) },
        },
      },
      osc: {
        resetOn: ({ memory }) => String(memory.spin + memory.kick),
        callbacks: { onGone: { updateMemory: ({ memory }) => ({ spin: memory.spinning ? memory.spin + 1 : memory.spin, resets: memory.resets + 1 }) } },
      },
    },
    on: {
      SetSubject: { updateMemory: ({ event }) => ({ subject: event.subject }) },
      // A key written by a part reaches resetOn only at commit: a pending reset (rule 1).
      SetAndRaise: { updateMemory: ({ event }) => ({ subject: event.subject }), raise: [E.check.Changed.from(() => ({ value: "into fresh" }))] },
      SetIds: { updateMemory: ({ event }) => ({ rowIds: event.ids }) },
      AddAndRaise: {
        updateMemory: ({ memory, event }) => ({ rowIds: [...memory.rowIds, event.key] }),
        raise: [E.rows.Changed.key(({ event }) => (event as { readonly key: string }).key).from(() => ({ value: "raised" }))],
      },
      RaiseGone: { raise: [E.rows.Changed.key(({ event }) => (event as { readonly key: string }).key).from(() => ({ value: "x" }))] },
      RefuseChild: { updateMemory: () => ({ moved: true }), raise: [E.check.Refuse] },
      Spin: { updateMemory: ({ memory }) => ({ kick: memory.kick + 1, spinning: true }) },
      Go: St.DONE,
      Back: St.EDIT,
    },
    states: { EDIT: { traits: { flash: { fragment: Flash, callbacks: { onExpired: { updateMemory: ({ memory }) => ({ flashes: memory.flashes + 1 }) } } } } } },
  })),
);

// ── Notes: writing traits. Autosave under `.each` (2.9.6, no release), an upload under `.each` (desk upload.trait.ts, rule 60), a shared key across copies
// (rule 51's decline). Persisted.
const saveC = transaction({ id: "lab/save", input: { docId: U, body: U }, key: ["docId"], concurrency: "reject", services: [FakeApi], commit: write<unknown, "Conflict">("save") });
const sharedC = transaction({ id: "lab/shared", input: { from: U }, key: [], concurrency: "reject", services: [FakeApi], commit: write("shared") });
const Autosave = fragment(
  {
    id: "Autosave",
    events: { Edited: { body: S.String }, Shared: {}, Resend: {}, Drop: {}, RetryShared: {}, CancelShared: {}, IdleShared: {} },
    internalEvents: { Saved: { body: U }, Conflict: { mine: U }, NotSent: { why: U }, Unsure: { reason: U }, SharedDone: {}, SharedNotSent: { why: U } },
    memory: {
      body: Flow.initial(U, ""), status: Flow.initial(U, "clean"), saved: Flow.initial(U, null), mine: Flow.initial(U, null), why: Flow.initial(U, null),
      reason: Flow.initial(U, null), shared: Flow.initial(U, null),
    },
    operations: ({ E }) => ({
      save: saveC.outcomes({
        success: E.Saved.from((_v, c) => ({ body: (c.input as { readonly body?: unknown } | undefined)?.body ?? (c.key as { readonly docId: unknown }).docId })),
        failure: {
          Conflict: E.Conflict.from((_e, c) => ({ mine: (c.input as { readonly body: unknown }).body })),
          NotSent: E.NotSent.from((e) => ({ why: e.why })),
        },
        unknown: E.Unsure.from((_v, c) => ({ reason: c.reason })),
      }),
      shared: sharedC.outcomes({ success: E.SharedDone, failure: { NotSent: E.SharedNotSent.from((e) => ({ why: e.why })) }, unknown: E.Unsure.from((_v, c) => ({ reason: c.reason })) }),
    }),
  },
  ({ O }) => ({
    on: {
      Edited: { updateMemory: ({ event }) => ({ body: event.body, status: "saving" }), actions: [O.save.commit(({ event, key }) => ({ docId: key, body: event.body }))] },
      Shared: { actions: [O.shared.commit(({ key }) => ({ from: key }))] },
      Resend: { guard: [O.save.retryable({ times: 3, key: ({ key }) => ({ docId: key }) })], actions: [O.save.retry.key(({ key }) => ({ docId: key }))] },
      Drop: { actions: [O.save.cancel.key(({ key }) => ({ docId: key }))] },
      Saved: { updateMemory: ({ event }) => ({ status: "clean", saved: event.body }) },
      // Rule 55: an adopted handler reads what it needs from the event.
      RetryShared: [{ guard: [O.shared.retryable({ times: 3, key: () => ({}) })], actions: [O.shared.retry.key(() => ({}))] }, { updateMemory: () => ({ shared: "retry-denied" }) }],
      CancelShared: { actions: [O.shared.cancel.key(() => ({}))] },
      IdleShared: [{ guard: [O.shared.idle(() => ({}))], updateMemory: () => ({ shared: "idle" }) }, { updateMemory: () => ({ shared: "busy" }) }],
      Conflict: { updateMemory: ({ event }) => ({ status: "conflict", mine: event.mine }) },
      NotSent: { updateMemory: ({ event }) => ({ status: "notSent", why: event.why }) },
      Unsure: { updateMemory: ({ event }) => ({ status: "unsure", reason: event.reason }) },
      SharedDone: { updateMemory: () => ({ shared: "done" }) },
      SharedNotSent: { updateMemory: ({ event }) => ({ shared: event.why }) },
    },
  }),
);
const putC = transaction({ id: "lab/put", input: { ref: U }, key: ["ref"], concurrency: "reject", services: [FakeApi], commit: write("put") });
const Upload = fragment(
  {
    id: "Upload",
    hostEvents: { Kick: {} },
    internalEvents: { StartDue: {}, Stored: {}, NotSent: {}, Unsure: {} },
    callbacks: { onStored: Flow.Callback({ ref: U }) },
    memory: { status: Flow.initial(U, "queued") },
    operations: ({ E }) => ({ put: putC.outcomes({ success: E.Stored, failure: { NotSent: E.NotSent }, unknown: E.Unsure }) }),
  },
  ({ E, O, callbacks }) => ({
    schedules: { start: { schedule: "0 millis", send: E.StartDue } },
    on: {
      StartDue: [
        {
          guard: [({ memory }) => memory.status === "queued" || deny("NotQueued"), O.put.idle(({ key }) => ({ ref: key }))],
          updateMemory: () => ({ status: "sending" }),
          actions: [O.put.commit(({ key }) => ({ ref: key }))],
        },
        {},
      ],
      Stored: { updateMemory: () => ({ status: "stored" }), notify: [callbacks.onStored.from(({ key }: { readonly key?: string }) => ({ ref: key }))] },
      Kick: { actions: [O.put.commit(({ key }) => ({ ref: key }))] },
      NotSent: {},
      Unsure: { updateMemory: () => ({ status: "unsure" }) },
    },
    whenAbandoned: [O.put.cancel],
  }),
);
const notes = definition({
  id: "Notes",
  states: { READY: {} },
  events: { SetDocs: { docs: Strs }, SetDocsThen: { docs: Strs }, SetFiles: { files: Strs }, KickAndDrop: { key: S.String } },
  internalEvents: {},
  memory: { docs: Flow.initial(Strs, []), files: Flow.initial(Strs, []), stored: Flow.initial(S.Array(U), []) },
  places: { docs: Autosave, uploads: Upload },
  operations: () => ({}),
});
export const notesFixture = {
  ...fixture(
    machine(notes, ({ S: St, E }) => ({
      default: St.READY,
      traits: {
        docs: { each: { of: "docs", max: 4 } },
        uploads: { each: { of: "files", max: 4 }, callbacks: { onStored: { updateMemory: ({ memory, event }) => ({ stored: [...memory.stored, (event as { readonly ref: unknown }).ref] }) } } },
      },
      on: {
        SetDocs: { updateMemory: ({ event }) => ({ docs: event.docs }) },
        // Review M4: adoption reached from a follow-up, so a small bound meets it. Not public API (D203).
        SetDocsThen: { labFollowUps: [({ event }) => ({ tag: "SetDocs", payload: { docs: event.docs } })] },
        SetFiles: { updateMemory: ({ event }) => ({ files: event.files }) },
        // Rule 60's order: a commit in a copy the same turn removes.
        KickAndDrop: { updateMemory: () => ({ files: [] }), raise: [E.uploads.Kick.key(({ event }) => (event as { readonly key: string }).key)] },
      },
    })),
  ),
  ...(handNotes.server ? { server: handNotes.server } : {}),
};

// ── Feed: a resumable trait with a lookup. Rule 52, 2.9.6's catch-up, FP RV3 H1. Persisted.
const catchUp = resource({ id: "lab/catchUp", input: { from: U }, key: [], services: [FakeApi], commit: (i) => call<unknown, "NoResponse">("catchUp")(i) });
const Tail = fragment(
  {
    id: "Tail",
    events: { Sync: {} },
    internalEvents: { Tick: {}, Caught: {}, CatchUpFailed: { why: S.String } },
    memory: { ticks: Flow.initial(S.Number, 0), caught: Flow.initial(S.Number, 0), failed: Flow.initial(Strs, []) },
    operations: ({ E }) => ({
      catchUp: catchUp.outcomes({
        success: E.Caught,
        failure: {
          Interrupted: E.CatchUpFailed.from(() => ({ why: "Interrupted" })),
          NoResponse: E.CatchUpFailed.from(() => ({ why: "NoResponse" })),
          Defect: E.CatchUpFailed.from(() => ({ why: "Defect" })),
        },
      }),
    }),
  },
  ({ E, O }) => ({
    schedules: { tick: { schedule: "1 second", send: E.Tick, armOn: ["Sync"] } },
    on: {
      Sync: { actions: [O.catchUp.lookup(() => ({ from: 0 }))] },
      Tick: { updateMemory: ({ memory }) => ({ ticks: memory.ticks + 1 }) },
      Caught: { updateMemory: ({ memory }) => ({ caught: memory.caught + 1 }) },
      CatchUpFailed: { updateMemory: ({ memory, event }) => ({ failed: [...memory.failed, event.why] }) },
    },
  }),
);
const feed = definition({ id: "Feed", states: { LIVE: {}, AWAY: {} }, events: { Away: {}, Live: {} }, internalEvents: {}, memory: {}, operations: () => ({}) });
export const feedFixture = fixture(
  machine(feed, ({ S: St }) => ({
    default: St.LIVE,
    on: { Away: St.AWAY, Live: St.LIVE },
    states: { LIVE: { traits: { tail: { fragment: Tail, resumable: true } } } },
  })),
);

// ── Odd: values core must encode, from user closures. H2, D46.
const bad = transaction({ id: "lab/bad", input: { id: U }, key: ["id"], concurrency: "reject", services: [FakeApi], commit: write("bad") });
const odd = definition({
  id: "Odd",
  states: { READY: {} },
  events: { BadKey: {}, BadMemory: {}, Fine: {} },
  internalEvents: { Done: {} },
  memory: { n: Flow.initial(S.Number, 0), big: S.optionalKey(U) },
  operations: ({ E }) => ({ bad: bad.outcomes({ success: E.Done, failure: { NotSent: E.Done }, unknown: E.Done }) }),
});
export const oddFixture = fixture(
  machine(odd, ({ S: St, O }) => ({
    default: St.READY,
    on: {
      BadKey: { actions: [O.bad.commit(() => ({ id: 10n }))] },
      BadMemory: { updateMemory: () => ({ big: 10n }) },
      Fine: { updateMemory: ({ memory }) => ({ n: memory.n + 1 }) },
      Done: {},
    },
  })),
);
