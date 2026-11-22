import { Brand, Effect, Option, Result, Schema } from "effect";
import { expect, it } from "vite-plus/test";
import { admit } from "../core/admit.ts";
import { workKey } from "../core/persist.ts";
import { encodeWork } from "../core/record-work.ts";
import { attempt } from "../core/test/ids.ts";
import { type CallId, laneId, OwnedBy, Phase } from "../core/world.ts";
import { definition, Flow, machine, transaction } from "../index.ts";
import { compiledOf } from "../compiled-of.ts";

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

  return compiledOf(
    machine(Client, ({ S }) => ({ default: S.READY, on: { Done: {}, Unsure: {} } })),
  );
};

const input = { repo: "flow" };

// An Attempt id in the mint's form.
const minted = (n: number) => `att-${"0".repeat(32)}-${n}`;

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
      id: attempt(minted(2)),
      input,
      retryCount: 0,
      owner: OwnedBy.Root(),
      phase: Phase.OnWire({ call: Brand.nominal<CallId>()("call-1") }),
    },
    queue: Array.from({ length: queued }, () => ({ input, owner: OwnedBy.Root() })),
  };

  const id = laneId(lane.actor, "write", '{"repo":"flow"}');
  const machines = new Map([[compiled.id, compiled]]);

  const work = Result.getOrThrow(
    encodeWork(machines, {
      actor: lane.actor,
      lanes: [[id, lane]],
      displaced: displaced.map((d) => ({
        actor: lane.actor,
        operation: "write",
        lane: id,
        head: { ...lane.head, id: attempt(d) },
        owed: true,
      })),
      rows: [],
      carried: [],
    }),
  );

  const restored = admit(
    machines,
    new Map([[workKey(lane.actor), Option.getOrElse(work.text, () => "")]]),
  );

  return restored.rows.flatMap(({ row, derived }) =>
    derived ? [`${row.channel} ${row.reason} ${Option.getOrElse(row.attempt, () => "-")}`] : [],
  );
};

it("a work record saves the displaced Attempts owed an ending, and a boot ends each unknown Restored before the head's own (Records R16; WriteLanes R10)", () => {
  expect(restoredFrom(clientUnder("cancel"), 0, [minted(1)])).toEqual([
    `unknown Restored ${minted(1)}`,
    `unknown Restored ${minted(2)}`,
  ]);
});

it("a work record saves a lane's queue, and a boot ends each queued commit NotSent Restored before the head's unknown (Records R16; Operations O3)", () => {
  expect(restoredFrom(clientUnder("serialize"), 2, [])).toEqual([
    "notSent Restored -",
    "notSent Restored -",
    `unknown Restored ${minted(2)}`,
  ]);
});
