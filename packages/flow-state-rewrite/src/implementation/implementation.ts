import { Layer } from "effect";
import type { Context, Effect } from "effect";

export type Implementation<Output = never, Error = never, Requirements = never> = {
  kind: "implementation";
  layer: Layer.Layer<Output, Error, Requirements>;
  serviceKeys: string[];
};

export type ImplementationServices<Value extends Implementation<never, unknown, unknown>> =
  Layer.Success<Value["layer"]>;

export type ImplementationErrorOf<Value extends Implementation<never, unknown, unknown>> =
  Layer.Error<Value["layer"]>;

export type ImplementationRequirementsOf<Value extends Implementation<never, unknown, unknown>> =
  Layer.Services<Value["layer"]>;

const makeImplementation = <Output, Error, Requirements>(
  layer: Layer.Layer<Output, Error, Requirements>,
  serviceKeys: string[],
): Implementation<Output, Error, Requirements> => {
  const seen = new Set<string>();

  for (const key of serviceKeys) {
    if (seen.has(key)) throw new Error(`Implementation service is duplicated: ${key}`);
    seen.add(key);
  }

  return { kind: "implementation", layer, serviceKeys };
};

export const implementationLayer = <Output, Error, Requirements>(
  implementation: Implementation<Output, Error, Requirements>,
) => implementation.layer;

const succeed = <Identifier, Service>(service: Context.Key<Identifier, Service>, value: Service) =>
  makeImplementation(Layer.succeed(service, value), [service.key]);

const effect = <Identifier, Service, Error, Requirements>(
  service: Context.Key<Identifier, Service>,
  acquire: Effect.Effect<Service, Error, Requirements>,
) => makeImplementation(Layer.effect(service, acquire), [service.key]);

const merge = <LeftOutput, LeftError, LeftRequirements, RightOutput, RightError, RightRequirements>(
  left: Implementation<LeftOutput, LeftError, LeftRequirements>,
  right: Implementation<RightOutput, RightError, RightRequirements>,
) =>
  makeImplementation(right.layer.pipe(Layer.provideMerge(left.layer)), [
    ...left.serviceKeys,
    ...right.serviceKeys,
  ]);

export const Implementation = { succeed, effect, merge };
