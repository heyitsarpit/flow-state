import { makeFreezer } from "./frozen.ts";
import { Effect, Option, Schema } from "effect";
import { expect, it } from "vite-plus/test";
import { transaction } from "../contract.ts";
import { definition } from "../definition.ts";
import { Flow } from "../flow.ts";
import { machine } from "../machine.ts";
import { Audience, makeLedger, Route } from "./ledger.ts";
import { Life } from "./life.ts";
import { makePersistence } from "./persist.ts";
import { step } from "./step.ts";
import { Input } from "./input.ts";
import { makeTx } from "./tx.ts";
import { activation, attempt as attemptOf, incarnation, lane as laneOf } from "./test/ids.ts";
import {
  actorKey,
  Command,
  emptyWorld,
  type Marks,
  OwnedBy,
  Phase,
  type Ticket,
  Timer,
  type World,
} from "./world.ts";

// A written record's JSON object, read back from its text.
const jsonOf = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json)),
);

const ring = transaction({
  id: "Persist/ring",
  input: {},
  key: [],
  concurrency: "reject",
  services: [],
  commit: () => Effect.succeed({}),
});

const Till = definition({
  id: "Persist/Till",
  persist: true,
  states: ["OPEN"],
  events: { Ring: {} },
  internalEvents: { Rang: Flow.uncertain({}) },
  memory: { count: Flow.initial(Schema.Number, 0) },
  operations: ({ E }) => ({
    ring: ring.outcomes({ success: E.Rang, failure: {}, unknown: E.Rang }),
  }),
});

const TillMachine = machine(Till, ({ S }) => ({ default: S.OPEN, states: { OPEN: {} } }));

const actor = { machine: "Persist/Till", name: "front" };

const machines = new Map([[actor.machine, TillMachine.compiled]]);

// The batch the edge would issue now: a Capture step over a copy of the World a step left.
const captured = (world: World, tickets: ReadonlyArray<Ticket> = [], again: Marks = new Map()) => {
  const out = step(machines, { ...world }, Input.Capture({ tickets, again }), {
    now: 0,
    seed: "0",
    admit: makeFreezer(),
  });

  const batch = out.commands.flatMap((c) => (Command.$is("Write")(c) ? [c] : []));

  return { ...out, batch, writes: batch.flatMap((c) => c.writes) };
};

// A step over an open Runtime whose persisted `actor` is live with the given memory, beside any
// other incarnation of `from`, as a step whose drain stopped at its cap leaves it: the mail still
// holds the live ending's try.
const stepOver = (
  memory: Readonly<Record<string, unknown>> = { count: 0 },
  from: World = { ...emptyWorld(true), life: Life.Open() },
) => {
  const world = {
    ...from,
    incarnations: new Map([
      ...from.incarnations,
      [
        actorKey(actor),
        {
          id: incarnation("inc-1"),
          started: 1,
          actor,
          state: "OPEN",
          activations: [activation(1)],
          history: new Map(),
          issues: [],
          bound: new Map(),
          context: new Map(),
          stale: new Map(),
          baselines: [],
          grace: Option.none(),
          memory,
          schedules: new Map(),
        },
      ],
    ]),
  };

  const tx = makeTx(machines, world, {
    now: 0,
    seed: "0",
    admit: makeFreezer(),
  });

  const persistence = makePersistence(tx);

  return { tx, persistence, ledger: makeLedger(tx, persistence) };
};

it("WriteAhead I20: a row owed to the identity and still Queued at a step's end is in its owed record", () => {
  const { tx, persistence, ledger } = stepOver();

  ledger.owe({
    actor,
    to: Audience.Identity(),
    operation: "ring",
    attempt: Option.some(attemptOf("att-1")),
    lane: Option.some(laneOf("lane-1")),
    channel: "success",
    reason: "Success",
    value: { receipt: "r1" },
    route: Route.Current(),
  });
  persistence.close();

  const writes = captured(tx.out().world).writes.filter((w) => w.key === `owed/${actorKey(actor)}`);

  expect([...tx.world().mail.values()].flat()).toHaveLength(1);
  expect(writes.map((w) => Option.map(w.record, (r) => jsonOf(r)["rows"]))).toEqual([
    Option.some([expect.objectContaining({ attempt: "att-1", channel: "success", kept: false })]),
  ]);
});

