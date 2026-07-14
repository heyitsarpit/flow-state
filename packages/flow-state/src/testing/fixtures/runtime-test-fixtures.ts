import { Context, Effect, Layer } from "effect";

import * as flow from "../../core/api/flow-core.js";
import { createKey } from "../../core/api/keys.js";
import type { FlowRuntime } from "../../core/api/types.js";
import type { HostSignals } from "../../core/runtime/services/host-signals.js";
import type { InspectionLog } from "../../core/runtime/services/inspection.js";
import type { NotificationScheduler } from "../../core/runtime/services/notification-scheduler.js";
import type { OrchestratorSystem } from "../../core/orchestrator/orchestrator-system.js";
import type { ResourceStore } from "../../core/runtime/services/resource-store.js";
import type { TraceLog } from "../../core/runtime/services/trace.js";
import { createAppDefinition } from "../../descriptors/app.js";
import { createRuntime } from "../../runtime/contract-runtime.js";

const emptyTestApp = createAppDefinition({
  modules: [] as const,
});

type InstallableTestServices = ReadonlyArray<Layer.Layer<any, any, never>>;
type TestRuntimeInstallers<Services extends InstallableTestServices = readonly []> = Readonly<{
  readonly services?: Services;
}>;

type DefaultTestRuntimeServices =
  | NotificationScheduler
  | ResourceStore
  | OrchestratorSystem
  | HostSignals
  | InspectionLog
  | TraceLog;

export function createTestRuntimeWithInstallers(): FlowRuntime<DefaultTestRuntimeServices, never>;
export function createTestRuntimeWithInstallers<Services extends InstallableTestServices>(
  installers: Readonly<{ readonly services: Services }>,
): FlowRuntime<
  DefaultTestRuntimeServices | Layer.Success<Services[number]>,
  Layer.Error<Services[number]>
>;
export function createTestRuntimeWithInstallers<Services extends InstallableTestServices>(
  installers: TestRuntimeInstallers<Services> = {},
) {
  if (installers.services === undefined) {
    return createRuntime();
  }

  const runtimeLayer: Layer.Layer<
    DefaultTestRuntimeServices | Layer.Success<Services[number]>,
    Layer.Error<Services[number]>,
    never
  > = emptyTestApp.layer({
    store: {
      kind: "store",
      mode: "test",
    },
    orchestrators: {
      kind: "orchestrators",
      mode: "test",
    },
    services: installers.services,
  });

  return createRuntime<
    Layer.Layer<
      DefaultTestRuntimeServices | Layer.Success<Services[number]>,
      Layer.Error<Services[number]>,
      never
    >
  >(runtimeLayer);
}

export interface ProjectRecord {
  readonly id: string;
  readonly name: string;
}

export class Greeter extends Context.Service<
  Greeter,
  {
    readonly greet: (name: string) => Effect.Effect<string>;
  }
>()("test/Greeter") {
  static readonly layer = Layer.succeed(
    Greeter,
    Greeter.of({
      greet: (name) => Effect.succeed(`hello ${name}`),
    }),
  );
}

export const projectResource = flow.resource<
  [projectId: string],
  ProjectRecord,
  never,
  Effect.Effect<ProjectRecord>
>({
  id: "runtime.project",
  key: (projectId) => createKey("runtime-project", projectId),
  lookup: (projectId) => Effect.succeed({ id: projectId, name: "Loaded" }),
});

export const RuntimeModule = flow.module("Runtime", {
  resources: { project: projectResource },
});
