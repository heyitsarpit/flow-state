// Round 11: `fixtures/real.compiled.ts`, written in the public API: AddressStep under Checkout/Addr, Resolve's wizard under Desk/Ticket, AttachmentUpload
// under Desk/Attach, History under Desk/Panels, and Deep. `attachDomainFixture` carries a `domain` and waits for the entity step (finding F5): hand.
import { Effect, Schema } from "effect";
import { definition, deny, Flow, fragment, machine, resource, transaction } from "./flow.ts";
import { call, fixture, write } from "./lab.ts";
import { attachFixture as handAttach } from "../fixtures/real.compiled.ts";

export { emptyAddress, MAX_RESENDS } from "../fixtures/real.compiled.ts";
import type { Api } from "../fake-world.ts";
import { emptyAddress, MAX_RESENDS } from "../fixtures/real.compiled.ts";

const S = Schema;
const U = S.Unknown;
type Addr = { readonly name: string; readonly street: string; readonly postcode: string };
const Address = S.Struct({ name: S.String, street: S.String, postcode: S.String });

// ── AddressStep, as written: nested FORM, `.history`, an exit, whenAbandoned. Its host: pay.machine.ts's ADDRESS.
const AddressStep = fragment(
  {
    id: "AddressStep",
    states: { FORM: { NAME: {}, STREET: {}, POSTCODE: {} }, POSTCODE_HELP: {} },
    default: "FORM",
    events: { Changed: { address: Address }, Help: {}, Next: {}, Back: {}, Confirm: {}, CloseHelp: {} },
    exits: { Done: Flow.Exit({ address: Address }) },
    callbacks: { onPostcode: Flow.Callback({ postcode: S.String }), onDraft: Flow.Callback({ address: U }) },
    memory: { address: Flow.input(U) },
  },
  ({ S: St, exits, callbacks }) => ({
    on: { Changed: { updateMemory: ({ event }) => ({ address: event.address }) }, Help: St.POSTCODE_HELP },
    states: {
      FORM: { default: St.FORM.NAME },
      NAME: { on: { Next: { target: St.FORM.STREET, guard: [({ memory }) => (memory.address as Addr).name.trim() !== "" || deny("NoName")] } } },
      STREET: { on: { Next: St.FORM.POSTCODE, Back: St.FORM.NAME } },
      POSTCODE: {
        on: {
          Back: St.FORM.STREET,
          Changed: {
            updateMemory: ({ event }) => ({ address: event.address }),
            notify: [callbacks.onPostcode.from(({ event }: { readonly event: { readonly address: Addr } }) => ({ postcode: event.address.postcode }))],
          },
          // An exit behind a guard: an alternative with `guard` and `exit` (round 11: the thin path's exit token took no guard).
          Confirm: {
            guard: [({ memory }) => /^[A-Z0-9 ]{5,8}$/.test((memory.address as Addr).postcode) || deny("BadPostcode")],
            exit: exits.Done.from(({ memory }) => ({ address: memory.address as Addr })).exit,
          },
        },
      },
      POSTCODE_HELP: { on: { CloseHelp: St.FORM.history } },
    },
    whenAbandoned: [callbacks.onDraft.from(({ memory }) => ({ address: memory.address }))],
  }),
);
const addr = definition({
  id: "Checkout/Addr",
  states: { IDLE: {}, LEFT: {}, CARD: {}, ADDRESS: {} },
  events: { Leave: {}, Go: {} },
  internalEvents: {},
  memory: { address: Flow.initial(U, null), addressDraft: Flow.initial(U, emptyAddress), quotes: Flow.initial(S.Array(U), []) },
  persisted: false,
  operations: () => ({}),
});
export const addressFixture = fixture(
  machine(addr, ({ S: St }) => ({
    default: St.IDLE,
    on: { Leave: St.LEFT, Go: St.ADDRESS },
    states: {
      ADDRESS: {
        into: {
          fragment: AddressStep,
          input: ({ memory }) => ({ address: memory.addressDraft }),
          callbacks: {
            onPostcode: { updateMemory: ({ memory, event }) => ({ quotes: [...memory.quotes, (event as { readonly postcode: string }).postcode] }) },
            onDraft: { updateMemory: ({ event }) => ({ addressDraft: (event as { readonly address: unknown }).address }) },
          },
          exits: { Done: { target: St.CARD, updateMemory: ({ event }) => ({ address: (event as { readonly address: unknown }).address, addressDraft: emptyAddress }) } },
        },
      },
    },
  })),
);

