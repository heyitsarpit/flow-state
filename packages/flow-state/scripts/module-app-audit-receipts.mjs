import { Effect } from "effect";

import { createKey, flow } from "../dist/index.mjs";
import { flowTest } from "../dist/testing.mjs";

const projectResource = flow.resource({
  id: "audit.project",
  key: (projectId) => createKey("audit-project", projectId),
  lookup: (projectId) =>
    Effect.succeed({
      id: projectId,
      name: `Lookup ${String(projectId)}`,
    }),
});

const actorMachine = flow.machine({
  id: "audit.editor-machine",
  initial: "idle",
  context: () => ({
    projectId: "p-1",
    count: 0,
  }),
  states: {
    idle: {
      on: {
        ADVANCE: {
          target: "ready",
          update: ({ context }) => ({
            count: context.count + 1,
          }),
        },
      },
    },
    ready: {},
  },
});

const projectSummaryView = flow.view({
  id: "audit.project-summary",
  sources: ["context", "resources"],
  select: ({ context, resources }) => ({
    projectId: context.projectId,
    resourceStatus: resources["audit.project"]?.status ?? "idle",
  }),
});

const projectSeed = [
  {
    ref: projectResource.ref("p-1"),
    value: { id: "p-1", name: "Seeded project" },
  },
];

let factoryRuns = 0;

const ProjectModule = flow.module(
  "Project",
  () => {
    factoryRuns += 1;
    return {
      resources: { byId: projectResource },
      machines: { editor: actorMachine },
      views: { summary: projectSummaryView },
      fixtures: { projectSeed },
    };
  },
  {
    dependencies: ["Session"],
    screens: ["Editor"],
    tags: ["project"],
    fixtures: ["projectSeed"],
    permissions: ["project:write"],
  },
);

const SessionModule = flow.module("Session", {
  machines: {
    editor: flow.machine({
      id: "audit.session-editor-machine",
      initial: "idle",
      context: () => ({
        ready: true,
      }),
      states: {
        idle: {},
      },
    }),
  },
});

const App = flow.app({ modules: [ProjectModule, SessionModule] });

const duplicateResource = flow.resource({
  id: "audit.duplicate-resource",
  key: (projectId) => createKey("audit-duplicate-resource", projectId),
  lookup: (projectId) => Effect.succeed({ id: projectId, name: `Duplicate ${String(projectId)}` }),
});

const duplicateMachineA = flow.machine({
  id: "audit.duplicate-machine",
  initial: "idle",
  context: () => ({ count: 0 }),
  states: { idle: {} },
});

const duplicateMachineB = flow.machine({
  id: "audit.duplicate-machine",
  initial: "idle",
  context: () => ({ count: 0 }),
  states: { idle: {} },
});

let duplicateResourceError;
try {
  flow.app(
    flow.module("ResourceAlpha", {
      resources: { one: duplicateResource },
    }),
    flow.module("ResourceBeta", {
      resources: {
        two: flow.resource({
          id: "audit.duplicate-resource",
          key: (projectId) => createKey("audit-duplicate-resource-2", projectId),
          lookup: (projectId) =>
            Effect.succeed({ id: projectId, name: `Second ${String(projectId)}` }),
        }),
      },
    }),
  );
} catch (error) {
  duplicateResourceError = error instanceof Error ? error.message : String(error);
}

let duplicateMachineApp;
try {
  duplicateMachineApp = flow.app(
    flow.module("MachineAlpha", {
      machines: { editor: duplicateMachineA },
    }),
    flow.module("MachineBeta", {
      machines: { editor: duplicateMachineB },
    }),
  );
} catch (error) {
  duplicateMachineApp = error instanceof Error ? error.message : String(error);
}

const harness = flowTest
  .app(App)
  .seedModuleFixtures("projectSeed")
  .start(actorMachine, {
    input: {
      projectId: "override-p-1",
    },
  });

const runtimeWithoutApp = flow.runtime(
  flow.app({ modules: [] }).layer({
    store: flow.store.test(),
    orchestrators: flow.orchestrators.test(),
  }),
);
const bareActor = runtimeWithoutApp.createActor(actorMachine);

const runtimeWithApp = flow.runtime(
  App.layer({
    store: flow.store.test(),
    orchestrators: flow.orchestrators.test(),
  }),
);
const appActor = runtimeWithApp.createActor(actorMachine);
appActor.send({ type: "ADVANCE" });
await appActor.flush();

const output = {
  factoryRuns,
  moduleInventory: ProjectModule.inventory(),
  appInventory: App.inventory(),
  moduleMapKeys: Object.keys(App.moduleMap),
  moduleMapProjectId: App.moduleMap.Project.id,
  seededFixtureSnapshot: harness.cache().query("audit.project"),
  duplicateResourceError,
  duplicateMachineAppId:
    typeof duplicateMachineApp === "string" ? duplicateMachineApp : duplicateMachineApp?.id,
  bareActorId: bareActor.id,
  appActorId: appActor.id,
  inspectionEvents: runtimeWithApp.inspection.entries().map((event) => ({
    type: event.type,
    id: event.id,
    eventType: "eventType" in event ? event.eventType : undefined,
    targetActorId: "targetActorId" in event ? event.targetActorId : undefined,
    correlationId: "correlationId" in event ? event.correlationId : undefined,
    state:
      event.type === "actor:snapshot" && event.snapshot !== undefined
        ? event.snapshot.value
        : undefined,
  })),
  actorReceipts: appActor.receipts().map((receipt) => ({
    type: receipt.type,
    id: receipt.id,
    eventType: "eventType" in receipt ? receipt.eventType : undefined,
    targetActorId: "targetActorId" in receipt ? receipt.targetActorId : undefined,
    correlationId: "correlationId" in receipt ? receipt.correlationId : undefined,
  })),
};

console.log(JSON.stringify(output, null, 2));

await bareActor.dispose();
await appActor.dispose();
await runtimeWithoutApp.dispose();
await runtimeWithApp.dispose();
