import { assert, describe, it } from "@effect/vitest";
import { Cause, Deferred, Effect, Exit, Fiber, Option, Result, Scope, Stream } from "effect";
import { TestClock } from "effect/testing";

import { Failure } from "../../diagnostic/diagnostic.js";
import { makeActorLease } from "../actor/actor-lease.js";
import { planLifecycleTransition } from "../actor/lifecycle.js";
import { stopTimerClaims } from "../actor/actor-timer-work.js";
import {
  stopLifecycleWork,
  type LifecycleResource,
  type LifecycleTask,
} from "../actor/lifecycle-work.js";
import { makeContextTicket } from "../context/context-ticket.js";
import {
  CounterDefinition,
  CounterMachine,
  counterSnapshot,
  makeActorFixture,
} from "./actor-fixture.js";

describe("runtime-next lifecycle", () => {
  it.effect("shutdown reads the active lifecycle when its Effect runs", () =>
    Effect.gen(function* () {
      let releases = 0;

      const f = yield* makeActorFixture({
        machine: CounterMachine,
        initial: counterSnapshot(),
        work: {
          resources: [
            Effect.succeed({
              name: "owned",
              release: Effect.sync(() => {
                releases += 1;
              }),
              reacquire: Option.none(),
            }),
          ],
          tasks: [],
          deadlines: [],
        },
      });

      const shutdown = f.prepared.shutdown();
      const actor = yield* f.prepared.activate();
      yield* shutdown;
      yield* f.prepared.shutdown();

      assert.strictEqual(actor.snapshot().lifecycle, "disposed");
      assert.strictEqual(releases, 1);
      assert.ok(Result.isFailure(actor.send(Result.getOrThrow(CounterDefinition.E.go(1)))));
      yield* f.journal.close();
      yield* Scope.close(f.ownerScope, Exit.void);
    }),
  );

  it.effect("concurrent activation joins one acquisition and one actor", () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      let acquisitions = 0;

      const f = yield* makeActorFixture({
        machine: CounterMachine,
        initial: counterSnapshot(),
        work: {
          resources: [
            Effect.gen(function* () {
              acquisitions += 1;
              yield* Deferred.succeed(entered, undefined);
              yield* Deferred.await(release);

              return { name: "gated", release: Effect.void, reacquire: Option.none() };
            }),
          ],
          tasks: [],
          deadlines: [],
        },
      });

      const first = yield* f.prepared.activate().pipe(Effect.forkChild);
      yield* Deferred.await(entered);
      const second = yield* f.prepared.activate().pipe(Effect.forkChild);
      assert.strictEqual(acquisitions, 1);
      yield* Deferred.succeed(release, undefined);
      const firstActor = yield* Fiber.join(first);
      const secondActor = yield* Fiber.join(second);

      assert.strictEqual(firstActor, secondActor);
      assert.strictEqual(acquisitions, 1);
      assert.strictEqual(f.journal.sequence(), 1);
      yield* f.close();
    }),
  );

  it.effect("interrupting an activation waiter leaves shared activation settled", () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      let acquisitions = 0;

      const f = yield* makeActorFixture({
        machine: CounterMachine,
        initial: counterSnapshot(),
        work: {
          resources: [
            Effect.gen(function* () {
              acquisitions += 1;
              yield* Deferred.succeed(entered, undefined);
              yield* Deferred.await(release);

              return { name: "gated", release: Effect.void, reacquire: Option.none() };
            }),
          ],
          tasks: [],
          deadlines: [],
        },
      });

      const interrupted = yield* f.prepared.activate().pipe(Effect.forkChild);
      yield* Deferred.await(entered);
      const joined = yield* f.prepared.activate().pipe(Effect.forkChild);
      yield* Fiber.interrupt(interrupted);
      yield* Deferred.succeed(release, undefined);
      const actor = yield* Fiber.join(joined);

      assert.strictEqual(yield* f.prepared.activate(), actor);
      assert.strictEqual(acquisitions, 1);
      assert.strictEqual(f.journal.sequence(), 1);
      yield* f.close();
    }),
  );

  it.effect("shutdown joins an in-flight activation before terminal cleanup", () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      let releases = 0;

      const f = yield* makeActorFixture({
        machine: CounterMachine,
        initial: counterSnapshot(),
        work: {
          resources: [
            Effect.gen(function* () {
              yield* Deferred.succeed(entered, undefined);
              yield* Deferred.await(release);

              return {
                name: "gated",
                release: Effect.sync(() => {
                  releases += 1;
                }),
                reacquire: Option.none(),
              };
            }),
          ],
          tasks: [],
          deadlines: [],
        },
      });

      const starting = yield* f.prepared.activate().pipe(Effect.forkChild);
      yield* Deferred.await(entered);
      const closing = yield* f.prepared.shutdown().pipe(Effect.forkChild);
      yield* Deferred.succeed(release, undefined);
      const actor = yield* Fiber.join(starting);
      yield* Fiber.join(closing);

      assert.strictEqual(actor.snapshot().lifecycle, "disposed");
      assert.strictEqual(releases, 1);
      yield* f.journal.close();
      yield* Scope.close(f.ownerScope, Exit.void);
    }),
  );

  it.effect("activation task finalizes at shutdown while its parent Scope stays open", () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      let finalizations = 0;

      const task: Effect.Effect<LifecycleTask> = Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          Deferred.succeed(entered, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.ensuring(
              Effect.sync(() => {
                finalizations += 1;
              }),
            ),
          ),
        );

        return { name: "owned", fiber, finalize: Effect.void, reacquire: Option.none() };
      });

      const f = yield* makeActorFixture({
        machine: CounterMachine,
        initial: counterSnapshot(),
        work: { resources: [], tasks: [task], deadlines: [] },
      });

      const actor = yield* f.prepared.activate();
      yield* Deferred.await(entered);
      assert.strictEqual(finalizations, 0);
      yield* actor.shutdown();
      assert.strictEqual(actor.snapshot().lifecycle, "disposed");
      assert.strictEqual(finalizations, 1);
      yield* f.journal.close();
      assert.strictEqual(finalizations, 1);
      yield* Scope.close(f.ownerScope, Exit.void);
      assert.strictEqual(finalizations, 1);
    }),
  );

  it.effect("terminal cleanup retains duplicate releases, task failures, and timer defects", () =>
    Effect.gen(function* () {
      const timerEntered = yield* Deferred.make<void>();
      const taskEntered = yield* Deferred.make<void>();

      const repeated = Failure({
        code: "SemanticValidation",
        path: ["cleanup", "resource"],
        details: {},
        summary: "Resource release failed",
        help: "Inspect both resource releases.",
      });

      const taskFinalizerFailure = Failure({
        code: "SemanticValidation",
        path: ["cleanup", "task"],
        details: {},
        summary: "Task finalizer failed",
        help: "Inspect the task finalizer.",
      });

      const taskDefect = new Error("task interruption finalizer defect");
      const timerDefect = new Error("timer interruption finalizer defect");

      const resource = (name: string) =>
        Effect.succeed({ name, release: Effect.fail(repeated), reacquire: Option.none() });

      const task: Effect.Effect<LifecycleTask> = Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          Deferred.succeed(taskEntered, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.ensuring(Effect.failCause(Cause.die(taskDefect))),
          ),
        );

        return {
          name: "task",
          fiber,
          finalize: Effect.fail(taskFinalizerFailure),
          reacquire: Option.none(),
        };
      });

      const f = yield* makeActorFixture({
        machine: CounterMachine,
        initial: counterSnapshot(),
        work: {
          resources: [resource("first"), resource("second")],
          tasks: [task],
          deadlines: [
            {
              name: "timer",
              startedAt: 0,
              dueAt: 0,
              generation: 1,
              status: "armed",
              fire: Option.some(
                Deferred.succeed(timerEntered, undefined).pipe(
                  Effect.andThen(Effect.never),
                  Effect.ensuring(Effect.failCause(Cause.die(timerDefect))),
                ),
              ),
            },
          ],
        },
      });

      const actor = yield* f.prepared.activate();
      yield* Deferred.await(timerEntered);
      yield* Deferred.await(taskEntered);
      const shutdown = yield* Effect.exit(actor.shutdown());

      assert.ok(Exit.isFailure(shutdown));
      assert.deepStrictEqual(
        shutdown.cause.reasons.filter(Cause.isFailReason).map((reason) => reason.error),
        [taskFinalizerFailure, repeated, repeated],
      );
      assert.deepStrictEqual(
        shutdown.cause.reasons.filter(Cause.isDieReason).map((reason) => reason.defect),
        [timerDefect, taskDefect],
      );
      assert.strictEqual(actor.snapshot().lifecycle, "disposed");
      assert.ok(Result.isFailure(actor.send(Result.getOrThrow(CounterDefinition.E.go(1)))));
      const terminalObservation = yield* Stream.runCollect(actor.snapshots);
      assert.strictEqual(terminalObservation.length, 1);
      assert.strictEqual(terminalObservation[0]?.lifecycle, "disposed");
      yield* f.journal.close();
      yield* Scope.close(f.ownerScope, Exit.void);
    }).pipe(Effect.provide(TestClock.layer())),
  );

  it.effect("failed terminal cleanup closes admissions and settles queued acknowledgements", () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();

      const failure = Failure({
        code: "SemanticValidation",
        path: ["cleanup", "terminal"],
        details: {},
        summary: "Terminal resource release failed",
        help: "Inspect the resource release.",
      });

      const f = yield* makeActorFixture({
        machine: CounterMachine,
        initial: counterSnapshot(),
        work: {
          resources: [
            Effect.succeed({
              name: "failing",
              release: Deferred.succeed(entered, undefined).pipe(
                Effect.andThen(Deferred.await(release)),
                Effect.andThen(Effect.fail(failure)),
              ),
              reacquire: Option.none(),
            }),
          ],
          tasks: [],
          deadlines: [],
        },
      });

      const actor = yield* f.prepared.activate();

      const lease = makeActorLease({
        actor,
        ownerScope: f.ownerScope,
        preflight: () => Effect.void,
        cleanup: () => actor.shutdown(),
        retire: () => Effect.void,
      });

      const prior = actor.dispatch(Result.getOrThrow(CounterDefinition.E.go(1)));
      const acknowledged = yield* prior.pipe(Effect.exit, Effect.forkChild);
      const closing = yield* lease.dispose().pipe(Effect.exit, Effect.forkChild);
      yield* Deferred.await(entered);
      const joining = yield* lease.dispose().pipe(Effect.exit, Effect.forkChild);
      yield* Effect.yieldNow;
      assert.ok(Exit.isSuccess(yield* Fiber.join(acknowledged)));
      assert.ok(Result.isFailure(actor.send(Result.getOrThrow(CounterDefinition.E.go(1)))));
      assert.ok(
        Result.isFailure(
          actor.offerContext(
            makeContextTicket<typeof CounterDefinition>({
              offer: { entries: [], issueOnly: false, selectorDefects: [] },
              identity: f.identity,
              expectedRevision: actor.snapshot().revision,
              validateCurrent: () => Result.succeed(undefined),
            }).ticket,
          ),
        ),
      );

      const rejectedDispatch = yield* Effect.exit(
        actor.dispatch(Result.getOrThrow(CounterDefinition.E.go(1))),
      );

      assert.ok(Exit.isFailure(rejectedDispatch));

      yield* Deferred.succeed(release, undefined);
      const closed = yield* Fiber.join(closing);
      const joined = yield* Fiber.join(joining);

      assert.ok(Exit.isFailure(closed));
      assert.deepStrictEqual(joined, closed);
      assert.deepStrictEqual(yield* Effect.exit(lease.dispose()), closed);
      assert.ok(Exit.isSuccess(yield* Effect.exit(actor.shutdown())));
      assert.deepStrictEqual(
        closed.cause.reasons.filter(Cause.isFailReason).map((reason) => reason.error),
        [failure],
      );
      assert.strictEqual(actor.snapshot().lifecycle, "disposed");
      assert.ok(Result.isFailure(actor.send(Result.getOrThrow(CounterDefinition.E.go(1)))));
      assert.ok(
        Result.isFailure(
          actor.offerContext(
            makeContextTicket<typeof CounterDefinition>({
              offer: { entries: [], issueOnly: false, selectorDefects: [] },
              identity: f.identity,
              expectedRevision: actor.snapshot().revision,
              validateCurrent: () => Result.succeed(undefined),
            }).ticket,
          ),
        ),
      );
      const terminalObservation = yield* Stream.runCollect(actor.snapshots);
      assert.strictEqual(terminalObservation[0]?.lifecycle, "disposed");
      assert.strictEqual(terminalObservation.length, 1);
      yield* f.journal.close();
      yield* Scope.close(f.ownerScope, Exit.void);
    }),
  );

  it.effect("direct shutdown callers share cleanup after one waiter is interrupted", () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      let releases = 0;

      const f = yield* makeActorFixture({
        machine: CounterMachine,
        initial: counterSnapshot(),
        work: {
          resources: [
            Effect.succeed({
              name: "gated release",
              release: Effect.gen(function* () {
                releases += 1;
                yield* Deferred.succeed(entered, undefined);
                yield* Deferred.await(release);
              }),
              reacquire: Option.none(),
            }),
          ],
          tasks: [],
          deadlines: [],
        },
      });

      const actor = yield* f.prepared.activate();
      const first = yield* actor.shutdown().pipe(Effect.forkChild);
      yield* Deferred.await(entered);
      const interrupted = yield* actor.shutdown().pipe(Effect.forkChild);
      yield* Effect.yieldNow;
      yield* Fiber.interrupt(interrupted);
      assert.strictEqual(releases, 1);
      assert.ok(Result.isFailure(actor.send(Result.getOrThrow(CounterDefinition.E.go(1)))));
      yield* Deferred.succeed(release, undefined);
      yield* Fiber.join(first);
      yield* actor.shutdown();
      assert.strictEqual(releases, 1);
      assert.strictEqual(actor.snapshot().lifecycle, "disposed");
      yield* f.journal.close();
      yield* Scope.close(f.ownerScope, Exit.void);
    }),
  );

  // Owner: P06.
  // Source: lifecycle.test.ts:272 "restores before explicit start and creates no synthetic lifecycle work".
  // Source: lifecycle.test.ts:312 "keeps lifecycle snapshots value-only and requires their stable ActorCell".
  // Source: lifecycle.test.ts:332 "installs admitted metadata before start and retains it across lifecycle states".
  // Source: lifecycle.test.ts:1546 "rejects a stale same-revision snapshot from overwriting canonical dependencies".
  // Source: lifecycle.test.ts:1590 "rejects older raw metadata helpers without resurrecting active or disposed state".
  // Source: lifecycle.test.ts:2033 "retains a failed suspended state in the serialized controller".
  // Source: lifecycle.test.ts:2116 "activates a prepared actor through one lifecycle command".
  // Source: lifecycle.test.ts:2245 "routes retained pre-transition snapshots through the current owner state".
  // Source: lifecycle.test.ts:2741 "restores prepared lifecycle before explicit activation".
  // Source: lifecycle.test.ts:2794 "disposes an empty lifecycle without synthetic work".
  // Contract/correction: SEM-024; SNAP-001; refactor.md ActorEngine lifecycle.
  // Setup: Fresh, restored, and empty actors with observed lifecycle snapshots.
  // Action: Start, suspend, resume, and dispose through supported commands.
  // Observable result: Only legal transitions publish; restore retains its prepared baseline before explicit activation and no synthetic work appears.
  // Failure/cleanup: Stale commands reject without resurrecting active or disposed state; close releases every actor scope.
  it.effect("RN-LIFECYCLE-001 restored actors enter one legal lifecycle path", () =>
    Effect.gen(function* () {
      const f = yield* makeActorFixture({
        machine: CounterMachine,
        initial: { ...counterSnapshot(), revision: 5 },
        initialMachineTurnRevision: 3,
        restored: true,
      });

      assert.strictEqual(f.prepared.snapshot().lifecycle, "prepared");
      assert.strictEqual(f.journal.sequence(), 0);
      const actor = yield* f.prepared.activate();

      assert.strictEqual(actor.snapshot().revision, 7);
      assert.strictEqual(actor.snapshot().lifecycle, "active");
      assert.strictEqual(f.journal.sequence(), 2);
      assert.ok(
        Exit.isFailure(
          yield* Effect.exit(
            actor.transitionLifecycle({
              to: "active",
              cause: { kind: "fresh" },
            }),
          ),
        ),
      );
      assert.strictEqual(actor.snapshot().revision, 7);
      yield* actor.transitionLifecycle({ to: "suspended", cause: { kind: "attachment" } });
      yield* actor.transitionLifecycle({ to: "active", cause: { kind: "attachment" } });
      assert.strictEqual(actor.snapshot().revision, 9);
      yield* f.close();
      assert.strictEqual(actor.snapshot().lifecycle, "disposed");
    }),
  );

  // Owner: P06.
  // Source: lifecycle.test.ts:505 "activates, cancels work, and cleans resources in reverse ownership order".
  // Source: lifecycle.test.ts:552 "reacquires continuing resources and work on each resume".
  // Source: lifecycle.test.ts:635 "rolls back earlier reacquisition when continuing work cannot be restored".
  // Source: lifecycle.test.ts:693 "retains absolute timer deadlines and schedules each armed timer once on resume".
  // Source: lifecycle.test.ts:2135 "suspends after cancelling owned work".
  // Source: lifecycle.test.ts:2175 "resumes retained lifecycle data without duplicate work".
  // Source: lifecycle.test.ts:2205 "disposes active work before lifecycle resources".
  // Source: lifecycle.test.ts:2368 "fulfills interrupted work completion during suspension".
  // Source: lifecycle.test.ts:2398 "keeps resource cleanup in lifecycle attachment order".
  // Source: lifecycle.test.ts:2556 "retains absolute timer deadlines across suspension".
  // Source: lifecycle.test.ts:2938 "uses the provided Clock for retained timer deadlines across suspension".
  // Source: lifecycle.test.ts:3041 "does not replay an interrupted overdue retained timer claim".
  // Source: turn-plan.test.ts:858 "retains absolute timer deadlines in the candidate plan".
  // Contract/correction: SEM-024; STD-08; refactor.md ActorEngine lifecycle and activities.
  // Setup: An actor with two continuing resources, one task, and one absolute timer under TestClock.
  // Action: Suspend during task work, advance to the timer deadline, fail one resume, retry resume, then dispose.
  // Observable result: Suspension settles the task; successful resume reacquires resources and work and fires the overdue timer once.
  // Failure/cleanup: Failed reacquisition rolls back earlier work and stays suspended; finalizers run in reverse ownership order.
  it.effect("RN-LIFECYCLE-002 suspension and resume own work, resources, and timer deadlines", () =>
    Effect.gen(function* () {
      const order: string[] = [];
      let acquisitions = 0;
      let taskStarts = 0;
      let fires = 0;
      let failSecond = false;

      // RETURN_TYPE: Recursive reacquisition keeps its resource and diagnostic Effect channels fixed.
      const reacquire = (
        name: string,
      ): Effect.Effect<LifecycleResource, ReturnType<typeof Failure>> =>
        Effect.suspend(() => {
          if (name === "second" && failSecond) {
            failSecond = false;

            return Effect.fail(
              Failure({
                code: "MissingContextProvider",
                path: ["resource", name],
                details: {},
                summary: "Resource reacquisition failed",
                help: "Retry resume after the provider recovers.",
              }),
            );
          }

          acquisitions += 1;

          return Effect.succeed({
            name,
            release: Effect.sync(() => {
              order.push(`release:${name}`);
            }),
            reacquire: Option.some(Effect.suspend(() => reacquire(name))),
          });
        });

      // RETURN_TYPE: The task reacquires itself, so inference is recursive at this test fixture boundary.
      const acquireTask = (): Effect.Effect<LifecycleTask> =>
        Effect.gen(function* () {
          taskStarts += 1;

          const fiber = yield* Effect.forkChild(
            Effect.never.pipe(
              Effect.ensuring(
                Effect.sync(() => {
                  order.push("interrupt:task");
                }),
              ),
            ),
          );

          return {
            name: "task",
            fiber,
            finalize: Effect.sync(() => {
              order.push("finalize:task");
            }),
            reacquire: Option.some(Effect.suspend(acquireTask)),
          };
        });

      const f = yield* makeActorFixture({
        machine: CounterMachine,
        initial: { ...counterSnapshot(), timers: [{ name: "retained", startedAt: 0, dueAt: 100 }] },
        work: {
          resources: [reacquire("first"), reacquire("second")],
          tasks: [acquireTask()],
          deadlines: [
            {
              name: "retained",
              startedAt: 0,
              dueAt: 100,
              generation: 1,
              status: "armed",
              fire: Option.some(
                Effect.sync(() => {
                  fires += 1;
                }),
              ),
            },
          ],
        },
      });

      const actor = yield* f.prepared.activate();
      assert.deepStrictEqual([acquisitions, taskStarts], [2, 1]);
      yield* TestClock.adjust(40);
      yield* actor.transitionLifecycle({ to: "suspended", cause: { kind: "attachment" } });
      assert.deepStrictEqual(order, [
        "interrupt:task",
        "finalize:task",
        "release:second",
        "release:first",
      ]);
      yield* TestClock.adjust(60);
      assert.strictEqual(fires, 0);
      failSecond = true;

      const rejected = yield* Effect.exit(
        actor.transitionLifecycle({ to: "active", cause: { kind: "attachment" } }),
      );

      assert.ok(Exit.isFailure(rejected));
      assert.strictEqual(actor.snapshot().lifecycle, "suspended");
      assert.strictEqual(order.at(-1), "release:first");
      yield* actor.transitionLifecycle({ to: "active", cause: { kind: "attachment" } });
      yield* Effect.yieldNow;
      assert.strictEqual(fires, 1);
      assert.strictEqual(taskStarts, 2);
      assert.deepStrictEqual(actor.snapshot().timers, [
        { name: "retained", startedAt: 0, dueAt: 100 },
      ]);
      yield* f.close();
      assert.deepStrictEqual(order.slice(-4), [
        "interrupt:task",
        "finalize:task",
        "release:second",
        "release:first",
      ]);
    }).pipe(Effect.provide(TestClock.layer())),
  );

  // Owner: P06.
  // Source: lifecycle.test.ts:791 "rejects resume across a provider fence change".
  // Source: lifecycle.test.ts:837 "rejects resume when the live provider registry is absent".
  // Source: lifecycle.test.ts:887 "rejects resume against a foreign runtime provider".
  // Source: lifecycle.test.ts:951 "rejects resume after the provider runtime tombstones the identity".
  // Source: lifecycle.test.ts:1164 "serializes changed provider reconciliation and suppresses equal values".
  // Source: lifecycle.test.ts:1203 "queues a latest provider value equal to committed truth during an in-flight wave".
  // Source: lifecycle.test.ts:2457 "retains context dependencies across suspension".
  // Source: lifecycle.test.ts:2508 "rejects resume with a stale dependency fence".
  // Contract/correction: SEM-026; refactor.md ContextCoordinator and ActorEngine lifecycle.
  // Setup: A provider and dependent actor with one gated context wave.
  // Action: Suspend dependent, change provider twice including a return to a prior value, then attempt resume.
  // Observable result: Changed values reconcile serially, equal repeats coalesce, and resume uses the current provider fence and complete context.
  // Failure/cleanup: Missing, foreign, tombstoned, or stale provider authority rejects resume without partial activation.
  it.effect("RN-LIFECYCLE-003 provider changes reconcile before dependent resume", () =>
    Effect.gen(function* () {
      const stale = Failure({
        code: "MissingContextProvider",
        path: ["provider"],
        details: {},
        summary: "Provider cut is stale",
        help: "Capture the current provider fence before resume.",
      });

      let current = true;

      const f = yield* makeActorFixture({
        machine: CounterMachine,
        initial: counterSnapshot(),
        validateProviders: Effect.suspend(() => (current ? Effect.void : Effect.fail(stale))),
      });

      const actor = yield* f.prepared.activate();
      yield* actor.transitionLifecycle({ to: "suspended", cause: { kind: "attachment" } });
      current = false;
      const before = actor.snapshot();

      const rejected = yield* Effect.exit(
        actor.transitionLifecycle({ to: "active", cause: { kind: "attachment" } }),
      );

      assert.ok(Exit.isFailure(rejected));
      assert.strictEqual(actor.snapshot(), before);
      assert.strictEqual(actor.snapshot().lifecycle, "suspended");
      current = true;
      yield* actor.transitionLifecycle({ to: "active", cause: { kind: "attachment" } });
      assert.strictEqual(actor.snapshot().lifecycle, "active");
      assert.ok(Result.isSuccess(actor.send(Result.getOrThrow(CounterDefinition.E.go(1)))));
      yield* actor.flush();
      yield* f.close();
    }),
  );

  // Owner: P06.
  // Source: lifecycle.test.ts:1718 "serializes lifecycle commands and publishes evidence after each cut".
  // Source: lifecycle.test.ts:2768 "serializes competing lifecycle transitions".
  // Source: lifecycle.test.ts:2804 "publishes lifecycle evidence with its complete snapshot cut".
  // Contract/correction: SNAP-001; refactor.md ActorEngine one-cut lifecycle protocol.
  // Setup: An active actor, competing suspend/resume/dispose commands, and a lifecycle evidence sink.
  // Action: Gate one transition and submit a competing command.
  // Observable result: Completed transitions form one legal serial order; each snapshot revision and accepted evidence record describe the same cut.
  // Failure/cleanup: Failed preflight leaves prior lifecycle truth, while disposal drains accepted evidence and closes once.
  it.effect("RN-LIFECYCLE-004 competing lifecycle commands serialize complete evidence cuts", () =>
    Effect.gen(function* () {
      const observed: { lifecycle: string; revision: number }[] = [];
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();

      // RETURN_TYPE: The recursive reacquisition effect preserves the exact lifecycle resource type.
      const acquire = (): Effect.Effect<LifecycleResource> =>
        Effect.succeed({
          name: "gated resource",
          release: Deferred.succeed(entered, undefined).pipe(
            Effect.andThen(Deferred.await(release)),
          ),
          reacquire: Option.some(Effect.suspend(acquire)),
        });

      const f = yield* makeActorFixture({
        machine: CounterMachine,
        initial: counterSnapshot(),
        onSnapshot: ({ lifecycle, revision }) => {
          observed.push({ lifecycle, revision });
        },
        work: { resources: [acquire()], tasks: [], deadlines: [] },
      });

      const actor = yield* f.prepared.activate();
      const suspend = actor.transitionLifecycle({ to: "suspended", cause: { kind: "attachment" } });
      yield* Deferred.await(entered);
      const resume = actor.transitionLifecycle({ to: "active", cause: { kind: "attachment" } });

      const overflow = actor.transitionLifecycle({
        to: "disposed",
        cause: { kind: "owner-disposal" },
      });

      assert.ok(Exit.isFailure(yield* Effect.exit(overflow)));
      yield* Deferred.succeed(release, undefined);
      yield* suspend;
      yield* resume;
      yield* actor.transitionLifecycle({ to: "disposed", cause: { kind: "owner-disposal" } });
      yield* Effect.yieldNow;

      assert.deepStrictEqual(observed, [
        { lifecycle: "active", revision: 1 },
        { lifecycle: "suspended", revision: 2 },
        { lifecycle: "active", revision: 3 },
        { lifecycle: "disposed", revision: 4 },
      ]);
      assert.strictEqual(f.journal.sequence(), 4);
      yield* f.close();
    }),
  );

  // Owner: P06.
  // Source: lifecycle.test.ts:242 "computes the legal graph and rejects stale transitions" (retained behavior, not its standalone controller API).
  // Source: new refactor.md STD-02 ActorEngine owner proof.
  // Contract/correction: HOST-005; SEM-024; STD-02; refactor.md ActorEngine lifecycle model.
  // Setup: The canonical lifecycle planner and one real active actor.
  // Action: Check all declared legal edges, representative illegal edges, and an actor-level illegal transition after activation and disposal.
  // Observable result: Legal cause/state pairs plan; rejected actor commands do not change the publication cut.
  // Failure/cleanup: Disposal is terminal and close releases actor work.
  it.effect("RN-LIFECYCLE-005 lifecycle transitions preserve state and cause legality", () =>
    Effect.gen(function* () {
      const legal = [
        ["prepared", "prepared", "restore"],
        ["prepared", "active", "fresh"],
        ["prepared", "active", "attachment"],
        ["active", "suspended", "attachment"],
        ["suspended", "active", "attachment"],
        ["prepared", "disposed", "owner-disposal"],
        ["active", "disposed", "owner-disposal"],
        ["suspended", "disposed", "owner-disposal"],
        ["prepared", "disposed", "runtime-disposal"],
        ["active", "disposed", "runtime-disposal"],
        ["suspended", "disposed", "runtime-disposal"],
      ] as const;

      for (const [from, to, kind] of legal)
        assert.ok(Result.isSuccess(planLifecycleTransition(from, { to, cause: { kind } })));

      for (const [from, to, kind] of [
        ["active", "active", "fresh"],
        ["suspended", "active", "fresh"],
        ["disposed", "active", "attachment"],
      ] as const)
        assert.ok(Result.isFailure(planLifecycleTransition(from, { to, cause: { kind } })));

      const f = yield* makeActorFixture({ machine: CounterMachine, initial: counterSnapshot() });
      const actor = yield* f.prepared.activate();
      const before = actor.snapshot();
      assert.ok(
        Exit.isFailure(
          yield* Effect.exit(
            actor.transitionLifecycle({
              to: "active",
              cause: { kind: "fresh" },
            }),
          ),
        ),
      );
      assert.strictEqual(actor.snapshot(), before);
      yield* actor.transitionLifecycle({ to: "disposed", cause: { kind: "owner-disposal" } });
      assert.ok(
        Exit.isFailure(
          yield* Effect.exit(
            actor.transitionLifecycle({
              to: "active",
              cause: { kind: "attachment" },
            }),
          ),
        ),
      );
      yield* f.close();
    }),
  );

  it.effect("cleanup preserves a task's pre-existing interruption cause", () =>
    Effect.gen(function* () {
      const release = yield* Deferred.make<void>();
      const taskFiber = yield* Effect.never.pipe(Effect.forkChild);
      const ownerFiber = yield* Deferred.await(release).pipe(Effect.forkChild);
      yield* Fiber.interruptAs(taskFiber, 998);

      const stopped = yield* stopLifecycleWork({
        resources: [],
        tasks: [
          {
            task: {
              name: "prior-interrupt",
              fiber: taskFiber,
              finalize: Effect.void,
              reacquire: Option.none(),
            },
            owner: { fiber: ownerFiber, release },
          },
        ],
        deadlines: [],
        timers: { claims: [], start: Deferred.makeUnsafe<void>() },
      });

      assert.ok(Option.isSome(stopped.cause));
      assert.ok(
        Option.isSome(stopped.cause) &&
          stopped.cause.value.reasons.some(
            (reason) => Cause.isInterruptReason(reason) && reason.fiberId === 998,
          ),
      );
    }),
  );

  it.effect("timer cleanup preserves an earlier interruption cause", () =>
    Effect.gen(function* () {
      const fiber = yield* Effect.never.pipe(Effect.forkChild);
      yield* Fiber.interruptAs(fiber, 997);

      const reasons = yield* stopTimerClaims([
        {
          deadline: {
            name: "prior-interrupt",
            startedAt: 0,
            dueAt: 1,
            generation: 1,
            status: "armed",
            fire: Option.none(),
          },
          fiber,
        },
      ]);

      assert.ok(
        reasons.some((reason) => Cause.isInterruptReason(reason) && reason.fiberId === 997),
      );
    }),
  );

  it.effect("an interrupted overdue timer does not replay after resume", () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      let attempts = 0;
      let interruptions = 0;

      const f = yield* makeActorFixture({
        machine: CounterMachine,
        initial: { ...counterSnapshot(), timers: [{ name: "overdue", startedAt: 0, dueAt: 0 }] },
        work: {
          resources: [],
          tasks: [],
          deadlines: [
            {
              name: "overdue",
              startedAt: 0,
              dueAt: 0,
              generation: 1,
              status: "armed",
              fire: Option.some(
                Effect.gen(function* () {
                  attempts += 1;
                  yield* Deferred.succeed(entered, undefined);
                  yield* Deferred.await(release);
                }).pipe(
                  Effect.onInterrupt(() =>
                    Effect.sync(() => {
                      interruptions += 1;
                    }),
                  ),
                ),
              ),
            },
          ],
        },
      });

      const actor = yield* f.prepared.activate();
      yield* Deferred.await(entered);
      yield* actor.transitionLifecycle({ to: "suspended", cause: { kind: "attachment" } });
      assert.deepStrictEqual([attempts, interruptions], [1, 1]);
      yield* actor.transitionLifecycle({ to: "active", cause: { kind: "attachment" } });
      yield* TestClock.adjust(1);
      yield* Effect.yieldNow;
      assert.strictEqual(attempts, 1);
      yield* f.close();
    }).pipe(Effect.provide(TestClock.layer())),
  );
});
