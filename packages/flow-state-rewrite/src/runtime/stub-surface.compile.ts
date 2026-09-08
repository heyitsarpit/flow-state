// STUB: Replaceable/deletable compile guidance; this file executes no runtime work.

import { Context, Effect, Result, type Types } from "effect";

import {
  Implementation,
  actorRef,
  app,
  definition,
  machine,
  module,
  resource,
  runtimeSetup,
} from "../index.js";
import type { EventOf, InputOf, RequirementsOf, StateOf } from "../index.js";
import type { App } from "../app/app.js";
import type { SelectorInput } from "../definition/domain.js";
import type { PublicDiagnostic } from "../diagnostic/diagnostic.js";
import type { Implementation as ImplementationType } from "../implementation/implementation.js";
import type { MachineStoreAction, MachineDefinition } from "../machine/grammar.js";
import type { OperationDeclaration } from "../operation/operation.js";
import type { OperationKey, ReadonlyCanonical } from "../operation/key.js";
import type * as Admission from "./actor-admission.stub.js";
import type { admitActor as admitActorDeclaration } from "./actor-admission.stub.js";
import type * as Engine from "./actor-engine.stub.js";
import type * as ContextWave from "./context-wave.stub.js";
import type * as Evidence from "./evidence.stub.js";
import type * as Lifecycle from "./lifecycle.stub.js";
import type { suspendLifecycle as suspendLifecycleDeclaration } from "./lifecycle.stub.js";
import type * as Owner from "./runtime-owner.stub.js";
import type * as Services from "./runtime-services.stub.js";
import type * as Turn from "./turn-plan.stub.js";

/*
 * Data
 *
 * This compile-only surface starts with real definition, machine, module, app,
 * actorRef, and runtimeSetup constructors. It checks the narrow relationships
 * future runtime owners consume without constructing an actor or a runtime.
 *
 * Admission and invariants
 *
 * The positive examples preserve EventOf envelopes, selector provenance,
 * MachineStoreAction targets, descriptor-bound operation/key types, and a
 * cross-definition provider/consumer context slot. The negative examples
 * reject a structural event, a foreign state token, a wrong context slot, and
 * a selector returning the wrong nominal value. Evidence provenance has stable
 * app fields and no public AppPlan dependency.
 *
 * Pure data operations
 *
 * `Types.Equals` and `satisfies` assert exact compile relationships. No broad
 * aggregate is used as a substitute for a real constructor or a useful
 * negative proof.
 *
 * Effect execution
 *
 * Runtime service types are referenced only to preserve A/E/R and ownership
 * boundaries. This fixture does not call a runner, allocate a scope, or start
 * an actor fiber.
 */

type Expect<Value extends true> = Value;

interface RepositoryPort {
  readonly load: (id: string) => string;
}

class Repository extends Context.Service<Repository, RepositoryPort>()("RuntimeStub/Repository") {}

const project = resource({
  id: "runtime-stub/project",
  key: (id: string) => [id] as const,
  // RETURN_TYPE: Keeps the Repository requirement visible in this compile-only A/E/R proof.
  lookup: (
    id: string,
    _options: { readonly signal: AbortSignal },
  ): Effect.Effect<string, never, Repository> =>
    Effect.map(Effect.service(Repository), (service) => service.load(id)),
});
const otherProject = resource({
  id: "runtime-stub/other-project",
  key: (id: string) => [id] as const,
  // RETURN_TYPE: Keeps the Repository requirement visible in this compile-only A/E/R proof.
  lookup: (
    id: string,
    _options: { readonly signal: AbortSignal },
  ): Effect.Effect<string, never, Repository> =>
    Effect.map(Effect.service(Repository), (service) => service.load(id)),
});

const ProviderResult = definition({
  id: "runtime-stub/provider",
  states: ["ready"],
  events: { refreshed: "bare" },
  memory: ({ input }: { readonly input: { readonly id: string } }) => ({ id: input.id }),
});
const Provider = Result.getOrThrow(ProviderResult);

