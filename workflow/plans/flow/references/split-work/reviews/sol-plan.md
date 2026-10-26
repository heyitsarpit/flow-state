**Resolve the bootstrap and recovery blockers before approving FlowState for implementation.**

Verified: I read `FlowState.plan`, both adopted design documents in full, the Dispatch Desk README followed by every reference file, and the archived material cited below. I checked D1–D54’s attributions. Findings concern verified textual contradictions or omissions; consequences for the future implementation are inferred.

`workflow check --root /Users/arpit/Developer/flow-state --json` passed. Nothing was edited. The reference remains uncompiled, so this review establishes no runtime behavior.

Paths below use `design/` and `dispatch-desk/` relative to `workflow/plans/flow/references/`. Archived Plan names refer to `workflow/plans/archive/rewrite/`.

**Replacement audit**

This sample spans all eight requested capability areas. Explicit surface changes generally have sound explanations; retention of detailed guarantees is less complete.

| Archived commitment sampled | Disposition in FlowState |
|---|---|
| **Statecharts O2–O3:** bounded nesting; ordered callbacks; indivisible publication | Callback order and publication survive in **O2**. Handler precedence deliberately changes under **D18**. The ten-level nesting bound disappears without a replacement or reason; see F4. |
| **ApplicationsAndActors O5–O7:** terminal ownership, dependency-safe disposal, blocked-lane retirement | Readiness, FIFO admission and causal context survive in **O3–O4**. Prepared/suspended states deliberately disappear under **D16**. Important terminal guarantees are unaccounted for; F3. |
| **Resources O1, O3–O4:** key bounds, pinned parameters, fencing, atomic invalidation | Clearly retained in **O5/D30/O15**, including 16 levels, 256 nodes, 8,192 bytes and 256 invalidation identities. Record keys and shared optimism deliberately replace tuple keys and actor-local previews. |
| **Transactions O2, O4/D3:** occurrence fencing, conservative uncertainty, acknowledged remote journal | Fencing and invocation-based uncertainty survive in **O5/O15**. Flow-owned identity deliberately changes under **D33**, but acknowledged journaling and recoverable identity ownership are not resolved; F2. |
| **Persistence O3, O5:** context-closed capture, ordered last-good writes, shutdown flush | Capture and last-good writes survive in **O8**. The storage surface deliberately changes under **D41**. Bootstrap now contradicts that surface, and shutdown flushing is omitted; F1/F3. |
| **StoriesAndModels O3, O5:** bounded execution, explicit drain, deterministic traversal | `process()`, TestClock, model depth and result limits survive in **O9**. D42 deliberately deletes the `maxTurns` option without replacing its execution bound; F4. |
| **InspectionAndArtifacts O2–O3:** exact codec limits, isolated bounded sinks, truthful truncation | **O11/O15** retain bounded codecs and truncation in general terms. Exact limits and sink failure/close semantics lack an explicit active replacement; F3/F4. |
| **CommandLine O2–O3:** atomic publication, single-result output, interruption closeout | Atomic publication and one result survive in **O11/O15**; saved behavior commands and trace proof are deliberately removed. Signal cleanup and partial-trace guarantees are not expressly retained or rejected; F3. |

Because **FlowState C1** expressly prevents silence from inheriting archived rules, these omissions cannot safely be repaired by an implementer assuming the old behavior.

**Blocking and migration findings**

1. **F1 — blocker: persistence cannot follow the stated bootstrap order.**  
   **Evidence:** FlowState **O3**, lines 101–105, prepares persisted data before building services. **O8**, lines 227–234, supplies `KeyValueStore` through those services while retaining validation “before services.” The reference merges storage and application services into one Layer (`dispatch-desk/app/persistence.ts:11`). Storage must be available to read the data being validated.  
   **Proposed change:** Specify a viable acquisition order: acquire storage before detached validation, then acquire application services; or deliberately permit building the complete Layer first. Record the changed guarantee and test acquisition failure, invalid persisted data, disposal races, and simultaneous same-scope readiness.

