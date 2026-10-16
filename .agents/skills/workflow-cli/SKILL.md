---
name: workflow-cli
description: Read and mechanically edit workflow Plans, Tasks, and Specs.
disable-model-invocation: true
metadata:
  kind: procedure
---

Run `workflow --help` first. Use command help for syntax.
Run from the repository root, or pass `--root DIR`.

Read files for prose and surrounding syntax. Query the CLI for readiness and relationships.
Ready Tasks require Task status `open`, owning Epic status `active`, and satisfied blockers.
`workflow check` validates records; confirm readiness with `workflow next` or `show --why`.
Read Plans directly. Plan objects and Spec bodies require direct edits.
CLI help describes commands, not the artifact grammar.
For unfamiliar sections, read [the syntax starter](syntax.md) or a valid existing artifact.
Use CLI commands for creation, short field edits, and graph links.
For task label edits, repeat `--set labels=backend --set labels=recovery`. This replaces the list.
Repeat other fields only when their documented syntax permits it.
Edit files directly for structure or surgical prose changes.
Preserve IDs, nesting, and unrelated text.
Put notes, tables, and resources inside supported text blocks. Do not invent schema fields.

Use `--file FIELD=PATH` for whole-field replacement from a file.
Use `--file FIELD=-` with a quoted heredoc for new text. Only one field can read stdin per command.
Read the existing field before replacing it. Input paths resolve from the current directory.

After a coherent batch of actual record writes, run `workflow format PATH --write` for each changed
artifact. Substitute its actual path for `PATH`. Then run `workflow check`.
Skip write-mode formatting for read-only work.
Review the diff. Preserve formatter-produced continuation whitespace.
Spec creation updates the index. After moving a Spec, run `workflow index` before checking.
If invalid state blocks the CLI, read its diagnostics and repair the source directly.
If an edit is refused, inspect the files before retrying. Do not assume any change persisted.
If a valid edit remains refused, edit the field directly, then format and validate it.
Preserve acceptance detail; do not weaken the text to work around a mechanical refusal.

Preview import, cleanup, and migration with `--dry-run` before writing.
