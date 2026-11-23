import { Effect, Option, Predicate, Schema } from "effect";
import assert from "node:assert/strict";
import { describe, expect, it } from "vite-plus/test";
import { bankPlannedSetup, mainCustomer, orderOf, rent } from "../../fixtures/transfers/app.ts";
import { EARLIEST, EPOCH, LATEST, orderDateEdges } from "../../fixtures/transfers/stories/edges.ts";
import { firstOf, manyOrders, orderOffline } from "../../fixtures/transfers/stories/load.ts";
import {
  customerFirstUnderOrder,
  orderChain,
  orderCustomerForgotten,
  orderFirst,
  orderFirstFromText,
  orderFromUnsetConfig,
  orderHearingFormsEvent,
  orderLookingUpFormsBalance,
  orderStartingAtText,
  orderWithBareContext,
  orderWithNullHandler,
  orderWithHandBuiltRead,
  orderWithHandWrittenEnding,
  orderWithoutReturn,
} from "../../fixtures/transfers/stories/structure.ts";
import {
  plannedStory,
  RENT_FIRST,
  RENT_PAUSED_UNTIL,
  standingOrder,
} from "../../fixtures/transfers/stories/usual.ts";
import { FlowError } from "../../src/index.ts";
import { played } from "../rules/played.ts";
import { loose } from "../../src/test/loose.ts";
import type { Cut } from "../../src/host/testing/index.ts";
import type { ActorRef } from "../../src/index.ts";
import type { StandingOrder } from "../../fixtures/transfers/machines/standing-order.ts";

// What a reload restores of a snapshot: all but its read rows, which no store keeps (a one-off
// read's row is absent until its next lookup; Plan Operations O6).
const restoredAt = (cut: Cut, ref: ActorRef<typeof StandingOrder>) =>
  Option.map(Option.fromUndefinedOr(cut.read(ref)), (snapshot) => ({
    ...snapshot,
    operations: new Map(
      [...snapshot.operations].filter(([, rows]) =>
        [...rows.values()].every((row) => !Predicate.hasProperty(row, "_tag")),
      ),
    ),
  }));

const refusal = (construct: () => unknown) => {
  try {
    construct();
  } catch (error) {
    if (error instanceof FlowError)
      return error.diagnostics.map(
        (d) => [d.code, d.details["reason"] ?? null, d.path.join(".")] as const,
      );

    throw error;
  }

  return [] as const;
};

const iso = Schema.decodeSync(Schema.DateFromString);

const invalidEvent = (error: unknown) =>
  error instanceof FlowError && error.code === "InvalidEvent";

describe("a standing order planned from a date (Compile R14, Actors R14)", () => {
  it("Compile R14, Actors R14: a Plan whose first date the DateFromString field holds as a Date is sent, and the rent fits the balance and is scheduled", async () => {
    const run = await played(standingOrder);

    expect(run.checkpoints.scheduled.read(rent)).toEqual(
      expect.objectContaining({
        state: "SCHEDULED",
        memory: expect.objectContaining({
          account: "acct-1",
          first: iso("2026-12-01T00:00:00.000Z"),
          cents: 9500,
          memo: "rent",
          pausedUntil: null,
        }),
      }),
    );
    const paused = run.checkpoints.paused.read(rent)?.memory;

    // A read is typed by the definition and holds each field's decoded value: a Date, never its
    // encoded string.
    expect(Predicate.isDate(paused?.pausedUntil)).toBe(true);
    expect(Predicate.isDate(paused?.first)).toBe(true);
    expect(paused?.pausedUntil).toEqual(RENT_PAUSED_UNTIL);
  });

  it("Codec I1, Restore R1: a paused order's dates read back equal after a reload, and it resumes", async () => {
    const run = await played(standingOrder);

    expect(restoredAt(run.checkpoints.reloaded, rent)).toEqual(
      restoredAt(run.checkpoints.paused, rent),
    );
    expect(run.checkpoints.reloaded.read(rent)?.memory.pausedUntil).toEqual(RENT_PAUSED_UNTIL);
    expect(run.checkpoints.resumed.read(rent)).toEqual(
      expect.objectContaining({
        state: "SCHEDULED",
        memory: expect.objectContaining({ first: RENT_FIRST, pausedUntil: null }),
      }),
    );
  });

  it("Turn R2, R12: a plan over the balance takes the second alternative, back to the draft, and says so", async () => {
    const run = await played(standingOrder);

    expect(run.checkpoints.over.read(rent)).toEqual(
      expect.objectContaining({
        state: "DRAFT",
        memory: expect.objectContaining({ cents: 20_000, notice: "more than your balance" }),
      }),
    );
  });
});

