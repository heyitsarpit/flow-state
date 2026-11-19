import { describe, expect, it } from "vite-plus/test";
import { leaveWhilePaying, sessionCloseFails } from "../../fixtures/shop/stories/usual.ts";
import { Git } from "../../fixtures/services/git/server/git.ts";
import { Shop } from "../../fixtures/services/shop/server/shop.ts";
import { leaveWhileSyncing } from "../../fixtures/sync/stories/usual.ts";
import { Bank } from "../../fixtures/transfers/server/bank.ts";
import { forgottenRetiredWire, RETIRED_WIRE } from "../../fixtures/transfers/stories/edges.ts";
import { owedAtBoot } from "../../fixtures/transfers/stories/load.ts";
import {
  interruptCleanupFails,
  leaveWhileSending,
  unsureAccountRemoved,
} from "../../fixtures/transfers/stories/usual.ts";
import type { Evidence } from "../../src/host/inspect.ts";
import type { Cut, StoryRun } from "../../src/host/testing/index.ts";
import { before } from "../checkout.ts";

// What `runtime.unsettledWrites()` said at a checkpoint. The Cut does not carry it yet, so it is
// read by name; once built, the Cut reads it from the public call.
const unsettledAt = (cut: Cut) => ("unsettled" in cut ? cut.unsettled : undefined);

// One identity's entry in the list: its actor, whether a live actor holds its lanes, and one
// lane of the named operation.
const listed = (machine: string, name: string, bound: boolean, operation: string) =>
  expect.objectContaining({
    actor: { machine, name },
    bound,
    lanes: [expect.objectContaining({ operation })],
  });

// An Issue's code as text, so a code Flow does not name yet can be looked for.
// RETURN_TYPE: widened to string, since CleanupFailed is not in the code union yet.
const issueCode = (e: Evidence): string => (e._tag === "Issue" ? e.code : "");

// An evidence record's tag as text, so a record Flow does not make yet can be looked for.
// RETURN_TYPE: widened to string, since HoldForgotten is not an evidence tag yet.
const tagOf = (e: Evidence): string => e._tag;

const cleanupFailed = (records: ReadonlyArray<Evidence>) =>
  records.filter((e) => issueCode(e) === "CleanupFailed");

// The evidence between two checkpoints.
const between = (run: StoryRun, from: string, to: string) =>
  before(run, to).slice(before(run, from).length);

const undecodable = (records: ReadonlyArray<Evidence>, key: string) =>
  records.filter(
    (e) =>
      e._tag === "Reported" &&
      e.code === "RecordUndecodable" &&
      e.record._tag === "Some" &&
      e.record.value === key,
  );

describe("unsettledWrites (Actors R20, R26)", () => {
  it.fails("Actors R26: the transfer the bank has not taken is listed by its account, and nothing once it answers", async () => {
    const run = await leaveWhileSending.run();
    const { sending, settled } = run.checkpoints;

    expect(sending.read(Bank.transfer).map((c) => c.status)).toEqual(["held at request"]);
    expect(unsettledAt(sending)).toEqual([listed("Bank/Transfers", "acct-1", true, "transfer")]);
    expect(unsettledAt(settled)).toEqual([]);
  });

  it.fails("Actors R26: the payment the shop has not taken is listed by its checkout, and nothing once it answers", async () => {
    const run = await leaveWhilePaying.run();
    const { paying, paid } = run.checkpoints;

    expect(paying.read(Shop.confirm).map((c) => c.status)).toEqual(["held at request"]);
    expect(unsettledAt(paying)).toEqual([listed("Checkout/Pay", "checkout-1", true, "pay")]);
    expect(unsettledAt(paid)).toEqual([]);
  });

  it.fails("Actors R26: the sync the Git host has not taken is listed by its client, unpersisted, and nothing once it answers", async () => {
    const run = await leaveWhileSyncing.run();
    const { syncing, synced } = run.checkpoints;

    expect(syncing.read(Git.sync).map((c) => c.status)).toEqual(["held at request"]);
    expect(unsettledAt(syncing)).toEqual([listed("Git/Sync", "client", true, "sync")]);
    expect(unsettledAt(synced)).toEqual([]);
  });

  it.fails("Actors R20, R26: a held transfer stays listed after its account is disposed, as unbound, at the next boot too, and bound again once adopted", async () => {
    const run = await unsureAccountRemoved.run();
    const { unsure, removed, reloaded, adopted } = run.checkpoints;

    expect(unsure.read(Bank.transfer).map((c) => c.status)).toEqual(["dropped at response"]);
    expect(unsettledAt(unsure)).toEqual([listed("Bank/Transfers", "acct-1", true, "transfer")]);
    expect(unsettledAt(removed)).toEqual([listed("Bank/Transfers", "acct-1", false, "transfer")]);
    expect(unsettledAt(reloaded)).toEqual([listed("Bank/Transfers", "acct-1", false, "transfer")]);
    expect(unsettledAt(adopted)).toEqual([listed("Bank/Transfers", "acct-1", true, "transfer")]);
  });

  it.fails("Actors R26: 64 accounts whose answers were held at a reload are each listed, by account, at every boot", async () => {
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

describe("cleanup failures (Actors R23, I33)", () => {
  it.fails("Actors R23, I33: a payment session that fails to close at disposal is reported CleanupFailed, never success", async () => {
    const run = await sessionCloseFails.run();

    expect(cleanupFailed(run.evidence)).toHaveLength(1);
  });

  it.fails("Actors R23, I33: a request cleanup that throws when the disposal interrupts its transfer is reported CleanupFailed, after the transfer ends unknown Disposed", async () => {
    const run = await interruptCleanupFails.run();

    const disposed = run.evidence.findIndex(
      (e) => e._tag === "Ended" && e.channel === "unknown" && e.reason === "Disposed",
    );

    expect(disposed).toBeGreaterThanOrEqual(0);
    expect(cleanupFailed(run.evidence.slice(disposed))).toHaveLength(1);
  });
});

describe("forget and a hold whose operation is gone (Actors R21)", () => {
  it.fails("Actors R21: forget drops a held wire whose operation and contract are gone, with HoldForgotten, so the next boot neither reports nor keeps it", async () => {
    const run = await forgottenRetiredWire.run();
    const forgetting = between(run, "booted", "forgotten");
    const afterwards = run.evidence.slice(before(run, "forgotten").length);

    expect(undecodable(before(run, "booted"), RETIRED_WIRE)).toHaveLength(1);
    expect(forgetting.filter((e) => tagOf(e) === "HoldForgotten")).toHaveLength(1);
    expect(undecodable(afterwards, RETIRED_WIRE)).toEqual([]);
    expect(run.checkpoints.reloaded.records.stored.has(RETIRED_WIRE)).toBe(false);
  });
});
