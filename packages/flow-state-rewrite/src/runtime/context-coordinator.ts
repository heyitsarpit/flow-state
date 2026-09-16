import {
  Deferred,
  Effect,
  Exit,
  Fiber,
  Option,
  Predicate,
  Queue,
  Result,
  Schema,
  Scope,
  Semaphore,
} from "effect";

import { isRegisteredContextSelector, isRegisteredStateToken } from "../definition/schema.js";
import { Diagnostic, Failure, type PublicDiagnostic } from "../diagnostic/diagnostic.js";
import type { MachineDefinition } from "../machine/grammar.js";
import { isConstructedOperation } from "../operation/operation.js";
import type { ActorContextSnapshot, ActorFence, ActorKey } from "./actor-admission.js";
import type { ActorEngine } from "./actor-engine.js";
import type { ActorRef } from "./actor-ref.js";
import {
  applyContextWave,
  planContextWave,
  ownContextValue,
  type ContextBinding,
  type ContextGraph,
  type ContextSelectionLedger,
} from "./context-wave.js";
import { reconcileContextLineage, type ContextLineage } from "./context/lineage.js";
import type { ContextProjectionCarrier, ProjectionFact } from "./turn-plan.js";

// FLOW_STATE_ALLOW_UNKNOWN: provider-owned payloads are opaque until this carrier's ref/fence witness matches an admitted binding.
type OpaqueActorValue = unknown;

type CoordinatorSnapshot = {
  state: OpaqueActorValue;
  memory: OpaqueActorValue;
  context: OpaqueActorValue;
  revision: number;
};

const ownCoordinatorSnapshot = (snapshot: CoordinatorSnapshot) => ({
  state: ownContextValue(snapshot.state),
  memory: ownContextValue(snapshot.memory),
  context: ownContextValue(snapshot.context),
  revision: snapshot.revision,
});

type CapturedProvider = {
  ref: ActorRef;
  fence: ActorFence;
  snapshot: CoordinatorSnapshot;
};

type PlannedContext =
  | { phase: "no-projection"; commit: () => void; defective: boolean }
  | {
      phase: "projection";
      carrier: ContextProjectionCarrier;
      commit: () => void;
      defective: boolean;
    };

type ContextAttestation = {
  origin: { fence: ActorFence; revision: number; generation: number };
  graphGeneration: number;
  consumerFence: ActorFence;
  expectedRevision: number;
  requiredVector: Map<ActorKey, number>;
  witness: ContextTicketWitness;
  validate: (
    origin: { fence: ActorFence; revision: number; generation: number },
    graphGeneration: number,
  ) => boolean;
};

type CoordinatorTicket = {
  wait: Effect.Effect<
    { status: "published" | "no-op" | "stale"; snapshot: CoordinatorSnapshot },
    PublicDiagnostic
  >;
  cancel: () => void;
};

type CoordinatorNode = {
  ref: ActorRef;
  fence: ActorFence;
  providers: Array<{ key: ActorKey; slot: string }>;
  snapshot: () => CoordinatorSnapshot;
  plan: (
    snapshots: Map<ActorKey, CapturedProvider>,
  ) => Result.Result<PlannedContext, PublicDiagnostic>;
  // The carrier exists only when the selected wave has a projection to offer.
  offer: (
    carrier: ContextProjectionCarrier,
    attestation: ContextAttestation,
  ) => Result.Result<CoordinatorTicket, PublicDiagnostic>;
};

type RegisteredNode = { node: CoordinatorNode; open: boolean; lineage: ContextLineage };

type ContextWaveReceipt = {
  origin: { fence: ActorFence; revision: number; generation: number };
  graphGeneration: number;
  vector: Map<ActorKey, number>;
  outcomes: Map<ActorKey, "published" | "no-op" | "stale" | "rejected" | "blocked" | "defect">;
  failures: Map<ActorKey, PublicDiagnostic>;
};

type Root = {
  fence: ActorFence;
  snapshot: CoordinatorSnapshot;
  completion: Deferred.Deferred<ContextWaveReceipt, PublicDiagnostic>;
  captured: boolean;
};

type RootSlot = {
  active: Option.Option<Root>;
  pending: Option.Option<Root>;
  latest: Option.Option<Root>;
};

const unavailableProvider = (key: ActorKey) =>
  Failure({
    code: "MissingContextProvider",
    path: ["context", "provider"],
    details: { provider: key },
    summary: "A captured context provider is unavailable.",
    help: "Keep the admitted provider active through its context wave.",
  });

const sameFence = (left: ActorFence, right: ActorFence) =>
  left.key === right.key &&
  left.incarnation === right.incarnation &&
  left.generation === right.generation &&
  left.leaseEpoch === right.leaseEpoch;

const contextTicketMint = Symbol("context-ticket-mint");

type ContextPayload = ContextProjectionCarrier["providers"][number]["value"];

