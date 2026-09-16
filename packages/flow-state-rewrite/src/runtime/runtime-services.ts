import { Clock, Context, Effect, Layer } from "effect";

import type { App, appPlan } from "../app/app.js";
import type { MachineDefinition } from "../machine/grammar.js";
import type { PublicDiagnostic } from "../diagnostic/diagnostic.js";
import type { ActorIdentity } from "./actor-admission.js";
import type { ActorLifecycle, LifecycleCause, LifecycleSnapshot } from "./lifecycle.js";

/** One lifecycle publication is evidence, never a machine-turn record. */
type RuntimeEvidenceProvenance = {
  app: App;
  plan: ReturnType<typeof appPlan>;
  actor: Pick<ActorIdentity, "key" | "incarnation" | "leaseEpoch">;
};

type RuntimeEvidenceServiceProvenance = Omit<RuntimeEvidenceProvenance, "actor">;

type RuntimeLifecycleEvidenceMetadata = {
  timestamp: number;
  publicationRevision: number;
  evidenceSequence: number;
  provenance: RuntimeEvidenceProvenance;
};

export type RuntimeLifecycleEvidence<
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> = {
  _tag: "lifecycle";
  machineTurn: false;
  from: ActorLifecycle;
  to: ActorLifecycle;
  cause: LifecycleCause<CleanupError>;
  before: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>;
  after: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>;
} & RuntimeLifecycleEvidenceMetadata;

/** The evidence owner accepts lifecycle records without executing machine work. */
export type RuntimeEvidenceService<
  _A extends App = App,
  _DefinitionValue extends MachineDefinition = MachineDefinition,
  _CleanupError = PublicDiagnostic,
> = {
  hub: unknown;
  provenance: RuntimeEvidenceServiceProvenance;
  publish: <
    DefinitionValue extends MachineDefinition,
    CleanupError,
    ProviderDefinition extends MachineDefinition = DefinitionValue,
  >(
    snapshot: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  ) => Effect.Effect<void, PublicDiagnostic>;
  accept: <
    DefinitionValue extends MachineDefinition,
    CleanupError,
    ProviderDefinition extends MachineDefinition = DefinitionValue,
  >(
    record: RuntimeLifecycleEvidence<DefinitionValue, CleanupError, ProviderDefinition>,
  ) => Effect.Effect<void, PublicDiagnostic>;
  drain: Effect.Effect<unknown, PublicDiagnostic>;
};

/** Identifies the evidence capability supplied by a runtime composition root. */
export interface RuntimeEvidenceIdentity {
  _tag: "RuntimeEvidence";
}

export const RuntimeEvidence = Context.Service<RuntimeEvidenceIdentity, RuntimeEvidenceService>(
  "flow-state/runtime/RuntimeEvidence",
);

/** The runtime captures the supplied Effect Clock and one evidence capability. */
export type RuntimeServiceContext = RuntimeEvidenceIdentity;

export type RuntimeServicesLayer = Layer.Layer<RuntimeServiceContext>;

export const makeRuntimeServicesLayer = <
  A extends App,
  DefinitionValue extends MachineDefinition,
  CleanupError,
>(services: {
  clock: Clock.Clock;
  evidence: RuntimeEvidenceService<A, DefinitionValue, CleanupError>;
}): RuntimeServicesLayer =>
  Layer.mergeAll(
    Layer.succeed(Clock.Clock)(services.clock),
    Layer.succeed(RuntimeEvidence)(services.evidence),
  );
