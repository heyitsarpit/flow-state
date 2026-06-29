import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";

import snapshots from "./diagnostics.snapshots.json";
import {
  AnyFlowDiagnosticDocument,
  FlowBug,
  FlowBugDocument,
  FlowDiagnostic,
  FlowDiagnosticDocument,
  flowDiagnosticDocumentOf,
  formatFlowDiagnostic,
  formatFlowDiagnosticPretty,
  printFlowDiagnostic,
  transactionCallbackThrewDiagnostic,
  rejectedWhileRunningTransactionDiagnostic,
} from "./diagnostics.js";

function normalizeDiagnosticStack(value: string): string {
  const firstLine = value.split("\n", 1)[0] ?? value;
  return `${firstLine}\n    at <stack elided>`;
}

function normalizeTransactionCallbackSnapshot(
  diagnostic: FlowDiagnostic,
): Readonly<{ readonly document: FlowDiagnosticDocument }> {
  const document = flowDiagnosticDocumentOf(diagnostic) as FlowDiagnosticDocument & {
    readonly debug: FlowDiagnosticDocument["debug"] & {
      readonly cause: Readonly<{
        readonly message: string;
        readonly name: string;
        readonly stack: string;
      }>;
    };
  };
  const encodedCause = {
    ...document.debug.cause,
    stack: normalizeDiagnosticStack(document.debug.cause.stack),
  };

  return {
    document: {
      ...document,
      debug: {
        ...document.debug,
        cause: encodedCause,
      },
    } as FlowDiagnosticDocument,
  };
}

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
      snapshots.missingProvider.document,
    );
    expect(formatFlowDiagnostic(diagnostic)).toBe(snapshots.missingProvider.message);
    expect(formatFlowDiagnosticPretty(diagnostic)).toBe(snapshots.missingProvider.pretty);
  });

  it("renders transaction rejection diagnostics in the stable tagged shape", () => {
    const diagnostic = rejectedWhileRunningTransactionDiagnostic({
      transactionId: "transactions.save",
      concurrency: "reject-while-running",
      parentState: "ready",
      activeAttemptCount: 1,
    });

    expect(Schema.encodeSync(FlowDiagnosticDocument)(flowDiagnosticDocumentOf(diagnostic))).toEqual(
      snapshots.rejectedWhileRunningTransaction.document,
    );
    expect(formatFlowDiagnostic(diagnostic)).toBe(
      snapshots.rejectedWhileRunningTransaction.message,
    );
    expect(formatFlowDiagnosticPretty(diagnostic)).toBe(
      snapshots.rejectedWhileRunningTransaction.pretty,
    );
  });

  it("renders transaction callback diagnostics with preserved cause details", () => {
    const cause = new Error("params exploded");
    const diagnostic = transactionCallbackThrewDiagnostic({
      transactionId: "transactions.save",
      callback: "params",
      cause,
    });
    const normalized = normalizeTransactionCallbackSnapshot(diagnostic);

    expect(Schema.encodeSync(FlowDiagnosticDocument)(normalized.document)).toEqual(
      snapshots.transactionCallbackThrown.document,
    );
    expect(formatFlowDiagnostic(normalized.document)).toBe(
      snapshots.transactionCallbackThrown.message,
    );
    expect(formatFlowDiagnosticPretty(normalized.document)).toBe(
      snapshots.transactionCallbackThrown.pretty,
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

    expect(Schema.encodeSync(FlowBugDocument)(flowDiagnosticDocumentOf(bug))).toEqual(
      snapshots.missingOwnedChildBug.document,
    );
    expect(formatFlowDiagnostic(bug)).toBe(snapshots.missingOwnedChildBug.message);
    expect(formatFlowDiagnosticPretty(bug)).toBe(snapshots.missingOwnedChildBug.pretty);
  });

  it("encodes every flow error document through one schema union", () => {
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

    expect(
      Schema.encodeSync(AnyFlowDiagnosticDocument)(flowDiagnosticDocumentOf(diagnostic)),
    ).toEqual(snapshots.missingProvider.document);
    expect(Schema.encodeSync(AnyFlowDiagnosticDocument)(flowDiagnosticDocumentOf(bug))).toEqual(
      snapshots.missingOwnedChildBug.document,
    );
  });

  it("lets custom printers operate on serializable diagnostic data", () => {
    const document = Schema.decodeUnknownSync(AnyFlowDiagnosticDocument)(
      snapshots.missingProvider.document,
    );

    expect(
      printFlowDiagnostic(document, (serializableDocument) =>
        JSON.stringify({
          code: serializableDocument.code,
          title: serializableDocument.title,
          debugKeys: Object.keys(serializableDocument.debug),
        }),
      ),
    ).toBe(
      JSON.stringify({
        code: "FLOW-REACT-001",
        title: "FlowProvider is missing a runtime",
        debugKeys: ["hook"],
      }),
    );
  });

  it("preserves stack and message access through the lazy diagnostic path", () => {
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

    expect(String(diagnostic)).toBe(snapshots.missingProvider.message);
    expect(diagnostic.stack).toContain("FLOW-REACT-001");
    expect(diagnostic.stack).toContain("FlowProvider is missing a runtime");
  });
});
