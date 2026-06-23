# Plan 00 [Planning and reference split]

## Purpose

Create a durable planning structure that future work can follow without reading the whole conversation.

## Scope

- Split the monolithic plan into separate procedural documents.
- Keep goals, state, and phased plans in `planning`.
- Keep user-facing reference material in `docs` and `apps/docs`.
- Keep local research snapshots ignored.

## Tasks

- Replace the single broad plan file with goals, state, and phased plan files.
- Add a quick library reference file with imports, interface inventory, and descriptions.
- Add a docs framework decision note.
- Adjust ignore rules so user-facing docs can be tracked while local snapshots stay ignored.
- Set up Vocs as the docs app.
- Run formatting and checks.
- Commit the planning/docs structure.

## Acceptance Criteria

- Planning files contain procedure, not implementation.
- Docs app builds.
- Local research snapshots remain ignored.
- Checks pass.
- Git status is clean after commit.

## Out Of Scope

- Runtime implementation.
- Example implementation.
- Final API freeze.
