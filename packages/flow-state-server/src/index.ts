import type { Layer } from "effect";

import type { FlowRuntime, RuntimeReadyLayer } from "@flow-state/core";

import type { FlowRuntime as InternalFlowRuntime } from "../../flow-state/src/core/api/types.js";
import { withRequestRuntime as withRequestRuntimeInternal } from "../../flow-state/src/runtime/request-runtime.js";
import type { RuntimeReadyLayer as InternalRuntimeReadyLayer } from "../../flow-state/src/runtime/contract-runtime.js";

export async function withRequestRuntime<AppLayer extends Layer.Any, Result>(
  layer: RuntimeReadyLayer<AppLayer>,
  handler: (
    runtime: FlowRuntime<Layer.Success<AppLayer>, Layer.Error<AppLayer>>,
  ) => Result | Promise<Result>,
): Promise<Result> {
  return withRequestRuntimeInternal(
    layer as InternalRuntimeReadyLayer<AppLayer>,
    handler as (
      runtime: InternalFlowRuntime<Layer.Success<AppLayer>, Layer.Error<AppLayer>>,
    ) => Result | Promise<Result>,
  );
}

export type { FlowRuntimeBootActorSnapshot } from "../../flow-state/src/core/api/snapshot-types.js";

export type {
  FlowRuntimeBootOptions,
  FlowRuntimeBootPayload,
  FlowRuntimeHydratedBoot,
} from "../../flow-state/src/core/api/runtime-types.js";
