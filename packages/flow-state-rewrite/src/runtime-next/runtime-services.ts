import { Clock, Context, Effect, Layer } from "effect";

import type { PublicDiagnostic } from "../diagnostic/diagnostic.js";

/** The runtime service key retains the existing identity during the owner rewrite. */
export interface RuntimeEvidenceIdentity {
  _tag: "RuntimeEvidence";
}

/** The shell only needs terminal evidence draining; the journal supplies record operations. */
export interface RuntimeEvidenceService {
  drain: Effect.Effect<void, PublicDiagnostic>;
}

export const RuntimeEvidence = Context.Service<RuntimeEvidenceIdentity, RuntimeEvidenceService>(
  "flow-state/runtime/RuntimeEvidence",
);

export type RuntimeServiceContext = RuntimeEvidenceIdentity;

export type RuntimeServicesLayer = Layer.Layer<RuntimeServiceContext>;

/** Assembly supplies already-created capabilities; their owners keep their lifetimes. */
export const makeRuntimeServicesLayer = (services: {
  clock: Clock.Clock;
  evidence: RuntimeEvidenceService;
}) =>
  Layer.mergeAll(
    Layer.succeed(Clock.Clock)(services.clock),
    Layer.succeed(RuntimeEvidence)(services.evidence),
  );
