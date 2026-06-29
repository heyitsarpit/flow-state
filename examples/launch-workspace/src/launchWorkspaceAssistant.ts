import { Option } from "effect";

import { flow } from "@flow-state/core/server";
import type { FlowEvent } from "@flow-state/core/server";

import type { AssistantProgress } from "./services";
import { assistantProgressStream } from "./launchWorkspaceStreams";

interface AssistantContext {
  readonly latest: Option.Option<AssistantProgress>;
}

interface AssistantTaskContext {
  readonly latest: Option.Option<AssistantProgress>;
}

type AssistantState = "idle" | "running" | "needsApproval";
type AssistantEvent =
  | ({ readonly type: "START_ASSISTANT" } & FlowEvent)
  | ({ readonly type: "ASSISTANT_PROGRESS"; readonly event: AssistantProgress } & FlowEvent)
  | ({ readonly type: "PROPOSE_ACTION" } & FlowEvent)
  | ({ readonly type: "APPROVE_ACTION" } & FlowEvent);

type AssistantTaskState = "running";
type AssistantTaskEvent = {
  readonly type: "ASSISTANT_PROGRESS";
  readonly event: AssistantProgress;
} & FlowEvent;

export const assistantTaskMachine = flow.machine<
  AssistantTaskContext,
  AssistantTaskEvent,
  AssistantTaskState
>({
  id: "Assistant.task",
  initial: "running",
  context: () => ({ latest: Option.none() }),
  states: {
    running: {
      invoke: assistantProgressStream,
      on: {
        ASSISTANT_PROGRESS: {
          update: ({ event }) => ({ latest: Option.some(event.event) }),
        },
      },
    },
  },
});

export const assistantChild = flow.child({
  id: "Assistant.task",
  machine: assistantTaskMachine,
  supervision: "stop-on-failure",
});

const assistantRun = flow.machine<AssistantContext, AssistantEvent, AssistantState>({
  id: "Assistant.run",
  initial: "idle",
  context: () => ({ latest: Option.none() }),
  states: {
    idle: {
      on: {
        START_ASSISTANT: "running",
      },
    },
    running: {
      invoke: [assistantProgressStream, assistantChild],
      on: {
        ASSISTANT_PROGRESS: {
          update: ({ event }) =>
            event.type === "ASSISTANT_PROGRESS" ? { latest: Option.some(event.event) } : {},
        },
        PROPOSE_ACTION: "needsApproval",
      },
    },
    needsApproval: {
      on: {
        APPROVE_ACTION: "running",
      },
    },
  },
});

export const Assistant = flow.module(
  "Assistant",
  () => ({
    run: assistantRun,
    task: assistantTaskMachine,
    stream: assistantProgressStream,
    child: assistantChild,
    machines: { run: assistantRun, task: assistantTaskMachine },
    streams: { progress: assistantProgressStream },
  }),
  {
    dependencies: ["Session", "Project"],
    tags: ["assistant"],
    screens: ["Assistant"],
    fixtures: ["assistantRun"],
    permissions: ["runAssistant"],
  },
);
