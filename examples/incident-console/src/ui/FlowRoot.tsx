"use client";

import { useEffect, useRef, useState } from "react";

import { FlowProvider } from "flow-state/react";

import { createIncidentRuntime } from "../app/runtime";
import { IncidentConsole } from "./IncidentConsole";

type RuntimeState =
  | Readonly<{
      readonly status: "ready";
      readonly runtime: ReturnType<typeof createIncidentRuntime>;
    }>
  | Readonly<{ readonly status: "failure"; readonly message: string }>;

export function FlowRoot({ onDisposed }: Readonly<{ readonly onDisposed: () => void }>) {
  const [closing, setClosing] = useState(false);
  const mountGeneration = useRef(0);
  const [runtimeState] = useState<RuntimeState>(() => {
    try {
      return { status: "ready", runtime: createIncidentRuntime() };
    } catch (cause) {
      return {
        status: "failure",
        message: cause instanceof Error ? cause.message : String(cause),
      };
    }
  });

  useEffect(() => {
    const generation = ++mountGeneration.current;
    return () => {
      queueMicrotask(() => {
        if (mountGeneration.current !== generation || runtimeState.status !== "ready") return;
        void runtimeState.runtime.dispose();
      });
    };
  }, [runtimeState]);

  useEffect(() => {
    if (!closing || runtimeState.status !== "ready") return;
    void runtimeState.runtime.dispose().then(onDisposed);
  }, [closing, onDisposed, runtimeState]);

  if (runtimeState.status === "failure") {
    return (
      <main className="mx-auto mt-24 max-w-xl rounded-xl border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">Incident Console could not start</h1>
        <p role="alert" className="mt-3 text-destructive">
          {runtimeState.message}
        </p>
      </main>
    );
  }

  if (closing) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f3f4f1] p-8 text-center">
        <div>
          <h1 className="text-2xl font-semibold">Closing Incident Console</h1>
          <p className="mt-2 text-sm text-muted-foreground">Releasing runtime-owned work…</p>
        </div>
      </main>
    );
  }

  return (
    <FlowProvider runtime={runtimeState.runtime}>
      <IncidentConsole onClose={() => setClosing(true)} />
    </FlowProvider>
  );
}
