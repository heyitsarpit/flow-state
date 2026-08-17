import { describe, expect, it } from "vite-plus/test";
import { NewIntent, Wallet } from "./machines";
import { readCrossNetworkIntentEvidence, readWalletConnectEvidence } from "./stories";

describe("Everclear reference Stories", () => {
  it("captures quote and submission checkpoints for the cross-network route", async () => {
    const evidence = await readCrossNetworkIntentEvidence();

    expect(evidence.quoteReady.state).toBe(NewIntent.S.ACTIVE.S.QUOTE_ACTIVE);
    expect(evidence.submitted.state).toBe(NewIntent.S.ACTIVE.S.SUBMITTED);
    expect(evidence.submitted.memory.submittedIntentId).toBe("intent-1");
    expect(evidence.end.runtime.pendingWork).toMatchObject({
      ready: 0,
      activeFibers: 0,
      mailboxes: [],
      timers: [],
      streams: [],
      transactions: [],
      children: [],
    });
  });

  it("captures provider context and connector completion", async () => {
    const evidence = await readWalletConnectEvidence();

    expect(evidence.checkpoint.state).toBe(Wallet.S.WATCHING);
    expect(evidence.end.runtime.pendingWork).toMatchObject({
      ready: 0,
      activeFibers: 0,
      mailboxes: [],
      timers: [],
      streams: [],
      transactions: [],
      children: [],
    });
  });
});
