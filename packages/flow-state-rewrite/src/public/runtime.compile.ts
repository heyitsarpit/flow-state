import { Context, Effect, Result, type Types } from "effect";

import {
  Implementation,
  app,
  definition,
  machine,
  module,
  resource,
  runtimeSetup,
} from "../index.js";
import type { Implementation as ImplementationType, RuntimeSetup } from "../index.js";

type Expect<Value extends true> = Value;

type Service = { readonly load: () => string };

class Repo extends Context.Service<Repo, Service>()("RuntimeType/Repo") {}

class Config extends Context.Service<Config, Service>()("RuntimeType/Config") {}

const repo = Repo.of({ load: () => "loaded" });
const config = Config.of({ load: () => "configured" });

const requiredResource = resource({
  id: "runtime-type/repository",
  key: (id: string) => [id] as const,
  // RETURN_TYPE: Preserves Repo and the missing channel for the required-provider runtime proof.
  lookup: (id: string): Effect.Effect<string, "missing", Repo> => Effect.succeed(id),
});

const requiredDefinition = definition({
  id: "runtime-type/required",
  states: ["ready"],
  events: { refresh: "bare" },
  operations: { repository: requiredResource },
});

const requiredMachine = Result.getOrThrow(
  machine(requiredDefinition, ({ S }) => ({
    default: S.ready,
    states: { ready: {} },
  })),
);

const EmptyApp = app({
  id: "runtime-type/empty",
  persistenceVersion: "1",
  modules: [],
});

const RequiredApp = app({
  id: "runtime-type/required-app",
  persistenceVersion: "1",
  modules: [module({ id: "runtime-type/module", machines: { required: requiredMachine } })],
});

const complete = Implementation.succeed(Repo, repo);
const superset = Implementation.merge(complete, Implementation.succeed(Config, config));
const wrong = Implementation.succeed(Config, repo);
const residual = Implementation.effect(Repo, Effect.service(Config).pipe(Effect.map(() => repo)));
const failureAcquire: Effect.Effect<Service, "provider-failed"> = Effect.fail("provider-failed");
const failing = Implementation.effect(Repo, failureAcquire);

const emptySetup = runtimeSetup({ app: EmptyApp });
const emptyOptions = { app: EmptyApp };
const emptyVariableSetup = runtimeSetup(emptyOptions);

// @ts-expect-error A required App cannot omit its provider.
runtimeSetup({ app: RequiredApp });
const missingOptions = { app: RequiredApp };
// @ts-expect-error A required App cannot omit its provider through a variable.
runtimeSetup(missingOptions);

const completeSetup = runtimeSetup({ app: RequiredApp, implementation: complete });
const completeOptions = { app: RequiredApp, implementation: complete };
const completeVariableSetup = runtimeSetup(completeOptions);
const supersetSetup = runtimeSetup({ app: RequiredApp, implementation: superset });
const supersetOptions = { app: RequiredApp, implementation: superset };
const supersetVariableSetup = runtimeSetup(supersetOptions);

// @ts-expect-error A provider for a distinct service key cannot close Repo.
runtimeSetup({ app: RequiredApp, implementation: wrong });
const wrongOptions = { app: RequiredApp, implementation: wrong };
// @ts-expect-error A variable cannot bypass service coverage validation.
runtimeSetup(wrongOptions);

// @ts-expect-error A provider with a remaining Config requirement is incomplete.
runtimeSetup({ app: RequiredApp, implementation: residual });
const residualOptions = { app: RequiredApp, implementation: residual };
// @ts-expect-error A variable cannot bypass residual requirement validation.
runtimeSetup(residualOptions);

const requiredFailingSetup = runtimeSetup({ app: RequiredApp, implementation: failing });
const requiredFailingOptions = { app: RequiredApp, implementation: failing };
const requiredFailingVariableSetup = runtimeSetup(requiredFailingOptions);
const emptyFailingSetup = runtimeSetup({ app: EmptyApp, implementation: failing });
const emptyFailingOptions = { app: EmptyApp, implementation: failing };
const emptyFailingVariableSetup = runtimeSetup(emptyFailingOptions);

