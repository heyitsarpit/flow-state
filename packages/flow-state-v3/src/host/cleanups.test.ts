import assert from "node:assert/strict";
import {
  Cause,
  Context,
  Deferred,
  Duration,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  Predicate,
  Brand,
  Scope,
} from "effect";
import { describe, it } from "vite-plus/test";
import type { TicketId } from "../core/world.ts";
import { makeEdge } from "./edge.ts";
import { makeOwner, OwnerRecord } from "./owners/owners.ts";
import { type FlowError, RuntimeDefaults } from "../index.ts";
import { Host, type Store, StoreRefused } from "./host.ts";
import type { Runtime } from "./runtime.ts";
import {
  died,
  flowOf,
  hung,
  keeps,
  Line,
  type LineDropped,
  lineDropped,
  lineWith,
  note,
  phone,
  quietLine,
  readyObserved,
  readyOver,
  rejection,
  reporting,
  type Tab,
  thrownBy,
} from "./test/cleanups.ts";
import { platformOver } from "./testing/seam.ts";

// A tab whose store writes never answer, each running `cleanup` once interrupted.
const hungStoreTab = (cleanup: Effect.Effect<void, StoreRefused>) => {
  const tab = platformOver(new Map(), 1);
  const host = Context.get(tab.platform, Host);

  const store: Store = {
    load: Effect.succeed(new Map<string, string>()),
    write: () => hung(cleanup),
  };

  return reporting({
    ...tab,
    platform: Context.add(tab.platform, Host, Host.of({ ...host, store: Option.some(store) })),
  });
};

/**
 * How an interrupted fiber's cleanup ends: its Effect, given the typed error its kind fails with,
 * and the failure a report must keep, if any. Only a cleanup that dies or fails has failed; one that
 * is interrupted itself leaves a pure interrupt.
 */
type Outcome = {
  readonly name: string;
  readonly cleanup: <E>(error: E) => Effect.Effect<void, E>;
  readonly failure: <E>(error: E) => Option.Option<unknown>;
};

const outcomes: ReadonlyArray<Outcome> = [
  { name: "succeeds", cleanup: () => Effect.void, failure: () => Option.none() },
  { name: "dies", cleanup: () => Effect.die(died), failure: () => Option.some(died) },
  { name: "fails with a typed error", cleanup: Effect.fail, failure: Option.some },
  { name: "is interrupted", cleanup: () => Effect.interrupt, failure: () => Option.none() },
];

const storeRefused = new StoreRefused({});

/**
 * A Runtime with one forked fiber of a kind on the wire, whose interrupt cleanup ends as the
 * outcome says, and the Promise of a runPromise when the fiber is one.
 */
type Started = {
  // FLOW_STATE_ALLOW_UNKNOWN: a late cleanup fails with whatever it threw.
  readonly tab: Tab & { readonly reports: ReadonlyArray<Cause.Cause<unknown>> };
  readonly runtime: Runtime;
  readonly ran: Option.Option<Promise<unknown>>;
  readonly failure: Option.Option<unknown>;
};

// Every kind of fiber the Runtime forks or releases with a cleanup at Runtime disposal. A services
// finalizer is typed never to fail, so it has no typed-failure cell.
const kinds: ReadonlyArray<{
  readonly name: string;
  readonly typed: boolean;
  readonly start: (outcome: Outcome) => Started;
}> = [
  {
    name: "a call",
    typed: true,
    start: (outcome) => {
      const tab = reporting(platformOver(new Map(), 1));
      const runtime = readyOver(tab, lineWith(outcome.cleanup(lineDropped)));
      runtime.ensureActor(phone).send({ _tag: "Dial" });
      tab.settle();

      return { tab, runtime, ran: Option.none(), failure: outcome.failure(lineDropped) };
    },
  },
  {
    name: "a store write",
    typed: true,
    start: (outcome) => {
      const tab = hungStoreTab(outcome.cleanup(storeRefused));
      const runtime = readyOver(tab, quietLine);
      runtime.ensureActor(note).send({ _tag: "Write", text: "milk" });
      tab.settle();

      return { tab, runtime, ran: Option.none(), failure: outcome.failure(storeRefused) };
    },
  },
  {
    name: "a read",
    typed: true,
    start: (outcome) => {
      const tab = reporting(platformOver(new Map(), 1));
      const runtime = readyOver(tab, lineWith(outcome.cleanup(lineDropped)));
      runtime.ensureActor(phone).send({ _tag: "Look" });
      tab.settle();

      return { tab, runtime, ran: Option.none(), failure: outcome.failure(lineDropped) };
    },
  },
  {
    name: "a runPromise Effect",
    typed: true,
    start: (outcome) => {
      const tab = reporting(platformOver(new Map(), 1));
      const runtime = readyOver(tab, quietLine);
      const ran = rejection(runtime.runPromise(hung(outcome.cleanup(lineDropped))));
      tab.settle();

      return { tab, runtime, ran: Option.some(ran), failure: outcome.failure(lineDropped) };
    },
  },
  {
    name: "a services finalizer",
    typed: false,
    start: (outcome) => {
      const tab = reporting(platformOver(new Map(), 1));

      const runtime = readyOver(
        tab,
        Layer.merge(
          quietLine,
          Layer.effectDiscard(
            Effect.addFinalizer(() => Effect.orDie(outcome.cleanup(lineDropped))),
          ),
        ),
      );

      return { tab, runtime, ran: Option.none(), failure: outcome.failure(died) };
    },
  },
];

