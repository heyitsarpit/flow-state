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

type AnyResourceDefinition = FlowResourceDefinition<
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

export function attachSerializedResourceRef(ref: FlowResourceRef): boolean {
  if (definitionForRef(ref) !== undefined) {
    return true;
  }

  const definitions = resourceDefinitionsById.get(ref.id);
  if (definitions === undefined) {
    return false;
  }

  let matchedDefinition: AnyResourceDefinition | undefined;
  for (const definition of definitions) {
    const expectedKey = runResourceCallback(definition.id, "key", () =>
      definition.config.key(...ref.params),
    );
    if (durableFlowKeyIdentity(expectedKey) !== durableFlowKeyIdentity(ref.key)) {
      continue;
    }

    if (matchedDefinition !== undefined && matchedDefinition !== definition) {
      return false;
    }

    matchedDefinition = definition;
  }

  if (matchedDefinition === undefined) {
    return false;
  }

  registerResourceRef(ref, matchedDefinition);
  return true;
}

function definitionForRef<Value, Error, Requirements>(
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
  const definition = definitionForRef<Value, unknown, unknown>(ref);
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
  return definitionForRef(ref) !== undefined;
}

export function resourceSchemaForRef(
  ref: FlowResourceRef<string, ReadonlyArray<unknown>, unknown>,
): unknown {
  return definitionForRef(ref)?.config.schema;
}

export function resourceLookupForRef<Value, Error, Requirements>(
  ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
): Effect.Effect<Value, Error, Requirements> | undefined {
  const definition = definitionForRef<Value, Error, Requirements>(ref);
  if (definition === undefined) {
    return undefined;
  }

  return runResourceCallback(definition.id, "lookup", () =>
    definition.config.lookup(...ref.params),
  );
}
