import assert from "node:assert/strict";
import { Effect, Option, Predicate, Schema } from "effect";
import { describe, it } from "vite-plus/test";
import { actorRef, app, definition, deny, Flow, machine, Outcome, transaction } from "../index.ts";
import type { Evidence } from "./inspect.ts";
import { Bell, bootWith, endingsOf, testing } from "./testing/seam.ts";

// A switch the suite turns: while `on`, every outcome mapper of the write throws, so each try of
// its ending is a refused turn (WriteLanes R10). `tries` holds one entry per mapper call.
type Jam = { on: boolean; readonly tries: Array<number> };

const tried = (jam: Jam) => {
  jam.tries.push(jam.tries.length);

  if (jam.on)
    // oxlint-disable-next-line lint-bomb/no-throw-in-core -- the case is an author mapper that throws
    throw new Error("the mapper throws");
};

// A persisted keyed write: each ring is answered by the test through `Bell`, and `counts` keeps
// the retryCount each send carried.
const tollOver = (jam: Jam, counts: Array<number>) => {
  const toll = transaction({
    id: "Test/toll",
    input: { tone: Schema.String.check(Schema.isNonEmpty()) },
    key: ["tone"],
    concurrency: "reject",
    services: [Bell],
    commit: (_input, { attempt }) => {
      counts.push(attempt.retryCount);

      // The bell's "declined" is the server's definite answer; anything else is lost on the wire.
      return Effect.flatMap(Effect.service(Bell), (bell) => bell.ring(attempt.id)).pipe(
        Effect.catchIf(
          (e) => e === "declined",
          () => Outcome.failure({ _tag: "Declined" as const }),
        ),
        Effect.catchIf(Predicate.isString, (e) => Outcome.unknown(e)),
      );
    },
  });

  const Toll = definition({
    id: "Test/Toll",
    persist: true,
    states: ["OPEN"],
    events: {
      Ring: { tone: Schema.String },
      Again: { tone: Schema.String },
      Stop: { tone: Schema.String },
    },
    internalEvents: { Rang: {}, NotRung: { why: Schema.String }, Unsure: Flow.uncertain({}) },
    memory: {},
    operations: ({ E }) => ({
      toll: toll.outcomes({
        success: E.Rang.from(() => {
          tried(jam);

          return {};
        }),
        failure: {
          Declined: E.NotRung.from(() => {
            tried(jam);

            return { why: "Declined" };
          }),
          NotSent: E.NotRung.from((e: { readonly why: string }) => {
            tried(jam);

            return { why: e.why };
          }),
        },
        unknown: E.Unsure.from(() => {
          tried(jam);

          return {};
        }),
      }),
    }),
  });

  const byTone = ({ event }: { readonly event: { readonly tone: string } }) => ({
    tone: event.tone,
  });

  const TollMachine = machine(Toll, ({ S, O }) => ({
    default: S.OPEN,
    on: {
      Ring: { actions: [O.toll.commit(byTone)] },
      Again: { actions: [O.toll.retry(byTone)] },
      Stop: { actions: [O.toll.cancel(byTone)] },
      Rang: {},
      NotRung: {},
      Unsure: {},
    },
  }));

  return { served: app({ id: "test", machines: { toll: TollMachine } }), TollMachine };
};

const tolls = { machine: "Test/Toll", name: "t1" };

// A persisted keyed write whose unknown's handler retries key-less while it may (WriteLanes R9:
// a key-less member in a handler of an event its operation alone maps names that ending's own
// Attempt).
const retrier = (() => {
  const chime = transaction({
    id: "Test/chime",
    input: { tone: Schema.String },
    key: ["tone"],
    concurrency: "reject",
    services: [Bell],
    commit: (_input, { attempt }) =>
      Effect.flatMap(Effect.service(Bell), (bell) => bell.ring(attempt.id)).pipe(
        Effect.catch((e) => Outcome.unknown(e)),
      ),
  });

  const Retrier = definition({
    id: "Test/Retrier",
    persist: true,
    states: ["OPEN"],
    events: { Ring: { tone: Schema.String } },
    internalEvents: { Rang: {}, NotRung: { why: Schema.String }, Unsure: Flow.uncertain({}) },
    memory: {},
    operations: ({ E }) => ({
      chime: chime.outcomes({
        success: E.Rang,
        failure: { NotSent: E.NotRung.from((e: { readonly why: string }) => ({ why: e.why })) },
        unknown: E.Unsure,
      }),
    }),
  });

  const RetrierMachine = machine(Retrier, ({ S, O }) => ({
    default: S.OPEN,
    on: {
      Ring: {
        actions: [
          O.chime.commit(({ event }: { readonly event: { readonly tone: string } }) => ({
            tone: event.tone,
          })),
        ],
      },
      Rang: {},
      NotRung: {},
      Unsure: [{ guard: [O.chime.retryable({ times: 3 })], actions: [O.chime.retry] }, {}],
    },
  }));

  return app({ id: "test", machines: { retrier: RetrierMachine } });
})();

