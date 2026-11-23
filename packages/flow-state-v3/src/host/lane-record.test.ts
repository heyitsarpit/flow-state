import { Brand, Effect, Option, Result, Schema } from "effect";
import { expect, it } from "vite-plus/test";
import { admit } from "../core/admit.ts";
import { workKey } from "../core/persist.ts";
import { encodeWork } from "../core/record-work.ts";
import { Delivery, Origin, type Owed, type OwedId, Route } from "../core/ledger.ts";
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
      progress: Option.none(),
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

it("a Held head whose unknown is still owed saves it in its slot, and a boot owes that unknown again, not a new one (Records R16, Types HeadShape)", () => {
  const compiled = clientUnder("serialize");
  const machines = new Map([[compiled.id, compiled]]);
  const actor = { machine: compiled.id, name: "c" };
  const id = laneId(actor, "write", '{"repo":"flow"}');

  const head = {
    id: attempt(minted(2)),
    input,
    retryCount: 0,
    owner: OwnedBy.Root(),
    phase: Phase.Held(),
    progress: Option.none(),
  };

  const unknown: Owed = {
    id: Brand.nominal<OwedId>()("owed-1"),
    origin: Origin.Decided(),
    actor,
    life: Option.none(),
    operation: "write",
    attempt: Option.some(head.id),
    lane: Option.some(id),
    channel: "unknown",
    reason: "Lost",
    value: undefined,
    route: Route.Current(),
    delivery: Delivery.Waiting(),
    input: Option.some(input),
    refusal: Option.none(),
  };

  const work = Result.getOrThrow(
    encodeWork(machines, {
      actor,
      lanes: [[id, { actor, operation: "write", head, queue: [] }]],
      displaced: [],
      rows: [unknown],
      carried: [],
    }),
  );

  const restored = admit(
    machines,
    new Map([[workKey(actor), Option.getOrElse(work.text, () => "")]]),
  );

  expect(
    restored.rows.map(({ row, derived }) => `${row.channel} ${row.reason} ${String(derived)}`),
  ).toEqual(["unknown Lost false"]);
});
