import { createContext } from "react";

import type {
  FlowRuntime,
  FlowRuntimeOrchestrators,
  FlowRuntimeResources,
} from "../public/types.js";

export type FlowRuntimeTransport = Readonly<{
  readonly kind: "runtime";
  readonly resources: FlowRuntimeResources;
  readonly orchestrators: FlowRuntimeOrchestrators;
  readonly createActor: FlowRuntime["createActor"];
  readonly dispose: FlowRuntime["dispose"];
}>;

export const FlowRuntimeContext = createContext<FlowRuntimeTransport | null>(null);
