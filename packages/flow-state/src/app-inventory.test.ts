import { Effect, Stream } from "effect";
import { describe, expect, it } from "vite-plus/test";

import type { FlowAppDefinition, FlowViewSource } from "./core/api/types.js";
import { FlowDiagnostic } from "./shared/diagnostics.js";
import { createKey, createTag } from "./index.js";
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

  it("rejects incompatible same-id static tag schemas without running tag callbacks", () => {
    const tagCalls: string[] = [];
    const firstSchema = { kind: "tag-schema", version: 1 } as const;
    const secondSchema = { kind: "tag-schema", version: 2 } as const;
    const firstTag = createTag("inventory.project.tag", { schema: firstSchema });
    const secondTag = createTag("inventory.project.tag", { schema: secondSchema });
    const callbackTag = createTag("inventory.callback.tag");
    const TaggedAlpha = flow.resource<[projectId: string], ProjectRecord>({
      id: "inventory.tagged.alpha",
      key: (projectId) => createKey("inventory-tagged-alpha", projectId),
      lookup: (projectId) => Effect.succeed({ id: projectId, name: "Alpha" }),
      tags: [firstTag],
    });
    const TaggedBeta = flow.resource<[projectId: string], ProjectRecord>({
      id: "inventory.tagged.beta",
      key: (projectId) => createKey("inventory-tagged-beta", projectId),
      lookup: (projectId) => Effect.succeed({ id: projectId, name: "Beta" }),
      tags: [secondTag],
    });
    const CallbackTagged = flow.resource<[projectId: string], ProjectRecord>({
      id: "inventory.tagged.callback",
      key: (projectId) => createKey("inventory-tagged-callback", projectId),
      lookup: (projectId) => Effect.succeed({ id: projectId, name: "Callback" }),
      tags: () => {
        tagCalls.push("tags");
        return [callbackTag];
      },
    });

    const diagnostic = expectFlowDiagnostic(() =>
      flow.app({
        modules: [
          flow.module("AlphaTags", {
            resources: {
              project: TaggedAlpha,
              callbackProject: CallbackTagged,
            },
          }),
          flow.module("BetaTags", {
            resources: {
              project: TaggedBeta,
            },
          }),
        ],
      }),
    );

    expect(diagnostic).toMatchObject({
      code: "FLOW-APP-012",
      title: "Incompatible flow tag definition: inventory.project.tag",
      debug: {
        tagId: "inventory.project.tag",
        firstModuleId: "AlphaTags",
        nextModuleId: "BetaTags",
      },
    });
    expect(tagCalls).toEqual([]);
  });

  it("accepts same-id static tag schemas when they reuse the same schema value", () => {
    const schema = { kind: "tag-schema", version: 1 } as const;
    const firstTag = createTag("inventory.compatible.tag", { schema });
    const secondTag = createTag("inventory.compatible.tag", { schema });
    const TaggedAlpha = flow.resource<[projectId: string], ProjectRecord>({
      id: "inventory.compatible.alpha",
      key: (projectId) => createKey("inventory-compatible-alpha", projectId),
      lookup: (projectId) => Effect.succeed({ id: projectId, name: "Alpha" }),
      tags: [firstTag],
    });
    const TaggedBeta = flow.resource<[projectId: string], ProjectRecord>({
      id: "inventory.compatible.beta",
      key: (projectId) => createKey("inventory-compatible-beta", projectId),
      lookup: (projectId) => Effect.succeed({ id: projectId, name: "Beta" }),
      tags: [secondTag],
    });

    expect(() =>
      flow.app({
        modules: [
          flow.module("CompatibleAlphaTags", {
            resources: {
              project: TaggedAlpha,
            },
          }),
          flow.module("CompatibleBetaTags", {
            resources: {
              project: TaggedBeta,
            },
          }),
        ],
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
    expect(alphaFirst.label).toBe("Alpha+Beta");
    expect(betaFirst.label).toBe("Beta+Alpha");
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

  it("copies and freezes descriptor config containers after construction", () => {
    const mutableTags = [createTag("copied.config.tag" as string)];
    const mutableFreshness = {
      staleAfter: "1 minute",
      onInvalidate: "active" as const,
    };
    const resource = flow.resource<[projectId: string], ProjectRecord>({
      id: "copied.config.resource",
      key: (projectId) => createKey("copied-config", projectId),
      lookup: (projectId) => Effect.succeed({ id: projectId, name: "Copied config" }),
      tags: mutableTags,
      freshness: mutableFreshness,
    });

    const idleNode = {
      on: {
        START: {
          target: "started" as const,
        },
      },
    };
    const states = {
      idle: idleNode,
      started: {},
    };
    const machine = flow.machine<InventoryContext, { readonly type: "START" }, "idle" | "started">({
      id: "copied.config.machine",
      initial: "idle",
      context: () => ({
        projectName: "Atlas",
        launchReady: false,
      }),
      states,
    });

    const invalidates = [resource.ref("project-1")];
    const transaction = flow.transaction({
      id: "copied.config.transaction",
      commit: () => Effect.succeed("ok"),
      invalidates,
    });
    const viewSources: Array<FlowViewSource> = ["context"];
    const view = flow.view<InventoryContext, "idle", string>({
      id: "copied.config.view",
      sources: viewSources,
      select: ({ context }) => context.projectName,
    });
    const streamPressure = {
      strategy: "queue" as const,
      limit: 1,
    };
    const streamRoutes = {
      value: (value: string) => ({ type: "VALUE" as const, value }),
    };
    const stream = flow.stream<
      InventoryContext,
      { readonly type: "VALUE"; readonly value: string },
      void,
      string
    >({
      id: "copied.config.stream",
      subscribe: () => Stream.succeed("ready"),
      pressure: streamPressure,
      routes: streamRoutes,
    });
    const afterConfig = {
      id: "copied.config.after",
      delay: "1 second" as const,
      target: "started" as const,
    };
    const after = flow.after<
      typeof afterConfig.target,
      InventoryContext,
      { readonly type: "START" }
    >(afterConfig);
    const childConfig = {
      id: "copied.config.child",
      machine,
      supervision: "stop-on-failure" as const,
    };
    const child = flow.child(childConfig);

    mutableTags.push(createTag("late.config.tag"));
    mutableFreshness.staleAfter = "1 hour";
    states.started = { type: "final" };
    (idleNode.on.START as { target: string }).target = "missing";
    invalidates.length = 0;
    viewSources.push("resources");
    streamPressure.limit = 2;
    (streamRoutes as { value: (value: string) => { type: string; value: string } }).value = (
      value,
    ) => ({ type: "LATE", value });
    (afterConfig as { delay: string }).delay = "2 seconds";
    (childConfig as { supervision: "stop-on-failure" | "continue-on-failure" }).supervision =
      "continue-on-failure";

    expect(resource.config.tags).toHaveLength(1);
    expect(resource.config.freshness?.staleAfter).toBe("1 minute");
    expect(machine.config.states.started).toEqual({});
    expect(machine.config.states.idle.on?.START).toMatchObject({ target: "started" });
    expect(transaction.config.invalidates).toHaveLength(1);
    expect(view.config.sources).toEqual(["context"]);
    expect(stream.config.pressure).toMatchObject({ strategy: "queue", limit: 1 });
    expect(stream.config.routes?.value?.("event")).toEqual({ type: "VALUE", value: "event" });
    expect(after.config.delay).toBe("1 second");
    expect(child.config.supervision).toBe("stop-on-failure");
    expect(Object.isFrozen(resource.config)).toBe(true);
    expect(Object.isFrozen(resource.config.tags)).toBe(true);
    expect(Object.isFrozen(resource.config.freshness)).toBe(true);
    expect(Object.isFrozen(machine.config.states)).toBe(true);
    expect(Object.isFrozen(machine.config.states.idle)).toBe(true);
    expect(Object.isFrozen(machine.config.states.idle.on)).toBe(true);
    expect(Object.isFrozen(transaction.config.invalidates)).toBe(true);
    expect(Object.isFrozen(view.config.sources)).toBe(true);
    expect(Object.isFrozen(stream.config.pressure)).toBe(true);
    expect(Object.isFrozen(stream.config.routes)).toBe(true);
    expect(Object.isFrozen(after.config)).toBe(true);
    expect(Object.isFrozen(child.config)).toBe(true);
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