// A dispose run past the disposal's bound and then past the close's: what it ended with, if it did.
const disposedPastBounds = ({ tab, runtime }: Started) => {
  const disposing = Effect.runFork(runtime.dispose());
  tab.settle();
  tab.advance(Duration.toMillis(RuntimeDefaults.disposalBound));
  tab.advance(Duration.toMillis(RuntimeDefaults.disposalBound));

  return Option.fromUndefinedOr(disposing.pollUnsafe());
};

describe("every forked fiber's interrupt cleanup at Runtime disposal (Actors R23, I33; Diagnostics R8)", () => {
  for (const kind of kinds)
    for (const outcome of outcomes.filter(
      (o) => kind.typed || o.name !== "fails with a typed error",
    ))
      it(`Actors R23: ${kind.name} whose cleanup ${outcome.name} at Runtime disposal ${Option.isSome(outcome.failure(lineDropped)) ? "rejects dispose with CleanupFailed keeping its failure" : "leaves dispose a success"}`, async () => {
        const started = kind.start(outcome);
        const ended = disposedPastBounds(started);

        assert.ok(Option.isSome(ended), "the dispose ended within its bounds");

        Option.match(started.failure, {
          onNone: () => assert.ok(Exit.isSuccess(ended.value), "dispose succeeded"),
          onSome: (failure) => {
            assert.ok(Exit.isFailure(ended.value), "dispose rejected");

            const rejected = Option.flatMap(Cause.findErrorOption(ended.value.cause), (e) =>
              flowOf(e),
            );

            assert.deepStrictEqual(
              Option.map(rejected, (r) => r.code),
              Option.some("CleanupFailed"),
            );
            assert.ok(
              Option.exists(rejected, (r) => keeps(r.cause, failure)),
              "its Cause kept",
            );
          },
        });

        // A runPromise the close interrupted rejects RunFailed with its whole Cause, the
        // cleanup's failure included.
        for (const ran of Option.toArray(started.ran)) {
          const run = flowOf(await ran);

          assert.deepStrictEqual(
            Option.map(run, (r) => r.code),
            Option.some("RunFailed"),
          );

          for (const failure of Option.toArray(started.failure))
            assert.ok(
              Option.exists(run, (r) => keeps(r.cause, failure)),
              "RunFailed kept it",
            );
        }
      });
});

describe("a read's interrupt cleanup at actor disposal (Actors R23)", () => {
  for (const outcome of outcomes)
    it(`Actors R23: a read whose cleanup ${outcome.name} when its actor is disposed ${Option.isSome(outcome.failure(lineDropped)) ? "quarantines the ref: a later ensure throws CleanupFailed keeping its failure" : "leaves the ref free"}`, () => {
      const started = kinds[2]?.start(outcome);
      assert.ok(started !== undefined);
      started.runtime.disposeActor(phone);
      started.tab.settle();

      const thrown = thrownBy(() => started.runtime.ensureActor(phone));

      Option.match(started.failure, {
        onNone: () => assert.equal(thrown, undefined),
        onSome: (failure) => {
          const quarantined = flowOf(thrown);

          assert.deepStrictEqual(
            Option.map(quarantined, (r) => r.code),
            Option.some("CleanupFailed"),
          );

          assert.ok(
            Option.exists(quarantined, (r) => keeps(r.cause, failure)),
            "its Cause kept",
          );
        },
      });
    });
});

