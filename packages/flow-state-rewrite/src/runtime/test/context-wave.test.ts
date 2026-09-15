import { assert, describe, it } from "@effect/vitest";
import { Deferred, Effect, Option, Result } from "effect";

import { app, module } from "../../app/app.js";
import { definition } from "../../definition/definition.js";
import { machine } from "../../machine/machine.js";
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

  const fence = (identity: (typeof identities)[number]): ActorFence => ({
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
  // SETUP: Build a two-provider graph with one consumer bound to both slots; make the left selector throw at provider revision 1 and count selector calls, while the right selector remains valid.
  // ACTION: Apply the left revision-1 defect, then apply only a newer right-provider revision while the left vector entry remains 1; finally apply a newer left revision with the selector recovered.
  // ASSERT: The left selector is not rerun for the same actor/provider cut and last-valid left context remains visible. A newer right-provider wave may publish its own issue-only/aggregate outcome, but it must not classify the unchanged left defect as a new retry; recovery at left revision 2 emits one clean aggregate publication containing the pending right change and recovered left value.
  it.todo(
    "suppresses a repeated selector defect at one provider revision while retaining a pending sibling change",
  );

  // SETUP: Extend the current scalar/named-record equality table with complete-value arrays, NaN, null, explicit undefined, function identity, symbol identity, missing fields, and reflective getters.
  // ACTION: Compare same-reference and fresh-reference values, change one fixed record field, and run a selector through the normal defect capture path when a getter throws.
  // ASSERT: Scalars and non-record values use Object.is; arrays compare as complete values by identity; named records compare only their fixed authored fields fieldwise with Object.is; missing differs from explicit undefined; NaN, functions, symbols, and null retain their authored identity semantics; selector defects stay in the diagnostic lane.
  it.todo("uses exact authored equality for scalars, arrays, and fixed named records");

  // Setup: Use the real selected context lineage/debt owner with a consumer depending on independent ancestors A and X; establish unresolved required cuts for A and then X through rejected projection outcomes.
  // Action: Apply an unrelated local publication, reconcile only X, then reconcile A with an attested projection or no-op ticket; inspect compatibility through the actual lineage selection result.
  // Assert: New X debt does not replace A debt, local publication clears neither, and reconciling X leaves A required. Only matching fence/revision coverage clears each watermark; incompatible shared ancestors stay blocked and no completed wave history is retained.
  it.todo("retains every unresolved ancestor requirement when context debt is updated");
});
