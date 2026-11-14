import assert from "node:assert/strict";
import { Option } from "effect";
import { describe, it } from "vite-plus/test";
import { Audience, Delivery, type Heard, keptOn, makeLedger, type Owed, rowsOf } from "./ledger.ts";
import { makePersistence } from "./persist.ts";
import { makeTx, ROOT_ACTIVATION } from "./tx.ts";
import { actorKey, Disposal, emptyWorld, Mail, type World } from "./world.ts";

const actor = { machine: "Test/Ledger", name: "a" };

// RETURN_TYPE: the World, so the incarnation map keeps its declared value type.
const live = (world: World): World => ({
  ...world,
  incarnations: new Map([
    [
      actorKey(actor),
      { id: "inc-1", actor, state: "S", activation: 7, memory: {}, schedules: new Map() },
    ],
  ]),
});

// One step's working state over a world, with the ledger's functions and its reports.
const stepOver = (world: World) => {
  const tx = makeTx(new Map(), world, { now: 0, seed: "0" });
  const ledger = makeLedger(tx, makePersistence(tx));

  return { tx, ledger, rows: () => rowsOf(tx.world().owed, actor) };
};

const ending = (lane: Option.Option<string>, to: Audience = Audience.Identity()) => ({
  actor,
  to,
  operation: "ring",
  attempt: Option.some("att-1"),
  lane,
  channel: "unknown" as const,
  reason: "Lost",
  value: undefined,
  owner: 7,
  current: false,
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

  const refs = world.mail.flatMap((m) => (Mail.$is("Ending")(m) ? [m.id] : [])).toSorted();

  return refs.join() === queued.join()
    ? []
    : [`refs ${refs.join()} for queued rows ${queued.join()}`];
};

const hearAs = (heard: Heard) => () => heard;

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
    s.ledger.owe(ending(Option.none(), Audience.Life({ incarnation: "inc-gone" })));

    assert.deepStrictEqual(deliveries(s.rows()), ["Waiting"]);
    assert.deepStrictEqual(
      s.tx.out().evidence.map((e) => e._tag),
      ["Ended", "Parked", "Ended", "Recorded"],
    );
  });

  it("tryOne: refused once is Retrying behind queued mail, refused again is Kept; a closed row's reference does nothing", () => {
    const s = stepOver(live(emptyWorld(true)));
    const id = s.ledger.owe(ending(Option.some("L")));
    s.tx.set({ ...s.tx.world(), mail: [] });

    s.ledger.tryOne(id, hearAs("Refused"));
    assert.deepStrictEqual(deliveries(s.rows()), ["Retrying"]);
    assert.deepStrictEqual(ledgerFaults(s.tx.world()), []);

    s.ledger.tryOne(id, hearAs("Refused"));
    assert.deepStrictEqual(deliveries(s.rows()), ["Kept"]);

    const heard: Array<string> = [];
    s.ledger.tryOne(id, () => {
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

    s.ledger.tryOne(heard, hearAs("Heard"));
    s.ledger.tryOne(unmapped, hearAs("Unmapped"));
    assert.deepStrictEqual(s.rows(), []);

    const again: Array<string> = [];
    s.ledger.tryOne(heard, () => {
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

    assert.ok(!keptOn(s.tx.world().owed, actor, "L"), "Queued rows block no key");

    for (const id of [one, two, one, two]) s.ledger.tryOne(id, hearAs("Refused"));

    assert.deepStrictEqual(deliveries(s.rows()), ["Kept", "Kept"], "two Kept rows on one lane");
    assert.ok(keptOn(s.tx.world().owed, actor, "L"));
    assert.ok(!keptOn(s.tx.world().owed, actor, "M"));
  });

  // WriteLanes `algorithm` ledger: "suspend ...: Queued and Retrying rows go Waiting, rows with no
  // lane included; Life rows close Recorded"; a Kept row is left for its start.
  it("suspend: Queued and Retrying rows wait, a laneless one included; Kept stays; a Life row closes; forget closes every row", () => {
    const s = stepOver(live(emptyWorld(true)));
    s.ledger.owe(ending(Option.none()));
    const retrying = s.ledger.owe(ending(Option.some("L")));
    const kept = s.ledger.owe(ending(Option.some("M")));
    s.ledger.owe(ending(Option.some("N"), Audience.Life({ incarnation: "inc-1" })));
    s.tx.set({ ...s.tx.world(), mail: [] });
    s.ledger.tryOne(retrying, hearAs("Refused"));
    s.tx.set({ ...s.tx.world(), mail: s.tx.world().mail.filter((m) => m._tag === "Event") });
    s.ledger.tryOne(kept, hearAs("Refused"));
    s.ledger.tryOne(kept, hearAs("Refused"));
    // The drain serves each reference once; these direct tries leave the refusal's reference behind.
    s.tx.set({ ...s.tx.world(), mail: [], incarnations: new Map() });
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
    s.ledger.tryOne(id, hearAs("Refused"));

    s.ledger.tryOne(id, () => {
      s.tx.set({ ...s.tx.world(), incarnations: new Map() });
      s.ledger.suspend(actor, false);

      return "Refused";
    });

    assert.deepStrictEqual(deliveries(s.rows()), ["Waiting"], "the suspended row stays Waiting");
  });

  it("start: Waiting rows queue and Kept rows take their one try, adopted current from the root (Turn R20)", () => {
    const s = stepOver(emptyWorld(true));
    s.ledger.owe(ending(Option.some("L")));
    s.ledger.restore([{ ...ending(Option.some("M")), kept: true }]);
    s.tx.set(live(s.tx.world()));

    s.ledger.start(actor);
    assert.deepStrictEqual(
      deliveries(s.rows()),
      ["Queued", "Retrying"],
      "the Kept row takes its one try",
    );
    assert.ok(s.rows().every((r) => r.current && r.owner === ROOT_ACTIVATION));
    assert.deepStrictEqual(ledgerFaults(s.tx.world()), []);
  });

  it("a Runtime that is not open owes Waiting, whatever incarnation lives", () => {
    const s = stepOver({ ...live(emptyWorld(true)), disposal: Disposal.Disposing() });
    s.ledger.owe(ending(Option.some("L")));

    assert.deepStrictEqual(deliveries(s.rows()), ["Waiting"]);
  });
});
