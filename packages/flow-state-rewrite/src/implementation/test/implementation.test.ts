import { assert, describe, it } from "@effect/vitest";
import { Context, Effect } from "effect";

import { Implementation, implementationEntries } from "../implementation.js";
import type {
  ImplementationErrorOf,
  ImplementationRequirementsOf,
  ImplementationServices,
} from "../implementation.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;

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

type _SynchronousServices = Expect<Equal<ImplementationServices<typeof synchronous>, ProjectRepo>>;
type _SynchronousError = Expect<Equal<ImplementationErrorOf<typeof synchronous>, never>>;
type _EffectServices = Expect<Equal<ImplementationServices<typeof effectful>, ProjectConfig>>;
type _EffectError = Expect<Equal<ImplementationErrorOf<typeof effectful>, "configuration-failed">>;
type _EffectRequirements = Expect<
  Equal<ImplementationRequirementsOf<typeof effectful>, ProjectRepo>
>;
type _MergedServices = Expect<
  Equal<ImplementationServices<typeof complete>, ProjectRepo | ProjectConfig>
>;
type _MergedError = Expect<Equal<ImplementationErrorOf<typeof complete>, "configuration-failed">>;
type _MergedRequirements = Expect<
  Equal<ImplementationRequirementsOf<typeof complete>, ProjectRepo>
>;

type TypeProofs = readonly [
  _SynchronousServices,
  _SynchronousError,
  _EffectServices,
  _EffectError,
  _EffectRequirements,
  _MergedServices,
  _MergedError,
  _MergedRequirements,
];

const proofCount: TypeProofs["length"] = 8;
void proofCount;

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

  it("freezes provider entries and graph membership", () => {
    const entries = implementationEntries(synchronous);
    const first = entries[0];
    assert.ok(first);
    assert.strictEqual(Object.isFrozen(synchronous), true);
    assert.strictEqual(Object.isFrozen(entries), true);
    assert.strictEqual(Object.isFrozen(first), true);
    assert.strictEqual(Object.isFrozen(projectApi), false);
    const graph = entries;
    assert.strictEqual(Reflect.set(graph, "0", first), false);
  });

  it("rejects duplicate service identity instead of selecting by order", () => {
    assert.throws(() => Implementation.merge(synchronous, synchronous));

    const sameIdentity = Context.Service<ProjectRepoService>("ImplementationTest/ProjectRepo");
    const duplicate = Implementation.succeed(sameIdentity, projectApi);
    assert.throws(() => Implementation.merge(synchronous, duplicate));
  });
});
