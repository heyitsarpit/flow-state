import { Context, Effect, Result } from "effect";

import {
  Implementation,
  app,
  definition,
  machine,
  module,
  resource,
  runtimeSetup,
} from "flow-state-rewrite";

interface RepositoryService {
  readonly load: (id: string) => string;
}

interface AcquisitionState {
  acquireCalls: number;
}

class Repository extends Context.Service<Repository, RepositoryService>()(
  "Packed/QuickstartRepository",
) {}

const project = resource({
  id: "packed-quickstart-project",
  key: (projectId: string) => [projectId] as const,
  lookup: (projectId: string) =>
    Effect.service(Repository).pipe(Effect.map((repository) => repository.load(projectId))),
});

const definitionResult = definition({
  id: "packed-quickstart",
  states: ["idle"],
  events: {},
  operations: { project },
});

if (Result.isFailure(definitionResult)) throw definitionResult.failure;

const machineResult = machine(definitionResult, ({ S }) => ({
  default: S.idle,
  states: { idle: {} },
}));

if (Result.isFailure(machineResult)) throw machineResult.failure;

const editorModule = module({
  id: "packed-quickstart-module",
  machines: { editor: machineResult.success },
});
const editorApp = app({
  id: "packed-quickstart-app",
  persistenceVersion: "1",
  modules: [editorModule] as const,
});

const state: AcquisitionState = { acquireCalls: 0 };
const implementation = Implementation.effect(
  Repository,
  Effect.sync(() => {
    state.acquireCalls += 1;
    return Repository.of({ load: (id) => id });
  }),
);
const setup = runtimeSetup({ app: editorApp, implementation });
const runtime = setup.construct();

export const quickstart: Effect.Effect<void> = Effect.gen(function* () {
  if (state.acquireCalls !== 0)
    yield* Effect.die(new Error(`acquired before ready(): ${state.acquireCalls}`));
  yield* runtime.ready();
  const firstReadyCalls = yield* Effect.sync(() => state.acquireCalls);
  if (firstReadyCalls !== 1)
    yield* Effect.die(new Error(`unexpected acquisition count: ${firstReadyCalls}`));
  yield* runtime.ready();
  const secondReadyCalls = yield* Effect.sync(() => state.acquireCalls);
  if (secondReadyCalls !== 1)
    yield* Effect.die(new Error(`readiness was not cached: ${secondReadyCalls}`));
});
