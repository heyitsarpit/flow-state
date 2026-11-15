import { describe, expect, it } from "vite-plus/test";
import { lostThenReload } from "../../fixtures/transfers/stories.ts";
import { Step } from "../../src/host/testing/index.ts";
import { render, type TraceEvent, TraceRecord } from "../../src/host/trace.ts";
import { checked } from "../rules/rules.ts";

// A record's kind is its key's text before the first slash (Codec R5).
const kinds = (keys: ReadonlyArray<string>) =>
  [...new Set(keys.map((key) => key.slice(0, key.indexOf("/"))))].toSorted();

// What the acceptance asks the trace to show: steps, requests, endings and store writes.
const shown = (e: TraceEvent) =>
  TraceRecord.$match(e.record, {
    Step: ({ step }) => [
      [e.page, "step", Step.$is("checkpoint")(step) ? `checkpoint ${step.name}` : step._tag],
    ],
    Request: ({ server, endpoint, input, status }) => [
      [e.page, "request", `${server}.${endpoint}`, input["transferId"], input["cents"], status],
    ],
    Write: ({ purpose, keys, status }) => [[e.page, "write", purpose, kinds(keys), status]],
    Runtime: ({ evidence }) =>
      evidence._tag === "Ended"
        ? [[e.page, "ending", evidence.operation, evidence.channel, evidence.reason]]
        : [],
  });

describe("A run's trace (Stories R16)", () => {
  it("shows each step, request, ending and store write of a lost answer and a reload, in order (Stories I20)", async () => {
    const run = checked(await lostThenReload.run());

    expect(run.trace.storyId).toBe("transfers/lost-then-reload");
    expect(run.trace.events.flatMap(shown)).toEqual([
      [0, "step", "ensure"],
      // A new persisted actor's record is written at once with captureMs 0 (WriteAhead R10), as a
      // plain flush: the Store's "capture" is a lane record's before a re-send.
      [0, "write", "flush", ["actor"], "landed"],
      [0, "step", "world"],
      [0, "step", "send"],
      // A first send's acknowledgement is one batch with its turn's capture, and lands before the
      // adapter is called (WriteAhead R10, R13).
      [0, "write", "acknowledge", ["actor", "lane"], "landed"],
      // The handler ran and its answer is held, never released (Stories R9, R10).
      [0, "request", "Bank.transfer", "t1", 500, "held at response"],
      [0, "step", "checkpoint sending"],
      // Nothing is due before the nudge at 20 s.
      [0, "step", "advance"],
      [0, "step", "reload"],
      // The lane record is in flight, so the identity is restored live at ready and its Start
      // delivers unknown Restored (Restore R1, R3).
      [1, "ending", "transfer", "unknown", "Restored"],
      // The memory changed, and the owed entry the step touched is projected as its removal, since
      // the row was heard in the same step (WriteAhead R5, R10). R5 also wants the lane record here,
      // now Held: the inverted test below pins that gap.
      [1, "write", "flush", ["actor", "owed"], "landed"],
      [1, "step", "checkpoint reloaded"],
    ]);
  });

  it.fails("WriteAhead R5: a lane record reads inFlight false once its head is Held, a restored one included", async () => {
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

    expect(attempts).toEqual([expect.objectContaining({ _tag: "Some", value: keys[0] })]);
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
