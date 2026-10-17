import { assert, describe, it } from "@effect/vitest";
import { Context, Effect, Layer, type Types } from "effect";

import { Implementation, implementationLayer } from "../implementation.js";
import type {
  Implementation as ImplementationType,
  ImplementationErrorOf,
  ImplementationRequirementsOf,
  ImplementationServices,
} from "../implementation.js";

type Expect<Value extends true> = Value;

type ProjectRepoService = { find: (id: string) => Effect.Effect<{ id: string }> };

class ProjectRepo extends Context.Service<ProjectRepo, ProjectRepoService>()(
  "ImplementationTest/ProjectRepo",
) {}

type ProjectConfigService = { region: string };

class ProjectConfig extends Context.Service<ProjectConfig, ProjectConfigService>()(
  "ImplementationTest/ProjectConfig",
) {}

const projectApi = ProjectRepo.of({
  find: (id: string) => Effect.succeed({ id }),
});

const synchronous = Implementation.succeed(ProjectRepo, projectApi);

const acquire: Effect.Effect<ProjectConfigService, "configuration-failed", ProjectRepo> =
  Effect.succeed({ region: "test" });

const effectful = Implementation.effect(ProjectConfig, acquire);

const complete = Implementation.merge(synchronous, effectful);

const dependencyAware = Implementation.merge(
  synchronous,
  Implementation.effect(
    ProjectConfig,
    Effect.gen(function* () {
      const repo = yield* ProjectRepo;

      return { region: repo.find === projectApi.find ? "test" : "unexpected" };
    }),
  ),
);

const dependencyAwareLayer = implementationLayer(dependencyAware);

type ErasedImplementation = ImplementationType<never, unknown, unknown>;

const erasedSynchronous: ErasedImplementation = synchronous;

// @ts-expect-error Native Layer acquisition is private to the Runtime adapter.
void synchronous.layer;

// @ts-expect-error Provider identity metadata is private to Implementation.
void synchronous.serviceKeys;

// @ts-expect-error A Repo provider cannot widen to an implementation claiming arbitrary services.
const arbitraryServices: ImplementationType<unknown> = synchronous;

// @ts-expect-error A Repo provider cannot satisfy an unrelated Config service.
const unrelatedConfig: ImplementationType<ProjectConfig> = synchronous;

export type _SynchronousServices = Expect<
  Types.Equals<ImplementationServices<typeof synchronous>, ProjectRepo>
>;

export type _EmptyServices = Expect<Types.Equals<ImplementationServices<Implementation>, never>>;

export type _EmptyError = Expect<Types.Equals<ImplementationErrorOf<Implementation>, never>>;

export type _EmptyRequirements = Expect<
  Types.Equals<ImplementationRequirementsOf<Implementation>, never>
>;

export type _SynchronousError = Expect<
  Types.Equals<ImplementationErrorOf<typeof synchronous>, never>
>;

export type _EffectServices = Expect<
  Types.Equals<ImplementationServices<typeof effectful>, ProjectConfig>
>;

export type _EffectError = Expect<
  Types.Equals<ImplementationErrorOf<typeof effectful>, "configuration-failed">
>;

export type _EffectRequirements = Expect<
  Types.Equals<ImplementationRequirementsOf<typeof effectful>, ProjectRepo>
>;

export type _MergedServices = Expect<
  Types.Equals<ImplementationServices<typeof complete>, ProjectRepo | ProjectConfig>
>;

export type _MergedError = Expect<
  Types.Equals<ImplementationErrorOf<typeof complete>, "configuration-failed">
>;

export type _MergedRequirements = Expect<
  Types.Equals<ImplementationRequirementsOf<typeof complete>, never>
>;

export type _NativeLayerRequirements = Expect<
  Types.Equals<Layer.Services<typeof dependencyAwareLayer>, never>
>;

void erasedSynchronous;

void arbitraryServices;

void unrelatedConfig;

