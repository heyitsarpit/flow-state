import { Layer } from "effect";
import type { Context, Effect } from "effect";

declare const ImplementationLayerTypeId: unique symbol;

export type Implementation<Output = never, Error = never, Requirements = never> = {
  kind: "implementation";
  // oxlint-disable-next-line anti-slop/no-readonly -- This hidden witness preserves invariant Layer channels without exposing a runtime Layer.
  readonly [ImplementationLayerTypeId]: Layer.Layer<Output, Error, Requirements>;
};

export type ImplementationServices<Value extends Implementation<never, unknown, unknown>> =
  Layer.Success<Value[typeof ImplementationLayerTypeId]>;

export type ImplementationErrorOf<Value extends Implementation<never, unknown, unknown>> =
  Layer.Error<Value[typeof ImplementationLayerTypeId]>;

export type ImplementationRequirementsOf<Value extends Implementation<never, unknown, unknown>> =
  Layer.Services<Value[typeof ImplementationLayerTypeId]>;

type ImplementationData = {
  // FLOW_STATE_ALLOW_UNKNOWN: The private heterogeneous store erases Layer channels; the hidden type witness restores them at lookup.
  layer: unknown;
  serviceKeys: string[];
};

// FLOW_STATE_ALLOW_UNKNOWN: The private store keys heterogeneous providers; the hidden Layer witness retains their exact channels.
const implementationData = new WeakMap<
  Implementation<never, unknown, unknown>,
  ImplementationData
>();

// FLOW_STATE_ALLOW_UNKNOWN: This lookup erases heterogeneous channels carried by each implementation's hidden Layer witness.
const dataOf = (implementation: Implementation<never, unknown, unknown>) => {
  const data = implementationData.get(implementation);

  if (data === undefined) throw new TypeError("Implementation must be created by Implementation");

  return data;
};

// RETURN_TYPE: Preserves the `kind: "implementation"` discriminant; inference widens it to string.
const makeImplementation = <Output, Error, Requirements>(
  layer: Layer.Layer<Output, Error, Requirements>,
  serviceKeys: string[],
): Implementation<Output, Error, Requirements> => {
  const seen = new Set<string>();

  for (const key of serviceKeys) {
    if (seen.has(key)) throw new Error(`Implementation service is duplicated: ${key}`);
    seen.add(key);
  }

  // SAFETY: The Layer witness is phantom; only this factory registers values in the private map.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- WeakMap membership supplies the runtime brand.
  const implementation = { kind: "implementation" as const } as Implementation<
    Output,
    Error,
    Requirements
  >;

  implementationData.set(implementation, { layer, serviceKeys });

  return implementation;
};

export const implementationLayer = <Output, Error, Requirements>(
  implementation: Implementation<Output, Error, Requirements>,
) => {
  const data = dataOf(implementation);

  // SAFETY: The private map stores the exact Layer paired with this branded instance in makeImplementation.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the opaque type preserves these Layer channels.
  return data.layer as Layer.Layer<Output, Error, Requirements>;
};

const succeed = <Identifier, Service>(service: Context.Key<Identifier, Service>, value: Service) =>
  makeImplementation(Layer.succeed(service, value), [service.key]);

const effect = <Identifier, Service, Error, Requirements>(
  service: Context.Key<Identifier, Service>,
  acquire: Effect.Effect<Service, Error, Requirements>,
) => makeImplementation(Layer.effect(service, acquire), [service.key]);

const merge = <LeftOutput, LeftError, LeftRequirements, RightOutput, RightError, RightRequirements>(
  left: Implementation<LeftOutput, LeftError, LeftRequirements>,
  right: Implementation<RightOutput, RightError, RightRequirements>,
) => {
  const leftData = dataOf(left);
  const rightData = dataOf(right);

  return makeImplementation(
    implementationLayer(right).pipe(Layer.provideMerge(implementationLayer(left))),
    [...leftData.serviceKeys, ...rightData.serviceKeys],
  );
};

export const Implementation = { succeed, effect, merge };