// RETURN_TYPE: Preserves the optional provider union for the required-provider narrowing proof.
const optionalProvider = (): typeof complete | undefined => complete;
const maybeProvider = optionalProvider();
// @ts-expect-error A possibly undefined provider for a required App must be narrowed.
runtimeSetup({ app: RequiredApp, implementation: maybeProvider });
const optionalOptions = { app: RequiredApp, implementation: maybeProvider };
// @ts-expect-error Optional provider variables cannot bypass the required-provider route.
runtimeSetup(optionalOptions);
if (maybeProvider !== undefined) {
  runtimeSetup({ app: RequiredApp, implementation: maybeProvider });
}

const keepOptions = <
  AppValue extends { readonly kind: "app" },
  ImplementationValue extends ImplementationType<never, unknown, unknown>,
>(options: {
  readonly app: AppValue;
  readonly implementation: ImplementationValue;
}) => options;

const wrappedComplete = keepOptions({ app: RequiredApp, implementation: complete });
const wrappedSuperset = keepOptions({ app: RequiredApp, implementation: superset });
const wrappedWrong = keepOptions({ app: RequiredApp, implementation: wrong });
const wrappedResidual = keepOptions({ app: RequiredApp, implementation: residual });
runtimeSetup(wrappedComplete);
runtimeSetup(wrappedSuperset);
// @ts-expect-error A named generic wrapper cannot bypass service coverage validation.
runtimeSetup(wrappedWrong);
// @ts-expect-error A named generic wrapper cannot bypass residual requirement validation.
runtimeSetup(wrappedResidual);

const keepOptionalOptions = <
  AppValue extends { readonly kind: "app" },
  ImplementationValue extends ImplementationType<never, unknown, unknown> | undefined,
>(options: {
  readonly app: AppValue;
  readonly implementation: ImplementationValue;
}) => options;

const wrappedOptional = keepOptionalOptions({ app: RequiredApp, implementation: maybeProvider });
// @ts-expect-error A named generic wrapper cannot hide an optional required provider.
runtimeSetup(wrappedOptional);

const rejectBroadImplementation = (implementation: ImplementationType<unknown>) => {
  // @ts-expect-error Implementation<unknown> does not promise the required Repo service.
  runtimeSetup({ app: RequiredApp, implementation });
};

export type _EmptyWithoutImplementation = Expect<
  Types.Equals<typeof emptySetup, RuntimeSetup<typeof EmptyApp>>
>;
export type _EmptyVariableWithoutImplementation = Expect<
  Types.Equals<typeof emptyVariableSetup, RuntimeSetup<typeof EmptyApp>>
>;
export type _CompleteImplementation = Expect<
  Types.Equals<typeof completeSetup, RuntimeSetup<typeof RequiredApp>>
>;
export type _CompleteVariableImplementation = Expect<
  Types.Equals<typeof completeVariableSetup, RuntimeSetup<typeof RequiredApp>>
>;
export type _SupersetImplementation = Expect<
  Types.Equals<typeof supersetSetup, RuntimeSetup<typeof RequiredApp>>
>;
export type _SupersetVariableImplementation = Expect<
  Types.Equals<typeof supersetVariableSetup, RuntimeSetup<typeof RequiredApp>>
>;
export type _RequiredLiteralError = Expect<
  Types.Equals<typeof requiredFailingSetup, RuntimeSetup<typeof RequiredApp, "provider-failed">>
>;
export type _RequiredVariableError = Expect<
  Types.Equals<
    typeof requiredFailingVariableSetup,
    RuntimeSetup<typeof RequiredApp, "provider-failed">
  >
>;
export type _EmptyLiteralError = Expect<
  Types.Equals<typeof emptyFailingSetup, RuntimeSetup<typeof EmptyApp, "provider-failed">>
>;
export type _EmptyVariableError = Expect<
  Types.Equals<typeof emptyFailingVariableSetup, RuntimeSetup<typeof EmptyApp, "provider-failed">>
>;

void rejectBroadImplementation;