describe("implementation providers", () => {
  it("preserves service, output, error, and requirement types through provider composition", () => {
    assert.strictEqual(synchronous.kind, "implementation");
    assert.strictEqual(effectful.kind, "implementation");
    assert.strictEqual(complete.kind, "implementation");
    assert.deepStrictEqual(Object.keys(Implementation).sort(), ["effect", "merge", "succeed"]);
  });

  it("keeps effect acquisition inert until the runtime owner executes it", () => {
    let calls = 0;

    const inertAcquire: Effect.Effect<ProjectConfigService> = Effect.sync(() => {
      calls += 1;

      return ProjectConfig.of({ region: "inert" });
    });

    Implementation.effect(ProjectConfig, inertAcquire);
    assert.strictEqual(calls, 0);
  });

  it("does not inspect provider values during implementation admission", () => {
    const opaqueService = new Proxy(projectApi, {
      get: () => {
        throw new Error("provider value was inspected");
      },
      ownKeys: () => {
        throw new Error("provider value was inspected");
      },
    });

    assert.doesNotThrow(() => Implementation.succeed(ProjectRepo, opaqueService));
  });

  it("rejects duplicate service identity instead of selecting by order", () => {
    const expected = /^Implementation service is duplicated: ImplementationTest\/ProjectRepo$/u;
    assert.throws(() => Implementation.merge(synchronous, synchronous), expected);

    const sameIdentity = Context.Service<ProjectRepoService>("ImplementationTest/ProjectRepo");
    const duplicate = Implementation.succeed(sameIdentity, projectApi);
    assert.throws(() => Implementation.merge(synchronous, duplicate), expected);
  });

  it("keeps duplicate detection independent of caller mutations", () => {
    const provider = Implementation.succeed(ProjectRepo, projectApi);
    const duplicate = Implementation.succeed(ProjectRepo, projectApi);
    const callerOwnedServiceKeys: string[] = [];
    Object.defineProperty(provider, "serviceKeys", { value: callerOwnedServiceKeys });

    callerOwnedServiceKeys.push("ImplementationTest/ProjectRepo");
    callerOwnedServiceKeys.splice(0);

    const expected = /^Implementation service is duplicated: ImplementationTest\/ProjectRepo$/u;
    assert.throws(() => Implementation.merge(provider, duplicate), expected);
  });

  it("rejects provider-like values that were not created by the factory", () => {
    const provider = Implementation.succeed(ProjectRepo, projectApi);
    const sameIdentity = Layer.succeed(ProjectRepo, projectApi);
    const forged = Reflect.construct(provider.constructor, [sameIdentity, []]);

    Object.assign(forged, {
      kind: "implementation",
      layer: sameIdentity,
      serviceKeys: [ProjectRepo.key],
    });

    assert.throws(
      () => Implementation.merge(forged, provider),
      /^Implementation must be created by Implementation$/u,
    );
    assert.throws(
      () => implementationLayer(forged),
      /^Implementation must be created by Implementation$/u,
    );
  });

  it("does not expose the native Layer for caller-owned acquisition", () => {
    assert.strictEqual("layer" in synchronous, false);
  });

  it.effect("composes dependent providers through native Layers", () =>
    Effect.gen(function* () {
      const context = yield* Layer.build(dependencyAwareLayer);

      assert.strictEqual(Context.get(context, ProjectConfig).region, "test");
    }),
  );

  it.effect("defers native Layer acquisition until the Layer is built", () =>
    Effect.gen(function* () {
      let calls = 0;

      const inert = Implementation.effect(
        ProjectConfig,
        Effect.sync(() => {
          calls += 1;

          return ProjectConfig.of({ region: "inert" });
        }),
      );

      assert.strictEqual(calls, 0);
      const context = yield* Layer.build(implementationLayer(inert));
      assert.strictEqual(calls, 1);
      assert.strictEqual(Context.get(context, ProjectConfig).region, "inert");
    }),
  );
});
