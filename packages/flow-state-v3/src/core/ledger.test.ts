import { makeFreezer } from "./frozen.ts";
import assert from "node:assert/strict";
import { Effect, Option, Result, Schema } from "effect";
import { describe, it } from "vite-plus/test";
import { transaction } from "../contract.ts";
import { definition } from "../definition.ts";
import { Flow } from "../flow.ts";
import { machine } from "../machine.ts";
import {
  Audience,
  Delivery,
  type Heard,
  keptOn,
  makeLedger,
  type Owed,
  Route,
  rowsOf,
} from "./ledger.ts";
import { makePersistence } from "./persist.ts";
import { decodeRecords, encodeOwed, owedRecordKey } from "./record.ts";
import type { Channel } from "./vocabulary.ts";
import { makeTx } from "./tx.ts";
import { Life } from "./life.ts";
import { activation, attempt as attemptOf, incarnation, lane as laneOf } from "./test/ids.ts";
import { Input } from "./input.ts";
import { step } from "./step.ts";
import {
  actorKey,
  type AttemptId,
  byCodeUnits,
  emptyWorld,
  type LaneId,
  Mail,
  OwnedBy,
  Quarantine,
  type World,
} from "./world.ts";

const encodeOwedText = (...args: Parameters<typeof encodeOwed>) =>
  Result.getOrThrow(encodeOwed(...args)).text;

const actor = { machine: "Test/Ledger", name: "a" };

// RETURN_TYPE: the World, so the incarnation map keeps its declared value type.
const live = (world: World): World => ({
  ...world,
  life: Life.Open(),
  incarnations: new Map([
    [
      actorKey(actor),
      {
        id: incarnation("inc-1"),
        started: 1,
        actor,
        state: "S",
        activations: [activation(7)],
        history: new Map(),
        issues: [],
        bound: new Map(),
        context: new Map(),
        stale: new Map(),
        baselines: [],
        grace: Option.none(),
        memory: {},
        schedules: new Map(),
      },
    ],
  ]),
});

// One step's working state over a world, with the ledger's functions and its reports.
const stepOver = (world: World) => {
  const tx = makeTx(new Map(), world, { now: 0, seed: "0", admit: makeFreezer() });
  const ledger = makeLedger(tx, makePersistence(tx));

  return { tx, ledger, rows: () => rowsOf(tx.world().owed, actor) };
};

const ending = (lane: Option.Option<string>, to: Audience = Audience.Identity()) => ({
  actor,
  to,
  operation: "ring",
  attempt: Option.some(attemptOf("att-1")),
  lane: Option.map(lane, laneOf),
  channel: "unknown" as const,
  reason: "Lost",
  value: undefined,
  route: Route.From({ owner: OwnedBy.State({ activation: activation(7) }) }),
});

const deliveries = (rows: ReadonlyArray<Owed>) => rows.map((r) => r.delivery._tag);

// WriteLanes I29, I30: the mail's ending references are exactly the Queued and Retrying rows, and
// every Waiting or Kept row waits for a start.
const ledgerFaults = (world: World) => {
  const queued = [...world.owed.values()]
    .flat()
    .filter((r) => Delivery.$is("Queued")(r.delivery) || Delivery.$is("Retrying")(r.delivery))
    .map((r) => r.id)
    .toSorted();

  const refs = [...world.mail.values()]
    .flat()
    .flatMap((m) => (Mail.$is("Ending")(m) ? [m.id] : []))
    .toSorted();

  return refs.join() === queued.join()
    ? []
    : [`refs ${refs.join()} for queued rows ${queued.join()}`];
};

const hearAs = (heard: Heard) => () => heard;

// A persisted machine with one write operation, `pay`, whose owed records the boot may read.
const pay = transaction({
  id: "Test/pay",
  input: { cents: Schema.Number },
  key: [],
  concurrency: "reject",
  services: [],
  commit: () => Effect.void,
});

