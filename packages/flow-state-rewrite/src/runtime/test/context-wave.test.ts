// oxlint-disable-next-line anti-slop/no-large-production-file -- these cases share the authored fixtures while proving one context-wave owner across baseline, selection defects, propagation, passive reads, and disposal.
import { assert, describe, it } from "@effect/vitest";
import { Deferred, Effect, Option, Predicate, Result } from "effect";

import { app, module } from "../../app/app.js";
import { definition } from "../../definition/definition.js";
import {
  decodeDefinitionConfigResult,
  decodeEventPayloadResult,
  isRegisteredContextSelector,
} from "../../definition/schema.js";
import { machine } from "../../machine/machine.js";
import { isConstructedOperation } from "../../operation/operation.js";
import { resource } from "../../operation/resource.js";
import { actorRef } from "../actor-ref.js";
import { makeActorIdentityRegistry, type ActorContextBinding } from "../actor-admission.js";
import { prepareActorSnapshot } from "../actor-engine.js";
import {
  activateContextBaseline,
  applyContextWave,
  buildContextGraph,
  equalContextSelection,
  installContextBaseline,
  makePassiveObserver,
  planContextWave,
  selectContext,
  topologicalContextOrder,
  type ContextBinding,
} from "../context-wave.js";
import type { ActorContextSnapshot, ActorFence, ActorKey } from "../actor-admission.js";
import { runtimeOwner, runtimeSetup } from "../runtime.js";
import { reconcileContextEdgeDebt, reconcileContextLineage } from "../context/lineage.js";

const resultSuccess = <Value, Error>(result: Result.Result<Value, Error>) => {
  if (Result.isFailure(result)) throw result.failure;

  return result.success;
};

const providerDefinitionResult = definition({
  id: "context-wave/provider",
  states: ["ready", "changed", "final"],
  events: { advance: "bare" },
});

const providerDefinition = resultSuccess(providerDefinitionResult);

const providerMachine = resultSuccess(
  machine(providerDefinitionResult, ({ S }) => ({
    default: S.ready,
    states: {
      ready: { on: { advance: { target: S.changed } } },
      changed: { on: { advance: { target: S.final } } },
      final: {},
    },
  })),
);

const consumerDefinitionResult = definition({
  id: "context-wave/consumer",
  states: ["ready"],
  events: { opened: "bare" },
  context: {
    selected: providerDefinition.select(({ state }) => state),
  },
});

const consumerDefinition = resultSuccess(consumerDefinitionResult);

const siblingConsumerDefinition = resultSuccess(
  definition({
    id: "context-wave/sibling-consumer",
    states: ["ready"],
    events: {},
    context: {
      left: providerDefinition.select(({ state }) => state),
      right: providerDefinition.select(({ state }) => state),
    },
  }),
);

const consumerMachine = resultSuccess(
  machine(consumerDefinitionResult, ({ S }) => ({
    default: S.ready,
    states: { ready: { on: { opened: { target: S.ready } } } },
  })),
);

const contextWaveApp = app({
  id: "context-wave/app",
  persistenceVersion: "1",
  modules: [
    module({
      id: "context-wave/module",
      machines: { provider: providerMachine, consumer: consumerMachine },
    }),
  ],
});

const contextAdvance = resultSuccess(providerDefinition.E.advance());

const contextOpened = resultSuccess(consumerDefinition.E.opened());

const preparedProviderSnapshot = () =>
  resultSuccess(
    prepareActorSnapshot(providerMachine, {
      state: providerDefinition.S.ready,
      memory: {},
      context: {},
      lifecycle: "prepared",
      operations: [],
      timers: [],
      issues: [],
      revision: 0,
      observedStoreRevision: 0,
    }),
  );

const preparedConsumerSnapshot = () =>
  resultSuccess(
    prepareActorSnapshot(consumerMachine, {
      state: consumerDefinition.S.ready,
      memory: {},
      context: { selected: providerDefinition.S.ready },
      lifecycle: "prepared",
      operations: [],
      timers: [],
      issues: [],
      revision: 0,
      observedStoreRevision: 0,
    }),
  );

const revisionVector = (entries: [ActorKey, number][]) => new Map(entries);

const contextValueOutsideAuthoredType = (value: unknown) => {
  // SAFETY: These proofs deliberately return null or undefined from a selector whose authored output excludes both values.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- behavior proofs must inject runtime values outside the selector's authored return type.
  return value as never;
};

const makeFixture = () => {
  const registry = makeActorIdentityRegistry();
  const providerRef = actorRef(providerMachine, "provider");
  const consumerRef = actorRef(consumerMachine, "consumer");
  const providerIdentity = resultSuccess(registry.reserveStable(providerRef));
  const consumerIdentity = resultSuccess(registry.reserveStable(consumerRef));

  const providerFence: ActorFence = {
    key: providerIdentity.key,
    incarnation: providerIdentity.incarnation,
    generation: 0,
    leaseEpoch: providerIdentity.leaseEpoch,
  };

  const binding = {
    consumer: consumerIdentity.key,
    consumerIncarnation: consumerIdentity.incarnation,
    slot: "selected",
    provider: providerRef,
    providerFence,
    select: ({ state }) => state,
  } satisfies ContextBinding<typeof consumerDefinition, typeof providerDefinition, "selected">;

  const graph = resultSuccess(
    buildContextGraph<typeof consumerDefinition, typeof providerDefinition>([binding]),
  );

  const snapshots = new Map([
    [providerIdentity.key, { state: providerDefinition.S.ready, memory: {}, context: {} }],
  ]);

  const baseline = resultSuccess(
    installContextBaseline(graph, snapshots, revisionVector([[providerIdentity.key, 0]])),
  );

  return { binding, consumerIdentity, graph, providerIdentity, registry, snapshots, baseline };
};

const chainSourceDefinitionResult = definition({
  id: "context-wave/chain-source",
  states: ["ready", "changed"],
  events: {},
});

const chainSourceDefinition = resultSuccess(chainSourceDefinitionResult);

const chainNodeDefinitionResult = definition({
  id: "context-wave/chain-node",
  states: ["ready"],
  events: {},
  context: {
    value: chainSourceDefinition.select(({ state }) => state),
  },
});

const chainNodeDefinition = resultSuccess(chainNodeDefinitionResult);

const chainNodeMachine = resultSuccess(
  machine(chainNodeDefinitionResult, ({ S }) => ({
    default: S.ready,
    states: { ready: {} },
  })),
);

const makeChainFixture = () => {
  const registry = makeActorIdentityRegistry();
  const actorRefs = ["a", "b", "c"].map((id) => actorRef(chainNodeMachine, id));
  const identities = actorRefs.map((ref) => resultSuccess(registry.reserveStable(ref)));

  const fence = (identity: (typeof identities)[number]) => ({
    key: identity.key,
    incarnation: identity.incarnation,
    generation: 0,
    leaseEpoch: identity.leaseEpoch,
  });

  const makeBinding = (
    consumer: (typeof identities)[number],
    provider: (typeof identities)[number],
  ) =>
    ({
      consumer: consumer.key,
      consumerIncarnation: consumer.incarnation,
      slot: "value",
      provider: provider.ref,
      providerFence: fence(provider),
      select: ({ context }) => context.value,
    }) satisfies ContextBinding<typeof chainNodeDefinition, typeof chainNodeDefinition, "value">;

  const bindings = [
    makeBinding(identities[1]!, identities[0]!),
    makeBinding(identities[2]!, identities[1]!),
  ];

  const graph = resultSuccess(
    buildContextGraph<typeof chainNodeDefinition, typeof chainNodeDefinition>(bindings),
  );

  const snapshots = new Map<ActorKey, ActorContextSnapshot<typeof chainNodeDefinition>>([
    // The chain's provider snapshots intentionally widen the selected context to both authored states.
    [
      identities[0]!.key,
      {
        state: chainNodeDefinition.S.ready,
        memory: {},
        context: { value: chainSourceDefinition.S.ready },
      },
    ],
    [
      identities[1]!.key,
      {
        state: chainNodeDefinition.S.ready,
        memory: {},
        context: { value: chainSourceDefinition.S.ready },
      },
    ],
  ]);

  const baseline = resultSuccess(
    installContextBaseline(
      graph,
      snapshots,
      revisionVector([
        [identities[0]!.key, 0],
        [identities[1]!.key, 0],
      ]),
    ),
  );

  return { baseline, graph, identities, snapshots };
};

