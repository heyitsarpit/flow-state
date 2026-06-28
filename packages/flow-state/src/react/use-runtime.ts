import { useContext } from "react";

import type { FlowRuntime } from "../public/types.js";
import { FlowRuntimeContext } from "./context.js";

export function useFlowRuntime<RuntimeServices = never, LayerError = never>(): FlowRuntime<
  RuntimeServices,
  LayerError
> {
  const runtime = useContext(FlowRuntimeContext);
  if (runtime === null) {
    throw new Error("FlowProvider is missing a runtime");
  }

  return runtime as FlowRuntime<RuntimeServices, LayerError>;
}
