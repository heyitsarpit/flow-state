import type {
  AnyFlowMachine,
  FlowChildConfig,
  FlowChildDefinition,
  FlowEvent,
} from "../core/api/types.js";
import { copyChildConfig } from "./config-copy.js";
import { withRoutedEventBrand } from "../core/api/routed-event-brand.js";

export function createChildDefinition<
  Machine extends AnyFlowMachine,
  Event extends FlowEvent,
  RoutedEvent extends FlowEvent,
  Context,
>(
  config: FlowChildConfig<Machine, Event, Context>,
): FlowChildDefinition<Machine, Event, RoutedEvent, Context> {
  const copiedConfig = copyChildConfig(config);
  return withRoutedEventBrand<RoutedEvent>()(
    Object.freeze({
      kind: "child",
      id: copiedConfig.id,
      config: copiedConfig,
    }),
  );
}
