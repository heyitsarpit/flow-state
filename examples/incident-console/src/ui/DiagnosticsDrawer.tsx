import { captureTrace, exportTraceArtifact } from "flow-state/inspect";

import { Button } from "../../components/ui/button";

import type { IncidentConsoleSelection } from "../features/incidents/view";
import type { IncidentConsoleActor } from "./console-types";

export function DiagnosticsDrawer({
  actor,
  selection,
}: Readonly<{ actor: IncidentConsoleActor; selection: IncidentConsoleSelection }>) {
  const exportTrace = () => {
    const payload = JSON.stringify(
      exportTraceArtifact(captureTrace(actor.getSnapshot(), { includeSnapshots: true })),
      null,
      2,
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    link.download = "incident-console-trace.json";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <aside
      className="fixed inset-y-[72px] right-0 z-20 w-[min(430px,100vw)] overflow-auto border-l bg-[#17201b] p-5 text-white shadow-2xl"
      aria-label="Diagnostics"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Live diagnostics</h2>
        <Button className="border-white/20 bg-white/10 text-white" onClick={exportTrace}>
          Export trace
        </Button>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
        <dt className="text-[#9fb3a7]">Machine</dt>
        <dd>{selection.state}</dd>
        <dt className="text-[#9fb3a7]">Queue</dt>
        <dd>{selection.queueStatus}</dd>
        <dt className="text-[#9fb3a7]">Detail</dt>
        <dd>{selection.detailStatus}</dd>
        <dt className="text-[#9fb3a7]">Timeline</dt>
        <dd>{selection.timelineConnection}</dd>
        <dt className="text-[#9fb3a7]">Issues</dt>
        <dd>{selection.issueCount}</dd>
      </dl>
      <pre className="mt-6 overflow-auto rounded-lg bg-black/25 p-3 text-xs leading-5">
        {JSON.stringify(actor.serialize(), null, 2)}
      </pre>
    </aside>
  );
}
