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
- `C`: `pnpm fmt && pnpm lint` immediately before the Packet commit.
- `V`: `pnpm verify` only at phase closure or when a packet changes shared public
  types/runtime behavior broadly enough to affect the workspace.

An exact packet command list expands `F` to real paths and then lists the needed
tiers in order. Never report a tier as passed unless that exact command ran.

### Two-commit closeout

Exactly two commits close a packet:

1. The single **Packet commit** is the reviewed commit containing all packet
   artifacts and any expressly authorized process-authority amendment. It
   excludes the receipt and packet status transition. Complete focused/affected
   verification and review first, then run `C` immediately before creating this
   commit. Its parent must be the exact recorded Base commit.
2. After the Packet commit exists, create the immutable receipt with its exact
   SHA and transition the packet to done in `TASK.md`. Run a format/check scoped
   to the closeout files, then create the metadata-only **Closeout commit** as
   the direct child of the Packet commit. No commit may intervene.

The Closeout commit may contain only `tasks/receipts/<packet-id>.md`, the
matching packet-row and top-status transition in `TASK.md`, and an
already-authorized generated receipt index if one exists. Format only the exact
closeout files, stage only that allowlist, compare
`git diff --cached --name-only` exactly with it, run
`git diff --cached --check`, and inspect the cached diff before committing. This
cached check includes a newly created, previously untracked receipt. Do not
rerun or alter Packet commit artifacts during metadata closeout.

After committing, verify from Git history that Base is the Packet commit's
parent, Packet is the Closeout commit's parent, the receipt was introduced by
the Closeout commit, and its diff contains only the atomic matching `TASK.md`
packet-row/top-status transition. Neither commit may be amended. Before the
Closeout commit exists, repair/retry its metadata; if a malformed Closeout
commit exists, stop for explicit recovery because amendment and a third commit
are forbidden.

For the current two-file closeout, the mechanical gate is:

```sh
receipt=tasks/receipts/<packet-id>.md
base_sha="$(sed -nE 's/^Base commit: ([0-9a-f]{40})$/\1/p' "$receipt")"
packet_sha="$(sed -nE 's/^Packet commit: ([0-9a-f]{40})$/\1/p' "$receipt")"
test "$(git rev-parse "${packet_sha}^")" = "$base_sha"
test "$(git rev-parse HEAD)" = "$packet_sha"
pnpm vp fmt --check TASK.md "$receipt"
git add -- TASK.md "$receipt"
printf '%s\n' TASK.md "$receipt" | sort | diff -u - <(git diff --cached --name-only | sort)
git diff --cached --check
git diff --cached -- TASK.md "$receipt"
```

If formatting fails, run `pnpm vp fmt TASK.md "$receipt"`, then repeat the
entire gate. Add an already-authorized generated receipt index to both exact
allowlists when one exists. After the Closeout commit, verify:

```sh
receipt=tasks/receipts/<packet-id>.md
base_sha="$(sed -nE 's/^Base commit: ([0-9a-f]{40})$/\1/p' "$receipt")"
packet_sha="$(sed -nE 's/^Packet commit: ([0-9a-f]{40})$/\1/p' "$receipt")"
test "$(git rev-parse "${packet_sha}^")" = "$base_sha"
test "$(git rev-parse HEAD^)" = "$packet_sha"
printf '%s\n' TASK.md "$receipt" | sort | diff -u - <(git diff-tree --no-commit-id --name-only -r HEAD | sort)
test "$(git diff --name-only --diff-filter=A HEAD^ HEAD -- "$receipt")" = "$receipt"
git diff --unified=0 HEAD^ HEAD -- TASK.md "$receipt"
```

Packet receipt template:

```text
Packet: <ID and title>
Dependencies: <packet IDs and receipt links>
Base commit: <bare 40-character commit SHA before packet work>
Base tree: <classified tree state>
Packet commit: <bare exact 40-character reviewed artifact commit SHA>
Closeout proof: derived-from-git-history
Packet files: <exact files in the Packet commit>
Closeout files: <this receipt, matching TASK.md packet row and necessary top-status line, and authorized generated index if one exists>
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
7. Run `pnpm fmt && pnpm lint` immediately before creating the Packet commit;
   require current `HEAD` to equal Base, exclude receipt/status, create without
   amendment, and verify its parent is Base.
8. Write the immutable receipt with the exact Packet commit SHA, update the
   matching `TASK.md` packet row and necessary top-status line, then run the
   exact cached metadata gate above.
9. Require current `HEAD` to equal Packet, create the Closeout commit without
   amendment, and run the post-commit history checks above.

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
`tasks/receipts/<packet-id>.md`. A receipt records the base commit, exact Packet
commit, Packet and Closeout file sets, red proof, exact commands and exit codes,
review findings and fixes, dependency receipts, and any change to semantic or
behavioral acceptance criteria that moved downstream packets to
`needs-revalidation`.
Process-only closeout amendments record that they changed no packet semantics
and require no downstream revalidation. The receipt is immutable once introduced
by the Closeout commit.
