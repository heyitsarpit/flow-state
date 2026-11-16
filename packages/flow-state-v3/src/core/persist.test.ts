import { Effect, Option, Schema } from "effect";
import { expect, it } from "vite-plus/test";
import { transaction } from "../contract.ts";
import { definition } from "../definition.ts";
import { Flow } from "../flow.ts";
import { machine } from "../machine.ts";
import { Audience, makeLedger } from "./ledger.ts";
import { Life } from "./life.ts";
import { makePersistence } from "./persist.ts";
import { step } from "./step.ts";
import { Input } from "./input.ts";
import { makeTx, ROOT_ACTIVATION } from "./tx.ts";
import { actorKey, Command, emptyWorld, Phase, Timer, type TimerId, type World } from "./world.ts";

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

// A step over an open Runtime with one live persisted incarnation, as a step whose drain stopped
// at its cap leaves it: the mail still holds the live ending's try.
const stepOver = (
  memory: Readonly<Record<string, unknown>> = { count: 0 },
  from: World = { ...emptyWorld(true), life: Life.Open() },
) => {
  const world = {
    ...from,
    incarnations: new Map([
      [
        actorKey(actor),
        {
          id: "inc-1",
          actor,
          state: "OPEN",
          activations: [1],
          history: new Map(),
          memory,
          schedules: new Map(),
        },
      ],
    ]),
  };

  const tx = makeTx(new Map([[actor.machine, TillMachine.compiled]]), world, {
    now: 0,
    seed: "0",
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
    attempt: Option.some("att-1"),
    lane: Option.some("lane-1"),
    channel: "success",
    reason: "Success",
    value: { receipt: "r1" },
    owner: ROOT_ACTIVATION,
    current: true,
  });
  persistence.project();

  const writes = tx
    .out()
    .commands.flatMap((c) => (Command.$is("Persist")(c) ? c.writes : []))
    .filter((w) => w.key === `owed/${actorKey(actor)}`);

  expect(tx.world().mail).toHaveLength(1);
  expect(writes.map((w) => Option.map(w.record, (r) => r["rows"]))).toEqual([
    Option.some([expect.objectContaining({ attempt: "att-1", channel: "success", kept: false })]),
  ]);
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

// Each write of a step as `key=what`, or `key=delete` for a removal.
const writesOf = (tx: ReturnType<typeof stepOver>["tx"]) =>
  tx
    .out()
    .commands.flatMap((c) => (Command.$is("Persist")(c) ? c.writes : []))
    .map((w) =>
      Option.match(w.record, {
        onNone: () => `${w.key}=delete`,
        onSome: (r) => `${w.key}=${whatOf(r)}`,
      }),
    )
    .toSorted();

const success = {
  actor,
  to: Audience.Identity(),
  operation: "ring",
  attempt: Option.some("att-1"),
  lane: Option.none(),
  channel: "success" as const,
  reason: "Success",
  value: {},
  owner: ROOT_ACTIVATION,
  current: true,
};

it("WriteAhead I11: a step whose actor record cannot encode writes none of its identity's records, and writes them all once it can", () => {
  const first = stepOver({ count: "many" });

  first.ledger.owe({ ...success, lane: Option.some("lane-1"), channel: "unknown", reason: "Lost" });
  first.persistence.setLane("lane-1", {
    actor,
    operation: "ring",
    head: { id: "att-1", input: {}, retryCount: 0, owner: ROOT_ACTIVATION, phase: Phase.Held() },
    queue: [],
  });
  first.persistence.saveActor(actor);
  first.persistence.project();

  expect(writesOf(first.tx)).toEqual([]);

  const second = stepOver({ count: 1 }, first.tx.world());
  second.persistence.project();

  expect(writesOf(second.tx)).toEqual([
    `actor/${actorKey(actor)}=1`,
    "lane/lane-1=att-1",
    `owed/${actorKey(actor)}=att-1`,
  ]);
});

it("WriteAhead I20, I22: a row saved while still in the mailbox leaves the owed record in the batch whose turn hears it", () => {
  const first = stepOver();
  const id = first.ledger.owe(success);
  first.persistence.project();

  expect(writesOf(first.tx)).toEqual([`owed/${actorKey(actor)}=att-1`]);

  const second = stepOver({ count: 1 }, first.tx.world());
  second.ledger.tryOne(id, () => {
    second.persistence.saveActor(actor);

    return "Heard";
  });
  second.persistence.project();

  expect(writesOf(second.tx)).toEqual([
    `actor/${actorKey(actor)}=1`,
    `owed/${actorKey(actor)}=delete`,
  ]);
});

it("Actors R8, WriteAhead I11: a free actor whose records are held back does not end at its grace, so a heard row never leaves without its state", () => {
  const first = stepOver();
  const id = first.ledger.owe(success);
  first.persistence.project();

  const heard = stepOver({ count: "many" }, first.tx.world());
  heard.ledger.tryOne(id, () => {
    heard.persistence.saveActor(actor);

    return "Heard";
  });
  heard.persistence.project();

  expect(writesOf(heard.tx)).toEqual([]);

  const grace = heard.tx.mint<TimerId>("timer");

  const graced = {
    ...heard.tx.world(),
    timers: new Map([[grace, Timer.Grace({ actor, incarnation: "inc-1" })]]),
  };

  const out = step(
    new Map([[actor.machine, TillMachine.compiled]]),
    graced,
    Input.Fired({ timer: grace }),
    { now: 100, seed: "0" },
  );

  expect(out.world.incarnations.has(actorKey(actor))).toBe(true);
  expect(
    out.commands.flatMap((c) => (Command.$is("Persist")(c) ? c.writes.map((w) => w.key) : [])),
  ).toEqual([]);
});

it("WriteAhead I23, R4: in one step, an identity whose record cannot encode is withheld whole while another identity's records go", () => {
  const other = { machine: actor.machine, name: "back" };
  const first = stepOver({ count: "many" });

  first.tx.set({
    ...first.tx.world(),
    incarnations: new Map([
      ...first.tx.world().incarnations,
      [
        actorKey(other),
        {
          id: "inc-2",
          actor: other,
          state: "OPEN",
          activations: [2],
          history: new Map(),
          memory: { count: 5 },
          schedules: new Map(),
        },
      ],
    ]),
  });
  first.persistence.saveActor(actor);
  first.persistence.saveActor(other);
  first.persistence.project();

  expect(writesOf(first.tx)).toEqual([`actor/${actorKey(other)}=5`]);
  expect([...first.tx.world().withheld.keys()]).toEqual([actorKey(actor)]);
});
