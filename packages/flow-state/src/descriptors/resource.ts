import type { Option } from "effect";

import type {
  FlowResourceConfig,
  FlowResourceDefinition,
  FlowResourceFreshness,
  FlowResourceRef,
  FlowTag,
} from "../public/types.js";

type FlowResourceRuntimeDetails<Value> = Readonly<{
  readonly lookup: unknown;
  readonly tags: ReadonlyArray<FlowTag>;
  readonly placeholder?: Value | Option.Option<Value> | null | undefined;
  readonly freshness?: FlowResourceFreshness;
}>;

type RuntimeResourceRef<
  Id extends string,
  Params extends ReadonlyArray<unknown>,
  Value,
> = FlowResourceRef<Id, Params, Value> &
  Readonly<{
    readonly __runtime?: FlowResourceRuntimeDetails<Value>;
  }>;

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
      const runtime: FlowResourceRuntimeDetails<Value> = {
        lookup: config.lookup(...params),
        tags: config.tags?.(...params) ?? [],
        ...(config.freshness === undefined ? {} : { freshness: config.freshness }),
        ...(config.placeholder === undefined ? {} : { placeholder: config.placeholder(...params) }),
      };

      const ref = {
        kind: "resourceRef" as const,
        id: config.id,
        params,
        key: config.key(...params),
      } as RuntimeResourceRef<Id, Params, Value>;

      Object.defineProperty(ref, "__runtime", {
        configurable: false,
        enumerable: false,
        value: Object.freeze(runtime),
        writable: false,
      });

      return Object.freeze(ref);
    },
  });

  return definition;
}
