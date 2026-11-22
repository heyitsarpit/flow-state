import { Effect, Layer, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { BankLive } from "../../fixtures/transfers/adapters/bank.ts";
import { Transfers } from "../../fixtures/transfers/machines/transfers.ts";
import { transfer } from "../../fixtures/transfers/operations/writes.ts";
import { Bank } from "../../fixtures/transfers/server/bank.ts";
import { AccountsFake, BankFake } from "../../fixtures/transfers/server/layer.ts";
import { BankApi } from "../../fixtures/transfers/services.ts";
import { account, bankPlanned, mainCustomer, switcher } from "../../fixtures/transfers/app.ts";
import { AccountsLive } from "../../fixtures/transfers/adapters/accounts.ts";
import type { AccountSwitcher } from "../../fixtures/transfers/machines/account-switcher.ts";
import { Customer } from "../../fixtures/transfers/machines/customer.ts";
import { switcherRecent } from "../../fixtures/transfers/stories/context.ts";
import { bankStory } from "../../fixtures/transfers/stories/usual.ts";
import { booking } from "../../fixtures/wizard/app.ts";
import type { Booking } from "../../fixtures/wizard/machines/booking.ts";
import { usual } from "../../fixtures/wizard/stories/usual.ts";
import { layerIndexedDb } from "../../src/host/persistence.ts";
import { Fake, Story } from "../../src/host/testing/index.ts";
import {
  actorRef,
  app,
  definition,
  Flow,
  machine,
  Outcome,
  runtimeSetup,
  transaction,
} from "../../src/index.ts";
import { loose } from "../../src/test/loose.ts";
import { checked } from "../rules/rules.ts";
import { heard, reports, reportsWithReasons } from "./opens.ts";

// The booking as saved once booked: its state and memory.
const BOOKED = { slotId: "s-0900", heldUntil: 900_000, warning: false };

const BOOKING = "actor/Wizard/Booking/inspection";

const EVENTS = {
  Held: { slotId: Schema.String, heldUntil: Schema.Number },
  Extended: { heldUntil: Schema.Number },
  DismissWarning: {},
  Book: {},
  PickAgain: {},
};

const MEMORY = {
  slotId: Flow.initial(Schema.String, ""),
  heldUntil: Flow.initial(Schema.Number, 0),
  warning: Flow.initial(Schema.Boolean, false),
};

// A later build of the booking: the same id, its states, memory and events as the edit declares.
const bookingBuild = (edit: {
  readonly states: ReadonlyArray<string>;
  readonly memory: { readonly [field: string]: unknown };
  readonly events: { readonly [event: string]: unknown };
}) => {
  const declared: typeof Booking = loose(
    definition(loose({ id: "Wizard/Booking", persist: true, ...edit, internalEvents: {} })),
  );

  return machine(declared, ({ S }) => ({ default: S.PICKING }));
};

// The booked booking's saved record, booted under a later build and ensured.
const bookingUnder = async (edit: Parameters<typeof bookingBuild>[0]) => {
  const saved = checked(await usual.run()).checkpoints.booked.records.stored;
  const built = bookingBuild(edit);
  const ref = actorRef(built, "inspection");

  const setup = runtimeSetup({
    app: app({ id: "wizard", machines: { booking: built } }),
    services: layerIndexedDb(),
    scope: "wizard",
    persistence: { captureMs: 0 },
  });

  const run = checked(
    await Story.app(setup, { id: "records/booking-edited", fixtures: [] })
      .world(...[...saved].map(([key, text]) => Fake.storage.put(key, text)))
      .reload()
      .ensure(ref)
      .checkpoint("restored")
      .run(),
  );

  const snapshot = run.checkpoints.restored.read(ref);

  return {
    state: snapshot?.state,
    memory: snapshot?.memory,
    reports: reportsWithReasons(run, 2),
  };
};

const STATES = ["PICKING", "HELD", "BOOKED", "EXPIRED"];

describe("restore after the booking's definition is edited (Records R7, reference table)", () => {
  it("Records reference table: reordered states, memory fields and events restore the record as saved, with nothing reported", async () => {
    expect(await usual.run().then((r) => r.checkpoints.booked.read(booking)?.state)).toBe("BOOKED");

    const restored = await bookingUnder({
      states: ["BOOKED", "EXPIRED", "PICKING", "HELD"],
      memory: { warning: MEMORY.warning, heldUntil: MEMORY.heldUntil, slotId: MEMORY.slotId },
      events: {
        PickAgain: {},
        Book: {},
        DismissWarning: {},
        Extended: EVENTS.Extended,
        Held: EVENTS.Held,
      },
    });

    expect(restored).toEqual({ state: "BOOKED", memory: BOOKED, reports: [] });
  });

  it("Records reference table: events added, removed or renamed restore the record as saved, since no event is saved", async () => {
    for (const events of [
      { ...EVENTS, Cancel: {} },
      { Held: EVENTS.Held, Book: {} },
      { Held: EVENTS.Held, Extended: EVENTS.Extended, Dismiss: {}, Book: {}, PickAgain: {} },
    ]) {
      const restored = await bookingUnder({ states: STATES, memory: MEMORY, events });

      expect(restored).toEqual({ state: "BOOKED", memory: BOOKED, reports: [] });
    }
  });

  it("Records reference table, state: a saved state the definition lacks (removed or renamed) resets the position to the initial state and memory, reported, never restored", async () => {
    for (const states of [
      ["PICKING", "HELD", "EXPIRED"],
      ["PICKING", "HELD", "CONFIRMED", "EXPIRED"],
    ]) {
      const restored = await bookingUnder({ states, memory: MEMORY, events: EVENTS });

      expect(restored.state).toBe("PICKING");
      expect(restored.memory).toEqual({ slotId: "", heldUntil: 0, warning: false });
      expect(restored.reports.map((r) => `${r.code} ${r.record}`)).toEqual([
        `RecordUndecodable ${BOOKING}`,
      ]);
    }
  });

  it("Records reference table, memory: a state and a field added restore the record as saved, the new field at its declared initial, with nothing reported", async () => {
    const restored = await bookingUnder({
      states: [...STATES, "CANCELLED"],
      memory: { ...MEMORY, note: Flow.initial(Schema.String, "none") },
      events: EVENTS,
    });

    expect(restored).toEqual({
      state: "BOOKED",
      memory: { ...BOOKED, note: "none" },
      reports: [],
    });
  });

  it("Records reference table, memory: a field removed or renamed is dropped and reported FieldDropped naming it, a renamed field starts at its initial, and the rest restores", async () => {
    const removed = await bookingUnder({
      states: STATES,
      memory: { slotId: MEMORY.slotId, heldUntil: MEMORY.heldUntil },
      events: EVENTS,
    });

    const renamed = await bookingUnder({
      states: STATES,
      memory: {
        slotId: MEMORY.slotId,
        heldUntil: MEMORY.heldUntil,
        alert: Flow.initial(Schema.Boolean, true),
      },
      events: EVENTS,
    });

    expect({ state: removed.state, memory: removed.memory }).toEqual({
      state: "BOOKED",
      memory: { slotId: "s-0900", heldUntil: 900_000 },
    });
    expect({ state: renamed.state, memory: renamed.memory }).toEqual({
      state: "BOOKED",
      memory: { slotId: "s-0900", heldUntil: 900_000, alert: true },
    });

    for (const { reports: found } of [removed, renamed])
      expect(
        found.filter((r) => String(r.code) === "FieldDropped" && r.reason.includes("warning")),
      ).toHaveLength(1);
  });

  it("Records R7: a memory field that no longer reads resets the position to the initial state and memory, reported", async () => {
    const restored = await bookingUnder({
      states: STATES,
      memory: { ...MEMORY, heldUntil: Flow.initial(Schema.String, "") },
      events: EVENTS,
    });

    expect(restored.state).toBe("PICKING");
    expect(restored.memory).toEqual({ slotId: "", heldUntil: "", warning: false });
    expect(restored.reports.map((r) => `${r.code} ${r.record}`)).toContain(
      `RecordUndecodable ${BOOKING}`,
    );
  });
});

// A second write contract an edited account may add.
const memo = transaction({
  id: "Bank/memo",
  input: { transferId: Schema.String },
  key: ["transferId"],
  concurrency: "reject",
  services: [BankApi],
  commit: () => Effect.succeed({ receipt: "memo" }),
});

// The transfer contract under another id, as a build that renamed the contract declares it.
const transferRenamed = transaction({
  id: "Bank/transfer-v2",
  input: { transferId: Schema.String, cents: Schema.Number },
  key: ["transferId"],
  concurrency: "reject",
  services: [BankApi],
  commit: (input, { attempt }) =>
    BankApi.use((api) => api.transfer(input, { idempotencyKey: attempt.id })).pipe(
      Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)),
    ),
});

