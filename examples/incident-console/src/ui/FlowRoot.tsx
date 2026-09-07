"use client";

import { FlowProvider } from "flow-state/react";

import { createIncidentRuntime } from "../app/runtime";
import { IncidentConsole } from "./IncidentConsole";
import { useOwnedFlowRuntime } from "./useOwnedFlowRuntime";

export function FlowRoot({ onDisposed }: Readonly<{ readonly onDisposed: () => void }>) {
  const owned = useOwnedFlowRuntime(createIncidentRuntime, onDisposed);

  if (owned.state.status === "failure") {
    return (
      <main className="mx-auto mt-24 max-w-xl rounded-xl border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">Incident Console could not start</h1>
        <p role="alert" className="mt-3 text-destructive">
          {owned.state.message}
        </p>
      </main>
    );
  }

  if (owned.state.status === "starting" || owned.state.status === "closing") {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f3f4f1] p-8 text-center">
        <div>
          <h1 className="text-2xl font-semibold">
            {owned.state.status === "starting"
              ? "Starting Incident Console"
              : "Closing Incident Console"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">Releasing runtime-owned work…</p>
        </div>
      </main>
    );
  }

  return (
    <FlowProvider runtime={owned.state.runtime}>
      <IncidentConsole onClose={owned.close} />
    </FlowProvider>
  );
}