describe("standing-order dates at their edges (fixtures.md E1, E2)", () => {
  it("Compile R5, R14: the epoch, the earliest and the latest date a Date holds are planned; a memo absent or undefined is none (E2); a pause with no end holds null", async () => {
    const run = await played(orderDateEdges);
    const planned = run.checkpoints.planned;

    expect(planned.read(orderOf(0))).toEqual(
      expect.objectContaining({
        state: "PAUSED",
        memory: expect.objectContaining({ first: EPOCH, pausedUntil: null }),
      }),
    );
    expect(planned.read(orderOf(0))?.memory.memo).toBeUndefined();
    expect(planned.read(orderOf(1))).toEqual(
      expect.objectContaining({
        state: "PAUSED",
        memory: expect.objectContaining({ first: LATEST, pausedUntil: LATEST }),
      }),
    );
    expect(planned.read(orderOf(1))?.memory.memo).toBeUndefined();
    expect(planned.read(orderOf(2))).toEqual(
      expect.objectContaining({
        state: "SCHEDULED",
        memory: expect.objectContaining({ first: EARLIEST, memo: "", cents: 10_000 }),
      }),
    );
  });

  it("Codec I1, Restore R1: every edge date, null and absent memo reads back equal after a reload", async () => {
    const run = await played(orderDateEdges);

    for (const n of [0, 1, 2])
      expect(restoredAt(run.checkpoints.reloaded, orderOf(n))).toEqual(
        restoredAt(run.checkpoints.planned, orderOf(n)),
      );
  });
});

describe("standing-order payloads a send refuses (fixtures.md E2, E7)", () => {
  it("E2, E7, Actors R14, Compile R14: a first date that is null, undefined, or the ISO text the field encodes to is refused InvalidEvent", () => {
    const runtime = bankPlannedSetup.construct();
    Effect.runSync(runtime.ready());
    const handle = runtime.ensureActor(rent);

    for (const first of [null, undefined, "2026-12-01T00:00:00.000Z"])
      assert.throws(() => handle.send(loose({ _tag: "Plan", first, cents: 1 })), invalidEvent);
  });
});

describe("many standing orders under one customer (fixtures.md S2 × 32 under L4, L3)", () => {
  it("Codec I1, Restore R1: 32 orders, each planned for its own date, keep their dates across two reloads", async () => {
    const run = await played(manyOrders);

    for (const n of [0, 1, 16, 31])
      expect(run.checkpoints.end.read(orderOf(n))).toEqual(
        expect.objectContaining({
          state: "SCHEDULED",
          memory: expect.objectContaining({ first: firstOf(n), memo: `order ${String(n)}` }),
        }),
      );
  });

  it("Compile R9, Turn R2: a balance check lost to the network ends NoAnswer, mapped to BalanceFailed, back to the draft; online, the plan is scheduled", async () => {
    const run = await played(orderOffline);

    expect(run.checkpoints.unavailable.read(rent)).toEqual(
      expect.objectContaining({
        state: "DRAFT",
        memory: expect.objectContaining({ notice: "balance unavailable", first: RENT_FIRST }),
      }),
    );
    expect(run.checkpoints.scheduled.read(rent)?.state).toBe("SCHEDULED");
  });
});