const retrying = { machine: "Test/Retrier", name: "r1" };

const otherToll = { machine: "Test/Toll", name: "t2" };

// One actor that declines its own commit over and over: each `knock` cannot encode, so it
// declines Unencodable with no lane, and its handler knocks again while `n` is below `limit`.
// A step serves at most 10,000 mail items (`serve.ts` drain), so a chain longer than that leaves
// an ending in the mailbox between steps: the backlog WriteAhead R10 allows. At `n === cancelAt`
// the handler also cancels the `toll` lane of tone "a".
const chainOver = (persist: boolean, limit: number, cancelAt: number) => {
  const knock = transaction({
    id: "Test/knock",
    input: { tone: Schema.String.check(Schema.isNonEmpty()) },
    key: [],
    concurrency: "reject",
    services: [],
    commit: () => Effect.succeed("knocked"),
  });

  const toll = transaction({
    id: "Test/chain-toll",
    input: { tone: Schema.String },
    key: ["tone"],
    concurrency: "reject",
    services: [Bell],
    commit: (_input, { attempt }) =>
      Effect.flatMap(Effect.service(Bell), (bell) => bell.ring(attempt.id)).pipe(
        Effect.catch((e) => Outcome.unknown(e)),
      ),
  });

  const Chain = definition({
    id: "Test/Chain",
    persist,
    states: ["OPEN"],
    events: { Go: {}, Poke: {}, Ring: { tone: Schema.String } },
    internalEvents: {
      Knocked: {},
      NotKnocked: { why: Schema.String },
      KnockUnsure: Flow.uncertain({}),
      Rang: {},
      NotRung: { why: Schema.String },
      Unsure: Flow.uncertain({}),
    },
    memory: { n: Flow.initial(Schema.Number, 0) },
    operations: ({ E }) => ({
      knock: knock.outcomes({
        success: E.Knocked,
        failure: {
          NotSent: E.NotKnocked.from((e: { readonly why: string }) => ({ why: e.why })),
        },
        unknown: E.KnockUnsure,
      }),
      toll: toll.outcomes({
        success: E.Rang,
        failure: { NotSent: E.NotRung.from((e: { readonly why: string }) => ({ why: e.why })) },
        unknown: E.Unsure,
      }),
    }),
  });

  const ChainMachine = machine(Chain, ({ S, O }) => ({
    default: S.OPEN,
    on: {
      Go: { updateMemory: () => ({ n: 0 }), actions: [O.knock.commit(() => ({ tone: "" }))] },
      Poke: {},
      Ring: {
        actions: [
          O.toll.commit(({ event }: { readonly event: { readonly tone: string } }) => ({
            tone: event.tone,
          })),
        ],
      },
      NotKnocked: [
        {
          guard: [({ memory }) => memory.n === cancelAt || deny("NotYet")],
          updateMemory: ({ memory }) => ({ n: memory.n + 1 }),
          actions: [O.toll.cancel(() => ({ tone: "a" })), O.knock.commit(() => ({ tone: "" }))],
        },
        {
          guard: [({ memory }) => memory.n < limit || deny("Done")],
          updateMemory: ({ memory }) => ({ n: memory.n + 1 }),
          actions: [O.knock.commit(() => ({ tone: "" }))],
        },
        { updateMemory: ({ memory }) => ({ n: memory.n + 1 }) },
      ],
      Knocked: {},
      KnockUnsure: {},
      Rang: {},
      NotRung: {},
      Unsure: {},
    },
  }));

  return { served: app({ id: "test", machines: { chain: ChainMachine } }), ChainMachine };
};

const chained = { machine: "Test/Chain", name: "c1" };

// Past the drain's 10,000 items per step, so one step leaves the chain's next ending in the mail.
const PAST_DRAIN = 10_050;

const knocksCommitted = (seen: ReadonlyArray<Evidence>) =>
  seen.reduce(
    (n, e) =>
      e._tag === "Turn"
        ? n + e.members.filter((m) => m.operation === "knock" && m.kind === "commit").length
        : n,
    0,
  );