type CapturedPayload =
  | { phase: "identity"; value: ContextPayload }
  | {
      phase: "structural";
      value: ContextPayload;
      prototype: ContextPayload;
      fields: Array<{
        key: PropertyKey;
        configurable: boolean;
        enumerable: boolean;
        writable: boolean;
        value: CapturedPayload;
      }>;
    };

type CapturedSelectorDefect = {
  defect: PublicDiagnostic;
  classification: Diagnostic["classification"];
  code: Diagnostic["code"];
  path: Array<PublicDiagnostic["path"][number]>;
  details: Array<{
    key: string;
    value: PublicDiagnostic["details"][string];
  }>;
  summary: string;
  help: string;
};

const isStructuralPayload = (value: ContextPayload) => {
  if (
    !Predicate.isObject(value) ||
    isRegisteredStateToken(value) ||
    isRegisteredContextSelector(value) ||
    isConstructedOperation(value)
  )
    return false;

  if (Array.isArray(value)) return true;
  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
};

// Preserve authored object identity while attesting the owned structural fields and cycles.
const captureContextPayload = (value: ContextPayload) => {
  const seen = new Map<ContextPayload, CapturedPayload>();

  // RETURN_TYPE: Recursive descriptor capture retains the tagged payload phase.
  const capture = (current: ContextPayload): CapturedPayload => {
    if (!isStructuralPayload(current) || !Predicate.isObject(current))
      return { phase: "identity", value: current };
    const prior = seen.get(current);

    if (prior !== undefined) return prior;

    const captured: Extract<CapturedPayload, { phase: "structural" }> = {
      phase: "structural",
      value: current,
      prototype: Object.getPrototypeOf(current),
      fields: [],
    };

    seen.set(current, captured);

    for (const key of Reflect.ownKeys(current)) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key);

      if (descriptor === undefined || !("value" in descriptor))
        throw new TypeError("Context carrier contains an accessor property");

      captured.fields.push({
        key,
        configurable: descriptor.configurable === true,
        enumerable: descriptor.enumerable === true,
        writable: descriptor.writable === true,
        value: capture(descriptor.value),
      });
    }

    return captured;
  };

  const expected = capture(value);

  // RETURN_TYPE: Recursive comparison follows the captured object graph without evaluating getters.
  const matches = (
    current: ContextPayload,
    captured: CapturedPayload,
    visited: Set<ContextPayload>,
  ): boolean => {
    if (!Object.is(current, captured.value)) return false;

    if (captured.phase === "identity") return true;

    if (!isStructuralPayload(current) || !Predicate.isObject(current)) return false;

    if (Object.getPrototypeOf(current) !== captured.prototype) return false;

    if (visited.has(current)) return true;
    visited.add(current);

    const keys = Reflect.ownKeys(current);

    return (
      keys.length === captured.fields.length &&
      captured.fields.every((field, index) => {
        if (keys[index] !== field.key) return false;
        const descriptor = Object.getOwnPropertyDescriptor(current, field.key);

        return (
          descriptor !== undefined &&
          "value" in descriptor &&
          (descriptor.configurable === true) === field.configurable &&
          (descriptor.enumerable === true) === field.enumerable &&
          (descriptor.writable === true) === field.writable &&
          matches(descriptor.value, field.value, visited)
        );
      })
    );
  };

  return (current: ContextPayload) => matches(current, expected, new Set());
};

const matchesCapturedLead = (
  lead: Extract<ProjectionFact, { _tag: "context-projection" }>["provider"],
  expected: ContextProjectionCarrier["providers"][number] | undefined,
) =>
  expected !== undefined &&
  sameFence(lead.fence, expected.fence) &&
  lead.slot === expected.slot &&
  lead.revision === expected.revision;

const readCarrierProviders = (providers: ContextProjectionCarrier["providers"]) => {
  if (!Array.isArray(providers)) return undefined;

  const entries: ContextProjectionCarrier["providers"] = [];

  for (let index = 0; index < providers.length; index += 1) {
    const provider = providers[index];

    if (provider === undefined) return undefined;
    entries[index] = provider;
  }

  return entries;
};

const readCarrierSelectorDefects = (
  selectorDefects: ContextProjectionCarrier["selectorDefects"],
) => {
  if (!Array.isArray(selectorDefects)) return undefined;

  const entries: ContextProjectionCarrier["selectorDefects"] = [];

  for (let index = 0; index < selectorDefects.length; index += 1) {
    const defect = selectorDefects[index];

    if (defect === undefined) return undefined;
    entries[index] = defect;
  }

  return entries;
};

