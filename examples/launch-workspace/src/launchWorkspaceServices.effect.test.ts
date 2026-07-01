import { expect, layer } from "@effect/vitest";
import { Cause, Effect, Exit, Option } from "effect";

import { fixtureProject, projectDraftFrom } from "./domain";
import { LaunchWorkspaceTestServices, loadProject, saveProject } from "./services";

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