const ConsumerResult = definition({
  id: "runtime-stub/consumer",
  states: ["ready"],
  events: { opened: (id: string) => ({ id }) },
  context: {
    providerState: Provider.select(({ state }) => state),
    providerId: Provider.select(({ memory }) => memory.id),
  },
  operations: { project },
  memory: ({ input }: { readonly input: { readonly id: string } }) => ({ id: input.id }),
});
const Consumer = Result.getOrThrow(ConsumerResult);

const providerMachine = Result.getOrThrow(
  machine(ProviderResult, ({ S }) => ({ default: S.ready, states: { ready: {} } })),
);
const consumerMachine = Result.getOrThrow(
  machine(ConsumerResult, ({ S }) => ({ default: S.ready, states: { ready: {} } })),
);
const runtimeModule = module({
  id: "runtime-stub/module",
  machines: { provider: providerMachine, consumer: consumerMachine },
});
const runtimeApp = app({
  id: "runtime-stub/app",
  persistenceVersion: "1",
  modules: [runtimeModule] as const,
});
const runtimeImplementation = Implementation.succeed(Repository, { load: (id: string) => id });
const runtimeSetupValue = runtimeSetup({
  app: runtimeApp,
  implementation: runtimeImplementation,
});
const providerRef = actorRef(providerMachine, "provider");
const consumerRef = actorRef(consumerMachine, "consumer");
void runtimeSetupValue;
void providerRef;
void consumerRef;

const opened = Result.getOrThrow(Consumer.E.opened("document"));
const acceptEvent = (event: EventOf<typeof Consumer>) => event;
const acceptedEvent = acceptEvent(opened);
void acceptedEvent;

// @ts-expect-error EventOf is a nominal envelope, not a structural `{ type }` record.
acceptEvent({ type: Consumer.E.opened.id });

const acceptState = (state: StateOf<typeof Consumer>) => state;
acceptState(Consumer.S.ready);
// @ts-expect-error State tokens retain the constructed machine identity.
acceptState(Provider.S.ready);

type ConsumerInput = InputOf<typeof Consumer>;
type ConsumerRequirements = RequirementsOf<typeof Consumer>;
type ConsumerStoreAction = MachineStoreAction<typeof Consumer>;
type ConsumerDescriptor = OperationDeclaration;
type ConsumerOperationKey = OperationKey;

type ProjectStoreChange = Engine.StoreChangeReference<typeof Consumer, typeof project>;
declare const projectStoreChange: ProjectStoreChange;
const projectStoreKey: ReadonlyCanonical<Admission.OperationKeyOfDescriptor<typeof project>> =
  projectStoreChange.key;
const projectStoreFence: Admission.ActorFence = projectStoreChange.fence;
void projectStoreKey;
void projectStoreFence;

declare const foreignStoreChange: Engine.StoreChangeReference<typeof Consumer, typeof otherProject>;
// @ts-expect-error A foreign descriptor cannot satisfy one exact project carrier.
const exactProjectStoreChange: ProjectStoreChange = foreignStoreChange;
void exactProjectStoreChange;

declare const providerRevisionFence: Admission.ProviderRevisionFence;
const providerRevision: number = providerRevisionFence.revision;
const providerIncarnation: Admission.ActorIncarnation = providerRevisionFence.incarnation;
void providerRevision;
void providerIncarnation;

declare const actorFence: Admission.ActorFence;
// @ts-expect-error Context waves require provider revision identity in addition to actor fencing.
const missingProviderRevision: Admission.ProviderRevisionFence = actorFence;
void missingProviderRevision;

declare const consumerFence: Admission.ActorFence;

const crossDefinitionBinding: ContextWave.ContextBinding<
  typeof Consumer,
  typeof Provider,
  "providerState",
  typeof providerRef
> = {
  consumer: consumerFence.key,
  consumerIncarnation: consumerFence.incarnation,
  slot: "providerState",
  provider: providerRef,
  providerFence: providerRevisionFence,
  select: ({ state }) => state,
};

const crossDefinitionIdBinding: ContextWave.ContextBinding<
  typeof Consumer,
  typeof Provider,
  "providerId",
  typeof providerRef
