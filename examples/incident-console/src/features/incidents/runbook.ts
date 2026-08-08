import { Option } from "effect";

import * as flow from "flow-state";

import type { Runbook } from "../../domain/incidents";
import { isRetryable, type IncidentApiFailure } from "../../services/incident-api";
import { runbookResource } from "./resources";

export interface RunbookContext {
  readonly incidentId: Option.Option<string>;
  readonly runId: Option.Option<string>;
  readonly runbook: Option.Option<Runbook>;
  readonly error: Option.Option<IncidentApiFailure>;
  readonly retryCount: number;
}

export type RunbookEvent =
  | Readonly<{ readonly type: "RUNBOOK_LOADED"; readonly runbook: Runbook }>
  | Readonly<{ readonly type: "RUNBOOK_LOAD_FAILED"; readonly error: IncidentApiFailure }>
  | Readonly<{ readonly type: "RUNBOOK_LOAD_DEFECT" }>
  | Readonly<{ readonly type: "RUNBOOK_LOAD_INTERRUPTED" }>;

const runbookParams = ({ context }: flow.ResourceParams<RunbookContext>) =>
  [
    Option.getOrThrowWith(context.runId, () => new Error("runbook polling requires an active run")),
  ] as const;

const rememberRunbook = ({ event }: { readonly event: RunbookEvent }) =>
  event.type === "RUNBOOK_LOADED" ? { runbook: Option.some(event.runbook) } : {};

export const runbookMachine = flow.machine<RunbookContext, RunbookEvent>()({
  id: "incidents.runbook-worker",
  initial: "polling",
  context: () => ({
    incidentId: Option.none(),
    runId: Option.none(),
    runbook: Option.none(),
    error: Option.none(),
    retryCount: 0,
  }),
  states: {
    polling: {
      invoke: flow.refresh(runbookResource, {
        params: runbookParams,
        routes: flow.outcomes<Runbook, IncidentApiFailure, RunbookEvent>({
          success: ({ value }) => ({ type: "RUNBOOK_LOADED", runbook: value }),
          failure: ({ error }) => ({ type: "RUNBOOK_LOAD_FAILED", error }),
          defect: () => ({ type: "RUNBOOK_LOAD_DEFECT" }),
          interrupt: () => ({ type: "RUNBOOK_LOAD_INTERRUPTED" }),
        }),
      }),
      on: {
        RUNBOOK_LOADED: [
          {
            target: "succeeded",
            guard: ({ event }) =>
              event.type === "RUNBOOK_LOADED" && event.runbook.status === "succeeded",
            update: rememberRunbook,
          },
          {
            target: "failed",
            guard: ({ event }) =>
              event.type === "RUNBOOK_LOADED" && event.runbook.status === "failed",
            update: rememberRunbook,
          },
          {
            target: "cancelled",
            guard: ({ event }) =>
              event.type === "RUNBOOK_LOADED" && event.runbook.status === "cancelled",
            update: rememberRunbook,
          },
          { target: "waiting", update: rememberRunbook },
        ],
        RUNBOOK_LOAD_FAILED: [
          {
            target: "retrying",
            guard: ({ context, event }) =>
              event.type === "RUNBOOK_LOAD_FAILED" &&
              isRetryable(event.error) &&
              context.retryCount < 1,
            update: ({ context, event }) =>
              event.type === "RUNBOOK_LOAD_FAILED"
                ? { error: Option.some(event.error), retryCount: context.retryCount + 1 }
                : {},
          },
          {
            target: "failed",
            update: ({ event }) =>
              event.type === "RUNBOOK_LOAD_FAILED" ? { error: Option.some(event.error) } : {},
          },
        ],
        RUNBOOK_LOAD_DEFECT: "failed",
        RUNBOOK_LOAD_INTERRUPTED: "cancelled",
      },
    },
    retrying: {
      after: flow.after({
        id: "incidents.runbook-retry",
        delay: "300 millis",
        target: "polling",
      }),
    },
    waiting: {
      invoke: flow.observe(runbookResource, { params: runbookParams }),
      after: flow.after({ id: "incidents.runbook-poll", delay: "150 millis", target: "polling" }),
    },
    succeeded: { type: "final" },
    failed: { type: "final" },
    cancelled: { type: "final" },
  },
});