2. **F2 — blocker: same-attempt reconciliation has no complete recovery contract.**  
   **Evidence:** **Transactions O4/D3** required acknowledged adapter journaling before dispatch, independently of optional Runtime persistence. FlowState **D33/O5** introduces `attempt.id` and promises reuse, but does not retain that journal obligation or replace it. Normative `design/entity-domain.md:653` says `unknown` reaches the machine with the identity, yet FlowState does not specify that outcome payload or the reconciliation boundary that reuses it.  
   **Inferred consequence:** A crash after dispatch but before persistence can lose the identity needed for safe reconciliation.  
   **Proposed change:** Decide who durably records the attempt before dispatch, including nonpersistent actors. Define `unknown` metadata and the explicit way workflow reconciles that same attempt without silently minting another identity.

3. **F3 — should-fix: terminal cleanup and failure guarantees were silently dropped.**  
   **Evidence:** FlowState **O3/D16** describes disposal mainly as waiting for commits. It omits **ApplicationsAndActors O5/D4**’s cached idempotent result, dependent-provider rejection, cleanup quarantine and retirement of causally blocked work. **Persistence O5**’s final accepted-write flush and **DiagnosticsContract O2**’s complete-Cause preservation and defect/failure/interruption precedence are also absent. **CommandLine O3**’s interruption closeout is not replaced. Deleting suspension or error-class names does not explain these losses.  
   **Proposed change:** Put the retained terminal protocol into **O3/O8/O10/O11**, or explicitly reject each guarantee with a reason. Add failure-path gates for blocked teardown, repeated disposal, mixed execution/cleanup failures and pending persistence writes.

4. **F4 — should-fix: boundedness and determinism need concrete replacement rules.**  
   **Evidence:** **Statecharts O2** capped nesting at ten. **InspectionAndArtifacts O2** specified depth 32, 10,000 nodes, arrays of 4,096 and 2,097,152 encoded bytes. FlowState uses generic bounded-codec language. **D42** deletes `maxTurns`; **O9/V7** supplies no replacement execution budget. **StoriesAndModels O5**’s stable BFS/DFS candidate ordering is also unstated.  
   **Inferred consequence:** Two actors can exchange events indefinitely while each mailbox stays small; mailbox capacity alone cannot terminate `process()`.  
   **Proposed change:** Record exact retained limits, traversal ordering and a deterministic Story execution budget. Deleting a public option can preserve a private safety limit.

5. **F5 — should-fix: actor messaging leaves target-admission failures undecided.**  
   **Evidence:** FlowState **O3**, lines 128–130, specifies FIFO delivery and absent-target dropping. It does not specify delivery to an overloaded or disposing target, although mailbox overflow rejects synchronously at lines 121–122. **O2** also requires whole-batch validation before sender publication.  
   **Proposed change:** Choose whether target admission is reserved before sender commit or can fail after it. Define diagnostic ownership, whether failure affects other sender actions, and target-disposal race behavior. Test each case. D27’s restriction to static shared-ref edges is sound; its failure semantics remain incomplete.

**Consistency, verification and attribution findings**

1. **F6 — should-fix: live inspection has two incompatible surface descriptions.**  
   **Evidence:** FlowState **O11** describes `inspect(app)` returning structural representation. Normative `design/entity-domain.md:920` requires `inspect(runtime).domains...` for current frontiers, predictions and queues. Dispatch Desk demonstrates only the app form (`dispatch-desk/tools/inspection.ts:14`).  
   **Proposed change:** Explicitly retain the Runtime overload and its passive, revision-consistent return contract, or deliberately replace it in the adopted document. Add it to S9/V9 and the reference.

