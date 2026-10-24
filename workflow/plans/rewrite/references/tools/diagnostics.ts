/** Canonical expected failure data and the final host boundary. Target API documentation. */
import { Result, Schema } from "effect";
import { definition, Diagnostic } from "flow-state";

export function demonstrateInvalidDefinition() {
  const result = definition({ id: "", states: ["READY"], events: {} });

  if (Result.isFailure(result)) {
    const diagnostic: Diagnostic = result.failure;
    console.error(diagnostic.classification, diagnostic.code, diagnostic.path);
    console.error(diagnostic.summary, diagnostic.help);
    // Branch on stable data. Never parse evolving human text or assert a made-up source location.
  }

  return result;
}

// Diagnostic itself is the executable schema, not a second JSON/error model.
export const decodeDiagnostic = Schema.decodeUnknownResult(Diagnostic);

/**
 * Diagnostic: Error + yieldable Effect failure + Schema codec, identity flow-state/Diagnostic.
 * Fields: classification (Failure/Defect/Interruption), code, path, details, summary, help.
 * Path holds strings/finite numbers; details holds strings/finite numbers/booleans/null.
 * Definition/event validation uses Result; adapter typed E uses exact failure outcome mapping.
 * Defect and interruption remain separate from typed E. Never squash complete Cause before cleanup.
 * Snapshots expose active issue summaries, not raw Cause or full diagnostic history.
 *
 * Host error names, subject to export restoration:
 * FlowUsageError: _tag/code/path/details; constructor(code,path?,details?), no cause member.
 * FlowDisposeError: _tag="FlowDisposeError", scope actor|runtime, complete Cause at host boundary.
 * FlowPersistenceError: compatibility-only terminal Error, no promised extra fields.
 * FlowStoryExecutionError: sole named testing error; complete Cause/partial evidence preserved,
 * but public member/constructor spelling remains StoriesAndModels.Q1.
 *
 * Every usage code and its application-level remedy:
 * InvalidCanonicalValue: replace unsupported key values with bounded canonical data.
 * ForeignActorRef: use a ref valid in this receiving app/Runtime.
 * MismatchedActorRef: use the exact required machine-branded ref.
 * MissingActorRef: supply the required ref or choose explicit local creation.
 * DisposedActorRef: do not reuse a disposed stable identity in the same Runtime.
 * RuntimeNotReady: execute and await runtime.ready().
 * RuntimeDisposed: construct a new owned Runtime.
 * MissingContextProvider: admit the exact provider before its consumer.
 * ContextDependencyCycle: remove cyclic provider edges.
 * DuplicateActorClaim: join compatible shared admission or choose a distinct stable identity.
 * UnadmittedMachine: include the machine before compiling the closed app.
 * ActorNotActive: wait for owning host activation/resume; suspended sends reject.
 * InvalidOperationPlan: fix the descriptor-owned plan before admission.
 * WrongOperationKind: use the matching resource/transaction/stream family.
 * OperationNotPending: act only on the intended pending work.
 * OperationAlreadySettled: do not reuse a settled occurrence; author a new event/attempt.
 * DuplicateStreamDeclaration: keep one actor/descriptor/K declaration; renaming slots is insufficient.
 * BlockedByDependents: dispose all named active/suspended consumers before their provider.
 * AdmissionOverloaded: wait for accepted work to settle; rejection preserves it and FIFO order.
 *
 * Persistence: ConcurrentCapture is retryable; NonDurableContextProvider needs correct durable closure.
 * Artifact proof refusal: Failure/InvalidArtifactOperand with details.reason EvidenceUnavailable
 * and path ["artifact","truncatedBeforeSequence"]. Complete missing selector uses the same code,
 * reason UnknownSelector, and path ["selector"]. Reasons are not new Diagnostic codes.
 *
 * Full vocabulary/remediation: ../../DiagnosticsContract.plan, especially O5/O6.
 * Raw Cause is never a persisted/artifact/CLI field. Only designated in-process final host errors
 * retain it. A cleanup failure cannot be reported as a successful Story run.
 */