describe("a runPromise Effect's interrupt cleanup when its signal aborts (Actors R27; Diagnostics R8)", () => {
  for (const outcome of outcomes)
    it(`Actors R27: an aborted runPromise whose cleanup ${outcome.name} rejects RunFailed with its whole Cause: the interrupt${Option.isSome(outcome.failure(lineDropped)) ? " and the cleanup's failure" : " alone"}`, async () => {
      const tab = reporting(platformOver(new Map(), 1));
      const runtime = readyOver(tab, quietLine);
      const abort = new AbortController();

      const ran = rejection(
        runtime.runPromise(hung(outcome.cleanup(lineDropped)), { signal: abort.signal }),
      );

      tab.settle();
      abort.abort();
      tab.settle();

      const run = flowOf(await ran);

      assert.deepStrictEqual(
        Option.map(run, (r) => r.code),
        Option.some("RunFailed"),
      );
      assert.ok(
        Option.exists(run, (r) => Cause.hasInterrupts(r.cause)),
        "the interrupt kept",
      );

      Option.match(outcome.failure(lineDropped), {
        onNone: () =>
          assert.ok(
            Option.exists(run, (r) => Cause.hasInterruptsOnly(r.cause)),
            "nothing else",
          ),
        onSome: (failure) =>
          assert.ok(
            Option.exists(run, (r) => keeps(r.cause, failure)),
            "the failure kept",
          ),
      });
    });
});

const BOUND = Duration.toMillis(RuntimeDefaults.disposalBound);

const late = new Error("the cleanup ended late");

// A cleanup that waits until the test opens its gate, then dies.
// RETURN_TYPE: the Outcome contract keeps its generic cleanup.
const hangsUntil = (gate: Deferred.Deferred<void>): Outcome => ({
  name: "hangs",
  cleanup: () => Effect.andThen(Deferred.await(gate), Effect.die(late)),
  failure: () => Option.some(late),
});

// Whether a Cause holds the close's own failure for a cleanup it stopped waiting for.
// FLOW_STATE_ALLOW_UNKNOWN: a cleanup fails with whatever it was given.
const overdue = (cause: Cause.Cause<unknown>) =>
  cause.reasons.some((r) => Cause.isFailReason(r) && Predicate.isTagged(r.error, "CleanupOverdue"));

describe("a cleanup that outlives the close's bound (Actors R22, R23)", () => {
  for (const kind of kinds)
    it(`Actors R22, R23: ${kind.name} whose cleanup hangs past the bound rejects dispose with CleanupOverdue, and its late failure goes to the host's report once`, () => {
      const gate = Deferred.makeUnsafe<void>();
      const started = kind.start(hangsUntil(gate));
      const ended = disposedPastBounds(started);

      assert.ok(Option.isSome(ended), "the dispose ended within its bounds");
      assert.ok(Exit.isFailure(ended.value), "dispose rejected");

      const rejected = Option.flatMap(Cause.findErrorOption(ended.value.cause), (e) => flowOf(e));

      assert.deepStrictEqual(
        Option.map(rejected, (r) => r.code),
        Option.some("CleanupFailed"),
      );
      assert.ok(
        Option.exists(rejected, (r) => overdue(r.cause)),
        "CleanupOverdue kept",
      );
      assert.equal(started.tab.reports.length, 0, "nothing reported before the cleanup ends");

      Deferred.doneUnsafe(gate, Exit.void);
      started.tab.settle();

      assert.equal(started.tab.reports.length, 1, "one late report");
      assert.ok(
        started.tab.reports.every((cause) => keeps(cause, late)),
        "the late failure kept",
      );
    });
});

