import type { Effect, Option } from "effect";

import {
  FlowDiagnosticCodes,
  isFlowDiagnostic,
  resourceCallbackThrewDiagnostic,
} from "../../shared/diagnostics.js";
import { durableFlowKeyIdentity } from "./canonical-key.js";
import type {
  FlowResourceDefinition,
  FlowResourceFreshness,
  FlowResourceRef,
  FlowTag,
} from "./types.js";

export type AnyResourceDefinition = FlowResourceDefinition<
  string,
  any,
  unknown,
  unknown,
  unknown,
  unknown
>;

export type FlowResourceRuntimeMetadata<Value = unknown> = Readonly<{
  readonly tags: ReadonlyArray<FlowTag>;
  readonly placeholder?: Value | Option.Option<Value> | null | undefined;
  readonly freshness?: FlowResourceFreshness;
}>;

const resourceDefinitionsByRef = new WeakMap<object, AnyResourceDefinition>();
const resourceDefinitionsById = new Map<string, Set<AnyResourceDefinition>>();

export function runResourceCallback<Result>(
  resourceId: string,
  callback: "lookup" | "tags" | "placeholder" | "key",
  run: () => Result,
): Result {
  try {
    return run();
  } catch (cause) {
    if (isFlowDiagnostic(cause) && cause.code === FlowDiagnosticCodes.invalidResourceKey) {
      throw cause;
    }
    throw resourceCallbackThrewDiagnostic({
      resourceId,
      callback,
      cause,
    });
  }
}

export function registerResourceRef(ref: FlowResourceRef, definition: AnyResourceDefinition): void {
  registerResourceDefinition(definition);
  resourceDefinitionsByRef.set(ref, definition);
}

export function registerResourceDefinition(definition: AnyResourceDefinition): void {
  const definitions =
    resourceDefinitionsById.get(definition.id) ?? new Set<AnyResourceDefinition>();
  definitions.add(definition);
  resourceDefinitionsById.set(definition.id, definitions);
}

export function resourceDefinitionsForSerializedRef(
  ref: FlowResourceRef,
): ReadonlyArray<AnyResourceDefinition> {
  const existing = resourceDefinitionForRef(ref);
  if (existing !== undefined) {
    return Object.freeze([existing]);
  }

  const definitions = resourceDefinitionsById.get(ref.id);
  if (definitions === undefined) {
    return Object.freeze([]);
  }

  const serializedIdentity = durableFlowKeyIdentity(ref.key);
  return Object.freeze(
    Array.from(definitions).filter((definition) => {
      const expectedKey = runResourceCallback(definition.id, "key", () =>
        definition.config.key(...ref.params),
      );
      return durableFlowKeyIdentity(expectedKey) === serializedIdentity;
    }),
  );
}

export function resourceDefinitionForRef<Value, Error, Requirements>(
  ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
):
  | FlowResourceDefinition<string, ReadonlyArray<unknown>, Value, Error, Requirements, unknown>
  | undefined {
  return resourceDefinitionsByRef.get(ref) as
    | FlowResourceDefinition<string, ReadonlyArray<unknown>, Value, Error, Requirements, unknown>
    | undefined;
}

export function resourceMetadataForRef<Value>(
  ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
): FlowResourceRuntimeMetadata<Value> | undefined {
  const definition = resourceDefinitionForRef<Value, unknown, unknown>(ref);
  if (definition === undefined) {
    return undefined;
  }

  const tags = definition.config.tags;
  return {
    tags:
      tags === undefined
        ? []
        : typeof tags === "function"
          ? (runResourceCallback(definition.id, "tags", () => tags(...ref.params)) ?? [])
          : tags,
    ...(definition.config.placeholder === undefined
      ? {}
      : {
          placeholder: runResourceCallback(definition.id, "placeholder", () =>
            definition.config.placeholder?.(...ref.params),
          ),
        }),
    ...(definition.config.freshness === undefined
      ? {}
      : { freshness: definition.config.freshness }),
  };
}

export function hasResourceRuntimeDefinition(
  ref: FlowResourceRef<string, ReadonlyArray<unknown>, unknown>,
): boolean {
  return resourceDefinitionForRef(ref) !== undefined;
}

export function resourceSchemaForRef(
  ref: FlowResourceRef<string, ReadonlyArray<unknown>, unknown>,
): unknown {
  return resourceDefinitionForRef(ref)?.config.schema;
}

export function resourceLookupForRef<Value, Error, Requirements>(
  ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
): Effect.Effect<Value, Error, Requirements> | undefined {
  const definition = resourceDefinitionForRef<Value, Error, Requirements>(ref);
  if (definition === undefined) {
    return undefined;
  }

  return runResourceCallback(definition.id, "lookup", () =>
    definition.config.lookup(...ref.params),
  );
}
