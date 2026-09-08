---
name: orchestrator
description: Execute authorized work through bounded coding, independent review and completion gates.
---
# Orchestrator
1. Read AGENTS.md, worktree status, the active epic/task and ancestor instructions.
   Current user instructions/contracts govern; current Bead amendments supersede
   historical plans. Keep project-specific phases and exceptions in Beads.
2. Follow dependencies and exit gates. Verify `bd show`, `bd ready` and ownership
   for every proposed batch member. Atomically claim only the agreed batch members
   through the supported Beads operation. Do not bypass a failed claim or take over
   active work without checking its owner. Use only robot-mode bv.
3. Select an explicit bounded batch of 1–5 closely related feature Beads; 5 is a
   ceiling, not a quota, and there is no autonomous growing queue. You own claims,
   dependencies and closure; subagents do not. Record authorized scope/dependency
   repairs and check cycles before dispatch. Preserve unrelated work and resolve
   authority conflicts. Planning, approval, verification and phase-gate Beads
   cannot be bundled with dependent implementation to bypass acceptance. Do not
   introduce new user-permission flows for same-feature files.
4. Use one coder and one independent reviewer, both `gpt-5.6-luna`, `xhigh`, unless
   the user overrides. Report unavailable/mismatched settings; never substitute
   silently. Pass their role files through subagent tools, not new user tasks.
5. Give both agents the same batch packet, including current examples and negative
   proofs. Include each Bead's feature, criteria and contracts; file hints plus the
   actual owned footprint; referenced-stub guidance; ordered IDs; and external
   versus ordinary internal dependencies:
```text
TASK: ordered Bead IDs, batch size; implementation / repair / verification-only / receipt gate
SCOPE: allowed files/symbols, prerequisites, exclusions
DECISIONS: current requirements; label schematic examples
AUTHORITY: named contracts, retained behavior, required deletions
PROOF: acceptance-to-test mapping, exact commands and expected results
```
   Verify `bd show`, `bd ready` and ownership for every member. All external
   prerequisites, approvals, public gates and phase gates must be satisfied before
   admission. Ordinary internal implementation dependencies may be staged in
   topological order, with the predecessor criterion/proof ready before dependent
   code and recorded as `internal pending review`. This is an explicit
   batch-admission exception to individual `bd ready` for internal members, not
   permission to rewrite edges, claim false readiness or close prematurely.
   Atomically claim the agreed members and record
   order/internal edges; do not take over active work. If a gate or uncertainty
   remains, reduce the batch.
6. In each coder and reviewer handoff, state that the role guide's “one assigned
   task/slice” means exactly this selected batch. Carry the per-Bead criteria and
   proof mapping, require one shared final-batch check receipt set, and state that
   there is no per-Bead freeze or review and no self-selection outside the ordered
   IDs.
7. Run one persistent coder at a time using [coder.md](./coder.md) for the selected
   batch. Require allowed-file snapshots including untracked files, one frozen batch
   delta and immutable check receipts. Run focused checks during behavior changes,
   then run `nub run check`, `nub run test:coverage`, `nub run report:unused` and
   coder.md's triggered checks once for the final relevant batch snapshot; share
   valid receipts across members and do not duplicate fmt/lint/test runs per Bead.
8. Once the batch is frozen, send the delta and available receipts to a separate `reviewer_type=slice` agent following
   [reviewer.md](./reviewer.md). Add a specialist only for its unresolved question.
9. Keep the coder alive through review. Return findings to that coder as one bounded
   repair. Coder reruns affected checks; the same reviewer checks the repair delta.
   Stop after two unsuccessful repairs.
10. Close reviewed-complete Beads individually in dependency order only with current
    required proofs and independent PASS. The reviewer returns one combined batch
    verdict with a per-Bead criteria/proof map. Blocked or incomplete members stay
    open; post-review edits invalidate affected evidence. Record the completed
    prefix, unmet members, owner and next action; never weaken criteria, close
    partial work or repeat done work.
11. At gates, use current evidence: verification-only tasks run checks without
    source repairs; receipt-only gates reconcile prior reviews without another broad
    review. Delegate missing checks; do not implement/review code/run checks yourself.
12. Require `nub run check` at integration, assigned build/packed gates and
    `nub run verify` before
    workspace closure; root scripts may omit package-specific checks. Final rewrite
    coverage/Knip reports must be current. Inspect findings, not just exit codes;
    no arbitrary thresholds or blanket historical-backlog cleanup per batch slice.
13. Close phases/epics only after required children, reconciliation and exit gates
    pass. Export `.beads/issues.jsonl` after mutations. Report completed work,
    exclusions, blockers and exact gates; never claim completion with missing proof.