const knocksHeard = (seen: ReadonlyArray<Evidence>) =>
  seen.filter((e) => e._tag === "Turn" && e.event === "NotKnocked").length;

const turnsOf = (seen: ReadonlyArray<Evidence>, events: ReadonlyArray<string>) =>
  seen.flatMap((e) => (e._tag === "Turn" && events.includes(e.event) ? [e.event] : []));

const deliveredOf = (seen: ReadonlyArray<Evidence>) =>
  seen.flatMap((e) =>
    e._tag === "Delivered" ? [`${Option.getOrElse(e.attempt, () => "-")} ${e.event}`] : [],
  );

const lost = (b: ReturnType<typeof bootWith>, attempt: string) => {
  b.bell.waiting.get(attempt)?.(Effect.fail("lost"));
  b.tab.settle();
};

const rung = (b: ReturnType<typeof bootWith>, attempt: string) => {
  b.bell.waiting.get(attempt)?.(Effect.succeed("ding"));
  b.tab.settle();
};

const ring = (b: ReturnType<typeof bootWith>, tone: string, actor = tolls) => {
  testing.send(b.built, actor, "Ring", { tone });
  b.tab.settle();
};

const lastRing = (b: ReturnType<typeof bootWith>) => {
  const attempt = b.bell.rings.at(-1);
  assert.ok(attempt !== undefined, "a ring is on the wire");

  return attempt;
};

// A pending case red on today's core, owed to the step that turns it green: it passes while its body fails the
// assertion whose message holds `red`, the reason it is red today. It fails once the body passes,
// so the step that turns it green makes it an `it`, and it fails when the body fails another way.
const owed = (
  owing: { readonly step: string; readonly red: string },
  name: string,
  body: () => void,
) =>
  it(`${name} [owed to ${owing.step}]`, () => {
    assert.throws(
      body,
      (e) => {
        if (e instanceof assert.AssertionError && e.message.includes(owing.red)) return true;
        // oxlint-disable-next-line lint-bomb/no-throw-in-core -- a test rethrows the failure that is not its owed reason, so it shows as itself
        throw e;
      },
      `the owed case is green: make it an it (${owing.step})`,
    );
  });

/**
 * The owed ledger's cases: each expected result is derived from the cited rule, not from running
 * the code.
 */
