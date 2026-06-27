import { Context } from "effect";

import { createControlledStream, createTestLayer } from "@flow-state/core";
import type { ControlledStreamHandle, FlowTestLayer } from "@flow-state/core";

import type {
  AgentChildFailure,
  AgentChildProgress,
  AgentProgress,
  AgentProgressFailure,
  ChildTaskKind,
} from "./agentWorkspaceFlow";

export type AgentTraceEventKind =
  | "run:start"
  | "agent:progress"
  | "child:spawn"
  | "child:progress"
  | "child:complete"
  | "child:failure"
  | "approval:proposed"
  | "approval:approved"
  | "approval:rejected"
  | "run:complete"
  | "run:failure";

export interface AgentTraceEvent {
  readonly id: string;
  readonly kind: AgentTraceEventKind;
  readonly actorId: string;
  readonly parentId?: string;
  readonly at: number;
  readonly summary: string;
  readonly redacted?: boolean;
  readonly meta?: Readonly<Record<string, unknown>>;
}

export interface AgentWorkspaceServiceImplementation {
  readonly progress: () => AsyncIterable<AgentProgress>;
  readonly spawnChild: (
    kind: ChildTaskKind,
  ) => AsyncIterable<AgentChildProgress | AgentChildFailure>;
}

export class AgentWorkspaceService extends Context.Service<
  AgentWorkspaceService,
  AgentWorkspaceServiceImplementation
>()("example/AgentWorkspaceService") {}

export interface AgentWorkspaceTestLayerOptions {
  readonly progress?: ControlledStreamHandle<AgentProgress, AgentProgressFailure>;
  readonly progressStream?: () => AsyncIterable<AgentProgress>;
  readonly spawnChild?: (
    kind: ChildTaskKind,
  ) => AsyncIterable<AgentChildProgress | AgentChildFailure>;
}

export function createAgentWorkspaceTestLayer(options: AgentWorkspaceTestLayerOptions = {}): {
  readonly layer: FlowTestLayer<AgentWorkspaceService, AgentWorkspaceServiceImplementation>;
  readonly progress: ControlledStreamHandle<AgentProgress, AgentProgressFailure>;
} {
  const progress =
    options.progress ??
    createControlledStream<AgentProgress, AgentProgressFailure>("agent.run.progress");

  return {
    progress,
    layer: createTestLayer(
      AgentWorkspaceService,
      AgentWorkspaceService.of({
        progress: options.progressStream ?? (() => progress.stream()),
        spawnChild: options.spawnChild ?? (() => emptyAsyncIterable()),
      }),
    ),
  };
}

function emptyAsyncIterable<TValue>(): AsyncIterable<TValue> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<TValue> {
      return {
        next: async (): Promise<IteratorResult<TValue>> => ({ done: true, value: undefined }),
      };
    },
  };
}
