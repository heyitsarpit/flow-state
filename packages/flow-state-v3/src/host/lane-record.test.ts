import { Effect, Option, Result, Schema } from "effect";
import { expect, it } from "vite-plus/test";
import { decodeRecords, encodeLane, laneRecordKey } from "../core/record.ts";
import { type CallId, laneId, OwnedBy, Phase } from "../core/world.ts";
import { definition, Flow, machine, transaction } from "../index.ts";

// A persisted keyed write under one policy; the call is never run here.
const clientUnder = (concurrency: "serialize" | "cancel") => {
  const write = transaction({
    id: `Test/write-${concurrency}`,
    input: { repo: Schema.String },
    key: ["repo"],
    concurrency,
    services: [],
    commit: () => Effect.void,
  });

  const Client = definition({
    id: `Test/${concurrency}`,
    persist: true,
    states: ["READY"],
    events: {},
    internalEvents: { Done: {}, Unsure: Flow.uncertain({}) },
    memory: {},
    operations: ({ E }) => ({
      write: write.outcomes({ success: E.Done, failure: {}, unknown: E.Unsure }),
    }),
  });

  return machine(Client, ({ S }) => ({ default: S.READY, on: { Done: {}, Unsure: {} } })).compiled;
};

const input = { repo: "flow" };

// The endings a boot derives from one lane record that encodeLane wrote: a head on the wire with
// commits queued behind it and the displaced Attempts owed an ending.
const restoredFrom = (
  compiled: ReturnType<typeof clientUnder>,
  queued: number,
  displaced: ReadonlyArray<string>,
) => {
  const lane = {
    actor: { machine: compiled.id, name: "c" },
    operation: "write",
    head: {
      id: "att-2",
      input,
      retryCount: 0,
      owner: OwnedBy.Root(),
      // SAFETY: a call id is minted text; this one stands for a call on the wire.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the brand has no public constructor
      phase: Phase.OnWire({ call: "call-1" as CallId }),
    },
    queue: Array.from({ length: queued }, () => ({ input, owner: OwnedBy.Root() })),
  };

  const record = Result.getOrThrow(
    encodeLane(compiled, "write", lane.actor, Option.some(lane), displaced),
  );

  const id = laneId(lane.actor, "write", '{"repo":"flow"}');

  const restored = decodeRecords(
    new Map([[compiled.id, compiled]]),
    new Map([[laneRecordKey(id), record]]),
  );

  return restored.lanes.flatMap((l) =>
    l.endings.map((e) => `${e.channel} ${e.reason} ${Option.getOrElse(e.attempt, () => "-")}`),
  );
};

it("a lane record saves the displaced Attempts owed an ending, and a boot ends each unknown Restored (Restore R3; WriteLanes R10)", () => {
  expect(restoredFrom(clientUnder("cancel"), 0, ["att-1"])).toEqual(["unknown Restored att-1"]);
});

it("a lane record saves its queue, and a boot ends each queued commit NotSent Restored (Restore R3; Operations O3)", () => {
  expect(restoredFrom(clientUnder("serialize"), 2, [])).toEqual([
    "notSent Restored -",
    "notSent Restored -",
  ]);
});
