import type { FlowEvent, FlowStreamConfig, FlowStreamDefinition } from "../core/api/types.js";
import { withRoutedEventBrand } from "../core/api/routed-event-brand.js";
import { copyStreamConfig } from "./config-copy.js";
import { invalidStreamPressureDiagnostic } from "../shared/diagnostics.js";

export function createStreamDefinition<
  Context,
  Event extends FlowEvent,
  Params,
  Value,
  Error,
  Requirements,
  const Id extends string,
>(
  config: FlowStreamConfig<Id, Context, Event, Params, Value, Error, Requirements>,
): FlowStreamDefinition<Value, Error, Params, Event, Context, Id, Requirements> {
  if (
    config.pressure !== undefined &&
    (!Number.isSafeInteger(config.pressure.limit) || config.pressure.limit <= 0)
  ) {
    throw invalidStreamPressureDiagnostic({
      streamId: config.id,
      strategy: config.pressure.strategy,
      limit: config.pressure.limit,
    });
  }
  const copiedConfig = copyStreamConfig(config);
  return withRoutedEventBrand<string extends Event["type"] ? never : Event>()(
    Object.freeze({
      kind: "stream",
      id: copiedConfig.id,
      config: copiedConfig,
    }),
  );
}
