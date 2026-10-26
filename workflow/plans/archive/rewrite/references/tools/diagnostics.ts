// Canonical failure data and the single host error (D8, D14).
import { Schema } from "effect";
import { definition, Diagnostic, FlowError } from "flow-state";

export function demonstrateInvalidDefinition() {
  try {
    // An empty id is invalid; construction throws instead of returning a Result.
    return definition({ id: "", states: ["READY"], events: {} });
  } catch (failure) {
    if (failure instanceof FlowError) {
      for (const diagnostic of failure.diagnostics) {
        // Branch on stable data, never on evolving human text.
        console.error(diagnostic.classification, diagnostic.code, diagnostic.path, diagnostic.help);
      }
    }

    throw failure;
  }
}

// Diagnostic is its own executable Schema, not a second error model.
export const decodeDiagnostic = Schema.decodeUnknownResult(Diagnostic);

/**
 * FlowError replaces FlowUsageError, FlowPersistenceError, FlowDisposeError and
 * FlowStoryExecutionError. It has _tag "FlowError", a closed `code`, `diagnostics`, an optional
 * `cause` (complete Cause at disposal/readiness boundaries) and, for StoryExecution, the partial
 * run evidence (completed checkpoints, end when captured, ordered cleanup diagnostics).
 *
 * Diagnostic fields: classification (Failure | Defect | Interruption), code, path, details,
 * summary, help. Snapshots expose active issue summaries, not raw Cause.
 *
 * Usage codes and their remedies: see ../../DiagnosticsContract.plan O5/O6. Persistence adds
 * ConcurrentCapture (retryable) and NonDurableContextProvider (fix the durable closure).
 */
