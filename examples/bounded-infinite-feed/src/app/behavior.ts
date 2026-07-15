import { flowStories } from "flow-state/inspect";

import type { ProjectCursor } from "../domain/projects";
import { feedMachine } from "../features/feed/machine";
import { projectPageResource } from "../features/feed/resources";
import { projectPageFixture } from "../services/layers";
import { FeedApp } from "./app";

const storyCursors: ReadonlyArray<ProjectCursor> = [-20, -16, -12, -8, -4, 0, 4, 8, 12, 16, 20];
const feedSeed = {
  resources: storyCursors.map((cursor) => ({
    ref: projectPageResource.ref(cursor),
    value: projectPageFixture(cursor),
  })),
} as const;

export const feedStories = flowStories(feedMachine, [
  {
    id: "initial-page",
    title: "Initial page",
    seed: feedSeed,
    events: [],
    expectedState: "zero",
  },
  {
    id: "bounded-forward-window",
    title: "Three-page forward window",
    seed: feedSeed,
    events: [{ type: "NEXT" }, { type: "NEXT" }, { type: "NEXT" }],
    expectedState: "plus-12",
  },
  {
    id: "backward-page",
    title: "Backward traversal",
    seed: feedSeed,
    events: [{ type: "PREVIOUS" }],
    expectedState: "minus-4",
  },
]);

type BehaviorGatewayContract = Readonly<{
  readonly app: typeof FeedApp;
  readonly stories: readonly [typeof feedStories];
}>;

export const BehaviorGateway: BehaviorGatewayContract = {
  app: FeedApp,
  stories: [feedStories],
} as const;
