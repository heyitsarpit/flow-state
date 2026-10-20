import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit, Fiber, Result, Scope, type Types } from "effect";

import type { ContextOf, EventOf, MemoryOf } from "../../definition/domain.js";
import { definition } from "../../definition/definition.js";
import { Failure } from "../../diagnostic/diagnostic.js";
import { machine } from "../../machine/machine.js";
import type { CompiledState, MachineSnapshot } from "../../machine/grammar.js";
import { resource } from "../../operation/resource.js";
import { runMappedContinuations } from "../actor/actor-mailbox.js";
import { captureActorSnapshotCopyPolicy } from "../actor/actor-snapshot.js";
import { planEventTurn, type EventTurnPlan, type OwnedMachineSnapshot } from "../turn-plan.js";

const cache = resource({
  id: "runtime-next/turn-plan-cache",
  key: (id: number) => [id] as const,
  lookup: (id: number) => id,
});

const DefinitionResult = definition({
  id: "runtime-next/turn-plan-owner",
  states: ["idle", "active", "done"],
  events: {
    go: (value: number) => ({ value }),
    mapped: (value: number) => ({ value }),
  },
  operations: { cache },
  memory: () => ({ count: 0 }),
});

const Definition = Result.getOrThrow(DefinitionResult);

const ProviderResult = definition({
  id: "runtime-next/turn-plan-provider-token",
  states: ["ready"],
  events: {},
});

const Provider = Result.getOrThrow(ProviderResult);

const ReadonlyProofResult = definition({
  id: "runtime-next/turn-plan-readonly-proof",
  states: ["idle", "active"],
  events: { go: () => ({}) },
  context: {
    providerState: Provider.select(({ state }) => state),
    providerProfile: Provider.select(() => ({ profile: { count: Number(0) } })),
  },
  memory: () => ({ profile: { count: 0 } }),
});

const ReadonlyProofDefinition = Result.getOrThrow(ReadonlyProofResult);

type Expect<Value extends true> = Value;

export type _OwnedEmptyMemoryStaysExact = Expect<
  Types.Equals<OwnedMachineSnapshot<typeof Provider>["memory"], MemoryOf<typeof Provider>>
>;

export type _OwnedEmptyContextStaysExact = Expect<
  Types.Equals<OwnedMachineSnapshot<typeof Provider>["context"], ContextOf<typeof Provider>>
>;

const plannerReadonlyTypeProof = (
  plan: EventTurnPlan<typeof ReadonlyProofDefinition>,
  before: OwnedMachineSnapshot<typeof ReadonlyProofDefinition>,
) => {
  const exactState: MachineSnapshot<typeof ReadonlyProofDefinition>["state"] = before.state;
  void exactState;

  // @ts-expect-error Captured snapshots protect nested structural memory from mutation.
  plan.before.memory.profile.count = 2;
  // @ts-expect-error Captured snapshots protect nested structural context from mutation.
  plan.before.context.providerProfile.profile.count = 2;

  if (plan._tag === "planned") {
    // @ts-expect-error Published snapshots protect nested structural memory from mutation.
    plan.candidate.memory.profile.count = 2;
    // @ts-expect-error Published snapshots protect nested structural context from mutation.
    plan.candidate.context.providerProfile.profile.count = 2;
  }
};

void plannerReadonlyTypeProof;

const plannerUnionReadonlyTypeProof = (
  snapshot: OwnedMachineSnapshot<typeof Provider | typeof ReadonlyProofDefinition>,
) => {
  if ("profile" in snapshot.memory) {
    // @ts-expect-error Present memory arms stay recursively readonly beside the exact empty arm.
    snapshot.memory.profile.count = 2;
  }

  if ("providerProfile" in snapshot.context) {
    // @ts-expect-error Present context arms stay recursively readonly beside the exact empty arm.
    snapshot.context.providerProfile.profile.count = 2;
  }
};

void plannerUnionReadonlyTypeProof;

const callbacks: string[] = [];