// ── Resolve's wizard shape: nested STEPS, a nested subroutine whose `Kept` targets `S.STEPS.history` and whose `Discarded` fills the wizard's own exit.
const ConfirmDiscard = fragment(
  { id: "ConfirmDiscard", events: { Keep: {}, Discard: {} }, exits: { Kept: Flow.Exit({}), Discarded: Flow.Exit({}) }, callbacks: { onDialogGone: Flow.Callback({}) } },
  ({ exits, callbacks }) => ({ on: { Keep: exits.Kept, Discard: exits.Discarded }, whenAbandoned: [callbacks.onDialogGone] }),
);
const Wizard = fragment(
  {
    id: "Wizard",
    states: { STEPS: { REASON: {}, PARTS: {} }, DISCARD: {} },
    default: "STEPS",
    events: { AskDiscard: {}, Next: { reason: U }, Back: {}, Submit: {} },
    exits: { Resolved: Flow.Exit({ reason: U }), Abandoned: Flow.Exit({ reason: U }) },
    callbacks: { onDraft: Flow.Callback({ reason: U }) },
    memory: { reason: Flow.initial(U, ""), dialogGone: Flow.initial(S.Number, 0) },
    places: { DISCARD: ConfirmDiscard },
  },
  ({ S: St, exits, callbacks }) => ({
    on: { AskDiscard: St.DISCARD },
    states: {
      STEPS: { default: St.STEPS.REASON },
      REASON: { on: { Next: { target: St.STEPS.PARTS, updateMemory: ({ event }) => ({ reason: event.reason }) } } },
      PARTS: { on: { Back: St.STEPS.REASON, Submit: exits.Resolved.from(({ memory }) => ({ reason: memory.reason })) } },
      DISCARD: {
        into: {
          fragment: ConfirmDiscard,
          callbacks: { onDialogGone: { updateMemory: ({ memory }) => ({ dialogGone: memory.dialogGone + 1 }) } },
          exits: { Kept: St.STEPS.history, Discarded: exits.Abandoned.from(({ memory }) => ({ reason: memory.reason })) },
        },
      },
    },
    whenAbandoned: [callbacks.onDraft.from(({ memory }) => ({ reason: memory.reason }))],
  }),
);
const SideT = fragment({ id: "SideT", callbacks: { onSideGone: Flow.Callback({}) } }, ({ callbacks }) => ({ whenAbandoned: [callbacks.onSideGone] }));
const ticket = definition({
  id: "Desk/Ticket",
  states: { OPEN: {}, CLOSED: {}, RESOLVED: {}, RESOLVING: {} },
  events: { Close: {}, Resolve: {} },
  internalEvents: {},
  memory: { drafts: Flow.initial(S.Array(U), []), resolved: Flow.initial(U, null), discarded: Flow.initial(U, null), sideGone: Flow.initial(S.Number, 0) },
  persisted: false,
  operations: () => ({}),
});
export const ticketFixture = fixture(
  machine(ticket, ({ S: St }) => ({
    default: St.OPEN,
    on: { Close: St.CLOSED, Resolve: St.RESOLVING },
    states: {
      RESOLVING: {
        traits: { side: { fragment: SideT, callbacks: { onSideGone: { updateMemory: ({ memory }) => ({ sideGone: memory.sideGone + 1 }) } } } },
        into: {
          fragment: Wizard,
          name: "wizard",
          callbacks: { onDraft: { updateMemory: ({ memory, event }) => ({ drafts: [...memory.drafts, (event as { readonly reason: unknown }).reason] }) } },
          exits: {
            Resolved: { target: St.RESOLVED, updateMemory: ({ event }) => ({ resolved: (event as { readonly reason: unknown }).reason }) },
            Abandoned: { target: St.OPEN, updateMemory: ({ event }) => ({ discarded: (event as { readonly reason: unknown }).reason }) },
          },
        },
      },
    },
  })),
);

