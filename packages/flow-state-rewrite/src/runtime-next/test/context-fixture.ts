import { assert } from "@effect/vitest";
import { Deferred, Effect, Result, Scope } from "effect";

import { definition } from "../../definition/definition.js";
import { Failure } from "../../diagnostic/diagnostic.js";
import { machine } from "../../machine/machine.js";
import { actorRef } from "../../runtime/actor-ref.js";
import { makeActorDirectory } from "../actor/actor-directory.js";
import { makeContextCoordinator, type ContextNode } from "../context/context-coordinator.js";
import type { ContextSlot } from "../context/context-wave.js";
import type { ActorSnapshot } from "../runtime.js";

const ProviderResult = definition({
  id: "runtime-next/context-scenario-provider",
  states: ["ready", "changed"],
  events: {},
});

export const Provider = Result.getOrThrow(ProviderResult);

export type ProviderValue = typeof Provider.S.ready | typeof Provider.S.changed;

const ConsumerResult = definition({
  id: "runtime-next/context-scenario-consumer",
  states: ["idle"],
  events: {},
  context: { value: Provider.select(({ state }) => state) },
});

export const Consumer = Result.getOrThrow(ConsumerResult);

export const DualConsumer = Result.getOrThrow(
  definition({
    id: "runtime-next/context-scenario-dual-consumer",
    states: ["idle"],
    events: {},
    context: {
      left: Provider.select(({ state }) => state),
      right: Provider.select(({ state }) => state),
    },
  }),
);

const LeafResult = definition({
  id: "runtime-next/context-scenario-leaf",
  states: ["idle"],
  events: {},
  context: {
    left: Consumer.select(({ context }) => context.value),
    right: Consumer.select(({ context }) => context.value),
  },
});

const Leaf = Result.getOrThrow(LeafResult);

export const ProviderMachine = Result.getOrThrow(
  machine(ProviderResult, ({ S }) => ({ default: S.ready, states: { ready: {}, changed: {} } })),
);

export const ConsumerMachine = Result.getOrThrow(
  machine(ConsumerResult, ({ S }) => ({ default: S.idle, states: { idle: {} } })),
);

const LeafMachine = Result.getOrThrow(
  machine(LeafResult, ({ S }) => ({ default: S.idle, states: { idle: {} } })),
);

export const unavailable = () =>
  Failure({
    code: "MissingContextProvider",
    path: ["context"],
    details: {},
    summary: "Provider cut is unavailable.",
    help: "Register the provider before the consumer.",
  });

// RETURN_TYPE: This guard narrows unknown selected state to the fixture domain.
export const isProviderState = (
  value: unknown,
): value is typeof Provider.S.ready | typeof Provider.S.changed =>
  Object.is(value, Provider.S.ready) || Object.is(value, Provider.S.changed);

export const identity = (id: string) => {
  const directory = makeActorDirectory<string>({ machines: [ProviderMachine] });

  const admission = Result.getOrThrow(
    directory.reserve({
      kind: "stable",
      ref: actorRef(ProviderMachine, id),
    }),
  );

  if (admission._tag !== "create") throw Error("Expected a fresh graph actor");

  return admission.reservation.identity;
};

