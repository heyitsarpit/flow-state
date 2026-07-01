import { Context, Effect, Layer } from "effect";

import { flow } from "../../core/api/flow-core.js";
import { createKey } from "../../core/api/keys.js";

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
  project: projectResource,
});