// Owes `count` success rows to the identity, each with the receipt `receipt(n)`, and projects.
const owing = (receipts: ReadonlyArray<string>, from = stepOver()) => {
  for (const [n, receipt] of receipts.entries())
    from.ledger.owe({
      actor,
      to: Audience.Identity(),
      operation: "ring",
      attempt: Option.some(attemptOf(`att-${n}`)),
      lane: Option.none(),
      channel: "success",
      reason: "Success",
      value: { receipt },
      route: Route.Current(),
    });
  from.persistence.close();

  const capture = captured(from.tx.out().world);
  const owed = capture.writes.filter((w) => w.key.startsWith(`owed/${actorKey(actor)}`));

  return {
    ...from,
    world: capture.world,
    owed,
    reports: capture.evidence.filter((e) => e._tag === "Reported"),
  };
};

const receiptsIn = (owed: ReadonlyArray<{ readonly record: Option.Option<string> }>) =>
  owed.flatMap((w) =>
    Option.match(w.record, {
      onNone: () => [],
      onSome: (r) => Schema.decodeUnknownSync(OwedReceipts)(jsonOf(r)).rows.map((row) => row.value),
    }),
  );

const endingsIn = (owed: ReadonlyArray<{ readonly record: Option.Option<string> }>) =>
  owed.flatMap((w) =>
    Option.match(w.record, {
      onNone: () => [],
      onSome: (r) =>
        Schema.decodeUnknownSync(OwedEndings)(jsonOf(r)).rows.map(
          (row) => `${row.channel} ${row.reason}`,
        ),
    }),
  );

const OwedEndings = Schema.Struct({
  rows: Schema.Array(Schema.Struct({ channel: Schema.String, reason: Schema.String })),
});

const OwedReceipts = Schema.Struct({
  rows: Schema.Array(
    Schema.Struct({ value: Schema.NullOr(Schema.Struct({ receipt: Schema.String })) }),
  ),
});

it("WriteAhead I20, I21; Codec R1: 1,300 rows and twelve values of 200,000 characters are saved whole in one record, in owed order", () => {
  const receipts = [
    ...Array.from({ length: 1300 }, (_, n) => `r${n}`),
    ...Array.from({ length: 12 }, (_, n) => `${n}`.padEnd(200_000, "r")),
  ];

  const { world, owed, reports } = owing(receipts);

  expect(world.withheld.size).toBe(0);
  expect(owed.map((w) => w.key)).toEqual([`owed/${actorKey(actor)}`]);
  expect(receiptsIn(owed)).toEqual(receipts.map((receipt) => ({ receipt })));
  expect(reports).toEqual([]);
});

it("Codec R4: only a value with no canonical form is saved as its Attempt's unknown Restored with null, reported; a valid one beside it is kept", () => {
  const { world, owed, reports } = owing(["\uD800", "ninebytes"]);

  expect(world.withheld.size).toBe(0);
  expect(receiptsIn(owed)).toEqual([null, { receipt: "ninebytes" }]);
  expect(endingsIn(owed)).toEqual(["unknown Restored", "success Success"]);
  expect(reports).toEqual([expect.objectContaining({ code: "UnencodableValue" })]);
});

it("Codec R4: a Flow-made row with no value saves null and is never reported", () => {
  const from = stepOver();

  from.ledger.owe({
    actor,
    to: Audience.Identity(),
    operation: "ring",
    attempt: Option.some(attemptOf("att-0")),
    lane: Option.none(),
    channel: "unknown",
    reason: "Restored",
    value: undefined,
    route: Route.Current(),
  });
  from.persistence.close();
  const capture = captured(from.tx.out().world);

  expect(capture.evidence.filter((e) => e._tag === "Reported")).toEqual([]);
  expect(capture.world.withheld.size).toBe(0);
});

const OwedRows = Schema.Struct({
  rows: Schema.Array(Schema.Struct({ attempt: Schema.NullOr(Schema.String) })),
});

const ActorMemory = Schema.Struct({ memory: Schema.Struct({ count: Schema.Number }) });

const LaneAttempt = Schema.Struct({ attempt: Schema.String });

// What a record says that these tests read: an owed record's Attempts, an actor record's count, or
// a lane record's Attempt.
const whatOf = (record: unknown) =>
  Option.getOrElse(
    Option.firstSomeOf([
      Option.map(Schema.decodeUnknownOption(OwedRows)(record), (r) =>
        r.rows.map((row) => row.attempt).join(","),
      ),
      Option.map(Schema.decodeUnknownOption(ActorMemory)(record), (r) => String(r.memory.count)),
      Option.map(Schema.decodeUnknownOption(LaneAttempt)(record), (r) => r.attempt),
    ]),
    () => "?",
  );

// Each write of a capture as `key=what`, or `key=delete` for a removal.
const writesOf = (capture: ReturnType<typeof captured>) =>
  capture.writes
    .map((w) =>
      Option.match(w.record, {
        onNone: () => `${w.key}=delete`,
        onSome: (r) => `${w.key}=${whatOf(jsonOf(r))}`,
      }),
    )
    .toSorted();

