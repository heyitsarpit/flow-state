import { Predicate } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { general, hub, random, threadOf } from "../../fixtures/chat/app.ts";
import { manyThreads, THREADS } from "../../fixtures/chat/stories/load.ts";
import {
  echoInPreview,
  firstReaderLeft,
  historyDown,
  noReaderLeft,
  oneReaderLeft,
  releaseOverdue,
  postedMidRead,
  refreshAndLeave,
  sentWriteInvalid,
  sentWritesHistory,
  unsureThenPosted,
  twoThreads,
  unsentEcho,
  usual,
} from "../../fixtures/chat/stories/usual.ts";
import { Chat } from "../../fixtures/chat/server/chat.ts";
import type { Cut } from "../../src/host/testing/index.ts";

// The chat app's reads, judged by what the chat server received (its call log) and what each actor
// shows. Expected results are the entry table and slot cells of Operations' `algorithm`: equal
// contract and key share one request (R3); data younger than `staleTime` serves an ask with no
// request (R4, the "fresh" view); an entry's request runs while any hold remains and is released
// when the last leaves (Releases); a released call past the disposal bound is an issue for holders
// of its key (R8, I11). The history read's `staleTime` is 30 seconds.

const historyCalls = (cut: Cut, thread: string) =>
  cut.read(Chat.history).filter((c) => c.input.thread === thread);

const ids = (cut: Cut) => (cut.read(general)?.memory.messages ?? []).map((m) => m.id);

const codes = (cut: Cut) => (cut.read(hub)?.issues ?? []).map((i) => i.code);

describe("chat history: one entry per thread (Operations R3, R4, R5)", () => {
  it("Operations R3: the sidebar and the thread waiting on one thread's history share one request", async () => {
    const run = await usual.run();

    expect(historyCalls(run.checkpoints.joining, "general")).toHaveLength(1);
    expect(run.checkpoints.joined.read(general)?.state).toBe("READY");
    expect(run.checkpoints.joined.read(hub)?.memory.preview).toBe("standup at ten");
  });

  it("Operations R4, entry table (Ask Lookup, Idle, fresh): joining again ten seconds on is served from the entry, with no request", async () => {
    const run = await usual.run();

    expect(historyCalls(run.checkpoints["joined again"], "general")).toHaveLength(1);
    expect(ids(run.checkpoints["joined again"])).toEqual(["m-1", "m-2", "m-3"]);
  });

  it("Operations R4, entry table (Ask Lookup, Idle, not fresh): joining once the history is 40 seconds old reads it again", async () => {
    const run = await usual.run();

    expect(historyCalls(run.checkpoints.stale, "general")).toHaveLength(2);
    expect(ids(run.checkpoints.stale)).toEqual(["m-1", "m-2", "m-3"]);
  });

  it("Operations R3: two threads read at once are two requests, and the sidebar joins the one it opens", async () => {
    const run = await twoThreads.run();

    expect(historyCalls(run.checkpoints.reading, "general")).toHaveLength(1);
    expect(historyCalls(run.checkpoints.reading, "random")).toHaveLength(1);
    expect(run.checkpoints.read.read(hub)?.memory.preview).toBe("standup at ten");
    expect(run.checkpoints.read.read(random)?.state).toBe("READY");
  });

  it("Operations R3, T4.3, StepBoundary: two readers share one request; one closed, it runs on for the other, which hears it", async () => {
    const run = await oneReaderLeft.run();

    expect(historyCalls(run.checkpoints["one left"], "general")).toHaveLength(1);
    expect(historyCalls(run.checkpoints.answered, "general").map((c) => c.status)).toEqual([
      "answered",
    ]);
    expect(run.checkpoints.answered.read(hub)?.memory.preview).toBe("standup at ten");
  });

  it("Operations R3, T4.3, Occasions (a request belongs to its entry): the reader that started the request closed, it runs on for the other, which hears it", async () => {
    const run = await firstReaderLeft.run();

    expect(historyCalls(run.checkpoints.answered, "general").map((c) => c.status)).toEqual([
      "answered",
    ]);
    expect(run.checkpoints.answered.read(hub)?.memory.preview).toBe("standup at ten");
  });

  it("Operations R3, T4.3, entry table (Last hold left, Running): two readers share one request; the last gone, it is stopped", async () => {
    const run = await noReaderLeft.run();

    expect(historyCalls(run.checkpoints.released, "general").map((c) => c.status)).toEqual([
      "handled",
    ]);
  });

  it(`Operations R3 under load: ${String(THREADS)} threads, each read by its thread and the sidebar, make one request each`, async () => {
    const run = await manyThreads.run();

    expect(run.checkpoints.reading.read(Chat.history)).toHaveLength(THREADS);
    expect(
      Array.from({ length: THREADS }, (_, n) => run.checkpoints.read.read(threadOf(n))?.state),
    ).toEqual(Array.from({ length: THREADS }, () => "READY"));
  });
});