const Pay = definition({
  id: "Shop/Pay",
  persist: true,
  states: ["OPEN"],
  events: {},
  internalEvents: { Paid: {}, PayUnsure: Flow.uncertain({}) },
  memory: {},
  operations: ({ E }) => ({
    pay: pay.outcomes({ success: E.Paid, failure: {}, unknown: E.PayUnsure }),
  }),
});

const PayMachine = machine(Pay, ({ S }) => ({ default: S.OPEN, on: { Paid: {}, PayUnsure: {} } }));

const payMachines = new Map([[PayMachine.compiled.id, PayMachine.compiled]]);

describe("an owed record keeps each row's channel (WriteLanes I39; Codec R5)", () => {
  it("a NotSent row and an unknown row with the same tag come back told apart by channel", () => {
    const actor = { machine: "Shop/Pay", name: "s1" };

    const row = (channel: Channel) => ({
      operation: "pay",
      lane: Option.none<LaneId>(),
      attempt: Option.none<AttemptId>(),
      channel,
      reason: "Cancelled",
      value: null,
      kept: false,
    });

    const stored = new Map([
      [`owed/${actorKey(actor)}`, encodeOwedText(actor, [row("notSent"), row("unknown")])],
    ]);

    assert.deepEqual(
      decodeRecords(payMachines, stored).rows.map((r) => r.channel),
      ["notSent", "unknown"],
    );
  });
});

describe("a boot reads records in key order (Restore R3: the boot sorts by record key)", () => {
  it("records written in any order decode in record-key order", () => {
    const record = (name: string) =>
      [
        `owed/Shop/Pay/${name}`,
        encodeOwedText({ machine: "Shop/Pay", name }, [
          {
            operation: "pay",
            lane: Option.none(),
            attempt: Option.none(),
            channel: "unknown",
            reason: "Restored",
            value: null,
            kept: false,
          },
        ]),
      ] as const;

    const stored = new Map([record("b"), record("a")]);

    assert.deepEqual(
      decodeRecords(payMachines, stored).rows.map((r) => r.actor.name),
      ["a", "b"],
    );
  });
});

describe("lane-id order (Restore R3: Held heads in lane-id order)", () => {
  it("lane ids order by code units, as record keys do, never by the host's locale", () => {
    const ids = ["Shop/Pay/s1|place|{}", "Shop/Pay/s1|Void|{}", "Shop/Pay/s1|void|{}"];

    assert.deepEqual(ids.toSorted(byCodeUnits), [
      "Shop/Pay/s1|Void|{}",
      "Shop/Pay/s1|place|{}",
      "Shop/Pay/s1|void|{}",
    ]);
  });
});

