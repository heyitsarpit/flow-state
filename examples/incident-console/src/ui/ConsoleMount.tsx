"use client";

import { useState } from "react";

import { Button } from "../../components/ui/button";

import { FlowRoot } from "./FlowRoot";

export function ConsoleMount() {
  const [open, setOpen] = useState(true);
  const [generation, setGeneration] = useState(1);
  if (open) return <FlowRoot key={generation} onDisposed={() => setOpen(false)} />;
  return (
    <main className="grid min-h-screen place-items-center bg-[#f3f4f1] p-8 text-center">
      <div>
        <h1 className="text-2xl font-semibold">Incident Console closed</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Runtime-owned requests, streams, timers, and workflows have been released.
        </p>
        <Button
          className="mt-5"
          variant="primary"
          onClick={() => {
            setGeneration((current) => current + 1);
            setOpen(true);
          }}
        >
          Reopen console
        </Button>
      </div>
    </main>
  );
}

