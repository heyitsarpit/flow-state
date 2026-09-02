export { app, module } from "../app/app.js";
export { definition } from "../definition/definition.js";
export * as Diagnostic from "../diagnostic/diagnostic.js";
export { Implementation } from "../implementation/implementation.js";
export { machine } from "../machine/machine.js";
export { resource } from "../operation/resource.js";
export { stream } from "../operation/stream.js";
export { transaction } from "../operation/transaction.js";

// Runtime, persistence, and actor ownership are implemented by later feature slices.
// Keep their accepted root names present without creating a second owner here.
export {
  scaffoldNotImplemented as actorRef,
  scaffoldNotImplemented as can,
  scaffoldNotImplemented as indexedDbStorage,
  scaffoldNotImplemented as persistence,
  scaffoldNotImplemented as runtimeSetup,
  scaffoldNotImplemented as webStorage,
} from "../internal/scaffold.js";

export type { CanonicalKeyInput, FlowStream, OperationOptions } from "./types.js";