describe("an ended actor's cleanup that outlives the Runtime's close (Actors R23)", () => {
  it("Actors R23: a read whose cleanup fails only after dispose stopped waiting goes to the host's report, as no ensure can hear it", () => {
    const gate = Deferred.makeUnsafe<void>();
    const tab = reporting(platformOver(new Map(), 1));

    const runtime = readyOver(
      tab,
      lineWith(Effect.andThen(Deferred.await(gate), Effect.die(late))),
    );

    runtime.ensureActor(phone).send({ _tag: "Look" });
    tab.settle();
    runtime.disposeActor(phone);
    const disposing = Effect.runFork(runtime.dispose());
    tab.settle();
    tab.advance(BOUND);
    tab.settle();

    assert.ok(
      Option.exists(Option.fromUndefinedOr(disposing.pollUnsafe()), Exit.isFailure),
      "dispose rejected CleanupOverdue",
    );

    Deferred.doneUnsafe(gate, Exit.void);
    tab.settle();

    assert.equal(tab.reports.length, 1, "one late report");
    assert.ok(tab.reports.every((cause) => keeps(cause, late)));
  });
});

// The app's own error handling around a read, each as Effect 4 runs it on an interrupted fiber.
const handlers: ReadonlyArray<{
  readonly name: string;
  readonly wrap: (read: Effect.Effect<string, LineDropped>) => Effect.Effect<string, LineDropped>;
}> = [
  {
    name: "catchTag",
    wrap: (read) => Effect.catchTag(read, "LineDropped", () => Effect.succeed("caught")),
  },
  { name: "catch", wrap: (read) => Effect.catch(read, () => Effect.succeed("caught")) },
  { name: "mapError", wrap: (read) => Effect.mapError(read, (e) => e) },
  { name: "tapError", wrap: (read) => Effect.tapError(read, () => Effect.void) },
  { name: "retry", wrap: (read) => Effect.retry(read, { times: 1 }) },
  { name: "catchCause", wrap: (read) => Effect.catchCause(read, () => Effect.succeed("caught")) },
];

// The CleanupFailed an ensure throws once a read's actor is disposed, if it throws one.
const quarantinedAfter = (read: Effect.Effect<string, LineDropped>) => {
  const tab = platformOver(new Map(), 1);
  const runtime = readyOver(tab, Layer.succeed(Line, Line.of({ hold: Effect.never, watch: read })));
  runtime.ensureActor(phone).send({ _tag: "Look" });
  tab.settle();
  runtime.disposeActor(phone);
  tab.settle();

  return flowOf(thrownBy(() => runtime.ensureActor(phone)));
};

describe("a cleanup failure inside the app's own error handling (Actors R23, I48; Diagnostics R8)", () => {
  it("Actors R23, I48: with no handler around the read, a cleanup's typed failure reaches the effect Flow runs and quarantines the ref", () => {
    assert.ok(
      Option.exists(quarantinedAfter(hung(Effect.fail(lineDropped))), (r) =>
        keeps(r.cause, lineDropped),
      ),
    );
  });

  for (const handler of handlers) {
    it(`Gotcha (Actors R23, I48; Diagnostics R8): under ${handler.name}, a cleanup's typed failure follows Effect's rules and never reaches the effect Flow runs`, () => {
      assert.deepStrictEqual(
        quarantinedAfter(handler.wrap(hung(Effect.fail(lineDropped)))),
        Option.none(),
      );
    });

    it(`Actors R23, I48: under ${handler.name}, a cleanup that dies is always reported`, () => {
      assert.ok(
        Option.exists(quarantinedAfter(handler.wrap(hung(Effect.die(died)))), (r) =>
          keeps(r.cause, died),
        ),
      );
    });
  }
});

