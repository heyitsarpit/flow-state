import type { SelectionSource } from "../phase0-design.js";
import type { FlowResourceRef, FlowResourceSnapshot } from "../public/types.js";

import type { FlowRuntimeTransport } from "./context.js";

type ResourceValue<Ref extends FlowResourceRef> =
  Ref extends FlowResourceRef<string, ReadonlyArray<unknown>, infer Value> ? Value : never;

export function createResourceSource<Ref extends FlowResourceRef>(
  runtime: FlowRuntimeTransport,
  ref: Ref,
): SelectionSource<FlowResourceSnapshot<ResourceValue<Ref>> | null> {
  return {
    getSnapshot: () =>
      runtime.resources.get(ref) as FlowResourceSnapshot<ResourceValue<Ref>> | null,
    subscribe: (listener) =>
      runtime.resources.subscribe(ref, () => {
        listener();
      }),
  };
}
