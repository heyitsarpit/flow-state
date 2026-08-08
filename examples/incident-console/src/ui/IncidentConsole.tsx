"use client";

import { useState } from "react";

import { useActor, useView } from "flow-state/react";

import { cn } from "../../lib/utils";

import { incidentConsoleMachine } from "../features/incidents/machine";
import {
  incidentDetailView,
  incidentDiagnosticsView,
  incidentHeaderView,
  incidentNotificationView,
  incidentQueueView,
  incidentRunbookView,
  incidentTimelineView,
} from "../features/incidents/view";
import { IncidentEvents } from "../features/incidents/vocabulary";
import { ConsoleHeader } from "./ConsoleHeader";
import { DiagnosticsDrawer } from "./DiagnosticsDrawer";
import { EmptyDetail, IncidentDetail } from "./IncidentDetail";
import { IncidentFilters, IncidentQueue } from "./IncidentQueue";

export function IncidentConsole({ onClose }: Readonly<{ readonly onClose: () => void }>) {
  const actor = useActor(incidentConsoleMachine, { id: "incident-console" });
  const header = useView(actor, incidentHeaderView);
  const queue = useView(actor, incidentQueueView);
  const detail = useView(actor, incidentDetailView);
  const timeline = useView(actor, incidentTimelineView);
  const runbook = useView(actor, incidentRunbookView);
  const notification = useView(actor, incidentNotificationView).notification;
  const diagnostics = useView(actor, incidentDiagnosticsView);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);

  return (
    <main className="min-h-screen bg-[#f3f4f1] text-[#17201b]">
      <ConsoleHeader
        model={header}
        refresh={() =>
          actor.send(
            header.screen === "queue"
              ? IncidentEvents.refreshQueue()
              : IncidentEvents.refreshDetail(),
          )
        }
        diagnosticsOpen={diagnosticsOpen}
        toggleDiagnostics={() => setDiagnosticsOpen((open) => !open)}
        onClose={onClose}
      />
      <div className="mx-auto grid max-w-[1500px] grid-cols-1 gap-0 border-x bg-card lg:grid-cols-[430px_1fr]">
        <section
          className={cn(
            "min-h-[calc(100vh-73px)] border-r bg-[#fafaf7]",
            header.screen === "detail" && "hidden lg:block",
          )}
          aria-label="Incident queue"
        >
          <IncidentFilters model={queue} send={actor.send} />
          <IncidentQueue model={queue} send={actor.send} />
        </section>
        <section
          className={cn("min-h-[calc(100vh-73px)]", header.screen === "queue" && "hidden lg:block")}
          aria-label="Incident detail"
        >
          {header.screen === "detail" ? (
            <IncidentDetail
              model={detail}
              timeline={timeline}
              runbook={runbook}
              send={actor.send}
            />
          ) : (
            <EmptyDetail />
          )}
        </section>
      </div>
      {notification === undefined ? null : (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 left-1/2 z-20 -translate-x-1/2 rounded-full bg-[#17201b] px-4 py-2 text-sm text-white shadow-lg"
        >
          {notification.message}
          <button
            type="button"
            className="ml-3 underline underline-offset-2"
            onClick={() => actor.send(IncidentEvents.dismissNotification(notification.id))}
          >
            Dismiss
          </button>
        </div>
      )}
      {diagnosticsOpen ? <DiagnosticsDrawer actor={actor} model={diagnostics} /> : null}
    </main>
  );
}