const captureSelectorDefect = (defect: PublicDiagnostic) => {
  const decoded = Schema.decodeUnknownResult(Diagnostic)(defect);

  if (decoded._tag === "Failure") return undefined;
  const path: CapturedSelectorDefect["path"] = [];

  for (let index = 0; index < decoded.success.path.length; index += 1) {
    const segment = decoded.success.path[index];

    if (segment === undefined) return undefined;
    path[index] = segment;
  }

  const keys = Reflect.ownKeys(decoded.success.details);
  const details: CapturedSelectorDefect["details"] = [];

  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];

    if (typeof key !== "string") return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(decoded.success.details, key);

    if (descriptor === undefined || !("value" in descriptor)) return undefined;
    details[index] = { key, value: descriptor.value };
  }

  return {
    defect,
    classification: decoded.success.classification,
    code: decoded.success.code,
    path,
    details,
    summary: decoded.success.summary,
    help: decoded.success.help,
  } satisfies CapturedSelectorDefect;
};

const matchesCapturedSelectorDefect = (
  current: CapturedSelectorDefect,
  expected: CapturedSelectorDefect,
) => {
  if (
    current.defect !== expected.defect ||
    current.classification !== expected.classification ||
    current.code !== expected.code ||
    current.summary !== expected.summary ||
    current.help !== expected.help
  )
    return false;

  if (current.path.length !== expected.path.length) return false;

  if (current.details.length !== expected.details.length) return false;

  for (let index = 0; index < current.path.length; index += 1)
    if (current.path[index] !== expected.path[index]) return false;

  for (let index = 0; index < current.details.length; index += 1) {
    const detail = current.details[index];
    const expectedDetail = expected.details[index];

    if (
      detail === undefined ||
      expectedDetail === undefined ||
      detail.key !== expectedDetail.key ||
      !Object.is(detail.value, expectedDetail.value)
    )
      return false;
  }

  return true;
};

// The coordinator crosses an actor boundary only with this fresh carrier shape.
export const ownContextProjectionCarrier = (carrier: ContextProjectionCarrier) => {
  const providers = readCarrierProviders(carrier.providers);
  const selectorDefects = readCarrierSelectorDefects(carrier.selectorDefects);

  if (providers === undefined || selectorDefects === undefined)
    throw new TypeError("Context projection carrier arrays must be dense owned arrays");

  const ownedProviders: ContextProjectionCarrier["providers"] = [];

  for (let index = 0; index < providers.length; index += 1) {
    const provider = providers[index];

    if (provider === undefined)
      throw new TypeError("Context projection carrier providers must be dense");

    ownedProviders[index] = {
      fence: { ...provider.fence },
      slot: provider.slot,
      revision: provider.revision,
      value: ownContextValue(provider.value),
    };
  }

  const ownedSelectorDefects: ContextProjectionCarrier["selectorDefects"] = [];

  for (let index = 0; index < selectorDefects.length; index += 1) {
    const defect = selectorDefects[index];

    if (defect === undefined)
      throw new TypeError("Context projection selector defects must be dense");

    if (captureSelectorDefect(defect) === undefined)
      throw new TypeError("Context projection selector defects must be canonical");
    ownedSelectorDefects[index] = defect;
  }

  return {
    providers: ownedProviders,
    issueOnly: carrier.issueOnly,
    selectorDefects: ownedSelectorDefects,
  };
};

class ContextTicketWitness {
  #origin: ContextAttestation["origin"];
  #graphGeneration: number;
  #expectedRevision: number;
  #current: () => boolean;
  #carrier: ContextProjectionCarrier;
  #providers: ContextProjectionCarrier["providers"];
  #providerValues: Array<(value: ContextPayload) => boolean>;
  #issueOnly: boolean;
  #selectorDefects: CapturedSelectorDefect[];

  constructor(
    origin: ContextAttestation["origin"],
    graphGeneration: number,
    expectedRevision: number,
    current: () => boolean,
    carrier: ContextProjectionCarrier,
    mint: symbol,
  ) {
    if (mint !== contextTicketMint)
      throw new TypeError("Context ticket witness is coordinator-owned");

    this.#origin = {
      fence: { ...origin.fence },
      revision: origin.revision,
      generation: origin.generation,
    };
    this.#graphGeneration = graphGeneration;
    this.#expectedRevision = expectedRevision;
    this.#current = current;
    this.#carrier = carrier;
    const providers = readCarrierProviders(carrier.providers);
    const selectorDefects = readCarrierSelectorDefects(carrier.selectorDefects);

    if (providers === undefined || selectorDefects === undefined)
      throw new TypeError("Context ticket witness requires dense carrier arrays");

    this.#providers = [];
    this.#providerValues = [];

