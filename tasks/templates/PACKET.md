# Packet and receipt contract

[Back to the plan tracker](../../TASK.md)

Authority: every executable packet uses this contract. Checkboxes are acceptance criteria, not status; status lives only in `TASK.md`.

## Work-packet contract

One packet contains:

- one semantic owner or one public type family;
- one named defect, missing behavior, or duplicate owner;
- 2–5 focused positive/negative test groups; a group may be a table-driven
  matrix when one semantic rule has several required lanes;
- exact allowed files;
- exact focused and affected verification commands;
- one receipt stating reused, merged, removed, and still-open behavior.

Each packet definition below names its primary files. A worker must run `rg` for
callers before editing and add directly affected callers/tests to the packet
receipt; that discovery does not authorize unrelated cleanup. Production files
outside the named family require a packet update before they are changed.

Use these command tiers consistently:

- `F(<files>)`: `pnpm exec vitest run <files>` for the exact focused test files.
- `T`: `pnpm --filter flow-state check:cli-source-types`.
- `P`: `pnpm --filter flow-state build` to prove packed declarations and package output.
- `E`: `pnpm --filter @flow-state/launch-workspace test -- --run` after rebuilding `flow-state`.
- `D`: `pnpm docs:build` for documentation/status packets.
- `C`: `pnpm fmt && pnpm lint` immediately before the packet commit.
- `V`: `pnpm verify` only at phase closure or when a packet changes shared public
  types/runtime behavior broadly enough to affect the workspace.

An exact packet command list expands `F` to real paths and then lists the needed
tiers in order. Never report a tier as passed unless that exact command ran.

### Single-commit closeout

After implementation, review, and affected verification:

1. Write the immutable receipt and update the matching packet row and necessary
   top-status line in `TASK.md`.
2. Run `C`, stage exactly the packet's allowed files plus its receipt and
   `TASK.md`, then inspect `git diff --cached --name-only` and
   `git diff --cached --check`.
3. Create one commit containing the reviewed packet artifacts, receipt, and
   status transition. Verify that the commit introduced the receipt and matching
   transition.

The receipt records the exact Base commit but never embeds the SHA of the commit
containing itself. Its fixed `Commit proof` value is `derived-from-git-history`;
the containing commit SHA is obtained from Git history when needed. This avoids
self-reference while preserving exact, independently verifiable provenance.

P0.1a used the earlier two-commit closeout and remains valid historical evidence;
do not rewrite its receipt or commits.

Packet receipt template:

```text
Packet: <ID and title>
Dependencies: <packet IDs and receipt links>
Base commit: <bare 40-character commit SHA before packet work>
Base tree: <classified tree state>
Commit proof: derived-from-git-history
Files: <exact files in the packet commit, including this receipt and TASK.md>
Owner after change: <one semantic owner or type family>
Defect closed: <BUG-ID and observable failure>
Effect map: <services consumed/produced; exact A/E/R; Effect.fn operations>
Layer/lifetime: <succeed/effect/scoped; acquisition error; Scope/fibers/finalizers>
Native primitives: <Ref/SynchronizedRef/Deferred/FiberMap/Queue/etc. with reason>
Failure lanes: <typed failure/defect/interrupt/stale/cleanup/observer/invariant>
Reused: <existing implementation retained>
Merged/moved: <callers routed to owner>
Removed: <duplicate state/engine/code deleted, or none with reason>
Rejected clones: <bespoke Effect/DI/cache/queue/retry/time helper avoided or justified>
Compatibility: <calls/imports/aliases proved>
Tests added: <positive/negative names>
Commands: <exact commands and result>
Review: <thermo-nuclear findings, fixes, and rerun results>
Authority changes: <semantic or behavioral acceptance criteria changes and revalidation, or process-only with no semantic impact>
Still open: <explicitly deferred work and next packet>
```

Procedure:

1. Read the public call, owner, callers, tests, and Launch Workspace usage.
2. Add/strengthen the focused proof.
3. Make the smallest compatible correction.
4. Inspect Effect channels, cleanup, identity, stale work, type erasure, and duplication.
5. Apply the thermo-nuclear gate: delete needless wrappers/branches, select the
   native Effect primitive, check file/module health, and refactor after green.
6. Review the complete slice against the Effect blueprint, fix every blocking
   finding, and rerun focused/affected verification.
7. Write the immutable receipt and update the matching `TASK.md` packet row and
   necessary top-status line.
8. Run `pnpm fmt && pnpm lint`, stage the exact allowed files, inspect the staged
   allowlist and diff, then create one packet commit.
9. Verify from Git history that the commit introduced the receipt and matching
   status transition; derive that commit's SHA rather than embedding it.

Good early smaller-model packets:

- baseline commands/metrics;
- documentation/API-inventory truth reconciliation;
- keyed resource collision fixtures after P1A.2 fixes the identity contract;
- `flow.can` versus dispatch differential proof;
- transaction input-first inference fixture;
- stream pressure fixture;
- React Strict Mode lifecycle fixture.

Reserve a stronger model/reviewer for:

- transaction or stream generic architecture;
- exact Layer output/error/requirements inference;
- compatibility ownership for `flowTest(machine)`;
- resource-ref purity and canonical key encoding;
- migration of the test interpreter onto production owners;
- transaction stale-completion and atomic preview ownership;
- child contract reconciliation and any additive child type design;
- restore/hydration boundary decoding design.

### Packet routing for implementation models

| Route                       | Packets                                                                                                                                                                                                        | Handoff rule                                                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Smaller model               | P0.1a/P0.1c, P0.2, P0.5 inventory, P1A.2 test table after design, P2.3 after owners, P3B.2 tables, P3C.1 focused cases, P4B.2, P5.2/P5.3 mechanical proof                                                      | Give exactly one ready packet, named files, linked rows, commands, non-goals, and dependency receipts; stop on any owner/public-type decision |
| Medium implementation model | P0.1b, P1B.1/P1B.2, P1C.2, P3B.1 after ownership, P4A.1 API cleanup, P4B.1a after sources, P4D.2, P5.1                                                                                                         | Require focused red proof first and a strong review before the receipt closes                                                                 |
| Strong model plus reviewer  | P0.3/P0.4/P0.6, P1A.0/P1A.1/P1A.2 implementation/P1A.3b/P1A.4a-d, P1C.1/P1C.3a-b/P1C.4a-b/P1C.5, P1D.1a-c/P1D.3a-b, P2.1a-d/P2.2a-b/P2.4, P3A.1/P3A.2/P3B.3/P3D.1/P3D.2, P4B.1b-d/P4C.1a-c/P4C.2/P4D.1a-b/P5.4 | Own the design seam, compatibility, Effect channels, generations, and type architecture; leave bounded follow-up packets                      |

All models stop and update the packet instead of guessing when they discover:

- a public call/import would break;
- a second semantic owner would remain or be introduced;
- an Effect error/requirement/Scope/finalizer would be erased;
- a key, actor, binding, request, or generation identity is ambiguous;
- a negative type fixture fails for an unrelated reason;
- a packet needs production files outside its named family;
- baseline or affected verification was already red for a different reason.

## Receipt storage

Store one immutable receipt per completed packet under
`tasks/receipts/<packet-id>.md`. A receipt records the base commit, exact files,
red proof, exact commands and exit codes, review findings and fixes, dependency
receipts, and any change to semantic or behavioral acceptance criteria that
moved downstream packets to `needs-revalidation`. Git history identifies the
commit that introduced the receipt and matching status transition.
