import { expect, layer } from "@effect/vitest";
import { Cause, Effect, Exit, Layer, Option } from "effect";
import { TestClock } from "effect/testing";

import { fixtureProject, projectDraftFrom } from "./domain";
import { LaunchWorkspaceTestServices, ProjectApi, loadProject, saveProject } from "./services";

layer(LaunchWorkspaceTestServices)("Launch Workspace @effect/vitest service tests", (it) => {
  it.effect("loads a project directly through the shared Effect service Layer", () =>
    Effect.gen(function* () {
      const project = yield* loadProject(fixtureProject.id);

      expect(project).toMatchObject({
        id: fixtureProject.id,
        name: fixtureProject.name,
      });
      expect(project.updatedAt).toEqual(expect.any(Number));
    }),
  );

  it.layer(
    Layer.succeed(
      ProjectApi,
      ProjectApi.of({
        getProject: (id) =>
          Effect.succeed({
            ...fixtureProject,
            id,
            name: "Layer override project",
            updatedAt: 42,
          }),
        listComments: () => Effect.succeed([]),
        saveProject: (params) =>
          Effect.succeed({
            ...fixtureProject,
            ...params.draft,
            id: params.id,
            version: params.baseVersion + 1,
            updatedAt: 42,
          }),
      }),
    ),
  )("single-service overrides", (it) => {
    it.effect("replaces only ProjectApi while reusing the shared suite Layer", () =>
      Effect.gen(function* () {
        const project = yield* loadProject(fixtureProject.id);

        expect(project.name).toBe("Layer override project");
        expect(project.updatedAt).toBe(42);
      }),
    );
  });

  it.effect("drives Clock-based service timestamps with TestClock", () =>
    Effect.gen(function* () {
      const initial = yield* loadProject(fixtureProject.id);
      expect(initial.updatedAt).toBe(0);

      yield* TestClock.setTime(1_700_000_000_000);
      const fixed = yield* loadProject(fixtureProject.id);
      expect(fixed.updatedAt).toBe(1_700_000_000_000);

      yield* TestClock.adjust("1 second");
      const advanced = yield* loadProject(fixtureProject.id);
      expect(advanced.updatedAt).toBe(1_700_000_001_000);
    }),
  );

  it.effect("keeps validation failures in the Effect error channel without a Flow harness", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        saveProject({
          id: fixtureProject.id,
          draft: {
            ...projectDraftFrom(fixtureProject),
            name: "   ",
          },
          baseVersion: fixtureProject.version,
        }),
      );

      expect(Exit.isFailure(exit)).toBe(true);

      if (Exit.isFailure(exit)) {
        const failure = Cause.findErrorOption(exit.cause);
        expect(Option.isSome(failure) ? failure.value._tag : "none").toBe("ProjectValidation");
      }
    }),
  );
});
