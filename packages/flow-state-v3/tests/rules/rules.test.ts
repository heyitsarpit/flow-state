import { Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { checkout } from "../../fixtures/shop/app.ts";
import { shopStory } from "../../fixtures/shop/stories/usual.ts";
import { lostThenReload } from "../../fixtures/transfers/stories/usual.ts";
import { Evidence } from "../../src/host/inspect.ts";
import { type Cut, Step, type StoryRun } from "../../src/host/testing/index.ts";
import { TraceRecord } from "../../src/host/trace.ts";
import { acknowledgedBeforeSent, oneBatchOut } from "./batches.ts";
import { acknowledgedHeardAgain, everyCommitEndsOnce } from "./commits.ts";
import { onlyActorsWithheld, recordKinds } from "./records.ts";
import {
  endingChannels,
  endingDeliveredOnce,
  nothingAfterDefinite,
  checked,
  nothingInvokedDisposing,
  oneIdOneInput,
  owingRestoredLive,
  publishedOnce,
  publishedPlainData,
} from "./rules.ts";
import { oneStart, ownedRowsSaved } from "./starts.ts";
import { refusedTurnIssueOnly } from "./refusals.ts";
import { mailboxOrder } from "./mailbox.ts";
import { unchangedPartsKept } from "./memory.ts";

const who = { machine: "Checkout/Pay", name: "checkout-1" };

const attempt = "att-6d61696e3a31-1";

type Placed =
  | { readonly evidence: Evidence; readonly open: number }
  | { readonly write: "landed"; readonly open: number };

// A run whose evidence and writes are the given records, in order, over a real run's end cut.
const crafted = async (records: ReadonlyArray<Placed>, calls: StoryRun["end"]["calls"] = []) => {
  const real = await shopStory("rules/crafted").ensure(checkout).run();

  const events = records.map((r, n) => ({
    sequence: n + 1,
    tab: { name: "main", open: r.open },
    record:
      "evidence" in r
        ? TraceRecord.Runtime({ evidence: r.evidence })
        : TraceRecord.Write({
            purpose: "flush",
            keys: [`actor/${who.machine}/${who.name}`],
            acknowledges: [],
            status: r.write,
          }),
  }));

  return {
    ...real,
    steps: [],
    checkpoints: {},
    evidence: records.flatMap((r) => ("evidence" in r ? [r.evidence] : [])),
    end: { ...real.end, calls },
    trace: { storyId: "rules/crafted", events },
  } satisfies StoryRun;
};

const at = (open: number) => (evidence: Evidence) => ({ evidence, open });

const ended = (channel: "success" | "failure" | "unknown", reason: string) =>
  Evidence.Ended({ operation: "pay", attempt: Option.some(attempt), channel, reason, actor: who });

const delivered = Evidence.Delivered({
  operation: "pay",
  attempt: Option.some(attempt),
  event: "Paid",
  actor: who,
});

const published = (memory: Readonly<Record<string, unknown>>) =>
  Evidence.Published({ actor: who, state: "IDLE", memory });

describe("run rules over crafted runs", () => {
  it("Actors I19: one actor's endings heard out of the order they were owed is a breach; in order it is not", async () => {
    const second = "att-6d61696e3a31-2";

    const endedOf = (id: string) =>
      at(1)(
        Evidence.Ended({
          operation: "pay",
          attempt: Option.some(id),
          channel: "success",
          reason: "success",
          actor: who,
        }),
      );

    const heard = (id: string) =>
      at(1)(
        Evidence.Delivered({
          operation: "pay",
          attempt: Option.some(id),
          event: "Paid",
          actor: who,
        }),
      );

    const inOrder = await crafted([
      endedOf(attempt),
      endedOf(second),
      heard(attempt),
      heard(second),
    ]);

    const reversed = await crafted([
      endedOf(attempt),
      endedOf(second),
      heard(second),
      heard(attempt),
    ]);

    expect(mailboxOrder.breaches(inOrder)).toEqual([]);
    expect(mailboxOrder.breaches(reversed)).toHaveLength(1);
  });

  it("Turn I30: after a Denied turn, an unchanged memory field republished as a new object is a breach; the same object is not", async () => {
    const list = ["a"];
    const memory = { list };
    const denied = at(1)(Evidence.Denied({ actor: who, event: "Go", reasons: [] }));
    const kept = await crafted([at(1)(published(memory)), denied, at(1)(published(memory))]);

    const copied = await crafted([
      at(1)(published(memory)),
      denied,
      at(1)(published({ list: ["a"] })),
    ]);

    expect(unchangedPartsKept.breaches(kept)).toEqual([]);
    expect(unchangedPartsKept.breaches(copied)).toHaveLength(1);
  });

  it("Turn I30: a memory whose every field is the same value is the same object, after any turn", async () => {
    const list = ["a"];
    const moved = at(1)(Evidence.Unhandled({ actor: who, event: "Go" }));
    const copied = await crafted([at(1)(published({ list })), moved, at(1)(published({ list }))]);
    const changed = await crafted([at(1)(published({ list })), at(1)(published({ list: [] }))]);

    expect(unchangedPartsKept.breaches(copied)).toHaveLength(1);
    expect(unchangedPartsKept.breaches(copied)[0]).toContain(
      "memory is unchanged but a new object",
    );
    expect(unchangedPartsKept.breaches(changed)).toEqual([]);
  });

  it("WriteLanes I3: an unsent Attempt's unknown Restored outside its actor's start is a breach; at a start it is not", async () => {
    const restored = ended("unknown", "Restored");
    const outside = await crafted([at(2)(restored)]);
    const atStart = await crafted([at(2)(Evidence.Incarnated({ actor: who })), at(2)(restored)]);

    expect(endingChannels.breaches(outside)).toHaveLength(1);
    expect(endingChannels.breaches(atStart)).toEqual([]);
  });

  it("WriteLanes I16: unknown Restored after a delivered success is allowed only in a later open, before the success was saved", async () => {
    const sent = Evidence.Sent({ operation: "pay", attempt });
    const success = [at(1)(sent), at(1)(ended("success", "success")), at(1)(delivered)];

    const restore = [
      at(2)(Evidence.Incarnated({ actor: who })),
      at(2)(ended("unknown", "Restored")),
      at(2)(delivered),
    ];

    const unsaved = await crafted([...success, ...restore]);
    const saved = await crafted([...success, { write: "landed", open: 1 }, ...restore]);

    expect(nothingAfterDefinite.breaches(unsaved)).toEqual([]);
    expect(nothingAfterDefinite.breaches(saved)).toHaveLength(1);
  });

  it("WriteLanes I3: after a crash forgot a delivered failure, a later unknown ending of the restored Attempt is not a breach", async () => {
    const sent = Evidence.Sent({ operation: "pay", attempt });

    const run = await crafted([
      at(1)(sent),
      at(1)(ended("failure", "Declined")),
      at(1)(delivered),
      at(2)(Evidence.Incarnated({ actor: who })),
      at(2)(ended("unknown", "Restored")),
      at(2)(delivered),
      at(2)(ended("unknown", "NoResponse")),
      at(2)(delivered),
    ]);

    expect(endingChannels.breaches(run)).toEqual([]);
  });

  it("WriteLanes I15: a delivered Superseded ending is a breach, since it is recorded as evidence only", async () => {
    const run = await crafted([at(1)(ended("unknown", "Superseded")), at(1)(delivered)]);

    expect(endingDeliveredOnce.breaches(run).some((b) => b.includes("Superseded"))).toBe(true);
  });

  it("Turn I9: two snapshots after one incarnation are a breach", async () => {
    const run = await crafted([
      at(1)(Evidence.Incarnated({ actor: who })),
      at(1)(published({ n: 1 })),
      at(1)(published({ n: 2 })),
    ]);

    expect(publishedOnce.breaches(run)).toHaveLength(1);
  });

  it("Turn I14: an event's refused turn that mints is a breach", async () => {
    const run = await crafted([
      at(1)(Evidence.Issue({ code: "InvalidTurn", ending: Option.none(), slot: Option.none() })),
      at(1)(Evidence.Published({ actor: who, state: "PAYING", memory: {} })),
      at(1)(Evidence.Minted({ operation: "pay", attempt, actor: who, key: {} })),
    ]);

    expect(refusedTurnIssueOnly.breaches(run).map((b) => b.includes("also gave Minted"))).toEqual([
      true,
    ]);
  });

  it("WriteLanes I6: a request carrying an id of an Attempt's shape that was never minted is a breach", async () => {
    const run = await crafted(
      [at(1)(Evidence.Minted({ operation: "pay", attempt, actor: who, key: {} }))],
      [
        {
          server: "Shop",
          endpoint: "confirm",
          input: { key: "att-6d61696e3a31-9" },
          tab: { name: "main", open: 1 },
          step: 0,
          status: "answered",
        },
      ],
    );

    expect(oneIdOneInput.breaches(run)).toHaveLength(1);
  });
});

describe("run rules over the fake store's batches", () => {
  const batch = (
    step: number,
    answered: Option.Option<number>,
    acknowledges: Array<string> = [],
  ) => ({
    tab: { name: "main", open: 1 },
    purpose: acknowledges.length > 0 ? ("acknowledge" as const) : ("flush" as const),
    keys: [`actor/${who.machine}/${who.name}`],
    acknowledges,
    status: Option.isSome(answered) ? ("landed" as const) : ("held" as const),
    step,
    answered,
  });

  // A run whose store received the given batches and whose trace is the given events.
  // A run whose store received the given batches and whose fake servers received the given calls,
  // after one Minted report of the Attempt.
  const stored = async (
    batches: ReadonlyArray<ReturnType<typeof batch>>,
    calls: StoryRun["end"]["calls"] = [],
  ) => {
    const real = await shopStory("rules/stored").ensure(checkout).run();

    return {
      ...real,
      evidence: [Evidence.Minted({ operation: "pay", attempt, actor: who, key: {} })],
      end: { ...real.end, calls, records: { ...real.end.records, batches } },
    } satisfies StoryRun;
  };

  it("WriteAhead I23: a batch issued while the one before it is held is a breach; one issued at its answer is not", async () => {
    const held = await stored([batch(2, Option.none()), batch(3, Option.some(3))]);
    const answered = await stored([batch(2, Option.some(4)), batch(4, Option.some(4))]);

    expect(oneBatchOut.breaches(held)).toHaveLength(1);
    expect(oneBatchOut.breaches(answered)).toEqual([]);
  });

  it("WriteAhead I15: a request naming a persisted Attempt before its acknowledging batch landed is a breach; after it, not", async () => {
    const sentAt = (step: number) => [
      {
        server: "Shop",
        endpoint: "confirm",
        input: { intentId: "pi1", key: attempt },
        tab: { name: "main", open: 1 },
        step,
        status: "answered" as const,
      },
    ];

    const early = await stored([batch(1, Option.some(5), [attempt])], sentAt(4));
    const late = await stored([batch(1, Option.some(4), [attempt])], sentAt(4));

    expect(acknowledgedBeforeSent.breaches(early)).toHaveLength(1);
    expect(acknowledgedBeforeSent.breaches(late)).toEqual([]);
  });
});

// A real run with its evidence record `at` repeated `times` times (0 removes it), in its evidence
// and its trace alike, so each record keeps its place.
const repeatedAt = (run: StoryRun, at: number, times: number) => {
  const runtime = run.trace.events.flatMap((e, n) => (e.record._tag === "Runtime" ? [n] : []));
  const n = runtime[at] ?? -1;
  const event = run.trace.events[n];
  const record = run.evidence[at];

  return event === undefined || record === undefined
    ? run
    : ({
        ...run,
        evidence: run.evidence.toSpliced(at, 1, ...Array.from({ length: times }, () => record)),
        trace: {
          ...run.trace,
          events: run.trace.events.toSpliced(n, 1, ...Array.from({ length: times }, () => event)),
        },
      } satisfies StoryRun);
};

// A real run with one more evidence record at the end of tab open `open`.
const reportedIn = (run: StoryRun, open: number, evidence: Evidence) => {
  const last = run.trace.events.findLastIndex((e) => e.tab.open === open);
  const at = run.trace.events.slice(0, last + 1).filter((e) => e.record._tag === "Runtime").length;
  const sequence = (run.trace.events[last]?.sequence ?? 0) + 0.5;

  return {
    ...run,
    evidence: run.evidence.toSpliced(at, 0, evidence),
    trace: {
      ...run.trace,
      events: run.trace.events.toSpliced(last + 1, 0, {
        sequence,
        tab: { name: "main", open },
        record: TraceRecord.Runtime({ evidence }),
      }),
    },
  } satisfies StoryRun;
};

// A real run whose end cut is changed by `edit`.
const endedWith = (run: StoryRun, edit: (end: Cut) => Cut) => ({
  ...run,
  end: edit(run.end),
});

const owedRow = (delivery: string) => ({
  actor: "Transfers/Account/main",
  operation: "transfer",
  attempt: Option.none(),
  channel: "success",
  reason: "success",
  delivery,
});

describe("run rules over crafted runs, each rule seen firing", () => {
  it("Actors R10: a row unparked outside a start is a breach; right after its Incarnated it is not", async () => {
    const unparked = Evidence.Unparked({ operation: "pay", attempt: Option.some(attempt) });
    const outside = await crafted([at(1)(unparked)]);
    const started = await crafted([at(1)(Evidence.Incarnated({ actor: who })), at(1)(unparked)]);

    expect(oneStart.breaches(outside)).toHaveLength(1);
    expect(oneStart.breaches(started)).toEqual([]);
  });

  it("WriteAhead I20: a Queued row at a cut is a breach; a Kept one is not", async () => {
    const real = await crafted([]);

    const queued = endedWith(real, (end) => ({
      ...end,
      inspection: { ...end.inspection, owed: [owedRow("Queued")] },
    }));

    const kept = endedWith(real, (end) => ({
      ...end,
      inspection: { ...end.inspection, owed: [owedRow("Kept")] },
    }));

    expect(ownedRowsSaved.breaches(queued)).toHaveLength(1);
    expect(ownedRowsSaved.breaches(kept)).toEqual([]);
  });

  it("Turn R24: a published memory field that is not plain data is a breach; JSON and a Map are not", async () => {
    const symbol = await crafted([at(1)(published({ tag: Symbol("tag") }))]);
    const plain = await crafted([at(1)(published({ list: ["a"], index: new Map([["a", 1]]) }))]);

    expect(publishedPlainData.breaches(symbol)).toHaveLength(1);
    expect(publishedPlainData.breaches(plain)).toEqual([]);
  });

  it("Actors I30: a call arriving at or after its open's disposeRuntime step is a breach; one before it is not", async () => {
    const run = checked(await lostThenReload.run());
    const disposing = { ...run, steps: [Step.disposeRuntime({ forget: false }), ...run.steps] };

    const firstOpen = run.end.calls.filter((c) => c.tab.open === 1);

    expect(firstOpen.length > 0).toBe(true);
    expect(nothingInvokedDisposing.breaches(disposing)).toHaveLength(firstOpen.length);
    expect(nothingInvokedDisposing.breaches(run)).toEqual([]);
  });

  it("Restore I1: after a reload, an owed row of an identity with an actor record and no incarnation is a breach; with no row, or after a load the store refused, it is not", async () => {
    const real = await crafted([]);
    const reloaded = { ...real, steps: [Step.reload({ reattach: true, heldWrites: "abort" })] };

    const asleep = endedWith(reloaded, (end) => ({
      ...end,
      inspection: { ...end.inspection, actors: [], owed: [owedRow("Waiting")] },
      records: {
        ...end.records,
        stored: new Map([["actor/Transfers/Account/main", "{}"]]),
      },
    }));

    const nothingOwed = endedWith(asleep, (end) => ({
      ...end,
      inspection: { ...end.inspection, owed: [] },
    }));

    const unloaded = {
      ...asleep,
      trace: {
        ...asleep.trace,
        events: [
          {
            sequence: 1,
            tab: { name: "main", open: 2 },
            record: TraceRecord.Step({
              index: 0,
              step: asleep.steps[0] ?? Step.checkpoint({ name: "-" }),
            }),
          },
          {
            sequence: 2,
            tab: { name: "main", open: 2 },
            record: TraceRecord.Runtime({
              evidence: Evidence.Reported({
                code: "StorageFailure",
                record: Option.none(),
                reason: "refused",
              }),
            }),
          },
        ],
      },
    };

    expect(owingRestoredLive.breaches(asleep)).toHaveLength(1);
    expect(owingRestoredLive.breaches(nothingOwed)).toEqual([]);
    expect(owingRestoredLive.breaches(unloaded)).toEqual([]);
  });

  it("WriteLanes I27: an Attempt minted twice for one admitted commit is a breach; the run as it ran is not", async () => {
    const run = checked(await lostThenReload.run());
    const minted = run.evidence.findIndex((e) => e._tag === "Minted");

    expect(minted >= 0).toBe(true);
    expect(everyCommitEndsOnce.breaches(repeatedAt(run, minted, 2))).toHaveLength(1);
    expect(everyCommitEndsOnce.breaches(run)).toEqual([]);
  });

  it("WriteAhead I17: an acknowledged Attempt no later open hears is a breach; heard as unknown Restored it is not", async () => {
    const run = checked(await lostThenReload.run());
    const restored = run.evidence.findIndex((e) => e._tag === "Ended" && e.reason === "Restored");

    expect(restored >= 0).toBe(true);
    expect(acknowledgedHeardAgain.breaches(repeatedAt(run, restored, 0))).toHaveLength(1);
    expect(acknowledgedHeardAgain.breaches(run)).toEqual([]);
  });

  it("WriteAhead I17: an acknowledged Attempt unheard is excused only by its own lane record left unread, never by a sibling lane's, nor by an open whose store failed to load", async () => {
    const run = checked(await lostThenReload.run());
    const restored = run.evidence.findIndex((e) => e._tag === "Ended" && e.reason === "Restored");
    const unheard = repeatedAt(run, restored, 0);

    const lane = run.end.records.batches
      .filter((b) => b.status === "landed" && b.acknowledges.length > 0)
      .flatMap((b) => b.keys.filter((k) => k.startsWith("lane/")))[0];

    expect(lane).toBeDefined();

    const unread = (key: string) =>
      Evidence.Reported({ code: "RecordUndecodable", record: Option.some(key), reason: "schema" });

    const sibling = `${(lane ?? "").slice(0, (lane ?? "").indexOf("|"))}|Bank/other|{}`;

    const unloaded = Evidence.Reported({
      code: "StorageFailure",
      record: Option.none(),
      reason: "load",
    });

    expect(acknowledgedHeardAgain.breaches(reportedIn(unheard, 2, unread(lane ?? "")))).toEqual([]);
    expect(acknowledgedHeardAgain.breaches(reportedIn(unheard, 2, unread(sibling)))).toHaveLength(
      1,
    );
    expect(acknowledgedHeardAgain.breaches(reportedIn(unheard, 2, unloaded))).toEqual([]);
  });

  it("WriteAhead I17: an acknowledged Attempt unheard is never excused by another identity's lane record left unread, though one batch wrote both", async () => {
    const run = checked(await lostThenReload.run());
    const restored = run.evidence.findIndex((e) => e._tag === "Ended" && e.reason === "Restored");
    const other = "lane/Bank/Transfers/other|Bank%2Ftransfer|{}";

    const sharing = endedWith(repeatedAt(run, restored, 0), (end) => ({
      ...end,
      records: {
        ...end.records,
        batches: end.records.batches.map((b) =>
          b.acknowledges.length > 0 ? { ...b, keys: [...b.keys, other] } : b,
        ),
      },
    }));

    const unread = Evidence.Reported({
      code: "RecordUndecodable",
      record: Option.some(other),
      reason: "schema",
    });

    expect(acknowledgedHeardAgain.breaches(reportedIn(sharing, 2, unread))).toHaveLength(1);
  });

  it("Codec I7: a stored key of no record kind is a breach; the Runtime's own records are not", async () => {
    const run = checked(await lostThenReload.run());

    const stray = endedWith(run, (end) => ({
      ...end,
      records: { ...end.records, stored: new Map([...end.records.stored, ["stray/x", "{}"]]) },
    }));

    expect(run.end.records.stored.size > 0).toBe(true);
    expect(recordKinds.breaches(stray)).toHaveLength(1);
    expect(recordKinds.breaches(run)).toEqual([]);
  });

  it("WriteAhead I21: an UnencodableValue naming a lane record is a breach; one naming an actor record is not", async () => {
    const reported = (record: string) =>
      at(1)(
        Evidence.Reported({
          code: "UnencodableValue",
          record: Option.some(record),
          reason: "nonFinite at memory.total",
        }),
      );

    const lane = await crafted([reported("lane/Transfers/Account/main|transfer|t1")]);
    const actor = await crafted([reported("actor/Transfers/Account/main")]);

    expect(onlyActorsWithheld.breaches(lane)).toHaveLength(1);
    expect(onlyActorsWithheld.breaches(actor)).toEqual([]);
  });
});
