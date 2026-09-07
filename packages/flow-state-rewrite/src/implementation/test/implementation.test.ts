import { assert, describe, it } from "@effect/vitest";
import { Context, Effect, type Types } from "effect";

import { Implementation, implementationEntries } from "../implementation.js";
import type {
  Implementation as ImplementationType,
  ImplementationErrorOf,
  ImplementationRequirementsOf,
  ImplementationServices,
} from "../implementation.js";

type Expect<Value extends true> = Value;

type ProjectRepoService = { readonly find: (id: string) => Effect.Effect<{ readonly id: string }> };

class ProjectRepo extends Context.Service<ProjectRepo, ProjectRepoService>()(
  "ImplementationTest/ProjectRepo",
) {}

type ProjectConfigService = { readonly region: string };

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
type ErasedImplementation = ImplementationType<never, unknown, unknown>;
const erasedSynchronous: ErasedImplementation = synchronous;

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
  Types.Equals<ImplementationRequirementsOf<typeof complete>, ProjectRepo>
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

  it("does not inspect provider values during graph admission", () => {
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

  it("stores plain values and retains effect values", () => {
    const synchronousEntry = implementationEntries(synchronous)[0];
    if (synchronousEntry === undefined || synchronousEntry.kind !== "succeed") {
      throw new Error("Expected a synchronous provider entry");
    }
    assert.strictEqual(synchronousEntry.value, projectApi);
    assert.strictEqual(Object.hasOwn(synchronousEntry, "acquire"), false);

    const effectfulEntry = implementationEntries(effectful)[0];
    if (effectfulEntry === undefined || effectfulEntry.kind !== "effect") {
      throw new Error("Expected an effect provider entry");
    }
    assert.strictEqual(effectfulEntry.acquire, acquire);
    assert.strictEqual(Object.hasOwn(effectfulEntry, "value"), false);
    const completeEntries = implementationEntries(complete);
    assert.strictEqual(completeEntries[0], implementationEntries(synchronous)[0]);
    assert.strictEqual(completeEntries[1], implementationEntries(effectful)[0]);
    assert.deepStrictEqual(Object.getOwnPropertyNames(synchronous), ["kind"]);
    const symbolValues = Object.getOwnPropertySymbols(synchronous).map(
      (symbol) => Object.getOwnPropertyDescriptor(synchronous, symbol)?.value,
    );
    assert.strictEqual(symbolValues.length, 1);
    assert.ok(Array.isArray(symbolValues[0]));
  });

  it("rejects duplicate service identity instead of selecting by order", () => {
    const expected = /^Implementation service is duplicated: ImplementationTest\/ProjectRepo$/u;
    assert.throws(() => Implementation.merge(synchronous, synchronous), expected);

    const sameIdentity = Context.Service<ProjectRepoService>("ImplementationTest/ProjectRepo");
    const duplicate = Implementation.succeed(sameIdentity, projectApi);
    assert.throws(() => Implementation.merge(synchronous, duplicate), expected);
  });
});
