import type {
  FlowResourceConfig,
  FlowResourceDefinition,
  FlowResourceRef,
} from "../public/types.js";

export function createResourceDefinition<
  const Id extends string,
  Params extends ReadonlyArray<unknown>,
  Value,
  Error,
  Requirements,
>(
  config: FlowResourceConfig<Id, Params, Value, Error, Requirements>,
): FlowResourceDefinition<Id, Params, Value, Error, Requirements> {
  return Object.freeze({
    kind: "resource",
    id: config.id,
    config,
    ref: (...params: Params): FlowResourceRef<Id, Params, Value> =>
      Object.freeze({
        kind: "resourceRef",
        id: config.id,
        params,
        key: config.key(...params),
      }),
  });
}
