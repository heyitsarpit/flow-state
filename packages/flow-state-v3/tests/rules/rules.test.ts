import { Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { checkout } from "../../fixtures/pay/machine.ts";
import { shopStory } from "../../fixtures/pay/stories.ts";
import { Evidence } from "../../src/host/inspect.ts";
import type { StoryRun } from "../../src/host/testing/index.ts";
import { TraceRecord } from "../../src/host/trace.ts";
import { acknowledgedBeforeSent, oneBatchOut } from "./batches.ts";
import {
  endingChannels,
  endingDeliveredOnce,
  nothingAfterDefinite,
  oneIdOneInput,
  publishedOnce,
  refusedTurnIssueOnly,
  unchangedPartsKept,
} from "./rules.ts";

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
  it("Turn I30: after a Denied turn, an unchanged memory field republished as a new object is a breach; the same object is not", async () => {
    const list = ["a"];
    const denied = at(1)(Evidence.Denied({ actor: who, event: "Go", reasons: [] }));
    const kept = await crafted([at(1)(published({ list })), denied, at(1)(published({ list }))]);

    const copied = await crafted([
      at(1)(published({ list })),
      denied,
      at(1)(published({ list: ["a"] })),
    ]);

    expect(unchangedPartsKept.breaches(kept)).toEqual([]);
    expect(unchangedPartsKept.breaches(copied)).toHaveLength(1);
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
