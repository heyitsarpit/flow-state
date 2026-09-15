import { Context, Effect, Result, type Types } from "effect";

import { app, definition, machine, module, resource, runtimeSetup } from "../index.js";
import type { Module, RequirementsOf } from "../index.js";

/*
 * Proof organization:
 *
 * Fixtures and local builders
 * Type relationships and negative authoring cases
 * Behavior suites grouped by observable law
 *
 * Compile-only proof file; no runtime scenario state is shared.
 */

type Expect<Value extends true> = Value;

interface RepoService {
  load: () => string;
}

class Repo extends Context.Service<Repo, RepoService>()("AppType/Repo") {}

const requiredResource = resource({
  id: "app-type/repository",
  key: (id: string) => [id] as const,
  // RETURN_TYPE: Preserves the Repo requirement and missing channel for the public provider proof.
  lookup: (id: string): Effect.Effect<string, "missing", Repo> => Effect.succeed(id),
});

const requiredDefinitionResult = definition({
  id: "app-type/required",
  states: ["ready"],
  events: { refresh: "bare" },
  operations: { repository: requiredResource },
});

const requiredDefinition = Result.getOrThrow(requiredDefinitionResult);

const requiredMachineResult = machine(requiredDefinitionResult, ({ S }) => ({
  default: S.ready,
  states: { ready: {} },
}));

const requiredMachine = Result.getOrThrow(requiredMachineResult);

const requiredModule = module({
  id: "app-type/module",
  machines: { required: requiredMachine },
});

const tupleApp = app({
  id: "app-type/tuple",
  persistenceVersion: "1",
  modules: [requiredModule] as const,
});

const homogeneousModules: (typeof requiredModule)[] = [requiredModule];

const homogeneousApp = app({
  id: "app-type/homogeneous",
  persistenceVersion: "1",
  modules: homogeneousModules,
});

const broadModules: Module[] = [requiredModule];

const broadApp = app({
  id: "app-type/broad",
  persistenceVersion: "1",
  modules: broadModules,
});

const emptyApp = app({
  id: "app-type/empty",
  persistenceVersion: "1",
  modules: [] as const,
});

export type _OperationRequirements = Expect<
  Types.Equals<RequirementsOf<typeof requiredResource>, Repo>
>;

export type _DefinitionRequirements = Expect<
  Types.Equals<RequirementsOf<typeof requiredDefinition.operations.repository>, Repo>
>;

export type _MachineRequirements = Expect<
  Types.Equals<RequirementsOf<typeof requiredMachine>, Repo>
>;

export type _ModuleRequirements = Expect<Types.Equals<RequirementsOf<typeof requiredModule>, Repo>>;

export type _TupleRequirements = Expect<Types.Equals<RequirementsOf<typeof tupleApp>, Repo>>;

export type _TupleMachine = Expect<
  Types.Equals<typeof tupleApp.M.required, typeof requiredMachine>
>;

export type _TupleDescriptor = Expect<
  Types.Equals<typeof tupleApp.M.required.definition.operations.repository, typeof requiredResource>
>;

export type _HomogeneousRequirements = Expect<
  Types.Equals<RequirementsOf<typeof homogeneousApp>, Repo>
>;

export type _HomogeneousMachine = Expect<
  Types.Equals<
    (typeof homogeneousApp.modules)[number]["machines"]["required"],
    typeof requiredMachine
  >
>;

export type _HomogeneousDescriptor = Expect<
  Types.Equals<
    (typeof homogeneousApp.modules)[number]["machines"]["required"]["definition"]["operations"]["repository"],
    typeof requiredResource
  >
>;

export type _BroadRequirements = Expect<Types.Equals<RequirementsOf<typeof broadApp>, unknown>>;

export type _ErasedRequirements = Expect<Types.Equals<RequirementsOf<Module>, unknown>>;

export type _BroadMachineKeys = Expect<Types.Equals<keyof typeof broadApp.M, never>>;

export type _EmptyRequirements = Expect<Types.Equals<RequirementsOf<typeof emptyApp>, never>>;

export type _EmptyMachineKeys = Expect<Types.Equals<keyof typeof emptyApp.M, never>>;

// Negative authoring cases stay after the positive relationship assertions so their
// Error directives remain attached to the exact rejected expressions.
// @ts-expect-error AppPlan is package-private and absent from the public App value.
export type _PrivateAppPlan = typeof tupleApp.plan;

// @ts-expect-error Open module arrays do not guarantee a named App.M property.
const namedHomogeneousMachine: typeof requiredMachine = homogeneousApp.M.required;

// @ts-expect-error Erased module requirements cannot select the dependency-free overload.
runtimeSetup({ app: broadApp });

const broadOptions = { app: broadApp };

// @ts-expect-error Erased module requirements cannot be hidden in a variable.
runtimeSetup(broadOptions);

void namedHomogeneousMachine;
