import { Context, Effect } from "effect";

import type { ProjectCursor, ProjectPage, ProjectPageUnavailable } from "../domain/projects";

export interface ProjectFeedServiceShape {
  readonly page: (cursor: ProjectCursor) => Effect.Effect<ProjectPage, ProjectPageUnavailable>;
}

export class ProjectFeedService extends Context.Service<
  ProjectFeedService,
  ProjectFeedServiceShape
>()("bounded-infinite-feed/ProjectFeedService") {}
