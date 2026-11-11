import { assert, describe, it } from "@effect/vitest";
import { Clock, Effect, Exit, Option, Result, Scope } from "effect";

import { definition } from "../../definition/definition.js";
import type { AnyDefinition } from "../../definition/domain.js";
import { isRegisteredStateToken } from "../../definition/schema.js";
import { Failure } from "../../diagnostic/diagnostic.js";
import { machine } from "../../machine/machine.js";
import { actorRef } from "../../runtime/actor-ref.js";
import { makeActorDirectory } from "../actor/actor-directory.js";
import { captureActorSnapshotCopyPolicy } from "../actor/actor-snapshot.js";
import { prepareActorEngine } from "../actor/actor-engine.js";
import { makeEvidenceJournal } from "../evidence/evidence-journal.js";
import { makeRuntimeEvidencePolicy } from "../runtime-services.js";
import type { ActorSnapshot } from "../runtime.js";
import { copyStructural } from "../structural-copy.js";

const BaseProviderDefinition = Result.getOrThrow(
  definition({
    id: "runtime-next/actor-engine-owner-base-provider",
    states: ["ready"],
    events: {},
  }),
);

const ProviderDefinition = Result.getOrThrow(
  definition({
    id: "runtime-next/actor-engine-owner-provider",
    states: ["ready"],
    events: {},
    context: { inheritedState: BaseProviderDefinition.select(({ state }) => state) },
  }),
);

const DefinitionResult = definition({
  id: "runtime-next/actor-engine-owner",
  states: ["idle", "active"],
  events: { go: (value: number) => ({ value }) },
  context: { providerState: ProviderDefinition.select(({ state }) => state) },
  memory: () => ({ count: 0, profile: { count: 0 } }),
});

const Definition = Result.getOrThrow(DefinitionResult);

const SnapshotTypeResult = definition({
  id: "runtime-next/actor-engine-owner-snapshot-type",
  states: ["idle"],
  events: {},
  context: {
    profile: Definition.select(() => ({ profile: { count: Number(0) } })),
  },
  memory: () => ({ profile: { count: 0 } }),
});

const SnapshotTypeDefinition = Result.getOrThrow(SnapshotTypeResult);

const verifyNestedSnapshotReadonly = (snapshot: ActorSnapshot<typeof SnapshotTypeDefinition>) => {
  // @ts-expect-error Actor snapshots expose recursively readonly structural memory data.
  snapshot.memory.profile.count = 1;
  // @ts-expect-error Actor snapshots expose recursively readonly structural context data.
  snapshot.context.profile.profile.count = 1;
};

void verifyNestedSnapshotReadonly;

const Machine = Result.getOrThrow(
  machine(DefinitionResult, ({ S }) => ({
    default: S.idle,
    states: {
      idle: {
        on: {
          go: {
            target: S.active,
            updateMemory: ({ snapshot }) => ({ count: snapshot.memory.count + 1 }),
          },
        },
      },
      active: { on: { go: { target: S.active } } },
    },
  })),
);

const fixture = () =>
  Effect.gen(function* () {
    const ownerScope = yield* Scope.make();
    const app = {};
    const plan = {};
    const journal = Result.getOrThrow(makeEvidenceJournal({ app, plan, ownerScope, capacity: 32 }));
    const directory = makeActorDirectory<string>({ machines: [Machine] });
    const ref = actorRef(Machine, "owner");
    const admission = Result.getOrThrow(directory.reserve({ kind: "stable", ref }));

    assert.strictEqual(admission._tag, "create");

    if (admission._tag !== "create")
      return yield* Effect.fail(
        Failure({
          code: "InvariantViolation",
          path: ["test", "actor-engine-owner", "admission"],
          details: { reason: "expected-create" },
          summary: "Expected a fresh actor reservation",
          help: "Reserve a new actor identity for the owner proof.",
        }),
      );

    const identity = admission.reservation.identity;
    const credit = Result.getOrThrow(journal.registerActor(identity));
    const clock = yield* Clock.Clock;

    const prepared = yield* prepareActorEngine({
      machine: Machine,
      ref,
      identity,
      initial: {
        state: Definition.S.idle,
        memory: { count: 0, profile: { count: 0 } },
        context: { providerState: ProviderDefinition.S.ready },
        lifecycle: "prepared",
        O: {},
        timers: [],
        issues: [],
        revision: 0,
        observedStoreRevision: 0,
      },
      initialMachineTurnRevision: 0,
      restored: false,
      journal,
      credit,
      provenance: { app, plan, actor: identity },
      evidence: makeRuntimeEvidencePolicy(journal, clock),
      store: Option.none(),
      operationRunner: Option.none(),
      context: Option.none(),
      onSnapshot: Option.none<(snapshot: ActorSnapshot<typeof Definition>) => void>(),
      onObserverIssue: Option.none(),
      work: { resources: [], tasks: [], deadlines: [] },
      validateProviders: Effect.void,
    }).pipe(Effect.provideService(Scope.Scope, ownerScope));

    return { prepared, journal, credit, ownerScope };
  });

