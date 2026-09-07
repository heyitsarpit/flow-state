import type { ReactNode } from "react";

import { Option, Schema } from "effect";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";

import {
  assigneeValues,
  AssigneeFilterSchema,
  ServiceFilterSchema,
  serviceValues,
  SeverityFilterSchema,
  severityValues,
  StatusFilterSchema,
  statusValues,
  type Incident,
} from "../domain/incidents";
import type { IncidentQueueModel } from "../features/incidents/view";
import { IncidentEvents } from "../features/incidents/vocabulary";
import type { IncidentConsoleSend } from "./console-types";

const serviceFilter = (value: string) => Schema.decodeUnknownOption(ServiceFilterSchema)(value);
const severityFilter = (value: string) => Schema.decodeUnknownOption(SeverityFilterSchema)(value);
const statusFilter = (value: string) => Schema.decodeUnknownOption(StatusFilterSchema)(value);
const assigneeFilter = (value: string) => Schema.decodeUnknownOption(AssigneeFilterSchema)(value);

const sendDecoded = <Value,>(
  decoded: Option.Option<Value>,
  send: (value: Value) => unknown,
): void => {
  if (Option.isSome(decoded)) send(decoded.value);
};

export function IncidentFilters({
  model,
  send,
}: Readonly<{ model: IncidentQueueModel; send: IncidentConsoleSend }>) {
  const selectClass =
    "h-9 w-full rounded-md border bg-white px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div className="border-b p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Triage queue</h2>
        <Button
          variant="ghost"
          className="h-8 min-h-8"
          disabled={!model.capabilities.filterQueue}
          onClick={() => send(IncidentEvents.clearFilters())}
        >
          Clear
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Filter
          label="Service"
          value={model.filters.service}
          disabled={!model.capabilities.filterQueue}
          className={selectClass}
          onChange={(value) =>
            sendDecoded(serviceFilter(value), (decoded) =>
              send(IncidentEvents.setServiceFilter(decoded)),
            )
          }
        >
          <option value="all">All services</option>
          {serviceValues.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </Filter>
        <Filter
          label="Severity"
          value={model.filters.severity}
          disabled={!model.capabilities.filterQueue}
          className={selectClass}
          onChange={(value) =>
            sendDecoded(severityFilter(value), (decoded) =>
              send(IncidentEvents.setSeverityFilter(decoded)),
            )
          }
        >
          <option value="all">All severities</option>
          {severityValues.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </Filter>
        <Filter
          label="Status"
          value={model.filters.status}
          disabled={!model.capabilities.filterQueue}
          className={selectClass}
          onChange={(value) =>
            sendDecoded(statusFilter(value), (decoded) =>
              send(IncidentEvents.setStatusFilter(decoded)),
            )
          }
        >
          <option value="all">All statuses</option>
          {statusValues.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </Filter>
        <Filter
          label="Assignee"
          value={model.filters.assignee}
          disabled={!model.capabilities.filterQueue}
          className={selectClass}
          onChange={(value) =>
            sendDecoded(assigneeFilter(value), (decoded) =>
              send(IncidentEvents.setAssigneeFilter(decoded)),
            )
          }
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
  disabled,
  onChange,
  children,
}: Readonly<{
  label: string;
  value: string;
  className: string;
  disabled: boolean;
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
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

export function IncidentQueue({
  model,
  send,
}: Readonly<{ model: IncidentQueueModel; send: IncidentConsoleSend }>) {
  if (model.status === "loading") return <QueueMessage>Loading incidents…</QueueMessage>;
  if (model.status === "failure" && model.page === undefined)
    return <QueueMessage alert>Queue unavailable. Use Refresh to retry.</QueueMessage>;
  if (model.status === "empty")
    return <QueueMessage>No incidents match these filters.</QueueMessage>;
  return (
    <div>
      {model.status === "failure" ? (
        <p role="alert" className="border-b bg-red-50 px-4 py-2 text-xs text-red-900">
          Queue refresh failed; showing the last valid page. Use Refresh to retry.
        </p>
      ) : null}
      {model.status === "refreshing" ? (
        <p className="border-b bg-amber-50 px-4 py-2 text-xs text-amber-900">
          Refreshing cached queue…
        </p>
      ) : null}
      <div className="divide-y">
        {model.page?.incidents.map((incident) => (
          <IncidentRow
            key={incident.id}
            incident={incident}
            selected={model.selectedIncidentId === incident.id}
            disabled={!model.capabilities.openIncident}
            onOpen={() => send(IncidentEvents.open(incident.id))}
          />
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 border-t p-4">
        <Button
          disabled={!model.capabilities.filterQueue || model.cursor === undefined}
          onClick={() => send(IncidentEvents.firstPage())}
        >
          First page
        </Button>
        {model.page?.nextCursor === null ? (
          <span className="text-xs text-muted-foreground">End of results</span>
        ) : (
          <Button
            variant="primary"
            disabled={!model.capabilities.filterQueue || model.page?.nextCursor === undefined}
            onClick={() => {
              const cursor = model.page?.nextCursor;
              if (cursor !== null && cursor !== undefined) send(IncidentEvents.nextPage(cursor));
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
  disabled,
  onOpen,
}: Readonly<{ incident: Incident; selected: boolean; disabled: boolean; onOpen: () => void }>) {
  return (
    <button
      className={cn(
        "block w-full border-l-4 border-l-transparent px-4 py-4 text-left transition-colors hover:bg-white focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-inset",
        selected && "border-l-[#2f6f52] bg-white",
      )}
      aria-pressed={selected}
      disabled={disabled}
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

