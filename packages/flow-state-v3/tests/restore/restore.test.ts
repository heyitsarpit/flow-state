import { Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { serializeClient } from "../../fixtures/lanes/app.ts";
import { Serialize } from "../../fixtures/lanes/machines/clients.ts";
import { displacedOnWire, lanesStory } from "../../fixtures/lanes/stories/usual.ts";
import { Git } from "../../fixtures/services/git/server/git.ts";
import { mainCart, mainShopper } from "../../fixtures/shop/app.ts";
import { Cart } from "../../fixtures/shop/machines/cart.ts";
import { Shopper } from "../../fixtures/shop/machines/shopper.ts";
import { Carts } from "../../fixtures/shop/server/carts.ts";
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
import { reportsWithReasons } from "./opens.ts";

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

// A transfer whose answer is lost, so its lane is Held, and the key of that identity's work record.
const heldTransfer = bankStory("restore/held-transfer")
  .ensure(account)
  .world(Bank.transfer.drop({ at: "response" }))
  .send(account, send("t1"))
  .checkpoint("held");

// A transfer still on the wire at the reload: its head is saved Out.
const outTransfer = bankStory("restore/out-transfer")
  .ensure(account)
  .world(Bank.transfer.hold())
  .send(account, send("t1"))
  .checkpoint("held");

const heldWork = async () => {
  const { held } = checked(await heldTransfer.run()).checkpoints;
  const [entry] = [...held.records.stored].filter(([key]) => key.startsWith("work/"));

  if (entry === undefined) throw new Error("the held transfer left no work record");

  return { key: entry[0], text: entry[1] };
};

describe("an identity owed a row the boot derives is live at ready (Restore R1, I1)", () => {
  it("Restore R1, Records R16: an out head's queued commit is heard NotSent Restored at the boot with no ensure, then the head's unknown Restored", async () => {
    const run = checked(
      await lanesStory("restore/held-head-queue")
        .ensure(serializeClient)
        .world(Git.sync.hold())
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

describe("a head across several reloads (Records R16, T5)", () => {
  // A head out at the first reload is told unknown Restored once; the capture saves it Held with
  // nothing owed, so no later start tells it again.
  it("Records R16, T5: a head out at a reload hears its unknown Restored once, not again at each later start", async () => {
    const run = checked(
      await outTransfer.reload().advance("1 second").reload().advance("1 second").run(),
    );

    const restored = [2, 3].flatMap((open) =>
      inOpen(run, open).filter((e) => e._tag === "Ended" && e.reason === "Restored"),
    );

    expect(restored).toHaveLength(1);
  });
});

describe("delivery order at restore (Restore R3, I5)", () => {
  it("Restore I5, Records rule order: heads out at the reload are heard in lane-id order, whatever order they were sent in", async () => {
    const run = checked(
      await bankStory("restore/lane-order")
        .ensure(account)
        .world(Bank.transfer.hold(), Bank.transfer.hold())
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

describe("record formats (Records Stage 1, Fates)", () => {
  for (const [what, format] of [
    ["null", "null"],
    ["fractional", "1.5"],
    ["a string", '"1"'],
  ] as const)
    it(`Records Stage 1 row 3, Fates Kept(Structure): a work record whose format is ${what} is kept byte for byte and reported, the position still restores, and a send on the identity is refused`, async () => {
      const work = await heldWork();
      const text = work.text.replace('"format":6', `"format":${format}`);

      const run = checked(
        await heldTransfer
          .world(Fake.storage.put(work.key, text))
          .reload()
          .checkpoint("reloaded")
          .send(account, send("t2"))
          .checkpoint("declined")
          .run(),
      );

      const { reloaded, declined } = run.checkpoints;

      expect(reloaded.records.stored.get(work.key)).toBe(text);
      expect(reloaded.read(account)?.lifecycle).toBe("active");
      expect(reports(run, 2)).toEqual([`RecordUndecodable ${work.key}`]);
      expect(declined.read(account)?.memory).toEqual({ notice: "not sent StorageRefused" });
      expect(declined.records.stored.get(work.key)).toBe(text);
    });

  it("Records Stage 1 row 4: a work record of a newer format keeps its whole identity unread, its position too", async () => {
    const work = await heldWork();
    const text = work.text.replace('"format":6', '"format":7');

    const run = checked(
      await heldTransfer
        .world(Fake.storage.put(work.key, text))
        .reload()
        .checkpoint("reloaded")
        .run(),
    );

    expect(run.checkpoints.reloaded.records.stored.get(work.key)).toBe(text);
    expect(reports(run, 2)).toEqual([
      "RecordUndecodable actor/Bank/Transfers/acct-1",
      `RecordUndecodable ${work.key}`,
    ]);
  });

  it("Records I1: a record of the current format restores as written", async () => {
    const work = await heldWork();

    const run = checked(
      await heldTransfer
        .world(Fake.storage.put(work.key, work.text))
        .reload()
        .checkpoint("reloaded")
        .run(),
    );

    expect(reports(run, 2)).toEqual([]);
    expect(run.checkpoints.reloaded.inspection.lanes).toEqual([
      expect.objectContaining({ state: "Held" }),
    ]);
  });

  it("Records Stage 1 row 2: a record whose text is not canonical is kept, never coerced", async () => {
    const work = await heldWork();
    const spaced = work.text.replace('"format":6', '"format": 6');

    const run = checked(
      await heldTransfer
        .world(Fake.storage.put(work.key, spaced))
        .reload()
        .checkpoint("reloaded")
        .run(),
    );

    expect(reports(run, 2)).toEqual([`RecordUndecodable ${work.key}`]);
    expect(run.checkpoints.reloaded.inspection.lanes).toEqual([]);
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
    // Its lane is unbound at the boot: the position resets and no actor runs (Actors R20).
    expect(reports(run, 2)).toEqual([
      `RecordUndecodable ${actorKey}`,
      "UnboundLane work/Bank/Transfers/acct-1",
    ]);
    // The adopted lane's Held head already told its unknown, so it owes nothing (Records R16).
    expect(heard(run, 2, "transfer")).toEqual([]);
    expect(fresh.read(account)?.lifecycle).toBe("active");
    expect(fresh.records.stored.get(actorKey)).not.toBe(broken);
  });
});

describe("records under a name that does not decode (Restore R5, I10, I11; Codec R5)", () => {
  it("Restore R5: a record whose name its machine's identity cannot read, or that does not name itself back, is quarantined and reported, and no actor starts under it", async () => {
    const run = checked(await unreadableName.run());
    const { booted, restored } = run.checkpoints;
    const { lane, actor, owed } = unreadableNames;

    // Each record the boot does not read is reported once, by its key.
    expect(reports(run, 2).toSorted()).toEqual(
      [actor, lane, owed].map((key) => `RecordUndecodable ${key}`).toSorted(),
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
      [...oddNames.owed.map(({ key }) => key), oddNames.actor]
        .map((key) => `RecordUndecodable ${key}`)
        .toSorted(),
    );
    expect(booted.inspection.actors).toEqual([]);
    expect(booted.records.stored.get(oddNames.actor)).toBe(oddNames.actorText);
    expect(restored.read(mainCart)?.memory.lines).toEqual({
      l1: { quantity: 1, variantId: "v1" },
    });
  });
});

describe("records whose key and content disagree (Records R4, Stage 1, I17)", () => {
  // A format 5 owed row of an operation the machine lacks steps definition-free and is carried in
  // its identity's work record (Records I17, Carried); every other forged record is kept unread.
  const GONE = 'owed/Shop/Cart/{"owner":"gone-op"}';

  it("Records R4: a record whose content names another identity than its key, or whose key does not round-trip, or of another kind than its prefix, is kept unread and reported; the identity it names restores its own record and hears no ending it never made", async () => {
    const run = checked(await borrowedRecordsReload.run());
    const { booted, restored } = run.checkpoints;

    const kept = [
      ...borrowedRecords.owed,
      ...borrowedRecords.lanes,
      ...borrowedRecords.actors,
      ...borrowedRecords.other,
    ].filter(({ key }) => key !== GONE);

    expect(reports(run, 2).toSorted()).toEqual(
      [
        ...kept.map(({ key }) => `RecordUndecodable ${key}`),
        'ObligationCarried work/Shop/Cart/{"owner":"gone-op"}',
      ].toSorted(),
    );
    expect(booted.inspection.actors).toEqual([]);
    expect(restored.read(mainCart)?.memory.lines).toEqual({
      l1: { quantity: 1, variantId: "v1" },
    });
    expect(inOpen(run, 2).filter((e) => e._tag === "Delivered")).toEqual([]);

    expect(restored.inspection.owed).toEqual([]);
    expect(restored.inspection.lanes).toEqual([]);

    for (const { key, text } of kept) expect(restored.records.stored.get(key)).toBe(text);
  });
});

describe("an actor record's context bindings (Restore R5; WriteAhead I3)", () => {
  // Open: a record's context bindings are read without the identity check its own name gets, so a
  // binding to a local actor starts one from the store. A slot whose provider does not read is
  // dropped alone and reported; the rest of the record restores (Records R7, reference table).
  it("Records R4, I9, reference table (slots): a slot bound to a local actor is dropped and reported by its name, the boot wakes the cart it owes without starting a local actor, and the next ensure binds the slot to the ref's shopper", async () => {
    const key = 'actor/Shop/Cart/{"owner":"main"}';

    const bound =
      '{"context":{"shopper":{"machine":"Shop/Shopper","name":"~9"}},"format":3,"graph":{"Shop/Shopper/~9":{}},"machine":"Shop/Cart","memories":[],"memory":{"adding":"","errors":{},"lines":{"l9":{"quantity":1,"variantId":"v1"}},"notice":"","owner":"main","wanted":{}},"name":"{\\"owner\\":\\"main\\"}","reactions":[],"schedules":[],"seen":{"shopper":""},"state":"OPEN"}';

    // The cart's add is out at the reload, so the boot wakes the cart with its saved binding.
    const run = checked(
      await storeStory("restore/bound-to-local")
        .ensure(mainCart)
        .send(mainShopper, Shopper.E.SignIn({ name: "ada" }))
        .world(Carts.addLine.hold())
        .send(mainCart, Cart.E.Add({ lineId: "l1", variantId: "v1" }))
        .world(Fake.storage.put(key, bound))
        .reload({ reattach: false })
        .checkpoint("woken")
        .ensure(mainCart)
        .checkpoint("restored")
        .run(),
    );

    const { woken, restored } = run.checkpoints;

    const locals = [...woken.inspection.actors, ...restored.inspection.actors]
      .map((a) => String(a.actor))
      .filter((a) => a.includes("/~"));

    expect(locals).toEqual([]);
    expect(
      reportsWithReasons(run, 2).some(
        (r) =>
          String(r.code) === "FieldDropped" && r.record === key && r.reason.includes("shopper"),
      ),
    ).toBe(true);
    expect(restored.read(mainCart)?.context.shopper).toBe("ada");
    // The saved line restores; the add out at the reload is told unknown Restored, and the cart's
    // handler retries it, which lands l1.
    expect(restored.read(mainCart)?.memory.lines).toEqual({
      l9: { quantity: 1, variantId: "v1" },
      l1: { quantity: 1, variantId: "v1" },
    });
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
