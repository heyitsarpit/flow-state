"use client";

import { useState } from "react";

import { useActor, useView } from "flow-state/react";

import { cn } from "../../lib/utils";

import { incidentConsoleMachine } from "../features/incidents/machine";
import { incidentConsoleView } from "../features/incidents/view";
import { ConsoleHeader } from "./ConsoleHeader";
import { DiagnosticsDrawer } from "./DiagnosticsDrawer";
import { EmptyDetail, IncidentDetail } from "./IncidentDetail";
import { IncidentFilters, IncidentQueue } from "./IncidentQueue";

export function IncidentConsole({ onClose }: Readonly<{ readonly onClose: () => void }>) {
  const actor = useActor(incidentConsoleMachine, { id: "incident-console" });
  const selection = useView(actor, incidentConsoleView);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);

  return (
    <main className="min-h-screen bg-[#f3f4f1] text-[#17201b]">
      <ConsoleHeader
        selection={selection}
        refresh={() =>
          actor.send({
            type: selection.screen === "queue" ? "REFRESH_QUEUE" : "REFRESH_DETAIL",
          })
        }
        diagnosticsOpen={diagnosticsOpen}
        toggleDiagnostics={() => setDiagnosticsOpen((open) => !open)}
        onClose={onClose}
      />
      <div className="mx-auto grid max-w-[1500px] grid-cols-1 gap-0 border-x bg-card lg:grid-cols-[430px_1fr]">
        <section
          className={cn(
            "min-h-[calc(100vh-73px)] border-r bg-[#fafaf7]",
            selection.screen === "detail" && "hidden lg:block",
          )}
          aria-label="Incident queue"
        >
          <IncidentFilters selection={selection} send={actor.send} />
          <IncidentQueue selection={selection} send={actor.send} />
        </section>
        <section
          className={cn(
            "min-h-[calc(100vh-73px)]",
            selection.screen === "queue" && "hidden lg:block",
          )}
          aria-label="Incident detail"
        >
          {selection.screen === "detail" ? (
            <IncidentDetail selection={selection} send={actor.send} />
          ) : (
            <EmptyDetail />
          )}
        </section>
      </div>
      {selection.feedback === undefined ? null : (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 left-1/2 z-20 -translate-x-1/2 rounded-full bg-[#17201b] px-4 py-2 text-sm text-white shadow-lg"
        >
          {selection.feedback}
        </div>
      )}
      {diagnosticsOpen ? <DiagnosticsDrawer actor={actor} selection={selection} /> : null}
    </main>
  );
}
