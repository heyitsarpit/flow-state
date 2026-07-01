import type { FlowIssue, FlowSnapshot, FlowViewDefinition } from "./core/api/types.js";

import { viewSelectThrewDiagnostic } from "./diagnostics.js";

export function resolveViewSelectionWithDiagnostics<Context, State extends string, Selected>(
  snapshot: FlowSnapshot<Context, State>,
  view: FlowViewDefinition<Context, State, Selected>,
  issues: ReadonlyArray<FlowIssue>,
): Selected {
  try {
    return view.config.select({
      context: snapshot.context,
      value: snapshot.value,
      resources: snapshot.resources,
      transactions: snapshot.transactions,
      streams: snapshot.streams,
      timers: snapshot.timers,
      children: snapshot.children,
      issues,
      receipts: snapshot.receipts,
    });
  } catch (cause) {
    throw viewSelectThrewDiagnostic({
      viewId: view.id,
      callback: "select",
      cause,
    });
  }
}
