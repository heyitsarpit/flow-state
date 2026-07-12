import type {
  FlowResourceConfig,
  FlowResourceDefinition,
  FlowResourceRef,
} from "../core/api/types.js";
import {
  registerResourceDefinition,
  registerResourceRef,
  runResourceCallback,
} from "../core/api/resource-runtime.js";
import { copyResourceConfig } from "./config-copy.js";

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
  const copiedConfig = copyResourceConfig(config);
  const definition = Object.freeze({
    kind: "resource" as const,
    id: copiedConfig.id,
    config: copiedConfig,
    ref: (...params: Params): FlowResourceRef<Id, Params, Value> => {
      const frozenParams = Object.freeze([...params]) as unknown as Params;
      const ref = {
        kind: "resourceRef" as const,
        id: copiedConfig.id,
        params: frozenParams,
        key: runResourceCallback(copiedConfig.id, "key", () => copiedConfig.key(...frozenParams)),
      } satisfies FlowResourceRef<Id, Params, Value>;

      const frozenRef = Object.freeze(ref);
      registerResourceRef(frozenRef, definition);
      return frozenRef;
    },
  });
  registerResourceDefinition(definition);

  return definition;
}
