import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { createKey, flow, flowTest } from "./index.js";

type ProjectRecord = Readonly<{
  readonly id: string;
  readonly name: string;
}>;

type InventoryContext = Readonly<{
  readonly projectName: string;
  readonly launchReady: boolean;
}>;

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
  () => ({
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
  }),
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

  it("loads named module fixtures and applies input overrides in flowTest.app", () => {
    const harness = flowTest
      .app(InventoryApp)
      .seedModuleFixtures("inventorySeed")
      .start(inventoryMachine, {
        input: {
          projectName: "Override",
        },
      });

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
    expect(() =>
      flow.module("BrokenSection", {
        resources: {
          project: inventoryView,
        },
      } as never),
    ).toThrow("Invalid flow module resource entry: BrokenSection.resources.project");

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

    expect(() =>
      flow.app({
        modules: [InventoryModule, DuplicateInventoryModule],
      }),
    ).toThrow("Duplicate flow resource id: inventory.project");
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

  it("rejects missing fixture refs when the app harness is asked to seed them", () => {
    expect(() =>
      flowTest.app(InventoryApp).seedModuleFixtures("missingSeed").start(inventoryMachine),
    ).toThrow("Unknown flow module fixture: missingSeed");
  });
});
