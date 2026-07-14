import { Effect, Layer, Option } from "effect";

import type { ProjectCursor, ProjectPage } from "../domain/projects";
import { ProjectFeedService } from "./project-feed-service";

const previousCursor = new Map<ProjectCursor, ProjectCursor>([
  [-16, -20],
  [-12, -16],
  [-8, -12],
  [-4, -8],
  [0, -4],
  [4, 0],
  [8, 4],
  [12, 8],
  [16, 12],
  [20, 16],
]);

const nextCursor = new Map<ProjectCursor, ProjectCursor>([
  [-20, -16],
  [-16, -12],
  [-12, -8],
  [-8, -4],
  [-4, 0],
  [0, 4],
  [4, 8],
  [8, 12],
  [12, 16],
  [16, 20],
]);

export const projectPageFixture = (cursor: ProjectCursor, revision = 1): ProjectPage => {
  const firstId = cursor === 4 ? 3 : cursor;
  return {
    cursor,
    projects: Array.from({ length: 4 }, (_, index) => ({
      id: firstId + index,
      name: `Project ${firstId + index}`,
      revision,
    })),
    previousCursor: Option.fromUndefinedOr(previousCursor.get(cursor)),
    nextCursor: Option.fromUndefinedOr(nextCursor.get(cursor)),
  };
};

export const ProjectFeedLive = Layer.succeed(
  ProjectFeedService,
  ProjectFeedService.of({
    page: Effect.fn("ProjectFeedService.page")((cursor: ProjectCursor) =>
      Effect.succeed(projectPageFixture(cursor)),
    ),
  }),
);
