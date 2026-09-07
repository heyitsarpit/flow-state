import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";

import type { IncidentHeaderModel } from "../features/incidents/view";

export function ConsoleHeader({
  model,
  refresh,
  diagnosticsOpen,
  toggleDiagnostics,
  onClose,
}: Readonly<{
  readonly model: IncidentHeaderModel;
  readonly refresh: () => void;
  readonly diagnosticsOpen: boolean;
  readonly toggleDiagnostics: () => void;
  readonly onClose: () => void;
}>) {
  const degraded = model.queueStatus === "failure" || model.detailStatus === "failure";
  const connection = degraded
    ? "degraded"
    : model.screen === "queue"
      ? "connected"
      : model.timelineConnection;

  return (
    <header className="sticky top-0 z-10 border-b bg-[#17201b] text-white shadow-sm">
      <div className="mx-auto flex min-h-[72px] max-w-[1500px] items-center gap-4 px-5">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#9fb3a7]">
            Operations
          </p>
          <h1 className="truncate text-xl font-semibold tracking-tight">Incident Console</h1>
        </div>
        <Badge className="border-white/20 bg-white/5 text-white" data-testid="api-status">
          <span
            className={cn(
              "mr-1.5 size-2 rounded-full bg-emerald-400",
              (connection === "degraded" || connection === "failed") && "bg-red-400",
              connection === "reconnecting" && "animate-pulse bg-amber-300",
            )}
          />
          {connection}
        </Badge>
        <Button
          variant="ghost"
          className="text-white hover:bg-white/10"
          disabled={!model.canRefresh}
          onClick={refresh}
        >
          Refresh
        </Button>
        <Button
          variant="ghost"
          aria-expanded={diagnosticsOpen}
          className="text-white hover:bg-white/10"
          onClick={toggleDiagnostics}
        >
          Diagnostics
        </Button>
        <Button variant="ghost" className="text-white hover:bg-white/10" onClick={onClose}>
          Exit console
        </Button>
      </div>
    </header>
  );
}