2. **F7 — should-fix: redaction conflicts with faithful checkpoint reads unless its boundary is defined.**  
   **Evidence:** **D48** requires sensitive fields to become digests in every checkpoint. **O9** permits checkpoint reads and component rendering; `design/minimal-library.md:420` makes `check` evaluate the supplied snapshot.  
   **Inferred consequence:** Replacing sensitive memory or context with a digest can change guard results and rendered behavior, or violate the original Schema type.  
   **Proposed change:** Distinguish private typed checkpoint data from its redacted evidence projection, or expressly limit eligibility evaluation and faithful rendering on redacted checkpoints. Define digest encoding and annotation propagation; verify a sensitive field actually used by a guard.

3. **F8 — should-fix: build prerequisites and gate coverage do not match the promised scope.**  
   **Evidence:** **S6** includes entity persistence but depends only on S4, before S5 supplies the entity store. **V1** names the minimal-library editor rather than the adopted reference, whose README records corrections to that editor. **V5** emphasizes the ported runtime model and eight caught mutations, while `design/entity-domain.md:1214` records four surviving mutations and `:1218` excludes unversioned entities, pages, persistence and audit mode.  
   **Proposed change:** Split plain/entity persistence gates or add S5 as a prerequisite. Compile the actual reference in V1. Require explicit production proofs for the model’s uncovered cases rather than treating its port as sufficient coverage.

4. **F9 — should-fix: the reference already contradicts two adopted guarantees.**  
   **Evidence:** `dispatch-desk/features/Tickets/ticket.domain.ts:29` declares the composite primary key `workspaceId, ticketId`; `:56` ends its order with only `ticketId`. Normative `design/entity-domain.md:399` requires the key fields. Separately, `dispatch-desk/features/Tickets/queue/queue.story.ts:53` sends assignment and checkpoints before `process()`, while `queue.test.ts:22` expects its prediction already published. That contradicts **O9**’s explicit drain rule.  
   **Proposed change:** Include both key fields in the declared/server order. For the prediction checkpoint, use a delayed assignment fixture, process the accepted turn, then checkpoint before settlement.

5. **F10 — should-fix: two attribution ranges overclaim what was retained.**  
   **Evidence:** **D6** attributes Duration, Schedule, Stream, Match and KeyValueStore to **SurfaceSimplification D44–D48**. Their actual sources include D35, D53, D33, D61 and minimal-library §10; source D48 concerns rejecting a spike. **D11** claims D38–D42 are kept, but source D41’s observed callback-read analysis has no corresponding active obligation or gate.  
   **Proposed change:** Correct D6’s individual citations. Explicitly retain observed-read analysis with an owner and proof, or record its deletion and reason. A smaller attribution nit: **D53** codifies the reasons/Data shape already agreed in `design/minimal-library.md:420`, rather than originating it.

**Judgment on the Plan-origin decisions**

| Decisions | Assessment |
|---|---|
| **D16, D27, D28** | Removing suspension and adding visible messaging are reasonable simplifications, subject to F3/F5. D28 faithfully adopts **ApplicationsAndActors Q1**’s candidate isolation policy and is sound. |
| **D41, D42** | KeyValueStore, refs and Layer fixtures reduce vocabulary coherently. Their acquisition, recovery and execution-bound consequences remain unresolved: F1–F4. |
| **D48** | Schema-based redaction is useful, but extending it into typed checkpoints needs the explicit tradeoff in F7. |
| **D49** | Rebuilding in place with algorithm/vector ports is reasonable. Deleting superseded modules after replacement limits risk; gate coverage must first be corrected under F8. |
| **D51–D54** | Ensure-by-options, explicit Story ensure, explained denial and ordered pages are coherent. D52 repairs a real creation gap. D53 needs attribution correction; D54 correctly follows the entity paging amendment. |

**Verdict: not ready. Top five changes, in order:**

1. Resolve storage acquisition versus restore validation.
2. Define durable attempt ownership and same-attempt reconciliation.
3. Restore explicit teardown and failure-classification guarantees.
4. Specify execution budgets, codec limits and deterministic traversal.
5. Define how redacted checkpoints support typed reads and replay.