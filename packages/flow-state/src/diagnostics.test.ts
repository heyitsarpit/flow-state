import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";

import {
  FlowBug,
  FlowBugDocument,
  FlowDiagnostic,
  FlowDiagnosticDocument,
  flowDiagnosticDocumentOf,
  formatFlowDiagnostic,
} from "./diagnostics.js";

describe("flow diagnostics", () => {
  it("renders expected diagnostics in a stable library-facing shape", () => {
    const diagnostic = new FlowDiagnostic({
      code: "FLOW-REACT-001",
      title: "FlowProvider is missing a runtime",
      summary: "useFlowRuntime() was called outside a FlowProvider boundary.",
      why: "FlowRuntimeContext resolved to null for the current React subtree.",
      help: "Wrap the subtree in <FlowProvider runtime={...}> or move the hook under an existing provider.",
      debug: {
        hook: "useFlowRuntime",
      },
    });

    expect(Schema.encodeSync(FlowDiagnosticDocument)(flowDiagnosticDocumentOf(diagnostic))).toEqual(
      {
        code: "FLOW-REACT-001",
        debug: {
          hook: "useFlowRuntime",
        },
        help: "Wrap the subtree in <FlowProvider runtime={...}> or move the hook under an existing provider.",
        summary: "useFlowRuntime() was called outside a FlowProvider boundary.",
        title: "FlowProvider is missing a runtime",
        why: "FlowRuntimeContext resolved to null for the current React subtree.",
      },
    );
    expect(formatFlowDiagnostic(diagnostic)).toBe(
      [
        "[FLOW-REACT-001] FlowProvider is missing a runtime",
        "what happened: useFlowRuntime() was called outside a FlowProvider boundary.",
        "why: FlowRuntimeContext resolved to null for the current React subtree.",
        "help: Wrap the subtree in <FlowProvider runtime={...}> or move the hook under an existing provider.",
        'debug: {"hook":"useFlowRuntime"}',
      ].join("\n"),
    );
  });

  it("keeps invariant failures in the separate bug lane", () => {
    const bug = new FlowBug({
      code: "bug[flow-orch/missing-owned-child-actor]",
      title: "Missing owned child actor for child.editor",
      summary:
        "The orchestrator expected a previously attached owned child actor to still be registered.",
      why: "The runtime reached a state that should be impossible once child attachment succeeds and state-owned children are tracked consistently.",
      help: "Treat this as a library bug and inspect recent child:start or child:stop facts for the parent actor before filing or fixing the issue.",
      debug: {
        childId: "child.editor",
      },
    });

    expect(Schema.encodeSync(FlowBugDocument)(flowDiagnosticDocumentOf(bug))).toEqual({
      code: "bug[flow-orch/missing-owned-child-actor]",
      debug: {
        childId: "child.editor",
      },
      help: "Treat this as a library bug and inspect recent child:start or child:stop facts for the parent actor before filing or fixing the issue.",
      summary:
        "The orchestrator expected a previously attached owned child actor to still be registered.",
      title: "Missing owned child actor for child.editor",
      why: "The runtime reached a state that should be impossible once child attachment succeeds and state-owned children are tracked consistently.",
    });
    expect(formatFlowDiagnostic(bug)).toBe(
      [
        "[bug[flow-orch/missing-owned-child-actor]] Missing owned child actor for child.editor",
        "what happened: The orchestrator expected a previously attached owned child actor to still be registered.",
        "why: The runtime reached a state that should be impossible once child attachment succeeds and state-owned children are tracked consistently.",
        "help: Treat this as a library bug and inspect recent child:start or child:stop facts for the parent actor before filing or fixing the issue.",
        'debug: {"childId":"child.editor"}',
      ].join("\n"),
    );
  });
});
