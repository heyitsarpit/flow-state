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
} from "../core/api/data-types.js";
import type { FlowSnapshot } from "../core/api/machine-types.js";

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
  readonly childTree: () => import("./app-types.js").FlowTestChildTree;
  readonly childSummary: () => import("./app-types.js").FlowTestChildSummary;
  readonly receipts: () => ReadonlyArray<FlowReceipt>;
  readonly receiptSummary: () => FlowReceiptFacts;
  readonly issues: () => ReadonlyArray<FlowIssue>;
  readonly issueSummary: () => ReadonlyArray<FlowIssueSummary>;
  readonly serialize: () => FlowActorSnapshotTree;
  readonly flush: () => Promise<void>;
  readonly advance: (duration: Duration.Input) => Promise<void>;
  readonly dispose: () => Promise<void>;
}>;
