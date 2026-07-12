import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import type { FlowAppDefinition } from "./core/api/types.js";
import { FlowDiagnostic } from "./shared/diagnostics.js";
import { createKey } from "./index.js";
import * as flow from "./index.js";
import { test } from "./testing.js";

type ProjectRecord = Readonly<{
  readonly id: string;
  readonly name: string;
}>;

type InventoryContext = Readonly<{
  readonly projectName: string;
  readonly launchReady: boolean;
}>;

function expectFlowDiagnostic(thunk: () => unknown): FlowDiagnostic {
  try {
    thunk();
  } catch (error) {
    expect(error instanceof FlowDiagnostic).toBe(true);
    return error as FlowDiagnostic;
  }

  throw new Error("expected thunk to throw a FlowDiagnostic");
}

const projectResource = flow.resource<[projectId: string], ProjectRecord>({
  id: "inventory.project",
  key: (projectId) => createKey("inventory", projectId),
  lookup: (projectId) => Effect.succeed({ id: projectId, name: `Project ${projectId}` }),
});

const inventoryMachine = flow.machine<InventoryContext, never, "idle">({
  id: "inventory.machine",
  initial: "idle",
  context: () => ({
    projectName: "Atlas",
    launchReady: false,
  }),
  states: {
    idle: {},
  },
});

const inventoryView = flow.view<
  InventoryContext,
  "idle",
  Readonly<{ readonly title: string; readonly status: string }>
>({
  id: "inventory.view",
  sources: ["context", "resources"],
  select: ({ context, resources }) => ({
    title: context.projectName,
    status: resources["inventory.project"]?.status ?? "idle",
  }),
});

const inventorySeed = [
  {
    ref: projectResource.ref("project-1"),
    value: { id: "project-1", name: "Seeded project" },
  },
] as const;

const InventoryModule = flow.module(
  "Inventory",
  {
    resources: {
      project: projectResource,
    },
    machines: {
      actor: inventoryMachine,
    },
    views: {
      workspace: inventoryView,
    },
    fixtures: {
      inventorySeed,
    },
  },
  {
    screens: ["Overview"],
    fixtures: ["inventorySeed"],
  },
);

const InventoryApp = flow.app({
  modules: [InventoryModule],
});

