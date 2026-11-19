import { Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { account } from "../../fixtures/transfers/app.ts";
import { TransfersMachine } from "../../fixtures/transfers/machines/transfers.ts";
import { Bank } from "../../fixtures/transfers/server/bank.ts";
import { lostThenReload } from "../../fixtures/transfers/stories/usual.ts";
import { type Cut, Step } from "../../src/host/testing/index.ts";
import { render, type TraceEvent, TraceRecord } from "../../src/host/trace.ts";
import { checked } from "../rules/rules.ts";

// A record's kind is its key's text before the first slash (Codec R5).
const kinds = (keys: ReadonlyArray<string>) =>
  [...new Set(keys.map((key) => key.slice(0, key.indexOf("/"))))].toSorted();

// What the acceptance asks the trace to show: steps, requests, endings and store writes.
const shown = (e: TraceEvent) =>
  TraceRecord.$match(e.record, {
    Step: ({ step }) => [
      [e.tab.open, "step", Step.$is("checkpoint")(step) ? `checkpoint ${step.name}` : step._tag],
    ],
    Request: ({ server, endpoint, input, status }) => [
      [e.tab.open, "request", `${server}.${endpoint}`, input["transferId"], input["cents"], status],
    ],
    Write: ({ purpose, keys, status }) => [[e.tab.open, "write", purpose, kinds(keys), status]],
    Runtime: ({ evidence }) =>
      evidence._tag === "Ended"
        ? [[e.tab.open, "ending", evidence.operation, evidence.channel, evidence.reason]]
        : [],
  });

// An account's transfer row.
const row = (cut: Cut, transferId: string) => {
  const snapshot = cut.read(account);

  return snapshot === undefined
    ? undefined
    : TransfersMachine.definition.O.transfer.get(snapshot.operations, { transferId });
};

describe("A run's trace (Stories R16)", () => {
  it("shows each step, request, ending and store write of a lost answer and a reload, in order (Stories I20); the lost answer reads unknown after the reload and reached the bank once (Restore R3, I6)", async () => {
    const run = checked(await lostThenReload.run());
    const { sending, reloaded } = run.checkpoints;

    expect(row(sending, "t1")).toEqual(
      Option.some({ pending: true, uncertain: false, waiting: false, retryCount: 0 }),
    );
    expect(reloaded.now).toBe(5000);
    expect(reloaded.read(Bank.transfer).map((c) => c.status)).toEqual(["held at response"]);
    expect(Object.keys(reloaded.read(Bank).receipts)).toHaveLength(1);
    expect(reloaded.inspection.lanes).toEqual([
      expect.objectContaining({ contract: "Bank/transfer", state: "Held" }),
    ]);
    expect(row(reloaded, "t1")).toEqual(
      Option.some({ pending: false, uncertain: true, waiting: false, retryCount: 0 }),
    );
    expect(reloaded.read(account)?.memory).toEqual({ notice: "check your statement" });

    expect(run.trace.storyId).toBe("transfers/lost-then-reload");
    expect(run.trace.events.flatMap(shown)).toEqual([
      [1, "step", "ensure"],
      // A new persisted actor's record is written at once with captureMs 0 (WriteAhead R10), as a
      // plain flush: the Store's "capture" is a lane record's before a re-send.
      [1, "write", "flush", ["actor"], "landed"],
      [1, "step", "world"],
      [1, "step", "send"],
      // A first send's acknowledgement is one batch with its turn's capture, and lands before the
      // adapter is called (WriteAhead R10, R13).
      [1, "write", "acknowledge", ["actor", "lane"], "landed"],
      // The handler ran and its answer is held, never released (Stories R9, R10).
      [1, "request", "Bank.transfer", "t1", 500, "held at response"],
      [1, "step", "checkpoint sending"],
      // Nothing is due before the nudge at 20 s.
      [1, "step", "advance"],
      [1, "step", "reload"],
      // The lane record is in flight, so the identity is restored live at ready and its Start
      // delivers unknown Restored (Restore R1, R3).
      [2, "ending", "transfer", "unknown", "Restored"],
      // The memory changed, the start restored the lane Held, and the owed entry the step touched
      // is projected as its removal, since the row was heard in the same step (WriteAhead R5, R10).
      [2, "write", "flush", ["actor", "lane", "owed"], "landed"],
      [2, "step", "checkpoint reloaded"],
    ]);
  });

  it("WriteAhead R5: a lane record reads inFlight false once its head is Held, a restored one included", async () => {
    const { reloaded } = checked(await lostThenReload.run()).checkpoints;

    const lanes = [...reloaded.records.stored].filter(([key]) => key.startsWith("lane/"));

    expect(reloaded.inspection.lanes.map((l) => l.state)).toEqual(["Held"]);
    expect(lanes.map(([, value]) => JSON.parse(value).inFlight)).toEqual([false]);
  });

  it("names the ending's Attempt as the request's idempotency key (WriteLanes R5)", async () => {
    const { trace } = checked(await lostThenReload.run());

    const keys = trace.events.flatMap((e) =>
      TraceRecord.$is("Request")(e.record) ? [e.record.input["key"]] : [],
    );

    const attempts = trace.events.flatMap((e) =>
      TraceRecord.$is("Runtime")(e.record) && e.record.evidence._tag === "Ended"
        ? [e.record.evidence.attempt]
        : [],
    );

    expect(attempts).toEqual([Option.some(keys[0])]);
  });

  it("stamps a run-wide sequence from 1 with no gap, and its evidence is run.evidence (Stories I20)", async () => {
    const run = checked(await lostThenReload.run());

    expect(run.trace.events.map((e) => e.sequence)).toEqual(run.trace.events.map((_, n) => n + 1));
    expect(
      run.trace.events.flatMap((e) =>
        TraceRecord.$is("Runtime")(e.record) ? [e.record.evidence] : [],
      ),
    ).toEqual(run.evidence);
  });

  it("is the same for two runs of one Story (Stories I21)", async () => {
    const first = checked(await lostThenReload.run());
    const second = checked(await lostThenReload.run());

    expect(second.trace).toEqual(first.trace);
    expect(render(second.trace, "text")).toBe(render(first.trace, "text"));
  });

  it("prints as text, kept as a change detector only", async () => {
    const run = checked(await lostThenReload.run());

    await expect(render(run.trace, "text")).toMatchFileSnapshot("./lost-then-reload.trace.txt");
  });
});