type OperationEdit = "added" | "renamed" | "removed" | "contractRenamed";

// A later build of the account: the same id, events and memory; its operations as the edit names.
const accountBuild = (edit: OperationEdit) => {
  const declared: typeof Transfers = loose(
    definition(
      loose({
        id: "Bank/Transfers",
        persist: true,
        states: ["READY"],
        events: {
          Send: { transferId: Schema.String, cents: Schema.Number },
          Resend: { transferId: Schema.String },
          Abandon: { transferId: Schema.String },
        },
        internalEvents: {
          Done: { receipt: Schema.String },
          Declined: { code: Schema.String },
          NotSent: { why: Schema.String },
          Unsure: Flow.uncertain({}),
          Nudge: {},
        },
        memory: { notice: Flow.initial(Schema.String, "") },
        operations: ({ E }: { readonly E: typeof Transfers.E }) => {
          const mapped = (contract: typeof transfer) =>
            contract.outcomes({
              success: E.Done.from((v) => ({ receipt: v.receipt })),
              failure: { Declined: E.Declined.from((e) => ({ code: e.code })) },
              notSent: E.NotSent.from((e) => ({ why: e.why })),
              unknown: E.Unsure,
            });

          const built = {
            added: () => ({
              memo: memo.outcomes({
                success: E.Done.from((v) => ({ receipt: v.receipt })),
                failure: {},
                notSent: E.NotSent.from((e) => ({ why: e.why })),
                unknown: E.Unsure,
              }),
              transfer: mapped(transfer),
            }),
            renamed: () => ({ move: mapped(transfer) }),
            removed: () => ({}),
            contractRenamed: () => ({ transfer: mapped(loose(transferRenamed)) }),
          };

          return built[edit]();
        },
      }),
    ),
  );

  return machine(declared, ({ S }) => ({ default: S.READY }));
};

