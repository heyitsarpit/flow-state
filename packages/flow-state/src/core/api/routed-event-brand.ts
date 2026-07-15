import type { FlowEvent, FlowRoutedEventBinding } from "./resource-transaction-types.js";

export function withRoutedEventBrand<Event extends FlowEvent>() {
  return <Definition>(definition: Definition): Definition & FlowRoutedEventBinding<Event> =>
    definition as Definition & FlowRoutedEventBinding<Event>;
}