describe("runtime-next ActorEngine owner", () => {
  it("captures transitive provider state identities once for repeated snapshot copies", () => {
    const originalStateTable = Object.getOwnPropertyDescriptor(BaseProviderDefinition, "S");

    assert.ok(originalStateTable !== undefined && "value" in originalStateTable);

    let deepestProvider: AnyDefinition = ProviderDefinition;

    for (let depth = 0; depth < 6_000; depth += 1) {
      deepestProvider = Result.getOrThrow(
        definition({
          id: `runtime-next/actor-engine-owner-provider-chain-${depth}`,
          states: ["relay"],
          events: {},
          context: {
            previousState: deepestProvider.select(({ state }) => {
              if (!isRegisteredStateToken(state))
                throw new Error("Expected a registered provider state token");

              return state;
            }),
          },
        }),
      );
    }

    let stateTableWalks = 0;

    const stateTable = new Proxy(BaseProviderDefinition.S, {
      ownKeys(target) {
        stateTableWalks += 1;

        return Reflect.ownKeys(target);
      },
    });

    Object.defineProperty(BaseProviderDefinition, "S", {
      ...originalStateTable,
      value: stateTable,
    });

    try {
      const ContextDefinitionResult = definition({
        id: "runtime-next/actor-engine-owner-context",
        states: ["idle"],
        events: {},
        context: {
          providerState: deepestProvider.select(({ state }) => {
            if (!isRegisteredStateToken(state))
              throw new Error("Expected a registered provider state token");

            return state;
          }),
        },
      });

      const ContextMachine = Result.getOrThrow(
        machine(ContextDefinitionResult, ({ S }) => ({ default: S.idle, states: { idle: {} } })),
      );

      stateTableWalks = 0;
      const policy = captureActorSnapshotCopyPolicy(ContextMachine);

      const source = {
        providerState: deepestProvider.S.relay,
        inheritedState: BaseProviderDefinition.S.ready,
        memory: { count: 1 },
      };

      const first = copyStructural(source, "actor", [], undefined, policy);
      const second = copyStructural(source, "actor", [], undefined, policy);

      assert.ok(Result.isSuccess(first));
      assert.ok(Result.isSuccess(second));

      if (Result.isSuccess(first) && Result.isSuccess(second)) {
        assert.strictEqual(first.success.providerState, deepestProvider.S.relay);
        assert.strictEqual(second.success.providerState, deepestProvider.S.relay);
        assert.strictEqual(first.success.inheritedState, BaseProviderDefinition.S.ready);
        assert.strictEqual(second.success.inheritedState, BaseProviderDefinition.S.ready);
        assert.notStrictEqual(first.success.memory, source.memory);
        assert.notStrictEqual(second.success.memory, source.memory);
      }

      assert.strictEqual(stateTableWalks, 1);
    } finally {
      Object.defineProperty(BaseProviderDefinition, "S", originalStateTable);
    }
  });

  it.effect("preparation is inert, activation publishes, and event turns advance one cut", () =>
    Effect.gen(function* () {
      const originalOperations = Object.getOwnPropertyDescriptor(Machine.definition, "operations");
      assert.ok(originalOperations !== undefined && "value" in originalOperations);

      if (!("value" in originalOperations)) return;

      let operationTableWalks = 0;

      const operations = new Proxy(Machine.definition.operations, {
        ownKeys(target) {
          operationTableWalks += 1;

          return Reflect.ownKeys(target);
        },
      });

      Object.defineProperty(Machine.definition, "operations", {
        ...originalOperations,
        value: operations,
      });

      try {
        const { prepared, journal, ownerScope } = yield* fixture();
        const event = Result.getOrThrow(Definition.E.go(1));

        assert.strictEqual(operationTableWalks, 2);
        assert.ok(Result.isSuccess(prepared.send(event)));
        assert.strictEqual(prepared.snapshot().lifecycle, "prepared");
        assert.strictEqual(prepared.snapshot().revision, 0);
        assert.strictEqual(prepared.snapshot().context.providerState, ProviderDefinition.S.ready);
        assert.strictEqual(journal.sequence(), 0);

        const active = yield* prepared.activate();
        yield* active.flush();

        assert.strictEqual(operationTableWalks, 2);
        assert.strictEqual(active.snapshot().lifecycle, "active");
        assert.strictEqual(active.snapshot().state, Definition.S.active);
        assert.strictEqual(active.snapshot().memory.count, 1);
        assert.strictEqual(active.snapshot().context.providerState, ProviderDefinition.S.ready);
        assert.ok(Object.isFrozen(active.snapshot().memory));
        assert.ok(Object.isFrozen(active.snapshot().memory.profile));
        assert.strictEqual(active.snapshot().revision, 2);
        assert.strictEqual(journal.sequence(), 2);

        const receipt = yield* active.dispatch(Result.getOrThrow(Definition.E.go(2)));
        assert.strictEqual(receipt.publicationRevision, 3);
        assert.strictEqual(receipt.evidenceSequence, 3);
        assert.strictEqual(active.snapshot().state, Definition.S.active);
        assert.strictEqual(active.snapshot().context.providerState, ProviderDefinition.S.ready);
        assert.strictEqual(operationTableWalks, 2);
        yield* active.shutdown();

        const second = yield* fixture();

        assert.strictEqual(operationTableWalks, 4);
        assert.strictEqual(second.prepared.snapshot().state, Definition.S.idle);
        yield* second.prepared.abandon();
        yield* second.journal.close();
        yield* Scope.close(second.ownerScope, Exit.void);

        yield* journal.close();
        yield* Scope.close(ownerScope, Exit.void);
      } finally {
        Object.defineProperty(Machine.definition, "operations", originalOperations);
      }
    }),
  );
});