describe("a standing order under its customer (fixtures.md S1 with S9, S6)", () => {
  it("Actors R21, Restore R2: the customer forgotten, the rent ensured again keeps its record but reads a fresh customer, so a new plan is denied", async () => {
    const run = await played(orderCustomerForgotten);
    const fresh = run.checkpoints.fresh;

    expect(fresh.read(mainCustomer)?.memory.account).toBe("");
    expect(fresh.read(rent)).toEqual(
      expect.objectContaining({
        state: "SCHEDULED",
        context: { customer: "" },
        memory: expect.objectContaining({ account: "", first: RENT_FIRST }),
      }),
    );
  });

  it("Actors R20: the rent disposed first, then its customer, leaves no actor", async () => {
    const run = await played(orderFirst);

    expect(run.checkpoints.disposed.inspection.actors).toEqual([]);
  });

  it("Actors R20, Stories R3: disposing the customer while the rent is bound is refused BlockedByDependents, naming the rent", async () => {
    await expect(customerFirstUnderOrder().run()).rejects.toThrow(
      /BlockedByDependents: .*Bank\/StandingOrder/u,
    );
  });

  it("Restore R1, R2: reloaded with only the rent ensured, its dates restore and it binds the customer's saved account", async () => {
    const run = await played(orderChain);

    expect(run.checkpoints.reloaded.read(rent)).toEqual(
      expect.objectContaining({
        state: "SCHEDULED",
        context: { customer: "acct-1" },
        memory: expect.objectContaining({ first: RENT_FIRST, account: "acct-1" }),
      }),
    );
  });
});

describe("a standing order written wrong is refused at construction (Compile R2, R3, R4)", () => {
  it("Compile R4: a customer slot that names its provider's id is refused WrongKind", () => {
    expect(refusal(orderWithBareContext)).toEqual([
      ["InvalidConfiguration", "WrongKind", "context.customer"],
    ]);
  });

  it("Compile R4: a handler left null is refused WrongKind", () => {
    expect(refusal(orderWithNullHandler)).toEqual([
      ["InvalidConfiguration", "WrongKind", "on.Resume"],
    ]);
  });

  it("Compile R2, R4: a configuration read before its module set it is refused WrongKind, never a raw TypeError", () => {
    expect(refusal(orderFromUnsetConfig)).toEqual([["InvalidConfiguration", "WrongKind", ""]]);
  });

  it("Compile R2, R4: an operations callback with braces and no return is refused WrongKind at operations", () => {
    expect(refusal(orderWithoutReturn)).toEqual([
      ["InvalidConfiguration", "WrongKind", "operations"],
    ]);
  });

  it('Compile R4, R5: an amount starting at the text "0" is refused WrongKind at its field', () => {
    expect(refusal(orderStartingAtText)).toEqual([
      ["InvalidConfiguration", "WrongKind", "memory.cents"],
    ]);
  });

  it("Compile R4, R5: a first date starting at the ISO text, the field's encoded side, is refused WrongKind at its field", () => {
    expect(refusal(orderFirstFromText)).toEqual([
      ["InvalidConfiguration", "WrongKind", "memory.first"],
    ]);
  });

  it("Compile R3: a lookup of the transfer form's balance, an operation of the same name, is refused ForeignToken", () => {
    expect(refusal(orderLookingUpFormsBalance)).toEqual([
      ["InvalidConfiguration", "ForeignToken", "on.Plan.0.actions.0"],
    ]);
  });

  it("Compile R3: a context reaction sending the transfer form's AccountChanged is refused ForeignToken", () => {
    expect(refusal(orderHearingFormsEvent)).toEqual([
      ["InvalidConfiguration", "ForeignToken", "onContext.0.event"],
    ]);
  });

  it("Compile R2, R4: a balance read written out by hand, half built, is one WrongKind at it, never a raw TypeError", () => {
    expect(refusal(orderWithHandBuiltRead)).toEqual([
      ["InvalidConfiguration", "WrongKind", "operations.balance"],
    ]);
  });

  it("Compile R2, R4: a reaction's hand-written ending with no mapper is refused WrongKind, never a raw TypeError", () => {
    expect(refusal(orderWithHandWrittenEnding)).toEqual([
      ["InvalidConfiguration", "WrongKind", "onContext.0.event"],
    ]);
  });
});

describe("a Story that sends a payload that is no envelope (fixtures.md E2, E7)", () => {
  it("Actors R14: a Story step sending null to the rent fails with InvalidEvent, never a raw TypeError", async () => {
    const failure = await plannedStory("transfers/null-send")
      .ensure(rent)
      .send(rent, loose(null))
      .run()
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    assert.ok(failure instanceof FlowError);
    expect(failure.code).toBe("InvalidEvent");
  });
});
