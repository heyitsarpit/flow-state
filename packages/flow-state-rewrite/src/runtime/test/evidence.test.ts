// oxlint-disable-next-line anti-slop/no-large-production-file -- sequencing, lifecycle publication, sink isolation, and failure proofs share one runtime-evidence contract.
import { assert, describe, it } from "@effect/vitest";
import { Cause, Clock, Deferred, Effect, Exit, Fiber, Option, Predicate, Result } from "effect";

import { app, appPlan, module } from "../../app/app.js";
import { definition } from "../../definition/definition.js";
import type { PublicDiagnostic } from "../../diagnostic/diagnostic.js";
import { Failure } from "../../diagnostic/diagnostic.js";
import { machine } from "../../machine/machine.js";
import { actorRef } from "../actor-ref.js";
import {
  makeEvidenceJournal,
  makeLifecycleRecord,
  makeRuntimeEvidenceOwner,
  makeTurnRecord,
  finalizePreparedActorPublication,
  prepareActorPublication,
  makeLifecycleEvidence,
  type EvidenceJournal,
  type EvidencePreparation,
  type PreparedEvidenceRecord,
  type EvidenceRecord,
  type LifecycleFact,
  type TurnFact,
} from "../evidence.js";
import { makeEvidenceSink } from "../evidence-sink.js";
import { makeActorIdentityRegistry, type ActorFence } from "../actor-admission.js";
import {
  activateLifecycle,
  prepareLifecycle,
  runLifecycleCommand,
  type ActorCell,
  type LifecycleResource,
  type LifecycleSnapshot,
} from "../lifecycle.js";
import type { ActorPublication, ActorSnapshot } from "../actor-engine.js";
import { makeRuntimeServicesLayer, type RuntimeEvidenceService } from "../runtime-services.js";

const makeTestClock = (now: number | (() => number)): Clock.Clock => {
  const currentTime = typeof now === "number" ? () => now : now;
  const currentTimeNanos = () => BigInt(currentTime()) * 1_000_000n;

  return {
    currentTimeMillisUnsafe: currentTime,
    currentTimeMillis: Effect.sync(currentTime),
    currentTimeNanosUnsafe: currentTimeNanos,
    currentTimeNanos: Effect.sync(currentTimeNanos),
    monotonicTimeNanosUnsafe: currentTimeNanos,
    monotonicTimeNanos: Effect.sync(currentTimeNanos),
    sleep: () => Effect.void,
  };
};

const resultSuccess = <Value>(result: Result.Result<Value, PublicDiagnostic>) => {
  if (Result.isFailure(result)) throw result.failure;

  return result.success;
};

// RETURN_TYPE: The erased evidence sink cause needs an explicit predicate for its cleanup envelope and Cause.
const isCleanupFailureEnvelope = (
  value: unknown,
): value is { _tag: "cleanup-failure"; cause: Cause.Cause<unknown> } =>
  Predicate.isObject(value) && value._tag === "cleanup-failure" && Cause.isCause(value.cause);

// RETURN_TYPE: This predicate preserves the exact null and present-undefined fields under test.
const hasNullUndefinedPayloadFields = (
  value: unknown,
): value is { payload: null; optional: undefined } =>
  Predicate.isObject(value) &&
  Object.hasOwn(value, "payload") &&
  value.payload === null &&
  Object.hasOwn(value, "optional") &&
  value.optional === undefined;

const EvidenceDefinitionResult = definition({
  id: "evidence/actor",
  states: ["ready"],
  events: { opened: "bare" },
});

const EvidenceDefinition = resultSuccess(EvidenceDefinitionResult);

const EvidenceMachine = resultSuccess(
  machine(EvidenceDefinitionResult, ({ S }) => ({
    default: S.ready,
    states: { ready: {} },
  })),
);

const EvidenceModule = module({
  id: "evidence/module",
  machines: { actor: EvidenceMachine },
});

const EvidenceApp = app({
  id: "evidence/app",
  persistenceVersion: "1",
  modules: [EvidenceModule],
});

const EvidencePlan = appPlan(EvidenceApp);

const EvidenceEvent = resultSuccess(EvidenceDefinition.E.opened());

type EvidenceSnapshot = ActorSnapshot<typeof EvidenceDefinition>;

const preparationRevisions = new WeakMap<EvidencePreparation, number>();

let nextPreparationRevision = 1;

const preparationRevision = (preparation: EvidencePreparation) =>
  preparationRevisions.get(preparation) ?? 1;

const makeLifecycleActorCell = <CleanupError>(): ActorCell<
  LifecycleSnapshot<typeof EvidenceDefinition, CleanupError>
> => ({ activityFibers: undefined, protocol: undefined });

const makeFixture = () => {
  const registry = makeActorIdentityRegistry();
  const ref = actorRef(EvidenceMachine, "actor");
  const identity = resultSuccess(registry.reserveStable(ref));

  const fence: ActorFence = {
    key: identity.key,
    incarnation: identity.incarnation,
    generation: 0,
    leaseEpoch: identity.leaseEpoch,
  };

  const snapshot = (revision: number) =>
    ({
      state: EvidenceDefinition.S.ready,
      memory: {},
      context: {},
      lifecycle: "active" as const,
      operations: [],
      timers: [],
      issues: [],
      revision,
      observedStoreRevision: 0,
    }) satisfies EvidenceSnapshot;

  return { identity, fence, snapshot };
};

// RETURN_TYPE: The fixture preserves the concrete app and definition owners used by the evidence record.
const turnFact = (
  fixture: ReturnType<typeof makeFixture>,
  reservation: EvidencePreparation,
): TurnFact<typeof EvidenceApp, typeof EvidenceDefinition> => ({
  fence: fixture.fence,
  provenance: {
    app: EvidenceApp,
    plan: EvidencePlan,
    actor: {
      key: fixture.identity.key,
      incarnation: fixture.identity.incarnation,
      leaseEpoch: fixture.identity.leaseEpoch,
    },
  },
  cause: { _tag: "event", event: EvidenceEvent },
  before: fixture.snapshot(preparationRevision(reservation) - 1),
  after: fixture.snapshot(preparationRevision(reservation)),
  store: { revision: 0, changed: [] },
  publicationRevision: preparationRevision(reservation),
  machineTurnRevision: preparationRevision(reservation),
  timestamp: 1000 + preparationRevision(reservation),
});

// RETURN_TYPE: The fixture preserves the concrete lifecycle and cleanup owners used by the evidence record.
const lifecycleFact = (
  fence: ActorFence,
  snapshot: LifecycleSnapshot<typeof EvidenceDefinition, string>,
): LifecycleFact<typeof EvidenceDefinition, string> => ({
  _tag: "lifecycle",
  machineTurn: false,
  from: "prepared",
  to: "prepared",
  cause: { _tag: "restore" },
  before: snapshot,
  after: snapshot,
  timestamp: 2000,
  publicationRevision: 0,
  machineTurnRevision: 0,
  provenance: {
    app: EvidenceApp,
    plan: EvidencePlan,
    actor: {
      key: fence.key,
      incarnation: fence.incarnation,
      leaseEpoch: fence.leaseEpoch,
    },
  },
});

const reserve = (journal: EvidenceJournal) => {
  const preparation = resultSuccess(journal.prepare());
  preparationRevisions.set(preparation, nextPreparationRevision++);

  return preparation;
};

const acceptPrepared = (
  journal: EvidenceJournal,
  preparation: EvidencePreparation,
  record: PreparedEvidenceRecord,
) => journal.accept(preparation, record);

const drainJournal = (journal: EvidenceJournal) => journal.drain();

const closeJournal = (journal: EvidenceJournal) => journal.close();

const acceptTurn = (
  hub: EvidenceJournal,
  fixture: ReturnType<typeof makeFixture>,
  reservation: EvidencePreparation,
) => {
  const record = resultSuccess(makeTurnRecord(turnFact(fixture, reservation), reservation));

  return { record, effect: acceptPrepared(hub, reservation, record) };
};