// ── AttachmentUpload, as written: `by: "ref"`, `item`, by-reason `unknown`, `resend` with `disarmOn`, `Lost`, whenAbandoned.
const REASONS = { Cancelled: "Stopped", NoResponse: "Unsure", ServerError: "Unsure", Restored: "Lost", Interrupted: "Unsure", Defect: "Unsure", StillUnknown: "Unsure", StorageRefused: "Unsure" } as const;
const put = transaction({ id: "real/put", input: { ref: U }, key: ["ref"], concurrency: "reject", commit: write<{ readonly url?: string }, "TooLarge" | "FileGone">("put") });
const upload = (omit: readonly string[]) =>
  fragment(
    {
      id: "AttachmentUpload",
      events: { Cancel: {} },
      internalEvents: { StartDue: {}, ResendDue: {}, Stopped: {}, Lost: {}, NotSent: {}, Unsure: {}, Stored: { url: U }, TooBig: { limit: U }, Gone: {} },
      callbacks: { onFailed: Flow.Callback({ ref: U, problem: S.String }), onStored: Flow.Callback({ ref: U, url: U }) },
      memory: {
        ref: Flow.input(U), name: Flow.input(U), status: Flow.initial(U, "queued"), url: Flow.initial(U, null), problem: Flow.initial(U, null), limit: Flow.initial(U, null),
      },
      operations: ({ E }) => ({
        put: put.outcomes({
          success: E.Stored.from((v) => ({ url: v?.url ?? "u" })),
          failure: { TooLarge: E.TooBig.from((r) => ({ limit: (r as { readonly limit?: unknown }).limit })), FileGone: E.Gone, NotSent: E.NotSent },
          unknown: Object.fromEntries(Object.entries(REASONS).filter(([r]) => !omit.includes(r)).map(([r, ev]) => [r, E[ev]])),
        }),
      }),
    },
    ({ E, O, callbacks }) => {
      const own = ({ memory }: { readonly memory: { readonly ref: unknown } }) => ({ ref: memory.ref });
      const failed = (problem: string) => callbacks.onFailed.from(({ memory }) => ({ ref: memory.ref, problem }));
      return {
        schedules: {
          start: { schedule: "0 millis", send: E.StartDue },
          resend: { schedule: "3 seconds", send: E.ResendDue, armOn: ["Unsure"], disarmOn: ["Cancel", "Stored", "Gone", "TooBig", "Stopped", "Lost"] },
        },
        on: {
          StartDue: [
            { guard: [({ memory }) => memory.status === "queued" || deny("NotQueued"), O.put.idle(own)], updateMemory: () => ({ status: "sending" }), actions: [O.put.commit(own)] },
            {},
          ],
          Cancel: {
            guard: [({ memory }) => ["queued", "sending", "unsure"].includes(memory.status as string) || deny("NothingToCancel")],
            updateMemory: () => ({ status: "stopped" }),
            actions: [O.put.cancel.key(own)],
          },
          Stopped: { actions: [O.put.cancel] },
          Lost: { updateMemory: () => ({ status: "failed", problem: "FileGone" }), actions: [O.put.cancel], notify: [failed("FileGone")] },
          NotSent: {},
          Unsure: { updateMemory: () => ({ status: "unsure" }) },
          ResendDue: [
            { guard: [O.put.retryable({ times: MAX_RESENDS, key: own })], updateMemory: () => ({ status: "sending" }), actions: [O.put.retry.key(own)] },
            { updateMemory: () => ({ status: "failed", problem: "GaveUp" }), actions: [O.put.cancel.key(own)], notify: [failed("GaveUp")] },
          ],
          Stored: {
            updateMemory: ({ event }) => ({ status: "stored", url: event.url }),
            notify: [callbacks.onStored.from(({ memory, event }: { readonly memory: { readonly ref: unknown }; readonly event: { readonly url: unknown } }) => ({ ref: memory.ref, url: event.url }))],
          },
          TooBig: { updateMemory: ({ event }) => ({ status: "failed", problem: "TooLarge", limit: event.limit }), notify: [failed("TooLarge")] },
          Gone: { updateMemory: () => ({ status: "failed", problem: "FileGone" }), notify: [failed("FileGone")] },
        },
        whenAbandoned: [O.put.cancel],
      };
    },
  );
