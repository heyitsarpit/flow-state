import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { app, definition, machine, module, resource, transaction, view } from "./index.js";

const expectCollision = (run: () => unknown, namespace: string): void => {
  try {
    run();
    throw new Error("expected collision");
  } catch (error) {
    expect(error).toMatchObject({
      _tag: "FlowUsageError",
      code: "AppPlanCollision",
      details: expect.objectContaining({ namespace }),
    });
  }
};

const rootMachine = (id: string) => {
  const D = definition({ id, states: ["READY"], events: {} });
  return machine(D, ({ S }) => ({ initial: S.READY, states: { READY: {} } }));
};

describe("private vNext AppPlan identities", () => {
  it("rejects ambiguous root ownership, machine collisions, view collisions, and module collisions", () => {
    const root = rootMachine("Identity/Root");
    const firstOwner = module({ id: "Owner/A", machines: [root], views: [] });
    const secondOwner = module({ id: "Owner/B", machines: [root], views: [] });
    expectCollision(
      () => app({ id: "owners", persistenceVersion: "1", modules: [firstOwner, secondOwner] }),
      "root-owner",
    );

    const firstMachine = rootMachine("Identity/Collision");
    const secondMachine = rootMachine("Identity/Collision");
    expectCollision(
      () =>
        app({
          id: "machines",
          persistenceVersion: "1",
          modules: [
            module({ id: "Machine/A", machines: [firstMachine], views: [] }),
            module({ id: "Machine/B", machines: [secondMachine], views: [] }),
          ],
        }),
      "machine",
    );

    const viewRootA = rootMachine("Identity/ViewA");
    const viewRootB = rootMachine("Identity/ViewB");
    const viewA = view(viewRootA, { id: "same-view", select: () => "a" });
    const viewB = view(viewRootB, { id: "same-view", select: () => "b" });
    expectCollision(
      () =>
        app({
          id: "views",
          persistenceVersion: "1",
          modules: [
            module({ id: "View/A", machines: [viewRootA], views: [viewA] }),
            module({ id: "View/B", machines: [viewRootB], views: [viewB] }),
          ],
        }),
      "view",
    );

    expectCollision(
      () =>
        app({
          id: "modules",
          persistenceVersion: "1",
          modules: [
            module({ id: "same-module", machines: [viewRootA], views: [] }),
            module({ id: "same-module", machines: [viewRootB], views: [] }),
          ],
        }),
      "module",
    );
  });

  it("deduplicates a repeated root inside its one owning module", () => {
    const root = rootMachine("Identity/RepeatedRoot");
    const owner = module({ id: "RepeatedRoot", machines: [root, root], views: [] });
    const compiled = app({ id: "repeated-root", persistenceVersion: "1", modules: [owner] });
    expect(compiled.plan.roots).toEqual([root]);
    expect(compiled.plan.machines).toEqual([root]);
    expect(compiled.plan.rootActorId(root)).toBe("root|13:repeated-root|21:Identity/RepeatedRoot");
  });

  it("rejects descriptor namespace collisions across distinct identities", () => {
    const descriptorA = resource({ id: "same-descriptor", lookup: () => Effect.succeed("a") });
    const descriptorB = resource({ id: "same-descriptor", lookup: () => Effect.succeed("b") });
    const DefinitionA = definition({ id: "Identity/DescriptorA", states: ["READY"], events: {} });
    const DefinitionB = definition({ id: "Identity/DescriptorB", states: ["READY"], events: {} });
    const machineA = machine(DefinitionA, ({ S, activity }) => ({
      initial: S.READY,
      states: { READY: { activities: [activity.ensure(descriptorA, { params: () => [] })] } },
    }));
    const machineB = machine(DefinitionB, ({ S, activity }) => ({
      initial: S.READY,
      states: { READY: { activities: [activity.ensure(descriptorB, { params: () => [] })] } },
    }));
    expectCollision(
      () =>
        app({
          id: "descriptors",
          persistenceVersion: "1",
          modules: [
            module({ id: "Descriptor/A", machines: [machineA], views: [] }),
            module({ id: "Descriptor/B", machines: [machineB], views: [] }),
          ],
        }),
      "descriptor",
    );
  });

  it("uses one flat descriptor resolver namespace across descriptor kinds", () => {
    const resourceValue = resource({ id: "cross-kind", lookup: () => Effect.succeed("resource") });
    const transactionValue = transaction({ id: "cross-kind", commit: () => Effect.void });
    const DefinitionA = definition({ id: "Identity/CrossKindA", states: ["READY"], events: {} });
    const DefinitionB = definition({ id: "Identity/CrossKindB", states: ["READY"], events: {} });
    const machineA = machine(DefinitionA, ({ S, activity }) => ({
      initial: S.READY,
      states: { READY: { activities: [activity.ensure(resourceValue, { params: () => [] })] } },
    }));
    const machineB = machine(DefinitionB, ({ S, activity }) => ({
      initial: S.READY,
      states: { READY: { activities: [activity.run(transactionValue, {})] } },
    }));
    expectCollision(
      () =>
        app({
          id: "cross-kind",
          persistenceVersion: "1",
          modules: [
            module({ id: "CrossKind/A", machines: [machineA], views: [] }),
            module({ id: "CrossKind/B", machines: [machineB], views: [] }),
          ],
        }),
      "descriptor",
    );
  });

  it("deduplicates one shared descriptor object in either graph presentation order", () => {
    const shared = resource({ id: "shared-descriptor", lookup: () => Effect.succeed("shared") });
    const DefinitionA = definition({ id: "Identity/SharedA", states: ["READY"], events: {} });
    const DefinitionB = definition({ id: "Identity/SharedB", states: ["READY"], events: {} });
    const machineA = machine(DefinitionA, ({ S, activity }) => ({
      initial: S.READY,
      states: { READY: { activities: [activity.ensure(shared, { params: () => [] })] } },
    }));
    const machineB = machine(DefinitionB, ({ S, activity }) => ({
      initial: S.READY,
      states: { READY: { activities: [activity.ensure(shared, { params: () => [] })] } },
    }));
    const ownerA = module({ id: "Shared/A", machines: [machineA], views: [] });
    const ownerB = module({ id: "Shared/B", machines: [machineB], views: [] });
    const forward = app({
      id: "shared-forward",
      persistenceVersion: "1",
      modules: [ownerA, ownerB],
    });
    const reverse = app({
      id: "shared-reverse",
      persistenceVersion: "1",
      modules: [ownerB, ownerA],
    });
    expect(forward.plan.descriptors).toEqual([shared]);
    expect(reverse.plan.descriptors).toEqual([shared]);
  });

  it("rejects distinct colliding dynamic admission seeds", () => {
    const first = rootMachine("Identity/DynamicCollision");
    const second = rootMachine("Identity/DynamicCollision");
    expectCollision(
      () =>
        app({
          id: "dynamic-collision",
          persistenceVersion: "1",
          modules: [],
          dynamicMachines: [first, second],
        }),
      "machine",
    );
  });

  it("keeps resolution local to each app and rejects foreign module views", () => {
    const firstRoot = rootMachine("Identity/First");
    const secondRoot = rootMachine("Identity/Second");
    const firstView = view(firstRoot, { id: "identity.first", select: () => 1 });
    const first = app({
      id: "first",
      persistenceVersion: "1",
      modules: [module({ id: "First", machines: [firstRoot], views: [firstView] })],
    });
    const second = app({
      id: "second",
      persistenceVersion: "1",
      modules: [module({ id: "Second", machines: [secondRoot], views: [] })],
    });

    expect(first.plan.resolveMachine(firstRoot.id)).toBe(firstRoot);
    expect(second.plan.resolveMachine(firstRoot.id)).toBeUndefined();
    expect(second.plan.resolveView(firstView.id)).toBeUndefined();
    expect(() =>
      Reflect.apply(module, undefined, [
        { id: "Foreign", machines: [secondRoot], views: [firstView] },
      ]),
    ).toThrow();
  });
});
