import { Effect } from "effect";

import { createKey } from "flow-state";
import * as flow from "flow-state";

import type { ProjectCursor, ProjectPage, ProjectPageUnavailable } from "../../domain/projects";
import { ProjectFeedService } from "../../services/project-feed-service";

export const projectPageResource = flow.resource<
  [ProjectCursor],
  ProjectPage,
  ProjectPageUnavailable,
  Effect.Effect<ProjectPage, ProjectPageUnavailable, ProjectFeedService>,
  "feed.page"
>({
  id: "feed.page",
  key: (cursor: ProjectCursor) => createKey("feed", "page", cursor),
  lookup: (cursor: ProjectCursor) =>
    Effect.flatMap(ProjectFeedService, (service) => service.page(cursor)),
  freshness: { staleAfter: "30 seconds", onInvalidate: "active" },
});