const MarkT = fragment({ id: "MarkT", callbacks: { onMarkGone: Flow.Callback({}) } }, ({ callbacks }) => ({ whenAbandoned: [callbacks.onMarkGone] }));
// `store`: attachDomain, the same with a domain in `Compiled`'s shape (D209), so a persisted host has entities.
const attach = (omit: readonly string[], store?: Api) => {
  const Upload = upload(omit);
  const d = definition({
    id: "Desk/Attach",
    uses: store ? ["entities"] : [],
    ...(store
      ? {
          domain: {
            writes: {
              put: {
                predicts: (i: { readonly ref: string }) => [{ ref: `File|${i.ref}`, patch: { state: "stored" } }],
                confirms: (v: { readonly url?: string } | undefined, i: { readonly ref: string }) => [{ ref: `File|${i.ref}`, fields: { state: "stored", url: v?.url ?? "u" } }],
              },
            },
            repair: (ref: string) => store.call("repair", { ref }) as Effect.Effect<unknown, unknown, never>,
          },
        }
      : {}),
    states: { EDIT: {} },
    events: { SetFiles: { attachments: S.Array(U) }, SetSubject: { subject: U }, Touch: {} },
    internalEvents: {},
    memory: {
      // `Unknown`, not `Array`: REV4-H4 writes `null`, `5`, `"x"` here to pin the list repair (rule 9); an `Array` Schema refuses them at capture first (finding F7).
      attachments: Flow.initial(U, []), subject: Flow.initial(U, "s1"), resets: Flow.initial(S.Number, 0), stored: Flow.initial(S.Array(U), []),
      failed: Flow.initial(S.Array(U), []), touched: Flow.initial(S.Number, 0),
    },
    places: { uploads: Upload, mark: MarkT },
    operations: () => ({}),
  });
  return machine(d, ({ S: St }) => ({
    default: St.EDIT,
    on: {
      SetFiles: { updateMemory: ({ event }) => ({ attachments: event.attachments }) },
      SetSubject: { updateMemory: ({ event }) => ({ subject: event.subject }) },
      Touch: { updateMemory: ({ memory }) => ({ touched: memory.touched + 1 }) },
    },
    traits: {
      uploads: {
        each: { of: "attachments", by: "ref", max: 10 },
        input: ({ item }) => ({ ref: (item as { readonly ref: unknown }).ref, name: (item as { readonly name: unknown }).name }),
        callbacks: {
          onStored: { updateMemory: ({ memory, event }) => ({ stored: [...memory.stored, (event as { readonly ref: unknown }).ref] }) },
          onFailed: { updateMemory: ({ memory, event }) => ({ failed: [...memory.failed, [(event as { readonly ref: unknown }).ref, (event as { readonly problem: unknown }).problem]] }) },
        },
      },
      // A plain `resetOn`, so a user's value reaches a reset (D57).
      mark: { resetOn: ({ memory }) => memory.subject, callbacks: { onMarkGone: { updateMemory: ({ memory }) => ({ resets: memory.resets + 1 }) } } },
    },
  }));
};
export const attachFixture = fixture(attach([]), handAttach.server);
export const attachMissingReason = fixture(attach(["StillUnknown"]), handAttach.server);
export const attachDomainFixture = fixture((api: Api) => attach([], api), handAttach.server);