describe("context waves", () => {
  it("installs a provider-first owned baseline before activation", () => {
    const fixture = makeFixture();
    assert.deepStrictEqual(fixture.baseline.graph.order, [
      fixture.providerIdentity.key,
      fixture.consumerIdentity.key,
    ]);
    assert.strictEqual(fixture.baseline.projections.length, 1);
    assert.strictEqual(fixture.baseline.projections[0]?.changedSlots.size, 0);
    assert.strictEqual(
      fixture.baseline.projections[0]?.values.get("selected"),
      providerDefinition.S.ready,
    );
    assert.strictEqual(activateContextBaseline(fixture.baseline)._tag, "context-active");
    assert.strictEqual(
      Object.is(fixture.baseline.providerRevision.get(fixture.providerIdentity.key), 0),
      true,
    );
  });

  it("derives one bounded provider-first wave and coalesces unchanged revisions", () => {
    const fixture = makeFixture();

    const wave = resultSuccess(
      planContextWave(
        fixture.graph,
        revisionVector([[fixture.providerIdentity.key, 1]]),
        new Set([fixture.providerIdentity.key]),
        Option.none(),
      ),
    );

    assert.deepStrictEqual(wave.order, [
      fixture.providerIdentity.key,
      fixture.consumerIdentity.key,
    ]);
    assert.deepStrictEqual([...wave.dirty], [fixture.providerIdentity.key]);

    const repeated = resultSuccess(
      planContextWave(
        fixture.graph,
        revisionVector([[fixture.providerIdentity.key, 1]]),
        new Set([fixture.providerIdentity.key]),
        Option.some(wave),
      ),
    );

    assert.strictEqual(repeated.coalesced, true);
    assert.strictEqual(repeated.dirty.size, 0);
  });

  it("publishes one complete changed projection without an intermediate cut", () => {
    const fixture = makeFixture();

    const wave = resultSuccess(
      planContextWave(
        fixture.graph,
        revisionVector([[fixture.providerIdentity.key, 1]]),
        new Set([fixture.providerIdentity.key]),
        Option.none(),
      ),
    );

    const changedSnapshots = new Map([
      [
        fixture.providerIdentity.key,
        { state: providerDefinition.S.changed, memory: {}, context: {} },
      ],
    ]);

    const result = resultSuccess(
      applyContextWave(wave, fixture.graph, changedSnapshots, fixture.baseline.ledger),
    );

    assert.strictEqual(result.publications.length, 1);
    assert.strictEqual(result.publications[0]?.issueOnly, false);
    assert.strictEqual(result.publications[0]?.machineTurnRevision, 1);
    assert.deepStrictEqual([...result.publications[0]!.projection.changedSlots], ["selected"]);
    assert.strictEqual(result.projections.length, 1);
    assert.strictEqual(result.projections[0]?.values.get("selected"), providerDefinition.S.changed);
  });

  it("carries each settled projection through an A-to-B-to-C wave", () => {
    const fixture = makeChainFixture();
    const [a, b, c] = fixture.identities;

    const wave = resultSuccess(
      planContextWave(
        fixture.graph,
        revisionVector([
          [a!.key, 1],
          [b!.key, 0],
        ]),
        new Set([a!.key]),
        Option.none(),
      ),
    );

    const changedSnapshots = new Map([
      [
        a!.key,
        {
          state: chainNodeDefinition.S.ready,
          memory: {},
          context: { value: chainSourceDefinition.S.changed },
        },
      ],
      [
        b!.key,
        {
          state: chainNodeDefinition.S.ready,
          memory: {},
          context: { value: chainSourceDefinition.S.ready },
        },
      ],
    ]);

    const result = resultSuccess(
      applyContextWave(wave, fixture.graph, changedSnapshots, fixture.baseline.ledger),
    );

    assert.deepStrictEqual(
      result.publications.map((publication) => publication.consumer),
      [b!.key, c!.key],
    );
    assert.strictEqual(result.projections[0]?.values.get("value"), chainSourceDefinition.S.changed);
    assert.strictEqual(result.projections[1]?.values.get("value"), chainSourceDefinition.S.changed);
  });

  it("uses exact authored equality for scalars and fixed named records", () => {
    assert.strictEqual(equalContextSelection(null, null), true);
    assert.strictEqual(equalContextSelection(undefined, undefined), true);
    assert.strictEqual(equalContextSelection(Number.NaN, Number.NaN), true);
    assert.strictEqual(
      equalContextSelection({ left: 1, right: "x" }, { left: 1, right: "x" }),
      true,
    );
    assert.strictEqual(equalContextSelection({ left: 1 }, { left: 2 }), false);
    assert.strictEqual(equalContextSelection({ left: 1 }, { left: 1, right: undefined }), false);
    const functionValue = () => 1;
    assert.strictEqual(equalContextSelection(functionValue, functionValue), true);
    assert.strictEqual(
      equalContextSelection(
        () => 1,
        () => 1,
      ),
      false,
    );
  });

  it("retains last-valid selection for one issue-only defect and retries a newer vector", () => {
    const fixture = makeFixture();
    let shouldDefect = false;

    const defectiveBinding = {
      ...fixture.binding,
      select: ({ state }) => {
        if (shouldDefect) throw new Error("selector defect");

        return state;
      },
    } satisfies ContextBinding<typeof consumerDefinition, typeof providerDefinition, "selected">;

    const graph = resultSuccess(
      buildContextGraph<typeof consumerDefinition, typeof providerDefinition>([defectiveBinding]),
    );

    const baseline = resultSuccess(
      installContextBaseline(
        graph,
        fixture.snapshots,
        revisionVector([[fixture.providerIdentity.key, 0]]),
      ),
    );

    shouldDefect = true;

    const firstWave = resultSuccess(
      planContextWave(
        graph,
        revisionVector([[fixture.providerIdentity.key, 1]]),
        new Set([fixture.providerIdentity.key]),
        Option.none(),
      ),
    );

    const issue = resultSuccess(
      applyContextWave(firstWave, graph, fixture.snapshots, baseline.ledger),
    );

    assert.strictEqual(issue.publications.length, 1);
    assert.strictEqual(issue.publications[0]?.issueOnly, true);
    assert.strictEqual(issue.publications[0]?.publicationRevision, 1);
    assert.strictEqual(issue.publications[0]?.machineTurnRevision, 0);
    assert.strictEqual(issue.projections[0]?.values.get("selected"), providerDefinition.S.ready);
    assert.strictEqual(issue.selectorDefects.length, 1);

    shouldDefect = false;

    const retryWave = resultSuccess(
      planContextWave(
        graph,
        revisionVector([[fixture.providerIdentity.key, 2]]),
        new Set([fixture.providerIdentity.key]),
        Option.some(firstWave),
      ),
    );

    const retrySnapshots = new Map([
      [
        fixture.providerIdentity.key,
        { state: providerDefinition.S.changed, memory: {}, context: {} },
      ],
    ]);

    const retry = resultSuccess(applyContextWave(retryWave, graph, retrySnapshots, issue.ledger));
    assert.strictEqual(retry.publications.length, 1);
    assert.strictEqual(retry.publications[0]?.issueOnly, false);
    assert.strictEqual(retry.publications[0]?.machineTurnRevision, 1);
  });

  it("rejects dependency cycles before retaining a graph", () => {
    const fixture = makeFixture();
    const selfBinding = { ...fixture.binding, consumer: fixture.providerIdentity.key };

    const selfResult = buildContextGraph<typeof consumerDefinition, typeof providerDefinition>([
      selfBinding,
    ]);

    assert.strictEqual(Result.isFailure(selfResult), true);

    if (Result.isFailure(selfResult))
      assert.strictEqual(selfResult.failure.code, "ContextDependencyCycle");
  });

  it("publishes owned graph, fence, wave, ledger, and publication envelopes", () => {
    const fixture = makeFixture();
    const graphBinding = [...fixture.graph.bindings.values()][0]![0]!;
    assert.ok(fixture.graph.providers instanceof Map);
    assert.ok(fixture.graph.bindings instanceof Map);
    assert.ok(fixture.graph.dependents instanceof Map);
    assert.notStrictEqual(graphBinding, fixture.binding);
    assert.notStrictEqual(graphBinding.providerFence, fixture.binding.providerFence);
    const consumerBindings = fixture.graph.bindings.get(fixture.consumerIdentity.key);

    if (consumerBindings === undefined) throw new Error("missing consumer bindings");
    assert.strictEqual(consumerBindings.length, 1);
    assert.strictEqual(fixture.baseline.projections.length, 1);

    const wave = resultSuccess(
      planContextWave(
        fixture.graph,
        revisionVector([[fixture.providerIdentity.key, 1]]),
        new Set([fixture.providerIdentity.key]),
        Option.none(),
      ),
    );

    assert.deepStrictEqual([...wave.dirty], [fixture.providerIdentity.key]);

    const result = resultSuccess(
      applyContextWave(
        wave,
        fixture.graph,
        new Map([
          [
            fixture.providerIdentity.key,
            { state: providerDefinition.S.changed, memory: {}, context: {} },
          ],
        ]),
        fixture.baseline.ledger,
      ),
    );

    assert.strictEqual(result.publications.length, 1);
    assert.strictEqual(result.ledger.entries.size, 1);
  });

  it("rejects issue-only revision overflow before changing the input cut", () => {
    const fixture = makeFixture();
    let shouldDefect = false;

    const defectiveBinding = {
      ...fixture.binding,
      select: ({ state }) => {
        if (shouldDefect) throw new Error("selector defect");

        return state;
      },
    } satisfies ContextBinding<typeof consumerDefinition, typeof providerDefinition, "selected">;

    const graph = resultSuccess(
      buildContextGraph<typeof consumerDefinition, typeof providerDefinition>([defectiveBinding]),
    );

    const baseline = resultSuccess(
      installContextBaseline(
        graph,
        fixture.snapshots,
        revisionVector([[fixture.providerIdentity.key, 0]]),
      ),
    );

    shouldDefect = true;

    const revisions = new Map([
      [
        fixture.consumerIdentity.key,
        { publicationRevision: Number.MAX_SAFE_INTEGER, machineTurnRevision: 4 },
      ],
    ]);

    const result = applyContextWave(
      resultSuccess(
        planContextWave(
          graph,
          revisionVector([[fixture.providerIdentity.key, 1]]),
          new Set([fixture.providerIdentity.key]),
          Option.none(),
        ),
      ),
      graph,
      fixture.snapshots,
      baseline.ledger,
      revisions,
    );

    assert.ok(Result.isFailure(result));

    if (Result.isFailure(result)) {
      assert.strictEqual(result.failure.code, "InvariantViolation");
      assert.deepStrictEqual(result.failure.path, ["publicationRevision"]);
      assert.strictEqual(result.failure.summary, "Revision counter cannot advance");
    }

    assert.deepStrictEqual(revisions.get(fixture.consumerIdentity.key), {
      publicationRevision: Number.MAX_SAFE_INTEGER,
      machineTurnRevision: 4,
    });
    assert.strictEqual(
      fixture.snapshots.get(fixture.providerIdentity.key)?.state,
      providerDefinition.S.ready,
    );
    shouldDefect = false;
  });

  it("rejects normal revision overflow before changing the input cut", () => {
    const fixture = makeFixture();

    const revisions = new Map([
      [
        fixture.consumerIdentity.key,
        { publicationRevision: Number.MAX_SAFE_INTEGER, machineTurnRevision: 0 },
      ],
    ]);

    const result = applyContextWave(
      resultSuccess(
        planContextWave(
          fixture.graph,
          revisionVector([[fixture.providerIdentity.key, 1]]),
          new Set([fixture.providerIdentity.key]),
          Option.none(),
        ),
      ),
      fixture.graph,
      new Map([
        [
          fixture.providerIdentity.key,
          { state: providerDefinition.S.changed, memory: {}, context: {} },
        ],
      ]),
      fixture.baseline.ledger,
      revisions,
    );

    assert.ok(Result.isFailure(result));

    if (Result.isFailure(result)) {
      assert.strictEqual(result.failure.code, "InvariantViolation");
      assert.deepStrictEqual(result.failure.path, ["publicationRevision"]);
      assert.strictEqual(result.failure.summary, "Revision counter cannot advance");
    }

    assert.deepStrictEqual(revisions.get(fixture.consumerIdentity.key), {
      publicationRevision: Number.MAX_SAFE_INTEGER,
      machineTurnRevision: 0,
    });
  });

  it("keeps passive observer defects from publishing or replacing dependencies", () => {
    const observer = makePassiveObserver<string>();
    const first = observer.observe((read) => `${read("provider", 1)}`);
    assert.strictEqual(first._tag, "passive-observation");
    assert.deepStrictEqual(observer.dependencies(), ["provider"]);

    const defect = observer.observe((read) => {
      read("next", 2);
      throw new Error("observer defect");
    });

    assert.strictEqual(defect._tag, "passive-defect");
    assert.deepStrictEqual(observer.dependencies(), ["provider"]);

    const replacement = observer.evaluate((read) => [read("next", 2), read("next", 2)]);
    assert.strictEqual(replacement._tag, "passive-observation");
    assert.deepStrictEqual(observer.dependencies(), ["next"]);
  });

  it("builds forward and reverse context graph indexes", () => {
    const fixture = makeFixture();
    assert.deepStrictEqual(
      fixture.graph.bindings.get(fixture.consumerIdentity.key)?.map((binding) => binding.slot),
      ["selected"],
    );
    assert.deepStrictEqual(
      [...(fixture.graph.dependents.get(fixture.providerIdentity.key) ?? [])],
      [fixture.consumerIdentity.key],
    );
    assert.deepStrictEqual(fixture.graph.order, [
      fixture.providerIdentity.key,
      fixture.consumerIdentity.key,
    ]);
  });

  it("propagates one provider revision in dependency order", () => {
    const fixture = makeChainFixture();
    const [source, middle, leaf] = fixture.identities;

    if (source === undefined || middle === undefined || leaf === undefined)
      throw new Error("chain identities are incomplete");

    const wave = resultSuccess(
      planContextWave(
        fixture.graph,
        revisionVector([
          [source.key, 1],
          [middle.key, 0],
        ]),
        new Set([source.key]),
        Option.none(),
      ),
    );

    const applied = resultSuccess(
      applyContextWave(
        wave,
        fixture.graph,
        new Map([
          [
            source.key,
            {
              state: chainNodeDefinition.S.ready,
              memory: {},
              context: { value: chainSourceDefinition.S.changed },
            },
          ],
          [
            middle.key,
            {
              state: chainNodeDefinition.S.ready,
              memory: {},
              context: { value: chainSourceDefinition.S.ready },
            },
          ],
        ]),
        fixture.baseline.ledger,
      ),
    );

    assert.deepStrictEqual(
      applied.publications.map((publication) => publication.consumer),
      [middle.key, leaf.key],
    );
  });

  it("rejects direct and indirect context cycles before publication", () => {
    const fixture = makeFixture();

    const direct = buildContextGraph<typeof consumerDefinition, typeof providerDefinition>([
      { ...fixture.binding, consumer: fixture.providerIdentity.key },
    ]);

    assert.ok(Result.isFailure(direct));

    if (Result.isFailure(direct)) assert.strictEqual(direct.failure.code, "ContextDependencyCycle");

    const chain = makeChainFixture();
    const [a, b] = chain.identities;

    if (a === undefined || b === undefined) throw new Error("chain identities are incomplete");

    const cyclicBindings: ContextBinding<
      typeof chainNodeDefinition,
      typeof chainNodeDefinition,
      "value"
    >[] = [
      {
        consumer: a.key,
        consumerIncarnation: a.incarnation,
        slot: "value",
        provider: b.ref,
        providerFence: {
          key: b.key,
          incarnation: b.incarnation,
          generation: 0,
          leaseEpoch: b.leaseEpoch,
        },
        select: ({ context }) => context.value,
      },
      {
        consumer: b.key,
        consumerIncarnation: b.incarnation,
        slot: "value",
        provider: a.ref,
        providerFence: {
          key: a.key,
          incarnation: a.incarnation,
          generation: 0,
          leaseEpoch: a.leaseEpoch,
        },
        select: ({ context }) => context.value,
      },
    ];

    const indirect = buildContextGraph<typeof chainNodeDefinition, typeof chainNodeDefinition>(
      cyclicBindings,
    );

    assert.ok(Result.isFailure(indirect));

    if (Result.isFailure(indirect))
      assert.strictEqual(indirect.failure.code, "ContextDependencyCycle");
    assert.ok(
      Result.isSuccess(
        topologicalContextOrder(fixture.graph, new Set([fixture.providerIdentity.key])),
      ),
    );
  });

  it("selects scalar provider state from one captured snapshot", () => {
    const fixture = makeFixture();

    const selected = resultSuccess(
      selectContext<typeof consumerDefinition, typeof providerDefinition, "selected">(
        fixture.binding,
        // SAFETY: The provider snapshot is the exact provider definition used by this binding fixture.
        { state: providerDefinition.S.changed, memory: {}, context: {} },
        7,
      ),
    );

    assert.strictEqual(selected.value, providerDefinition.S.changed);
    assert.strictEqual(selected.providerRevision, 7);
    assert.strictEqual(selected.binding, fixture.binding);
  });

  it("compares named records fieldwise by Object.is", () => {
    const left = { first: { value: 1 }, second: "same" };
    const right = { first: left.first, second: "same" };
    assert.strictEqual(equalContextSelection(left, right), true);
    assert.strictEqual(equalContextSelection(left, { ...right, second: "changed" }), false);
    assert.strictEqual(equalContextSelection(left, { first: { value: 1 }, second: "same" }), false);
  });

  it("publishes one wave when one named field changes", () => {
    const fixture = makeFixture();

    const wave = resultSuccess(
      planContextWave(
        fixture.graph,
        revisionVector([[fixture.providerIdentity.key, 1]]),
        new Set([fixture.providerIdentity.key]),
        Option.none(),
      ),
    );

    const next = resultSuccess(
      applyContextWave(
        wave,
        fixture.graph,
        new Map([
          [
            fixture.providerIdentity.key,
            { state: providerDefinition.S.changed, memory: {}, context: {} },
          ],
        ]),
        fixture.baseline.ledger,
      ),
    );

    assert.strictEqual(next.publications.length, 1);
    assert.deepStrictEqual([...next.publications[0]!.projection.changedSlots], ["selected"]);
  });

  it("publishes selected null without treating it as absence", () => {
    assert.strictEqual(equalContextSelection(null, null), true);
    assert.strictEqual(equalContextSelection(null, undefined), false);
    const fixture = makeFixture();

    const selected = resultSuccess(
      selectContext(
        { ...fixture.binding, select: () => contextValueOutsideAuthoredType(null) },
        { state: providerDefinition.S.ready, memory: {}, context: {} },
        1,
      ),
    );

    assert.strictEqual(selected.value, null);
  });

  it("publishes selected undefined separately from absent metadata", () => {
    assert.strictEqual(equalContextSelection(undefined, undefined), true);
    assert.strictEqual(equalContextSelection(undefined, null), false);
    const fixture = makeFixture();

    const selected = resultSuccess(
      selectContext(
        { ...fixture.binding, select: () => contextValueOutsideAuthoredType(undefined) },
        { state: providerDefinition.S.ready, memory: {}, context: {} },
        2,
      ),
    );

    assert.strictEqual(selected.value, undefined);

    const undefinedBinding = {
      ...fixture.binding,
      select: () => contextValueOutsideAuthoredType(undefined),
    };

    const undefinedGraph = resultSuccess(
      buildContextGraph<typeof consumerDefinition, typeof providerDefinition>([undefinedBinding]),
    );

    const undefinedBaseline = resultSuccess(
      installContextBaseline(
        undefinedGraph,
        fixture.snapshots,
        revisionVector([[fixture.providerIdentity.key, 0]]),
      ),
    );

    const entry = [...undefinedBaseline.ledger.entries.values()][0];
    assert.ok(entry !== undefined);
    assert.ok(Option.isSome(entry.lastValid));
    assert.strictEqual(entry.lastValid.value.value, undefined);
  });

  it("stores an authored diagnostic as ordinary context data", () => {
    const diagnostic = new Error("authored value");
    assert.strictEqual(equalContextSelection(diagnostic, diagnostic), true);
    const observer = makePassiveObserver<string>();
    const observed = observer.evaluate((read) => read("diagnostic", diagnostic));
    assert.strictEqual(observed._tag, "passive-observation");

    if (observed._tag === "passive-observation") assert.strictEqual(observed.value, diagnostic);
  });

  it("retains thrown selector defects without clearing consumer state", () => {
    const fixture = makeFixture();
    let defect = false;

    const binding = {
      ...fixture.binding,
      select: ({ state }: ActorContextSnapshot<typeof providerDefinition>) => {
        if (defect) throw new Error("selector defect");

        return state;
      },
    } satisfies ContextBinding<typeof consumerDefinition, typeof providerDefinition, "selected">;

    const graph = resultSuccess(
      buildContextGraph<typeof consumerDefinition, typeof providerDefinition>([binding]),
    );

    const baseline = resultSuccess(
      installContextBaseline(
        graph,
        fixture.snapshots,
        revisionVector([[fixture.providerIdentity.key, 0]]),
      ),
    );

    defect = true;

    const wave = resultSuccess(
      planContextWave(
        graph,
        revisionVector([[fixture.providerIdentity.key, 1]]),
        new Set([fixture.providerIdentity.key]),
        Option.none(),
      ),
    );

    const issue = resultSuccess(applyContextWave(wave, graph, fixture.snapshots, baseline.ledger));
    assert.strictEqual(issue.publications[0]?.issueOnly, true);
    assert.strictEqual(issue.projections[0]?.values.get("selected"), providerDefinition.S.ready);
  });

  it("coalesces adjacent provider revisions into one wave", () => {
    const fixture = makeFixture();

    const first = resultSuccess(
      planContextWave(
        fixture.graph,
        revisionVector([[fixture.providerIdentity.key, 1]]),
        new Set([fixture.providerIdentity.key]),
        Option.none(),
      ),
    );

    const latest = resultSuccess(
      planContextWave(
        fixture.graph,
        revisionVector([[fixture.providerIdentity.key, 3]]),
        new Set([fixture.providerIdentity.key]),
        Option.some(first),
      ),
    );

    assert.strictEqual(latest.providerRevision.get(fixture.providerIdentity.key), 3);
    assert.strictEqual(latest.coalesced, true);
    assert.deepStrictEqual([...latest.dirty], [fixture.providerIdentity.key]);
  });

  it("keeps unrelated provider publications out of the wave", () => {
    const fixture = makeFixture();

    const unrelated = resultSuccess(
      fixture.registry.reserveStable(actorRef(providerMachine, "unrelated")),
    ).key;

    const wave = resultSuccess(
      planContextWave(
        fixture.graph,
        revisionVector([[unrelated, 1]]),
        new Set([unrelated]),
        Option.none(),
      ),
    );

    assert.strictEqual(wave.dirty.size, 0);
    assert.deepStrictEqual(wave.order, []);
  });

  it("publishes affected consumers from one atomic wave cut", () => {
    const fixture = makeChainFixture();
    const source = fixture.identities[0];

    if (source === undefined) throw new Error("missing source identity");

    const wave = resultSuccess(
      planContextWave(
        fixture.graph,
        revisionVector([
          [source.key, 1],
          [fixture.identities[1]!.key, 1],
        ]),
        new Set([source.key]),
        Option.none(),
      ),
    );

    const snapshots = new Map(fixture.snapshots);
    snapshots.set(source.key, {
      state: chainNodeDefinition.S.ready,
      memory: {},
      context: { value: chainSourceDefinition.S.changed },
    });

    const result = resultSuccess(
      applyContextWave(wave, fixture.graph, snapshots, fixture.baseline.ledger),
    );

    assert.strictEqual(result.projections.length, result.publications.length);
    assert.strictEqual(
      result.publications.every((publication) => publication.projection.values.size === 1),
      true,
    );
  });

  it.effect("publishes and detaches context through real provider and consumer owners", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: contextWaveApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const providerRef = actorRef(providerMachine, "real-provider");

      const provider = yield* assembly.createActor({
        ref: providerRef,
        initial: preparedProviderSnapshot(),
      });

      const snapshots: Array<{ revision: number; state: unknown }> = [];

      const binding = {
        slot: "selected",
        provider: providerRef,
        providerFence: provider.fence,
        select: ({ state }) => state,
      } satisfies ActorContextBinding<
        typeof consumerDefinition,
        typeof providerDefinition,
        "selected"
      >;

      const consumer = yield* assembly.createActor({
        ref: actorRef(consumerMachine, "real-consumer"),
        initial: preparedConsumerSnapshot(),
        bindings: [binding],
        onSnapshot: (snapshot) =>
          snapshots.push({ revision: snapshot.revision, state: snapshot.context.selected }),
      });

      const first = provider.engine.dispatch(contextAdvance);
      assert.strictEqual(first.admitted, true);
      yield* Deferred.await(first.completion);
      yield* provider.engine.drain();
      yield* assembly.contextCoordinator.drain();
      yield* consumer.engine.drain();
      assert.strictEqual(consumer.engine.snapshot().context.selected, providerDefinition.S.changed);
      assert.strictEqual(consumer.engine.snapshot().revision, 1);
      const afterFirst = consumer.engine.snapshot();
      const snapshotCount = snapshots.length;

      const stale = consumer.engine.dispatchFact({
        _tag: "context-projection",
        provider: {
          fence: provider.fence,
          slot: "selected",
          revision: 0,
          value: providerDefinition.S.ready,
        },
      });

      assert.ok(Result.isSuccess(stale));
      yield* consumer.engine.drain();
      assert.deepStrictEqual(consumer.engine.snapshot(), afterFirst);
      assert.strictEqual(snapshots.length, snapshotCount);

      yield* Effect.provideContext(consumer.dispose(), assembly.context);
      const disposed = consumer.engine.snapshot();
      const late = provider.engine.dispatch(contextAdvance);
      assert.strictEqual(late.admitted, true);
      yield* Deferred.await(late.completion);
      yield* provider.engine.drain();
      yield* assembly.contextCoordinator.drain();
      assert.deepStrictEqual(consumer.engine.snapshot(), disposed);
      assert.strictEqual(consumer.engine.snapshot().context.selected, providerDefinition.S.changed);

      yield* Effect.provideContext(provider.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("preserves provider truth when a real context consumer mailbox overflows", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: contextWaveApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const providerRef = actorRef(providerMachine, "overflow-provider");

      const provider = yield* assembly.createActor({
        ref: providerRef,
        initial: preparedProviderSnapshot(),
      });

      const binding = {
        slot: "selected",
        provider: providerRef,
        providerFence: provider.fence,
        select: ({ state }) => state,
      } satisfies ActorContextBinding<
        typeof consumerDefinition,
        typeof providerDefinition,
        "selected"
      >;

      const started = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();

      const consumer = yield* assembly.createActor({
        ref: actorRef(consumerMachine, "overflow-consumer"),
        initial: preparedConsumerSnapshot(),
        bindings: [binding],
        onCommand: () =>
          Effect.gen(function* () {
            yield* Deferred.succeed(started, undefined);
            yield* Deferred.await(release);
          }),
      });

      const first = consumer.engine.dispatch(contextOpened);
      assert.strictEqual(first.admitted, true);
      yield* Deferred.await(started);

      for (let index = 0; index < 64; index += 1) consumer.engine.send(contextOpened);
      const providerDispatch = provider.engine.dispatch(contextAdvance);
      assert.strictEqual(providerDispatch.admitted, true);
      yield* Deferred.await(providerDispatch.completion);
      yield* provider.engine.drain();
      assert.strictEqual(provider.engine.snapshot().state, providerDefinition.S.changed);
      assert.strictEqual(consumer.engine.snapshot().context.selected, providerDefinition.S.ready);

      yield* Deferred.succeed(release, undefined);
      yield* consumer.engine.drain();
      yield* Effect.provideContext(
        consumer.lifecycle.command({ _tag: "actor:suspend", cause: { _tag: "attachment" } }),
        assembly.context,
      );
      yield* Effect.provideContext(
        consumer.lifecycle.command({ _tag: "actor:resume", cause: { _tag: "attachment" } }),
        assembly.context,
      );
      assert.strictEqual(consumer.engine.snapshot().context.selected, providerDefinition.S.changed);

      yield* Effect.provideContext(consumer.dispose(), assembly.context);
      yield* Effect.provideContext(provider.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
    }),
  );

  it("fences a late wave after consumer disposal", () => {
    const fixture = makeFixture();

    const wave = resultSuccess(
      planContextWave(
        fixture.graph,
        revisionVector([[fixture.providerIdentity.key, 1]]),
        new Set<ActorKey>(),
        Option.none(),
      ),
    );

    const result = resultSuccess(
      applyContextWave(wave, fixture.graph, fixture.snapshots, fixture.baseline.ledger),
    );

    assert.deepStrictEqual(result.publications, []);
    assert.strictEqual(result.ledger.providerRevisions.get(fixture.providerIdentity.key), 1);
  });

  it("handles provider disposal without stale selection", () => {
    const fixture = makeFixture();

    const wave = resultSuccess(
      planContextWave(
        fixture.graph,
        revisionVector([[fixture.providerIdentity.key, 1]]),
        new Set([fixture.providerIdentity.key]),
        Option.none(),
      ),
    );

    const result = applyContextWave(wave, fixture.graph, new Map(), fixture.baseline.ledger);
    assert.ok(Result.isFailure(result));

    if (Result.isFailure(result)) {
      assert.deepStrictEqual(result.failure.path, ["context", "provider"]);
      assert.strictEqual(result.failure.code, "MissingContextProvider");
    }
  });

  it("distinguishes provider incarnations at one actor key", () => {
    const fixture = makeFixture();
    fixture.registry.rollback(fixture.providerIdentity);

    const replacementIdentity = resultSuccess(
      fixture.registry.reserveStable(fixture.binding.provider),
    );

    assert.strictEqual(replacementIdentity.key, fixture.providerIdentity.key);
    assert.notStrictEqual(replacementIdentity.incarnation, fixture.providerIdentity.incarnation);

    const replacement = {
      ...fixture.binding,
      providerFence: {
        ...fixture.binding.providerFence,
        incarnation: replacementIdentity.incarnation,
      },
    };

    const result = buildContextGraph<typeof consumerDefinition, typeof providerDefinition>([
      fixture.binding,
      replacement,
    ]);

    assert.ok(Result.isFailure(result));

    if (Result.isFailure(result)) {
      assert.deepStrictEqual(result.failure.path, ["context"]);
      assert.strictEqual(result.failure.details.reason, "provider-incarnation");
    }
  });

  it("keeps an empty context wave free of synthetic publication", () => {
    const fixture = makeFixture();

    const wave = resultSuccess(
      planContextWave(
        fixture.graph,
        revisionVector([[fixture.providerIdentity.key, 0]]),
        new Set(),
        Option.none(),
      ),
    );

    const result = resultSuccess(
      applyContextWave(wave, fixture.graph, fixture.snapshots, fixture.baseline.ledger),
    );

    assert.deepStrictEqual(result.projections, []);
    assert.deepStrictEqual(result.publications, []);
  });

  it("keeps context delivery backpressure local", () => {
    const fixture = makeFixture();

    const wave = resultSuccess(
      planContextWave(
        fixture.graph,
        revisionVector([[fixture.providerIdentity.key, 1]]),
        new Set([fixture.providerIdentity.key]),
        Option.none(),
      ),
    );

    const snapshotBefore = fixture.snapshots.get(fixture.providerIdentity.key);

    const changedSnapshots = new Map([
      [
        fixture.providerIdentity.key,
        { state: providerDefinition.S.changed, memory: {}, context: {} },
      ],
    ]);

    const result = resultSuccess(
      applyContextWave(wave, fixture.graph, changedSnapshots, fixture.baseline.ledger),
    );

    assert.strictEqual(result.publications.length, 1);
    assert.strictEqual(fixture.snapshots.get(fixture.providerIdentity.key), snapshotBefore);
  });

  it("closes context waves through the owning runtime scope", () => {
    const fixture = makeFixture();
    const active = activateContextBaseline(fixture.baseline);
    assert.strictEqual(active.baseline, fixture.baseline);
    assert.strictEqual(active.ledger, fixture.baseline.ledger);
    assert.strictEqual(active.projections, fixture.baseline.projections);
  });

  it("keeps authored record field presence distinct from selected undefined", () => {
    assert.strictEqual(equalContextSelection({ field: undefined }, { field: undefined }), true);
    assert.strictEqual(equalContextSelection({}, { field: undefined }), false);
    assert.strictEqual(equalContextSelection({ field: null }, { field: undefined }), false);
  });

  it("exposes context dependency graphs with the expected topology", () => {
    const fixture = makeFixture();
    const binding = fixture.graph.bindings.get(fixture.consumerIdentity.key)?.[0];

    if (binding === undefined) throw new Error("missing graph binding");
    assert.ok(fixture.graph.providers instanceof Map);
    assert.ok(fixture.graph.bindings instanceof Map);
    assert.deepStrictEqual(fixture.graph.order, [
      fixture.providerIdentity.key,
      fixture.consumerIdentity.key,
    ]);
  });

  it("rejects context revision overflow before increment", () => {
    const fixture = makeFixture();

    const revisions = new Map([
      [
        fixture.consumerIdentity.key,
        { publicationRevision: Number.MAX_SAFE_INTEGER, machineTurnRevision: 0 },
      ],
    ]);

    const result = applyContextWave(
      resultSuccess(
        planContextWave(
          fixture.graph,
          revisionVector([[fixture.providerIdentity.key, 1]]),
          new Set([fixture.providerIdentity.key]),
          Option.none(),
        ),
      ),
      fixture.graph,
      new Map([
        [
          fixture.providerIdentity.key,
          { state: providerDefinition.S.changed, memory: {}, context: {} },
        ],
      ]),
      fixture.baseline.ledger,
      revisions,
    );

    assert.ok(Result.isFailure(result));
    assert.deepStrictEqual(revisions.get(fixture.consumerIdentity.key), {
      publicationRevision: Number.MAX_SAFE_INTEGER,
      machineTurnRevision: 0,
    });
  });
});

describe("pending regression scenarios", () => {
  it("suppresses a repeated selector defect at one provider revision while retaining a pending sibling change", () => {
    const registry = makeActorIdentityRegistry();
    const left = resultSuccess(registry.reserveStable(actorRef(providerMachine, "left")));
    const right = resultSuccess(registry.reserveStable(actorRef(providerMachine, "right")));
    const consumer = resultSuccess(registry.reserveStable(actorRef(consumerMachine, "sibling")));
    let leftCalls = 0;
    let rightCalls = 0;
    let defective = false;

    const fence = (identity: typeof left) => ({
      key: identity.key,
      incarnation: identity.incarnation,
      generation: 0,
      leaseEpoch: identity.leaseEpoch,
    });

    const bindings = [
      {
        consumer: consumer.key,
        consumerIncarnation: consumer.incarnation,
        slot: "left" as const,
        provider: left.ref,
        providerFence: fence(left),
        select: ({ state }: ActorContextSnapshot<typeof providerDefinition>) => {
          leftCalls += 1;

          if (defective) throw new Error("left defect");

          return state;
        },
      },
      {
        consumer: consumer.key,
        consumerIncarnation: consumer.incarnation,
        slot: "right" as const,
        provider: right.ref,
        providerFence: fence(right),
        select: ({ state }: ActorContextSnapshot<typeof providerDefinition>) => {
          rightCalls += 1;

          return state;
        },
      },
    ] satisfies ContextBinding<typeof siblingConsumerDefinition, typeof providerDefinition>[];

    const graph = resultSuccess(
      buildContextGraph<typeof siblingConsumerDefinition, typeof providerDefinition>(bindings),
    );

    const snapshots = new Map<ActorKey, ActorContextSnapshot<typeof providerDefinition>>([
      [left.key, { state: providerDefinition.S.ready, memory: {}, context: {} }],
      [right.key, { state: providerDefinition.S.ready, memory: {}, context: {} }],
    ]);

    const baseline = resultSuccess(
      installContextBaseline(
        graph,
        snapshots,
        revisionVector([
          [left.key, 0],
          [right.key, 0],
        ]),
      ),
    );

    defective = true;

    const firstWave = resultSuccess(
      planContextWave(
        graph,
        revisionVector([
          [left.key, 1],
          [right.key, 0],
        ]),
        new Set([left.key]),
        Option.none(),
      ),
    );

    const first = resultSuccess(applyContextWave(firstWave, graph, snapshots, baseline.ledger));
    assert.strictEqual(first.publications.length, 1);
    assert.strictEqual(first.publications[0]?.issueOnly, true);
    assert.strictEqual(first.projections[0]?.values.get("left"), providerDefinition.S.ready);
    assert.strictEqual(leftCalls, 2);
    assert.strictEqual(rightCalls, 1);

    const siblingWave = resultSuccess(
      planContextWave(
        graph,
        revisionVector([
          [left.key, 1],
          [right.key, 1],
        ]),
        new Set([right.key]),
        Option.some(firstWave),
      ),
    );

    const changedRight = new Map(snapshots);
    changedRight.set(right.key, { state: providerDefinition.S.changed, memory: {}, context: {} });
    const sibling = resultSuccess(applyContextWave(siblingWave, graph, changedRight, first.ledger));
    assert.deepStrictEqual(sibling.publications, []);
    assert.strictEqual(leftCalls, 2);
    assert.strictEqual(rightCalls, 2);

    const rightEntry = [...sibling.ledger.entries.values()].find(
      (entry) => entry.binding.slot === "right",
    );

    assert.ok(rightEntry !== undefined && Option.isSome(rightEntry.pending));

    if (Option.isNone(rightEntry.lastValid)) throw new Error("missing retained right selection");
    assert.strictEqual(rightEntry.lastValid.value.value, providerDefinition.S.ready);

    defective = false;

    const recoveredWave = resultSuccess(
      planContextWave(
        graph,
        revisionVector([
          [left.key, 2],
          [right.key, 1],
        ]),
        new Set([left.key]),
        Option.some(siblingWave),
      ),
    );

    const changedLeft = new Map(changedRight);
    changedLeft.set(left.key, { state: providerDefinition.S.changed, memory: {}, context: {} });

    const recovered = resultSuccess(
      applyContextWave(recoveredWave, graph, changedLeft, sibling.ledger),
    );

    assert.strictEqual(leftCalls, 3);
    assert.strictEqual(rightCalls, 2);
    assert.strictEqual(recovered.publications.length, 1);
    assert.strictEqual(recovered.publications[0]?.issueOnly, false);
    assert.deepStrictEqual(
      [...recovered.publications[0]!.projection.changedSlots],
      ["left", "right"],
    );
    assert.deepStrictEqual(
      [...recovered.publications[0]!.projection.values.values()],
      [providerDefinition.S.changed, providerDefinition.S.changed],
    );
  });

  it("uses exact authored equality for scalars, arrays, and fixed named records", () => {
    const array = [1, 2];
    const functionValue = () => 1;
    const symbol = Symbol("selection");
    assert.strictEqual(equalContextSelection(Number.NaN, Number.NaN), true);
    assert.strictEqual(equalContextSelection(null, undefined), false);
    assert.strictEqual(equalContextSelection(array, array), true);
    assert.strictEqual(equalContextSelection(array, [1, 2]), false);
    assert.strictEqual(equalContextSelection(functionValue, functionValue), true);
    assert.strictEqual(
      equalContextSelection(functionValue, () => 1),
      false,
    );
    assert.strictEqual(equalContextSelection(symbol, symbol), true);
    assert.strictEqual(equalContextSelection(symbol, Symbol("selection")), false);
    assert.strictEqual(equalContextSelection({ a: 1, b: array }, { a: 1, b: array }), true);
    assert.strictEqual(equalContextSelection({ a: 1 }, { a: 1, b: undefined }), false);
    assert.strictEqual(equalContextSelection({ a: 1, b: array }, { a: 1, b: [1, 2] }), false);

    const accessor = {
      get value() {
        throw new Error("reflective getter");
      },
    };

    assert.strictEqual(equalContextSelection(accessor, accessor), false);
    const fixture = makeFixture();

    const selected = selectContext(
      { ...fixture.binding, select: () => contextValueOutsideAuthoredType(accessor.value) },
      { state: providerDefinition.S.ready, memory: {}, context: {} },
      1,
    );

    assert.ok(Result.isFailure(selected));

    if (Result.isFailure(selected)) assert.strictEqual(selected.failure.diagnostic.code, "Defect");
  });

  it("owns selected records and arrays across source and publication mutation", () => {
    const fixture = makeFixture();
    const source = { value: 1, nested: { count: 1 }, items: [1] };

    const binding = {
      ...fixture.binding,
      select: () => contextValueOutsideAuthoredType(source),
    };

    const graph = resultSuccess(
      buildContextGraph<typeof consumerDefinition, typeof providerDefinition>([binding]),
    );

    const baseline = resultSuccess(
      installContextBaseline(
        graph,
        fixture.snapshots,
        revisionVector([[fixture.providerIdentity.key, 0]]),
      ),
    );

    const entry = [...baseline.ledger.entries.values()][0];
    assert.ok(entry !== undefined && Option.isSome(entry.lastValid));
    source.value = 2;
    source.nested.count = 2;
    source.items.push(2);
    assert.strictEqual(
      JSON.stringify(entry.lastValid.value.value),
      JSON.stringify({
        value: 1,
        nested: { count: 1 },
        items: [1],
      }),
    );
    const baselineValue = baseline.projections[0]?.values.get("selected");
    assert.ok(baselineValue !== undefined);
    Object.assign(baselineValue, { value: 99, nested: { count: 99 }, items: [99] });
    assert.strictEqual(
      JSON.stringify(entry.lastValid.value.value),
      JSON.stringify({
        value: 1,
        nested: { count: 1 },
        items: [1],
      }),
    );

    const wave = resultSuccess(
      planContextWave(
        graph,
        revisionVector([[fixture.providerIdentity.key, 1]]),
        new Set([fixture.providerIdentity.key]),
        Option.none(),
      ),
    );

    const next = resultSuccess(applyContextWave(wave, graph, fixture.snapshots, baseline.ledger));
    assert.deepStrictEqual([...next.publications[0]!.projection.changedSlots], ["selected"]);
    assert.strictEqual(
      JSON.stringify(next.projections[0]?.values.get("selected")),
      JSON.stringify({
        value: 2,
        nested: { count: 2 },
        items: [1, 2],
      }),
    );
    Object.assign(next.projections[0]!.values.get("selected")!, { value: 77 });
    const nextEntry = [...next.ledger.entries.values()][0];
    assert.ok(nextEntry !== undefined && Option.isSome(nextEntry.lastValid));
    assert.strictEqual(
      JSON.stringify(nextEntry.lastValid.value.value),
      JSON.stringify({
        value: 2,
        nested: { count: 2 },
        items: [1, 2],
      }),
    );

    const arraySource = [1];

    const arrayBinding = {
      ...fixture.binding,
      select: () => contextValueOutsideAuthoredType(arraySource),
    };

    const arrayGraph = resultSuccess(
      buildContextGraph<typeof consumerDefinition, typeof providerDefinition>([arrayBinding]),
    );

    const arrayBaseline = resultSuccess(
      installContextBaseline(
        arrayGraph,
        fixture.snapshots,
        revisionVector([[fixture.providerIdentity.key, 0]]),
      ),
    );

    arraySource.push(2);
    const arrayPublished = arrayBaseline.projections[0]?.values.get("selected");
    assert.ok(Array.isArray(arrayPublished));
    arrayPublished.push(99);
    const arrayEntry = [...arrayBaseline.ledger.entries.values()][0];
    assert.ok(arrayEntry !== undefined && Option.isSome(arrayEntry.lastValid));
    assert.strictEqual(JSON.stringify(arrayEntry.lastValid.value.value), "[1]");

    const arrayWave = resultSuccess(
      planContextWave(
        arrayGraph,
        revisionVector([[fixture.providerIdentity.key, 1]]),
        new Set([fixture.providerIdentity.key]),
        Option.none(),
      ),
    );

    const sameArray = resultSuccess(
      applyContextWave(arrayWave, arrayGraph, fixture.snapshots, arrayBaseline.ledger),
    );

    assert.deepStrictEqual(sameArray.publications, []);
    const retainedArray = [...sameArray.ledger.entries.values()][0];
    assert.ok(retainedArray !== undefined && Option.isSome(retainedArray.lastValid));
    assert.strictEqual(JSON.stringify(retainedArray.lastValid.value.value), "[1]");
  });

  it("retains registered operation and context selector identities inside owned context", () => {
    const fixture = makeFixture();

    const operation = resource({
      id: "context-wave/selected-operation",
      key: (id: string) => [id] as const,
      lookup: (id: string) => Effect.succeed(id),
    });

    const contextSelector = providerDefinition.select(({ state }) => state);
    const snapshot = { state: providerDefinition.S.ready, memory: {}, context: {} };

    const select = (value: unknown) =>
      resultSuccess(
        selectContext(
          { ...fixture.binding, select: () => contextValueOutsideAuthoredType(value) },
          snapshot,
          1,
        ),
      ).value;

    const selectedOperation = select(operation);
    assert.strictEqual(selectedOperation, operation);
    assert.strictEqual(isConstructedOperation(selectedOperation), true);

    const selectedContextSelector = select(contextSelector);
    assert.strictEqual(selectedContextSelector, contextSelector);
    assert.ok(Result.isSuccess(decodeEventPayloadResult({ selected: selectedContextSelector })));

    const lookalike = { ...contextSelector };
    assert.notStrictEqual(select(lookalike), lookalike);

    const selectedNested: unknown = select({
      operation,
      contextSelector,
      items: [operation, contextSelector],
    });

    if (
      !Predicate.isObject(selectedNested) ||
      !("operation" in selectedNested) ||
      !("contextSelector" in selectedNested) ||
      !("items" in selectedNested) ||
      !Array.isArray(selectedNested.items)
    )
      throw new Error("expected selected nested context");

    assert.strictEqual(selectedNested.operation, operation);
    assert.strictEqual(selectedNested.contextSelector, contextSelector);
    assert.strictEqual(selectedNested.items[0], operation);
    assert.strictEqual(selectedNested.items[1], contextSelector);
  });

  it("retains registered selector identity after its mutable kind changes or is deleted", () => {
    const fixture = makeFixture();
    const snapshot = { state: providerDefinition.S.ready, memory: {}, context: {} };

    const select = (value: unknown) =>
      resultSuccess(
        selectContext(
          { ...fixture.binding, select: () => contextValueOutsideAuthoredType(value) },
          snapshot,
          1,
        ),
      ).value;

    for (const changeKind of ["changed", "deleted"] as const) {
      const selector = providerDefinition.select(({ state }) => state);

      assert.strictEqual(
        changeKind === "changed"
          ? Reflect.set(selector, "kind", "changed")
          : Reflect.deleteProperty(selector, "kind"),
        true,
      );
      assert.strictEqual(select(selector), selector);
      assert.ok(
        Result.isSuccess(
          decodeDefinitionConfigResult({
            id: "selected-context",
            states: ["ready"],
            events: {},
            context: { selected: select(selector) },
          }),
        ),
      );

      const nested: unknown = select({ selector, items: [selector] });
      assert.ok(Predicate.isObject(nested) && "selector" in nested && "items" in nested);
      assert.strictEqual(nested.selector, selector);
      assert.ok(Array.isArray(nested.items));
      assert.strictEqual(nested.items[0], selector);
      assert.ok(Result.isSuccess(decodeEventPayloadResult({ selected: nested })));

      const lookalike = { ...selector };
      const copiedLookalike = select(lookalike);
      assert.notStrictEqual(copiedLookalike, lookalike);
      assert.strictEqual(isRegisteredContextSelector(copiedLookalike), false);
      assert.ok(
        Result.isFailure(
          decodeDefinitionConfigResult({
            id: "lookalike-context",
            states: ["ready"],
            events: {},
            context: { selected: copiedLookalike },
          }),
        ),
      );
    }
  });

  it("retains owned context for nested mutation and publishes a replaced field reference", () => {
    const fixture = makeFixture();
    const nested = { count: 1 };
    const source = { nested };

    const binding = {
      ...fixture.binding,
      select: () => contextValueOutsideAuthoredType({ nested: source.nested }),
    };

    const graph = resultSuccess(
      buildContextGraph<typeof consumerDefinition, typeof providerDefinition>([binding]),
    );

    const baseline = resultSuccess(
      installContextBaseline(
        graph,
        fixture.snapshots,
        revisionVector([[fixture.providerIdentity.key, 0]]),
      ),
    );

    nested.count = 2;
    const original = [...baseline.ledger.entries.values()][0];
    assert.ok(original !== undefined && Option.isSome(original.lastValid));
    assert.strictEqual(JSON.stringify(original.lastValid.value.value), '{"nested":{"count":1}}');
    const baselineProjection = baseline.projections[0]?.values.get("selected");
    assert.ok(baselineProjection !== undefined);
    Object.assign(baselineProjection, { nested: { count: 99 } });

    const firstWave = resultSuccess(
      planContextWave(
        graph,
        revisionVector([[fixture.providerIdentity.key, 1]]),
        new Set([fixture.providerIdentity.key]),
        Option.none(),
      ),
    );

    const first = resultSuccess(
      applyContextWave(firstWave, graph, fixture.snapshots, baseline.ledger),
    );

    assert.deepStrictEqual(first.publications, []);
    assert.strictEqual(JSON.stringify(original.lastValid.value.value), '{"nested":{"count":1}}');
    const retained = [...first.ledger.entries.values()][0];
    assert.ok(retained !== undefined && Option.isSome(retained.lastValid));
    assert.strictEqual(JSON.stringify(retained.lastValid.value.value), '{"nested":{"count":1}}');

    const secondWave = resultSuccess(
      planContextWave(
        graph,
        revisionVector([[fixture.providerIdentity.key, 2]]),
        new Set([fixture.providerIdentity.key]),
        Option.some(firstWave),
      ),
    );

    const sameField = resultSuccess(
      applyContextWave(secondWave, graph, fixture.snapshots, first.ledger),
    );

    assert.deepStrictEqual(sameField.publications, []);

    source.nested = { count: 2 };

    const thirdWave = resultSuccess(
      planContextWave(
        graph,
        revisionVector([[fixture.providerIdentity.key, 3]]),
        new Set([fixture.providerIdentity.key]),
        Option.some(secondWave),
      ),
    );

    const newFieldIdentity = resultSuccess(
      applyContextWave(thirdWave, graph, fixture.snapshots, sameField.ledger),
    );

    assert.strictEqual(newFieldIdentity.publications.length, 1);
    assert.deepStrictEqual(
      [...newFieldIdentity.publications[0]!.projection.changedSlots],
      ["selected"],
    );
    assert.strictEqual(
      JSON.stringify(newFieldIdentity.projections[0]?.values.get("selected")),
      '{"nested":{"count":2}}',
    );
  });

  it("retains every unresolved ancestor requirement when context debt is updated", () => {
    const settleDebt = (...args: Parameters<typeof reconcileContextEdgeDebt>) =>
      resultSuccess(reconcileContextEdgeDebt(...args));

    const fixture = makeFixture();
    const a = fixture.providerIdentity.key;
    const x = fixture.consumerIdentity.key;
    const edgeA = a;
    const edgeX = x;
    const aCut = { fence: fixture.binding.providerFence, revision: 2 };
    const xCut = { fence: { ...fixture.binding.providerFence, key: x }, revision: 3 };
    const aRequirement = new Map([[a, aCut]]);
    const xRequirement = new Map([[x, xCut]]);
    const aDebt = settleDebt(new Map(), edgeA, aRequirement, new Map());
    const mergedEdgeDebt = settleDebt(aDebt, edgeA, xRequirement, new Map());
    assert.deepStrictEqual([...mergedEdgeDebt.get(edgeA)!.keys()], [a, x]);
    const xOnlyCovered = settleDebt(mergedEdgeDebt, edgeA, new Map(), xRequirement);
    assert.deepStrictEqual([...xOnlyCovered.get(edgeA)!.keys()], [a]);
    const bothDebt = settleDebt(aDebt, edgeX, xRequirement, new Map());
    assert.deepStrictEqual([...bothDebt.keys()], [edgeA, edgeX]);
    assert.strictEqual(aDebt.get(edgeA)?.get(a)?.revision, 2);

    const unrelatedLocalPublication = settleDebt(bothDebt, edgeX, new Map(), new Map());

    assert.strictEqual(unrelatedLocalPublication.get(edgeA)?.get(a)?.revision, 2);

    const staleCoverage = settleDebt(
      unrelatedLocalPublication,
      edgeA,
      new Map(),
      new Map([[a, { ...aCut, revision: 1 }]]),
    );

    assert.strictEqual(staleCoverage.get(edgeA)?.get(a)?.revision, 2);
    const xSettled = settleDebt(staleCoverage, edgeX, new Map(), xRequirement);
    assert.strictEqual(xSettled.has(edgeX), false);
    assert.strictEqual(xSettled.get(edgeA)?.get(a)?.revision, 2);
    const aSettled = settleDebt(xSettled, edgeA, new Map(), aRequirement);
    assert.strictEqual(aSettled.size, 0);

    const consumer = resultSuccess(
      fixture.registry.reserveStable(actorRef(consumerMachine, "lineage")),
    ).key;

    const first = resultSuccess(
      reconcileContextLineage(consumer, new Map(), [
        { slot: "left", cut: xCut, lineage: aRequirement },
        { slot: "right", cut: aCut, lineage: new Map() },
      ]),
    );

    assert.deepStrictEqual([...first.keys()], [a, x]);
    assert.strictEqual(
      resultSuccess(
        reconcileContextLineage(consumer, first, [
          { slot: "left", cut: xCut, lineage: aRequirement },
          { slot: "right", cut: aCut, lineage: new Map() },
        ]),
      ),
      first,
    );

    const conflict = reconcileContextLineage(consumer, first, [
      { slot: "left", cut: xCut, lineage: aRequirement },
      { slot: "right", cut: aCut, lineage: new Map([[x, { ...xCut, revision: 2 }]]) },
    ]);

    assert.ok(Result.isFailure(conflict));

    if (Result.isFailure(conflict)) {
      assert.strictEqual(conflict.failure.code, "MissingContextProvider");
      assert.deepStrictEqual(conflict.failure.path, ["contextBindings", "right"]);
    }
  });

  it("does not replace unresolved debt with a different incarnation at the same actor key", () => {
    const fixture = makeFixture();
    const ancestor = fixture.providerIdentity.key;
    const oldCut = { fence: fixture.binding.providerFence, revision: 2 };

    const prior = resultSuccess(
      reconcileContextEdgeDebt(new Map(), ancestor, new Map([[ancestor, oldCut]]), new Map()),
    );

    fixture.registry.rollback(fixture.providerIdentity);
    const replacement = resultSuccess(fixture.registry.reserveStable(fixture.binding.provider));
    assert.strictEqual(replacement.key, ancestor);

    const newCut = {
      fence: { ...oldCut.fence, incarnation: replacement.incarnation },
      revision: 1,
    };

    const mixed = reconcileContextEdgeDebt(
      prior,
      ancestor,
      new Map([[ancestor, newCut]]),
      new Map(),
    );

    assert.ok(Result.isFailure(mixed));

    if (Result.isFailure(mixed)) {
      assert.strictEqual(mixed.failure.code, "MissingContextProvider");
      assert.deepStrictEqual(mixed.failure.path, ["context", "debt"]);
    }

    assert.strictEqual(
      prior.get(ancestor)?.get(ancestor)?.fence.incarnation,
      oldCut.fence.incarnation,
    );

    const newOnlyCoverage = resultSuccess(
      reconcileContextEdgeDebt(prior, ancestor, new Map(), new Map([[ancestor, newCut]])),
    );

    assert.strictEqual(newOnlyCoverage.get(ancestor)?.get(ancestor)?.revision, oldCut.revision);

    const oldCoverage = resultSuccess(
      reconcileContextEdgeDebt(prior, ancestor, new Map(), new Map([[ancestor, oldCut]])),
    );

    assert.strictEqual(oldCoverage.has(ancestor), false);

    const acceptedNew = resultSuccess(
      reconcileContextEdgeDebt(oldCoverage, ancestor, new Map([[ancestor, newCut]]), new Map()),
    );

    const staleOldCoverage = resultSuccess(
      reconcileContextEdgeDebt(acceptedNew, ancestor, new Map(), new Map([[ancestor, oldCut]])),
    );

    assert.strictEqual(
      staleOldCoverage.get(ancestor)?.get(ancestor)?.fence.incarnation,
      newCut.fence.incarnation,
    );
  });
});