describe("a cleanup failure in a life that records no Issue (Actors R23, R25)", () => {
  it("Actors R23, R25: a read whose cleanup dies as a Runtime a defect stopped closes is no Issue, and is reported through the Runtime's report: dispose fails with the defect and a CleanupFailed keeping the failure", () => {
    const trap = { armed: false };
    const seed = new String("0".repeat(32));

    seed.toString = () => {
      if (trap.armed) {
        trap.armed = false;
        // oxlint-disable-next-line lint-bomb/no-throw-in-core -- the planted defect that stops the Runtime
        throw new Error("the session seed cannot be read");
      }

      return "0".repeat(32);
    };

    const tab = platformOver(new Map(), 1);
    const host = Context.get(tab.platform, Host);

    // SAFETY: the core reads a seed only as text, which calls toString.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion, lint-bomb/no-chained-type-assertions -- a test host plants its defect in the seed's text
    const sessionSeed = seed as unknown as string;

    const trapped = {
      ...tab,
      platform: Context.add(tab.platform, Host, Host.of({ ...host, sessionSeed })),
    };

    const { runtime, issues } = readyObserved(trapped, lineWith(Effect.die(died)));
    runtime.ensureActor(phone).send({ _tag: "Look" });
    tab.settle();
    trap.armed = true;
    thrownBy(() => runtime.ensureActor(note));
    tab.settle();

    const disposing = Effect.runFork(runtime.dispose());
    tab.settle();
    const ended = Option.fromUndefinedOr(disposing.pollUnsafe());

    assert.ok(Option.exists(ended, Exit.isFailure), "dispose failed");

    const reasons = Option.match(ended, {
      onNone: () => [],
      onSome: (exit) => (Exit.isFailure(exit) ? exit.cause.reasons : []),
    });

    assert.ok(
      reasons.some(
        (r) =>
          Cause.isDieReason(r) && r.defect instanceof Error && r.defect.message.includes("seed"),
      ),
      "the defect leads",
    );
    assert.ok(
      reasons.some((r) =>
        Cause.isDieReason(r)
          ? Option.exists(
              flowOf(r.defect),
              (e) => e.code === "CleanupFailed" && keeps(e.cause, died),
            )
          : false,
      ),
      "the cleanup's failure beside it",
    );
    assert.deepStrictEqual(issues, [], "a stopped life records no Issue");
  });
});

describe("a read cancelled while its actor lives (Actors R23)", () => {
  it("Actors R23: a read replaced while open whose cleanup dies is an Issue CleanupFailed at once, and quarantines the ref when its actor ends", () => {
    const tab = platformOver(new Map(), 1);
    const { runtime, issues } = readyObserved(tab, lineWith(Effect.die(died)));
    const handle = runtime.ensureActor(phone);
    handle.send({ _tag: "Look" });
    tab.settle();
    handle.send({ _tag: "Look" });
    tab.settle();

    assert.deepStrictEqual(issues, ["CleanupFailed"]);
    assert.equal(
      thrownBy(() => runtime.ensureActor(phone)),
      undefined,
      "the live ref is not refused",
    );

    runtime.disposeActor(phone);
    tab.settle();

    const quarantined = flowOf(thrownBy(() => runtime.ensureActor(phone)));

    assert.deepStrictEqual(
      Option.map(quarantined, (r) => r.code),
      Option.some("CleanupFailed"),
    );
    assert.ok(
      Option.exists(quarantined, (r) => keeps(r.cause, died)),
      "its Cause kept",
    );
  });
});

const ticket = Brand.nominal<TicketId>();

// The CleanupFailed a dispose rejected with, keeping the cleanup's own failure, if it did.
const disposeHeard = (runtime: Runtime, tab: Tab) => {
  const disposing = Effect.runFork(runtime.dispose());
  tab.settle();

  return Option.flatMap(Option.fromUndefinedOr(disposing.pollUnsafe()), (exit) =>
    Exit.isFailure(exit)
      ? Option.flatMap(Cause.findErrorOption(exit.cause), (e) => flowOf(e))
      : Option.none(),
  );
};

