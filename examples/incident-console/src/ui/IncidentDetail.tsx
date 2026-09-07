import type { ReactNode } from "react";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";

import { assigneeValues, type Incident } from "../domain/incidents";
import type {
  IncidentDetailModel,
  IncidentRunbookModel,
  IncidentTimelineModel,
} from "../features/incidents/view";
import { IncidentEvents } from "../features/incidents/vocabulary";
import type { IncidentConsoleSend } from "./console-types";

export function IncidentDetail({
  model,
  timeline,
  runbook,
  send,
}: Readonly<{
  model: IncidentDetailModel;
  timeline: IncidentTimelineModel;
  runbook: IncidentRunbookModel;
  send: IncidentConsoleSend;
}>) {
  return (
    <div className="p-5 sm:p-8">
      <Button
        variant="ghost"
        className="mb-5"
        disabled={!model.capabilities.back}
        onClick={() => send(IncidentEvents.back())}
      >
        ← Queue
      </Button>
      {model.status === "loading" ? <DetailMessage>Loading incident…</DetailMessage> : null}
      {model.status === "not-found" ? (
        <DetailMessage alert>
          Incident no longer exists. Return to the queue and refresh.
        </DetailMessage>
      ) : null}
      {model.status === "failure" ? (
        <DetailMessage alert>
          Incident unavailable. Refresh to retry while cached queue data remains usable.
        </DetailMessage>
      ) : null}
      {model.incident === undefined ? null : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Badge className="uppercase">{model.incident.severity}</Badge>
                <Badge data-testid="detail-incident-status">{model.incident.status}</Badge>
                {model.status === "refreshing" ? (
                  <span className="text-xs text-amber-700">Refreshing…</span>
                ) : null}
              </div>
              <h2 className="text-3xl font-semibold tracking-tight">{model.incident.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {model.incident.id} · {model.incident.service} · version {model.incident.version}
              </p>
            </div>
            <Button
              disabled={!model.capabilities.refreshDetail}
              onClick={() => send(IncidentEvents.refreshDetail())}
            >
              Refresh detail
            </Button>
          </div>
          <p className="max-w-3xl border-b py-6 leading-7 text-[#445049]">
            {model.incident.description}
          </p>
          <IncidentActions model={model} send={send} />
          {model.actionFailure === undefined ? null : (
            <p
              role="alert"
              className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-950"
            >
              {model.actionFailure}
            </p>
          )}
          {model.conflict === undefined ? null : (
            <ConflictNotice
              conflict={model.conflict}
              accept={() => send(IncidentEvents.acceptServerVersion())}
            />
          )}
          <div className="grid gap-6 border-t pt-6 xl:grid-cols-2">
            <TimelinePanel model={timeline} />
            <RunbookPanel model={runbook} send={send} />
          </div>
        </>
      )}
    </div>
  );
}

export function EmptyDetail() {
  return (
    <div className="grid min-h-[calc(100vh-73px)] place-items-center p-8 text-center text-muted-foreground">
      <div>
        <p className="text-lg font-medium text-foreground">Select an incident</p>
        <p className="mt-1 text-sm">Open a queue row to inspect and act on it.</p>
      </div>
    </div>
  );
}