// ── History under Panels, as written: resumable + resetOn on a tab node; a lookup a freeze cuts; a write that outlives it; a raise from the host.
const earlier = resource({ id: "real/historyOf", input: { ticketId: U, page: U }, key: ["ticketId"], commit: (i) => call<{ readonly entry?: unknown }, "NoResponse">("earlier")(i) });
const pin = transaction({ id: "real/pin", input: { ticketId: U, entryId: U, pinned: U }, key: ["ticketId", "entryId"], concurrency: "reject", commit: write("pin") });
const History = fragment(
  {
    id: "History",
    events: { LoadEarlier: {}, Pin: { entryId: U, pinned: U } },
    hostEvents: { Highlight: { entryId: U } },
    internalEvents: { EarlierLoaded: { entry: U }, EarlierCut: {}, Pinned: { entryId: U }, PinFailed: {}, PinUnsure: {} },
    callbacks: { onGone: Flow.Callback({ ticketId: U }) },
    memory: {
      ticketId: Flow.input(U), earlier: Flow.initial(S.Array(U), []), cuts: Flow.initial(S.Number, 0), highlighted: Flow.initial(U, null), pins: Flow.initial(S.Array(U), []),
    },
    operations: ({ E }) => ({
      earlier: earlier.outcomes({ success: E.EarlierLoaded.from((v) => ({ entry: v?.entry ?? "e" })), failure: { NoResponse: E.EarlierCut, Defect: E.EarlierCut, Interrupted: E.EarlierCut } }),
      pin: pin.outcomes({ success: E.Pinned.from((_v, c) => ({ entryId: (c.key as { readonly entryId: unknown }).entryId })), failure: { NotSent: E.PinFailed }, unknown: E.PinUnsure }),
    }),
  },
  ({ O, callbacks }) => {
    const look = O.earlier.lookup(({ memory }) => ({ ticketId: memory.ticketId, page: memory.earlier.length }));
    return {
      on: {
        LoadEarlier: { actions: [look] },
        EarlierLoaded: { updateMemory: ({ memory, event }) => ({ earlier: [...memory.earlier, event.entry] }) },
        EarlierCut: { updateMemory: ({ memory }) => ({ cuts: memory.cuts + 1 }), actions: [look] },
        Highlight: { updateMemory: ({ event }) => ({ highlighted: event.entryId }) },
        Pin: {
          // Written by hand, in another order than the contract's key: one lane all the same (D57).
          guard: [O.pin.idle(({ memory, event }) => ({ entryId: event.entryId, ticketId: memory.ticketId }))],
          actions: [O.pin.commit(({ memory, event }) => ({ ticketId: memory.ticketId, entryId: event.entryId, pinned: event.pinned }))],
        },
        Pinned: { updateMemory: ({ memory, event }) => ({ pins: [...memory.pins, event.entryId] }) },
        PinFailed: {},
        PinUnsure: [{ guard: [O.pin.retryable({ times: 2 })], actions: [O.pin.retry] }, { actions: [O.pin.cancel] }],
      },
      whenAbandoned: [callbacks.onGone.from(({ memory }) => ({ ticketId: memory.ticketId }))],
    };
  },
);
const panels = definition({
  id: "Desk/Panels",
  states: { TABS: { HISTORY: {}, CUSTOMER: {}, PARTS: {} } },
  events: { ShowTicket: { ticketId: U }, OpenTab: { tab: U }, ShowEntry: { entryId: U } },
  internalEvents: {},
  memory: { ticketId: Flow.initial(U, "T-1"), goneFor: Flow.initial(S.Array(U), []) },
  places: { history: History },
  operations: () => ({}),
});
export const panelsFixture = fixture(
  machine(panels, ({ S: St, E }) => ({
    default: St.TABS,
    on: { ShowTicket: { updateMemory: ({ event }) => ({ ticketId: event.ticketId }) } },
    states: {
      TABS: {
        default: St.TABS.HISTORY,
        on: {
          OpenTab: [
            { target: St.TABS.HISTORY, guard: [({ event }) => event.tab === "history" || deny("OtherTab")] },
            { target: St.TABS.CUSTOMER, guard: [({ event }) => event.tab === "customer" || deny("OtherTab")] },
            { target: St.TABS.PARTS },
          ],
        },
      },
      HISTORY: {
        traits: {
          history: {
            resumable: true,
            input: ({ memory }) => ({ ticketId: memory.ticketId }),
            resetOn: ({ memory }) => memory.ticketId,
            callbacks: { onGone: { updateMemory: ({ memory, event }) => ({ goneFor: [...memory.goneFor, (event as { readonly ticketId: unknown }).ticketId] }) } },
          },
        },
        on: { ShowEntry: { raise: [E.history.Highlight.from(({ event }) => ({ entryId: (event as { readonly entryId: unknown }).entryId }))] } },
      },
    },
  })),
);