describe("a quarantine no ensure reported (Actors R23)", () => {
  it("Actors R23: an actor disposed while its read is out, whose cleanup dies, and never ensured again: dispose rejects CleanupFailed keeping its failure", () => {
    const tab = platformOver(new Map(), 1);
    const runtime = readyOver(tab, lineWith(Effect.die(died)));
    runtime.ensureActor(phone).send({ _tag: "Look" });
    tab.settle();
    runtime.disposeActor(phone);
    tab.settle();

    const heard = disposeHeard(runtime, tab);

    assert.deepStrictEqual(
      Option.map(heard, (r) => r.code),
      Option.some("CleanupFailed"),
    );
    assert.ok(
      Option.exists(heard, (r) => keeps(r.cause, died)),
      "its Cause kept",
    );
  });

  it("Actors R23: a quarantine lifted by disposeActor before any ensure reported it goes to dispose's CleanupFailed", () => {
    const tab = platformOver(new Map(), 1);
    const runtime = readyOver(tab, lineWith(Effect.die(died)));
    runtime.ensureActor(phone).send({ _tag: "Look" });
    tab.settle();
    runtime.disposeActor(phone);
    tab.settle();
    runtime.disposeActor(phone);

    assert.equal(
      thrownBy(() => runtime.ensureActor(phone)),
      undefined,
      "the lift frees the ref",
    );
    assert.ok(
      Option.exists(disposeHeard(runtime, tab), (r) => keeps(r.cause, died)),
      "dispose heard the lifted failure",
    );
  });

  it("Actors R23: a quarantine an ensure reported is not reported again at dispose", () => {
    const tab = platformOver(new Map(), 1);
    const runtime = readyOver(tab, lineWith(Effect.die(died)));
    runtime.ensureActor(phone).send({ _tag: "Look" });
    tab.settle();
    runtime.disposeActor(phone);
    tab.settle();
    assert.deepStrictEqual(
      Option.map(flowOf(thrownBy(() => runtime.ensureActor(phone))), (r) => r.code),
      Option.some("CleanupFailed"),
      "an ensure reported it",
    );

    const disposing = Effect.runFork(runtime.dispose());
    tab.settle();

    assert.ok(
      Option.exists(Option.fromUndefinedOr(disposing.pollUnsafe()), Exit.isSuccess),
      "dispose settled with a success",
    );
  });
});

const firstDied = new Error("the first incarnation's cleanup died");

const secondDied = new Error("the second incarnation's cleanup died");

type Move = "ensure" | "the second cleanup dies" | "disposeActor" | "dispose";

// Every distinct order of the moves, each once.
// RETURN_TYPE: a recursive function's type cannot be inferred.
const ordersOf = (moves: ReadonlyArray<Move>): ReadonlyArray<ReadonlyArray<Move>> =>
  moves.length === 0
    ? [[]]
    : [
        ...new Map(
          moves
            .flatMap((move, at) =>
              ordersOf(moves.filter((_, other) => other !== at)).map((rest) => [move, ...rest]),
            )
            .map((order) => [order.join(", "), order] as const),
        ).values(),
      ];

// What the ensures report, by R23 alone: each reports every failure that landed on the ref while
// the Runtime was open and no disposeActor lifted since. The first failure has landed before any
// move.
const ensureReports = (order: ReadonlyArray<Move>) => {
  const held: Array<Error> = [firstDied];
  const reported: Array<Error> = [];

  for (const move of order.slice(0, order.indexOf("dispose"))) {
    if (move === "the second cleanup dies") held.push(secondDied);

    if (move === "disposeActor") held.length = 0;

    if (move === "ensure") reported.push(...held);
  }

  return reported;
};

// How many times the Causes keep a cleanup's defect.
// FLOW_STATE_ALLOW_UNKNOWN: a cleanup fails with whatever it was given.
const timesIn = (causes: ReadonlyArray<Cause.Cause<unknown>>, failure: unknown) =>
  causes
    .flatMap((cause) => cause.reasons)
    .filter((r) => Cause.isDieReason(r) && r.defect === failure).length;

// The CleanupFailed Causes a dispose rejected with, once it ended.
const rejectedBy = (disposing: Option.Option<Fiber.Fiber<void, FlowError>>) => {
  const ended = Option.flatMap(disposing, (fiber) => Option.fromUndefinedOr(fiber.pollUnsafe()));

  assert.ok(Option.isSome(ended), "dispose ended");

  return Exit.isFailure(ended.value)
    ? Option.toArray(
        Option.flatMap(Cause.findErrorOption(ended.value.cause), (e) => flowOf(e)),
      ).map((r) => r.cause)
    : [];
};

