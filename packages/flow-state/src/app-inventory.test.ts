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
});
