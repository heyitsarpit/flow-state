import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import type { FlowAppDefinition } from "./public/types.js";
import { FlowDiagnostic } from "./diagnostics.js";
import { createKey, flow } from "./index.js";
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

  it("rejects invalid module section entries and missing declared fixtures", () => {
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