// Two incarnations of the ref ended with their reads out, the first's cleanup dead, then the
// moves in order: what the ensures threw, what dispose rejected with and what the host heard.
const played = (order: ReadonlyArray<Move>) => {
  const gates = [Deferred.makeUnsafe<void>(), Deferred.makeUnsafe<void>()] as const;

  const cleanups = [
    Effect.andThen(Deferred.await(gates[0]), Effect.die(firstDied)),
    Effect.andThen(Deferred.await(gates[1]), Effect.die(secondDied)),
  ];

  const tab = reporting(platformOver(new Map(), 1));
  const watch = hung(Effect.suspend(() => cleanups.shift() ?? Effect.void));
  const runtime = readyOver(tab, Layer.succeed(Line, Line.of({ hold: Effect.never, watch })));

  for (const _ of gates) {
    runtime.ensureActor(phone).send({ _tag: "Look" });
    tab.settle();
    runtime.disposeActor(phone);
    tab.settle();
  }

  Deferred.doneUnsafe(gates[0], Exit.void);
  tab.settle();

  // FLOW_STATE_ALLOW_UNKNOWN: a cleanup fails with whatever it threw.
  const ensured: Array<Cause.Cause<unknown>> = [];
  let disposing = Option.none<Fiber.Fiber<void, FlowError>>();

  const moves: Record<Move, () => void> = {
    ensure: () => {
      for (const r of Option.toArray(flowOf(thrownBy(() => runtime.ensureActor(phone)))))
        if (r.code === "CleanupFailed") ensured.push(r.cause);
    },
    "the second cleanup dies": () => Deferred.doneUnsafe(gates[1], Exit.void),
    disposeActor: () => runtime.disposeActor(phone),
    dispose: () => {
      disposing = Option.some(Effect.runFork(runtime.dispose()));
    },
  };

  for (const move of order) {
    moves[move]();
    tab.settle();
  }

  return { ensured, rejected: rejectedBy(disposing), reports: tab.reports };
};

describe("two incarnations of one ref whose cleanups fail around an ensure (Actors R23, I48)", () => {
  for (const order of ordersOf([
    "ensure",
    "ensure",
    "the second cleanup dies",
    "disposeActor",
    "dispose",
  ]))
    it(`Actors R23, I48: the first cleanup dies, then ${order.join(", ")}: each failure is reported by every ensure that runs while it is held, and else by dispose, exactly once`, () => {
      const { ensured, rejected, reports } = played(order);
      const expected = ensureReports(order);

      for (const failure of [firstDied, secondDied]) {
        const ensures = expected.filter((reported) => reported === failure).length;

        assert.equal(timesIn(ensured, failure), ensures, `${failure.message}: by each ensure`);
        assert.equal(
          timesIn(rejected, failure),
          ensures === 0 ? 1 : 0,
          `${failure.message}: by dispose exactly when no ensure reported it`,
        );
        assert.equal(timesIn(reports, failure), 0, `${failure.message}: not the host's report`);
      }
    });
});

describe("a store write interrupted at the close (Restore R10, Actors R23)", () => {
  it("Actors R23: a store write whose interrupt cleanup dies is never answered as refused, so no lane hears that a write which may have landed was not sent", () => {
    const tab = hungStoreTab(Effect.die(died));

    // oxlint-disable-next-line lint-bomb/no-unmanaged-effect-scope -- the test owns the edge's Scope, which its Owner closes
    const work = makeOwner(
      Scope.makeUnsafe(),
      () => tab.platform,
      () => undefined,
      "work",
      Option.none(),
    );

    const answers: Array<boolean> = [];
    // FLOW_STATE_ALLOW_UNKNOWN: a cleanup fails with whatever it threw.
    const heard: Array<Cause.Cause<unknown>> = [];

    const edge = makeEdge(tab.platform, work, {
      captureMs: 0,
      capture: () => undefined,
      answered: (_, landed) => void answers.push(landed),
    });

    edge.write(
      [{ key: "k", record: Option.some("v") }],
      new Map(),
      [{ id: ticket("t1"), purpose: "flush" }],
      [],
    );
    tab.settle();
    work.stop((found) => void heard.push(...found));
    tab.settle();

    assert.deepStrictEqual(answers, []);
    assert.ok(
      heard.length === 1 && heard.every((cause) => keeps(cause, died)),
      "its closer heard the cleanup's failure",
    );
  });
});

