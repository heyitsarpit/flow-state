import type { Option } from "effect";

import type {
  FlowResourceConfig,
  FlowResourceDefinition,
  FlowResourceFreshness,
  FlowResourceRef,
  FlowTag,
} from "../core/api/types.js";
import { resourceCallbackThrewDiagnostic } from "../diagnostics.js";

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

function runResourceCallback<Result>(
  resourceId: string,
  callback: "lookup" | "tags" | "placeholder" | "key",
  run: () => Result,
): Result {
  try {
    return run();
  } catch (cause) {
    throw resourceCallbackThrewDiagnostic({
      resourceId,
      callback,
      cause,
    });
  }
}

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
        lookup: runResourceCallback(config.id, "lookup", () => config.lookup(...params)),
        tags:
          config.tags === undefined
            ? []
            : (runResourceCallback(config.id, "tags", () => config.tags?.(...params)) ?? []),
        ...(config.freshness === undefined ? {} : { freshness: config.freshness }),
        ...(config.placeholder === undefined
          ? {}
          : {
              placeholder: runResourceCallback(config.id, "placeholder", () =>
                config.placeholder?.(...params),
              ),
            }),
      };

      const ref = {
        kind: "resourceRef" as const,
        id: config.id,
        params,
        key: runResourceCallback(config.id, "key", () => config.key(...params)),
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