describe("app inventory and app harness fixtures", () => {
  it("summarizes module and app inventory", () => {
    expect(InventoryModule.inventory()).toMatchObject({
      name: "Inventory",
      resources: ["project"],
      machines: ["actor"],
      views: ["workspace"],
      fixtures: ["inventorySeed"],
      screens: ["Overview"],
    });

    expect(InventoryApp.inventory()).toMatchObject({
      modules: [
        expect.objectContaining({
          name: "Inventory",
          resources: ["project"],
        }),
      ],
      resources: [{ module: "Inventory", name: "project" }],
      actors: [{ module: "Inventory", name: "actor" }],
      views: [{ module: "Inventory", name: "workspace" }],
      viewsByScreen: [{ screen: "Overview", module: "Inventory", name: "workspace" }],
      fixtures: [{ module: "Inventory", name: "inventorySeed" }],
    });
  });

  it("does not advertise loose policy buckets as first-class inventory", () => {
    const PolicyCarrier = flow.module("PolicyCarrier", {
      policies: {
        canSaveProject: () => true,
      },
    });
    const app = flow.app({
      modules: [PolicyCarrier],
    });

    expect(PolicyCarrier.inventory()).not.toHaveProperty("policies");
    expect(app.inventory().modules[0]).not.toHaveProperty("policies");
  });

  it("loads named module fixtures and applies input overrides in test.app", () => {
    const harness = test
      .app(InventoryApp)
      .scenario(inventoryMachine)
      .with({
        fixtures: ["inventorySeed"],
        input: {
          projectName: "Override",
        },
      })
      .run();

    expect(harness.cache().query("inventory.project")).toMatchObject({
      id: "inventory.project",
      status: "success",
      value: { id: "project-1", name: "Seeded project" },
    });
    expect(harness.context()).toEqual({
      projectName: "Override",
      launchReady: false,
    });
  });

  it("runs the dominant app scenario builder with typed fixtures and one run() step", () => {
    const harness = test
      .app(InventoryApp)
      .scenario(inventoryMachine)
      .with({
        fixtures: ["inventorySeed"],
        input: {
          projectName: "Override",
        },
      })
      .run();

    expect(harness.cache().query("inventory.project")).toMatchObject({
      id: "inventory.project",
      status: "success",
      value: { id: "project-1", name: "Seeded project" },
    });
    expect(harness.context()).toEqual({
      projectName: "Override",
      launchReady: false,
    });
  });

  it("rejects invalid module section entries, metadata, and missing declared fixtures", () => {
    const invalidSection = expectFlowDiagnostic(() =>
      flow.module("BrokenSection", {
        resources: {
          project: inventoryView,
        },
      } as never),
    );
    expect(invalidSection).toMatchObject({
      code: "FLOW-APP-001",
      title: "Invalid flow module resource entry: BrokenSection.resources.project",
      debug: {
        entryName: "project",
        kind: "resource",
        moduleId: "BrokenSection",
        section: "resources",
      },
    });

    const invalidMeta = expectFlowDiagnostic(() =>
      flow.module(
        "BrokenMeta",
        {
          resources: {},
        },
        {
          screens: ["Overview", 1] as never,
        },
      ),
    );
    expect(invalidMeta).toMatchObject({
      code: "FLOW-APP-008",
      title: "Invalid flow module metadata: BrokenMeta.meta.screens",
      debug: {
        moduleId: "BrokenMeta",
        field: "screens",
      },
    });

    expect(() =>
      flow.module("BrokenStub", {
        resources: {
          project: {
            kind: "resource",
            id: "inventory.project",
          },
        },
      } as never),
    ).toThrow("Invalid flow module resource entry: BrokenStub.resources.project");

    expect(() =>
      flow.module(
        "BrokenFixture",
        {
          fixtures: {},
        },
        {
          fixtures: ["missingSeed"],
        },
      ),
    ).toThrow("Missing flow module fixture: BrokenFixture.fixtures.missingSeed");

    expect(() =>
      flow.module("HiddenFixture", {
        fixtures: {
          inventorySeed,
        },
      }),
    ).toThrow("Undeclared flow module fixture: HiddenFixture.fixtures.inventorySeed");

    expect(() =>
      flow.module(
        "BrokenFixtureEntry",
        {
          fixtures: {
            invalidSeed: [
              {
                ref: {
                  kind: "not-a-resource-ref",
                  id: "inventory.project",
                },
                value: { id: "project-1", name: "Broken" },
              },
            ],
          },
        } as never,
        {
          fixtures: ["invalidSeed"],
        },
      ),
    ).toThrow("Invalid flow module fixture: BrokenFixtureEntry.fixtures.invalidSeed");
  });

  it("rejects duplicate descriptor ids across app modules", () => {
    const duplicateProjectResource = flow.resource<[projectId: string], ProjectRecord>({
      id: "inventory.project",
      key: (projectId) => createKey("inventory-duplicate", projectId),
      lookup: (projectId) => Effect.succeed({ id: projectId, name: `Duplicate ${projectId}` }),
    });

    const DuplicateInventoryModule = flow.module("DuplicateInventory", {
      resources: {
        duplicateProject: duplicateProjectResource,
      },
    });

    const duplicateDescriptor = expectFlowDiagnostic(() =>
      flow.app({
        modules: [InventoryModule, DuplicateInventoryModule],
      }),
    );
    expect(duplicateDescriptor).toMatchObject({
      code: "FLOW-APP-006",
      title: "Duplicate flow resource id: inventory.project",
      debug: {
        descriptorId: "inventory.project",
        kind: "resource",
      },
    });
  });

  it("allows shared resource descriptors to be reused across app modules", () => {
    const AlphaModule = flow.module("Alpha", {
      resources: {
        project: projectResource,
      },
    });
    const BetaModule = flow.module("Beta", {
      resources: {
        project: projectResource,
      },
    });

    expect(() =>
      flow.app({
        modules: [AlphaModule, BetaModule],
      }),
    ).not.toThrow();
  });

  it("uses canonical sorted length-delimited app identity independent of module order", () => {
    const AlphaModule = flow.module("Alpha", {});
    const BetaModule = flow.module("Beta", {});

    const alphaFirst = flow.app({
      modules: [AlphaModule, BetaModule],
    });
    const betaFirst = flow.app({
      modules: [BetaModule, AlphaModule],
    });

    expect(alphaFirst.id).toBe("app:5:Alpha|4:Beta");
    expect(betaFirst.id).toBe(alphaFirst.id);
    expect(alphaFirst.moduleMap.Alpha).toBe(AlphaModule);
    expect(betaFirst.moduleMap.Beta).toBe(BetaModule);
  });

  it("rejects unsafe module ids and inventory collisions before app ownership exists", () => {
    expect(() => flow.module("__proto__", {})).toThrow("Invalid flow module id: __proto__");
    expect(() => flow.module("Bad\u0000Id", {})).toThrow("Invalid flow module id: Bad");
    expect(() =>
      flow.module("BadDescriptor", {
        resources: {
          bad: flow.resource({
            id: "Bad\u0000Resource",
            key: () => createKey("bad"),
            lookup: () => Effect.succeed({}),
          }),
        },
      }),
    ).toThrow("Invalid flow resource id: Bad");
    expect(() =>
      flow.module("Collision", {
        kind: "not-module",
      } as never),
    ).toThrow("Invalid flow module inventory field: Collision.kind");
    expect(() =>
      flow.module("Collision", {
        inventory: () => undefined,
      } as never),
    ).toThrow("Invalid flow module inventory field: Collision.inventory");
  });

  it("copies and freezes library-owned containers without deep-freezing domain values", () => {
    const mutableResourceRegistry: { project?: typeof projectResource } = {
      project: projectResource,
    };
    const domainValue = { nested: { mutable: true } };
    const mutableFixtures: Array<{
      readonly ref: ReturnType<typeof projectResource.ref>;
      readonly value: unknown;
    }> = [
      {
        ref: projectResource.ref("project-1"),
        value: domainValue,
      },
    ];
    const mutableMeta = {
      fixtures: ["seed"],
      screens: ["Overview"],
    };
    const module = flow.module(
      "Copied",
      {
        resources: mutableResourceRegistry,
        fixtures: {
          seed: mutableFixtures,
        },
      },
      mutableMeta,
    );
    const mutableModules = [module];
    delete mutableResourceRegistry.project;
    mutableFixtures.push({
      ref: projectResource.ref("project-2"),
      value: { id: "project-2", name: "Late mutation" },
    });
    mutableMeta.fixtures.push("late");

    const app = flow.app({
      modules: mutableModules,
    });
    mutableModules.length = 0;

    expect(module.resources.project).toBe(projectResource);
    expect(module.inventory().fixtures).toEqual(["seed"]);
    expect(module.inventory().screens).toEqual(["Overview"]);
    expect(app.modules).toEqual([module]);
    expect(Object.isFrozen(module.resources)).toBe(true);
    expect(Object.isFrozen(module.meta.fixtures)).toBe(true);
    expect(Object.isFrozen(app.modules)).toBe(true);

    domainValue.nested.mutable = false;
    const copiedFixture = module.fixtures.seed[0];
    expect(copiedFixture).toBeDefined();
    expect((copiedFixture!.value as typeof domainValue).nested.mutable).toBe(false);
  });

  it("allows modules to reference shared fixture names without owning a local fixture registry", () => {
    const FixtureConsumerModule = flow.module(
      "FixtureConsumer",
      {
        resources: {
          project: projectResource,
        },
      },
      {
        fixtures: ["inventorySeed.project"],
      },
    );

    const app = flow.app({
      modules: [InventoryModule, FixtureConsumerModule],
    });

    expect(app.inventory().fixtures).toEqual(
      expect.arrayContaining([
        { module: "Inventory", name: "inventorySeed" },
        { module: "FixtureConsumer", name: "inventorySeed.project" },
      ]),
    );
  });

  it("rejects missing fixture refs when the app harness is asked to seed them", () => {
    const untypedApp: FlowAppDefinition = InventoryApp;
    const missingFixture = expectFlowDiagnostic(() =>
      test
        .app(untypedApp)
        .scenario(inventoryMachine)
        .with({ fixtures: ["missingSeed"] })
        .run(),
    );
    expect(missingFixture).toMatchObject({
      code: "FLOW-APP-007",
      title: "Unknown flow module fixture: missingSeed",
      debug: {
        fixtureName: "missingSeed",
      },
    });
  });
});
