// One FlowError and its canonical diagnostics (FlowState D8, D10, O10).
import { definition, FlowError } from "flow-state";

export function demonstrateInvalidDefinition() {
  try {
    // An empty id is invalid; construction throws instead of returning a Result.
    return definition({ id: "", states: ["READY"], events: {} });
  } catch (failure) {
    if (failure instanceof FlowError) {
      for (const diagnostic of failure.diagnostics) {
        // Branch on stable data (code, path), never on human text.
        console.error(diagnostic.classification, diagnostic.code, diagnostic.path, diagnostic.help);
      }
    }

    throw failure;
  }
}

/**
 * FlowError replaces FlowUsageError, FlowPersistenceError, FlowDisposeError and
 * FlowStoryExecutionError: a closed code, diagnostics, an optional cause and, for Story
 * failures, the partial evidence (completed checkpoints, end when captured, cleanup).
 * Codes this app can meet: SendTargetAbsent, MissingContextProvider, AdmissionOverloaded,
 * NonDurableContextProvider, ConcurrentCapture, HiddenOrder, HiddenFilter, UndeclaredEffect.
 */
