import type {
  FlowResourceConfig,
  FlowResourceDefinition,
  FlowResourceRef,
} from "../core/api/types.js";
import { registerResourceIdentity } from "../core/api/canonical-key.js";
import { registerResourceRef, runResourceCallback } from "../core/api/resource-runtime.js";

export function createResourceDefinition<
  const Id extends string,
  Params extends ReadonlyArray<unknown>,
  Value,
  Error,
  Requirements,
  Schema,
>(
  config: FlowResourceConfig<Id, Params, Value, Error, Requirements, Schema>,
): FlowResourceDefinition<Id, Params, Value, Error, Requirements, Schema> {
  const definition = Object.freeze({
    kind: "resource" as const,
    id: config.id,
    config,
    ref: (...params: Params): FlowResourceRef<Id, Params, Value> => {
      const ref = {
        kind: "resourceRef" as const,
        id: config.id,
        params,
        key: runResourceCallback(config.id, "key", () => config.key(...params)),
      } satisfies FlowResourceRef<Id, Params, Value>;

      const frozenRef = Object.freeze(ref);
      registerResourceRef(frozenRef, definition);
      registerResourceIdentity(frozenRef);
      return frozenRef;
    },
  });

  return definition;
}