14. If the current task is blocked because of beads ambiguity or conflicts or missing
    information then get an agent to repair it and continue building. make sure not to
    introduce new conflicts and that upcoming beads remain conflict free.
15. When the current batch of beads are closed, commit the code.

Stop blocked slices for missing authority/dependencies/model availability or
exhausted repairs; continue independent authorized work. Avoid unchanged polling.
Preserve contracts and unrelated edits. No commits/pushes without user authorization.

## Execution protocol

One writer owns the active batch from first edit through accepted repair. Keep its
agent ID and the independent reviewer ID in each Bead receipt. The coder implements
selected members sequentially within one feature area, then the parent closes each
reviewed-complete Bead in dependency order. Start or claim another batch only after
the current batch has an accepted, recorded handoff. Never give either agent an epic
or an autonomous queue.

Normalize the live work into one batch packet: per-Bead exact allowed symbols/files,
feature, current amendments, contracts, acceptance conditions, commands, actual
owned footprint, referenced stubs, ordered IDs and external versus internal
dependencies. Read ancestor instructions once;
refresh when changed. Do not repeatedly dump nested dependency descriptions or
send historical superseded snippets as competing instructions. Source/contracts
remain authoritative; agents inspect the named clauses and relevant callers.

Use these handoff states in notes, not as invented Beads statuses:

1. EDITING: the coder owns all source mutations for the selected batch. No second
   implementer, reviewer patch, or orchestrator patch may touch the slice.
2. FROZEN: coder sends one before/after batch delta, content hashes (including
   untracked files), per-Bead criterion mapping, and check commands/log locations.
   There is one frozen batch delta, not a per-Bead freeze. It stops editing
   and runs remaining required checks. Start independent read-only review now;
   review need not wait for check completion. Commands that mutate source must
   finish before freezing. Serialize checks that share generated outputs/caches.
3. REVIEWING: reviewer traces one frozen batch delta and affected boundaries while
   the coder supplies shared receipts. Return one combined review with per-Bead
   verdicts; do not start a fresh broad review for each Bead.
   Missing pending checks prevent PASS, not starting review. No successor coding
   begins while review or required checks remain outstanding.
4. REPAIRING: gather findings into one bounded request to the same coder. End the
   current review pass before edits resume. Freeze again, rerun affected checks,
   and have the same reviewer inspect the repair delta and affected callers.
5. ACCEPTED: require independent PASS and every required current receipt before
   closure. Record elapsed implementation/check/review time when available so
   future changes target observed cost rather than guessed agent speed.

Do not close a coder merely because it handed off a candidate. Replace it only
when unavailable, context is exhausted, or a diagnosed failure requires a fresh
approach. Before replacement, stop the old writer and confirm it is no longer
running. Give the successor current file hashes, the exact remaining work,
attempted approaches and existing receipts. Explicitly prohibit reimplementing
accepted portions. A slow response alone does not authorize a competing writer.

Request a milestone update when progress is unclear: changed symbols, current
command, blocker, next bounded action. Use event-driven waits and avoid repeated
unchanged status messages. After two unsuccessful repairs, record the specific
blocker; do not restart the same work under a new agent to reset that limit.

The orchestrator may prepare the next ready batch packet read-only during
checks/review, but may not dispatch or claim successor implementation until the
current batch has an accepted, recorded handoff, or duplicate the coder's source
analysis. Preparation grants no claim or dependency bypass. There is no automatic
specialist fan-out; use one combined slice review unless the task explicitly
requires a narrower mode. A style-only PASS cannot substitute for required
behavior/contract review.

Run each mandatory check once per relevant final batch snapshot. A receipt records command,
cwd, exit, log, source/proof/config/dependency fingerprints and findings. Reuse
only when all relevant inputs are unchanged; hashing edited files alone does not
validate a workspace check. Reviewers consume receipts, rerunning only for a
specific missing/stale/doubtful result or reproduction. This protocol does not
remove per-batch-slice check/coverage/unused requirements, per-Bead criteria proofs,
build, packed checks, or final verify.

Apply workflow changes at the next handoff. Preserve active ownership and valid
receipts; do not restart an in-flight slice just to adopt this protocol.

## Static correctness scope

Static harness checks validate successful compilation, expected rejection,
recursive-carrier behavior and public declarations. Compiler errors, including
excessive type-instantiation errors, remain failures. Compiler-performance
measurements and historical benchmark refreshes are deferred; do not request
or reintroduce them as slice requirements. Preserve all semantic and inference
proofs. This user-authorized scope replaces older task excerpts about static
performance gating.
