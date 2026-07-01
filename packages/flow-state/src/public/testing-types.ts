import type * as Duration from "effect/Duration";

import type { FlowActor, FlowRuntime } from "./app-types.js";
import type {
  FlowActorSnapshotTree,
  FlowChildSnapshot,
  FlowEvent,
  FlowIssue,
  FlowIssueSummary,
  FlowReceipt,
  FlowReceiptFacts,
  FlowResourceSnapshot,
  FlowTimerSnapshot,
  FlowTransactionSnapshot,
} from "../core/api/data-types.js";
import type { FlowSnapshot } from "../core/api/machine-types.js";

export type FlowTestChildTreeNode = Readonly<{
  readonly id: string;
  readonly actorId?: string;
  readonly status: FlowChildSnapshot["status"];
  readonly state?: string;
  readonly parentState?: string;
  readonly supervision?: FlowChildSnapshot["supervision"];
  readonly children: FlowTestChildTree;
}>;

export type FlowTestChildTree = Readonly<Record<string, FlowTestChildTreeNode>>;

export type FlowTestChildSummary = Readonly<{
  readonly idsByStatus: Readonly<Record<FlowChildSnapshot["status"], ReadonlyArray<string>>>;
  readonly outcomes: Readonly<{
    readonly start: ReadonlyArray<string>;
    readonly success: ReadonlyArray<string>;
    readonly failure: ReadonlyArray<string>;
    readonly interrupt: ReadonlyArray<string>;
    readonly stop: ReadonlyArray<string>;
  }>;
  readonly byId: Readonly<
    Record<
      string,
      Readonly<{
        readonly actorId?: string;
        readonly status: FlowChildSnapshot["status"];
        readonly state?: string;
        readonly parentState?: string;
        readonly supervision?: FlowChildSnapshot["supervision"];
      }>
    >
  >;
}>;

export type FlowTestProgressBounds = Readonly<{
  readonly maxTicks: number;
  readonly maxFibers: number;
}>;

export type FlowTestCache = Readonly<{
  readonly query: (id: string) => FlowResourceSnapshot | undefined;
}>;

export type FlowTestTransactions = Readonly<{
  readonly all: () => Readonly<Record<string, FlowTransactionSnapshot>>;
  readonly get: (id: string) => FlowTransactionSnapshot | undefined;
  readonly events: (id: string) => ReadonlyArray<FlowReceipt>;
  readonly previewPatches: (id: string) => ReadonlyArray<FlowReceipt>;
  readonly rollbacks: (id: string) => ReadonlyArray<FlowReceipt>;
  readonly queued: (id: string) => ReadonlyArray<FlowReceipt>;
}>;

export type FlowTestTimers = Readonly<{
  readonly all: () => Readonly<Record<string, FlowTimerSnapshot>>;
  readonly get: (id: string) => FlowTimerSnapshot | undefined;
  readonly active: (id: string) => FlowTimerSnapshot | undefined;
  readonly fired: (id: string) => FlowTimerSnapshot | undefined;
  readonly cancelled: (id: string) => FlowTimerSnapshot | undefined;
  readonly events: (id: string) => ReadonlyArray<FlowReceipt>;
}>;

export type FlowTestPendingMailbox = Readonly<{
  readonly id: string;
  readonly pending: number;
}>;

export type FlowTestPendingTimer = Readonly<{
  readonly id: string;
  readonly dueAt: number;
  readonly parentState?: string;
}>;

export type FlowTestPendingChild = Readonly<{
  readonly id: string;
  readonly actorId?: string;
  readonly status: FlowChildSnapshot["status"];
  readonly state?: string;
  readonly parentState?: string;
}>;

export type FlowTestPendingWork = Readonly<{
  readonly ready: number;
  readonly activeFibers: number;
  readonly mailboxes: ReadonlyArray<FlowTestPendingMailbox>;
  readonly timers: ReadonlyArray<FlowTestPendingTimer>;
  readonly streams: ReadonlyArray<string>;
  readonly transactions: ReadonlyArray<string>;
  readonly children: ReadonlyArray<FlowTestPendingChild>;
  readonly nextAfterMillis?: number;
}>;

export type FlowRehydratedTestHarness<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
> = Readonly<{
  readonly runtime: FlowRuntime<any, any>;
  readonly actor: FlowActor<Context, Event, State>;
  readonly state: () => State;
  readonly context: () => Context;
  readonly snapshot: () => FlowSnapshot<Context, State, Event>;
  readonly send: (event: Event) => FlowRehydratedTestHarness<Context, Event, State>;
  readonly sendAll: (
    events: ReadonlyArray<Event>,
  ) => FlowRehydratedTestHarness<Context, Event, State>;
  readonly can: (event: Event) => boolean;
  readonly children: () => Readonly<Record<string, FlowChildSnapshot>>;
  readonly childTree: () => FlowTestChildTree;
  readonly childSummary: () => FlowTestChildSummary;
  readonly receipts: () => ReadonlyArray<FlowReceipt>;
  readonly receiptSummary: () => FlowReceiptFacts;
  readonly issues: () => ReadonlyArray<FlowIssue>;
  readonly issueSummary: () => ReadonlyArray<FlowIssueSummary>;
  readonly serialize: () => FlowActorSnapshotTree;
  readonly flush: () => Promise<void>;
  readonly advance: (duration: Duration.Input) => Promise<void>;
  readonly dispose: () => Promise<void>;
}>;
