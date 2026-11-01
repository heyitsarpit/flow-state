import { Context, Effect, Layer } from "effect";

import type { App } from "../app/app.js";
import type { PublicDiagnostic } from "../diagnostic/diagnostic.js";
import type { Runtime } from "./runtime.js";
import { makeFlowRuntimeShell } from "./runtime-shell.js";

type RuntimeAssembly<A extends App, Output, ImplementationError> = {
  runtime: Runtime<A, ImplementationError>;
  readyContext: Effect.Effect<Context.Context<Output>, ImplementationError | PublicDiagnostic>;
};

/** Constructs one private shell and returns only its matching facade. */
// RETURN_TYPE: The actor ports are intentionally typed to the already fixed facade contract.
export const makeRuntimeAssembly = <A extends App, Output, ImplementationError>(options: {
  app: A;
  layer: Layer.Layer<Output, ImplementationError>;
}): RuntimeAssembly<A, Output, ImplementationError> => {
  const shell = makeFlowRuntimeShell<Context.Context<Output>, ImplementationError, never>({
    bootstrap: (scope) => Layer.buildWithScope(options.layer, scope),
  });

  // The actor methods remain a stateless seam until the actor owners are connected in P07.
  const actorUnavailable = () => Effect.die(new Error("Actor assembly is not installed"));

  const runtime: Runtime<A, ImplementationError> = {
    app: options.app,
    ready: () => shell.ready.pipe(Effect.asVoid),
    createActor: actorUnavailable,
    ensureActor: actorUnavailable,
    getActor: actorUnavailable,
    dispose: () => shell.close(),
  };

  return { runtime, readyContext: shell.ready };
};