const success = {
  actor,
  to: Audience.Identity(),
  operation: "ring",
  attempt: Option.some(attemptOf("att-1")),
  lane: Option.none(),
  channel: "success" as const,
  reason: "Success",
  value: {},
  route: Route.Current(),
};

it("WriteAhead I11: an identity whose actor record cannot encode at a capture writes none of its records, and writes them all once it can", () => {
  const first = stepOver({ count: "many" });

  first.ledger.owe({
    ...success,
    lane: Option.some(laneOf("lane-1")),
    channel: "unknown",
    reason: "Lost",
  });
  first.persistence.setLane(laneOf("lane-1"), {
    actor,
    operation: "ring",
    head: {
      id: attemptOf("att-1"),
      input: {},
      retryCount: 0,
      owner: OwnedBy.Root(),
      phase: Phase.Held(),
    },
    queue: [],
  });
  first.persistence.saveActor(actor);
  first.persistence.close();
  const held = captured(first.tx.out().world);

  expect(writesOf(held)).toEqual([]);
  expect([...held.world.marked.keys()].toSorted()).toEqual([
    `actor/${actorKey(actor)}`,
    "lane/lane-1",
    `owed/${actorKey(actor)}`,
  ]);

  const second = stepOver({ count: 1 }, held.world);
  second.persistence.close();

  expect(writesOf(captured(second.tx.out().world))).toEqual([
    `actor/${actorKey(actor)}=1`,
    "lane/lane-1=att-1",
    `owed/${actorKey(actor)}=att-1`,
  ]);
});

it("WriteAhead I20, I22: a row saved while still in the mailbox leaves the owed record in the batch whose turn hears it", () => {
  const first = stepOver();
  const id = first.ledger.owe(success);
  first.persistence.close();
  const saved = captured(first.tx.out().world);

  expect(writesOf(saved)).toEqual([`owed/${actorKey(actor)}=att-1`]);

  const second = stepOver({ count: 1 }, saved.world);
  second.ledger.tryOne(actor, id, () => {
    second.persistence.saveActor(actor);

    return "Heard";
  });
  second.persistence.close();

  expect(writesOf(captured(second.tx.out().world))).toEqual([
    `actor/${actorKey(actor)}=1`,
    `owed/${actorKey(actor)}=delete`,
  ]);
});

it("Actors R8, WriteAhead I11: a free actor whose actor record cannot encode does not end at its grace, so a heard row never leaves without its state", () => {
  const first = stepOver();
  const id = first.ledger.owe(success);
  first.persistence.close();
  const saved = captured(first.tx.out().world);

  const heard = stepOver({ count: "many" }, saved.world);
  heard.ledger.tryOne(actor, id, () => {
    heard.persistence.saveActor(actor);

    return "Heard";
  });
  heard.persistence.close();

  const grace = heard.tx.mint("timer");

  const graced = {
    ...heard.tx.out().world,
    timers: new Map([[grace, Timer.Grace({ actor, incarnation: incarnation("inc-1") })]]),
  };

  const out = step(machines, graced, Input.Fired({ timer: grace }), {
    now: 100,
    seed: "0",
    admit: makeFreezer(),
  });

  expect(out.world.incarnations.has(actorKey(actor))).toBe(true);
  expect(writesOf(captured(out.world))).toEqual([]);
});

const other = { machine: actor.machine, name: "back" };

// A step over two live identities: `actor` with the given memory and `other` with count 5.
const twoOver = (memory: Readonly<Record<string, unknown>>) => {
  const first = stepOver(memory);

  first.tx.putIncarnation({
    id: incarnation("inc-2"),
    started: 2,
    actor: other,
    state: "OPEN",
    activations: [activation(2)],
    history: new Map(),
    issues: [],
    bound: new Map(),
    context: new Map(),
    stale: new Map(),
    baselines: [],
    grace: Option.none(),
    memory: { count: 5 },
    schedules: new Map(),
  });

  return first;
};

it("WriteAhead I23, R4: at a capture, an identity whose record cannot encode is withheld whole while another identity's records go", () => {
  const first = twoOver({ count: "many" });
  first.persistence.saveActor(actor);
  first.persistence.saveActor(other);
  first.persistence.close();
  const capture = captured(first.tx.out().world);

  expect(writesOf(capture)).toEqual([`actor/${actorKey(other)}=5`]);
  expect([...capture.world.withheld.keys()]).toEqual([actorKey(actor)]);
  expect(capture.evidence).toEqual([expect.objectContaining({ code: "UnencodableValue" })]);
});

