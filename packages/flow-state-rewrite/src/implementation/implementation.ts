import { Effect, Schema } from "effect";
import type { Context } from "effect";

/*
 * Implementation:
 *
 * Provider graph and variance
 * Graph admission:
 *   ImplementationGraphSchema, decodeImplementationGraph
 * Construction:
 *   makeImplementation, succeed, effect, merge
 * Assembly:
 *   Implementation
 */
const implementationMarker: unique symbol = Symbol();
const implementationGraphTypeId: unique symbol = Symbol("flow-state implementation graph");

// FLOW_STATE_ALLOW_UNKNOWN_EFFECT_CHANNEL: this private graph stores heterogeneous provider acquisitions behind erased runtime dispatch; typed callers retain A/E/R on Implementation.
type ImplementationProviderEntry =
  | {
      readonly kind: "succeed";
      readonly service: Context.Key<unknown, unknown>;
      readonly value: unknown;
    }
  | {
      readonly kind: "effect";
      readonly service: Context.Key<unknown, unknown>;
      readonly acquire: Effect.Effect<unknown, unknown, unknown>;
    };

type ImplementationVariance<Output, ImplementationError, Requirements> = {
  readonly output: (_: Output) => void;
  readonly error: ImplementationError;
  readonly requirements: Requirements;
};

type ImplementationCarrier<Output, ImplementationError, Requirements> = {
  readonly [implementationMarker]?: ImplementationVariance<
    Output,
    ImplementationError,
    Requirements
  >;
  readonly [implementationGraphTypeId]: readonly ImplementationProviderEntry[];
};

export type Implementation<
  Output = never,
  ImplementationError = never,
  Requirements = never,
> = ImplementationCarrier<Output, ImplementationError, Requirements> & {
  readonly kind: "implementation";
};

export type ImplementationServices<Value> = Value extends {
  readonly [implementationMarker]?: { readonly output: (_: infer Output) => void };
}
  ? Output
  : never;

export type ImplementationErrorOf<Value> = Value extends {
  readonly [implementationMarker]?: { readonly error: infer ImplementationError };
}
  ? ImplementationError
  : never;

export type ImplementationRequirementsOf<Value> = Value extends {
  readonly [implementationMarker]?: { readonly requirements: infer Requirements };
}
  ? Requirements
  : never;

const ImplementationGraphSchema = Schema.declareConstructor<
  readonly ImplementationProviderEntry[],
  readonly ImplementationProviderEntry[]
>()([], () => (input) => {
  // SAFETY: makeImplementation is the sole caller and passes this decoder's typed private graph directly.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the fixed decoder is only called with makeImplementation's typed private provider graph.
  const providers = input as readonly ImplementationProviderEntry[];
  const seen = new Set<string>();

  for (const provider of providers) {
    const identity = provider.service.key;
    if (seen.has(identity)) throw new Error(`Implementation service is duplicated: ${identity}`);
    seen.add(identity);
  }

  return Effect.succeed(providers);
});

const decodeImplementationGraph = Schema.decodeSync(ImplementationGraphSchema);

// RETURN_TYPE: Preserves the phantom Output/Error/Requirements channels that cannot be inferred from the runtime provider graph.
const makeImplementation = <Output, ImplementationError, Requirements>(
  providers: readonly ImplementationProviderEntry[],
): Implementation<Output, ImplementationError, Requirements> => {
  const admittedProviders = decodeImplementationGraph(providers);
  return {
    kind: "implementation",
    [implementationGraphTypeId]: admittedProviders,
  };
};

export const implementationEntries = <Output, ImplementationError, Requirements>(
  implementation: Implementation<Output, ImplementationError, Requirements>,
) => implementation[implementationGraphTypeId];

const succeed = <Identifier, Service>(
  service: Context.Key<Identifier, Service>,
  value: Service,
) => {
  const provider: ImplementationProviderEntry = {
    kind: "succeed",
    service,
    value,
  };
  return makeImplementation<Identifier, never, never>([provider]);
};

const effect = <Identifier, Service, ImplementationError, Requirements>(
  service: Context.Key<Identifier, Service>,
  acquire: Effect.Effect<Service, ImplementationError, Requirements>,
) => {
  const provider: ImplementationProviderEntry = {
    kind: "effect",
    service,
    acquire,
  };
  return makeImplementation<Identifier, ImplementationError, Requirements>([provider]);
};

const merge = <LeftOutput, LeftError, LeftRequirements, RightOutput, RightError, RightRequirements>(
  left: Implementation<LeftOutput, LeftError, LeftRequirements>,
  right: Implementation<RightOutput, RightError, RightRequirements>,
) =>
  makeImplementation<
    LeftOutput | RightOutput,
    LeftError | RightError,
    LeftRequirements | RightRequirements
  >([...implementationEntries(left), ...implementationEntries(right)]);

export const Implementation = {
  succeed,
  effect,
  merge,
};
