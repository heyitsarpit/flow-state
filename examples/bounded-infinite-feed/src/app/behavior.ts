import { flowStories } from "flow-state/inspect";

import { feedMachine } from "../features/feed/machine";
import { FeedApp } from "./app";

export const feedStories = flowStories(feedMachine, [
  { id: "initial-page", title: "Initial page", events: [], expectedState: "zero" },
  {
    id: "bounded-forward-window",
    title: "Three-page forward window",
    events: [{ type: "NEXT" }, { type: "NEXT" }, { type: "NEXT" }],
    expectedState: "plus-12",
  },
  {
    id: "backward-page",
    title: "Backward traversal",
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
