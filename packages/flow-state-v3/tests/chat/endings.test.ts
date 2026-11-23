import { Predicate } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { general } from "../../fixtures/chat/app.ts";
import { send } from "../../fixtures/chat/operations/writes.ts";
import { BURST, sendBurst } from "../../fixtures/chat/stories/load.ts";
import {
  askTwice,
  deleteBadUndo,
  deleteGone,
  missingHistory,
  resendLimit,
  usual,
} from "../../fixtures/chat/stories/usual.ts";
import { Chat } from "../../fixtures/chat/server/chat.ts";
import type { Cut } from "../../src/host/testing/index.ts";
import { played } from "../rules/played.ts";

// The chat thread's write endings. Expected results are Operations' rules: a mapper takes
// `(value, { input, key })` (R2); a mapper's throw refuses its row's turn, the row is tried once more
// and then kept with its issue (R11, Rows), and that issue is a view of the row, one per key, gone
// when the row closes (R6, I13); a resend is guarded by `retryable({ times })` read from the lane's
// head, whose count survives a reload (R15); one Attempt keeps one key, and a new Attempt after a
// reload a new one (R1, I16); the boot refuses a missing service by name (Operations' algorithm,
// Rows: "the boot fails MissingService").

const ids = (cut: Cut) => (cut.read(general)?.memory.messages ?? []).map((m) => m.id);

const deleteIssues = (cut: Cut) =>
  (cut.read(general)?.issues ?? []).filter((i) => i.path.join(" ").includes("deleteMessage"));

const sendKeys = (cut: Cut) => cut.read(Chat.send).map((c) => c.input.key);

describe("a mapper's context (Operations R2)", () => {
  it.fails("Operations R2: a sent message takes the server's id through the mapper's `{ input }`", async () => {
    const run = await usual.run();

    expect(ids(run.checkpoints.sent)).toEqual(["m-1", "m-2", "m-3"]);
    expect(run.checkpoints.sent.read(general)?.memory.pending).toEqual([]);
    expect(run.checkpoints.sent.read(general)?.issues).toEqual([]);
  });

  it.fails(`Operations R2 under L5: ${String(BURST)} sends in a burst go one at a time, in order, each reconciled by its own input`, async () => {
    const run = await sendBurst.run();
    const sent = run.checkpoints.sent;

    expect(run.checkpoints.queued.read(Chat.send)).toHaveLength(1);
    expect(sent.read(Chat.send).map((c) => c.input.clientId)).toEqual(
      Array.from({ length: BURST }, (_, n) => `c-${String(n)}`),
    );
    expect(ids(sent)).toEqual([
      "m-1",
      "m-2",
      ...Array.from({ length: BURST }, (_, n) => `m-${String(n + 3)}`),
    ]);
    expect(sent.read(general)?.memory.pending).toEqual([]);
  });
});

describe("a delete's key (Operations R2)", () => {
  it.fails("Operations R2: a delete of a message the server no longer has names it from the delete's key", async () => {
    const run = await deleteGone.run();

    expect(run.checkpoints.gone.read(general)?.memory.notice).toBe("m-9 was gone");
  });
});

describe("a refused ending's row and its issue (Operations R6, R11, I13)", () => {
  it("Operations R11, Rows: a delete whose mapper throws is kept with one issue naming its operation", async () => {
    const run = await deleteBadUndo.run();

    expect(deleteIssues(run.checkpoints.kept)).toHaveLength(1);
    expect(ids(run.checkpoints.kept)).toEqual(["m-1", "m-2"]);
  });

  it.fails("Operations R6, I13, T4.1: another key's delete heard cleanly leaves the kept delete's issue standing", async () => {
    const run = await deleteBadUndo.run();

    expect(
      deleteIssues(run.checkpoints["other deleted"]).map((i) => i.path.join(" ").includes("m-1")),
    ).toEqual([true]);
    expect(ids(run.checkpoints["other deleted"])).toEqual(["m-1"]);
  });

  it("Operations I13, Rows (letGo): letting the kept delete go closes its row and its issue", async () => {
    const run = await deleteBadUndo.run();

    expect(deleteIssues(run.checkpoints["let go"])).toEqual([]);
  });
});

describe("resends and keys (Operations R1, R15, I16; Records R3)", () => {
  it("Operations R15, T4.8; Records R3: two resends of an unsure message, a reload between them, then a third declined RetryLimit; the boot sends nothing", async () => {
    const run = await played(resendLimit);
    const { unsure, reloaded, limit } = run.checkpoints;

    const counts = [
      unsure,
      run.checkpoints["resent once"],
      reloaded,
      run.checkpoints["resent twice"],
      limit,
    ].map((cut) => cut.read(Chat.send).length);

    expect(counts).toEqual([1, 2, 2, 3, 3]);
    expect(new Set(sendKeys(run.end)).size).toBe(1);
    expect(run.checkpoints.limit.read(general)?.memory.notice).toBe("gave up resending");
  });

  it("WriteLanes reject: a second question while the first is on the wire is not sent", async () => {
    const run = await played(askTwice);

    expect(run.checkpoints.refused.read(Chat.ask)).toHaveLength(1);
    expect(run.checkpoints.refused.read(general)?.memory.notice).toBe("assistant Rejected");
    expect(run.checkpoints.answered.read(general)?.memory.answer).toContain("when is standup");
  });
});

describe("services at boot (Operations, Rows: MissingService)", () => {
  it.fails("Operations Rows, S7: a setup that lacks the history service is refused at boot, naming the read and the service", async () => {
    await expect(missingHistory().run()).rejects.toThrow(
      /MissingService.*Chat\/history.*HistoryApi/su,
    );
  });
});

describe("a declared idempotency (Plan Operations O1)", () => {
  it.fails("Plan Operations O1: the send declares the client id as the field the server keys it by, and a resend carries it", async () => {
    const run = await played(resendLimit);

    expect(Predicate.hasProperty(send, "idempotency") && send.idempotency).toEqual(["clientId"]);
    expect(run.end.read(Chat.send).map((c) => c.input.key)).toEqual(["c-1", "c-1", "c-1"]);
  });
});