    for (let index = 0; index < providers.length; index += 1) {
      const provider = providers[index];

      if (provider === undefined)
        throw new TypeError("Context ticket witness requires dense providers");

      this.#providers[index] = {
        fence: { ...provider.fence },
        slot: provider.slot,
        revision: provider.revision,
        value: provider.value,
      };
      this.#providerValues[index] = captureContextPayload(provider.value);
    }

    this.#issueOnly = carrier.issueOnly;
    this.#selectorDefects = [];

    for (let index = 0; index < selectorDefects.length; index += 1) {
      const defect = selectorDefects[index];

      if (defect === undefined)
        throw new TypeError("Context ticket witness requires dense defects");
      const captured = captureSelectorDefect(defect);

      if (captured === undefined)
        throw new TypeError("Context ticket witness requires canonical defects");
      this.#selectorDefects[index] = captured;
    }
  }

  static accepts(
    witness: ContextTicketWitness,
    origin: ContextAttestation["origin"],
    graphGeneration: number,
    expectedRevision: number,
  ) {
    if (!(#origin in Object(witness))) return false;

    return (
      sameFence(origin.fence, witness.#origin.fence) &&
      origin.revision === witness.#origin.revision &&
      origin.generation === witness.#origin.generation &&
      graphGeneration === witness.#graphGeneration &&
      expectedRevision === witness.#expectedRevision &&
      witness.#current()
    );
  }

  static acceptsCarrier(
    witness: ContextTicketWitness,
    fact: Extract<ProjectionFact, { _tag: "context-projection" }>,
  ) {
    if (!(#origin in Object(witness))) return false;
    const carrier = fact.projection;

    if (carrier === undefined) return false;

    const providers = readCarrierProviders(carrier.providers);
    const selectorDefects = readCarrierSelectorDefects(carrier.selectorDefects);

    if (
      providers === undefined ||
      selectorDefects === undefined ||
      carrier !== witness.#carrier ||
      fact.provider.value !== carrier ||
      !matchesCapturedLead(fact.provider, witness.#providers[0]) ||
      providers.length !== witness.#providers.length ||
      carrier.issueOnly !== witness.#issueOnly ||
      selectorDefects.length !== witness.#selectorDefects.length
    )
      return false;

    for (let index = 0; index < providers.length; index += 1) {
      const provider = providers[index];
      const expected = witness.#providers[index];

      if (
        expected === undefined ||
        provider === undefined ||
        provider.slot !== expected.slot ||
        !sameFence(provider.fence, expected.fence) ||
        provider.revision !== expected.revision ||
        witness.#providerValues[index]?.(provider.value) !== true
      )
        return false;
    }

    for (let index = 0; index < selectorDefects.length; index += 1) {
      const defect = selectorDefects[index];
      const expected = witness.#selectorDefects[index];

      if (defect === undefined || expected === undefined) return false;
      const captured = captureSelectorDefect(defect);

      if (captured === undefined || !matchesCapturedSelectorDefect(captured, expected))
        return false;
    }

    return true;
  }
}

export type { ContextTicketWitness };

// ActorCell verifies this nominal, coordinator-issued witness; ticket callbacks are not authority.
export const isValidContextTicketWitness = (
  witness: ContextTicketWitness,
  origin: ContextAttestation["origin"],
  graphGeneration: number,
  expectedRevision: number,
) => ContextTicketWitness.accepts(witness, origin, graphGeneration, expectedRevision);

export const isValidContextTicketCarrier = (
  witness: ContextTicketWitness,
  fact: Extract<ProjectionFact, { _tag: "context-projection" }>,
) => ContextTicketWitness.acceptsCarrier(witness, fact);

// RETURN_TYPE: The ref/fence witness restores the provider snapshot type captured by that exact actor.
const isCapturedProvider = <DefinitionValue extends MachineDefinition>(
  binding: ContextBinding<MachineDefinition, DefinitionValue>,
  captured: CapturedProvider,
): captured is CapturedProvider & {
  snapshot: ActorContextSnapshot<DefinitionValue> & { revision: number };
} => captured.ref === binding.provider && sameFence(captured.fence, binding.providerFence);

// RETURN_TYPE: Every admitted actor exposes the same private coordinator node contract.
export const makeContextNode = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
>(
  fence: ActorFence,
  bindings: ContextBinding<ConsumerDefinition, ProviderDefinition>[],
  graph: ContextGraph<ConsumerDefinition, ProviderDefinition>,
  baseline: ContextSelectionLedger<ConsumerDefinition, ProviderDefinition>,
  engine: ActorEngine<ConsumerDefinition>,
): CoordinatorNode => {
  let ledger = baseline;

  const plan: CoordinatorNode["plan"] = (captured) => {
    const snapshots = new Map<ActorKey, ActorContextSnapshot<ProviderDefinition>>();
    const revisions = new Map<ActorKey, number>();

    for (const binding of bindings) {
      const snapshot = captured.get(binding.providerFence.key);

      if (snapshot === undefined || !isCapturedProvider(binding, snapshot))
        return Result.fail(unavailableProvider(binding.providerFence.key));
      snapshots.set(binding.providerFence.key, snapshot.snapshot);
      revisions.set(binding.providerFence.key, snapshot.snapshot.revision);
    }

    const wave = planContextWave(graph, revisions, new Set(revisions.keys()), Option.none());

    if (Result.isFailure(wave)) return Result.fail(wave.failure);
    const selected = applyContextWave(wave.success, graph, snapshots, ledger);

    if (Result.isFailure(selected)) return Result.fail(selected.failure);
    const publication = selected.success.publications.find((entry) => entry.consumer === fence.key);

    const defective = bindings.some((binding) => {
      const entry = selected.success.ledger.entries.get(binding);

      return entry !== undefined && Option.isSome(entry.defect);
    });

    if (publication === undefined && defective)
      return Result.succeed({
        phase: "no-projection",
        defective,
        commit: () => (ledger = selected.success.ledger),
      });

    const providers = bindings.map((binding) => {
      const entry = selected.success.ledger.entries.get(binding);

      let value = publication?.projection.values.get(binding.slot);

      if (publication?.projection.values.has(binding.slot))
        value = publication.projection.values.get(binding.slot);
      else if (entry !== undefined && Option.isSome(entry.lastValid))
        value = entry.lastValid.value.value;

      return {
        fence: { ...binding.providerFence },
        slot: binding.slot,
        revision: revisions.get(binding.providerFence.key) ?? 0,
        value,
      };
    });

    if (providers.length === 0)
      return Result.succeed({
        phase: "no-projection",
        defective,
        commit: () => (ledger = selected.success.ledger),
      });

    return Result.succeed({
      phase: "projection",
      carrier: {
        providers,
        issueOnly: publication?.issueOnly ?? false,
        selectorDefects: publication?.selectorDefects ?? [],
      },
      defective,
      commit: () => (ledger = selected.success.ledger),
    });
  };

  const offer: CoordinatorNode["offer"] = (carrier, attestation) => {
    const first = carrier.providers[0];

    if (first === undefined) return Result.fail(unavailableProvider(fence.key));

    const dispatched = engine.dispatchContextTicket(
      {
        _tag: "context-projection",
        provider: { ...first, fence: { ...first.fence }, value: carrier },
        projection: carrier,
      },
      attestation,
    );

    if (Result.isFailure(dispatched)) return Result.fail(dispatched.failure);

    return Result.succeed({
      wait: Deferred.await(dispatched.success.completion).pipe(
        Effect.map((outcome) => ({ status: outcome.status, snapshot: outcome.snapshot })),
      ),
      cancel: dispatched.success.cancel,
    });
  };

  return {
    ref: engine.ref,
    fence,
    providers: bindings.map((binding) => ({ key: binding.providerFence.key, slot: binding.slot })),
    snapshot: engine.snapshot,
    plan,
    offer,
  };
};

export const makeContextCoordinator = (scope: Scope.Scope) =>
  Effect.gen(function* () {
    const nodes = new Map<ActorKey, RegisteredNode>();
    const roots = new Map<ActorKey, RootSlot>();
    const activeWaves = new Set<Root>();
    const activeTickets = new Map<ActorKey, CoordinatorTicket>();
    const queue = yield* Queue.unbounded<ActorKey>();
    const gate = Semaphore.makeUnsafe(1);
    let graphGeneration = 0;
    let waveGeneration = 0;
    let closed = false;

    const capture = (root: Root) => {
      const snapshots = new Map<ActorKey, CapturedProvider>(
        [...nodes].map(([key, state]) => [
          key,
          {
            ref: state.node.ref,
            fence: { ...state.node.fence },
            snapshot: ownCoordinatorSnapshot(state.node.snapshot()),
          },
        ]),
      );

      const rootState = nodes.get(root.fence.key);

      if (rootState !== undefined)
        snapshots.set(root.fence.key, {
          ref: rootState.node.ref,
          fence: { ...root.fence },
          snapshot: ownCoordinatorSnapshot(root.snapshot),
        });

      return snapshots;
    };

    const blockedByPriorOutcome = (
      state: RegisteredNode,
      outcomes: ContextWaveReceipt["outcomes"],
    ) =>
      state.node.providers.some((provider) => {
        const outcome = outcomes.get(provider.key);

        return (
          outcome === "blocked" ||
          outcome === "rejected" ||
          outcome === "stale" ||
          outcome === "defect"
        );
      });

    const cannotProcess = (
      key: ActorKey,
      state: RegisteredNode,
      outcomes: ContextWaveReceipt["outcomes"],
    ) =>
      closed || nodes.get(key) !== state || !state.open || blockedByPriorOutcome(state, outcomes);

    const invalidateTickets = () => {
      for (const ticket of activeTickets.values()) ticket.cancel();
    };

    // A wave intentionally holds one serialized coordinator permit across every ticket settlement.
    const runWave = (root: Root) =>
      Effect.gen(function* () {
        waveGeneration += 1;

        const origin = {
          fence: root.fence,
          revision: root.snapshot.revision,
          generation: waveGeneration,
        };

        const capturedGeneration = graphGeneration;
        const capturedNodes = new Map(nodes);
        const snapshots = capture(root);

        const vector = new Map<ActorKey, number>(
          [...snapshots].map(([key, captured]) => [key, captured.snapshot.revision]),
        );

        const outcomes: ContextWaveReceipt["outcomes"] = new Map();
        const failures: ContextWaveReceipt["failures"] = new Map();
        const reachable = new Set<ActorKey>([root.fence.key]);
        const rootState = capturedNodes.get(root.fence.key);

        const waveCurrent = () =>
          !closed &&
          graphGeneration === capturedGeneration &&
          waveGeneration === origin.generation &&
          rootState !== undefined &&
          nodes.get(root.fence.key) === rootState &&
          rootState.open &&
          sameFence(rootState.node.fence, root.fence);

        const validCaptured = (
          key: ActorKey,
          state: RegisteredNode,
          required: Map<ActorKey, number>,
        ) =>
          waveCurrent() &&
          nodes.get(key) === state &&
          state.open &&
          sameFence(state.node.fence, capturedNodes.get(key)?.node.fence ?? root.fence) &&
          state.node.providers.every((provider) => {
            const captured = capturedNodes.get(provider.key);

            return (
              captured !== undefined &&
              nodes.get(provider.key) === captured &&
              captured.open &&
              sameFence(captured.node.fence, snapshots.get(provider.key)?.fence ?? root.fence) &&
              snapshots.get(provider.key)?.snapshot.revision === required.get(provider.key)
            );
          });

        const validOffer = (
          key: ActorKey,
          state: RegisteredNode,
          carrier: ContextProjectionCarrier,
          required: Map<ActorKey, number>,
        ) => {
          if (!validCaptured(key, state, required)) return false;
          const offeredProviders = readCarrierProviders(carrier.providers);

          if (offeredProviders === undefined) return false;

          for (let index = 0; index < state.node.providers.length; index += 1) {
            const provider = state.node.providers[index];

            if (provider === undefined) return false;

            let offered: ContextProjectionCarrier["providers"][number] | undefined;

            for (let offeredIndex = 0; offeredIndex < offeredProviders.length; offeredIndex += 1) {
              const entry = offeredProviders[offeredIndex];

              if (entry !== undefined && entry.slot === provider.slot) {
                offered = entry;
                break;
              }
            }

            if (
              offered === undefined ||
              !sameFence(
                offered.fence,
                capturedNodes.get(provider.key)?.node.fence ?? root.fence,
              ) ||
              offered.revision !== required.get(provider.key)
            )
              return false;
          }

          return true;
        };

        for (const [key, state] of capturedNodes) {
          if (state.node.providers.some((provider) => reachable.has(provider.key)))
            reachable.add(key);
        }

        const remaining = new Map(
          [...capturedNodes].filter(([key]) => key !== root.fence.key && reachable.has(key)),
        );

        while (remaining.size > 0) {
          const ready = [...remaining].filter(([, state]) =>
            state.node.providers.every(
              (provider) =>
                provider.key === root.fence.key ||
                !reachable.has(provider.key) ||
                outcomes.has(provider.key),
            ),
          );

          if (ready.length === 0) {
            for (const key of remaining.keys()) outcomes.set(key, "blocked");
            break;
          }

          const offeredBatch: Array<{
            key: ActorKey;
            state: RegisteredNode;
            planned: PlannedContext;
            lineage: ContextLineage;
            carrier: ContextProjectionCarrier;
            required: Map<ActorKey, number>;
            ticket: CoordinatorTicket;
          }> = [];

          for (const [key, state] of ready) {
            remaining.delete(key);

            if (blockedByPriorOutcome(state, outcomes)) {
              outcomes.set(key, "blocked");
              continue;
            }

            if (!waveCurrent() || cannotProcess(key, state, outcomes)) {
              outcomes.set(key, "stale");
              continue;
            }

            const lineage = reconcileContextLineage(
              key,
              state.lineage,
              state.node.providers.map((provider) => {
                const parent = capturedNodes.get(provider.key);
                const snapshot = snapshots.get(provider.key)?.snapshot;

                return {
                  slot: provider.slot,
                  cut: {
                    fence: parent?.node.fence ?? root.fence,
                    revision: snapshot?.revision ?? 0,
                  },
                  lineage: parent?.lineage ?? new Map(),
                };
              }),
            );

            if (Result.isFailure(lineage)) {
              failures.set(key, lineage.failure);
              outcomes.set(key, "blocked");
              continue;
            }

            const planned = state.node.plan(snapshots);

            if (Result.isFailure(planned)) {
              failures.set(key, planned.failure);
              outcomes.set(key, "rejected");
              continue;
            }

            const required = new Map<ActorKey, number>(
              state.node.providers.map((provider) => [
                provider.key,
                snapshots.get(provider.key)?.snapshot.revision ?? 0,
              ]),
            );

            if (planned.success.phase === "no-projection") {
              if (!validCaptured(key, state, required)) {
                outcomes.set(key, "stale");
                continue;
              }

              planned.success.commit();
              outcomes.set(key, planned.success.defective ? "defect" : "no-op");

              if (!planned.success.defective) state.lineage = lineage.success;
              continue;
            }

            const carrier = ownContextProjectionCarrier(planned.success.carrier);
            const expectedRevision = state.node.snapshot().revision;

            const witness = new ContextTicketWitness(
              origin,
              capturedGeneration,
              expectedRevision,
              () => validOffer(key, state, carrier, required),
              carrier,
              contextTicketMint,
            );

            const validate = (
              ticketOrigin: ContextAttestation["origin"],
              ticketGraphGeneration: number,
            ) =>
              isValidContextTicketWitness(
                witness,
                ticketOrigin,
                ticketGraphGeneration,
                expectedRevision,
              );

            if (!validate(origin, capturedGeneration)) {
              outcomes.set(key, "stale");
              continue;
            }

            const offered = state.node.offer(carrier, {
              origin: {
                fence: { ...origin.fence },
                revision: origin.revision,
                generation: origin.generation,
              },
              graphGeneration: capturedGeneration,
              consumerFence: { ...state.node.fence },
              expectedRevision,
              requiredVector: required,
              witness,
              validate,
            });

            if (Result.isFailure(offered)) {
              failures.set(key, offered.failure);
              outcomes.set(key, "rejected");
              continue;
            }

            activeTickets.set(key, offered.success);
            offeredBatch.push({
              key,
              state,
              planned: planned.success,
              lineage: lineage.success,
              carrier,
              required,
              ticket: offered.success,
            });
          }

          yield* Effect.forEach(
            offeredBatch,
            ({ key, state, planned, lineage, carrier, required, ticket }) =>
              Effect.gen(function* () {
                const settled = yield* Effect.exit(ticket.wait);
                activeTickets.delete(key);

                if (Exit.isFailure(settled)) {
                  const failure = settled.cause.reasons.find((reason) => reason._tag === "Fail");

                  if (failure !== undefined) failures.set(key, failure.error);
                  outcomes.set(key, "rejected");

                  return;
                }

                if (
                  settled.value.status === "stale" ||
                  !validOffer(key, state, carrier, required)
                ) {
                  outcomes.set(key, "stale");

                  return;
                }

                planned.commit();
                snapshots.set(key, {
                  ref: state.node.ref,
                  fence: { ...state.node.fence },
                  snapshot: ownCoordinatorSnapshot(settled.value.snapshot),
                });
                outcomes.set(key, planned.defective ? "defect" : settled.value.status);

                if (!planned.defective) state.lineage = lineage;
              }),
            { concurrency: "unbounded" },
          );
        }

        return {
          origin,
          graphGeneration: capturedGeneration,
          vector,
          outcomes,
          failures,
        } satisfies ContextWaveReceipt;
      });

    const consume = Effect.forever(
      Effect.gen(function* () {
        const key = yield* Queue.take(queue);
        const slot = roots.get(key);

        while (slot !== undefined && Option.isSome(slot.pending)) {
          const root = slot.pending.value;
          slot.pending = Option.none();
          slot.active = Option.some(root);

          if (Option.isSome(slot.latest)) {
            slot.pending = slot.latest;
            slot.latest = Option.none();
          }

          activeWaves.add(root);
          const exit = yield* Effect.exit(gate.withPermit(runWave(root)));
          activeWaves.delete(root);

          if (Exit.isSuccess(exit))
            Deferred.doneUnsafe(root.completion, Effect.succeed(exit.value));
          else Deferred.doneUnsafe(root.completion, Effect.failCause(exit.cause));
          slot.active = Option.none();
        }

        roots.delete(key);
      }),
    );

    const fiber = yield* Effect.forkIn(consume, scope);

    const register = (node: CoordinatorNode) => {
      graphGeneration += 1;
      invalidateTickets();
      nodes.set(node.fence.key, { node, open: false, lineage: new Map() });
    };

    const unregister = (key: ActorKey) => {
      graphGeneration += 1;
      invalidateTickets();
      nodes.delete(key);
      const slot = roots.get(key);

      if (slot !== undefined && Option.isSome(slot.pending)) {
        Deferred.doneUnsafe(slot.pending.value.completion, Effect.fail(unavailableProvider(key)));
        slot.pending = Option.none();
      }

      if (slot !== undefined && Option.isSome(slot.latest)) {
        Deferred.doneUnsafe(slot.latest.value.completion, Effect.fail(unavailableProvider(key)));
        slot.latest = Option.none();
      }
    };

    const notify = (fence: ActorFence, snapshot: CoordinatorSnapshot) => {
      const state = nodes.get(fence.key);

      if (closed || state === undefined || !sameFence(fence, state.node.fence)) return;
      const ownedSnapshot = ownCoordinatorSnapshot(snapshot);

      const slot = roots.get(fence.key) ?? {
        active: Option.none<Root>(),
        pending: Option.none<Root>(),
        latest: Option.none<Root>(),
      };

      if (Option.isNone(slot.pending)) {
        slot.pending = Option.some({
          fence: { ...fence },
          snapshot: ownedSnapshot,
          completion: Deferred.makeUnsafe<ContextWaveReceipt, PublicDiagnostic>(),
          captured: false,
        });
        roots.set(fence.key, slot);

        if (Option.isNone(slot.active)) Queue.offerUnsafe(queue, fence.key);
      } else if (slot.pending.value.captured) {
        if (Option.isSome(slot.latest) && slot.latest.value.captured)
          Deferred.doneUnsafe(
            slot.latest.value.completion,
            Effect.fail(unavailableProvider(fence.key)),
          );

        if (Option.isNone(slot.latest) || slot.latest.value.captured)
          slot.latest = Option.some({
            fence: { ...fence },
            snapshot: ownedSnapshot,
            completion: Deferred.makeUnsafe<ContextWaveReceipt, PublicDiagnostic>(),
            captured: false,
          });
        else slot.latest.value.snapshot = ownedSnapshot;
      } else slot.pending.value.snapshot = ownedSnapshot;
    };

    const setOpen = (key: ActorKey, open: boolean) => {
      const state = nodes.get(key);

      if (state !== undefined) state.open = open;

      if (!open) {
        graphGeneration += 1;
        invalidateTickets();
      }
    };

    const reconcile = (key: ActorKey) =>
      Effect.gen(function* () {
        if (closed) return yield* Effect.fail(unavailableProvider(key));
        const state = nodes.get(key);

        if (state === undefined || state.node.providers.length === 0) return;
        const provider = state.node.providers[0];
        const rootState = provider === undefined ? undefined : nodes.get(provider.key);

        if (rootState === undefined)
          return yield* Effect.fail(unavailableProvider(provider?.key ?? key));

        const root: Root = {
          fence: rootState.node.fence,
          snapshot: rootState.node.snapshot(),
          completion: Deferred.makeUnsafe<ContextWaveReceipt, PublicDiagnostic>(),
          captured: false,
        };

        activeWaves.add(root);
        const result = yield* Effect.exit(gate.withPermit(runWave(root)));
        activeWaves.delete(root);

        if (Exit.isFailure(result)) {
          Deferred.doneUnsafe(root.completion, Effect.failCause(result.cause));

          return yield* Effect.failCause(result.cause);
        }

        Deferred.doneUnsafe(root.completion, Effect.succeed(result.value));
        const receipt = result.value;
        const outcome = receipt.outcomes.get(key);

        if (outcome === "rejected" || outcome === "blocked" || outcome === "stale")
          return yield* Effect.fail(receipt.failures.get(key) ?? unavailableProvider(key));
      });

    const drain = () =>
      Effect.suspend(() => {
        const occupied: Root[] = [];

        for (const slot of roots.values()) {
          if (Option.isSome(slot.active)) occupied.push(slot.active.value);

          if (Option.isSome(slot.pending)) occupied.push(slot.pending.value);

          if (Option.isSome(slot.latest)) occupied.push(slot.latest.value);
        }

        const captured = [...new Set([...activeWaves, ...occupied])];

        for (const root of captured) root.captured = true;

        return Effect.forEach(captured, (root) => Deferred.await(root.completion), {
          concurrency: "unbounded",
        });
      });

    const quiesce = () =>
      Effect.sync(() => {
        if (closed) return;
        closed = true;

        for (const [key, slot] of roots) {
          if (Option.isSome(slot.pending))
            Deferred.doneUnsafe(
              slot.pending.value.completion,
              Effect.fail(unavailableProvider(key)),
            );

          if (Option.isSome(slot.active))
            Deferred.doneUnsafe(
              slot.active.value.completion,
              Effect.fail(unavailableProvider(key)),
            );

          if (Option.isSome(slot.latest))
            Deferred.doneUnsafe(
              slot.latest.value.completion,
              Effect.fail(unavailableProvider(key)),
            );
        }

        roots.clear();

        for (const root of activeWaves)
          Deferred.doneUnsafe(root.completion, Effect.fail(unavailableProvider(root.fence.key)));

        invalidateTickets();
      });

    const close = () =>
      Effect.gen(function* () {
        yield* quiesce();
        yield* Queue.shutdown(queue);
        yield* Fiber.interrupt(fiber);
      });

    return { register, unregister, notify, setOpen, reconcile, drain, quiesce, close };
  });
