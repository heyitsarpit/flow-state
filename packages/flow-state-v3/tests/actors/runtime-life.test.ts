import { Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { mainBadge, mainCart, mainFlow, mainShopper, checkout } from "../../fixtures/shop/app.ts";
import {
  leaveWhilePaying,
  sessionCloseFails,
  signOutMidCheckout,
  unsurePayRemoved,
} from "../../fixtures/shop/stories/usual.ts";
import { unsureSaveRemoved } from "../../fixtures/sign-in/stories/usual.ts";
import {
  forgottenRetiredAuthorization,
  RETIRED_AUTHORIZATION,
} from "../../fixtures/shop/stories/sends.ts";
import { Git } from "../../fixtures/services/git/server/git.ts";
import { Shop } from "../../fixtures/services/shop/server/shop.ts";
import { RETIRED_LINK, signOutRetiredLink } from "../../fixtures/sign-in/stories/edges.ts";
import {
  connectionCloseFails,
  interruptCleanupFails as syncCleanupFails,
  leaveWhileSyncing,
  signOutWhileSyncing,
} from "../../fixtures/sync/stories/usual.ts";
import { Bank } from "../../fixtures/transfers/server/bank.ts";
import { forgottenRetiredWire, RETIRED_WIRE } from "../../fixtures/transfers/stories/edges.ts";
import { owedAtBoot } from "../../fixtures/transfers/stories/load.ts";
import {
  interruptCleanupFails,
  leaveWhileSending,
  unsureAccountRemoved,
} from "../../fixtures/transfers/stories/usual.ts";
import type { Evidence } from "../../src/host/inspect.ts";
import type { ActorRef } from "../../src/index.ts";
import type { Cut, StoryRun } from "../../src/host/testing/index.ts";
import { before } from "../checkout.ts";
import { compiledOf } from "../../src/host/inspect.ts";

// What `runtime.unsettledWrites()` said at a checkpoint.
const unsettledAt = (cut: Cut) => cut.unsettled;

// One identity's entry in the list: its actor, whether its lanes are bound, and one lane of the
// named operation.
const listed = (machine: string, name: string, bound: boolean, operation: string) =>
  expect.objectContaining({
    actor: { machine, name },
    bound,
    lanes: [expect.objectContaining({ operation })],
  });

const cleanupFailed = (records: ReadonlyArray<Evidence>) =>
  records.filter((e) => e._tag === "Issue" && e.code === "CleanupFailed");

// The records each boot report of an unbound lane names.
const unbound = (records: ReadonlyArray<Evidence>) =>
  records.flatMap((e) =>
    e._tag === "Reported" && e.code === "UnboundLane" ? Option.toArray(e.record) : [],
  );

// The evidence between two checkpoints.
const between = (run: StoryRun, from: string, to: string) =>
  before(run, to).slice(before(run, from).length);

const undecodable = (records: ReadonlyArray<Evidence>, key: string) =>
  records.filter(
    (e) =>
      e._tag === "Reported" && e.code === "RecordUndecodable" && Option.contains(e.record, key),
  );

// The order in which the identities' terminal evidence came, by machine.
const finishedOrder = (records: ReadonlyArray<Evidence>) =>
  records.flatMap((e) => (e._tag === "Finished" ? [e.actor.machine] : []));

const machineOf = (ref: ActorRef) => compiledOf(ref.machine).id;

// A held lane of a removed identity is reported UnboundLane once at each of two boots, never
// before its removal, and not once an ensure adopts it.
const unboundAtEachBoot = async (
  story: { readonly run: () => Promise<StoryRun> },
  lane: string,
) => {
  const run = await story.run();

  const named = (records: ReadonlyArray<Evidence>) =>
    unbound(records).map((r) => r.startsWith(lane));

  expect(named(between(run, "unsure", "removed"))).toEqual([]);
  expect(named(between(run, "removed", "reloaded"))).toEqual([true]);
  expect(named(between(run, "reloaded", "reloaded again"))).toEqual([true]);
  expect(named(between(run, "reloaded again", "adopted"))).toEqual([]);
};

// Forget drops a held lane whose operation and contract are gone, with HoldForgotten, so the next
// boot neither reports nor keeps it.
const forgetsRetiredHold = async (
  story: { readonly run: () => Promise<StoryRun<string>> },
  forgotten: string,
  key: string,
) => {
  const run = await story.run();
  const forgetting = between(run, "booted", forgotten);
  const afterwards = run.evidence.slice(before(run, forgotten).length);

  expect(undecodable(before(run, "booted"), key)).toHaveLength(1);
  expect(forgetting.filter((e) => e._tag === "HoldForgotten")).toHaveLength(1);
  expect(undecodable(afterwards, key)).toEqual([]);
  expect(run.checkpoints["reloaded"]?.records.stored.has(key)).toBe(false);
};

describe("unsettledWrites (Actors R20, R26)", () => {
  it("Actors R26: the transfer the bank has not taken is listed by its account, and nothing once it answers", async () => {
    const run = await leaveWhileSending.run();
    const { sending, settled } = run.checkpoints;

    expect(sending.read(Bank.transfer).map((c) => c.status)).toEqual(["held at request"]);
    expect(unsettledAt(sending)).toEqual([listed("Bank/Transfers", "acct-1", true, "transfer")]);
    expect(unsettledAt(settled)).toEqual([]);
  });

  it("Actors R26: the payment the shop has not taken is listed by its checkout, and nothing once it answers", async () => {
    const run = await leaveWhilePaying.run();
    const { paying, paid } = run.checkpoints;

    expect(paying.read(Shop.confirm).map((c) => c.status)).toEqual(["held at request"]);
    expect(unsettledAt(paying)).toEqual([listed("Checkout/Pay", "checkout-1", true, "pay")]);
    expect(unsettledAt(paid)).toEqual([]);
  });

  it("Actors R26: the sync the Git host has not taken is listed by its client, unpersisted, and nothing once it answers", async () => {
    const run = await leaveWhileSyncing.run();
    const { syncing, synced } = run.checkpoints;

    expect(syncing.read(Git.sync).map((c) => c.status)).toEqual(["held at request"]);
    expect(unsettledAt(syncing)).toEqual([listed("Git/Sync", "client", true, "sync")]);
    expect(unsettledAt(synced)).toEqual([]);
  });

  it("Actors R20, R26: a held transfer stays listed after its account is disposed, as unbound, at each later boot too, and bound again once adopted", async () => {
    const run = await unsureAccountRemoved.run();
    const { unsure, removed, reloaded, adopted } = run.checkpoints;
    const again = run.checkpoints["reloaded again"];

    expect(unsure.read(Bank.transfer).map((c) => c.status)).toEqual(["dropped at response"]);
    expect(unsettledAt(unsure)).toEqual([listed("Bank/Transfers", "acct-1", true, "transfer")]);
    expect(unsettledAt(removed)).toEqual([listed("Bank/Transfers", "acct-1", false, "transfer")]);
    expect(unsettledAt(reloaded)).toEqual([listed("Bank/Transfers", "acct-1", false, "transfer")]);
    expect(unsettledAt(again)).toEqual([listed("Bank/Transfers", "acct-1", false, "transfer")]);
    expect(unsettledAt(adopted)).toEqual([listed("Bank/Transfers", "acct-1", true, "transfer")]);
  });

  it("Actors R26: 64 accounts whose answers were held at a reload are each listed, by account, at every boot", async () => {
    const run = await owedAtBoot.run();

    const accounts = Array.from({ length: 64 }, (_, n) =>
      expect.objectContaining({ actor: { machine: "Bank/Transfers", name: `acct-${String(n)}` } }),
    );

    for (const cut of [run.checkpoints["first boot"], run.checkpoints.end]) {
      const list = unsettledAt(cut);

      expect(list).toEqual(expect.arrayContaining(accounts));
      expect(Array.isArray(list) ? list.length : -1).toBe(64);
    }
  });
});

describe("the boot report of unbound lanes (Runtime O6; Actors R20)", () => {
  it("Actors R20: a held transfer whose account was removed is reported UnboundLane at each boot until adopted, and not after", async () => {
    await unboundAtEachBoot(unsureAccountRemoved, "lane/Bank/Transfers/acct-1|transfer|");
  });

  it("Actors R20: an unsure payment whose checkout was removed is reported UnboundLane at each boot until adopted, and not after", async () => {
    await unboundAtEachBoot(unsurePayRemoved, "lane/Checkout/Pay/");
  });

  it("Actors R20: an unsure handle save whose session was removed is reported UnboundLane at each boot until adopted, and not after", async () => {
    await unboundAtEachBoot(unsureSaveRemoved, "lane/Auth/Session/");
  });
});

describe("cleanup failures (Actors R23, I33)", () => {
  it("Actors R23, I33: a payment session that fails to close at disposal is reported CleanupFailed, never success", async () => {
    const run = await sessionCloseFails.run();

    expect(cleanupFailed(run.evidence)).toHaveLength(1);
  });

  it("Actors R23, I33: a Git host connection that fails to close at disposal is reported CleanupFailed, never success", async () => {
    const run = await connectionCloseFails.run();

    expect(cleanupFailed(run.evidence)).toHaveLength(1);
  });

  it("Actors R23, I33: a sync cleanup that throws when the disposal's bound interrupts it is reported CleanupFailed, after the sync ends unknown Disposed", async () => {
    const run = await syncCleanupFails.run();

    const disposed = run.evidence.findIndex(
      (e) => e._tag === "Ended" && e.channel === "unknown" && e.reason === "Disposed",
    );

    expect(disposed).toBeGreaterThanOrEqual(0);
    expect(cleanupFailed(run.evidence.slice(disposed))).toHaveLength(1);
  });

  // A gap, red until it is fixed: inside the commit's own deadline race (`Effect.timeoutOrElse`),
  // Effect drops the cleanup's Cause when the call is interrupted, so the host never sees it.
  it.fails("Actors R23, I33: a transfer cleanup that throws inside the commit's deadline race when the disposal's bound interrupts it is reported CleanupFailed", async () => {
    const run = await interruptCleanupFails.run();

    const disposed = run.evidence.findIndex(
      (e) => e._tag === "Ended" && e.channel === "unknown" && e.reason === "Disposed",
    );

    expect(disposed).toBeGreaterThanOrEqual(0);
    expect(cleanupFailed(run.evidence.slice(disposed))).toHaveLength(1);
  });
});

describe("the disposal order (Actors R22, R23; Inspection O3)", () => {
  it("Actors R22, R23: calls are interrupted and awaited before the services are released, so a slow cleanup still cancels over its open connection and no cleanup fails", async () => {
    const run = await signOutWhileSyncing.run();
    const passed = run.checkpoints["bound passed"];
    const out = run.checkpoints["signed out"];

    expect(passed.read(Git.remoteHead).map((c) => c.status)).toEqual(["held at request"]);
    expect(passed.read(Git.cancel)).toEqual([]);
    expect(out.read(Git.cancel)).toHaveLength(1);
    expect(cleanupFailed(run.evidence)).toEqual([]);
  });

  it("Inspection O3: the Runtime's disposal gives each identity's terminal evidence, every consumer before its providers", async () => {
    const run = await signOutMidCheckout.run();
    const order = finishedOrder(between(run, "checking out", "signed out"));

    const consumes = [
      [mainBadge, mainCart],
      [mainCart, mainShopper],
      [mainFlow, mainCart],
      [mainFlow, mainShopper],
      [mainFlow, checkout],
    ] as const;

    expect(order.toSorted()).toEqual(
      [mainShopper, mainCart, mainBadge, mainFlow, checkout].map(machineOf).toSorted(),
    );

    for (const [consumer, provider] of consumes)
      expect(order.indexOf(machineOf(consumer)) < order.indexOf(machineOf(provider))).toBe(true);
  });

  it("Actors R18, R22: after the sign-out, a reload that reopens only the badge restores its cart and shopper, and nothing else", async () => {
    const run = await signOutMidCheckout.run();
    const live = run.checkpoints["badge reopened"].inspection.actors.map((a) => a.actor);
    const opened = (ref: ActorRef) => live.some((key) => key.startsWith(`${machineOf(ref)}/`));

    expect([mainBadge, mainCart, mainShopper].map(opened)).toEqual([true, true, true]);
    expect([mainFlow, checkout].map(opened)).toEqual([false, false]);
  });
});

describe("forget and a hold whose operation is gone (Actors R21)", () => {
  it("Actors R21: forget drops a held wire whose operation and contract are gone, with HoldForgotten, so the next boot neither reports nor keeps it", async () => {
    await forgetsRetiredHold(forgottenRetiredWire, "forgotten", RETIRED_WIRE);
  });

  it("Actors R21: forgetting the renewal's Pay drops its retired authorization, with HoldForgotten, so the next boot neither reports nor keeps it", async () => {
    await forgetsRetiredHold(forgottenRetiredAuthorization, "forgotten", RETIRED_AUTHORIZATION);
  });

  it("Actors R21: signing out forgets the session and drops its retired device link, with HoldForgotten, so the next boot neither reports nor keeps it", async () => {
    await forgetsRetiredHold(signOutRetiredLink, "signed out", RETIRED_LINK);
  });
});