describe("the owed ledger's five functions (WriteLanes algorithm ledger)", () => {
  it("owe: Queued with one mail reference while its audience can hear, Ended once at its birth", () => {
    const s = stepOver(live(emptyWorld(true)));
    s.ledger.owe(ending(Option.some("L")));

    assert.deepStrictEqual(deliveries(s.rows()), ["Queued"]);
    assert.deepStrictEqual(ledgerFaults(s.tx.world()), []);
    assert.deepStrictEqual(
      s.tx.out().evidence.map((e) => e._tag),
      ["Ended"],
    );
  });

  it("owe: Waiting, reported Parked, when no incarnation can hear; a gone incarnation's row closes as evidence", () => {
    const s = stepOver(emptyWorld(true));
    s.ledger.owe(ending(Option.none()));
    s.ledger.owe(ending(Option.none(), Audience.Life({ incarnation: incarnation("inc-gone") })));

    assert.deepStrictEqual(deliveries(s.rows()), ["Waiting"]);
    assert.deepStrictEqual(
      s.tx.out().evidence.map((e) => e._tag),
      ["Ended", "Parked", "Ended", "Recorded"],
    );
  });

  it("tryOne: refused once is Retrying behind queued mail, refused again is Kept; a closed row's reference does nothing", () => {
    const s = stepOver(live(emptyWorld(true)));
    const id = s.ledger.owe(ending(Option.some("L")));
    s.tx.clearMail();

    s.ledger.tryOne(actor, id, hearAs("Refused"));
    assert.deepStrictEqual(deliveries(s.rows()), ["Retrying"]);
    assert.deepStrictEqual(ledgerFaults(s.tx.world()), []);

    s.ledger.tryOne(actor, id, hearAs("Refused"));
    assert.deepStrictEqual(deliveries(s.rows()), ["Kept"]);

    const heard: Array<string> = [];
    s.ledger.tryOne(actor, id, () => {
      heard.push("tried");

      return "Heard";
    });
    assert.deepStrictEqual(
      heard,
      [],
      "a Kept row is not in the mailbox, so its reference does nothing",
    );
  });

  it("tryOne: heard closes Delivered, unmapped closes Recorded, and a closed row is never tried again (WriteLanes I30)", () => {
    const s = stepOver(live(emptyWorld(true)));
    const heard = s.ledger.owe(ending(Option.some("L")));
    const unmapped = s.ledger.owe(ending(Option.some("M")));

    s.ledger.tryOne(actor, heard, hearAs("Heard"));
    s.ledger.tryOne(actor, unmapped, hearAs("Unmapped"));
    assert.deepStrictEqual(s.rows(), []);

    const again: Array<string> = [];
    s.ledger.tryOne(actor, heard, () => {
      again.push("tried");

      return "Heard";
    });
    assert.deepStrictEqual(again, []);
    assert.ok(
      s.tx.out().evidence.some((e) => e._tag === "Recorded" && e.why === "evidence"),
      "closing an unmapped row records evidence",
    );
  });

  it("two rows refused twice on one lane are two Kept rows; keptOn reads Kept rows only (WriteLanes I31, I33)", () => {
    const s = stepOver(live(emptyWorld(true)));
    const one = s.ledger.owe(ending(Option.some("L")));
    const two = s.ledger.owe(ending(Option.some("L")));

    assert.ok(!keptOn(s.tx.world().owed, actor, laneOf("L")), "Queued rows block no key");

    for (const id of [one, two, one, two]) s.ledger.tryOne(actor, id, hearAs("Refused"));

    assert.deepStrictEqual(deliveries(s.rows()), ["Kept", "Kept"], "two Kept rows on one lane");
    assert.ok(keptOn(s.tx.world().owed, actor, laneOf("L")));
    assert.ok(!keptOn(s.tx.world().owed, actor, laneOf("M")));
  });

  // WriteLanes `algorithm` ledger: "suspend ...: Queued and Retrying rows go Waiting, rows with no
  // lane included; Life rows close Recorded"; a Kept row is left for its start.
  it("suspend: Queued and Retrying rows wait, a laneless one included; Kept stays; a Life row closes; forget closes every row", () => {
    const s = stepOver(live(emptyWorld(true)));
    s.ledger.owe(ending(Option.none()));
    const retrying = s.ledger.owe(ending(Option.some("L")));
    const kept = s.ledger.owe(ending(Option.some("M")));
    s.ledger.owe(ending(Option.some("N"), Audience.Life({ incarnation: incarnation("inc-1") })));
    s.tx.clearMail();
    s.ledger.tryOne(actor, retrying, hearAs("Refused"));
    s.tx.clearMail();
    s.ledger.tryOne(actor, kept, hearAs("Refused"));
    s.ledger.tryOne(actor, kept, hearAs("Refused"));
    // The drain serves each reference once; these direct tries leave the refusal's reference behind.
    s.tx.clearMail();
    s.tx.dropIncarnation(actor);
    assert.deepStrictEqual(deliveries(s.rows()), ["Queued", "Retrying", "Kept", "Queued"]);

    s.ledger.suspend(actor, false);
    assert.deepStrictEqual(
      deliveries(s.rows()),
      ["Waiting", "Waiting", "Kept"],
      "the laneless and the Retrying row wait, the Kept row stays",
    );
    assert.deepStrictEqual(ledgerFaults(s.tx.world()), [], "no reference outlives its row's wait");

    s.ledger.suspend(actor, true);
    assert.deepStrictEqual(s.rows(), []);
  });

  // A refusal moves only a row still in the mailbox: a row its own turn sent to wait stays Waiting.
  it("tryOne: a refusal leaves a row its turn suspended Waiting, never Kept", () => {
    const s = stepOver(live(emptyWorld(true)));
    const id = s.ledger.owe(ending(Option.some("L")));
    s.ledger.tryOne(actor, id, hearAs("Refused"));

    s.ledger.tryOne(actor, id, () => {
      s.tx.dropIncarnation(actor);
      s.ledger.suspend(actor, false);

      return "Refused";
    });

    assert.deepStrictEqual(deliveries(s.rows()), ["Waiting"], "the suspended row stays Waiting");
  });

  it("start: Waiting rows queue and Kept rows take their one try, adopted current from the root (Turn R20)", () => {
    const s = stepOver(emptyWorld(true));
    s.ledger.owe(ending(Option.some("L")));
    s.ledger.restore([{ ...ending(Option.some("M")), kept: true }]);

    for (const incarnation of live(s.tx.world()).incarnations.values())
      s.tx.putIncarnation(incarnation);
    s.tx.setLife(Life.Open());

    s.ledger.start(actor);
    assert.deepStrictEqual(
      deliveries(s.rows()),
      ["Queued", "Retrying"],
      "the Kept row takes its one try",
    );
    assert.ok(s.rows().every((r) => Route.$is("Current")(r.route)));
    assert.deepStrictEqual(ledgerFaults(s.tx.world()), []);
  });

  it("a Runtime that is not open owes Waiting, whatever incarnation lives", () => {
    const s = stepOver({
      ...live(emptyWorld(true)),
      life: Life.Disposing({ awaiting: Option.none() }),
    });

    s.ledger.owe(ending(Option.some("L")));

    assert.deepStrictEqual(deliveries(s.rows()), ["Waiting"]);
  });
});

