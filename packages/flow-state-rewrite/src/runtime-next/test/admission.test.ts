import { assert, describe, it } from "@effect/vitest";
import { Cause, Effect, Exit, Fiber, Option, Result, Scope } from "effect";

import { definition } from "../../definition/definition.js";
import { Failure } from "../../diagnostic/diagnostic.js";
import { machine } from "../../machine/machine.js";
import { makeActorLease } from "../actor/actor-lease.js";
import {
  makeActorDirectory,
  reserveLocalPosition,
  reserveStablePosition,
  type ActorAdmissionPosition,
} from "../actor/actor-directory.js";

const ExampleDefinition = definition({
  id: "runtime-next/actor-directory",
  states: ["idle"],
  events: {},
});

const ExampleMachine = Result.getOrThrow(
  machine(ExampleDefinition, ({ S }) => ({ default: S.idle, states: { idle: {} } })),
);

const ForeignDefinition = definition({
  id: "runtime-next/actor-directory-foreign",
  states: ["idle"],
  events: {},
});

const ForeignMachine = Result.getOrThrow(
  machine(ForeignDefinition, ({ S }) => ({ default: S.idle, states: { idle: {} } })),
);

const stableRef = (id: string) => ({ machine: ExampleMachine, id, persist: false }) as const;

const created = <Actor>(position: ActorAdmissionPosition<Actor>) => {
  assert.strictEqual(position._tag, "create");

  if (position._tag !== "create") throw new Error("expected a new reservation");

  return position.reservation;
};

const found = <Actor>(
  directory: ReturnType<typeof makeActorDirectory<Actor>>,
  ref: Parameters<typeof directory.find>[0],
) => {
  const result = Result.getOrThrow(directory.find(ref));

  if (Option.isNone(result)) throw new Error("expected an active registration");

  return result.value;
};