function IncidentActions({
  model,
  send,
}: Readonly<{ model: IncidentDetailModel; send: IncidentConsoleSend }>) {
  const incident = model.incident;
  if (incident === undefined) return null;
  const disabled = !model.capabilities.mutate;
  return (
    <section className="py-6" aria-label="Incident actions">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Actions
      </h3>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-muted-foreground">
          Assignee
          <select
            aria-label="Assign incident"
            className="block h-9 min-w-40 rounded-md border bg-white px-2 text-sm"
            value={incident.assignee ?? "unassigned"}
            disabled={disabled}
            onChange={(event) =>
              send(
                IncidentEvents.assign(
                  event.target.value === "unassigned" ? null : event.target.value,
                ),
              )
            }
          >
            <option value="unassigned">Unassigned</option>
            {assigneeValues.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <Button
          disabled={disabled || !model.statusActions?.acknowledged.enabled}
          title={model.statusActions?.acknowledged.reason}
          onClick={() => send(IncidentEvents.changeStatus("acknowledged"))}
        >
          Acknowledge
        </Button>
        <Button
          disabled={disabled || !model.statusActions?.resolved.enabled}
          title={model.statusActions?.resolved.reason}
          onClick={() => send(IncidentEvents.changeStatus("resolved"))}
        >
          Resolve
        </Button>
        <Button
          disabled={disabled || !model.statusActions?.open.enabled}
          title={model.statusActions?.open.reason}
          onClick={() => send(IncidentEvents.changeStatus("open"))}
        >
          Reopen
        </Button>
        {model.mutationPending ? (
          <span className="text-sm text-amber-700">Saving optimistic change…</span>
        ) : null}
      </div>
    </section>
  );
}

function ConflictNotice({
  conflict,
  accept,
}: Readonly<{ conflict: Incident; accept: () => void }>) {
  return (
    <section
      role="alert"
      className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950"
    >
      <h3 className="font-semibold">This incident changed on the server</h3>
      <p className="mt-1 text-sm">
        Version {conflict.version} is authoritative, assigned to {conflict.assignee ?? "nobody"}{" "}
        with status {conflict.status}.
      </p>
      <Button className="mt-3 border-amber-400 bg-white" onClick={accept}>
        Accept server version
      </Button>
    </section>
  );
}

function TimelinePanel({ model }: Readonly<{ model: IncidentTimelineModel }>) {
  return (
    <section className="rounded-xl border bg-[#fafaf7] p-4" aria-label="Timeline">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Timeline</h3>
        <Badge data-testid="timeline-status">{model.connection}</Badge>
      </div>
      {model.gap ? (
        <p
          data-testid="timeline-gap"
          className="mt-3 rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-950"
        >
          Some timeline events are outside the retained window or were missed during reconnect.
        </p>
      ) : null}
      {model.events.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Waiting for incident activity…</p>
      ) : (
        <ol className="mt-4 max-h-72 space-y-3 overflow-auto">
          {model.events.map((event) => (
            <li key={event.id} className="border-l-2 pl-3 text-sm">
              <p>{event.message}</p>
              <time className="text-xs text-muted-foreground">
                {new Date(event.at).toLocaleTimeString()}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function RunbookPanel({
  model,
  send,
}: Readonly<{ model: IncidentRunbookModel; send: IncidentConsoleSend }>) {
  return (
    <section className="rounded-xl border bg-[#fafaf7] p-4" aria-label="Runbook">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Resolution runbook</h3>
          <p className="text-xs text-muted-foreground">Bounded, supervised workflow</p>
        </div>
        {model.active ? (
          <div className="flex gap-2">
            <Button
              disabled={!model.canReplace}
              onClick={() => send(IncidentEvents.replaceRunbook())}
            >
              Replace
            </Button>
            <Button
              variant="danger"
              disabled={!model.canCancel}
              onClick={() => send(IncidentEvents.cancelRunbook())}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="primary"
            disabled={!model.canStart}
            onClick={() => send(IncidentEvents.startRunbook())}
          >
            Start runbook
          </Button>
        )}
      </div>
      {model.active && model.runbook === undefined ? (
        <p className="mt-4 text-sm text-amber-700">Starting runbook…</p>
      ) : null}
      {model.runbook === undefined ? null : (
        <div className="mt-4">
          <Badge>{model.runbook.status}</Badge>
          <ol className="mt-3 space-y-2">
            {model.runbook.steps.map((step) => (
              <li
                key={step.id}
                className="flex items-center justify-between rounded-md border bg-white px-3 py-2 text-sm"
              >
                <span>{step.label}</span>
                <span className="text-xs font-medium uppercase text-muted-foreground">
                  {step.status}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function DetailMessage({
  children,
  alert = false,
}: Readonly<{ children: ReactNode; alert?: boolean }>) {
  return (
    <div
      role={alert ? "alert" : undefined}
      className="rounded-lg border bg-muted/40 p-8 text-center text-muted-foreground"
    >
      {children}
    </div>
  );
}