it("WriteAhead R10, I21: a step marks the keys it changed and encodes nothing; the capture encodes them from the World it is given", () => {
  const first = stepOver({ count: 1 });
  first.persistence.saveActor(actor);
  first.persistence.close();
  const out = first.tx.out();

  expect(out.commands.flatMap((c) => (Command.$is("Persist")(c) ? [c.due._tag] : []))).toEqual([
    "Later",
  ]);
  expect(out.commands.some(Command.$is("Write"))).toBe(false);
  expect([...out.world.marked.keys()]).toEqual([`actor/${actorKey(actor)}`]);

  // A later step changes the memory without a mark of its own: the capture writes the World it is
  // given, once, and the key is no longer marked.
  const later = stepOver({ count: 2 }, out.world);
  later.persistence.close();
  const capture = captured(later.tx.out().world);

  expect(writesOf(capture)).toEqual([`actor/${actorKey(actor)}=2`]);
  expect(capture.world.marked.size).toBe(0);
});

it("WriteAhead I21, I23: a refused batch's keys are captured again from the World as it stands, with the keys marked since", () => {
  const first = twoOver({ count: 1 });
  first.persistence.saveActor(actor);
  first.persistence.close();
  const refused = captured(first.tx.out().world);
  const [batch] = refused.batch;

  const later = stepOver({ count: 3 }, refused.world);
  later.persistence.saveActor(other);
  later.persistence.close();

  expect(writesOf(captured(later.tx.out().world, [], batch?.marks))).toEqual([
    `actor/${actorKey(other)}=5`,
    `actor/${actorKey(actor)}=3`,
  ]);
});

it("WriteAhead R13: a ticket whose identity's actor record cannot encode at its step's end is refused by that step, and its identity is withheld", () => {
  const first = stepOver({ count: "many" });
  first.persistence.saveActor(actor);

  const ticket = first.persistence.saveAwaited(actor, laneOf("lane-1"), {
    attempt: attemptOf("att-1"),
    purpose: "acknowledge",
  });

  first.persistence.close();
  const out = first.tx.out();

  expect(out.commands.flatMap((c) => (Command.$is("Persist")(c) ? c.refused : []))).toEqual(
    Option.toArray(ticket),
  );
  expect(out.commands.some(Command.$is("Arm"))).toBe(false);
  expect([...out.world.withheld.keys()]).toEqual([actorKey(actor)]);
  expect(out.evidence).toEqual([expect.objectContaining({ code: "UnencodableValue" })]);
});

it("WriteAhead R13: a ticket whose identity's actor record stops encoding before its batch is issued is refused at the capture, with nothing written", () => {
  const first = stepOver({ count: 1 });

  const lane = {
    actor,
    operation: "ring",
    head: {
      id: attemptOf("att-1"),
      input: {},
      retryCount: 0,
      owner: OwnedBy.Root(),
      phase: Phase.Unsent(),
    },
    queue: [],
  };

  first.persistence.saveActor(actor);

  const ticket = first.persistence.saveAwaited(actor, laneOf("lane-1"), {
    attempt: attemptOf("att-1"),
    purpose: "acknowledge",
  });

  for (const id of Option.toArray(ticket))
    first.persistence.setLane(laneOf("lane-1"), {
      ...lane,
      head: { ...lane.head, phase: Phase.Acknowledging({ ticket: id }) },
    });
  first.persistence.close();
  const due = first.tx.out().commands.flatMap((c) => (Command.$is("Persist")(c) ? [c.due] : []));
  const tickets = due.flatMap((d) => (d._tag === "Awaited" ? d.tickets : []));

  const later = stepOver({ count: "many" }, first.tx.out().world);
  later.persistence.saveActor(actor);
  later.persistence.close();
  const capture = captured(later.tx.out().world, tickets);

  expect(capture.writes).toEqual([]);
  expect(capture.batch.flatMap((b) => b.refused)).toEqual(Option.toArray(ticket));
  expect(capture.batch.flatMap((b) => b.tickets)).toEqual([]);
});

it("WriteAhead I8: a capture serves no mail, starts nothing and arms no timer", () => {
  const { tx, ledger, persistence } = stepOver();
  ledger.owe(success);
  persistence.close();
  const world = tx.out().world;
  const capture = captured(world);

  expect([...capture.world.mail.values()].flat()).toEqual([...world.mail.values()].flat());
  expect(capture.commands.map((c) => c._tag)).toEqual(["Write"]);
  expect(capture.world.incarnations).toEqual(world.incarnations);
});