describe("Flow's restored marker is not a reason (WriteLanes I15)", () => {
  // Whether owing a host unknown ending with this reason to a live, persisted identity marks its
  // owed record: a Queued row moves into no saved delivery, so it should not.
  const marksOwed = (reason: string) => {
    const tx = makeTx(new Map([[actor.machine, PayMachine.compiled]]), live(emptyWorld(true)), {
      now: 0,
      seed: "0",
      admit: makeFreezer(),
    });

    makeLedger(tx, makePersistence(tx)).owe({ ...ending(Option.none()), reason });

    return tx.world().marked.has(owedRecordKey(actorKey(actor)));
  };

  it("control: a host unknown Lost, queued, marks no owed record", () => {
    assert.equal(marksOwed("Lost"), false);
  });

  // A marker read from the reason text would let a host's own reason spelled Restored pass for
  // Flow's, and write the row as if it outlived its step.
  it("a host unknown whose reason is spelled Restored, queued, marks no owed record", () => {
    assert.equal(marksOwed("Restored"), false);
  });
});

describe("forget drops retired holds only (Actors R21)", () => {
  it("forget drops its identity's retired lane record and keeps one it could not read", () => {
    const shopper = { machine: "Shop/Pay", name: "s1" };
    const retired = `lane/${actorKey(shopper)}|gone|{}`;
    const garbled = `lane/${actorKey(shopper)}|pay|{}`;

    const world = {
      ...emptyWorld(true),
      life: Life.Open(),
      quarantined: new Map<string, Quarantine>([
        [
          retired,
          Quarantine.Retired({ actor: shopper, operation: "gone", lane: laneOf(retired.slice(5)) }),
        ],
        [garbled, Quarantine.Unreadable({ code: "input", detail: Option.none() })],
      ]),
    };

    const out = step(payMachines, world, Input.Forget({ actor: shopper }), {
      now: 0,
      seed: "0",
      admit: makeFreezer(),
    });

    assert.deepStrictEqual([...out.world.quarantined.keys()], [garbled]);
    assert.deepStrictEqual(out.evidence.filter((e) => e._tag === "HoldForgotten").length, 1);
  });
});
