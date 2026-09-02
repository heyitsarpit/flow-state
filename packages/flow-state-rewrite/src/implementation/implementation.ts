import { Context, Effect, Predicate } from "effect";

const implementationOutputTypeId: unique symbol = Symbol("flow-state implementation output");
const implementationErrorTypeId: unique symbol = Symbol("flow-state implementation error");
const implementationRequirementsTypeId: unique symbol = Symbol(
  "flow-state implementation requirements",
);
const implementationGraphTypeId: unique symbol = Symbol("flow-state implementation graph");

// FLOW_STATE_ALLOW_UNKNOWN_EFFECT_CHANNEL: this private graph stores heterogeneous provider acquisitions behind erased runtime dispatch; typed callers retain A/E/R on Implementation.
type ProviderEntry = {
  readonly kind: "succeed" | "effect";
  readonly service: Context.Key<unknown, unknown>;
  readonly acquire: Effect.Effect<unknown, unknown, unknown>;
};

type ImplementationCarrier<Output, ImplementationError, Requirements> = {
  readonly [implementationOutputTypeId]: (_value: never) => Output;
  readonly [implementationErrorTypeId]: (_value: never) => ImplementationError;
  readonly [implementationRequirementsTypeId]: (_value: never) => Requirements;
  readonly [implementationGraphTypeId]: readonly ProviderEntry[];
};

export type Implementation<
  Output = never,
  ImplementationError = never,
  Requirements = never,
> = ImplementationCarrier<Output, ImplementationError, Requirements> & {
  readonly kind: "implementation";
};

export type ImplementationServices<Value> = Value extends {
  readonly [implementationOutputTypeId]: (_value: never) => infer Output;
}
  ? Output
  : never;

export type ImplementationErrorOf<Value> = Value extends {
  readonly [implementationErrorTypeId]: (_value: never) => infer ImplementationError;
}
  ? ImplementationError
  : never;

export type ImplementationRequirementsOf<Value> = Value extends {
  readonly [implementationRequirementsTypeId]: (_value: never) => infer Requirements;
}
  ? Requirements
  : never;

type ImplementationKey = Context.Key<unknown, unknown>;

const invalid = (message: string): never => {
  throw new Error(message);
};

const isServiceKey = (value: unknown): value is ImplementationKey => {
  return Context.isKey(value) && Predicate.isString(value.key);
};

const assertServiceKey = (value: unknown): void => {
  if (!isServiceKey(value)) invalid("Implementation service must be an Effect Context key");
};

const assertUniqueServices = (providers: readonly ProviderEntry[]): void => {
  const seen = new Set<string>();
  for (const provider of providers) {
    const identity = provider.service.key;
    if (seen.has(identity)) invalid(`Implementation service is duplicated: ${identity}`);
    seen.add(identity);
  }
};

const makeImplementation = <Output, ImplementationError, Requirements>(
  providers: readonly ProviderEntry[],
): Implementation<Output, ImplementationError, Requirements> => {
  assertUniqueServices(providers);
  const output = (_value: never): Output => invalid("Implementation output is type-level only");
  const error = (_value: never): ImplementationError =>
    invalid("Implementation errors are type-level only");
  const requirements = (_value: never): Requirements =>
    invalid("Implementation requirements are type-level only");
  const graph = providers.map((provider) => {
    // oxlint-disable-next-line anti-slop/no-object-freeze -- provider entries are Flow-owned graph nodes.
    return Object.freeze({ ...provider });
  });
  // oxlint-disable-next-line anti-slop/no-object-freeze -- provider graph membership is immutable after construction.
  const frozenGraph = Object.freeze(graph);
  const implementation: Implementation<Output, ImplementationError, Requirements> = {
    kind: "implementation",
    [implementationOutputTypeId]: output,
    [implementationErrorTypeId]: error,
    [implementationRequirementsTypeId]: requirements,
    [implementationGraphTypeId]: frozenGraph,
  };
  // oxlint-disable-next-line anti-slop/no-object-freeze -- each provider graph is a closed Flow-owned value.
  return Object.freeze(implementation);
};

export const implementationEntries = <Output, ImplementationError, Requirements>(
  implementation: Implementation<Output, ImplementationError, Requirements>,
): readonly ProviderEntry[] => implementation[implementationGraphTypeId];

const succeed = <Identifier, Service>(
  service: Context.Key<Identifier, Service>,
  value: Service,
): Implementation<Identifier> => {
  assertServiceKey(service);
  const provider: ProviderEntry = {
    kind: "succeed",
    service,
    // oxlint-disable-next-line anti-slop/no-pure-effect-wrapper -- TYPE-009B provider graphs retain values as runtime-owned Effects without executing them here.
    acquire: Effect.succeed(value),
  };
  return makeImplementation<Identifier, never, never>([provider]);
};

const effect = <Identifier, Service, ImplementationError, Requirements>(
  service: Context.Key<Identifier, Service>,
  acquire: Effect.Effect<Service, ImplementationError, Requirements>,
): Implementation<Identifier, ImplementationError, Requirements> => {
  assertServiceKey(service);
  const provider: ProviderEntry = {
    kind: "effect",
    service,
    acquire,
  };
  return makeImplementation<Identifier, ImplementationError, Requirements>([provider]);
};

const merge = <LeftOutput, LeftError, LeftRequirements, RightOutput, RightError, RightRequirements>(
  left: Implementation<LeftOutput, LeftError, LeftRequirements>,
  right: Implementation<RightOutput, RightError, RightRequirements>,
): Implementation<
  LeftOutput | RightOutput,
  LeftError | RightError,
  LeftRequirements | RightRequirements
> =>
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
