import { createEverclearRouteHost } from "./route-host";
import type { UrlIntentInput } from "./machines/new-intent.machine";

export const showNewIntentRoute = (
  runtime: Parameters<typeof createEverclearRouteHost>[0],
  input: UrlIntentInput,
) => {
  const host = createEverclearRouteHost(runtime, input);
  host.showNewIntentRoute(input);
  return host;
};