describe("runtime-next admission", () => {
  // Owner: P03.
  // Source: actor-admission.test.ts:354 "does not reuse an incarnation after reservation rollback or disposal".
  // Source: actor-admission.test.ts:374 "releases a tombstoned actor reference when deterministic GC is available".
  // Source: actor-admission.test.ts:1273 "rejects duplicate actor identity without replacing its lease".
  // Source: actor-admission.test.ts:1294 "preserves tombstones across actor reincarnation".
  // Contract/correction: HOST-002; API-011; refactor.md ActorDirectory.
  // Setup: A stable reservation in one ActorDirectory and a separate directory incarnation.
  // Action: Reserve, install, activate, attempt duplicate reservation, retire, then reserve in each directory.
  // Observable result: The active registration remains intact on duplicate; a retired stable ref is tombstoned only in its owning directory.
  // Failure/cleanup: Same-directory retry reports DisposedActorRef; another directory can reserve without stale authority.
  it.effect("RN-ADMIT-001 stable refs reject duplicates and retain tombstones", () =>
    Effect.gen(function* () {
      const first = makeActorDirectory<string>({ machines: [ExampleMachine] });
      const second = makeActorDirectory<string>({ machines: [ExampleMachine] });
      const ref = stableRef("shared");
      const reservation = created(Result.getOrThrow(first.reserve({ kind: "stable", ref })));
      assert.ok(Result.isSuccess(first.install(reservation, "first actor")));
      const registration = yield* first.activate(reservation);

      const duplicate = Result.getOrThrow(first.reserve({ kind: "stable", ref }));
      assert.strictEqual(duplicate._tag, "active");

      if (duplicate._tag === "active") assert.strictEqual(duplicate.registration, registration);

      assert.ok(Result.isSuccess(first.retire(registration.identity, 7)));
      const tombstoned = first.reserve({ kind: "stable", ref });
      assert.ok(Result.isFailure(tombstoned));

      if (Result.isFailure(tombstoned))
        assert.strictEqual(tombstoned.failure.code, "DisposedActorRef");
      assert.ok(Result.isFailure(first.find(ref)));

      const newRuntime = created(Result.getOrThrow(second.reserve({ kind: "stable", ref })));
      assert.notStrictEqual(newRuntime.identity.incarnation, undefined);
      assert.notStrictEqual(newRuntime.identity.key, reservation.identity.key);
    }),
  );

  // Owner: P03.
  // Source: actor-admission.test.ts:325 "keeps internal registration hidden until exposure and aborts without tombstoning".
  // Contract/correction: API-011; refactor.md ActorDirectory/ActorLease.
  // Setup: A stable reservation with two joiners and an installation gate before activation.
  // Action: Interrupt one joiner, install the winner, inspect lookup and the remaining joiner, then activate.
  // Observable result: Installation alone remains lookup-invisible and leaves the joiner pending; activation makes one registration visible and settles that joiner with it.
  // Failure/cleanup: The interrupted follower affects only itself; rollback before activation settles every remaining joiner with the same failure and permits retry.
  it.effect("RN-ADMIT-002 pending stable reservations join one registration", () =>
    Effect.gen(function* () {
      const directory = makeActorDirectory<string>({ machines: [ExampleMachine] });
      const ref = stableRef("joining");
      const leader = created(Result.getOrThrow(directory.reserve({ kind: "stable", ref })));
      const first = Result.getOrThrow(directory.reserve({ kind: "stable", ref }));
      const second = Result.getOrThrow(directory.reserve({ kind: "stable", ref }));
      assert.strictEqual(first._tag, "join");
      assert.strictEqual(second._tag, "join");

      if (first._tag !== "join" || second._tag !== "join") return;

      const interrupted = yield* first.join.pipe(Effect.forkChild);
      yield* Fiber.interrupt(interrupted);
      assert.ok(Result.isSuccess(directory.install(leader, "winner")));
      assert.ok(Option.isNone(Result.getOrThrow(directory.find(ref))));
      const installedJoin = Result.getOrThrow(directory.reserve({ kind: "stable", ref }));
      assert.strictEqual(installedJoin._tag, "join");
      const active = yield* directory.activate(leader);
      assert.strictEqual((yield* second.join).actor, "winner");

      if (installedJoin._tag === "join") assert.strictEqual(yield* installedJoin.join, active);
      assert.strictEqual(found(directory, ref), active);

      const failedRef = stableRef("rollback");

      const failedLeader = created(
        Result.getOrThrow(directory.reserve({ kind: "stable", ref: failedRef })),
      );

      const failedJoin = Result.getOrThrow(directory.reserve({ kind: "stable", ref: failedRef }));
      assert.strictEqual(failedJoin._tag, "join");

      if (failedJoin._tag !== "join") return;

      const rejection = Failure({
        code: "SchemaValidation",
        path: ["actor"],
        details: {},
        summary: "Prepared actor failed",
        help: "Retry admission.",
      });

      yield* directory.rollback(failedLeader, rejection);
      const failedExit = yield* Effect.exit(failedJoin.join);
      assert.ok(Exit.isFailure(failedExit));

      if (Exit.isFailure(failedExit))
        assert.strictEqual(failedExit.cause.reasons.find(Cause.isFailReason)?.error, rejection);
      assert.notStrictEqual(
        created(Result.getOrThrow(directory.reserve({ kind: "stable", ref: failedRef }))).identity,
        failedLeader.identity,
      );
    }),
  );

  // Owner: P07.
  // Source: actor-admission.test.ts:795 "rejects a consumer-key mismatch without mutating the reserved identity".
  // Source: runtime-integration.test.ts:2367 "aborts a registered unexposed leader without tombstoning its stable ref".
  // Source: runtime-integration.test.ts:2440 "rolls back lifecycle rejection after internal registration".
  // Source: runtime-integration.test.ts:2492 "keeps exposed admission coherent when pending-clear instrumentation throws".
  // Source: runtime-integration.test.ts:2634 "rolls back an interrupted assembled admission leader".
  // Source: runtime-integration.test.ts:2712 "closes a prepared actor Scope on failure before retry".
  // Source: runtime-integration.test.ts:2784 "keeps admission test instrumentation isolated per runtime construction".
  // Contract/correction: STD-06/08; refactor.md actor admission transaction.
  // Setup: A stable or local actor with owner dependencies that can fail or be interrupted at each fallible admission stage.
  // Action: Attempt assembly under each failure, then retry the same stable ref.
  // Observable result: No actor, pending join, context edge, evidence credit, scope, timer, work, or stream escapes failed admission.
  // Failure/cleanup: Acquired resources clean up once in reverse ownership order; retry succeeds with a fresh valid incarnation.
  it.todo("RN-ADMIT-003 failed admission rolls back every acquired owner token");

  // Owner: P07.
  // Source: actor-admission.test.ts:410 "decodes one exact envelope without decoding or executing input and selectors".
  // Source: actor-admission.test.ts:455 "contains hostile reflection without mutating admission state".
  // Source: actor-admission.test.ts:516 "maps own-key, descriptor, prototype, and property traps to typed admission failures".
  // Source: actor-admission.test.ts:591 "maps hostile thrown causes without escaping diagnostic conversion".
  // Source: actor-admission.test.ts:832 "rejects a consumer-key mismatch before empty context validation".
  // Source: actor-admission.test.ts:1230 "prepares one actor with exact nominal identities".
  // Source: actor-admission.test.ts:1250 "rejects a foreign machine before registry mutation".
  // Source: actor-admission.test.ts:1485 "rejects a context slot outside the consumer vocabulary".
  // Source: actor-admission.test.ts:1990 "contains hostile reflection during actor admission".
  // Source: runtime-integration.test.ts:645 "captures actor options before admission and preserves failed reservations".
  // Source: runtime-integration.test.ts:2854 "validates malformed admission before stable allocation".
  // Source: runtime-integration.test.ts:2903 "turns hostile overload proxies into typed admission failures".
  // Source: runtime-integration.test.ts:2964 "rolls back malformed local admission before allocation publication".
  // Contract/correction: STD-03; refactor.md final facade and actor admission transaction.
  // Setup: Caller-owned options with mutation, malformed reflection, and hostile proxy variants.
  // Action: Call createActor or ensureActor, mutate inputs, then run the Effect.
  // Observable result: Only the captured validated values affect the actor, and malformed inputs return SchemaValidation diagnostics.
  // Failure/cleanup: No identity allocation or visible actor occurs for rejected input; retry is possible.
  it.todo("RN-ADMIT-004 actor start options are captured and validated before allocation");

  // Owner: P03.
  // Source: actor-admission.test.ts:293 "allocates runtime-local stable keys and fresh local identities".
  // Contract/correction: HOST-002; approved correction 4; refactor.md ActorDirectory.
  // Frozen outcome: Frozen provenance and attachment authority used private registry or process-global state.
  // Required new outcome: Each runtime owns its stable and local ref authority and rejects public lookup of local refs.
  // Setup: One stable registration and multiple local directory reservations.
  // Action: Reserve or find the stable ref, then reserve and retire local identities.
  // Observable result: The stable reservation resolves to its active registration; local identities remain distinct and directory lookup rejects invalid local authority.
  // Failure/cleanup: Disposal removes local authority; no process-global ref state leaks between runtimes.
  it.effect("RN-ADMIT-005 stable and local refs have distinct lookup authority", () =>
    Effect.gen(function* () {
      const first = makeActorDirectory<string>({ machines: [ExampleMachine] });
      const second = makeActorDirectory<string>({ machines: [ExampleMachine] });
      const stable = stableRef("stable");

      const stableToken = created(
        Result.getOrThrow(first.reserve({ kind: "stable", ref: stable })),
      );

      const localOne = created(
        Result.getOrThrow(first.reserve({ kind: "local", machine: ExampleMachine })),
      );

      const localTwo = created(
        Result.getOrThrow(first.reserve({ kind: "local", machine: ExampleMachine })),
      );

      assert.notStrictEqual(localOne.identity.ref, localTwo.identity.ref);
      assert.notStrictEqual(localOne.identity.key, localTwo.identity.key);
      assert.ok(Result.isFailure(first.find(localOne.identity.ref)));
      assert.ok(Result.isFailure(second.find(localOne.identity.ref)));
      assert.ok(Result.isFailure(first.reserve({ kind: "local", machine: ForeignMachine })));
      assert.ok(Result.isSuccess(first.install(stableToken, "stable actor")));
      assert.ok(Result.isSuccess(first.install(localOne, "local actor")));
      yield* first.activate(stableToken);
      const localActive = yield* first.activate(localOne);
      assert.ok(Option.isSome(Result.getOrThrow(first.find(stable))));
      assert.ok(Result.isSuccess(first.retire(localActive.identity, 1)));
      assert.ok(Result.isFailure(first.find(localOne.identity.ref)));
      assert.ok(Option.isNone(Result.getOrThrow(second.find(stable))));
      yield* first.rollback(
        localTwo,
        Failure({
          code: "SchemaValidation",
          path: [],
          details: {},
          summary: "abort",
          help: "retry",
        }),
      );
    }),
  );

  // Owner: P03.
  // Source: runtime.test.ts:300 "derives stable tuple keys without consuming identity allocation".
  // Contract/correction: HOST-002; STD-10/12; refactor.md ActorDirectory.
  // Setup: Stable refs containing separators that could collide under concatenation.
  // Action: Reserve and find each ref through ActorDirectory.
  // Observable result: Each identity resolves to its own registration with no collision.
  // Failure/cleanup: Retirement or rollback of one identity cannot affect another.
  it.effect("RN-ADMIT-006 delimiter-heavy identities do not alias", () =>
    Effect.gen(function* () {
      const directory = makeActorDirectory<string>({ machines: [ExampleMachine] });
      const firstRef = stableRef("a/b:c|d");
      const secondRef = stableRef("a/b:c|d/extra");

      const first = created(
        Result.getOrThrow(directory.reserve({ kind: "stable", ref: firstRef })),
      );

      const second = created(
        Result.getOrThrow(directory.reserve({ kind: "stable", ref: secondRef })),
      );

      assert.notStrictEqual(first.identity.key, second.identity.key);
      assert.ok(Result.isSuccess(directory.install(first, "one")));
      assert.ok(Result.isSuccess(directory.install(second, "two")));
      yield* directory.activate(first);
      yield* directory.activate(second);
      assert.strictEqual(found(directory, firstRef).actor, "one");
      assert.strictEqual(found(directory, secondRef).actor, "two");
      assert.ok(Result.isSuccess(directory.retire(first.identity, 2)));
      assert.strictEqual(found(directory, secondRef).actor, "two");
    }),
  );

  // Owner: P03.
  // Source: actor-admission.test.ts:871 "rejects missing, stale, foreign, duplicate, and tombstoned claims without mutation".
  // Contract/correction: HOST-002; STD-01/10; refactor.md ActorDirectory.
  // Setup: A stable directory identity retired and replaced in a later valid incarnation.
  // Action: Present old and current directory-issued fence tokens to lookup or reservation operations.
  // Observable result: Only current authority can find or retire the replacement; the old fence is stale even when the stable key matches.
  // Failure/cleanup: Old authority rejects without mutating or retiring the replacement.
  it.effect("RN-ADMIT-007 retired actor fences cannot authorize a replacement", () =>
    Effect.gen(function* () {
      const ref = stableRef("fenced");
      const first = makeActorDirectory<string>({ machines: [ExampleMachine] });
      const second = makeActorDirectory<string>({ machines: [ExampleMachine] });
      const oldToken = created(Result.getOrThrow(first.reserve({ kind: "stable", ref })));
      assert.ok(Result.isSuccess(first.install(oldToken, "old")));
      yield* first.activate(oldToken);
      assert.ok(Result.isSuccess(first.retire(oldToken.identity, 1)));
      const current = created(Result.getOrThrow(second.reserve({ kind: "stable", ref })));
      assert.ok(Result.isSuccess(second.install(current, "current")));
      yield* second.activate(current);
      assert.ok(Result.isFailure(second.retire(oldToken.identity, 2)));
      assert.ok(Result.isFailure(first.retire(current.identity, 2)));
      assert.strictEqual(found(second, ref).actor, "current");
    }),
  );

  // Owner: P03.
  // Source: actor-admission.test.ts:400 "fails before counter wrap without a partial identity".
  // Contract/correction: STD-10; refactor.md ActorDirectory owner proof matrix.
  // Setup: A directory near its checked stable or local allocation limit.
  // Action: Attempt one more actor reservation through the narrow owner port.
  // Observable result: Overflow returns a stable typed diagnostic and no partial identity is published.
  // Failure/cleanup: Prior refs remain valid and failed reservation leaves no pending join or lease.
  it("RN-ADMIT-008 actor allocation counters reject overflow before mutation", () => {
    const max = Number.MAX_SAFE_INTEGER;

    const stableState: Parameters<typeof reserveStablePosition<string>>[0] = {
      runtimeId: "near-limit-proof",
      stable: new Map(),
      incarnation: { next: max, exhausted: false },
    };

    const prior = Result.getOrThrow(reserveStablePosition(stableState, stableRef("prior")));
    const priorSlot = stableState.stable.get(ExampleMachine)?.get("prior");
    assert.strictEqual(prior.reservation.identity.incarnation, max);
    assert.strictEqual(priorSlot?._tag, "pending");

    const stableFailure = reserveStablePosition(stableState, stableRef("overflow"));
    assert.ok(Result.isFailure(stableFailure));

    if (Result.isFailure(stableFailure)) {
      assert.strictEqual(stableFailure.failure.code, "SchemaValidation");
      assert.strictEqual(stableFailure.failure.summary, "Actor identity allocation is exhausted");
    }

    assert.strictEqual(stableState.stable.get(ExampleMachine)?.get("overflow"), undefined);
    assert.strictEqual(stableState.stable.get(ExampleMachine)?.get("prior"), priorSlot);
    assert.deepStrictEqual(stableState.incarnation, { next: max, exhausted: true });

    const localState: Parameters<typeof reserveLocalPosition<string>>[0] = {
      runtimeId: "near-limit-proof",
      local: new Map(),
      recycledLocalOrdinals: [],
      incarnation: { next: max - 1, exhausted: false },
      localOrdinal: { next: max, exhausted: false },
    };

    const localPrior = Result.getOrThrow(reserveLocalPosition(localState, ExampleMachine));
    assert.strictEqual(localPrior.reservation.identity.kind, "local");

    if (localPrior.reservation.identity.kind !== "local") return;
    const localRef = localPrior.reservation.identity.ref;
    const localSlot = localState.local.get(localRef);
    assert.strictEqual(localSlot?._tag, "reserved");
    assert.strictEqual(localState.local.size, 1);

    const localFailure = reserveLocalPosition(localState, ExampleMachine);
    assert.ok(Result.isFailure(localFailure));

    if (Result.isFailure(localFailure)) {
      assert.strictEqual(localFailure.failure.code, "SchemaValidation");
      assert.strictEqual(localFailure.failure.summary, "Actor identity allocation is exhausted");
    }

    assert.strictEqual(localState.local.size, 1);
    assert.strictEqual(localState.local.get(localRef), localSlot);
    assert.deepStrictEqual(localState.incarnation, { next: max, exhausted: false });
    assert.deepStrictEqual(localState.localOrdinal, { next: max, exhausted: true });
  });

  // Owner: P03.
  // Source: actor-admission.test.ts:1558 "blocks individual disposal while dependent edges remain".
  // Source: lifecycle.test.ts:1013 "blocks disposal while a dependent edge remains".
  // Source: lifecycle.test.ts:2429 "blocks lifecycle disposal while dependent edges remain".
  // Contract/correction: HOST-002; refactor.md ActorLease.
  // Setup: An ActorLease with an owner preflight that reports one retained dependency.
  // Action: Run disposal while preflight blocks it, clear the dependency, then run disposal again.
  // Observable result: First attempt is typed-blocked before a terminal claim; second succeeds after the owner preflight allows it.
  // Failure/cleanup: No failed preflight starts cleanup, and final cleanup is cached once.
  it.effect("RN-ADMIT-009 dependency preflight blocks lease disposal", () =>
    Effect.gen(function* () {
      const directory = makeActorDirectory<string>({ machines: [ExampleMachine] });
      const ownerScope = yield* Scope.make();
      const ref = stableRef("provider");
      const reservation = created(Result.getOrThrow(directory.reserve({ kind: "stable", ref })));
      let dependent = true;
      let cleanupCount = 0;

      const lease = makeActorLease({
        actor: "provider actor",
        ownerScope,
        preflight: () =>
          dependent
            ? Effect.fail(
                Failure({
                  code: "BlockedByDependents",
                  path: ["context"],
                  details: {},
                  summary: "Provider retains a dependent",
                  help: "Dispose the dependent first.",
                }),
              )
            : Effect.void,
        cleanup: () => Effect.sync(() => void (cleanupCount += 1)),
        retire: () => Effect.fromResult(directory.retire(reservation.identity, 1)),
      });

      assert.ok(Result.isSuccess(directory.install(reservation, lease.actor)));
      yield* directory.activate(reservation);

      const blocked = yield* Effect.exit(lease.dispose());
      assert.ok(Exit.isFailure(blocked));
      assert.strictEqual(cleanupCount, 0);
      assert.strictEqual(found(directory, ref).actor, "provider actor");
      dependent = false;
      yield* lease.dispose();
      assert.strictEqual(cleanupCount, 1);
      assert.ok(Result.isFailure(directory.find(ref)));
      yield* Scope.close(ownerScope, Exit.void);
    }),
  );

  // Owner: P07.
  // Source: actor-ref.test.ts:160 "returns inert identity and persistence metadata".
  // Source: actor-ref.test.ts:187 "captures options independently for each ActorRef".
  // Source: actor-ref.test.ts:197 "rejects unconstructed machines and invalid authored stable IDs".
  // Source: actor-ref.test.ts:205 "preserves machine-before-id admission precedence".
  // Source: actor-ref.test.ts:212 "rejects malformed options at the runtime boundary".
  // Contract/correction: API-011; STD-03; refactor.md final runtime facade.
  // Setup: A compiled machine, valid stable ID, and mutable authored options.
  // Action: Construct multiple refs, mutate options, and try malformed machine/ID/options.
  // Observable result: Each ref captures its own machine, ID, persistence identity and carries no actor work or disposal authority; invalid calls yield typed diagnostics.
  // Failure/cleanup: Malformed input does not allocate an actor or start runtime readiness.
  it.todo("RN-ADMIT-010 actor refs are inert captured identity values");

  // Owner: P03.
  // Source: actor-admission.test.ts:1086 "joins lease disposal and caches failed cleanup without tombstoning".
  // Source: actor-admission.test.ts:1845 "caches one failed actor disposal attempt through runtime close".
  // Source: actor-admission.test.ts:2017 "constructing a disposal Effect does not reserve a cleanup attempt".
  // Source: actor-admission.test.ts:2067 "preserves repeated cleanup failures in execution order".
  // Source: lifecycle.test.ts:1122 "continues reverse cleanup after a finalizer failure".
  // Source: lifecycle.test.ts:1263 "caches failed post-start disposal without retrying cleanup".
  // Source: lifecycle.test.ts:1346 "caches the combined lifecycle and evidence Cause after disposal".
  // Source: lifecycle.test.ts:1423 "retains reverse cleanup Cause lanes and caches the combined terminal outcome".
  // Source: lifecycle.test.ts:1664 "blocks routing during active cleanup and reopens it after a failed cleanup".
  // Source: lifecycle.test.ts:2259 "keeps disposed lifecycle terminal and idempotent".
  // Source: lifecycle.test.ts:2289 "retains cleanup failure Cause on terminal disposal".
  // Source: lifecycle.test.ts:2322 "continues reverse cleanup after a finalizer defect".
  // Source: lifecycle.test.ts:2843 "linearizes repeated disposal during finalization".
  // Source: lifecycle.test.ts:2885 "keeps failed resource cleanup visible across repeated disposal".
  // Source: lifecycle.test.ts:3105 "retains a mixed cleanup Cause without retrying failed stages".
  // Contract/correction: API-011; STD-08; refactor.md ActorLease.
  // Setup: An exposed lease with gated or failing cleanup stages.
  // Action: Construct a dispose Effect without running it, then run concurrent or repeated disposals.
  // Observable result: Construction starts no cleanup; execution claims one terminal attempt and all callers join its ordered complete Exit.
  // Failure/cleanup: Failed cleanup is cached without retiring a live registration; successful cleanup retires its directory authority.
  it.effect("RN-ADMIT-011 actor lease disposal is lazy and caches its full Exit", () =>
    Effect.gen(function* () {
      const directory = makeActorDirectory<string>({ machines: [ExampleMachine] });
      const ownerScope = yield* Scope.make();
      const ref = stableRef("failed-cleanup");
      const reservation = created(Result.getOrThrow(directory.reserve({ kind: "stable", ref })));
      let cleanupCount = 0;
      let retired = 0;

      const failure = Failure({
        code: "CleanupFailed",
        path: ["actor"],
        details: {},
        summary: "Actor cleanup failed",
        help: "Inspect the retained cleanup cause.",
      });

      const lease = makeActorLease({
        actor: "actor",
        ownerScope,
        preflight: () => Effect.void,
        cleanup: () =>
          Effect.sync(() => void (cleanupCount += 1)).pipe(Effect.andThen(Effect.fail(failure))),
        retire: () =>
          Effect.sync(() => void (retired += 1)).pipe(
            Effect.andThen(Effect.fromResult(directory.retire(reservation.identity, 4))),
          ),
      });

      assert.ok(Result.isSuccess(directory.install(reservation, lease.actor)));
      yield* directory.activate(reservation);
      const inert = lease.dispose();
      assert.strictEqual(cleanupCount, 0);
      const first = yield* Effect.exit(inert);
      assert.ok(Exit.isFailure(first));
      assert.deepStrictEqual(yield* Effect.exit(lease.dispose()), first);
      assert.strictEqual(cleanupCount, 1);
      assert.strictEqual(retired, 0);
      assert.strictEqual(found(directory, ref).actor, "actor");
      yield* Scope.close(ownerScope, Exit.void);
    }),
  );

  // Owner: P03.
  // Source: new refactor.md ActorLease owner proof; no frozen source declaration.
  // Contract/correction: STD-08; refactor.md ActorLease cached Exit before preflight.
  // Setup: Leases whose first terminal cleanup succeeds or fails, with a preflight that later changes to reject disposal.
  // Action: Complete the first disposal, make preflight reject, then dispose again.
  // Observable result: Each repeated call returns its original complete terminal Exit without running the later preflight or cleanup again.
  // Failure/cleanup: A failed first cleanup remains cached without retirement; a successful first cleanup remains retired.
  it.effect("RN-ADMIT-012 cached lease disposal wins before a later preflight", () =>
    Effect.gen(function* () {
      for (const failCleanup of [false, true]) {
        const directory = makeActorDirectory<string>({ machines: [ExampleMachine] });
        const ownerScope = yield* Scope.make();
        const ref = stableRef(`cached-${failCleanup}`);
        const reservation = created(Result.getOrThrow(directory.reserve({ kind: "stable", ref })));
        let blockPreflight = false;
        let preflights = 0;
        let cleanups = 0;

        const lease = makeActorLease({
          actor: "actor",
          ownerScope,
          preflight: () => {
            preflights += 1;

            return blockPreflight
              ? Effect.fail(
                  Failure({
                    code: "BlockedByDependents",
                    path: [],
                    details: {},
                    summary: "blocked",
                    help: "clear dependency",
                  }),
                )
              : Effect.void;
          },
          cleanup: () => {
            cleanups += 1;

            return failCleanup
              ? Effect.fail(
                  Failure({
                    code: "CleanupFailed",
                    path: [],
                    details: {},
                    summary: "cleanup failed",
                    help: "inspect cause",
                  }),
                )
              : Effect.void;
          },
          retire: () => Effect.fromResult(directory.retire(reservation.identity, 5)),
        });

        assert.ok(Result.isSuccess(directory.install(reservation, lease.actor)));
        yield* directory.activate(reservation);
        const first = yield* Effect.exit(lease.dispose());
        blockPreflight = true;
        assert.deepStrictEqual(yield* Effect.exit(lease.dispose()), first);
        assert.strictEqual(preflights, 1);
        assert.strictEqual(cleanups, 1);

        if (failCleanup) assert.strictEqual(found(directory, ref).actor, "actor");
        else assert.ok(Result.isFailure(directory.find(ref)));
        yield* Scope.close(ownerScope, Exit.void);
      }
    }),
  );
});