> = {
  consumer: consumerFence.key,
  consumerIncarnation: consumerFence.incarnation,
  slot: "providerId",
  provider: providerRef,
  providerFence: providerRevisionFence,
  select: ({ memory }) => memory.id,
};

export type _CrossDefinitionProvider = Expect<
  Types.Equals<typeof crossDefinitionBinding.provider, typeof providerRef>
>;
declare const selectedProviderState: ReturnType<typeof crossDefinitionBinding.select>;
const exactProviderState: StateOf<typeof Provider> = selectedProviderState;
void exactProviderState;

const crossDefinitionAdmission = {
  app: runtimeApp,
  implementation: runtimeImplementation,
  ref: consumerRef,
  input: { id: "consumer" },
  bindings: [crossDefinitionBinding] as const,
  dependencies: [] as const,
} satisfies Admission.ActorAdmissionInput<
  typeof runtimeApp,
  ConsumerInput,
  typeof Consumer,
  typeof runtimeImplementation,
  typeof Provider
>;
declare const crossDefinitionAuthority: Admission.ActorAdmissionAuthority<
  typeof runtimeApp,
  ConsumerInput,
  typeof Consumer,
  typeof runtimeImplementation,
  never,
  typeof Provider
>;
declare const admitActor: typeof admitActorDeclaration;
const admittedCrossDefinition = admitActor(crossDefinitionAdmission, crossDefinitionAuthority);
export type _AdmitBoundaryKeepsProviderBinding = Expect<
  Types.Equals<
    typeof admittedCrossDefinition,
    Effect.Effect<
      Admission.ExposedActorAdmission<
        typeof runtimeApp,
        ConsumerInput,
        typeof Consumer,
        typeof runtimeImplementation,
        never,
        typeof Provider
      >,
      PublicDiagnostic
    >
  >
>;
void admittedCrossDefinition;
export type _AdmissionKeepsProviderBinding = Expect<
  Types.Equals<(typeof crossDefinitionAdmission.bindings)[0], typeof crossDefinitionBinding>
>;

const providerInput: SelectorInput<typeof Provider> = {
  state: Provider.S.ready,
  memory: { id: "provider" },
  context: {},
};

const contextBindingMap: ReadonlyMap<
  Admission.ActorKey,
  readonly ContextWave.ContextBinding<typeof Consumer, typeof Provider>[]
> = new Map([[consumerFence.key, [crossDefinitionBinding, crossDefinitionIdBinding]]]);
const crossDefinitionGraph: ContextWave.ContextGraph<typeof Consumer, typeof Provider> = {
  providers: new Map([
    [
      providerRevisionFence.key,
      {
        key: providerRevisionFence.key,
        incarnation: providerRevisionFence.incarnation,
        ref: providerRef,
      },
    ],
  ]),
  bindings: contextBindingMap,
  dependents: new Map(),
  order: [consumerFence.key],
};
const graphBindings = crossDefinitionGraph.bindings.get(consumerFence.key);
const graphProviderStateBinding = graphBindings?.find(
  (binding) => binding.slot === "providerState",
);
if (graphProviderStateBinding !== undefined) {
  const graphProviderState: StateOf<typeof Provider> =
    graphProviderStateBinding.select(providerInput);
  void graphProviderState;
}
const graphProviderIdBinding = graphBindings?.find((binding) => binding.slot === "providerId");
if (graphProviderIdBinding !== undefined) {
  const graphProviderId: string = graphProviderIdBinding.select(providerInput);
  void graphProviderId;
}

