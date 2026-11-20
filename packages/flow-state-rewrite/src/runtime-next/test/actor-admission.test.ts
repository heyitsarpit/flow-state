import { assert, describe, it } from "@effect/vitest";
import { Cause, Clock, Effect, Exit, Result, Scope } from "effect";

import { Failure } from "../../diagnostic/diagnostic.js";
import { captureActorSnapshotCopyPolicy } from "../actor/actor-snapshot.js";
import { prepareIssueCut } from "../actor/actor-turn-work.js";
import { makeRuntimeEvidencePolicy } from "../runtime-services.js";

import {
  CounterDefinition,
  CounterMachine,
  counterSnapshot,
  makeActorFixture,
  NestedDefinition,
  NestedMachine,
  nestedSnapshot,
  makeStoreFixture,
  StoreDefinition,
  StoreMachine,
  storeRunner,
  storeSnapshot,
} from "./actor-fixture.js";

/** Exercise synchronous owner-port defects without throwing from an Effect workflow. */
const throwSync = (error: Error) => {
  throw error;
};

describe("runtime-next actor admission", () => {
  it.effect("fallible turn cuts cancel acquired permits and retain the original defect", () =>
    Effect.gen(function* () {
      const defect = new Error("evidence preflight defect");
      const store = makeStoreFixture();
      let storeCancels = 0;

      const f = yield* makeActorFixture({
        machine: StoreMachine,
        initial: storeSnapshot(),
        store: {
          ...store.port,
          prepare: (actions) =>
            Result.map(store.port.prepare(actions), (permit) => ({
              ...permit,
              cancel: () => {
                storeCancels += 1;
                permit.cancel();
              },
            })),
        },
        operationRunner: storeRunner,
        evidencePolicy: (base) => ({
          ...base,
          prepareTurn: () => throwSync(defect),
        }),
      });

      const actor = yield* f.prepared.activate();
      const before = actor.snapshot();

      const dispatched = yield* Effect.exit(
        actor.dispatch(Result.getOrThrow(StoreDefinition.E.fetch(1))),
      );

      assert.ok(Exit.isFailure(dispatched));

      if (Exit.isFailure(dispatched)) {
        const found = Cause.findDefect(dispatched.cause);

        assert.ok(Result.isSuccess(found));
        assert.ok(Result.isSuccess(found) && found.success === defect);
      }

      assert.strictEqual(storeCancels, 1);
      assert.strictEqual(store.revision(), 0);
      assert.strictEqual(actor.snapshot(), before);
      assert.strictEqual(f.journal.sequence(), 1);
      yield* Effect.exit(f.close());
      yield* f.journal.close();
      yield* Scope.close(f.ownerScope, Exit.void);

      const other = yield* makeActorFixture({
        machine: CounterMachine,
        initial: counterSnapshot(),
      });

      const clock = yield* Clock.Clock;
      const base = makeRuntimeEvidencePolicy(other.journal, clock);
      let evidenceCancels = 0;

      const issue = Failure({
        code: "InvariantViolation",
        path: ["test", "issue"],
        details: {},
        summary: "Issue preflight",
        help: "Inspect the preflight failure.",
      });

      const prior = other.prepared.snapshot();
      const sequence = other.journal.sequence();
      const copyPolicy = captureActorSnapshotCopyPolicy(CounterMachine);

      const issueExit = Result.try({
        try: () =>
          prepareIssueCut({
            machine: CounterMachine,
            copyPolicy,
            publication: { snapshot: prior, machineTurnRevision: 0, evidenceSequence: sequence },
            event: Result.getOrThrow(CounterDefinition.E.go(1)),
            failure: issue,
            credit: other.credit,
            identity: other.identity,
            provenance: { app: other.app, plan: other.plan, actor: other.identity },
            evidence: {
              prepareTurn: (credit, draft) =>
                Result.map(base.prepareTurn(credit, draft), (permit) => ({
                  ...permit,
                  cancel: () => {
                    evidenceCancels += 1;
                    permit.cancel();
                  },
                })),
            },
            prepareNotification: () => throwSync(defect),
            cancelNotification: () => {},
          }),
        catch: (caught) => caught,
      });

      assert.ok(Result.isFailure(issueExit));
      assert.ok(Result.isFailure(issueExit) && issueExit.failure === defect);

      assert.strictEqual(evidenceCancels, 1);
      assert.strictEqual(other.journal.sequence(), sequence);
      assert.strictEqual(other.prepared.snapshot(), prior);
      yield* other.close();
    }),
  );

  it.effect("hostile snapshot reflection rejects through typed admission", () =>
    Effect.gen(function* () {
      const revoked = Proxy.revocable(counterSnapshot(), {});
      revoked.revoke();

      const revokedExit = yield* Effect.exit(
        makeActorFixture({ machine: CounterMachine, initial: revoked.proxy }),
      );

      assert.ok(Exit.isFailure(revokedExit));
      assert.ok(Cause.hasFails(revokedExit.cause));
      assert.strictEqual(Cause.hasDies(revokedExit.cause), false);

      const throwing = new Proxy(counterSnapshot(), {
        getOwnPropertyDescriptor(target, key) {
          if (key === "issues") return throwSync(new Error("hostile issues descriptor"));

          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      });

      const throwingExit = yield* Effect.exit(
        makeActorFixture({ machine: CounterMachine, initial: throwing }),
      );

      assert.ok(Exit.isFailure(throwingExit));
      assert.ok(Cause.hasFails(throwingExit.cause));
      assert.strictEqual(Cause.hasDies(throwingExit.cause), false);
    }),
  );

  // Owner: P06.
  // Source: actor-engine.test.ts:1910 "fails before publication when the revision counter would wrap".
  // Contract/correction: STD-10; refactor.md ActorEngine owner proof matrix.
  // Setup: An actor publication revision near Number.MAX_SAFE_INTEGER.
  // Action: Attempt one more turn or lifecycle publication.
  // Observable result: A typed terminal result occurs before store, evidence, snapshot, or context mutation.
  // Failure/cleanup: Previously committed truth remains readable and cleanup still closes once.
  it.effect("RN-ACTOR-019 publication revision overflow rejects before actor mutation", () =>
    Effect.gen(function* () {
      const f = yield* makeActorFixture({
        machine: CounterMachine,
        initial: { ...counterSnapshot(), revision: Number.MAX_SAFE_INTEGER },
      });

      const before = f.prepared.snapshot();
      const activation = yield* Effect.exit(f.prepared.activate());

      assert.ok(Exit.isFailure(activation));
      assert.strictEqual(f.prepared.snapshot(), before);
      assert.strictEqual(f.journal.sequence(), 0);
      yield* f.close();
    }),
  );

  // Owner: P06.
  // Source: new refactor.md owner proof; no frozen source declaration.
  // Contract/correction: STD-03/11; refactor.md ActorEngine immediate admission.
  // Setup: A prepared actor buffers two nested caller-owned events before activation.
  // Action: Call send or construct dispatch, mutate the event afterward, then execute and drain.
  // Observable result: The committed turn uses the event captured at method call; caller mutation cannot rewrite queued work.
  // Failure/cleanup: A cyclic event rejects before mailbox admission without changing the committed cut.
  it.effect("RN-ACTOR-020 send and dispatch own events before queued execution", () =>
    Effect.gen(function* () {
      const f = yield* makeActorFixture({ machine: NestedMachine, initial: nestedSnapshot() });
      const sent = Result.getOrThrow(NestedDefinition.E.go({ nested: { amount: 2 } }));
      const dispatched = Result.getOrThrow(NestedDefinition.E.go({ nested: { amount: 3 } }));
      assert.ok(Result.isSuccess(f.prepared.send(sent)));
      const acknowledgement = f.prepared.dispatch(dispatched);
      Reflect.set(sent.payload.nested, "amount", 20);
      Reflect.set(dispatched.payload.nested, "amount", 30);
      const actor = yield* f.prepared.activate();
      yield* acknowledgement;
      yield* actor.flush();

      assert.strictEqual(actor.snapshot().memory.count, 5);
      const cyclic = Result.getOrThrow(NestedDefinition.E.go({ nested: { amount: 1 } }));
      Reflect.set(cyclic.payload, "cycle", cyclic.payload);
      const before = actor.snapshot();
      assert.ok(Result.isFailure(actor.send(cyclic)));
      assert.strictEqual(actor.snapshot(), before);
      yield* f.close();
    }),
  );

  // Owner: P06.
  // Source: actor-engine.test.ts:633 "rejects sends after active shutdown without exposing an async result".
  // Contract/correction: API-012; approved correction 1; refactor.md ActorEngine mailbox.
  // Frozen outcome: Frozen send could throw synchronously on full or closed mailbox.
  // Required new outcome: Full and closed send reject immediately through typed Result data without queue or snapshot mutation.
  // Setup: A prepared actor with the configured ordinary mailbox capacity.
  // Action: Fill the mailbox, send one more event, then shut down and send again.
  // Observable result: Both rejections are immediate typed Result values; no rejected event enters the queue or changes the snapshot.
  // Failure/cleanup: Activation drains the accepted prefix; shutdown rejects subsequent admission.
  it.effect("RN-ACTOR-021 full or closed send rejects synchronously without mutation", () =>
    Effect.gen(function* () {
      const f = yield* makeActorFixture({
        machine: CounterMachine,
        initial: counterSnapshot(),
        journalCapacity: 128,
      });

      const event = Result.getOrThrow(CounterDefinition.E.go(1));

      for (let index = 0; index < 64; index += 1)
        assert.ok(Result.isSuccess(f.prepared.send(event)));

      assert.ok(Result.isFailure(f.prepared.send(event)));
      assert.strictEqual(f.prepared.snapshot().revision, 0);
      const actor = yield* f.prepared.activate();
      yield* actor.flush();
      assert.strictEqual(actor.snapshot().memory.count, 64);
      yield* f.close();
      const after = actor.snapshot();
      assert.ok(Result.isFailure(actor.send(event)));
      assert.strictEqual(actor.snapshot(), after);
    }),
  );

  // Owner: P06.
  // Source: actor-engine.test.ts:479 "accepts a 64-command FIFO prefix and activates one consumer behind a barrier".
  // Source: actor-engine.test.ts:525 "abandons without delivering buffered commands and rejects later sends".
  // Source: actor-engine.test.ts:2681 "abandons a prepared engine without publication".
  // Contract/correction: ARCH-012; refactor.md ActorEngine preparation and mailbox.
  // Setup: Prepared actors with one command buffered before activation or abandonment.
  // Action: Observe it before activation, then activate one variant and abandon another; attempt send and activation after abandonment.
  // Observable result: Buffered commands produce no user work or publication before activation; activation runs the accepted prefix once; sends after abandonment reject.
  // Failure/cleanup: Abandonment publishes no cut, rejects the pending acknowledgement, and rejects later activation and send.
  it.effect("RN-ACTOR-022 prepared actor work remains inert until activation", () =>
    Effect.gen(function* () {
      const event = Result.getOrThrow(CounterDefinition.E.go(1));

      const installed = yield* makeActorFixture({
        machine: CounterMachine,
        initial: counterSnapshot(),
      });

      assert.ok(Result.isSuccess(installed.prepared.send(event)));
      assert.strictEqual(installed.prepared.snapshot().memory.count, 0);
      assert.strictEqual(installed.journal.sequence(), 0);
      const actor = yield* installed.prepared.activate();
      yield* actor.flush();
      assert.strictEqual(actor.snapshot().memory.count, 1);
      yield* installed.close();

      const abandoned = yield* makeActorFixture({
        machine: CounterMachine,
        initial: counterSnapshot(),
      });

      const pending = abandoned.prepared.dispatch(event);
      yield* abandoned.prepared.abandon();
      assert.ok(Exit.isFailure(yield* Effect.exit(pending)));
      assert.ok(Exit.isFailure(yield* Effect.exit(abandoned.prepared.activate())));
      assert.ok(Result.isFailure(abandoned.prepared.send(event)));
      assert.strictEqual(abandoned.journal.sequence(), 0);
      yield* abandoned.close();
    }),
  );
});