// ── Deep: review's probes, as data. A late ending at depth (r14); a raise then leave (rule 6); a resumable under a resumable (M2); a frozen `.each` (M3,
// rule 60); a schedule that always throws once (M5).
const ChT = fragment({ id: "ChT", internalEvents: { Due: {} }, memory: { due: Flow.initial(S.Number, 0) } }, ({ E }) => ({
  schedules: { due: { schedule: "5 seconds", send: E.Due } },
  on: { Due: { updateMemory: ({ memory }) => ({ due: memory.due + 1 }) } },
}));
const MidT = fragment({ id: "MidT", states: { X: {}, Y: {} }, default: "X", events: { ToX: {}, ToY: {} }, places: { ch: ChT } }, ({ S: St }) => ({
  on: { ToX: St.X, ToY: St.Y },
  states: { X: { traits: { ch: { resumable: true } } } },
}));
const rowRead = resource({ id: "real/rowRead", input: { key: U }, key: ["key"], commit: (i) => call<unknown, "NoResponse">("rowRead")(i) });
const rowPut = transaction({ id: "real/rowPut", input: { key: U }, key: ["key"], concurrency: "reject", commit: write("rowPut") });
const RowT = fragment(
  {
    id: "RowT",
    events: { Sync: {}, Send: {} },
    internalEvents: { Read: {}, ReadFailed: { why: S.String }, Put: {}, PutNo: {}, PutUnsure: {} },
    memory: { why: Flow.initial(U, null), put: Flow.initial(S.Boolean, false) },
    operations: ({ E }) => ({
      rowRead: rowRead.outcomes({
        success: E.Read,
        failure: { NoResponse: E.ReadFailed.from(() => ({ why: "NoResponse" })), Defect: E.ReadFailed.from(() => ({ why: "Defect" })), Interrupted: E.ReadFailed.from(() => ({ why: "Interrupted" })) },
      }),
      rowPut: rowPut.outcomes({ success: E.Put, failure: { NotSent: E.PutNo }, unknown: E.PutUnsure }),
    }),
  },
  ({ O }) => ({
    on: {
      Sync: { actions: [O.rowRead.lookup(({ key }) => ({ key }))] },
      Read: {},
      ReadFailed: { updateMemory: ({ event }) => ({ why: event.why }) },
      Send: { actions: [O.rowPut.commit(({ key }) => ({ key }))] },
      Put: { updateMemory: () => ({ put: true }) },
      PutNo: {},
      PutUnsure: {},
    },
    whenAbandoned: [O.rowPut.cancel],
  }),
);
const FieldT = fragment(
  { id: "FieldT", hostEvents: { Typed: { value: U } }, callbacks: { onTyped: Flow.Callback({ value: U }), onGone: Flow.Callback({ value: U }) }, memory: { value: Flow.initial(U, "old") } },
  ({ callbacks }) => ({
    on: { Typed: { updateMemory: ({ event }) => ({ value: event.value }), notify: [callbacks.onTyped.from(({ event }: { readonly event: { readonly value: unknown } }) => ({ value: event.value }))] } },
    whenAbandoned: [callbacks.onGone.from(({ memory }) => ({ value: memory.value }))],
  }),
);
const job = transaction({ id: "real/job", input: { n: U }, key: [], concurrency: "reject", commit: write("job") });
const deep = (start: "A" | "B" | "C" | "FAR" | "FIELD" | "MID" | "AWAY" | "HERE" | "WAIT" | "BADMS") =>
  machine(
    definition({
      id: "Deep",
      states: { A: { B: {}, C: {} }, FAR: {}, FIELD: {}, MID: {}, AWAY: {}, HERE: {}, WAIT: {}, BADMS: {} },
      events: { Far: {}, Near: {}, SetRows: { rows: S.Array(S.String) }, Away: {}, Back: {}, Mid: {}, Poke: {}, OddEntry: {}, ToC: {}, Run: {}, TypeAndLeave: {} },
      internalEvents: { Done: {}, Failed: {}, Unsure: {}, GiveUp: {} },
      memory: { at: Flow.initial(U, null), gone: Flow.initial(U, null), rows: Flow.initial(S.Array(S.String), []), pokes: Flow.initial(S.Number, 0) },
      persisted: false,
      places: { field: FieldT, mid: MidT, rows: RowT, once: RowT },
      operations: ({ E }) => ({ job: job.outcomes({ success: E.Done, failure: { NotSent: E.Failed }, unknown: E.Unsure }) }),
    }),
    ({ S: St, E, O }) => ({
      default: { node: start },
      on: {
        Done: { updateMemory: () => ({ at: "root" }) },
        Failed: {},
        Unsure: {},
        Far: St.FAR,
        Near: St.A,
        SetRows: { updateMemory: ({ event }) => ({ rows: event.rows }) },
        Away: St.AWAY,
        Back: St.HERE,
        Mid: St.MID,
        Poke: { updateMemory: ({ memory }) => ({ pokes: memory.pokes + 1 }) },
        OddEntry: St.BADMS,
      },
      states: {
        A: { default: St.A.B, on: { Done: { updateMemory: () => ({ at: "A" }) }, ToC: St.A.C } },
        B: { on: { Run: { actions: [O.job.commit(() => ({ n: 1 }))] } } },
        // Rule 6: a part writes the trait's memory, in the turn that leaves it.
        FIELD: {
          traits: { field: { callbacks: { onTyped: {}, onGone: { updateMemory: ({ event }) => ({ gone: (event as { readonly value: unknown }).value }) } } } },
          on: { TypeAndLeave: { target: St.FAR, raise: [E.field.Typed.from(() => ({ value: "late" }))] } },
        },
        MID: { traits: { mid: { resumable: true } } },
        HERE: { traits: { rows: { resumable: true, each: { of: "rows", max: 4 } }, once: {} } },
        // A firing whose handler throws once (M5): GiveUp is the only way out, as EXPIRED's is.
        WAIT: { schedules: { giveUp: { schedule: "1 second", send: E.GiveUp } }, on: { GiveUp: { target: St.FAR, guard: [({ memory }) => memory.pokes >= 0 || deny("Never")] } } },
        // A schedule whose length is a user's value (D57).
        BADMS: { schedules: { bad: { schedule: () => Number.NaN, send: E.Poke } } },
      },
    }),
  );
const deeps = new Map<string, ReturnType<typeof fixture>>();
export const deepAt = (state: string) => deeps.get(state) ?? deeps.set(state, fixture(deep(state as "A"))).get(state)!;
export const deepFixture = deepAt("A");
void Effect;
