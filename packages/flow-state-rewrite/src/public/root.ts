import * as diagnosticOwner from "../diagnostic/diagnostic.js";
import type { PublicDiagnostic } from "../diagnostic/diagnostic.js";

const Diagnostic = {
  // RETURN_TYPE: Keeps internal diagnostic classification private on the public defect route.
  Defect: (cause: unknown): PublicDiagnostic => diagnosticOwner.Defect(cause),
  // RETURN_TYPE: Keeps internal diagnostic classification private on the public failure route.
  Failure: (fields: diagnosticOwner.FailureFields): PublicDiagnostic =>
    diagnosticOwner.Failure(fields),
  // RETURN_TYPE: Keeps internal diagnostic classification private on the public interruption route.
  Interrupt: (): PublicDiagnostic => diagnosticOwner.Interrupt(),
} as const;

export { app, module } from "../app/app.js";
export { definition } from "../definition/definition.js";
export { Diagnostic };
export { Implementation } from "../implementation/implementation.js";
export { machine } from "../machine/machine.js";
export { resource } from "../operation/resource.js";
export { stream } from "../operation/stream.js";
export { transaction } from "../operation/transaction.js";
export { actorRef } from "../runtime/actor-ref.js";
export { runtimeSetup } from "../runtime/runtime.js";

// Deferred public values: future persistence and storage owners will publish these names.
// export { can, indexedDbStorage, persistence, webStorage };
// Deferred public values: future diagnostic owners will publish these names.
// export { FlowDisposeError, FlowPersistenceError, FlowUsageError };

export type { CanonicalKeyInput, FlowStream, OperationOptions } from "./types.js";