export const makeHarness = (scope: Scope.Scope) =>
  Effect.gen(function* () {
    const coordinator = yield* makeContextCoordinator(scope);
    const directory = makeActorDirectory<string>({ machines: [ProviderMachine, ConsumerMachine] });
    const providerRef = actorRef(ProviderMachine, "provider");
    const consumerRef = actorRef(ConsumerMachine, "consumer");

    const providerAdmission = Result.getOrThrow(
      directory.reserve({ kind: "stable", ref: providerRef }),
    );

    const consumerAdmission = Result.getOrThrow(
      directory.reserve({ kind: "stable", ref: consumerRef }),
    );

    assert.strictEqual(providerAdmission._tag, "create");
    assert.strictEqual(consumerAdmission._tag, "create");

    if (providerAdmission._tag !== "create" || consumerAdmission._tag !== "create")
      return yield* Effect.fail(unavailable());

    const providerIdentity = providerAdmission.reservation.identity;
    const consumerIdentity = consumerAdmission.reservation.identity;
    let providerState: ProviderValue = Provider.S.ready;
    let providerRevision = 1;
    let consumerRevision = 1;
    let consumerContext: ProviderValue = Provider.S.ready;
    let rejectOffers = false;
    let offerAdmissions = 0;
    let offerGate: Deferred.Deferred<void> | undefined;
    let offeredSignal = Deferred.makeUnsafe<void>();
    const offered: Array<{ value: ProviderValue; revision: number }> = [];

    // RETURN_TYPE: The provider fixture must satisfy the actor snapshot port.
    const providerSnapshot = (): ActorSnapshot<typeof Provider> => ({
      state: providerState,
      memory: {},
      context: {},
      lifecycle: "active",
      O: {},
      timers: [],
      issues: [],
      revision: providerRevision,
      observedStoreRevision: 0,
    });

    // RETURN_TYPE: The consumer fixture must satisfy the actor snapshot port.
    const consumerSnapshot = (): ActorSnapshot<typeof Consumer> => ({
      state: Consumer.S.idle,
      memory: {},
      context: { value: consumerContext },
      lifecycle: "active",
      O: {},
      timers: [],
      issues: [],
      revision: consumerRevision,
      observedStoreRevision: 0,
    });

    const providerNode: ContextNode<typeof Provider> = {
      identity: providerIdentity,
      participant: {
        ref: providerRef,
        snapshot: providerSnapshot,
        offerContext: () => Result.fail(unavailable()),
      },
      providers: [],
      opaqueIdentities: [Provider.S.ready, Provider.S.changed],
      selectionBatch: () => Result.succeed({ slots: [], requests: [] }),
    };

    const consumerNode: ContextNode<typeof Consumer> = {
      identity: consumerIdentity,
      participant: {
        ref: consumerRef,
        snapshot: consumerSnapshot,
        offerContext(ticket) {
          if (rejectOffers) return Result.fail(unavailable());
          offerAdmissions += 1;
          Deferred.doneUnsafe(offeredSignal, Effect.void);

          return Result.succeed({
            wait: Effect.gen(function* () {
              if (offerGate !== undefined) yield* Deferred.await(offerGate);

              const accepted = Result.getOrThrow(
                ticket.consume(consumerIdentity, consumerRevision),
              );

              const entry = accepted.entries[0];

              if (entry === undefined) return yield* Effect.fail(unavailable());

              consumerContext = entry.value;
              consumerRevision += 1;
              offered.push({ value: entry.value, revision: entry.provider.revision });

              return { status: "published" as const, snapshot: consumerSnapshot() };
            }),
            cancel() {},
          });
        },
      },
      providers: [{ slot: "value", provider: providerIdentity }],
      opaqueIdentities: [Provider.S.ready, Provider.S.changed],
      selectionBatch(captured) {
        const observed = captured.get(providerIdentity.key);

        if (observed === undefined) return Result.fail(unavailable());
        const state = observed.snapshot.state;

        if (!isProviderState(state)) return Result.fail(unavailable());

        const slot: ContextSlot<typeof Consumer> = "value";

        return Result.succeed({
          slots: [slot],
          requests: [
            {
              slot,
              provider: providerIdentity,
              cut: { identity: providerIdentity, revision: observed.snapshot.revision },
              input: { state, memory: {}, context: {} },
              select: ({ state: selected }) => selected,
              opaqueIdentities: [Provider.S.ready, Provider.S.changed],
            },
          ],
        });
      },
    };

    const providerRegistration = Result.getOrThrow(coordinator.register(providerNode));
    providerRegistration.enable();
    const consumerRegistration = Result.getOrThrow(coordinator.register(consumerNode));
    const baselineAdmittedBeforeEnable = offerAdmissions === 1;
    consumerRegistration.enable();
    yield* coordinator.drain();

    return {
      coordinator,
      providerIdentity,
      consumerIdentity,
      consumerNode,
      providerRegistration,
      consumerRegistration,
      offered,
      baselineAdmittedBeforeEnable,
      offerAdmissions: () => offerAdmissions,
      holdOffers(gate: Deferred.Deferred<void>) {
        offerGate = gate;
        offeredSignal = Deferred.makeUnsafe();
      },
      awaitOffer: () => Deferred.await(offeredSignal),
      setProviderChanged() {
        providerState = Provider.S.changed;
        providerRevision += 1;
      },
      toggleProvider() {
        providerState = providerState === Provider.S.ready ? Provider.S.changed : Provider.S.ready;
        providerRevision += 1;
      },
      setRejectOffers(value: boolean) {
        rejectOffers = value;
      },
      providerSnapshot,
      consumerSnapshot,
    };
  });

