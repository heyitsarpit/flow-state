import type { ReactNode } from "react";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";

import { assigneeValues, type Incident } from "../domain/incidents";
import type { IncidentConsoleSelection } from "../features/incidents/view";
import type { IncidentConsoleSend } from "./console-types";

export function IncidentDetail({
  selection,
  send,
}: Readonly<{ selection: IncidentConsoleSelection; send: IncidentConsoleSend }>) {
  return (
    <div className="p-5 sm:p-8">
      <Button variant="ghost" className="mb-5" onClick={() => send({ type: "BACK_TO_QUEUE" })}>
        ← Queue
      </Button>
      {selection.detailStatus === "loading" ? (
        <DetailMessage>Loading incident…</DetailMessage>
      ) : null}
      {selection.detailStatus === "not-found" ? (
        <DetailMessage alert>
          Incident no longer exists. Return to the queue and refresh.
        </DetailMessage>
      ) : null}
      {selection.detailStatus === "failure" ? (
        <DetailMessage alert>
          Incident unavailable. Refresh to retry while cached queue data remains usable.
        </DetailMessage>
      ) : null}
      {selection.incident === undefined ? null : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Badge className="uppercase">{selection.incident.severity}</Badge>
                <Badge data-testid="detail-incident-status">{selection.incident.status}</Badge>
                {selection.detailStatus === "refreshing" ? (
                  <span className="text-xs text-amber-700">Refreshing…</span>
                ) : null}
              </div>
              <h2 className="text-3xl font-semibold tracking-tight">{selection.incident.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {selection.incident.id} · {selection.incident.service} · version{" "}
                {selection.incident.version}
              </p>
            </div>
            <Button onClick={() => send({ type: "REFRESH_DETAIL" })}>Refresh detail</Button>
          </div>
          <p className="max-w-3xl border-b py-6 leading-7 text-[#445049]">
            {selection.incident.description}
          </p>
          <IncidentActions selection={selection} send={send} />
          {selection.conflict === undefined ? null : (
            <ConflictNotice
              conflict={selection.conflict}
              accept={() => send({ type: "ACCEPT_SERVER_VERSION" })}
            />
          )}
          <div className="grid gap-6 border-t pt-6 xl:grid-cols-2">
            <TimelinePanel selection={selection} />
            <RunbookPanel selection={selection} send={send} />
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
  selection,
  send,
}: Readonly<{ selection: IncidentConsoleSelection; send: IncidentConsoleSend }>) {
  const incident = selection.incident;
  if (incident === undefined) return null;
  const disabled = selection.mutationPending || selection.runbookActive;
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
              send({
                type: "ASSIGN",
                assignee: event.target.value === "unassigned" ? null : event.target.value,
              })
            }
          >
            <option value="unassigned">Unassigned</option>
            {assigneeValues.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <Button
          disabled={disabled || incident.status !== "open"}
          title={incident.status !== "open" ? "Only open incidents can be acknowledged" : undefined}
          onClick={() => send({ type: "CHANGE_STATUS", status: "acknowledged" })}
        >
          Acknowledge
        </Button>
        <Button
          disabled={disabled || incident.status === "resolved"}
          title={incident.status === "resolved" ? "Incident is already resolved" : undefined}
          onClick={() => send({ type: "CHANGE_STATUS", status: "resolved" })}
        >
          Resolve
        </Button>
        <Button
          disabled={disabled || incident.status !== "resolved"}
          title={
            incident.status !== "resolved" ? "Only resolved incidents can be reopened" : undefined
          }
          onClick={() => send({ type: "CHANGE_STATUS", status: "open" })}
        >
          Reopen
        </Button>
        {selection.mutationPending ? (
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

function TimelinePanel({ selection }: Readonly<{ selection: IncidentConsoleSelection }>) {
  return (
    <section className="rounded-xl border bg-[#fafaf7] p-4" aria-label="Timeline">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Timeline</h3>
        <Badge data-testid="timeline-status">{selection.timelineConnection}</Badge>
      </div>
      {selection.timelineGap ? (
        <p
          data-testid="timeline-gap"
          className="mt-3 rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-950"
        >
          Some timeline events are outside the retained window or were missed during reconnect.
        </p>
      ) : null}
      {selection.timeline.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Waiting for incident activity…</p>
      ) : (
        <ol className="mt-4 max-h-72 space-y-3 overflow-auto">
          {selection.timeline.map((event) => (
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
  selection,
  send,
}: Readonly<{ selection: IncidentConsoleSelection; send: IncidentConsoleSend }>) {
  return (
    <section className="rounded-xl border bg-[#fafaf7] p-4" aria-label="Runbook">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Resolution runbook</h3>
          <p className="text-xs text-muted-foreground">Bounded, supervised workflow</p>
        </div>
        {selection.runbookActive ? (
          <div className="flex gap-2">
            <Button onClick={() => send({ type: "REPLACE_RUNBOOK" })}>Replace</Button>
            <Button variant="danger" onClick={() => send({ type: "CANCEL_RUNBOOK" })}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="primary"
            disabled={selection.mutationPending}
            onClick={() => send({ type: "START_RUNBOOK" })}
          >
            Start runbook
          </Button>
        )}
      </div>
      {selection.runbookActive && selection.runbook === undefined ? (
        <p className="mt-4 text-sm text-amber-700">Starting runbook…</p>
      ) : null}
      {selection.runbook === undefined ? null : (
        <div className="mt-4">
          <Badge>{selection.runbook.status}</Badge>
          <ol className="mt-3 space-y-2">
            {selection.runbook.steps.map((step) => (
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
