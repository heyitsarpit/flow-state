import * as flow from "flow-state";

import type { ProjectCursor, ProjectPage, ProjectPageUnavailable } from "../../domain/projects";
import { projectPageResource } from "./resources";

export interface FeedContext {
  readonly frontier: ProjectCursor;
}

export type FeedEvent =
  | { readonly type: "NEXT" }
  | { readonly type: "PREVIOUS" }
  | { readonly type: "REFRESH" }
  | { readonly type: "REFRESHED"; readonly page: ProjectPage }
  | { readonly type: "REFRESH_FAILED"; readonly error: ProjectPageUnavailable }
  | { readonly type: "REFRESH_DEFECT" }
  | { readonly type: "REFRESH_INTERRUPTED" }
  | { readonly type: "RETRY" };

const previousPage = ({ context }: flow.ResourceParams<FeedContext>) =>
  [Math.max(-20, context.frontier - 4) as ProjectCursor] as const;
const currentPage = ({ context }: flow.ResourceParams<FeedContext>) => [context.frontier] as const;
const nextPage = ({ context }: flow.ResourceParams<FeedContext>) =>
  [Math.min(20, context.frontier + 4) as ProjectCursor] as const;
const hasNext = ({ context }: { readonly context: FeedContext }) => context.frontier < 20;
const hasPrevious = ({ context }: { readonly context: FeedContext }) => context.frontier > -20;

export const feedMachine = flow.machine<FeedContext, FeedEvent>()({
  id: "feed.window",
  initial: "browsing",
  context: () => ({ frontier: 0 }),
  states: {
    browsing: {
      invoke: [
        flow.ensure(projectPageResource, { params: previousPage }),
        flow.ensure(projectPageResource, { params: currentPage }),
        flow.ensure(projectPageResource, { params: nextPage }),
      ],
      on: {
        NEXT: {
          target: "browsing",
          reenter: true,
          guard: hasNext,
          update: ({ context }) => ({ frontier: (context.frontier + 4) as ProjectCursor }),
        },
        PREVIOUS: {
          target: "browsing",
          reenter: true,
          guard: hasPrevious,
          update: ({ context }) => ({ frontier: (context.frontier - 4) as ProjectCursor }),
        },
        REFRESH: "refreshing",
        RETRY: { target: "browsing", reenter: true },
      },
    },
    refreshing: {
      invoke: [
        flow.refresh(projectPageResource, {
          params: currentPage,
          routes: flow.outcomes<ProjectPage, ProjectPageUnavailable, FeedEvent>({
            success: ({ value }) => ({ type: "REFRESHED", page: value }),
            failure: ({ error }) => ({ type: "REFRESH_FAILED", error }),
            defect: () => ({ type: "REFRESH_DEFECT" }),
            interrupt: () => ({ type: "REFRESH_INTERRUPTED" }),
          }),
        }),
      ],
      on: {
        REFRESHED: "browsing",
        REFRESH_FAILED: "browsing",
        REFRESH_DEFECT: "browsing",
        REFRESH_INTERRUPTED: "browsing",
      },
    },
  },
});

export type FeedState = flow.InferMachineState<typeof feedMachine>;