const Machine = Result.getOrThrow(
  machine(DefinitionResult, ({ S, E, O }) => ({
    default: S.idle,
    states: {
      idle: {
        on: {
          go: [
            {
              target: S.active,
              guard: ({ snapshot }) => {
                callbacks.push(`reject:${snapshot.memory.count}`);

                return false;
              },
            },
            {
              target: S.active,
              guard: ({ snapshot }) => {
                callbacks.push(`accept:${snapshot.memory.count}`);

                return true;
              },
              updateMemory: ({ snapshot }) => {
                callbacks.push(`memory:${snapshot.memory.count}`);

                return { count: snapshot.memory.count + 1 };
              },
              actions: ({ snapshot }) => {
                callbacks.push(`actions:${snapshot.memory.count}`);
                const actions = [O.cache.lookup(1), O.cache.refetch(3), O.cache.lookup(4)];

                Reflect.set(actions, 1, Result.getOrThrow(E.mapped(2)));

                return actions;
              },
            },
          ],
        },
      },
      active: {
        redirect: {
          when: ({ state, memory }) => {
            callbacks.push(`redirect:${memory.count}`);

            return state === S.active && memory.count === 1;
          },
          target: S.done,
        },
      },
      done: {},
    },
  })),
);

describe("runtime-next event turn planner owner", () => {
  it("finds the first matching leaf in a deeply nested compiled machine", () => {
    const rootTemplate = Machine.compiled.states[""];

    const idleTemplate = Object.values(Machine.compiled.states).find(
      (state) => state.kind === "leaf" && Object.is(state.state, Definition.S.idle),
    );

    if (rootTemplate === undefined || rootTemplate.kind !== "compound")
      throw new Error("Expected a compound root state");

    if (idleTemplate === undefined || idleTemplate.kind !== "leaf")
      throw new Error("Expected the idle leaf state");

    const states: Record<string, CompiledState<typeof Definition>> = Object.create(null);
    const firstLeafKey = "deep-first-leaf";
    const laterLeafKey = "deep-later-leaf";

    states[firstLeafKey] = { ...idleTemplate, path: firstLeafKey, handlers: {} };
    states[laterLeafKey] = { ...idleTemplate, path: laterLeafKey };

    let firstChild = firstLeafKey;

    for (let depth = 0; depth < 6_000; depth += 1) {
      const key = `deep-${depth}`;

      states[key] = { ...rootTemplate, path: key, children: [firstChild] };
      firstChild = key;
    }

    states[""] = { ...rootTemplate, path: "", children: [firstChild, laterLeafKey] };

    const deepMachine = { ...Machine, compiled: { ...Machine.compiled, states } };

    const result = planEventTurn({
      machine: deepMachine,
      copyPolicy: captureActorSnapshotCopyPolicy(deepMachine),
      before: { state: Definition.S.idle, memory: { count: 0 }, context: {} },
      event: Result.getOrThrow(Definition.E.go(1)),
    });

    assert.ok(Result.isSuccess(result));

    if (Result.isSuccess(result)) assert.strictEqual(result.success._tag, "noop");
  });

  it("plans from one captured snapshot and preserves callback and action order", () => {
    const before = { state: Definition.S.idle, memory: { count: 0 }, context: {} };
    const event = Result.getOrThrow(Definition.E.go(7));

    const result = planEventTurn({
      machine: Machine,
      copyPolicy: captureActorSnapshotCopyPolicy(Machine),
      before,
      event,
    });

    assert.ok(Result.isSuccess(result));

    if (Result.isFailure(result)) return;

    assert.strictEqual(result.success._tag, "planned");

    if (result.success._tag !== "planned") return;

    assert.strictEqual(result.success.before.state, Definition.S.idle);
    assert.strictEqual(result.success.before.memory.count, 0);
    assert.strictEqual(result.success.candidate.state, Definition.S.done);
    assert.strictEqual(result.success.candidate.memory.count, 1);
    assert.deepStrictEqual(callbacks, [
      "reject:0",
      "accept:0",
      "memory:0",
      "actions:0",
      "redirect:1",
    ]);
    assert.deepStrictEqual(
      result.success.actions.map(({ action }) => [action.kind, "key" in action ? action.key : []]),
      [
        ["resource-lookup", [1]],
        ["resource-lookup", [4]],
      ],
    );
    assert.strictEqual(result.success.mappedEvents.length, 1);
    assert.strictEqual(result.success.mappedEvents[0]?.type, Definition.E.mapped.id);
  });

  it("rejects a mapped envelope with a payload outside the Definition value grammar", () => {
    const invalidMapped = Result.getOrThrow(Definition.E.mapped(2));
    assert.strictEqual(Reflect.set(invalidMapped, "value", new Date()), true);

    const invalidMachine = Result.getOrThrow(
      machine(DefinitionResult, ({ S }) => ({
        default: S.idle,
        states: {
          idle: {
            on: {
              go: {
                target: S.active,
                actions: ({ O }) => {
                  const actions = [O.cache.lookup(1)];

                  Reflect.set(actions, 0, invalidMapped);

                  return actions;
                },
              },
            },
          },
          active: {},
          done: {},
        },
      })),
    );

    const result = planEventTurn({
      machine: invalidMachine,
      copyPolicy: captureActorSnapshotCopyPolicy(invalidMachine),
      before: { state: Definition.S.idle, memory: { count: 0 }, context: {} },
      event: Result.getOrThrow(Definition.E.go(7)),
    });

    assert.ok(Result.isFailure(result));
  });

  it.effect("owns a getter-backed mapped envelope before the 64-turn continuation yield", () =>
    Effect.gen(function* () {
      let rawValue = 4;
      let getterReads = 0;
      let executions = 0;
      const observedValues: number[] = [];
      const delayedEvent = Result.getOrThrow(Definition.E.mapped(4));

      Object.defineProperty(delayedEvent, "value", {
        configurable: true,
        enumerable: true,
        get() {
          getterReads += 1;

          return rawValue;
        },
      });

      const fillers = Array.from({ length: 64 }, () => Result.getOrThrow(Definition.E.mapped(0)));

      const continuationMachine = Result.getOrThrow(
        machine(DefinitionResult, ({ S }) => ({
          default: S.idle,
          states: {
            idle: {
              on: {
                go: {
                  target: S.active,
                  actions: ({ O }) => {
                    const actions = Array.from({ length: 65 }, (_, index) => O.cache.lookup(index));

                    for (const [index, event] of fillers.entries())
                      Reflect.set(actions, index, event);
                    Reflect.set(actions, 64, delayedEvent);

                    return actions;
                  },
                },
              },
            },
            active: {
              on: { mapped: { target: S.active } },
            },
            done: {},
          },
        })),
      );

      const before = { state: Definition.S.idle, memory: { count: 0 }, context: {} };
      const copyPolicy = captureActorSnapshotCopyPolicy(continuationMachine);
      let snapshot: MachineSnapshot<typeof Definition> = before;

      const receipt = yield* Effect.acquireUseRelease(
        Scope.make(),
        (scope) =>
          Effect.gen(function* () {
            const mutator = yield* Effect.gen(function* () {
              while (executions < 64) yield* Effect.yieldNow;
              rawValue = 99;
            }).pipe(Effect.forkIn(scope, { startImmediately: true }));

            const result = yield* runMappedContinuations<EventOf<typeof Definition>, number>({
              first: Result.getOrThrow(Definition.E.go(1)),
              execute: (event) => {
                const planned = planEventTurn({
                  machine: continuationMachine,
                  copyPolicy,
                  before: snapshot,
                  event,
                });

                if (Result.isFailure(planned)) return Result.fail(planned.failure);

                if (planned.success._tag === "planned") snapshot = planned.success.candidate;

                if (event.type === Definition.E.mapped.id) observedValues.push(event.value);
                executions += 1;

                return Result.succeed({
                  receipt: executions,
                  mapped: planned.success._tag === "planned" ? planned.success.mappedEvents : [],
                });
              },
              current: () => executions,
            });

            yield* Fiber.join(mutator);

            return result;
          }),
        (scope) => Scope.close(scope, Exit.void),
      );

      assert.strictEqual(receipt, 1);
      assert.strictEqual(executions, 66);
      assert.strictEqual(rawValue, 99);
      assert.strictEqual(getterReads, 1);
      assert.deepStrictEqual(observedValues.slice(-1), [4]);
    }),
  );

  it("returns a no-op when all guards reject without evaluating update or actions", () => {
    const noOpMachine = Result.getOrThrow(
      machine(DefinitionResult, ({ S }) => ({
        default: S.idle,
        states: {
          idle: {
            on: {
              go: {
                target: S.active,
                guard: () => false,
                updateMemory: () => {
                  throw new Error("no-op must not update memory");
                },
                actions: () => {
                  throw new Error("no-op must not plan actions");
                },
              },
            },
          },
          active: {},
          done: {},
        },
      })),
    );

    const before = { state: Definition.S.idle, memory: { count: 0 }, context: {} };

    const result = planEventTurn({
      machine: noOpMachine,
      copyPolicy: captureActorSnapshotCopyPolicy(noOpMachine),
      before,
      event: Result.getOrThrow(Definition.E.go(1)),
    });

    assert.ok(Result.isSuccess(result));

    if (Result.isSuccess(result)) {
      assert.strictEqual(result.success._tag, "noop");
      assert.deepStrictEqual(result.success.before, before);
    }
  });

  it("keeps guard, update, action, and redirect callbacks on detached cuts", () => {
    const NestedDefinitionResult = definition({
      id: "runtime-next/turn-plan-callback-cut",
      states: ["idle", "active", "done"],
      events: { go: () => ({}) },
      memory: () => ({ profile: { count: 0 } }),
    });

    const NestedDefinition = Result.getOrThrow(NestedDefinitionResult);
    const seen: string[] = [];

    const update = { profile: { count: 1 } };

    const nestedMachine = Result.getOrThrow(
      machine(NestedDefinitionResult, ({ S }) => ({
        default: S.idle,
        states: {
          idle: {
            on: {
              go: [
                {
                  target: S.active,
                  guard: (input) => {
                    input.snapshot.memory.profile.count = 89;
                    const nestedWrite = Reflect.set(input.snapshot.memory.profile, "count", 90);

                    const topLevelWrite = Reflect.set(input, "memory", {
                      profile: { count: 70 },
                    });

                    seen.push(
                      `guard-reject:${input.snapshot.memory.profile.count}:${nestedWrite}:${topLevelWrite}`,
                    );

                    return false;
                  },
                },
                {
                  target: S.active,
                  guard: ({ snapshot }) => {
                    seen.push(`guard-accept:${snapshot.memory.profile.count}`);

                    return true;
                  },
                  updateMemory: ({ snapshot }) => {
                    seen.push(`update:${snapshot.memory.profile.count}`);

                    return update;
                  },
                  actions: ({ snapshot }) => {
                    const inputWrite = Reflect.set(snapshot.memory.profile, "count", 80);

                    Reflect.set(update.profile, "count", 99);
                    seen.push(`actions:${snapshot.memory.profile.count}:${inputWrite}`);

                    return null;
                  },
                },
              ],
            },
          },
          active: {
            redirect: [
              {
                when: ({ snapshot }) => {
                  const changed = Reflect.set(snapshot.memory.profile, "count", 77);
                  seen.push(`redirect-first:${snapshot.memory.profile.count}:${changed}`);

                  return false;
                },
                target: S.done,
              },
              {
                when: ({ memory }) => {
                  seen.push(`redirect-second:${memory.profile.count}`);

                  return false;
                },
                target: S.done,
              },
            ],
          },
          done: {},
        },
      })),
    );

    const before = {
      state: NestedDefinition.S.idle,
      memory: { profile: { count: 0 } },
      context: {},
    };

    const result = planEventTurn({
      machine: nestedMachine,
      copyPolicy: captureActorSnapshotCopyPolicy(nestedMachine),
      before,
      event: Result.getOrThrow(NestedDefinition.E.go()),
    });

    assert.ok(Result.isSuccess(result));

    if (Result.isFailure(result)) return;

    assert.strictEqual(result.success._tag, "planned");

    if (result.success._tag !== "planned") return;

    assert.deepStrictEqual(seen, [
      "guard-reject:90:true:true",
      "guard-accept:0",
      "update:0",
      "actions:80:true",
      "redirect-first:77:true",
      "redirect-second:1",
    ]);
    assert.strictEqual(before.memory.profile.count, 0);
    assert.strictEqual(update.profile.count, 99);
    assert.strictEqual(result.success.before.memory.profile.count, 0);
    assert.strictEqual(result.success.candidate.memory.profile.count, 1);
    assert.ok(Object.isFrozen(result.success.before.memory.profile));
    assert.ok(Object.isFrozen(result.success.candidate.memory.profile));
    assert.ok(!Object.isFrozen(before.memory.profile));
  });

  it("preserves caller Diagnostic and provider state-token identities across the plan", () => {
    const readonlyMachine = Result.getOrThrow(
      machine(ReadonlyProofResult, ({ S }) => ({
        default: S.idle,
        states: {
          idle: { on: { go: { target: S.active } } },
          active: {},
        },
      })),
    );

    const issue = Failure({
      code: "SemanticValidation",
      path: ["kept"],
      details: {},
      summary: "Caller issue remains unchanged.",
      help: "Preserve this admitted diagnostic identity.",
    });

    const before = {
      state: ReadonlyProofDefinition.S.idle,
      memory: { profile: { count: 0 } },
      context: {
        providerState: Provider.S.ready,
        providerProfile: { profile: { count: 0 } },
      },
      issues: [issue],
    };

    const result = planEventTurn({
      machine: readonlyMachine,
      copyPolicy: captureActorSnapshotCopyPolicy(readonlyMachine),
      before,
      event: Result.getOrThrow(ReadonlyProofDefinition.E.go()),
    });

    assert.ok(
      Result.isSuccess(result),
      Result.isFailure(result) ? result.failure.message : "Planner did not return success",
    );

    if (Result.isFailure(result)) return;

    assert.strictEqual(result.success._tag, "planned");

    if (result.success._tag !== "planned") return;

    assert.ok("issues" in result.success.before);
    assert.ok("issues" in result.success.candidate);

    if (!("issues" in result.success.before) || !("issues" in result.success.candidate)) return;

    assert.ok(Array.isArray(result.success.before.issues));
    assert.ok(Array.isArray(result.success.candidate.issues));

    if (
      !Array.isArray(result.success.before.issues) ||
      !Array.isArray(result.success.candidate.issues)
    )
      return;

    assert.strictEqual(result.success.before.issues[0], issue);
    assert.strictEqual(result.success.candidate.issues[0], issue);
    assert.strictEqual(result.success.before.context.providerState, Provider.S.ready);
    assert.strictEqual(result.success.candidate.context.providerState, Provider.S.ready);
    assert.ok(!Object.isFrozen(result.success.before.context.providerState));
    assert.strictEqual(result.success.before.context.providerProfile.profile.count, 0);
    assert.strictEqual(result.success.candidate.context.providerProfile.profile.count, 0);
    assert.ok(Object.isFrozen(result.success.before.context.providerProfile));
    assert.ok(Object.isFrozen(result.success.before.context.providerProfile.profile));
    assert.ok(Object.isFrozen(result.success.candidate.context.providerProfile.profile));
    assert.ok(!Object.isFrozen(before.context.providerProfile.profile));
  });
});