// The account's transfer, out at the reload, booted under a later build and ensured.
const accountUnder = async (edit: OperationEdit) => {
  const saved = checked(
    await bankStory("records/held-transfer")
      .ensure(account)
      .world(Bank.transfer.hold())
      .send(account, Transfers.E.Send({ transferId: "t1", cents: 500 }))
      .checkpoint("held")
      .run(),
  ).checkpoints.held.records.stored;

  const built = accountBuild(edit);
  const ref = actorRef(built, "acct-1");

  const setup = runtimeSetup({
    app: app({ id: "bank", machines: { transfers: built } }),
    services: Layer.merge(BankLive("https://bank.example"), layerIndexedDb()),
    scope: "bank",
    persistence: { captureMs: 0 },
  });

  const run = checked(
    await Story.app(setup, { id: `records/account-${edit}`, fixtures: [BankFake] })
      .world(...[...saved].map(([key, text]) => Fake.storage.put(key, text)))
      .reload()
      .ensure(ref)
      .checkpoint("restored")
      .run(),
  );

  const work = [...saved].filter(([key]) => !key.startsWith("actor/"));

  return {
    heard: heard(run, 2, "transfer").concat(heard(run, 2, "move")),
    carried: reports(run, 2).filter((r) => r.startsWith("ObligationCarried")).length,
    kept: work.every(([key, text]) => run.checkpoints.restored.records.stored.get(key) === text),
  };
};

