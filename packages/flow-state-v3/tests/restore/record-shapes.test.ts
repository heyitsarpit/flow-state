import { Predicate, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { home } from "../../fixtures/home/index.ts";
import { lanes } from "../../fixtures/lanes/index.ts";
import { session } from "../../fixtures/session/index.ts";
import { shop } from "../../fixtures/shop/index.ts";
import { account } from "../../fixtures/transfers/app.ts";
import { Transfers } from "../../fixtures/transfers/machines/transfers.ts";
import { Bank } from "../../fixtures/transfers/server/bank.ts";
import { bankStory } from "../../fixtures/transfers/stories/usual.ts";
import type { Story } from "../../src/host/testing/index.ts";
import { canonicalText } from "../rules/records.ts";
import { checked } from "../rules/rules.ts";

const JsonText = Schema.fromJsonString(Schema.Json);

// The store a Story leaves at its end, each text parsed.
const storeOf = async (story: Story<string>) =>
  new Map<string, Schema.Json>(
    [...checked(await story.run()).end.records.stored].map(
      ([key, text]) => [key, Schema.decodeUnknownSync(JsonText)(text)] as const,
    ),
  );

// RETURN_TYPE: a type guard narrows a JSON value to its object form.
const isObject = (j: Schema.Json): j is { readonly [k: string]: Schema.Json } =>
  Predicate.isObject(j) && !Array.isArray(j);

// A member of a JSON object, or null where there is none.
const at = (json: Schema.Json, ...path: ReadonlyArray<string>) =>
  path.reduce<Schema.Json>((node, name) => (isObject(node) ? (node[name] ?? null) : null), json);

// A record of a store, or null where it holds none.
const read = (store: ReadonlyMap<string, Schema.Json>, key: string) => store.get(key) ?? null;

const membersOf = (json: Schema.Json) => (isObject(json) ? Object.keys(json).toSorted() : []);

// A fixture's registered Story by its export name.
const named = (stories: Readonly<Record<string, Story<string>>>, name: string) => {
  const story = stories[name];

  if (story === undefined) throw new Error(`no Story ${name}`);

  return story;
};

const homeUsual = named(home.stories, "usual");
const sessionUsual = named(session.stories, "usual");

const heldTransfer = bankStory("records/held-transfer-shape")
  .ensure(account)
  .world(Bank.transfer.drop({ at: "response" }))
  .send(account, Transfers.E.Send({ transferId: "t1", cents: 500 }));

const POSITION = ["graph", "instances", "memory", "schedules", "slots", "state"];

// Every record a Story's Runtime wrote, against Records' key grammar and `Envelope`, with each
// body's members as its kind's `Shape` names them.
const formBreaches = (store: ReadonlyMap<string, Schema.Json>) =>
  [...store].flatMap(([key, json]) => {
    const kind = key.slice(0, key.indexOf("/") + 1);
    const envelope = membersOf(json).filter((m) => m !== "shape");
    const body = membersOf(at(json, "body")).filter((m) => m !== "bookmarks");
    const breaches: Array<string> = [];

    if (kind !== "actor/" && kind !== "work/") breaches.push(`${key}: a key of kind ${kind}`);

    if (envelope.join() !== "body,format") breaches.push(`${key}: envelope ${envelope.join()}`);

    if (at(json, "format") !== 6)
      breaches.push(`${key}: format ${canonicalText(at(json, "format") ?? null)}`);

    if (kind === "actor/" && body.join() !== POSITION.join())
      breaches.push(`${key}: position body ${body.join()}`);

    if (kind === "work/" && body.join() !== "lanes,rows")
      breaches.push(`${key}: work body ${body.join()}`);

    return breaches;
  });

describe("what the Runtime writes is the format's normal form (Records R4, R11, I8; Types)", () => {
  it("Records R4, R11, I8: every key the Runtime writes is an actor or work record whose envelope holds only body and format and whose body holds only its Shape's members, never the identity its key names", async () => {
    const stores = await Promise.all(
      [heldTransfer, named(lanes.stories, "answeredWhileDisposing"), homeUsual, sessionUsual].map(
        storeOf,
      ),
    );

    expect(stores.flatMap(formBreaches)).toEqual([]);
  });

  it("Records Identity: a lane's head saves its input without the fields its key text names (rest), held, with no claim", async () => {
    const store = await storeOf(heldTransfer);

    const lane = at(
      read(store, "work/Bank/Transfers/acct-1"),
      "body",
      "lanes",
      "",
      "Bank/transfer",
      '{"transferId":"t1"}',
    );

    expect(at(lane, "head", "rest")).toEqual({ cents: 500 });
    expect(at(lane, "head", "hold")).toBe("Held");
    expect(at(lane, "head", "claims")).toEqual([]);
    expect(at(lane, "queue")).toEqual([]);
  });

  it("Records Identity: a memory field declared Flow.input is not saved, since the name holds it", async () => {
    const homeStore = await storeOf(homeUsual);
    const shopStore = await storeOf(named(shop.stories, "quantityLost"));

    const roomMemory = membersOf(
      at(read(homeStore, 'actor/Home/Room/{"room":"lounge"}'), "body", "memory"),
    );

    const cartMemory = membersOf(
      at(read(shopStore, 'actor/Shop/Cart/{"owner":"main"}'), "body", "memory"),
    );

    expect({ room: roomMemory.includes("target"), cart: cartMemory.includes("lines") }).toEqual({
      room: true,
      cart: true,
    });
    expect([...roomMemory, ...cartMemory].filter((f) => f === "room" || f === "owner")).toEqual([]);
  });

  it("Records Types SlotShape: a slot saves its provider and last selection in one entry, its reactions' baselines beside them", async () => {
    const store = await storeOf(homeUsual);
    const room = read(store, 'actor/Home/Room/{"room":"lounge"}');

    expect(at(room, "body", "slots", "mode")).toEqual({
      baselines: {},
      provider: { machine: "Home/House", name: "home" },
      seen: { value: "HOME" },
    });
  });

  it("Records I8 (graph): a consumer saves no graph entry for a provider that has its own record, since that record holds its wiring", async () => {
    const homeStore = await storeOf(homeUsual);
    const sessionStore = await storeOf(sessionUsual);

    expect(homeStore.has("actor/Home/House/home")).toBe(true);
    expect(sessionStore.has("actor/Workspace/Session/main")).toBe(true);
    expect(at(read(homeStore, 'actor/Home/Room/{"room":"lounge"}'), "body", "graph")).toEqual({});
    expect(
      membersOf(at(read(sessionStore, "actor/Workspace/Team/core"), "body", "graph")),
    ).not.toContain("Workspace/Session/main");
    expect(at(read(sessionStore, "actor/Workspace/Team/core"), "body", "state")).not.toBeNull();
  });
});