// Contracts: SEM-004, SEM-005.
// Proofs: PROOF-003, PROOF-004, HOST-P05.
describe("runtime evidence", () => {
  it.effect("prepares publication evidence before finalizing its committed store cut", () =>
    Effect.gen(function* () {
      const fixture = makeFixture();

      const owner = makeRuntimeEvidenceOwner({
        app: EvidenceApp,
        plan: EvidencePlan,
        clock: makeTestClock(4_242),
      });

      const prepared = prepareActorPublication<typeof EvidenceDefinition>({
        snapshot: fixture.snapshot(1),
        store: { revision: 0, changed: [] },
        publicationRevision: 1,
        machineTurnRevision: 1,
        cause: { _tag: "event", event: EvidenceEvent },
      } satisfies ActorPublication<typeof EvidenceDefinition>);

      const preparation = owner.acceptPublication(
        fixture.identity,
        fixture.fence,
        fixture.snapshot(0),
        prepared,
      );

      assert.ok(Result.isSuccess(preparation));

      if (Result.isSuccess(preparation) && typeof preparation.success !== "number")
        assert.strictEqual(preparation.success.journal, owner.journal);

      const finalized = finalizePreparedActorPublication(prepared, {
        ...prepared,
        snapshot: fixture.snapshot(1),
        store: { revision: 9, changed: [] },
      });

      assert.strictEqual(finalized, 1);
      yield* owner.close();
    }),
  );

  it.effect("tombstones prepared actor evidence when record construction fails", () =>
    Effect.gen(function* () {
      const fixture = makeFixture();
      let now = -1;

      const owner = makeRuntimeEvidenceOwner({
        app: EvidenceApp,
        plan: EvidencePlan,
        clock: makeTestClock(() => now),
      });

      const prepared = prepareActorPublication<typeof EvidenceDefinition>({
        snapshot: fixture.snapshot(1),
        store: { revision: 0, changed: [] },
        publicationRevision: 1,
        machineTurnRevision: 1,
        cause: { _tag: "event", event: EvidenceEvent },
      } satisfies ActorPublication<typeof EvidenceDefinition>);

      const failedPreparation = owner.acceptPublication(
        fixture.identity,
        fixture.fence,
        fixture.snapshot(0),
        prepared,
      );

      assert.ok(Result.isFailure(failedPreparation));
      assert.strictEqual(owner.journal.sequence(), 0);

      now = 9_000;

      const accepted = owner.acceptPublication(
        fixture.identity,
        fixture.fence,
        fixture.snapshot(1),
        {
          snapshot: fixture.snapshot(2),
          store: { revision: 1, changed: [] },
          publicationRevision: 2,
          machineTurnRevision: 2,
          cause: { _tag: "event", event: EvidenceEvent },
        } satisfies ActorPublication<typeof EvidenceDefinition>,
      );

      assert.ok(Result.isSuccess(accepted));

      if (Result.isSuccess(accepted)) assert.strictEqual(accepted.success, 1);
      yield* owner.close();
    }),
  );

  it.effect(
    "JOURNAL-ORDER assigns evidence sequences in commit order despite reversed preparation order",
    () =>
      Effect.gen(function* () {
        const firstFixture = makeFixture();
        const secondFixture = makeFixture();
        const committed: EvidenceRecord[] = [];

        const owner = makeRuntimeEvidenceOwner({
          app: EvidenceApp,
          plan: EvidencePlan,
          clock: makeTestClock(4_242),
        });

        const sink = yield* makeEvidenceSink({
          id: "journal-order",
          deliver: (record) => Effect.sync(() => committed.push(record)),
        });

        assert.ok(Result.isSuccess(owner.journal.attach(sink)));

        const publication = (fixture: ReturnType<typeof makeFixture>, revision: number) =>
          prepareActorPublication<typeof EvidenceDefinition>({
            snapshot: fixture.snapshot(revision),
            store: { revision: 0, changed: [] },
            publicationRevision: revision,
            machineTurnRevision: revision,
            cause: { _tag: "event", event: EvidenceEvent },
          } satisfies ActorPublication<typeof EvidenceDefinition>);

        const first = publication(firstFixture, 1);
        const second = publication(secondFixture, 2);

        const firstPreparation = owner.acceptPublication(
          firstFixture.identity,
          firstFixture.fence,
          firstFixture.snapshot(0),
          first,
        );

        const secondPreparation = owner.acceptPublication(
          secondFixture.identity,
          secondFixture.fence,
          secondFixture.snapshot(1),
          second,
        );

        assert.ok(Result.isSuccess(firstPreparation));
        assert.ok(Result.isSuccess(secondPreparation));
        assert.strictEqual(owner.journal.sequence(), 0);
        // B commits first even though A was prepared first; preparation alone did not allocate a number.
        assert.strictEqual(
          finalizePreparedActorPublication(second, {
            ...second,
            snapshot: secondFixture.snapshot(2),
            store: { revision: 0, changed: [] },
          }),
          1,
        );
        assert.strictEqual(
          finalizePreparedActorPublication(first, {
            ...first,
            snapshot: firstFixture.snapshot(1),
            store: { revision: 0, changed: [] },
          }),
          2,
        );
        assert.strictEqual(owner.journal.sequence(), 2);
        yield* owner.close();
        assert.deepStrictEqual(
          committed.map((record) => ({
            key: record.provenance.actor.key,
            sequence: record._tag === "turn" ? record.sequence : record.evidenceSequence,
          })),
          [
            { key: secondFixture.identity.key, sequence: 1 },
            { key: firstFixture.identity.key, sequence: 2 },
          ],
        );
      }),
  );

  it.effect("uses the supplied runtime clock for publication timestamps", () =>
    Effect.gen(function* () {
      let now = 1_234;

      const clock = makeTestClock(() => now);

      const owner = makeRuntimeEvidenceOwner({ app: EvidenceApp, plan: EvidencePlan, clock });
      const timestamps: number[] = [];

      const sink = yield* makeEvidenceSink({
        id: "clock",
        deliver: (record) => Effect.sync(() => timestamps.push(record.timestamp)),
      });

      assert.ok(Result.isSuccess(owner.journal.attach(sink)));
      const fixture = makeFixture();

      const publish = (beforeRevision: number, afterRevision: number) =>
        owner.acceptPublication(fixture.identity, fixture.fence, fixture.snapshot(beforeRevision), {
          snapshot: fixture.snapshot(afterRevision),
          store: { revision: 0, changed: [] },
          publicationRevision: afterRevision,
          machineTurnRevision: afterRevision,
          cause: { _tag: "event", event: EvidenceEvent },
        } satisfies ActorPublication<typeof EvidenceDefinition>);

      assert.ok(Result.isSuccess(publish(0, 1)));
      now = 5_678;
      assert.ok(Result.isSuccess(publish(1, 2)));
      yield* owner.close();
      assert.deepStrictEqual(timestamps, [1_234, 5_678]);
    }),
  );

  it.effect("orders turn and lifecycle records through one accepted prefix", () =>
    Effect.gen(function* () {
      const fixture = makeFixture();
      const hub = makeEvidenceJournal({ app: EvidenceApp, plan: EvidencePlan });
      const firstReservation = reserve(hub);
      const secondReservation = reserve(hub);
      const first = acceptTurn(hub, fixture, firstReservation);
      const actorCell = makeLifecycleActorCell<string>();

      const prepared = resultSuccess(
        prepareLifecycle<typeof EvidenceDefinition, string>(
          fixture.fence,
          { _tag: "restore" },
          actorCell,
        ),
      );

      const lifecycle = resultSuccess(
        makeLifecycleRecord(lifecycleFact(fixture.fence, prepared), secondReservation),
      );

      const lifecycleFiber = yield* Effect.forkChild(
        Effect.exit(acceptPrepared(hub, secondReservation, lifecycle)),
        { startImmediately: true },
      );

      yield* Effect.yieldNow;

      const firstFiber = yield* Effect.forkChild(Effect.exit(first.effect), {
        startImmediately: true,
      });

      const firstAccepted = yield* Fiber.join(firstFiber);
      const lifecycleAccepted = yield* Fiber.join(lifecycleFiber);

      assert.ok(Exit.isSuccess(firstAccepted));
      assert.ok(Exit.isSuccess(lifecycleAccepted));

      if (Exit.isSuccess(firstAccepted) && Exit.isSuccess(lifecycleAccepted)) {
        assert.strictEqual(firstAccepted.value.sequence, 2);
        assert.strictEqual(lifecycleAccepted.value.sequence, 1);
        assert.deepStrictEqual(
          [firstAccepted.value.record._tag, lifecycleAccepted.value.record._tag],
          ["turn", "lifecycle"],
        );
      }

      assert.strictEqual(hub.sequence(), 2);
    }),
  );

  it.effect("tombstones a failed record and unblocks the next reservation", () =>
    Effect.gen(function* () {
      const fixture = makeFixture();
      const hub = makeEvidenceJournal({ app: EvidenceApp, plan: EvidencePlan });
      const failedReservation = reserve(hub);
      const laterReservation = reserve(hub);

      const failed = makeTurnRecord(
        { ...turnFact(fixture, failedReservation), timestamp: -1 },
        failedReservation,
      );

      assert.ok(Result.isFailure(failed));
      assert.ok(Result.isSuccess(hub.cancel(failedReservation)));

      const later = acceptTurn(hub, fixture, laterReservation);

      const waiting = yield* Effect.forkChild(Effect.exit(later.effect), {
        startImmediately: true,
      });

      yield* Effect.yieldNow;
      const accepted = yield* Fiber.join(waiting);

      assert.ok(Exit.isSuccess(accepted));

      if (Exit.isSuccess(accepted)) assert.strictEqual(accepted.value.sequence, 1);
      assert.strictEqual(hub.sequence(), 1);
      const drained = yield* hub.drain();
      assert.strictEqual(drained.through, 1);
    }),
  );

  it.effect("keeps lifecycle and actor acceptance in global sequence order", () =>
    Effect.gen(function* () {
      const fixture = makeFixture();
      const hub = makeEvidenceJournal({ app: EvidenceApp, plan: EvidencePlan });
      const lifecycleReservation = reserve(hub);
      const actorReservation = reserve(hub);
      const actorCell = makeLifecycleActorCell<string>();

      const prepared = resultSuccess(
        prepareLifecycle<typeof EvidenceDefinition, string>(
          fixture.fence,
          { _tag: "restore" },
          actorCell,
        ),
      );

      const lifecycle = resultSuccess(
        makeLifecycleRecord(lifecycleFact(fixture.fence, prepared), lifecycleReservation),
      );

      const actor = acceptTurn(hub, fixture, actorReservation);

      const actorFiber = yield* Effect.forkChild(Effect.exit(actor.effect), {
        startImmediately: true,
      });

      yield* Effect.yieldNow;

      const lifecycleFiber = yield* Effect.forkChild(
        Effect.exit(acceptPrepared(hub, lifecycleReservation, lifecycle)),
        { startImmediately: true },
      );

      const lifecycleAccepted = yield* Fiber.join(lifecycleFiber);
      const actorAccepted = yield* Fiber.join(actorFiber);

      assert.ok(Exit.isSuccess(lifecycleAccepted));
      assert.ok(Exit.isSuccess(actorAccepted));
      assert.strictEqual(hub.sequence(), 2);

      if (Exit.isSuccess(lifecycleAccepted) && Exit.isSuccess(actorAccepted)) {
        assert.deepStrictEqual(
          [lifecycleAccepted.value.sequence, actorAccepted.value.sequence],
          [2, 1],
        );
      }
    }),
  );

  it.effect("rejects lifecycle preparation without a runtime-owned reservation", () =>
    Effect.gen(function* () {
      const fixture = makeFixture();
      const actorCell = makeLifecycleActorCell<string>();

      const prepared = resultSuccess(
        prepareLifecycle<typeof EvidenceDefinition, string>(
          fixture.fence,
          { _tag: "restore" },
          actorCell,
        ),
      );

      const unowned: RuntimeEvidenceService = {
        // SAFETY: this deliberately foreign capability exercises the owner boundary.
        journal: {} as EvidenceJournal,
        prepare: () =>
          Result.fail(
            Failure({
              code: "InvalidTraceRecord",
              path: ["evidence", "preparation"],
              details: { reason: "owner-unavailable" },
              summary: "Evidence preparation owner unavailable.",
              help: "Use a Journal supplied by the runtime.",
            }),
          ),
        prepareLifecycle: () =>
          Result.fail(
            Failure({
              code: "InvalidTraceRecord",
              path: ["evidence", "preparation"],
              details: { reason: "owner-unavailable" },
              summary: "Evidence preparation owner unavailable.",
              help: "Use a Journal supplied by the runtime.",
            }),
          ),
        cancel: () => Result.succeed(undefined),
        settleOutcome: () => Result.succeed(undefined),
        provenance: { app: EvidenceApp, plan: EvidencePlan },
        publish: () => Effect.succeed(undefined),
        accept: () => Effect.succeed(undefined),
        drain: Effect.succeed(undefined),
      };

      const result = makeLifecycleEvidence(unowned, lifecycleFact(fixture.fence, prepared));
      assert.ok(Result.isFailure(result));

      if (Result.isFailure(result)) {
        assert.deepStrictEqual(result.failure.path, ["evidence", "preparation"]);
        assert.strictEqual(result.failure.details.reason, "owner-unavailable");
      }

      yield* Effect.void;
    }),
  );

  it.effect("cancels a failed timestamp before the next actor publication", () =>
    Effect.gen(function* () {
      const fixture = makeFixture();
      let failTimestamp = true;

      const owner = makeRuntimeEvidenceOwner({
        app: EvidenceApp,
        plan: EvidencePlan,
        clock: makeTestClock(() => {
          if (failTimestamp) {
            failTimestamp = false;

            return Number.NaN;
          }

          return 9_000;
        }),
      });

      const publication = (revision: number) =>
        ({
          snapshot: fixture.snapshot(revision),
          store: { revision: 0, changed: [] },
          publicationRevision: revision,
          machineTurnRevision: revision,
          cause: { _tag: "event", event: EvidenceEvent },
        }) satisfies ActorPublication<typeof EvidenceDefinition>;

      assert.ok(
        Result.isFailure(
          owner.acceptPublication(
            fixture.identity,
            fixture.fence,
            fixture.snapshot(0),
            publication(1),
          ),
        ),
      );
      failTimestamp = false;

      const accepted = owner.acceptPublication(
        fixture.identity,
        fixture.fence,
        fixture.snapshot(1),
        publication(2),
      );

      assert.ok(Result.isSuccess(accepted));

      if (Result.isSuccess(accepted)) assert.strictEqual(accepted.success, 1);
      yield* owner.close();
    }),
  );

  it.effect("deep-copies structured envelopes while retaining app and plan identity", () =>
    Effect.gen(function* () {
      const fixture = makeFixture();
      const hub = makeEvidenceJournal({ app: EvidenceApp, plan: EvidencePlan });
      const reservation = reserve(hub);
      const acceptedInput = acceptTurn(hub, fixture, reservation);
      const accepted = yield* acceptedInput.effect;

      if (accepted.record._tag !== "turn")
        return yield* Effect.die(new Error("Expected turn evidence"));

      assert.strictEqual(accepted.record.provenance.app, EvidenceApp);
      assert.strictEqual(accepted.record.provenance.plan, EvidencePlan);
      Object.assign(acceptedInput.record.fence, { generation: 99 });
      Object.assign(acceptedInput.record.provenance.actor, { key: "mutated" });
      assert.strictEqual(accepted.record.fence.generation, 0);
      assert.strictEqual(accepted.record.provenance.actor.key, fixture.identity.key);
    }),
  );

  it.effect("isolates bounded sink overflow and reports accepted-prefix truncation", () =>
    Effect.gen(function* () {
      const fixture = makeFixture();
      const hub = makeEvidenceJournal({ app: EvidenceApp, plan: EvidencePlan });
      const delivered: string[] = [];

      const sink = yield* makeEvidenceSink({
        id: "bounded",
        capacity: 1,
        deliver: (record) => Effect.sync(() => delivered.push(record._tag)),
      });

      assert.ok(Result.isSuccess(hub.attach(sink)));

      for (let index = 0; index < 3; index += 1) {
        const reservation = reserve(hub);
        const accepted = acceptTurn(hub, fixture, reservation);
        const result = yield* Effect.exit(accepted.effect);
        assert.ok(Exit.isSuccess(result));
      }

      const drained = yield* drainJournal(hub);
      assert.strictEqual(drained.through, 3);
      assert.ok(Option.isSome(drained.truncatedBefore));

      if (Option.isSome(drained.truncatedBefore))
        assert.strictEqual(drained.truncatedBefore.value, 2);
      assert.deepStrictEqual(delivered, ["turn"]);
      assert.deepStrictEqual(
        drained.attachments.map((result) => result.status),
        ["truncated"],
      );
    }),
  );

  it.effect("keeps sink delivery failure local to that sink", () =>
    Effect.gen(function* () {
      const fixture = makeFixture();
      const hub = makeEvidenceJournal({ app: EvidenceApp, plan: EvidencePlan });

      const failedSink = yield* makeEvidenceSink({
        id: "failed",
        deliver: () =>
          Effect.fail(
            Failure({
              code: "InvariantViolation",
              path: ["evidence", "sink"],
              details: {},
              summary: "sink failed",
              help: "inspect sink",
            }),
          ),
      });

      const healthySink = yield* makeEvidenceSink({
        id: "healthy",
        deliver: () => Effect.void,
      });

      assert.ok(Result.isSuccess(hub.attach(failedSink)));
      assert.ok(Result.isSuccess(hub.attach(healthySink)));

      const reservation = reserve(hub);
      const accepted = acceptTurn(hub, fixture, reservation);
      assert.ok(Exit.isSuccess(yield* Effect.exit(accepted.effect)));
      const drained = yield* drainJournal(hub);

      assert.deepStrictEqual(
        drained.attachments.map((result) => [result.sink, result.status]),
        [
          [failedSink.id, "failed"],
          [healthySink.id, "drained"],
        ],
      );
      assert.strictEqual(drained.through, 1);
    }),
  );

  it.effect("offers to a sink only when the offer effect runs", () =>
    Effect.gen(function* () {
      const fixture = makeFixture();
      const hub = makeEvidenceJournal({ app: EvidenceApp, plan: EvidencePlan });
      const reservation = reserve(hub);
      const record = resultSuccess(makeTurnRecord(turnFact(fixture, reservation), reservation));
      const delivered: string[] = [];

      const sink = yield* makeEvidenceSink({
        id: "deferred-offer",
        deliver: (offered) => Effect.sync(() => delivered.push(offered._tag)),
      });

      const acceptedRecord = yield* acceptPrepared(hub, reservation, record);
      const offer = sink.offer(acceptedRecord.record);
      const beforeOffer = yield* sink.drain(acceptedRecord.sequence);
      assert.strictEqual(beforeOffer.status, "drained");
      assert.deepStrictEqual(delivered, []);

      const accepted = yield* offer;
      assert.strictEqual(accepted.status, "accepted");

      const afterOffer = yield* sink.drain(acceptedRecord.sequence);
      assert.strictEqual(afterOffer.status, "drained");
      assert.deepStrictEqual(delivered, ["turn"]);
      yield* sink.close();
    }),
  );

  it.effect("timestamps accepted publications from the supplied runtime clock", () =>
    Effect.gen(function* () {
      const fixture = makeFixture();
      let now = 4_242;

      const clock = makeTestClock(() => now);

      const owner = makeRuntimeEvidenceOwner({
        app: EvidenceApp,
        plan: EvidencePlan,
        clock,
      });

      const timestamps: number[] = [];

      const sink = yield* makeEvidenceSink({
        id: "clock",
        deliver: (record) =>
          Effect.sync(() => {
            if (record._tag === "turn") timestamps.push(record.timestamp);
          }),
      });

      assert.ok(Result.isSuccess(owner.journal.attach(sink)));

      const publish = (revision: number) =>
        owner.acceptPublication(fixture.identity, fixture.fence, fixture.snapshot(revision - 1), {
          snapshot: fixture.snapshot(revision),
          store: { revision: 0, changed: [] },
          publicationRevision: revision,
          machineTurnRevision: revision,
          cause: { _tag: "event", event: EvidenceEvent },
        });

      assert.ok(Result.isSuccess(publish(1)));
      now = 8_484;
      assert.ok(Result.isSuccess(publish(2)));
      yield* owner.journal.drain();

      assert.deepStrictEqual(timestamps, [4_242, 8_484]);
      assert.ok(Result.isSuccess(owner.service.cancel(resultSuccess(owner.service.prepare()))));
    }),
  );

  it.effect("closes idempotently after draining accepted evidence", () =>
    Effect.gen(function* () {
      const fixture = makeFixture();
      const hub = makeEvidenceJournal({ app: EvidenceApp, plan: EvidencePlan });
      const sink = yield* makeEvidenceSink({ id: "close" });
      assert.ok(Result.isSuccess(hub.attach(sink)));
      const reservation = reserve(hub);
      const accepted = acceptTurn(hub, fixture, reservation);
      assert.ok(Exit.isSuccess(yield* Effect.exit(accepted.effect)));

      const firstClose = yield* Effect.exit(closeJournal(hub));
      const secondClose = yield* Effect.exit(closeJournal(hub));
      assert.ok(Exit.isSuccess(firstClose));
      assert.ok(Exit.isSuccess(secondClose));

      if (Exit.isSuccess(firstClose) && Exit.isSuccess(secondClose)) {
        assert.strictEqual(firstClose.value.through, 1);
        assert.strictEqual(secondClose.value.through, 1);
        assert.deepStrictEqual(
          firstClose.value.attachments.map((result) => result.status),
          ["drained"],
        );
      }

      assert.ok(Result.isFailure(hub.prepare()));
    }),
  );

  it("constructs a complete unsequenced turn fact from app provenance", () => {
    const fixture = makeFixture();
    const hub = makeEvidenceJournal({ app: EvidenceApp, plan: EvidencePlan });
    const reservation = reserve(hub);
    const fact = turnFact(fixture, reservation);
    assert.strictEqual("sequence" in fact, false);
    assert.strictEqual(fact.provenance.app, EvidenceApp);
    assert.strictEqual(fact.provenance.plan, EvidencePlan);
    assert.deepStrictEqual(fact.provenance.actor, {
      key: fixture.identity.key,
      incarnation: fixture.identity.incarnation,
      leaseEpoch: fixture.identity.leaseEpoch,
    });
    const record = resultSuccess(makeTurnRecord(fact, reservation));
    assert.strictEqual("sequence" in record, false);
  });

  it.effect("accepts only hub-reserved evidence sequences", () =>
    Effect.gen(function* () {
      const fixture = makeFixture();
      const hub = makeEvidenceJournal({ app: EvidenceApp, plan: EvidencePlan });
      const reservation = reserve(hub);

      const accepted = yield* acceptPrepared(
        hub,
        reservation,
        resultSuccess(makeTurnRecord(turnFact(fixture, reservation), reservation)),
      );

      assert.strictEqual(accepted.sequence, 1);
      assert.strictEqual(accepted.record._tag, "turn");
      assert.strictEqual(hub.sequence(), 1);
    }),
  );

  it.effect("rejects equal-sequence evidence from a foreign reservation", () =>
    Effect.gen(function* () {
      const fixture = makeFixture();
      const first = makeEvidenceJournal({ app: EvidenceApp, plan: EvidencePlan });
      const second = makeEvidenceJournal({ app: EvidenceApp, plan: EvidencePlan });
      const firstReservation = reserve(first);
      const secondReservation = reserve(second);
      assert.notStrictEqual(secondReservation, firstReservation);

      const record = resultSuccess(
        makeTurnRecord(turnFact(fixture, firstReservation), firstReservation),
      );

      const foreign = yield* Effect.exit(acceptPrepared(second, firstReservation, record));
      assert.ok(Exit.isFailure(foreign));
      assert.strictEqual(second.sequence(), 0);
      const local = yield* acceptPrepared(first, firstReservation, record);
      assert.strictEqual(local.sequence, 1);
    }),
  );

  it.effect("drains the accepted evidence prefix before sink close", () =>
    Effect.gen(function* () {
      const fixture = makeFixture();
      const delivered: number[] = [];
      const hub = makeEvidenceJournal({ app: EvidenceApp, plan: EvidencePlan });

      const sink = yield* makeEvidenceSink({
        id: "prefix-drain",
        deliver: (record) =>
          Effect.sync(() =>
            delivered.push(record._tag === "turn" ? record.sequence : record.evidenceSequence),
          ),
      });

      assert.ok(Result.isSuccess(hub.attach(sink)));
      const first = reserve(hub);
      const second = reserve(hub);
      yield* acceptPrepared(
        hub,
        first,
        resultSuccess(makeTurnRecord(turnFact(fixture, first), first)),
      );
      yield* acceptPrepared(
        hub,
        second,
        resultSuccess(makeTurnRecord(turnFact(fixture, second), second)),
      );
      const closed = yield* closeJournal(hub);
      assert.deepStrictEqual(delivered, [1, 2]);
      assert.strictEqual(closed.through, 2);
      assert.strictEqual(closed.attachments[0]?.status, "drained");
    }),
  );

  it.effect("keeps sink overflow local to the failing sink", () =>
    Effect.gen(function* () {
      const fixture = makeFixture();
      const hub = makeEvidenceJournal({ app: EvidenceApp, plan: EvidencePlan });
      const small = yield* makeEvidenceSink({ id: "small", capacity: 1 });
      const healthy = yield* makeEvidenceSink({ id: "healthy", capacity: 4 });
      assert.ok(Result.isSuccess(hub.attach(small)));
      assert.ok(Result.isSuccess(hub.attach(healthy)));

      for (let index = 0; index < 2; index += 1) {
        const reservation = reserve(hub);
        yield* acceptPrepared(
          hub,
          reservation,
          resultSuccess(makeTurnRecord(turnFact(fixture, reservation), reservation)),
        );
      }

      const drained = yield* drainJournal(hub);
      assert.strictEqual(drained.through, 2);
      assert.deepStrictEqual(
        drained.attachments.map((sink) => [sink.sink, sink.status]),
        [
          [small.id, "truncated"],
          [healthy.id, "drained"],
        ],
      );
    }),
  );

  it.effect("retains sink delivery failure after acceptance", () =>
    Effect.gen(function* () {
      const fixture = makeFixture();
      const hub = makeEvidenceJournal({ app: EvidenceApp, plan: EvidencePlan });

      const sink = yield* makeEvidenceSink({
        id: "failing-delivery",
        deliver: () =>
          Effect.fail(
            Failure({
              code: "InvariantViolation",
              path: ["sink"],
              details: {},
              summary: "delivery failed",
              help: "inspect sink",
            }),
          ),
      });

      assert.ok(Result.isSuccess(hub.attach(sink)));
      const reservation = reserve(hub);
      yield* acceptPrepared(
        hub,
        reservation,
        resultSuccess(makeTurnRecord(turnFact(fixture, reservation), reservation)),
      );
      const drained = yield* drainJournal(hub);
      assert.strictEqual(hub.sequence(), 1);
      assert.strictEqual(drained.attachments[0]?.status, "failed");
    }),
  );

  it.effect("rejects evidence from a foreign app identity", () =>
    Effect.gen(function* () {
      const fixture = makeFixture();
      const current = makeEvidenceJournal({ app: EvidenceApp, plan: EvidencePlan });
      const foreignApp = app({ id: "evidence/foreign-app", persistenceVersion: "1", modules: [] });
      const reservation = reserve(current);
      const record = resultSuccess(makeTurnRecord(turnFact(fixture, reservation), reservation));

      // SAFETY: The record is intentionally forged with a foreign app to exercise the rejection boundary.
      const foreignRecord: PreparedEvidenceRecord = {
        ...record,
        provenance: { ...record.provenance, app: foreignApp },
      };

      const result = yield* Effect.exit(acceptPrepared(current, reservation, foreignRecord));
      assert.ok(Exit.isFailure(result));
      assert.strictEqual(current.sequence(), 0);
    }),
  );

  it.effect("retains lifecycle cleanup Cause through evidence acceptance", () =>
    Effect.gen(function* () {
      const fixture = makeFixture();

      const owner = makeRuntimeEvidenceOwner({
        app: EvidenceApp,
        plan: EvidencePlan,
        clock: makeTestClock(2_000),
      });

      const delivered: EvidenceRecord[] = [];

      const sink = yield* makeEvidenceSink({
        id: "lifecycle-cause",
        deliver: (record) => Effect.sync(() => delivered.push(record)),
      });

      assert.ok(Result.isSuccess(owner.journal.attach(sink)));
      const actorCell = makeLifecycleActorCell<PublicDiagnostic>();

      const prepared = resultSuccess(
        prepareLifecycle<typeof EvidenceDefinition, PublicDiagnostic>(
          fixture.fence,
          {
            _tag: "fresh",
          },
          actorCell,
        ),
      );

      const clock = makeTestClock(2_000);

      const layer = makeRuntimeServicesLayer({
        clock,
        evidence: owner.service,
      });

      const active = yield* Effect.provide(activateLifecycle(prepared, actorCell), layer);

      const cleanupFailure = Failure({
        code: "InvariantViolation" as const,
        path: ["cleanup"],
        details: { owner: "resource" },
        summary: "resource cleanup failed",
        help: "Inspect the retained cleanup Cause.",
      });

      const resource: LifecycleResource<PublicDiagnostic> = {
        name: "failing-resource",
        close: () =>
          Effect.failCause(Cause.combine(Cause.fail(cleanupFailure), Cause.die(cleanupFailure))),
        finalization: "pending",
        cause: Option.none(),
      };

      const failed = yield* Effect.exit(
        Effect.provide(
          runLifecycleCommand(
            {
              ...active,
              attachment: { ...active.attachment, resources: [resource] },
            },
            { _tag: "actor:dispose", cause: { _tag: "owner-disposal" } },
            actorCell,
          ),
          layer,
        ),
      );

      assert.ok(Exit.isFailure(failed));
      yield* owner.journal.drain();
      const record = delivered[0];
      assert.ok(record !== undefined);

      assert.strictEqual(record._tag, "lifecycle");

      const retainedCause = record.cause;

      assert.ok(isCleanupFailureEnvelope(retainedCause));

      assert.strictEqual(retainedCause._tag, "cleanup-failure");
      const retained = retainedCause.cause;
      assert.strictEqual(Cause.hasFails(retained), true);
      assert.strictEqual(Cause.hasDies(retained), true);

      assert.strictEqual(owner.journal.sequence(), 1);
      yield* owner.close();
    }),
  );

  it.effect("orders the original lifecycle Cause before an evidence Cause", () =>
    Effect.gen(function* () {
      const fixture = makeFixture();

      const owner = makeRuntimeEvidenceOwner({
        app: EvidenceApp,
        plan: EvidencePlan,
        clock: makeTestClock(3_000),
      });

      const cleanupFailure = Failure({
        code: "CleanupFailed" as const,
        path: ["test", "lifecycle"],
        details: { order: "first" },
        summary: "lifecycle cleanup failed",
        help: "Retain the lifecycle Cause.",
      });

      const evidenceFailure = Failure({
        code: "InvariantViolation" as const,
        path: ["test", "evidence"],
        details: { order: "second" },
        summary: "evidence acceptance failed",
        help: "Retain the evidence Cause.",
      });

      const layer = makeRuntimeServicesLayer({
        clock: makeTestClock(3_000),
        evidence: {
          ...owner.service,
          accept: () => Effect.fail(evidenceFailure),
        },
      });

      const actorCell = makeLifecycleActorCell<PublicDiagnostic>();

      const prepared = resultSuccess(
        prepareLifecycle<typeof EvidenceDefinition, PublicDiagnostic>(
          fixture.fence,
          {
            _tag: "fresh",
          },
          actorCell,
        ),
      );

      const active = yield* Effect.provide(activateLifecycle(prepared, actorCell), layer);

      const resource: LifecycleResource<PublicDiagnostic> = {
        name: "ordered-cleanup",
        close: () => Effect.fail(cleanupFailure),
        finalization: "pending",
        cause: Option.none(),
      };

      const failed = yield* Effect.exit(
        Effect.provide(
          runLifecycleCommand(
            { ...active, attachment: { ...active.attachment, resources: [resource] } },
            { _tag: "actor:dispose", cause: { _tag: "owner-disposal" } },
            actorCell,
          ),
          layer,
        ),
      );

      assert.ok(Exit.isFailure(failed));

      if (Exit.isFailure(failed)) {
        assert.strictEqual(failed.cause.reasons.length, 2);
        const lifecycleReason = failed.cause.reasons[0];
        const evidenceReason = failed.cause.reasons[1];

        if (lifecycleReason === undefined || evidenceReason === undefined)
          return yield* Effect.die(new Error("ordered Cause reasons are missing"));

        if (!Cause.isFailReason(lifecycleReason) || !Cause.isFailReason(evidenceReason))
          return yield* Effect.die(new Error("ordered Cause reasons are not typed failures"));

        assert.strictEqual(lifecycleReason.error, cleanupFailure);
        assert.strictEqual(evidenceReason.error, evidenceFailure);
      }

      yield* owner.close();
    }),
  );

  it("preserves null and undefined evidence payload values", () => {
    const fixture = makeFixture();
    const hub = makeEvidenceJournal({ app: EvidenceApp, plan: EvidencePlan });
    const reservation = reserve(hub);
    // SAFETY: Freezing caller-owned input verifies capture retains null and undefined fields without changing the input.
    // oxlint-disable-next-line anti-slop/no-object-freeze -- test input models a caller-supplied frozen payload.
    const payload = Object.freeze({ ...EvidenceEvent, payload: null, optional: undefined });

    // The valid event carries caller fields beyond its tag to prove evidence preserves null and present undefined values.
    const record = resultSuccess(
      makeTurnRecord(
        {
          ...turnFact(fixture, reservation),
          cause: { _tag: "event", event: payload },
        },
        reservation,
      ),
    );

    const accepted = resultSuccess(hub.acceptSync(reservation, record));

    if (accepted.record._tag !== "turn") throw new Error("turn record was not retained");

    if (accepted.record.cause._tag !== "event") throw new Error("event cause was not retained");
    assert.deepStrictEqual(accepted.record.cause.event, payload);
    const retainedPayload = accepted.record.cause.event;
    assert.ok(hasNullUndefinedPayloadFields(retainedPayload));

    assert.strictEqual(retainedPayload.payload, null);
    assert.strictEqual(retainedPayload.optional, undefined);
  });

  it.effect("closes an empty evidence hub without synthetic records", () =>
    Effect.gen(function* () {
      const hub = makeEvidenceJournal({ app: EvidenceApp, plan: EvidencePlan });
      const first = yield* closeJournal(hub);
      const second = yield* closeJournal(hub);
      assert.strictEqual(first.through, 0);
      assert.strictEqual(second.through, 0);
      assert.deepStrictEqual(first.attachments, []);
      assert.ok(Result.isFailure(hub.prepare()));
    }),
  );

  it.effect("applies the late sink policy without hidden history replay", () =>
    Effect.gen(function* () {
      const fixture = makeFixture();
      const hub = makeEvidenceJournal({ app: EvidenceApp, plan: EvidencePlan });
      const first = reserve(hub);
      yield* acceptPrepared(
        hub,
        first,
        resultSuccess(makeTurnRecord(turnFact(fixture, first), first)),
      );
      const delivered: number[] = [];

      const late = yield* makeEvidenceSink({
        id: "late",
        deliver: (record) =>
          Effect.sync(() =>
            delivered.push(record._tag === "turn" ? record.sequence : record.evidenceSequence),
          ),
      });

      assert.ok(Result.isSuccess(hub.attach(late)));
      yield* drainJournal(hub);
      assert.deepStrictEqual(delivered, []);
      assert.strictEqual(hub.sequence(), 1);
    }),
  );

  it.effect("admits each evidence sink to one Journal only", () =>
    Effect.gen(function* () {
      const sink = yield* makeEvidenceSink({ id: "single-journal" });
      const first = makeEvidenceJournal({ app: EvidenceApp, plan: EvidencePlan });
      const second = makeEvidenceJournal({ app: EvidenceApp, plan: EvidencePlan });

      assert.ok(Result.isSuccess(first.attach(sink)));
      const duplicate = first.attach(sink);
      const mixed = second.attach(sink);

      assert.ok(Result.isFailure(duplicate));
      assert.ok(Result.isFailure(mixed));

      if (Result.isFailure(duplicate))
        assert.strictEqual(duplicate.failure.details.reason, "duplicate");

      if (Result.isFailure(mixed))
        assert.strictEqual(mixed.failure.details.reason, "foreign-journal");

      yield* first.close();
      yield* second.close();
    }),
  );

  it.effect("linearizes concurrent evidence acceptance by sequence", () =>
    Effect.gen(function* () {
      const fixture = makeFixture();
      const hub = makeEvidenceJournal({ app: EvidenceApp, plan: EvidencePlan });
      const delivered: number[] = [];

      const sink = yield* makeEvidenceSink({
        id: "concurrent",
        deliver: (record) =>
          Effect.sync(() =>
            delivered.push(record._tag === "turn" ? record.sequence : record.evidenceSequence),
          ),
      });

      assert.ok(Result.isSuccess(hub.attach(sink)));
      const first = reserve(hub);
      const second = reserve(hub);

      const secondFiber = yield* Effect.forkChild(
        acceptPrepared(
          hub,
          second,
          resultSuccess(makeTurnRecord(turnFact(fixture, second), second)),
        ),
      );

      yield* Effect.yieldNow;

      const firstAccepted = yield* acceptPrepared(
        hub,
        first,
        resultSuccess(makeTurnRecord(turnFact(fixture, first), first)),
      );

      const secondAccepted = yield* Fiber.join(secondFiber);
      assert.deepStrictEqual([firstAccepted.sequence, secondAccepted.sequence], [2, 1]);
      const drained = yield* hub.drain();
      assert.strictEqual(drained.through, 2);
      assert.deepStrictEqual(delivered, [1, 2]);
    }),
  );

  it.effect("applies the no-op turn evidence policy explicitly", () =>
    Effect.gen(function* () {
      const fixture = makeFixture();
      const hub = makeEvidenceJournal({ app: EvidenceApp, plan: EvidencePlan });
      const reservation = reserve(hub);
      const fact = turnFact(fixture, reservation);
      const record = resultSuccess(makeTurnRecord({ ...fact, before: fact.after }, reservation));
      const accepted = yield* acceptPrepared(hub, reservation, record);
      assert.deepStrictEqual(accepted.record.before, accepted.record.after);
      assert.strictEqual(accepted.sequence, 1);
    }),
  );

  it.effect("drains evidence as part of owner disposal", () =>
    Effect.gen(function* () {
      const fixture = makeFixture();

      const owner = makeRuntimeEvidenceOwner({
        app: EvidenceApp,
        plan: EvidencePlan,
        clock: makeTestClock(1),
      });

      const sink = yield* makeEvidenceSink({ id: "owner-drain" });
      assert.ok(Result.isSuccess(owner.journal.attach(sink)));
      const reservation = reserve(owner.journal);
      const record = resultSuccess(makeTurnRecord(turnFact(fixture, reservation), reservation));
      yield* acceptPrepared(owner.journal, reservation, record);
      const closed = yield* owner.close();
      assert.strictEqual(closed.through, 1);
      assert.ok(Result.isFailure(owner.journal.prepare()));
    }),
  );

  it("rejects mismatched actor provenance before sequence reservation", () => {
    const fixture = makeFixture();

    const owner = makeRuntimeEvidenceOwner({
      app: EvidenceApp,
      plan: EvidencePlan,
      clock: makeTestClock(1),
    });

    const foreignRegistry = makeActorIdentityRegistry({
      initialIncarnation: fixture.fence.incarnation + 1,
    });

    const foreignIdentity = resultSuccess(
      foreignRegistry.reserveStable(actorRef(EvidenceMachine, "actor")),
    );

    const wrongFence = { ...fixture.fence, incarnation: foreignIdentity.incarnation };

    const result = owner.acceptPublication(fixture.identity, wrongFence, fixture.snapshot(0), {
      snapshot: fixture.snapshot(1),
      store: { revision: 0, changed: [] },
      publicationRevision: 1,
      machineTurnRevision: 1,
      cause: { _tag: "event", event: EvidenceEvent },
    });

    assert.ok(Result.isFailure(result));
    assert.strictEqual(owner.journal.sequence(), 0);
  });

  it.effect("keeps later cleanup failure separate from prior accepted truth", () =>
    Effect.gen(function* () {
      const fixture = makeFixture();

      const owner = makeRuntimeEvidenceOwner({
        app: EvidenceApp,
        plan: EvidencePlan,
        clock: makeTestClock(1),
      });

      const delivered: EvidenceRecord[] = [];

      const sink = yield* makeEvidenceSink({
        id: "later-cleanup",
        deliver: (record) => Effect.sync(() => delivered.push(record)),
      });

      assert.ok(Result.isSuccess(owner.journal.attach(sink)));

      const first = owner.acceptPublication(fixture.identity, fixture.fence, fixture.snapshot(0), {
        snapshot: fixture.snapshot(1),
        store: { revision: 0, changed: [] },
        publicationRevision: 1,
        machineTurnRevision: 1,
        cause: { _tag: "event", event: EvidenceEvent },
      } satisfies ActorPublication<typeof EvidenceDefinition>);

      assert.ok(Result.isSuccess(first));
      const actorCell = makeLifecycleActorCell<string>();

      const lifecycle = resultSuccess(
        prepareLifecycle<typeof EvidenceDefinition, string>(
          fixture.fence,
          { _tag: "fresh" },
          actorCell,
        ),
      );

      const cleanupCause = Cause.combine(Cause.fail("later cleanup"), Cause.die("later defect"));

      const prepared = makeLifecycleEvidence(owner.service, {
        ...lifecycleFact(fixture.fence, lifecycle),
        cause: { _tag: "cleanup-failure", exit: Exit.failCause(cleanupCause), cause: cleanupCause },
      });

      assert.ok(Result.isSuccess(prepared));
      yield* owner.service.publish(lifecycle);

      if (Result.isSuccess(prepared))
        yield* owner.service.accept(prepared.success.record, prepared.success.preparation);
      yield* owner.journal.drain();

      assert.strictEqual(delivered.length, 2);
      assert.strictEqual(delivered[0]?._tag, "turn");
      assert.strictEqual(delivered[1]?._tag, "lifecycle");

      if (delivered[0]?._tag === "turn" && delivered[1]?._tag === "lifecycle") {
        assert.strictEqual(delivered[0].sequence, 1);
        assert.strictEqual(delivered[0].provenance.actor.key, fixture.identity.key);
        assert.strictEqual(delivered[1].evidenceSequence, 2);
        const cause = delivered[1].cause;
        assert.ok(isCleanupFailureEnvelope(cause));

        assert.strictEqual(cause._tag, "cleanup-failure");
      }

      yield* owner.close();
    }),
  );

  it.effect("keeps evidence acknowledgement private", () =>
    Effect.gen(function* () {
      const fixture = makeFixture();
      const hub = makeEvidenceJournal({ app: EvidenceApp, plan: EvidencePlan });
      const reservation = reserve(hub);

      const accepted = yield* acceptPrepared(
        hub,
        reservation,
        resultSuccess(makeTurnRecord(turnFact(fixture, reservation), reservation)),
      );

      assert.strictEqual("completion" in accepted, false);
    }),
  );

  it.effect("retains interrupted sink delivery during hub close", () =>
    Effect.gen(function* () {
      const fixture = makeFixture();
      const hub = makeEvidenceJournal({ app: EvidenceApp, plan: EvidencePlan });
      const entered = yield* Deferred.make<Fiber.Fiber<unknown, unknown>>();

      const sink = yield* makeEvidenceSink({
        id: "interrupted",
        deliver: () =>
          Effect.gen(function* () {
            const deliveryFiber = yield* Effect.forkChild(Effect.never, {
              startImmediately: true,
            });

            yield* Deferred.succeed(entered, deliveryFiber);
            yield* Fiber.join(deliveryFiber);
          }),
      });

      assert.ok(Result.isSuccess(hub.attach(sink)));
      const reservation = reserve(hub);
      yield* acceptPrepared(
        hub,
        reservation,
        resultSuccess(makeTurnRecord(turnFact(fixture, reservation), reservation)),
      );
      const drain = yield* Effect.forkChild(Effect.exit(hub.drain()), { startImmediately: true });
      const deliveryFiber = yield* Deferred.await(entered);
      yield* Effect.exit(Fiber.interrupt(deliveryFiber));
      const drainExit = yield* Fiber.join(drain);
      assert.ok(Exit.isSuccess(drainExit));

      if (Exit.isSuccess(drainExit)) {
        assert.strictEqual(drainExit.value.attachments[0]?.status, "failed");
        assert.strictEqual(drainExit.value.through, 1);
      }

      const closed = yield* closeJournal(hub);
      assert.strictEqual(closed.attachments[0]?.status, "failed");
      assert.strictEqual(hub.sequence(), 1);
    }),
  );

  it.effect("cancels failed evidence reservations without blocking the prefix", () =>
    Effect.gen(function* () {
      const fixture = makeFixture();
      const hub = makeEvidenceJournal({ app: EvidenceApp, plan: EvidencePlan });
      const failed = reserve(hub);
      const later = reserve(hub);
      assert.ok(Result.isSuccess(hub.cancel(failed)));

      const accepted = yield* acceptPrepared(
        hub,
        later,
        resultSuccess(makeTurnRecord(turnFact(fixture, later), later)),
      );

      assert.strictEqual(accepted.sequence, 1);
      assert.strictEqual(hub.sequence(), 1);
    }),
  );

  it.effect("preserves actor and lifecycle evidence order across one interleave", () =>
    Effect.gen(function* () {
      const fixture = makeFixture();
      const tags: string[] = [];
      const hub = makeEvidenceJournal({ app: EvidenceApp, plan: EvidencePlan });

      const sink = yield* makeEvidenceSink({
        id: "interleave",
        deliver: (record) => Effect.sync(() => tags.push(record._tag)),
      });

      assert.ok(Result.isSuccess(hub.attach(sink)));
      const actorReservation = reserve(hub);
      const lifecycleReservation = reserve(hub);

      const actorRecord = resultSuccess(
        makeTurnRecord(turnFact(fixture, actorReservation), actorReservation),
      );

      const lifecycleRecord = resultSuccess(
        makeLifecycleRecord(
          lifecycleFact(
            fixture.fence,
            resultSuccess(
              prepareLifecycle<typeof EvidenceDefinition, string>(
                fixture.fence,
                { _tag: "restore" },
                makeLifecycleActorCell<string>(),
              ),
            ),
          ),
          lifecycleReservation,
        ),
      );

      const lifecycleFiber = yield* Effect.forkChild(
        acceptPrepared(hub, lifecycleReservation, lifecycleRecord),
      );

      yield* Effect.yieldNow;
      yield* acceptPrepared(hub, actorReservation, actorRecord);
      yield* Fiber.join(lifecycleFiber);
      yield* hub.drain();
      assert.deepStrictEqual(tags, ["lifecycle", "turn"]);
    }),
  );

  it.effect("LIFE-CREDIT retains terminal publication capacity during lifecycle cleanup", () =>
    Effect.gen(function* () {
      const fixture = makeFixture();
      const journal = makeEvidenceJournal({ app: EvidenceApp, plan: EvidencePlan, capacity: 1 });

      assert.ok(Result.isSuccess(journal.registerActor(fixture.identity.key, fixture.fence)));
      const ordinary = reserve(journal);
      const lifecyclePreparation = journal.prepareLifecycle(fixture.identity.key);

      assert.ok(Result.isSuccess(lifecyclePreparation));
      assert.ok(Result.isFailure(journal.prepare()));

      if (Result.isSuccess(lifecyclePreparation)) {
        const actorCell = makeLifecycleActorCell<string>();

        const snapshot = resultSuccess(
          prepareLifecycle<typeof EvidenceDefinition, string>(
            fixture.fence,
            { _tag: "restore" },
            actorCell,
          ),
        );

        const record = resultSuccess(
          makeLifecycleRecord(lifecycleFact(fixture.fence, snapshot), lifecyclePreparation.success),
        );

        const accepted = yield* journal.accept(lifecyclePreparation.success, record);

        assert.strictEqual(accepted.sequence, 1);
        assert.ok(Result.isSuccess(journal.settleOutcome(lifecyclePreparation.success, true)));
      }

      assert.ok(Result.isSuccess(journal.cancel(ordinary)));
      const nextOrdinary = reserve(journal);
      assert.ok(Result.isSuccess(journal.cancel(nextOrdinary)));
      assert.ok(Result.isSuccess(journal.releaseActor(fixture.identity.key)));
      yield* journal.close();
    }),
  );

  it.effect("closes after an admitted lifecycle outcome settles its Deferred credit", () =>
    Effect.gen(function* () {
      const fixture = makeFixture();
      const journal = makeEvidenceJournal({ app: EvidenceApp, plan: EvidencePlan });

      const delivered: EvidenceRecord[] = [];

      const sink = yield* makeEvidenceSink({
        id: "admitted-close",
        deliver: (record) => Effect.sync(() => delivered.push(record)),
      });

      assert.ok(Result.isSuccess(journal.attach(sink)));
      const actorCredit = journal.registerActor(fixture.identity.key, fixture.fence);

      assert.ok(Result.isSuccess(actorCredit));
      const lifecyclePreparation = resultSuccess(journal.prepareLifecycle(fixture.identity.key));
      const actorCell = makeLifecycleActorCell<string>();

      const snapshot = resultSuccess(
        prepareLifecycle<typeof EvidenceDefinition, string>(
          fixture.fence,
          { _tag: "restore" },
          actorCell,
        ),
      );

      const record = resultSuccess(
        makeLifecycleRecord(lifecycleFact(fixture.fence, snapshot), lifecyclePreparation),
      );

      const acceptGate = yield* Deferred.make<void>();

      const accepted = yield* Effect.forkChild(
        Deferred.await(acceptGate).pipe(
          Effect.flatMap(() => journal.accept(lifecyclePreparation, record)),
        ),
        { startImmediately: true },
      );

      const closing = yield* Effect.forkChild(Effect.exit(journal.close()), {
        startImmediately: true,
      });

      yield* Effect.yieldNow;
      const ordinaryAfterClose = journal.prepare();

      assert.ok(Result.isFailure(ordinaryAfterClose));

      if (Result.isFailure(ordinaryAfterClose))
        assert.deepStrictEqual(ordinaryAfterClose.failure.path, ["evidence", "closed"]);

      yield* Deferred.succeed(acceptGate, undefined);
      const acceptance = yield* Fiber.join(accepted);
      assert.strictEqual(acceptance.sequence, 1);
      assert.ok(Result.isSuccess(journal.settleOutcome(lifecyclePreparation, true)));
      assert.ok(Result.isSuccess(journal.releaseActor(fixture.identity.key)));

      const closed = yield* Fiber.join(closing);
      assert.ok(Exit.isSuccess(closed));
      assert.strictEqual(closed.value.through, 1);
      assert.strictEqual(delivered.length, 1);
      assert.strictEqual(delivered[0]?._tag, "lifecycle");
      const terminalRecord = delivered[0];
      assert.ok(terminalRecord !== undefined);

      if (terminalRecord._tag === "lifecycle")
        assert.strictEqual(terminalRecord.evidenceSequence, 1);
    }),
  );

  it.effect("binds Journal acceptance to the registered actor fence", () =>
    Effect.gen(function* () {
      const fixture = makeFixture();
      const journal = makeEvidenceJournal({ app: EvidenceApp, plan: EvidencePlan });
      assert.ok(Result.isSuccess(journal.registerActor(fixture.identity.key, fixture.fence)));

      const preparation = resultSuccess(journal.prepareLifecycle(fixture.identity.key));
      const forgedFence = { ...fixture.fence, generation: fixture.fence.generation + 1 };

      const forgedRecord = resultSuccess(
        makeTurnRecord({ ...turnFact(fixture, preparation), fence: forgedFence }, preparation),
      );

      const rejected = yield* Effect.exit(journal.accept(preparation, forgedRecord));
      assert.ok(Exit.isFailure(rejected));
      assert.strictEqual(journal.sequence(), 0);

      if (Exit.isFailure(rejected)) {
        const reason = rejected.cause.reasons.find(Cause.isFailReason);
        assert.ok(reason !== undefined);
        assert.deepStrictEqual(reason.error.path, ["evidence", "credit"]);
      }

      assert.ok(Result.isFailure(journal.prepareLifecycle(fixture.identity.key)));
      assert.ok(Result.isSuccess(journal.cancel(preparation)));

      const retry = resultSuccess(journal.prepareLifecycle(fixture.identity.key));

      const accepted = yield* journal.accept(
        retry,
        resultSuccess(makeTurnRecord(turnFact(fixture, retry), retry)),
      );

      assert.strictEqual(accepted.sequence, 1);
      assert.ok(Result.isSuccess(journal.settleOutcome(retry, false)));
      assert.ok(Result.isSuccess(journal.releaseActor(fixture.identity.key)));
      yield* journal.close();
    }),
  );

  it.effect("cancels an interrupted Journal acceptance waiter", () =>
    Effect.gen(function* () {
      const fixture = makeFixture();
      const journal = makeEvidenceJournal({ app: EvidenceApp, plan: EvidencePlan });
      assert.ok(Result.isSuccess(journal.registerActor(fixture.identity.key, fixture.fence)));

      const blockerPreparation = reserve(journal);

      const blockerRecord = resultSuccess(
        makeTurnRecord(turnFact(fixture, blockerPreparation), blockerPreparation),
      );

      const lifecyclePreparation = resultSuccess(journal.prepareLifecycle(fixture.identity.key));

      const lifecycleRecord = resultSuccess(
        makeTurnRecord(turnFact(fixture, lifecyclePreparation), lifecyclePreparation),
      );

      const blocker = yield* Effect.forkChild(journal.accept(blockerPreparation, blockerRecord), {
        startImmediately: true,
      });

      const waiting = yield* Effect.forkChild(
        journal.accept(lifecyclePreparation, lifecycleRecord),
        { startImmediately: true },
      );

      const interrupted = yield* Effect.exit(Fiber.interrupt(waiting));
      assert.ok(Exit.isSuccess(interrupted));
      const waitingExit = yield* Fiber.await(waiting);
      assert.ok(Exit.isFailure(waitingExit));

      if (Exit.isFailure(waitingExit))
        assert.strictEqual(Cause.hasInterruptsOnly(waitingExit.cause), true);

      const blockerAcceptance = yield* Fiber.join(blocker);
      assert.strictEqual(blockerAcceptance.sequence, 1);
      assert.strictEqual(journal.sequence(), 1);

      const retry = resultSuccess(journal.prepareLifecycle(fixture.identity.key));
      assert.ok(Result.isSuccess(journal.cancel(retry)));
      assert.ok(Result.isSuccess(journal.releaseActor(fixture.identity.key)));
      const closed = yield* Effect.exit(journal.close());
      assert.ok(Exit.isSuccess(closed));
    }),
  );

  it.effect(
    "CREDIT-FOLLOWER keeps an interrupted follower from stealing the owner outcome credit",
    () =>
      Effect.gen(function* () {
        const fixture = makeFixture();
        const journal = makeEvidenceJournal({ app: EvidenceApp, plan: EvidencePlan });
        assert.ok(Result.isSuccess(journal.registerActor(fixture.identity.key, fixture.fence)));
        const lifecyclePreparation = resultSuccess(journal.prepareLifecycle(fixture.identity.key));
        const actorCell = makeLifecycleActorCell<string>();

        const snapshot = resultSuccess(
          prepareLifecycle<typeof EvidenceDefinition, string>(
            fixture.fence,
            { _tag: "restore" },
            actorCell,
          ),
        );

        const record = resultSuccess(
          makeLifecycleRecord(lifecycleFact(fixture.fence, snapshot), lifecyclePreparation),
        );

        const followerGate = yield* Deferred.make<void>();

        const follower = yield* Effect.forkChild(Deferred.await(followerGate), {
          startImmediately: true,
        });

        yield* Effect.exit(Fiber.interrupt(follower));
        assert.ok(Result.isFailure(journal.prepareLifecycle(fixture.identity.key)));

        const accepted = yield* journal.accept(lifecyclePreparation, record);
        assert.strictEqual(accepted.sequence, 1);
        assert.ok(Result.isSuccess(journal.settleOutcome(lifecyclePreparation, true)));
        assert.ok(Result.isSuccess(journal.releaseActor(fixture.identity.key)));
        yield* journal.close();
      }),
  );

  it.effect("drains the accepted prefix after a cancelled reservation", () =>
    Effect.gen(function* () {
      const fixture = makeFixture();
      const hub = makeEvidenceJournal({ app: EvidenceApp, plan: EvidencePlan });
      const first = reserve(hub);
      const second = reserve(hub);
      assert.ok(Result.isSuccess(hub.cancel(first)));
      yield* acceptPrepared(
        hub,
        second,
        resultSuccess(makeTurnRecord(turnFact(fixture, second), second)),
      );
      const drained = yield* drainJournal(hub);
      assert.strictEqual(drained.through, 1);
      assert.strictEqual(hub.sequence(), 1);
    }),
  );
});

