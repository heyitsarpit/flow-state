import { FlowDiagnostic, FlowDiagnosticCodes } from "../shared/diagnostics.js";

export function missingFlowProviderRuntimeDiagnostic(): FlowDiagnostic {
  return new FlowDiagnostic({
    code: FlowDiagnosticCodes.missingProviderRuntime,
    title: "FlowProvider is missing a runtime",
    summary: "useFlowRuntime() was called outside FlowProvider.",
    why: "FlowRuntimeContext resolved to null for this React subtree.",
    help: "Wrap the subtree in <FlowProvider runtime={...}> or move the hook under one.",
    debug: {
      hook: "useFlowRuntime",
    },
  });
}
