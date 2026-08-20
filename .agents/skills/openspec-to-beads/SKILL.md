---
name: openspec-to-beads
description: Convert an approved OpenSpec change into a validated, traceable Beads execution graph. Use when the user explicitly asks to convert, import, or hand off an approved OpenSpec change to Beads; do not use for ordinary OpenSpec planning or implementation.
license: MIT
metadata:
  author: adapted from lucastamoios/celeiro
  source: https://github.com/lucastamoios/celeiro/tree/master/.claude/skills/openspec-to-beads
  version: "2.0"
---

# OpenSpec to Beads

Bridge approved OpenSpec planning into executable Beads work while preserving
requirement, source, and dependency traceability.

OpenSpec is the authority for intended behavior and scope. Beads is the
mutable execution graph. Do not treat either tool as a substitute for the
other, and do not silently invent requirements while converting.

## Activation boundary

Activate only when the user explicitly authorizes conversion or handoff, for
example:

- "Convert this approved OpenSpec change to Beads."
- "Create Beads issues from this OpenSpec change."
- "Hand this change off for execution."
- An implementation request that explicitly includes OpenSpec-to-Beads conversion.

Do not activate for:

- exploring an idea;
- creating or revising an OpenSpec proposal;
- viewing or validating specs only;
- implementing code from an already-created Beads issue.

Conversion authorization does not authorize code changes, task claiming,
closing issues, archiving OpenSpec changes, commits, pushes, or Dolt sync.

## Current command vocabulary

Do not use the old community-recipe commands or flags:

- Do not run `openspec apply <change>`.
- Do not use `/openspec:proposal` as the current workflow name.
- Do not use `bd create --discovered-from`.
- Do not run mandatory `bd sync`, `git commit`, `git push`, or `bd dolt push`.
- Do not run `bd init --prefix ...` as an automatic recovery action.

Use the installed CLI's help and JSON output as authoritative. In this
repository, the terminal equivalents are:

```bash
openspec list --json
openspec context --json
openspec status --change <change> --json
openspec instructions <artifact> --change <change> --json
openspec validate --all --json

bd prime
bd where
bd doctor --json
bd list --json
bd ready --json
bd show <id> --json
```

For Beads dependencies, use either:

```bash
bd create ... --deps discovered-from:<id>
bd dep add <child-id> <parent-id> --type blocks
```

Confirm exact flags with `openspec --help` and `bd <command> --help` before
using them. Prefer `--json` for output that the agent must parse.

## Conversion workflow

### 1. Establish the resolved roots

Run `bd prime`, `bd where`, `bd doctor --json`, `openspec context --json`, and
`openspec list --json`.

If either tool is missing, the resolved root is invalid, or Beads has no
usable database, stop and report the exact condition. Do not initialize,
repair, delete, or migrate project state without explicit authorization.

Resolve the change from `openspec list --json`. Do not assume that the current
directory, `openspec/changes`, or a fixed artifact path is the authoritative
root. If a registered OpenSpec store is selected, preserve its `--store`
option on every command that accepts it.

### 2. Read and validate the complete change

Run `openspec status --change <change> --json`, then use its returned
`changeRoot`, `artifactPaths`, `actionContext`, and dependency information.
Read the completed artifacts in dependency order:

1. `proposal.md` — intent, scope, and non-goals;
2. delta specs — requirements and scenarios;
3. `design.md` — implementation boundaries and decisions;
4. `tasks.md` — proposed executable work.

Use `openspec instructions` when the status output says an artifact is
required or when the schema uses a nonstandard artifact. Never assume the
default `spec-driven` artifact set if `schemas --json` says otherwise.

Before creating Beads, check:

- `openspec validate --all --json` passes;
- every requirement has at least one meaningful scenario;
- every task maps to a requirement or an explicit design decision;
- no task expands approved scope;
- `ADDED`, `MODIFIED`, and `REMOVED` deltas are used correctly;
- the design does not contradict the specs.

If a normative gap prevents a truthful task, stop before writing Beads and
report the gap. Do not manufacture generic work such as monitoring,
rate-limiting, rollback, or deployment tasks unless the accepted spec or
approved design requires it. Clearly evidenced implementation discoveries
may become `discovered-from` follow-ups only after conversion is underway.