describe("pending regression scenarios", () => {
  // SETUP: Use one real EvidenceJournal and one sink with a first-record delivery Deferred; accept sequence 1, start drain, and wait until delivery 1 is blocked.
  // ACTION: Accept sequence 2 while delivery 1 remains blocked, release delivery 1, await the first drain, then run a second drain.
  // ASSERT: Sequence 2 acceptance completes without waiting for sequence 1 delivery; the first drain reports through=1 and delivers only record 1; record 2 remains queued and is delivered by the second drain. This is the F6 reproduction and must not use a timeout as synchronization.
  it.todo("drains a captured evidence prefix while a newer record is accepted");

  // SETUP: Use one real EvidenceJournal and capacity-1 sink; capture each acceptance offer result and delivered record sequence while accepting global sequences 1, 2, and 3 without draining.
  // ACTION: Drain the hub, accept one later record, then drain again using the existing drain result and delivered records; do not invoke Phase-4 snapshot or clear APIs.
  // ASSERT: Offers are accepted,dropped,dropped and the first delivered sequence is 1; drain.truncatedBefore equals 3, the greatest omitted sequence. The later record is delivered in order and the marker never moves backward or resets the global sequence. Replace the weaker existing expectation of 2 when this case is implemented.
  it.todo("isolates bounded sink overflow and reports the greatest omitted sequence");

  // SETUP: Extend the two-sink failure fixture with a delivered-sequence array on the healthy sink and one accepted record shared by both attachments.
  // ACTION: Drain both sinks after acceptance, then inspect hub sequence, each sink status, and the healthy sink's received records.
  // ASSERT: The failing sink reports failed and detaches its own queue; the healthy sink receives the accepted record and reports drained; the hub sequence and committed evidence remain unchanged.
  it.todo("delivers to healthy sinks after another sink fails");

  // SETUP: Construct real sinks with omitted capacity, capacity 0 and explicit capacity 3; use the real EvidenceJournal and accepted records to observe offers and retained delivery.
  // ACTION: Assert the default bound, attach the explicit sinks, accept four records without draining, capture every offer result, then drain both attachments.
  // ASSERT: Omitted capacity is exactly 256. Capacity 0 retains no records and drops every offer with the greatest omitted marker; capacity 3 accepts records 1/2/3 and drops 4, delivers exactly three records, and preserves global hub acceptance.
  it.todo("accepts zero sink capacity while preserving an exact positive bound");

  // SETUP: Create two real hubs and one sink; accept sequence 1 on hub A before attachment so the sink is late to that runtime.
  // ACTION: Attach the sink once to A, attempt duplicate A and mixed-runtime B attachment, drain A, then detach and attempt reattachment; observe the existing single-sink hub drain result and delivered sequences.
  // ASSERT: Late attachment replays no record 1 and its omitted marker equals the unseen runtime sequence. Duplicate, mixed-runtime and post-detach reattachment fail with the sink identity diagnostic; neither hub sequence changes and no module-private sinkInternals or future public inspection API is used.
  it.todo("rejects duplicate and mixed-runtime sink attachment while marking a late attach");

  // SETUP: Prepare a real accepted record with aliased/cyclic Flow-owned structural containers and separately identified application-opaque leaves, including a plain object, Map/Set/function/Error and nominal descriptor token.
  // ACTION: Accept the record, mutate the caller source containers and opaque application object, then drain the real sink and inspect the delayed delivered record.
  // ASSERT: Owned containers were copied before delivery; their aliases share one retained clone and supported cycles stay inside it. Opaque leaves, including the plain object, preserve Object.is identity. Caller container mutation cannot change the accepted cut or its provenance.
  it.todo("preserves record aliases, cycles, and opaque identity across acceptance");
});
