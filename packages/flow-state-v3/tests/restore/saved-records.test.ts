import { Predicate, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { manifests } from "../../fixtures/index.ts";
import { serializeClient } from "../../fixtures/lanes/app.ts";
import { lanesStory } from "../../fixtures/lanes/stories/usual.ts";
import { answeredWhileDisposing } from "../../fixtures/lanes/stories/structure.ts";
import { guestCart, mainCart } from "../../fixtures/shop/app.ts";
import { Cart } from "../../fixtures/shop/machines/cart.ts";
import { Carts } from "../../fixtures/shop/server/carts.ts";
import { storeStory } from "../../fixtures/shop/stories/usual.ts";
import { mainSession } from "../../fixtures/sign-in/app.ts";
import { sessionStory } from "../../fixtures/sign-in/stories/usual.ts";
import { account } from "../../fixtures/transfers/app.ts";
import { Transfers } from "../../fixtures/transfers/machines/transfers.ts";
import { bankStory } from "../../fixtures/transfers/stories/usual.ts";
import { Fake, type StoryRun } from "../../src/host/testing/index.ts";
import { canonicalText } from "../rules/records.ts";
import { checked } from "../rules/rules.ts";
import { heard, reports } from "./opens.ts";

const JsonText = Schema.fromJsonString(Schema.Json);

// RETURN_TYPE: a type guard narrows a JSON value to its object form.
const isObject = (j: Schema.Json): j is { readonly [k: string]: Schema.Json } =>
  Predicate.isObject(j) && !Array.isArray(j);

// A member of a JSON object, or null where there is none.
const at = (json: Schema.Json, ...path: ReadonlyArray<string>) =>
  path.reduce<Schema.Json>((node, name) => (isObject(node) ? (node[name] ?? null) : null), json);

// A JSON object with one member set, from no members for any other value.
const withMember = (json: Schema.Json, name: string, value: Schema.Json) =>
  Object.fromEntries([...Object.entries(isObject(json) ? json : {}), [name, value]]);

// An Attempt id in the mint's form, as a record saved before the reload holds it.
const ATTEMPT = "att-000000000000000000006d61696e3a31-1";

const send = (transferId: string) => Transfers.E.Send({ transferId, cents: 500 });

// A saved head, as Records' `HeadShape` spells it.
const head = (hold: "Out" | "Held", rest: Schema.Json) => ({
  attempt: ATTEMPT,
  claims: [],
  hold,
  rest,
  retryCount: 0,
});

// One identity's work record (Records' `WorkShape`) under the current format, its lanes at the
// root subject.
const workText = (
  lanes: { readonly [contract: string]: { readonly [keyText: string]: Schema.Json } },
  rows: ReadonlyArray<Schema.Json> = [],
) => canonicalText({ body: { lanes: { "": lanes }, rows }, format: 6 });

const T1 = '{"transferId":"t1"}';

const ACCOUNT_WORK = "work/Bank/Transfers/acct-1";

// The account's work record holding one transfer lane.
const transferWork = (lane: Schema.Json, rows: ReadonlyArray<Schema.Json> = []) =>
  workText({ "Bank/transfer": { [T1]: lane } }, rows);

// The account booted over the store as it stands plus one saved text, then ensured.
const bootAccount = (id: string, key: string, text: string) =>
  bankStory(id)
    .world(Fake.storage.put(key, text))
    .reload()
    .ensure(account)
    .checkpoint("after")
    .run()
    .then(checked);

const keptUnread = (run: StoryRun<"after">, key: string, text: string) => ({
  reported: reports(run, 2).includes(`RecordUndecodable ${key}`),
  bytes: run.checkpoints.after.records.stored.get(key) === text,
});

describe("a saved work record (Records Types WorkShape; R16)", () => {
  it.fails("Records R16: an Out head restores Held, and its one unknown Restored is heard at the start", async () => {
    const run = await bootAccount(
      "records/out-head",
      ACCOUNT_WORK,
      transferWork({ displaced: [], head: head("Out", { cents: 500 }), queue: [] }),
    );

    expect(heard(run, 2, "transfer")).toEqual(["Unsure"]);
    expect(run.checkpoints.after.inspection.lanes).toEqual([
      expect.objectContaining({ state: "Held" }),
    ]);
  });

  it.fails("Records R14, I6: a work record whose head and a row hold one Attempt is kept unread, byte for byte, and nothing of it is heard", async () => {
    const lane = { displaced: [], head: head("Out", { cents: 500 }), queue: [] };
    const control = await bootAccount("records/head-alone", ACCOUNT_WORK, transferWork(lane));

    const row = {
      attempt: ATTEMPT,
      contract: "Bank/transfer",
      ending: { channel: "success", reason: "success", value: { receipt: "r1" } },
      keyText: T1,
      kept: false,
      rest: { cents: 500 },
      subject: "",
    };

    const forged = transferWork(lane, [row]);
    const run = await bootAccount("records/answer-beside-hold", ACCOUNT_WORK, forged);

    expect(heard(control, 2, "transfer")).toEqual(["Unsure"]);
    expect(keptUnread(run, ACCOUNT_WORK, forged)).toEqual({ reported: true, bytes: true });
    expect(heard(run, 2, "transfer")).toEqual([]);
  });
});

describe("a lane holds a head, or a queue behind one, or displaced Attempts (Records Types LaneShape)", () => {
  const SERIALIZE_WORK = "work/Lanes/serialize/serialize-1";
  const FLOW = '{"repo":"flow"}';

  const boot = (id: string, text: string) =>
    lanesStory(id)
      .world(Fake.storage.put(SERIALIZE_WORK, text))
      .reload()
      .ensure(serializeClient)
      .checkpoint("after")
      .run()
      .then(checked);

  it.fails("Records Types LaneShape, R16: a lane with no head, or a queue with no head before it, is kept unread, and no queued commit is heard from it", async () => {
    const control = await boot(
      "records/queue-behind-head",
      workText({ "Git/sync": { [FLOW]: { displaced: [], head: head("Out", {}), queue: [{}] } } }),
    );

    expect(heard(control, 2, "sync")).toEqual(["NotSent", "Unsure"]);

    for (const lane of [
      { displaced: [], queue: [] },
      { displaced: [], queue: [{}] },
    ]) {
      const forged = workText({ "Git/sync": { [FLOW]: lane } });
      const run = await boot("records/headless-lane", forged);

      expect(keptUnread(run, SERIALIZE_WORK, forged)).toEqual({ reported: true, bytes: true });
      expect(heard(run, 2, "sync")).toEqual([]);
    }
  });
});

describe("an obligation whose saved names no longer read is carried (Records reference table, Carried; I16)", () => {
  // The lane's JSON stays as it was, it is not delivered, its key stays held, and it is reported.
  const carried = async (id: string, forged: string, keyHeld: boolean) => {
    const run = checked(
      await bankStory(id)
        .world(Fake.storage.put(ACCOUNT_WORK, forged))
        .reload()
        .ensure(account)
        .checkpoint("after")
        .send(account, send("t1"))
        .checkpoint("sent")
        .run(),
    );

    return {
      reported: reports(run, 2).includes(`ObligationCarried ${ACCOUNT_WORK}`),
      heard: heard(run, 2, "transfer"),
      bytes: run.checkpoints.after.records.stored.get(ACCOUNT_WORK) === forged,
      declined: keyHeld
        ? run.checkpoints.sent.read(account)?.memory.notice === "not sent Rejected"
        : true,
    };
  };

  it.fails("Records reference table: a head whose rest no longer reads with its key, or whose rest holds a key field, is carried and its key declines a send; a key text that no longer reads is carried", async () => {
    const control = await bootAccount(
      "records/reads",
      ACCOUNT_WORK,
      transferWork({ displaced: [], head: head("Out", { cents: 500 }), queue: [] }),
    );

    expect(heard(control, 2, "transfer")).toEqual(["Unsure"]);

    for (const rest of [{ cents: "500" }, { cents: 500, transferId: "t1" }]) {
      const forged = transferWork({ displaced: [], head: head("Out", rest), queue: [] });

      expect(await carried("records/rest-unread", forged, true)).toEqual({
        reported: true,
        heard: [],
        bytes: true,
        declined: true,
      });
    }

    const badKey = workText({
      "Bank/transfer": {
        '{"transferId":1}': { displaced: [], head: head("Out", { cents: 500 }), queue: [] },
      },
    });

    expect(await carried("records/key-unread", badKey, false)).toEqual({
      reported: true,
      heard: [],
      bytes: true,
      declined: true,
    });
  });

  it.fails("Records reference table, lanes contract: a lane of a read operation is carried, never restored as a write, while the identity's write lane restores", async () => {
    const SESSION_WORK = 'work/Auth/Session/{"email":"elif@kamp.us"}';
    const ELIF = '{"email":"elif@kamp.us"}';
    const save = { displaced: [], head: head("Out", { handle: "elif-kaya" }), queue: [] };

    const boot = async (id: string, text: string) =>
      checked(
        await sessionStory(id)
          .world(Fake.storage.put(SESSION_WORK, text))
          .reload()
          .ensure(mainSession)
          .checkpoint("after")
          .run(),
      );

    const control = await boot(
      "records/save-lane",
      workText({ "Auth/set-username": { [ELIF]: save } }),
    );

    expect(heard(control, 2, "save")).toEqual(["SaveUnsure"]);

    const forged = workText({
      "Auth/me": { [ELIF]: { displaced: [], head: head("Out", {}), queue: [] } },
      "Auth/set-username": { [ELIF]: save },
    });

    const run = await boot("records/read-lane", forged);

    expect(reports(run, 2)).toContain(`ObligationCarried ${SESSION_WORK}`);
    expect(heard(run, 2, "save")).toEqual(["SaveUnsure"]);
    expect(heard(run, 2, "me")).toEqual([]);
    expect(run.checkpoints.after.inspection.lanes).toEqual([
      expect.objectContaining({ state: "Held" }),
    ]);
  });

  it.fails("Records reference table, lanes contract (Retired): a lane of a contract no machine declares is carried byte for byte beside the rows its identity still hears", async () => {
    const opens = answeredWhileDisposing.steps.filter((s) => s._tag === "reload").length + 1;
    const ended = checked(await answeredWhileDisposing.run()).end.records.stored;
    const key = "work/Lanes/serialize/serialize-1";
    const saved = ended.get(key);

    if (saved === undefined) throw new Error(`the story left no ${key}`);

    const retired = {
      displaced: [],
      head: { ...head("Held", {}), attempt: "att-000000000000000000006d61696e3a39-9" },
      queue: [],
    };

    const json = Schema.decodeUnknownSync(JsonText)(saved);
    const lanes = at(json, "body", "lanes", "");

    const forged = canonicalText(
      withMember(
        json,
        "body",
        withMember(at(json, "body"), "lanes", {
          "": withMember(lanes, "Git/retired", { '{"repo":"flow"}': retired }),
        }),
      ),
    );

    const retiredText = canonicalText({ '{"repo":"flow"}': retired });

    const after = async (text: string) =>
      checked(
        await answeredWhileDisposing
          .world(Fake.storage.put(key, text))
          .reload()
          .ensure(serializeClient)
          .checkpoint("after")
          .run(),
      );

    const control = await after(saved);
    const run = await after(forged);

    expect(heard(run, opens + 1, "sync")).toEqual(heard(control, opens + 1, "sync"));
    expect(reports(run, opens + 1)).toContain(`ObligationCarried ${key}`);
    expect(run.checkpoints.after.records.stored.get(key)).toContain(`"Git/retired":${retiredText}`);
  });
});

describe("a record read only as the identity its key names (Records R4, I8, I9)", () => {
  it("Records R4, I9: the main cart's record copied under the guest's key restores nothing of the main cart's identity", async () => {
    const saved = checked(
      await storeStory("records/main-cart")
        .ensure(mainCart)
        .send(mainCart, Cart.E.Add({ lineId: "l1", variantId: "v1" }))
        .checkpoint("added")
        .run(),
    );

    const mainKey = 'actor/Shop/Cart/{"owner":"main"}';
    const guestKey = 'actor/Shop/Cart/{"owner":"guest"}';
    const text = saved.checkpoints.added.records.stored.get(mainKey) ?? "";

    expect(text).not.toBe("");

    const run = checked(
      await storeStory("records/guest-cart-key")
        .world(Fake.storage.put(guestKey, text))
        .reload()
        .ensure(guestCart)
        .send(guestCart, Cart.E.Add({ lineId: "l2", variantId: "v1" }))
        .checkpoint("guest")
        .run(),
    );

    expect(run.checkpoints.guest.read(guestCart)?.memory.owner).toBe("guest");
    expect(
      run.checkpoints.guest.read(Carts.addLine).map((call) => call.input.cartId),
    ).not.toContain("main");
  });
});

describe("format 5 lane and owed records step to one work record (Records R12, Format plan)", () => {
  const LANE = `lane/Bank/Transfers/acct-1|transfer|${T1}`;
  const OWED = "owed/Bank/Transfers/acct-1";
  const identity = { machine: "Bank/Transfers", name: "acct-1" };

  const laneFive = canonicalText({
    ...identity,
    attempt: ATTEMPT,
    displaced: [],
    format: 5,
    inFlight: false,
    input: { cents: 500, transferId: "t1" },
    operation: "transfer",
    queue: [],
    retryCount: 0,
  });

  it.fails("Records R12, R16: a format 5 Held head with no owed row is told unknown Restored once, and the capture that writes its work record removes the legacy keys", async () => {
    const run = checked(
      await bankStory("records/upgrade-5-to-6")
        .world(Fake.storage.put(LANE, laneFive))
        .reload()
        .ensure(account)
        .checkpoint("upgraded")
        .reload()
        .ensure(account)
        .checkpoint("again")
        .run(),
    );

    const keys = [...run.checkpoints.upgraded.records.stored.keys()];

    expect(heard(run, 2, "transfer")).toEqual(["Unsure"]);
    expect(heard(run, 3, "transfer")).toEqual([]);
    expect(keys).toContain(ACCOUNT_WORK);
    expect(keys.filter((k) => k.startsWith("lane/") || k.startsWith("owed/"))).toEqual([]);
  });

  it.fails("Records R12, Format plan: an owed row that ends a format 5 head's Attempt fails the step, so both legacy keys are kept byte for byte and nothing of them is heard", async () => {
    const owedFive = canonicalText({
      ...identity,
      format: 5,
      rows: [
        {
          attempt: ATTEMPT,
          channel: "success",
          kept: false,
          lane: `Bank/Transfers/acct-1|transfer|${T1}`,
          operation: "transfer",
          reason: "success",
          value: { receipt: "r1" },
        },
      ],
    });

    const run = checked(
      await bankStory("records/upgrade-bad-row")
        .world(Fake.storage.put(LANE, laneFive), Fake.storage.put(OWED, owedFive))
        .reload()
        .ensure(account)
        .checkpoint("after")
        .run(),
    );

    const { stored } = run.checkpoints.after.records;

    expect(heard(run, 2, "transfer")).toEqual([]);
    expect([stored.get(LANE), stored.get(OWED)]).toEqual([laneFive, owedFive]);
    expect(stored.has(ACCOUNT_WORK)).toBe(false);
  });
});

describe("the forged records the fixtures' samples put in the store (fixtures.md, E7)", () => {
  it("each forged record is canonical JSON, so it differs from a written record only where its comment says", () => {
    const texts = manifests
      .flatMap((m) => m.samples)
      .filter((set) => set.id.endsWith("-records"))
      .flatMap((set) => set.failures.flatMap((w) => (w._tag === "stored" ? [w.text] : [])));

    expect(texts.length).toBeGreaterThan(10);

    for (const text of texts)
      expect(canonicalText(Schema.decodeUnknownSync(JsonText)(text))).toBe(text);
  });
});