describe("a released history read (Operations R8, I11)", () => {
  it("Operations R8, I11, T4.5: a read told to stop that runs on shows no issue before the disposal bound, one after it for the holder of its key, and none once it ends", async () => {
    const run = await releaseOverdue.run();

    const { released, ended } = run.checkpoints;

    expect(
      [released, run.checkpoints["before bound"], run.checkpoints["past bound"], ended].map(codes),
    ).toEqual([[], [], ["ReleaseOverdue"], []]);
  });

  it("Operations Releases (evidence): each released call past the bound records ReleaseOverdue once, and Released once when it ends", async () => {
    const run = await releaseOverdue.run();

    const overdue = run.evidence.filter(
      (e) => Predicate.isTagged(e, "Issue") && e.code === "ReleaseOverdue",
    );

    const released = run.evidence.filter(
      (e) => Predicate.isTagged(e, "Lane") && e.kind === "Released" && e.operation === "history",
    );

    // One call is released: the first read of general, left when the sidebar opened random.
    expect(overdue).toHaveLength(1);
    expect(released).toHaveLength(1);
  });
});

describe("invalidate, refetch and clear on the history (Operations entry table, T4.4)", () => {
  it("Operations T4.4 (Invalidate, Running behind; Settled behind): the thread hears the trailing read's answer, not the one asked before the post", async () => {
    const run = await postedMidRead.run();
    const { posted, joined } = run.checkpoints;

    expect(historyCalls(posted, "general")).toHaveLength(1);
    expect(historyCalls(joined, "general")).toHaveLength(2);
    expect(ids(joined)).toEqual(["m-1", "m-2", "m-3"]);
  });

  it("Plan Operations O5 (unknown asks again once); entry table (Invalidate with no waiter; Ask Lookup, Running behind): the sidebar hears a read asked after the post", async () => {
    const run = await unsureThenPosted.run();
    const { unsure, previewed } = run.checkpoints;

    expect(historyCalls(unsure, "general")).toHaveLength(2);
    expect(historyCalls(previewed, "general")).toHaveLength(3);
    expect(previewed.read(hub)?.memory.preview).toBe("are you there");
  });

  it("Operations, entry table (Ask Refetch, Idle; Clear, Idle): a refresh reads fresh data again, and leaving forgets it so the sidebar reads again", async () => {
    const run = await refreshAndLeave.run();
    const { refreshed, reopened } = run.checkpoints;

    expect(historyCalls(refreshed, "general")).toHaveLength(2);
    expect(ids(refreshed)).toEqual(["m-1", "m-2", "m-3"]);
    expect(historyCalls(reopened, "general")).toHaveLength(3);
    expect(reopened.read(hub)?.memory.preview).toBe("lunch?");
  });
});

describe("a read's Defect as an issue (Operations, Issue view: Entry)", () => {
  it("Operations, Issue view (Entry): a history read that dies is an issue on the thread's read, gone once a read lands", async () => {
    const run = await historyDown.run();
    const { died, read } = run.checkpoints;

    expect((died.read(general)?.issues ?? []).map((i) => i.summary)).toEqual([
      'read history {"thread":"general"} raised Defect',
    ]);
    expect(read.read(general)?.issues).toEqual([]);
    expect(ids(read)).toEqual(["m-1", "m-2"]);
  });
});

describe("a send's success write on the history (Plan Operations O3; entry table, Written)", () => {
  it("Plan Operations O3; Operations R4, I9 (Written, Running): the send's write answers the sidebar waiting on a held read", async () => {
    const run = await sentWritesHistory.run();
    const { sent } = run.checkpoints;

    expect(historyCalls(sent, "general")).toHaveLength(2);
    expect(sent.read(hub)?.memory.preview).toBe("hello");
    expect(run.evidence.filter((e) => Predicate.isTagged(e, "InvalidUpdate"))).toEqual([]);
  });

  it("Plan Operations O3 (InvalidUpdate), O5 (any invalid target rejects the whole batch): a send whose answer leaves the thread empty applies neither of its two writes, not even the valid one, is reported once, and succeeds", async () => {
    const run = await sentWriteInvalid.run();
    const { sent } = run.checkpoints;

    expect(run.evidence.filter((e) => Predicate.isTagged(e, "InvalidUpdate"))).toHaveLength(1);
    expect(sent.read(hub)?.memory.preview).toBe("");
    expect(sent.read(general)?.memory.pending).toEqual([]);
    expect(sent.read(general)?.memory.sent).toEqual({ "c-1": "m-3" });
  });
});

describe("a send's echo on the history (Plan Operations O5)", () => {
  it("Plan Operations O5: a fresh history serves the sidebar with a held send's echo applied, with no request, and the message stays once sent", async () => {
    const run = await echoInPreview.run();
    const { previewed, sent } = run.checkpoints;

    expect(historyCalls(previewed, "general")).toHaveLength(1);
    expect(previewed.read(hub)?.memory.preview).toBe("hello");
    expect(sent.read(hub)?.memory.preview).toBe("hello");
    expect(ids(sent)).toEqual(["m-1", "m-2", "m-3"]);
  });

  it("Plan Operations O5: a send cancelled on the wire takes its echo off the history, so the sidebar previews the server's last message", async () => {
    const run = await unsentEcho.run();
    const { previewed } = run.checkpoints;

    expect(previewed.read(hub)?.memory.preview).toBe("standup at ten");
    expect(ids(previewed)).toEqual(["m-1", "m-2"]);
  });
});
