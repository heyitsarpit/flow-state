import type { ReactNode } from "react";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";

import {
  assigneeValues,
  serviceValues,
  severityValues,
  statusValues,
  type Incident,
} from "../domain/incidents";
import type {
  AssigneeFilter,
  ServiceFilter,
  SeverityFilter,
  StatusFilter,
} from "../features/incidents/types";
import type { IncidentConsoleSelection } from "../features/incidents/view";
import type { IncidentConsoleSend } from "./console-types";

const serviceFilter = (value: string): ServiceFilter =>
  value === "api" || value === "billing" || value === "identity" || value === "search"
    ? value
    : "all";
const severityFilter = (value: string): SeverityFilter =>
  value === "critical" || value === "high" || value === "medium" || value === "low" ? value : "all";
const statusFilter = (value: string): StatusFilter =>
  value === "open" || value === "acknowledged" || value === "resolved" ? value : "all";
const assigneeFilter = (value: string): AssigneeFilter => {
  if (value === "unassigned") return value;
  return assigneeValues.find((assignee) => assignee === value) ?? "all";
};

export function IncidentFilters({
  selection,
  send,
}: Readonly<{ selection: IncidentConsoleSelection; send: IncidentConsoleSend }>) {
  const selectClass =
    "h-9 w-full rounded-md border bg-white px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div className="border-b p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Triage queue</h2>
        <Button
          variant="ghost"
          className="h-8 min-h-8"
          onClick={() => send({ type: "CLEAR_FILTERS" })}
        >
          Clear
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Filter
          label="Service"
          value={selection.filters.service}
          className={selectClass}
          onChange={(value) => send({ type: "SET_SERVICE_FILTER", value: serviceFilter(value) })}
        >
          <option value="all">All services</option>
          {serviceValues.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </Filter>
        <Filter
          label="Severity"
          value={selection.filters.severity}
          className={selectClass}
          onChange={(value) => send({ type: "SET_SEVERITY_FILTER", value: severityFilter(value) })}
        >
          <option value="all">All severities</option>
          {severityValues.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </Filter>
        <Filter
          label="Status"
          value={selection.filters.status}
          className={selectClass}
          onChange={(value) => send({ type: "SET_STATUS_FILTER", value: statusFilter(value) })}
        >
          <option value="all">All statuses</option>
          {statusValues.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </Filter>
        <Filter
          label="Assignee"
          value={selection.filters.assignee}
          className={selectClass}
          onChange={(value) => send({ type: "SET_ASSIGNEE_FILTER", value: assigneeFilter(value) })}
        >
          <option value="all">All assignees</option>
          <option value="unassigned">Unassigned</option>
          {assigneeValues.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </Filter>
      </div>
    </div>
  );
}

function Filter({
  label,
  value,
  className,
  onChange,
  children,
}: Readonly<{
  label: string;
  value: string;
  className: string;
  onChange: (value: string) => void;
  children: ReactNode;
}>) {
  return (
    <label className="text-xs font-medium text-muted-foreground">
      {label}
      <select
        aria-label={`${label} filter`}
        className={className}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

export function IncidentQueue({
  selection,
  send,
}: Readonly<{ selection: IncidentConsoleSelection; send: IncidentConsoleSend }>) {
  if (selection.queueStatus === "loading") return <QueueMessage>Loading incidents…</QueueMessage>;
  if (selection.queueStatus === "failure" && selection.page === undefined)
    return <QueueMessage alert>Queue unavailable. Use Refresh to retry.</QueueMessage>;
  if (selection.queueStatus === "empty")
    return <QueueMessage>No incidents match these filters.</QueueMessage>;
  return (
    <div>
      {selection.queueStatus === "failure" ? (
        <p role="alert" className="border-b bg-red-50 px-4 py-2 text-xs text-red-900">
          Queue refresh failed; showing the last valid page. Use Refresh to retry.
        </p>
      ) : null}
      {selection.queueStatus === "refreshing" ? (
        <p className="border-b bg-amber-50 px-4 py-2 text-xs text-amber-900">
          Refreshing cached queue…
        </p>
      ) : null}
      <div className="divide-y">
        {selection.page?.incidents.map((incident) => (
          <IncidentRow
            key={incident.id}
            incident={incident}
            selected={selection.selectedIncidentId === incident.id}
            onOpen={() => send({ type: "OPEN_INCIDENT", incidentId: incident.id })}
          />
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 border-t p-4">
        <Button
          disabled={selection.cursor === undefined}
          onClick={() => send({ type: "FIRST_PAGE" })}
        >
          First page
        </Button>
        {selection.page?.nextCursor === null ? (
          <span className="text-xs text-muted-foreground">End of results</span>
        ) : (
          <Button
            variant="primary"
            disabled={selection.page?.nextCursor === undefined}
            onClick={() => {
              const cursor = selection.page?.nextCursor;
              if (cursor !== null && cursor !== undefined) send({ type: "NEXT_PAGE", cursor });
            }}
          >
            Next page
          </Button>
        )}
      </div>
    </div>
  );
}

function IncidentRow({
  incident,
  selected,
  onOpen,
}: Readonly<{ incident: Incident; selected: boolean; onOpen: () => void }>) {
  return (
    <button
      className={cn(
        "block w-full border-l-4 border-l-transparent px-4 py-4 text-left transition-colors hover:bg-white focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-inset",
        selected && "border-l-[#2f6f52] bg-white",
      )}
      aria-pressed={selected}
      onClick={onOpen}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", severityDot(incident.severity))}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{incident.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {incident.id} · {incident.service}
          </p>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <Badge>{incident.status}</Badge>
            <span className="truncate text-muted-foreground">
              {incident.assignee ?? "Unassigned"}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

function QueueMessage({
  children,
  alert = false,
}: Readonly<{ children: ReactNode; alert?: boolean }>) {
  return (
    <p role={alert ? "alert" : undefined} className="p-8 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}
function severityDot(severity: Incident["severity"]) {
  return severity === "critical"
    ? "bg-red-600"
    : severity === "high"
      ? "bg-orange-500"
      : severity === "medium"
        ? "bg-amber-400"
        : "bg-sky-500";
}