export const makeDiamondHarness = (scope: Scope.Scope) =>
  Effect.gen(function* () {
    const base = yield* makeHarness(scope);
    yield* base.coordinator.drain();
    const directory = makeActorDirectory<string>({ machines: [ConsumerMachine, LeafMachine] });
    const rightRef = actorRef(ConsumerMachine, "right");
    const leafRef = actorRef(LeafMachine, "leaf");
    const rightAdmission = Result.getOrThrow(directory.reserve({ kind: "stable", ref: rightRef }));
    const leafAdmission = Result.getOrThrow(directory.reserve({ kind: "stable", ref: leafRef }));

    if (rightAdmission._tag !== "create" || leafAdmission._tag !== "create")
      return yield* Effect.fail(unavailable());

    const rightIdentity = rightAdmission.reservation.identity;
    const leafIdentity = leafAdmission.reservation.identity;
    let rightRevision = 1;
    let rightValue: ProviderValue = Provider.S.ready;
    let leafRevision = 1;
    let leafLeft: ProviderValue = Provider.S.ready;
    let leafRight: ProviderValue = Provider.S.ready;
    let rightSignal = Deferred.makeUnsafe<void>();
    const leafOffers: Array<{ left: ProviderValue; right: ProviderValue }> = [];

    // RETURN_TYPE: The diamond provider must satisfy the actor snapshot port.
    const rightSnapshot = (): ActorSnapshot<typeof Consumer> => ({
      state: Consumer.S.idle,
      memory: {},
      context: { value: rightValue },
      lifecycle: "active",
      O: {},
      timers: [],
      issues: [],
      revision: rightRevision,
      observedStoreRevision: 0,
    });

    // RETURN_TYPE: The diamond consumer must satisfy the actor snapshot port.
    const leafSnapshot = (): ActorSnapshot<typeof Leaf> => ({
      state: Leaf.S.idle,
      memory: {},
      context: { left: leafLeft, right: leafRight },
      lifecycle: "active",
      O: {},
      timers: [],
      issues: [],
      revision: leafRevision,
      observedStoreRevision: 0,
    });

    const rightNode: ContextNode<typeof Consumer> = {
      identity: rightIdentity,
      participant: {
        ref: rightRef,
        snapshot: rightSnapshot,
        offerContext(ticket) {
          return Result.succeed({
            wait: Effect.sync(() => {
              const offer = Result.getOrThrow(ticket.consume(rightIdentity, rightRevision));
              const value = offer.entries[0]?.value;

              assert.ok(value !== undefined);
              rightValue = value;
              rightRevision += 1;
              Deferred.doneUnsafe(rightSignal, Effect.void);

              return { status: "published" as const, snapshot: rightSnapshot() };
            }),
            cancel() {},
          });
        },
      },
      providers: [{ slot: "value", provider: base.providerIdentity }],
      opaqueIdentities: [Provider.S.ready, Provider.S.changed],
      selectionBatch(captured) {
        const observed = captured.get(base.providerIdentity.key);

        if (observed === undefined || !isProviderState(observed.snapshot.state))
          return Result.fail(unavailable());

        return Result.succeed({
          slots: ["value"],
          requests: [
            {
              slot: "value",
              provider: base.providerIdentity,
              cut: { identity: base.providerIdentity, revision: observed.snapshot.revision },
              input: { state: observed.snapshot.state, memory: {}, context: {} },
              select: ({ state }) => state,
              opaqueIdentities: [Provider.S.ready, Provider.S.changed],
            },
          ],
        });
      },
    };

    const leafNode: ContextNode<typeof Leaf> = {
      identity: leafIdentity,
      participant: {
        ref: leafRef,
        snapshot: leafSnapshot,
        offerContext(ticket) {
          return Result.succeed({
            wait: Effect.sync(() => {
              const offer = Result.getOrThrow(ticket.consume(leafIdentity, leafRevision));
              const left = offer.entries.find((entry) => entry.slot === "left")?.value;
              const right = offer.entries.find((entry) => entry.slot === "right")?.value;

              assert.ok(left !== undefined && right !== undefined);
              leafLeft = left;
              leafRight = right;
              leafRevision += 1;
              leafOffers.push({ left, right });

              return { status: "published" as const, snapshot: leafSnapshot() };
            }),
            cancel() {},
          });
        },
      },
      providers: [
        { slot: "left", provider: base.consumerIdentity },
        { slot: "right", provider: rightIdentity },
      ],
      opaqueIdentities: [Provider.S.ready, Provider.S.changed],
      selectionBatch(captured) {
        const left = captured.get(base.consumerIdentity.key);
        const right = captured.get(rightIdentity.key);

        if (left === undefined || right === undefined) return Result.fail(unavailable());
        const leftValue = base.consumerSnapshot().context.value;
        const rightValue = rightSnapshot().context.value;

        return Result.succeed({
          slots: ["left", "right"],
          requests: [
            {
              slot: "left",
              provider: base.consumerIdentity,
              cut: { identity: base.consumerIdentity, revision: left.snapshot.revision },
              input: { state: Consumer.S.idle, memory: {}, context: { value: leftValue } },
              select: ({ context }) => context.value,
              opaqueIdentities: [Provider.S.ready, Provider.S.changed],
            },
            {
              slot: "right",
              provider: rightIdentity,
              cut: { identity: rightIdentity, revision: right.snapshot.revision },
              input: { state: Consumer.S.idle, memory: {}, context: { value: rightValue } },
              select: ({ context }) => context.value,
              opaqueIdentities: [Provider.S.ready, Provider.S.changed],
            },
          ],
        });
      },
    };

    Result.getOrThrow(base.coordinator.register(rightNode)).enable();
    yield* base.coordinator.drain();
    Result.getOrThrow(base.coordinator.register(leafNode)).enable();
    yield* base.coordinator.drain();

    return {
      ...base,
      rightSnapshot,
      leafSnapshot,
      leafOffers,
      resetRightSignal() {
        rightSignal = Deferred.makeUnsafe();
      },
      awaitRightOffer: () => Deferred.await(rightSignal),
    };
  });
