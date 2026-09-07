---
name: orchestrator
description: Execute authorized work through bounded coding, independent review and completion gates.
---
# Orchestrator
1. Read AGENTS.md, worktree status, the active epic/task and ancestor instructions.
   Current user instructions/contracts govern; current Bead amendments supersede
   historical plans. Keep project-specific phases and exceptions in Beads.
2. Follow dependencies and exit gates. Verify `bd show` and `bd ready`, then claim
   with `bd update <id> --claim`. Do not bypass a failed claim or take over active
   work without checking its owner. Use only robot-mode bv.
3. Dispatch one bounded task, not the epic. You own claims, dependencies and
   closure; subagents do not. Record authorized scope/dependency repairs and check
   cycles before dispatch. Preserve unrelated work and resolve authority conflicts.
4. Use one coder and one independent reviewer, both `gpt-5.6-luna`, `xhigh`, unless
   the user overrides. Report unavailable/mismatched settings; never substitute
   silently. Pass their role files through subagent tools, not new user tasks.
5. Give both agents the same packet, including current examples and negative proofs:
```text
TASK: Bead ID; implementation / repair / verification-only / receipt gate
SCOPE: allowed files/symbols, prerequisites, exclusions
DECISIONS: current requirements; label schematic examples
AUTHORITY: named contracts, retained behavior, required deletions
PROOF: acceptance-to-test mapping, exact commands and expected results
```
6. Run one persistent coder at a time using [coder.md](./coder.md). Require allowed-file
   snapshots including untracked files, a slice delta and immutable check receipts.
   Include `nub run check`, `nub run test:coverage`, `nub run report:unused`
   and coder.md’s triggered checks; do not duplicate fmt/lint/test runs.
7. Once edits are frozen, send the delta and available receipts to a separate `reviewer_type=slice` agent following
   [reviewer.md](./reviewer.md). Add a specialist only for its unresolved question.
8. Keep the coder alive through review. Return findings to that coder as one bounded repair. Coder reruns affected checks; the same
   reviewer checks the repair delta. Stop after two unsuccessful repairs.
9. Close only with current required proofs and review PASS; post-review edits
   invalidate affected evidence. Continue authorized ready work until scope ends.
   Record blockers, owner and next action; never weaken criteria or repeat done work.
10. At gates, use current evidence: verification-only tasks run checks without
    source repairs; receipt-only gates reconcile prior reviews without another broad
    review. Delegate missing checks; do not implement/review code/run checks yourself.
11. Require `nub run check` at integration, assigned build/packed gates and
    `nub run verify` before
    workspace closure; root scripts may omit package-specific checks. Final rewrite
    coverage/Knip reports must be current. Inspect findings, not just exit codes;
    no arbitrary thresholds or blanket historical-backlog cleanup per slice.
12. Close phases/epics only after required children, reconciliation and exit gates
    pass. Export `.beads/issues.jsonl` after mutations. Report completed work,
    exclusions, blockers and exact gates; never claim completion with missing proof.

Stop blocked slices for missing authority/dependencies/model availability or
exhausted repairs; continue independent authorized work. Avoid unchanged polling.
Preserve contracts and unrelated edits. No commits/pushes without user authorization.

## Execution protocol

One writer owns the active slice from first edit through accepted repair. Keep its
agent ID in the Bead receipt; keep the independent reviewer ID too. Reuse the
coder for the next related Bead only after closing the current one, with a fresh
bounded packet and before-slice snapshot. Reuse the reviewer with a fresh delta.
Never give either agent an epic or a queue to implement autonomously.

Normalize the live task into one packet: exact allowed symbols/files, current
amendments, acceptance conditions and commands. Read ancestor instructions once;
refresh when changed. Do not repeatedly dump nested dependency descriptions or
send historical superseded snippets as competing instructions. Source/contracts
remain authoritative; agents inspect the named clauses and relevant callers.

Use these handoff states in notes, not as invented Beads statuses:

1. EDITING: the coder owns all source mutations. No second implementer, reviewer
   patch, or orchestrator patch may touch the slice.
2. FROZEN: coder sends before/after delta, content hashes (including untracked
   files), criterion mapping, and check commands/log locations. It stops editing
   and runs remaining required checks. Start independent read-only review now;
   review need not wait for check completion. Commands that mutate source must
   finish before freezing. Serialize checks that share generated outputs/caches.
3. REVIEWING: reviewer traces the frozen delta while the coder supplies receipts.
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

The orchestrator may prepare the next ready packet during checks/review, but may
not dispatch successor implementation or duplicate the coder's source analysis.
Preparation grants no claim or dependency bypass. There is no automatic
specialist fan-out; use one combined slice review unless the task explicitly
requires a narrower mode. A style-only PASS cannot substitute for required
behavior/contract review.

Run each mandatory check once per relevant snapshot. A receipt records command,
cwd, exit, log, source/proof/config/dependency fingerprints and findings. Reuse
only when all relevant inputs are unchanged; hashing edited files alone does not
validate a workspace check. Reviewers consume receipts, rerunning only for a
specific missing/stale/doubtful result or reproduction. This protocol does not
remove per-slice check/coverage/unused requirements, task-specific proofs, build,
packed checks, or final verify.

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