describe("the owed ledger on the production runtime", () => {
  // Two endings of lane "a", an unknown and then its re-send's success, are each
  // refused twice: two Kept rows (WriteLanes R10 "every kept ending is its own row"). Each gets
  // exactly one try at every start until heard (WriteLanes I31): two mapper calls at the next
  // boot with the jam on, then both heard, in the order owed, once the jam clears.
  it("two endings refused twice on one lane are two Kept rows, each tried once per start, both heard (WriteLanes I31, R10; WriteLanes T24)", () => {
    const store = new Map<string, string>();
    const jam: Jam = { on: true, tries: [] };
    const { served } = tollOver(jam, []);
    const first = bootWith(served, store, 1);

    testing.attach(first.built, tolls, "host", false);
    ring(first, "a");
    const attempt = lastRing(first);
    lost(first, attempt);
    testing.send(first.built, tolls, "Again", { tone: "a" });
    first.tab.settle();
    assert.deepStrictEqual(first.bell.rings, [attempt, attempt], "the Held Attempt is re-sent");
    rung(first, attempt);
    assert.strictEqual(jam.tries.length, 4, "each ending was tried twice");

    const before = jam.tries.length;
    bootWith(served, store, 2);
    assert.strictEqual(jam.tries.length - before, 2, "one try for each Kept row at the start");

    jam.on = false;
    const third = bootWith(served, store, 3);
    assert.deepStrictEqual(turnsOf(third.seen, ["Unsure", "Rang"]), ["Unsure", "Rang"]);

    const fourth = bootWith(served, store, 4);
    assert.deepStrictEqual(turnsOf(fourth.seen, ["Unsure", "Rang"]), [], "each heard once");
  });

  // WriteLanes I34: "A row's life is reported from the row and nowhere else: Ended once at its
  // birth, ... and exactly one of Delivered or Recorded at its close." A row refused twice, then
  // heard at the next start, is reported Delivered once, when it is heard; today every try reports
  // Delivered before its turn's outcome is known.
  owed(
    { step: "A4", red: "Delivered once, at the row's close" },
    "a row refused twice and heard at its next start is reported Delivered once (WriteLanes I34)",
    () => {
      const jam: Jam = { on: true, tries: [] };
      const { served, TollMachine } = tollOver(jam, []);
      const b = bootWith(served, new Map(), 1);

      testing.attach(b.built, tolls, "host", false);
      ring(b, "a");
      const attempt = lastRing(b);
      rung(b, attempt);
      jam.on = false;
      b.built.runtime.disposeActor(actorRef(TollMachine, "t1"));
      testing.attach(b.built, tolls, "host", false);
      b.tab.settle();

      assert.deepStrictEqual(turnsOf(b.seen, ["Rang"]), ["Rang"], "the row is heard at the start");
      assert.strictEqual(
        b.seen.filter((e) => e._tag === "Delivered" && Option.contains(e.attempt, attempt)).length,
        1,
        "Delivered once, at the row's close",
      );
    },
  );

  // A Kept row (a success refused twice; its lane is Idle, so no Restored joins it) gets one
  // try at each start and is Kept again when refused (Actors R15, I24); once the jam clears it is
  // heard once and never again (WriteLanes I29).
  it("a Kept row gets one try per start across starts with the jam left on, then is heard once (Actors I24, R15; WriteLanes algorithm start)", () => {
    const jam: Jam = { on: true, tries: [] };
    const { served, TollMachine } = tollOver(jam, []);
    const b = bootWith(served, new Map(), 1);

    const adopt = () => {
      b.built.runtime.disposeActor(actorRef(TollMachine, "t1"));
      testing.attach(b.built, tolls, "host", false);
      b.tab.settle();
    };

    testing.attach(b.built, tolls, "host", false);
    ring(b, "a");
    rung(b, lastRing(b));
    assert.strictEqual(jam.tries.length, 2, "refused, then refused on its one redelivery");

    adopt();
    assert.strictEqual(jam.tries.length, 3, "one try at the first adoption");
    adopt();
    assert.strictEqual(jam.tries.length, 4, "one try at the second adoption, the jam left on");

    jam.on = false;
    adopt();
    assert.strictEqual(jam.tries.length, 5);
    assert.deepStrictEqual(turnsOf(b.seen, ["Rang"]), ["Rang"]);
    adopt();
    assert.strictEqual(jam.tries.length, 5, "a heard row is closed");
  });

  // The chain leaves its next decline in the mail
  // between steps. disposeActor suspends the identity: the laneless row goes Waiting (WriteLanes
  // `algorithm` suspend: "rows with no lane included") and the adopting incarnation hears it
  // (Actors I41). Every knock committed is heard exactly once (WriteLanes I27, I29).
  it("a laneless ending in the mail at disposeActor waits and is heard once by the next incarnation (Actors I41, R8; WriteLanes I27, I29; Actors T22)", () => {
    const { served, ChainMachine } = chainOver(false, PAST_DRAIN, -1);
    const b = bootWith(served, new Map(), 1);

    testing.attach(b.built, chained, "host", false);
    testing.send(b.built, chained, "Go", {});
    b.tab.settle();
    b.built.runtime.disposeActor(actorRef(ChainMachine, "c1"));
    b.tab.settle();
    testing.attach(b.built, chained, "host", false);
    b.tab.settle();

    for (const _ of [1, 2, 3]) testing.send(b.built, chained, "Poke", {});
    b.tab.settle();

    assert.strictEqual(
      knocksHeard(b.seen),
      knocksCommitted(b.seen),
      "every knock committed is heard once",
    );
  });

  // At Runtime disposal the backlog's laneless row goes Waiting, is saved with
  // the identity, and the next boot's start delivers it (Actors I41, R22; WriteAhead R5).
  it("a laneless ending in the mail at Runtime disposal is saved and heard once after the reload (Actors I41, R22; WriteLanes I27)", () => {
    const store = new Map<string, string>();
    const { served } = chainOver(true, PAST_DRAIN, -1);
    const first = bootWith(served, store, 1);

    testing.attach(first.built, chained, "host", false);
    testing.send(first.built, chained, "Go", {});
    first.tab.settle();
    testing.disposeRuntime(first.built);
    first.tab.settle();

    // Codec I7: three record kinds, `actor/`, `lane/` and `owed/`; no other key.
    const kinds = new Set([...store.keys()].map((k) => k.split("/")[0]));
    assert.ok(kinds.has("owed"), "the waiting row is saved in the identity's owed record");
    assert.deepEqual(
      [...kinds].filter((k) => !["actor", "lane", "owed"].includes(k ?? "")),
      [],
      "no record of another kind",
    );

    const second = bootWith(served, store, 2);
    testing.attach(second.built, chained, "host", true);
    second.tab.settle();

    for (const _ of [1, 2, 3]) testing.send(second.built, chained, "Poke", {});
    second.tab.settle();

    assert.strictEqual(
      knocksHeard(first.seen) + knocksHeard(second.seen),
      knocksCommitted(first.seen) + knocksCommitted(second.seen),
      "every knock committed is heard once",
    );
  });

  // A disposed identity has no actor record, so its saved rows wake no one at boot: "an Owing
  // identity whose record is quarantined or reset has no live incarnation and its endings stay
  // parked until an adopting ensure" (Restore I1). The adopting ensure's start hears them once.
  it("a disposed identity's saved rows wake no one at boot and are heard once by the adopting ensure (Restore I1, R1; Actors I41)", () => {
    const store = new Map<string, string>();
    const { served, ChainMachine } = chainOver(true, PAST_DRAIN, -1);
    const first = bootWith(served, store, 1);

    testing.attach(first.built, chained, "host", false);
    testing.send(first.built, chained, "Go", {});
    first.tab.settle();
    first.built.runtime.disposeActor(actorRef(ChainMachine, "c1"));
    first.tab.settle();
    testing.disposeRuntime(first.built);
    first.tab.settle();

    const second = bootWith(served, store, 2);
    assert.strictEqual(
      second.seen.filter((e) => e._tag === "Incarnated").length,
      0,
      "a disposed identity's rows wake no identity at boot",
    );

    testing.attach(second.built, chained, "host", false);
    second.tab.settle();

    for (const _ of [1, 2, 3]) testing.send(second.built, chained, "Poke", {});
    second.tab.settle();

    assert.strictEqual(
      knocksHeard(first.seen) + knocksHeard(second.seen),
      knocksCommitted(first.seen) + knocksCommitted(second.seen),
      "every knock committed is heard once",
    );
  });

  // A re-send waiting for its capture when the Runtime is disposed goes Held
  // (WriteLanes `algorithm`, disposal starts) and is saved Held, so the next boot wakes nothing
  // (Restore R1, I1; Actors T23). An ensure then hears unknown { Restored } (Actors R10), and a
  // retry invokes the Attempt once more, sent before (WriteLanes I26).
  it("a head held from Recapturing at Runtime disposal is saved Held: the boot wakes nothing (Actors T23, R22; Restore I1, R1)", () => {
    const store = new Map<string, string>();
    const counts: Array<number> = [];
    const { served } = tollOver({ on: false, tries: [] }, counts);
    const first = bootWith(served, store, 1);

    testing.attach(first.built, tolls, "host", false);
    ring(first, "a");
    const attempt = lastRing(first);
    lost(first, attempt);

    // The retry's capture is issued; the Runtime is disposed before its answer is heard.
    testing.send(first.built, tolls, "Again", { tone: "a" });
    testing.disposeRuntime(first.built);
    first.tab.settle();

    const second = bootWith(served, store, 2);
    assert.strictEqual(
      second.seen.filter((e) => e._tag === "Incarnated").length,
      0,
      "a Held head wakes no identity at boot",
    );

    testing.attach(second.built, tolls, "host", true);
    second.tab.settle();
    assert.deepStrictEqual(endingsOf(second.seen, attempt), ["unknown Restored"]);

    testing.send(second.built, tolls, "Again", { tone: "a" });
    second.tab.settle();
    assert.deepStrictEqual(second.bell.rings, [attempt], "the retry invokes the Attempt once");
    assert.ok((counts.at(-1) ?? 0) > 0, "the re-send carries a retryCount above 0");
  });

  // A never-sent head at Runtime disposal ends NotSent { Disposed } and its lane drops
  // (WriteLanes `algorithm`, disposal starts; Actors R22, I29): after a reload no lane record is
  // left, the NotSent is heard once, and no unknown { Restored } is invented.
  it("a never-sent head at Runtime disposal leaves no lane, and its NotSent { Disposed } is heard once after a reload (Actors R22, I29; Actors T23)", () => {
    const store = new Map<string, string>();
    const { served } = tollOver({ on: false, tries: [] }, []);
    const first = bootWith(served, store, 1);

    testing.attach(first.built, tolls, "host", false);
    testing.send(first.built, tolls, "Ring", { tone: "a" });
    testing.disposeRuntime(first.built);
    first.tab.settle();
    assert.deepStrictEqual(first.bell.rings, [], "never sent");

    const second = bootWith(served, store, 2);
    testing.attach(second.built, tolls, "host", true);
    second.tab.settle();

    assert.deepStrictEqual(
      [...store.keys()].filter((k) => k.startsWith("lane/")),
      [],
      "no lane record",
    );
    assert.deepStrictEqual(
      turnsOf(second.seen, ["NotRung", "Unsure"]),
      ["NotRung"],
      "the NotSent is heard once after the reload",
    );

    const third = bootWith(served, store, 3);
    testing.attach(third.built, tolls, "host", true);
    third.tab.settle();
    assert.deepStrictEqual(turnsOf(third.seen, ["NotRung", "Unsure"]), [], "heard once");
  });

  // The success is applied to lane "a" when its call settles (WriteLanes I32),
  // so a cancel admitted before the success's turn finds the lane Idle and does nothing
  // (`algorithm`, cancel on Idle): the machine hears the success, never unknown { Cancelled }.
  // The chain's first turn after the settlement runs the cancel, before the success's turn.
  it("a cancel admitted between a success's settlement and its turn leaves it a success (WriteLanes I32, R10; WriteLanes T25)", () => {
    const { served } = chainOver(false, PAST_DRAIN, 9_999);
    const b = bootWith(served, new Map(), 1);

    testing.attach(b.built, chained, "host", false);
    ring(b, "a", chained);
    const attempt = lastRing(b);
    testing.send(b.built, chained, "Go", {});
    b.tab.settle();
    rung(b, attempt);

    assert.deepStrictEqual(
      endingsOf(b.seen, attempt),
      ["success success"],
      "the machine hears the success",
    );
    assert.deepStrictEqual(
      turnsOf(b.seen, ["Rang", "Unsure"]),
      ["Rang"],
      "the machine hears the success",
    );
  });

  // Attempts have their own counter (WriteLanes R5, I35): the same commits give the same
  // Attempt ids whatever else is minted between them (an incarnation and its timers, a decline).
  // Another Attempt is not "another id", so nothing between the commits mints one.
  it("Attempt ids keep their numbers when other ids are minted between commits (WriteLanes I35, R5; WriteLanes T27)", () => {
    const run = (between: boolean) => {
      const { served } = tollOver({ on: false, tries: [] }, []);
      const b = bootWith(served, new Map(), 7);
      testing.attach(b.built, tolls, "host", false);
      ring(b, "a");
      rung(b, lastRing(b));

      if (between) {
        testing.attach(b.built, otherToll, "host", false);
        ring(b, "");
      }

      ring(b, "b");

      return b.bell.rings.filter((_, i) => i === 0 || i === b.bell.rings.length - 1);
    };

    assert.deepStrictEqual(run(true), run(false), "the Attempt ids are equal");
  });

  // WriteLanes `algorithm` ledger, start: "Waiting goes Queued and Kept goes Retrying, in the order
  // the rows were owed". Rows owed across two lanes: a Kept unknown on "b", a Waiting success on
  // "a", then a Waiting success on "b"; the adoption hears them in that order.
  it("a start delivers Waiting and Kept rows in the order owed, across lanes (WriteLanes algorithm start; Restore R3)", () => {
    const jam: Jam = { on: true, tries: [] };
    const { served, TollMachine } = tollOver(jam, []);
    const b = bootWith(served, new Map(), 1);

    testing.attach(b.built, tolls, "host", false);
    ring(b, "b");
    const onB = lastRing(b);
    lost(b, onB);
    ring(b, "a");
    const onA = lastRing(b);
    testing.send(b.built, tolls, "Again", { tone: "b" });
    b.tab.settle();
    b.built.runtime.disposeActor(actorRef(TollMachine, "t1"));
    rung(b, onA);
    rung(b, onB);
    jam.on = false;
    const from = b.seen.length;
    testing.attach(b.built, tolls, "host", false);
    b.tab.settle();

    assert.deepStrictEqual(
      deliveredOf(b.seen.slice(from)),
      [`${onB} Unsure`, `${onA} Rang`, `${onB} Rang`],
      "rows are heard in the order owed, across lanes",
    );
  });

  // The same rows across a reload: a Kept row owed before Waiting rows comes back first, since the
  // identity's rows are saved in one record in owed order (Restore R3; Codec I7).
  it("after a reload, a Kept row owed before Waiting rows is still heard first (Restore R3; Codec I7)", () => {
    const store = new Map<string, string>();
    const jam: Jam = { on: true, tries: [] };
    const { served, TollMachine } = tollOver(jam, []);
    const b = bootWith(served, store, 1);

    testing.attach(b.built, tolls, "host", false);
    ring(b, "b");
    const onB = lastRing(b);
    lost(b, onB);
    ring(b, "a");
    const onA = lastRing(b);
    testing.send(b.built, tolls, "Again", { tone: "b" });
    b.tab.settle();
    b.built.runtime.disposeActor(actorRef(TollMachine, "t1"));
    rung(b, onA);
    rung(b, onB);
    testing.disposeRuntime(b.built);
    b.tab.settle();

    jam.on = false;
    const second = bootWith(served, store, 2);
    testing.attach(second.built, tolls, "host", false);
    second.tab.settle();

    assert.deepStrictEqual(
      deliveredOf(second.seen),
      [`${onB} Unsure`, `${onA} Rang`, `${onB} Rang`],
      "rows are heard in the order owed after a reload",
    );
  });

  // Two Held heads with no row, created in reverse lane-id order ("c" then
  // "b"): every start (return, adoption, reload) owes each its unknown { Restored } lane by lane
  // in lane-id order (WriteLanes `algorithm` start; Restore R3), so "b" is heard before "c", and
  // the three starts deliver the same sequence (Actors I40, T21). A boot parks nothing.
  it("one start delivers on return, adoption and reload, Held heads in lane-id order, and a boot parks nothing (Actors I40, R10; Restore R1, R3; Actors T21)", () => {
    const setup = (store: Map<string, string>) => {
      const { served, TollMachine } = tollOver({ on: false, tries: [] }, []);
      const b = bootWith(served, store, 1);
      testing.attach(b.built, tolls, "host", false);
      ring(b, "c");
      const c = lastRing(b);
      lost(b, c);
      ring(b, "b");
      const bb = lastRing(b);
      lost(b, bb);

      return { b, served, TollMachine, order: [`${bb} Unsure`, `${c} Unsure`] };
    };

    const heardAfter = (seen: ReadonlyArray<Evidence>, from: number) =>
      deliveredOf(seen.slice(from));

    // Return: the free incarnation ends past its grace and is ensured again from its record.
    const returned = setup(new Map());
    testing.detach(returned.b.built, tolls, "host");
    returned.b.tab.advance(1000);
    const returnAt = returned.b.seen.length;
    testing.attach(returned.b.built, tolls, "host", true);
    returned.b.tab.settle();

    // Adoption: disposeActor, then an ensure binds the unbound lanes.
    const adopted = setup(new Map());
    adopted.b.built.runtime.disposeActor(actorRef(adopted.TollMachine, "t1"));
    const adoptAt = adopted.b.seen.length;
    testing.attach(adopted.b.built, tolls, "host", false);
    adopted.b.tab.settle();

    // Reload: a boot rebuilds the lanes Held and wakes nothing (Restore R1).
    const store = new Map<string, string>();
    const reloaded = setup(store);
    const second = bootWith(reloaded.served, store, 2);
    assert.deepStrictEqual(
      second.seen.filter((e) => e._tag === "Parked" || e._tag === "Ended").map((e) => e._tag),
      [],
      "a boot owes, parks and delivers nothing",
    );
    testing.attach(second.built, tolls, "host", true);
    second.tab.settle();

    const inLaneIdOrder = "every start hears the Held heads in lane-id order";
    assert.deepStrictEqual(heardAfter(returned.b.seen, returnAt), returned.order, inLaneIdOrder);
    assert.deepStrictEqual(heardAfter(adopted.b.seen, adoptAt), adopted.order, inLaneIdOrder);
    assert.deepStrictEqual(heardAfter(second.seen, 0), reloaded.order, inLaneIdOrder);
  });

  // A Rejected decline from the lane table has no lane
  // (WriteLanes R10: "a declined commit has no Attempt and no lane"), so its Kept row blocks no
  // key (WriteLanes R6, I33): once the head resolves, a commit on the key mints.
  it("a table decline refused twice is a laneless Kept row that blocks no key (WriteLanes I33, R6, R10; WriteLanes T26)", () => {
    const jam: Jam = { on: true, tries: [] };
    const { served } = tollOver(jam, []);
    const b = bootWith(served, new Map(), 1);

    testing.attach(b.built, tolls, "host", false);
    ring(b, "a");
    const attempt = lastRing(b);
    ring(b, "a");
    assert.strictEqual(jam.tries.length, 2, "the decline's turn is refused twice");

    jam.on = false;
    rung(b, attempt);
    ring(b, "a");
    assert.strictEqual(b.bell.rings.length, 2, "the next commit on the key mints and is sent");
  });

  // The opposite case: a never-sent Attempt's NotSent row keeps
  // its lane, so when Kept it blocks the key (WriteLanes R6, I33): the next commit declines
  // Rejected and nothing is sent.
  it("a never-sent Attempt's NotSent, refused twice, is a Kept row on its lane that blocks its key (WriteLanes I33, R6)", () => {
    const jam: Jam = { on: true, tries: [] };
    const { served } = tollOver(jam, []);
    const b = bootWith(served, new Map(), 1);

    testing.attach(b.built, tolls, "host", false);
    testing.send(b.built, tolls, "Ring", { tone: "a" });
    testing.send(b.built, tolls, "Stop", { tone: "a" });
    b.tab.settle();
    assert.strictEqual(jam.tries.length, 2, "the NotSent { Cancelled } turn is refused twice");

    jam.on = false;
    ring(b, "a");
    assert.deepStrictEqual(b.bell.rings, [], "the Kept row blocks its key");
    assert.deepStrictEqual(
      b.seen.flatMap((e) =>
        e._tag === "Ended" && Option.isNone(e.attempt) ? [`${e.channel} ${e.reason}`] : [],
      ),
      ["notSent Rejected"],
    );
  });

  // A head restored Held after a reload was sent before (WriteLanes I36),
  // so when its retry's re-send is answered with a definite failure, that ending is delivered as
  // unknown { StillUnknown } and the lane stays Held (WriteLanes R2, R5).
  it("a restored Held head retried and declined is delivered unknown StillUnknown (WriteLanes I36, R2, R5)", () => {
    const store = new Map<string, string>();
    const { served } = tollOver({ on: false, tries: [] }, []);
    const first = bootWith(served, store, 1);

    testing.attach(first.built, tolls, "host", false);
    ring(first, "a");
    const attempt = lastRing(first);
    lost(first, attempt);

    const second = bootWith(served, store, 2);
    testing.attach(second.built, tolls, "host", true);
    second.tab.settle();
    testing.send(second.built, tolls, "Again", { tone: "a" });
    second.tab.settle();
    second.bell.waiting.get(attempt)?.(Effect.fail("declined"));
    second.tab.settle();

    assert.deepStrictEqual(
      endingsOf(second.seen, attempt),
      ["unknown Restored", "unknown StillUnknown"],
      "a definite failure after an earlier send is delivered unknown StillUnknown",
    );

    // WriteAhead I24: the Held head's lane record is written not in flight.
    second.tab.advance(6000);
    second.tab.settle();

    const saved = [...store.entries()].flatMap(([key, value]) =>
      key.startsWith("lane/") && value.includes(attempt) ? [value] : [],
    );

    assert.ok(
      saved.length === 1 && saved[0]?.includes('"inFlight":false'),
      "the Held head's lane record reads not in flight",
    );
  });

  // A refused capture holds the head and owes
  // unknown { StorageRefused } (WriteAhead R13); its handler's key-less retryable and retry name
  // that ending's own Attempt (WriteLanes R9), so the Held head, still under its retry limit, is
  // re-sent once its next capture lands. Today the row has no lane, so the key-less members name
  // nothing and the head stays Held: PART-pay-stress-3, PART-pay-stress-8 and PART-cells-stress-9
  // go STUCK where R9 retries.
  owed(
    { step: "T19", red: "the refused capture's unknown is retried" },
    "a key-less retry in a refused capture's unknown handler names its own Attempt (WriteLanes R9; WriteAhead R13)",
    () => {
      const refusals = { left: new Array<true>() };
      const b = bootWith(retrier, new Map(), 1, true, { captureMs: 0, hung: false }, refusals);

      testing.attach(b.built, retrying, "host", false);
      ring(b, "a", retrying);
      const attempt = lastRing(b);
      refusals.left.push(true);
      lost(b, attempt);

      assert.deepStrictEqual(
        endingsOf(b.seen, attempt),
        ["unknown Error", "unknown StorageRefused"],
        "the capture of the first retry was refused",
      );
      assert.deepStrictEqual(
        b.bell.rings,
        [attempt, attempt],
        "the refused capture's unknown is retried",
      );
    },
  );
});