describe("an Owner's own Scope (Actors R23, I47, I48)", () => {
  it("Actors R23, I47, I48: an Owner whose own finalizer dies traces its Scope's release as one failed task, judges it once, and its closer hears it", () => {
    const tab = platformOver(new Map(), 1);
    const records: Array<OwnerRecord> = [];
    // FLOW_STATE_ALLOW_UNKNOWN: a cleanup fails with whatever it threw.
    const judged: Array<Cause.Cause<unknown>> = [];
    // FLOW_STATE_ALLOW_UNKNOWN: a cleanup fails with whatever it threw.
    const heard: Array<Cause.Cause<unknown>> = [];

    // oxlint-disable-next-line lint-bomb/no-unmanaged-effect-scope -- the test owns the Owner's parent Scope, which the Owner's close releases from
    const owner = makeOwner(
      Scope.makeUnsafe(),
      () => tab.platform,
      (cause) => void judged.push(cause),
      "work",
      Option.some((record) => void records.push(record)),
    );

    owner.finalize(() => {
      // oxlint-disable-next-line lint-bomb/no-throw-in-core -- a finalizer that dies is what this test plants
      throw died;
    });
    owner.stop((found) => void heard.push(...found));
    tab.settle();

    const scopeTasks = records.filter((r) => OwnerRecord.$is("Task")(r) && r.key === "scope");

    assert.deepStrictEqual(
      scopeTasks.map((r) => (OwnerRecord.$is("Task")(r) ? [r.phase, r.failed] : [])),
      [
        ["started", false],
        ["Died", true],
      ],
    );
    assert.equal(judged.length, 1, "judged once");
    assert.ok(
      heard.length === 1 && heard.every((cause) => keeps(cause, died)),
      "its closer heard it",
    );
    assert.deepStrictEqual(
      records.flatMap((r) => (OwnerRecord.$is("Report")(r) ? [r.causes] : [])),
      [1],
      "its report counts it",
    );
  });
});

describe("dispose and forget (Actors R20, R22, R23)", () => {
  it("Actors R20: a dispose({ forget: true }) whose caller is interrupted mid-close still deletes the scope's records", async () => {
    const store = new Map<string, string>();
    const tab = platformOver(store, 1);
    const runtime = readyOver(tab, quietLine);
    runtime.ensureActor(note).send({ _tag: "Write", text: "milk" });
    runtime.ensureActor(phone).send({ _tag: "Dial" });
    tab.settle();

    assert.ok(store.size > 0, "the note landed");

    const caller = Effect.runFork(runtime.dispose({ forget: true }));
    tab.settle();

    assert.equal(caller.pollUnsafe(), undefined, "the close still waits for the call");

    caller.interruptUnsafe();
    await Effect.runPromise(Effect.yieldNow);
    tab.advance(BOUND);
    tab.advance(BOUND);
    tab.settle();
    await Effect.runPromise(Effect.yieldNow);

    assert.equal(store.size, 0);
  });

  it("Actors R20, R23: dispose() twice shares one result, and dispose() then dispose({ forget: true }) runs the forget", async () => {
    const store = new Map<string, string>();
    const tab = platformOver(store, 1);
    const runtime = readyOver(tab, quietLine);
    runtime.ensureActor(note).send({ _tag: "Write", text: "milk" });
    tab.settle();

    const first = Effect.runFork(runtime.dispose());
    const second = Effect.runFork(runtime.dispose());
    const forgetting = Effect.runFork(runtime.dispose({ forget: true }));
    tab.settle();

    for (const fiber of [first, second, forgetting])
      assert.ok(Exit.isSuccess(await Effect.runPromise(Fiber.await(fiber))));

    assert.equal(store.size, 0);
  });

  it("Actors R22: disposeActor then dispose() releases the services only after the actor's reads have ended", () => {
    const tab = platformOver(new Map(), 1);
    const order: Array<string> = [];
    const gate = Deferred.makeUnsafe<void>();

    const runtime = readyOver(
      tab,
      Layer.merge(
        lineWith(
          Effect.andThen(
            Deferred.await(gate),
            Effect.sync(() => void order.push("read ended")),
          ),
        ),
        Layer.effectDiscard(
          Effect.addFinalizer(() => Effect.sync(() => void order.push("services released"))),
        ),
      ),
    );

    runtime.ensureActor(phone).send({ _tag: "Look" });
    tab.settle();
    runtime.disposeActor(phone);
    const disposing = Effect.runFork(runtime.dispose());
    tab.settle();

    assert.deepStrictEqual(order, [], "the services wait while the read's cleanup runs");

    Deferred.doneUnsafe(gate, Exit.void);
    tab.settle();

    assert.ok(Exit.isSuccess(Option.getOrThrow(Option.fromUndefinedOr(disposing.pollUnsafe()))));
    assert.deepStrictEqual(order, ["read ended", "services released"]);
  });
});
