import type { Layer } from "effect";

import type { FlowRuntime } from "../public/types.js";
import { createRuntime, type RuntimeReadyLayer } from "./contract-runtime.js";

export async function withRequestRuntime<AppLayer extends Layer.Any, Result>(
  layer: RuntimeReadyLayer<AppLayer>,
  handler: (
    runtime: FlowRuntime<Layer.Success<AppLayer>, Layer.Error<AppLayer>>,
  ) => Result | Promise<Result>,
): Promise<Result> {
  const runtime = createRuntime(layer);

  try {
    return await handler(runtime);
  } finally {
    await runtime.dispose();
  }
}
