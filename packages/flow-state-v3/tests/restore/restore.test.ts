import { Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { serializeClient } from "../../fixtures/lanes/app.ts";
import { Serialize } from "../../fixtures/lanes/machines/clients.ts";
import { displacedOnWire, lanesStory } from "../../fixtures/lanes/stories/usual.ts";
import { Git } from "../../fixtures/services/git/server/git.ts";
import { mainCart } from "../../fixtures/shop/app.ts";
import { Cart } from "../../fixtures/shop/machines/cart.ts";
import { storeStory } from "../../fixtures/shop/stories/usual.ts";
import {
  borrowedRecords,
  borrowedRecordsReload,
  oddNames,
  oddRecordNames,
  unreadableName,
  unreadableNames,
} from "../../fixtures/shop/stories/findings.ts";
import { account } from "../../fixtures/transfers/app.ts";
import { Transfers } from "../../fixtures/transfers/machines/transfers.ts";
import { Bank } from "../../fixtures/transfers/server/bank.ts";
import { bankStory } from "../../fixtures/transfers/stories/usual.ts";
import { Fake, type StoryRun } from "../../src/host/testing/index.ts";
import { TraceRecord } from "../../src/host/trace.ts";
import { checked } from "../rules/rules.ts";

const send = (transferId: string) => Transfers.E.Send({ transferId, cents: 500 });

// The evidence of one open of the tab, in order.
const inOpen = (run: StoryRun, open: number) =>
  run.trace.events.flatMap((e) =>
    e.tab.open === open && TraceRecord.$is("Runtime")(e.record) ? [e.record.evidence] : [],
  );

const reports = (run: StoryRun, open: number) =>
  inOpen(run, open).flatMap((e) =>
    e._tag === "Reported" ? [`${e.code} ${Option.getOrElse(e.record, () => "-")}`] : [],
  );

const heard = (run: StoryRun, open: number, operation: string) =>
  inOpen(run, open).flatMap((e) =>
    e._tag === "Delivered" && e.operation === operation ? [e.event] : [],
  );

const batchesIn = (run: StoryRun, open: number) =>
  run.end.records.batches.filter((b) => b.tab.open === open);

// A transfer whose answer is lost, so its lane is Held, and the key of that lane's record.
const heldTransfer = bankStory("restore/held-transfer")
  .ensure(account)
  .world(Bank.transfer.drop({ at: "response" }))
  .send(account, send("t1"))
  .checkpoint("held");

const heldLane = async () => {
  const { held } = checked(await heldTransfer.run()).checkpoints;
  const [entry] = [...held.records.stored].filter(([key]) => key.startsWith("lane/"));

  if (entry === undefined) throw new Error("the held transfer left no lane record");

  return { key: entry[0], text: entry[1] };
};

describe("an identity owed a row the boot derives is live at ready (Restore R1, I1)", () => {
  it("Restore R1, R3: a Held head's queued commit is heard NotSent Restored at the boot with no ensure, then the head's unknown Restored", async () => {
    const run = checked(
      await lanesStory("restore/held-head-queue")
        .ensure(serializeClient)
        .world(Git.sync.drop())
        .send(serializeClient, Serialize.E.Commit({ repo: "flow" }))
        .send(serializeClient, Serialize.E.Commit({ repo: "flow" }))
        .reload({ reattach: false })
        .checkpoint("after")
        .run(),
    );

    expect(heard(run, 2, "sync")).toEqual(["NotSent", "Unsure"]);
    expect(run.checkpoints.after.inspection.owed).toEqual([]);
  });
});

describe("displaced Attempts still on the wire at a reload (WriteAhead I17; WriteLanes Q7)", () => {
  // Open, owned by release versions and record migration: a head a plain commit displaced, with no cancel
  // pending, is in no lane record, so a reload loses the Attempt, which may have applied, with no
  // ending at all. Saving it needs an owed flag per displaced Attempt, so one heard only as
  // evidence live is not made a delivered ending.
  it.fails("WriteAhead I17: each displaced Attempt still out at the reload ends unknown Restored", async () => {
    const run = checked(await displacedOnWire().run());

    expect(
      run.evidence.flatMap((e) => (e._tag === "Ended" ? [`${e.channel} ${e.reason}`] : [])),
    ).toEqual(["unknown Restored", "unknown Restored", "unknown Restored"]);
  });
});

describe("a Held head across several reloads (Restore R3)", () => {
  // Open, owned by release versions and record migration: a delivered unknown Restored is closed and leaves
  // the owed record, while its lane stays Held, so every later start owes it again.
  it.fails("Restore R3: a Held head's unknown Restored is heard once, not again at each later start", async () => {
    const run = checked(
      await heldTransfer.reload().advance("1 second").reload().advance("1 second").run(),
    );

    const restored = [2, 3].flatMap((open) =>
      inOpen(run, open).filter((e) => e._tag === "Ended" && e.reason === "Restored"),
    );

    expect(restored).toHaveLength(1);
  });
});

describe("delivery order at restore (Restore R3, I5)", () => {
  it("Restore I5: Held heads are heard in lane-id order, whatever order they were sent in", async () => {
    const run = checked(
      await bankStory("restore/lane-order")
        .ensure(account)
        .world(Bank.transfer.drop({ at: "response" }), Bank.transfer.drop({ at: "response" }))
        .send(account, send("t2"))
        .send(account, send("t1"))
        .reload()
        .checkpoint("after")
        .run(),
    );

    const transferOf = new Map(
      run.evidence.flatMap((e) =>
        e._tag === "Minted" ? [[e.attempt, String(e.key["transferId"])] as const] : [],
      ),
    );

    const restored = inOpen(run, 2).flatMap((e) =>
      e._tag === "Ended" && e.reason === "Restored"
        ? [transferOf.get(Option.getOrElse(e.attempt, () => ""))]
        : [],
    );

    expect(restored).toEqual(["t1", "t2"]);
  });
});

describe("record formats (Restore R5, I10, I13)", () => {
  for (const [what, format] of [
    ["newer", "7"],
    ["null", "null"],
    ["fractional", "1.5"],
    ["a string", '"1"'],
  ] as const)
    it(`Restore R5: a lane record whose format is ${what} is quarantined, its key still holds, and a cancel clears it`, async () => {
      const lane = await heldLane();
      const text = lane.text.replace('"format":6', `"format":${format}`);

      const run = checked(
        await heldTransfer
          .world(Fake.storage.put(lane.key, text))
          .reload()
          .checkpoint("reloaded")
          .send(account, send("t1"))
          .checkpoint("declined")
          .send(account, Transfers.E.Abandon({ transferId: "t1" }))
          .checkpoint("cleared")
          .reload()
          .checkpoint("again")
          .run(),
      );

      const { reloaded, declined, cleared } = run.checkpoints;

      // The record stays as it was, and another record of the scope still restores.
      expect(reloaded.records.stored.get(lane.key)).toBe(text);
      expect(reloaded.read(account)?.lifecycle).toBe("active");
      expect(reports(run, 2)).toEqual([`RecordUndecodable ${lane.key}`]);
      expect(declined.read(account)?.memory).toEqual({ notice: "not sent Rejected" });
      expect(cleared.records.stored.has(lane.key)).toBe(false);
      expect(reports(run, 3)).toEqual([]);
    });

  it("Restore R5: a record of the current format restores as written", async () => {
    const lane = await heldLane();

    const run = checked(
      await heldTransfer
        .world(Fake.storage.put(lane.key, lane.text))
        .reload()
        .checkpoint("reloaded")
        .run(),
    );

    expect(reports(run, 2)).toEqual([]);
    expect(run.checkpoints.reloaded.inspection.lanes).toEqual([
      expect.objectContaining({ state: "Held" }),
    ]);
  });

  it("Codec R3: a record whose text is not canonical is quarantined, never coerced", async () => {
    const lane = await heldLane();
    const spaced = lane.text.replace('"format":6', '"format": 6');

    const run = checked(
      await heldTransfer
        .world(Fake.storage.put(lane.key, spaced))
        .reload()
        .checkpoint("reloaded")
        .run(),
    );

    expect(reports(run, 2)).toEqual([`RecordUndecodable ${lane.key}`]);
    expect(run.checkpoints.reloaded.inspection.lanes).toEqual([]);
  });
});

describe("a lane whose input no longer decodes (Restore R8)", () => {
  // Open: such a record still reads, so R8 hears its Held head at a start; today the boot
  // quarantines it unread, reported at each boot instead.
  it.fails("Restore R8: a lane record whose input no longer decodes still has its Held head heard at a start", async () => {
    const lane = await heldLane();
    const text = lane.text.replace('"transferId":"t1"', '"transferId":1');

    const run = checked(
      await heldTransfer.world(Fake.storage.put(lane.key, text)).reload().checkpoint("after").run(),
    );

    expect(heard(run, 2, "transfer")).toEqual(["Unsure"]);
  });
});

describe("an undecodable actor record (Restore R5, I11)", () => {
  const actorKey = "actor/Bank/Transfers/acct-1";
  const broken = '{"format":1}';

  it("Restore R5: it reads quarantined with its issue; an ensure starts fresh, reports RecordUndecodable, adopts its lane, and its first save replaces the bytes", async () => {
    const run = checked(
      await heldTransfer
        .world(Fake.storage.put(actorKey, broken))
        .reload({ reattach: false })
        .checkpoint("quarantined")
        .ensure(account)
        .checkpoint("fresh")
        .run(),
    );

    const { quarantined, fresh } = run.checkpoints;

    expect(quarantined.read(account)?.lifecycle).toBe("quarantined");
    expect(quarantined.read(account)?.issues.map((i) => i.code)).toEqual(["RecordUndecodable"]);
    expect(quarantined.records.stored.get(actorKey)).toBe(broken);
    // Its lane is unbound at the boot: the record does not decode and no actor runs (Actors R20).
    expect(reports(run, 2)).toEqual([
      `UnboundLane lane/Bank/Transfers/acct-1|transfer|{"transferId":"t1"}`,
      `RecordUndecodable ${actorKey}`,
    ]);
    // The adopted lane's Held head is heard at the fresh start.
    expect(heard(run, 2, "transfer")).toEqual(["Unsure"]);
    expect(fresh.read(account)?.lifecycle).toBe("active");
    expect(fresh.records.stored.get(actorKey)).not.toBe(broken);
  });
});

describe("records under a name that does not decode (Restore R5, I10, I11; Codec R5)", () => {
  it("Restore R5: a record whose name its machine's identity cannot read, or that does not name itself back, is quarantined and reported, and no actor starts under it", async () => {
    const run = checked(await unreadableName.run());
    const { booted, restored } = run.checkpoints;
    const { lane, actor, owed } = unreadableNames;

    // A quarantined actor record is reported when an ensure starts its identity fresh, and no ref
    // names this one.
    expect(reports(run, 2).toSorted()).toEqual(
      [lane, owed].map((key) => `RecordUndecodable ${key}`).toSorted(),
    );
    expect(booted.inspection.actors).toEqual([]);
    expect(booted.inspection.lanes).toEqual([]);
    expect(booted.records.stored.get(lane)).toBe(unreadableNames.laneText);
    expect(booted.records.stored.get(actor)).toBe(unreadableNames.actorText);
    expect(booted.records.stored.get(owed)).toBe(unreadableNames.owedText);
    expect(restored.read(mainCart)?.memory.lines).toEqual({
      l1: { quantity: 1, variantId: "v1" },
    });
  });
});

describe("records under names no ref gives (Restore R5; WriteAhead I3)", () => {
  it("Restore R5: owed records under a local name, an empty name, a broken escape or a name that does not name itself back are quarantined and reported, and no actor starts under them", async () => {
    const run = checked(await oddRecordNames.run());
    const { booted, restored } = run.checkpoints;

    expect(reports(run, 2).toSorted()).toEqual(
      oddNames.owed.map(({ key }) => `RecordUndecodable ${key}`).toSorted(),
    );
    expect(booted.inspection.actors).toEqual([]);
    expect(booted.records.stored.get(oddNames.actor)).toBe(oddNames.actorText);
    expect(restored.read(mainCart)?.memory.lines).toEqual({
      l1: { quantity: 1, variantId: "v1" },
    });
  });
});

describe("records whose key and content disagree (Restore R5; Codec R5)", () => {
  it("Restore R5: a record whose content names another identity than its key, or whose key does not round-trip, or of another kind than its prefix, is quarantined; the identity it names restores its own record and hears no ending it never made", async () => {
    const run = checked(await borrowedRecordsReload.run());
    const { booted, restored } = run.checkpoints;

    expect(reports(run, 2).toSorted()).toEqual(
      [...borrowedRecords.owed, ...borrowedRecords.lanes, ...borrowedRecords.other]
        .map(({ key }) => `RecordUndecodable ${key}`)
        .toSorted(),
    );
    expect(booted.inspection.actors).toEqual([]);
    expect(restored.read(mainCart)?.memory.lines).toEqual({
      l1: { quantity: 1, variantId: "v1" },
    });
    expect(inOpen(run, 2).filter((e) => e._tag === "Delivered")).toEqual([]);

    expect(restored.inspection.owed).toEqual([]);
    expect(restored.inspection.lanes).toEqual([]);

    for (const { key, text } of [
      ...borrowedRecords.owed,
      ...borrowedRecords.lanes,
      ...borrowedRecords.actors,
      ...borrowedRecords.other,
    ])
      expect(restored.records.stored.get(key)).toBe(text);
  });
});

describe("an actor record's context bindings (Restore R5; WriteAhead I3)", () => {
  // Open: a record's context bindings are read without the identity check its own name gets, so a
  // binding to a local actor starts one from the store.
  it.fails("Restore R5: an actor record bound to a local actor is quarantined, and no local actor starts from it", async () => {
    const bound =
      '{"context":{"shopper":{"machine":"Shop/Shopper","name":"~9"}},"format":3,"graph":{"Shop/Shopper/~9":{}},"machine":"Shop/Cart","memories":[],"memory":{"adding":"","errors":{},"lines":{"l9":{"quantity":1,"variantId":"v1"}},"notice":"","owner":"main","wanted":{}},"name":"{\\"owner\\":\\"main\\"}","reactions":[],"schedules":[],"seen":{"shopper":""},"state":"OPEN"}';

    const run = checked(
      await storeStory("restore/bound-to-local")
        .ensure(mainCart)
        .send(mainCart, Cart.E.Add({ lineId: "l1", variantId: "v1" }))
        .world(Fake.storage.put('actor/Shop/Cart/{"owner":"main"}', bound))
        .reload({ reattach: false })
        .ensure(mainCart)
        .checkpoint("restored")
        .run(),
    );

    const { restored } = run.checkpoints;

    expect(restored.inspection.actors.map((a) => a.actor).filter((a) => a.includes("/~"))).toEqual(
      [],
    );
    expect(restored.read(mainCart)?.memory.lines).toEqual({});
  });
});

describe("a store that fails to load (Restore R9, I16)", () => {
  it("Restore R9: reports StorageFailure, runs with no persistence, and writes nothing in that Runtime", async () => {
    const run = checked(
      await heldTransfer
        .world(Fake.storage.refuseLoad())
        .reload()
        .send(account, send("t2"))
        .advance("10 seconds")
        .checkpoint("unread")
        .run(),
    );

    const { held, unread } = run.checkpoints;

    expect(reports(run, 2)).toEqual(["StorageFailure -"]);
    expect(batchesIn(run, 2)).toEqual([]);
    expect(unread.records.stored).toEqual(held.records.stored);
    expect(unread.read(account)?.memory).toEqual({ notice: "not sent NoPersistence" });
  });
});

describe("kill points of a first send (Restore R3, I8)", () => {
  it("Restore I8: a kill before the acknowledgement lands restores no lane and calls nothing", async () => {
    const run = checked(
      await bankStory("restore/kill-before-ack")
        .ensure(account)
        .world(Fake.storage.hold())
        .send(account, send("t1"))
        .reload()
        .checkpoint("after")
        .run(),
    );

    expect(run.checkpoints.after.inspection.lanes).toEqual([]);
    expect(run.checkpoints.after.read(Bank.transfer)).toEqual([]);
    expect(heard(run, 2, "transfer")).toEqual([]);
  });

  it("Restore R3: a kill after the acknowledgement lands restores unknown Restored once", async () => {
    const run = checked(
      await bankStory("restore/kill-after-ack")
        .ensure(account)
        .world(Bank.transfer.hold())
        .send(account, send("t1"))
        .reload()
        .checkpoint("after")
        .run(),
    );

    expect(heard(run, 2, "transfer")).toEqual(["Unsure"]);
    expect(run.checkpoints.after.inspection.lanes).toEqual([
      expect.objectContaining({ state: "Held" }),
    ]);
  });
});
