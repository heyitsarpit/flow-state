import * as flow from "flow-state";
import type { FlowResourceSnapshot } from "flow-state";

import type { Project, ProjectCursor, ProjectPage } from "../../domain/projects";
import type { FeedContext, FeedState } from "./machine";

const windowFor = (frontier: ProjectCursor): readonly ProjectCursor[] =>
  Array.from(
    new Set([
      Math.max(-20, frontier - 4) as ProjectCursor,
      frontier,
      Math.min(20, frontier + 4) as ProjectCursor,
    ]),
  );

const isProjectPage = (value: unknown): value is ProjectPage =>
  typeof value === "object" &&
  value !== null &&
  "cursor" in value &&
  "projects" in value &&
  typeof value.cursor === "number" &&
  Array.isArray(value.projects);

const pageValues = (resources: Readonly<Record<string, FlowResourceSnapshot>>) =>
  Object.values(resources).flatMap((snapshot) =>
    snapshot.availability === "value" && isProjectPage(snapshot.value) ? [snapshot.value] : [],
  );

export interface FeedSelection {
  readonly cursors: readonly ProjectCursor[];
  readonly projects: readonly Project[];
  readonly refreshing: boolean;
  readonly canLoadPrevious: boolean;
  readonly canLoadNext: boolean;
}

export const feedView = flow.view<FeedContext, FeedState, FeedSelection>({
  id: "feed.window.view",
  sources: ["context", "resources"],
  select: ({ context, value, resources }) => {
    const cursors = windowFor(context.frontier);
    const pagesByCursor = new Map(pageValues(resources).map((page) => [page.cursor, page]));
    const deduplicated = new Map<number, Project>();
    for (const cursor of cursors) {
      for (const project of pagesByCursor.get(cursor)?.projects ?? []) {
        deduplicated.set(project.id, project);
      }
    }
    return {
      cursors,
      projects: Array.from(deduplicated.values()),
      refreshing: value === "refreshing",
      canLoadPrevious: context.frontier > -20,
      canLoadNext: context.frontier < 20,
    };
  },
});

