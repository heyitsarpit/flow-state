import * as flow from "flow-state";
import type { FlowResourceSnapshot } from "flow-state";

import type { Project, ProjectCursor, ProjectPage } from "../../domain/projects";
import type { FeedContext, FeedState } from "./machine";

const windows: Readonly<Record<FeedState, readonly ProjectCursor[]>> = {
  "minus-20": [-20, -16, -12],
  "minus-16": [-20, -16, -12],
  "minus-12": [-20, -16, -12],
  "minus-8": [-12, -8, -4],
  "minus-4": [-8, -4, 0],
  zero: [0],
  "plus-4": [0, 4],
  "plus-8": [0, 4, 8],
  "plus-12": [4, 8, 12],
  "plus-16": [8, 12, 16],
  "plus-20": [12, 16, 20],
  "refreshing-zero": [0],
};

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
    const cursors = windows[value];
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
      refreshing: value === "refreshing-zero",
      canLoadPrevious: context.frontier > -20,
      canLoadNext: context.frontier < 20,
    };
  },
});