### 3. Use bounded contract audits when migrating legacy contracts

For a contract migration, divide the source pack into bounded, non-overlapping
chunks. Subagents may read contracts and return proposals, but they must not
write OpenSpec or Beads. The lead agent reconciles their reports, resolves
conflicts, and owns all writes.

For this Flow State contract migration:

- `revision-spec/accepted/**` overrides a direct conflict in the contract pack;
- untouched contract clauses remain authoritative;
- legacy files under `reference/incident-console/implementation/tasks/**` are
  evidence only and are ignored as task authority;
- preserve accepted wording and source provenance;
- do not add semantics because a common software task seems useful.

Do not create Beads until the lead agent has written and validated the
corresponding OpenSpec artifacts.

### 4. Map OpenSpec content into Beads

Use an epic plus coherent child issues. Do not copy every checkbox one-to-one
when several tasks share an owner, proof, or atomic implementation boundary.

| OpenSpec source | Beads destination |
|---|---|
| `proposal.md` | Epic description, context, scope, and non-goals |
| Requirement | Child description and acceptance criteria |
| Scenario | Concrete acceptance/proof case |
| `design.md` | Child design notes and ownership boundary |
| `tasks.md` | Child issue title, implementation steps, and ordering |
| OpenSpec dependency | Beads dependency edge |
| Contract source heading | Metadata and description provenance |

Every created issue should include:

- a precise title;
- `--description` with scope and context;
- `--acceptance` with observable completion conditions;
- `--design` when implementation decisions matter;
- `--type`, `--priority`, and labels;
- `--spec-id` pointing to the OpenSpec capability or specification;
- metadata containing the OpenSpec change, artifact, requirement/task IDs,
  source paths, and source hashes where practical.

Use `--parent <epic-id>` for hierarchy. Use dependency types deliberately:

- `blocks` for required ordering;
- `parent-child` for ownership hierarchy;
- `discovered-from` for work found while implementing another bead;
- `related` when work is connected but independently executable.

Do not turn parallel work into a blocking chain merely because it appears
later in `tasks.md`.

### 5. Make creation resumable and auditable

Before writing, produce a dry-run plan containing proposed titles, source IDs,
parents, dependencies, priorities, and labels. Check existing Beads using
metadata, `bd list --json`, `bd search --json`, and `bd find-duplicates` where
available.

If a matching bead already exists, update only when the user authorized
reconciliation; otherwise reuse it and record the mapping. Never duplicate
issues after an interrupted run.

Use normal `bd create` calls for rich descriptions and metadata. `bd batch` is
transactional but intentionally supports only a narrow command subset, so use
it only for supported bulk operations such as simple creates, dependency
edges, or status updates.

Do not use formulas, molecules, or swarms for the first conversion unless the
user explicitly requests them. They are appropriate for a stable, repeatable
workflow, not for discovering the shape of this contract migration.

### 6. Verify the handoff

After creation, run:

```bash
bd lint --json
bd graph --json
bd ready --json
bd list --status=open --json
```

Check that:

- the epic exists and has the expected children;
- every child has acceptance criteria and OpenSpec provenance;
- dependencies form a valid DAG;
- no expected child is accidentally blocked;
- no duplicate or speculative issue was created;
- the Beads graph covers every approved OpenSpec task;
- every Beads issue maps back to an approved OpenSpec source.

Do not claim implementation completion. Do not claim OpenSpec archival or
spec synchronization. Leave issues open and unclaimed for the execution
agent unless the user separately authorizes claiming.

## Failure and handoff report

Report:

1. OpenSpec change and resolved root;
2. validation result and any rejected artifacts;
3. epic ID and child bead IDs;
4. source-to-bead mapping and dependency summary;
5. skipped, blocked, duplicate, or unresolved items;
6. exact verification commands and their results.

If the run stops partway through, report what was written and what can be
resumed. Do not delete partial work automatically.

## Completion boundary

This skill ends after a validated Beads graph and handoff report. The next
agent may use `bd ready`, inspect a bead, claim it with `bd update <id> --claim`,
implement code, run proofs, and close it when actually complete. OpenSpec
`apply`, `verify`, `sync`, and `archive` remain separate lifecycle actions.