const crossDefinitionAttachment = {
  status: "attached",
  resources: [],
  work: [],
  dependencies: [],
  bindings: [crossDefinitionBinding] as const,
  providerRevisions: new Map([[providerRevisionFence.key, providerRevisionFence.revision]]),
  cursors: new Map(),
  operations: [],
  timers: [],
} satisfies Lifecycle.LifecycleAttachment<typeof Consumer, never, typeof Provider>;
const crossDefinitionLifecycle = {
  lifecycle: "active",
  fence: consumerFence,
  attachment: crossDefinitionAttachment,
  finalization: "not-started",
} satisfies Lifecycle.LifecycleSnapshot<typeof Consumer, never, typeof Provider>;
declare const suspendLifecycle: typeof suspendLifecycleDeclaration;
const suspendedCrossDefinition = suspendLifecycle<typeof Consumer, never, typeof Provider>(
  crossDefinitionLifecycle,
);
export type _LifecycleBoundaryKeepsProviderBinding = Expect<
  Types.Equals<
    typeof suspendedCrossDefinition,
    Effect.Effect<
      Lifecycle.LifecycleSnapshot<typeof Consumer, never, typeof Provider>,
      PublicDiagnostic,
      Services.RuntimeServiceContext
    >
  >
>;
export type _LifecycleKeepsProviderBinding = Expect<
  Types.Equals<
    (typeof crossDefinitionLifecycle.attachment.bindings)[0],
    typeof crossDefinitionBinding
  >
>;
void crossDefinitionLifecycle;

const wrongGraphSlotBinding: ContextWave.ContextBinding<typeof Consumer, typeof Provider> = {
  ...crossDefinitionBinding,
  // @ts-expect-error The graph carrier rejects an authored consumer slot outside the vocabulary.
  slot: "missing",
};
void wrongGraphSlotBinding;

const wrongContextSlot: ContextWave.ContextBinding<
  typeof Consumer,
  typeof Provider,
  "providerState",
  typeof providerRef
> = {
  ...crossDefinitionBinding,
  // @ts-expect-error Context slots remain correlated with the consumer definition.
  slot: "missing",
};
void wrongContextSlot;

const wrongContextValue: ContextWave.ContextBinding<
  typeof Consumer,
  typeof Provider,
  "providerState",
  typeof providerRef
> = {
  ...crossDefinitionBinding,
  // @ts-expect-error Selector outputs retain the provider state identity expected by this slot.
  select: () => Consumer.S.ready,
};
void wrongContextValue;

export type RuntimeGuidanceExamples = {
  readonly input: ConsumerInput;
  readonly requirements: ConsumerRequirements;
  readonly event: EventOf<typeof Consumer>;
  readonly state: StateOf<typeof Consumer>;
  readonly storeAction: ConsumerStoreAction;
  readonly descriptor: ConsumerDescriptor;
  readonly key: ConsumerOperationKey;
  readonly providerConsumerBinding: ContextWave.ContextBinding<
    typeof Consumer,
    typeof Provider,
    "providerState"
  >;
};

export type RuntimeGuidanceSurface<
  A extends App,
  Input,
  DefinitionValue extends MachineDefinition,
  I extends ImplementationType,
  CleanupError,
> = {
  readonly services: Services.RuntimeServicesLayer;
  readonly owner: Owner.RuntimeOwnerInput<A, I>;
  readonly admission: Admission.ActorAdmissionStage<A, Input, DefinitionValue, I, CleanupError>;
  readonly engine: Engine.ActorEngine<DefinitionValue>;
  readonly turn: Turn.TurnPlan<DefinitionValue>;
  readonly context: ContextWave.ContextWaveResult<DefinitionValue>;
  readonly lifecycle: Lifecycle.LifecycleSnapshot<DefinitionValue, CleanupError>;
  readonly evidence: Evidence.EvidenceRecord<A, DefinitionValue, CleanupError>;
  readonly diagnostic: PublicDiagnostic;
};

export type _EventPreservesEnvelope = Expect<
  Types.Equals<typeof acceptedEvent, EventOf<typeof Consumer>>
>;
export type _RuntimeSetupKeepsApp = Expect<
  Types.Equals<typeof runtimeSetupValue.app, typeof runtimeApp>
>;
export type _ProviderConsumerSelector = Expect<
  Types.Equals<
    ContextWave.ContextBinding<typeof Consumer, typeof Provider, "providerState">["provider"],
    Admission.ActorContextBinding<typeof Consumer, typeof Provider, "providerState">["provider"]
  >
>;