describe("restore after the account's operations are edited (Records reference table, lanes contract)", () => {
  it("Records reference table: an operation added beside the held one restores its lane, and its unknown Restored is heard", async () => {
    expect((await accountUnder("added")).heard).toEqual(["Unsure"]);
  });

  it("Records reference table: an operation renamed in the machine over the same contract restores its lane, since the saved name is the contract's", async () => {
    expect((await accountUnder("renamed")).heard).toEqual(["Unsure"]);
  });

  it("Records reference table, Carried (Retired): a removed operation or a renamed contract leaves its lane carried byte for byte, not heard, and reported", async () => {
    for (const edit of ["removed", "contractRenamed"] as const)
      expect(await accountUnder(edit)).toEqual({ heard: [], carried: 1, kept: true });
  });
});

// A later build of the account switcher: its one slot removed, or renamed.
const switcherBuild = (edit: "removed" | "renamed") => {
  const declared: typeof AccountSwitcher = loose(
    definition(
      loose({
        id: "Bank/AccountSwitcher",
        persist: true,
        states: ["SHOWN"],
        events: {},
        internalEvents: { Remembered: { account: Schema.String } },
        memory: { recent: Flow.initial(Schema.Array(Schema.String), []) },
        context: edit === "removed" ? {} : { acct: Flow.context(Customer.M.account) },
      }),
    ),
  );

  return machine(declared, ({ S }) => ({ default: S.SHOWN }));
};

const SWITCHER = "actor/Bank/AccountSwitcher/switcher";

// The switcher's saved record, after the customer chose accounts, booted under a later build.
const switcherUnder = async (edit: "removed" | "renamed") => {
  const saved = checked(await switcherRecent.run()).checkpoints.chosen.records.stored;
  const built = switcherBuild(edit);
  const ref = actorRef(built, "switcher");

  const setup = runtimeSetup({
    app: app({
      id: "bank",
      machines: {
        ...bankPlanned.machines,
        switcher: {
          machine: built,
          context: loose(edit === "removed" ? {} : { acct: mainCustomer }),
        },
      },
    }),
    services: Layer.mergeAll(
      BankLive("https://bank.example"),
      AccountsLive("https://accounts.example"),
      layerIndexedDb(),
    ),
    scope: "bank",
    persistence: { captureMs: 0 },
  });

  const run = checked(
    await Story.app(setup, { id: `records/switcher-${edit}`, fixtures: [BankFake, AccountsFake] })
      .world(...[...saved].map(([key, text]) => Fake.storage.put(key, text)))
      .reload()
      .ensure(ref)
      .checkpoint("restored")
      .run(),
  );

  return {
    saved: checked(await switcherRecent.run()).checkpoints.chosen.read(switcher)?.memory.recent,
    recent: run.checkpoints.restored.read(ref)?.memory.recent,
    dropped: reportsWithReasons(run, 2).some(
      (r) =>
        String(r.code) === "FieldDropped" && r.record === SWITCHER && r.reason.includes("account"),
    ),
  };
};

describe("restore after a slot is edited (Records reference table, slots)", () => {
  it("Records reference table, slots: a slot removed or renamed is dropped and reported FieldDropped naming it, and the rest of the record restores", async () => {
    for (const edit of ["removed", "renamed"] as const) {
      const { saved, recent, dropped } = await switcherUnder(edit);

      expect(saved).toEqual(["joint-1", "acct-2", "acct-1"]);
      expect({ recent, dropped }).toEqual({ recent: saved, dropped: true });
    }
  });
});
