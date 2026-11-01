# Code Archaeology (git + in-repo)

## What this source contains

- Commit history (messages, dates, authors, diffs)
- Plan decisions, Spec provenance, Task evidence, and their history
- Inline code comments, TODOs, FIXMEs, deprecation notes
- ADRs (architectural decision records) if the repo keeps them
- Tests. Names and assertions often encode the edge cases that motivated a change
- Related files modified in the same commits (co-change signal)
- CHANGELOG entries, release notes in the repo
- Local artifact references mentioned in commit messages and documentation

History ties recorded changes to code and artifacts. Missing or rewritten history remains a gap;
commit timing alone does not establish motivation.

## How to search it

Use local Git history when available; report missing history explicitly.

Expand the seed commit list:

```bash
# Full history of the file through renames
git log --follow --oneline -- <file>

# Pickaxe: commits that added or removed this exact text
git log -S '<exact_string_from_code>' -- <file>

# Or for patterns:
git log -G '<regex>' -- <file>

# Who wrote each line and when
git blame -L <start>,<end> <file>

# The full diff of a specific commit
git show <hash>

# Commits between two points affecting this file
git log <old>..<new> -p -- <file>
```

Look for out-of-band docs:

```bash
# ADRs often live in docs/adr/ or similar
rg -l -i 'architecture.decision' --glob '*.md'

# TODOs and FIXMEs near the target
rg -n -C2 '(TODO|FIXME|HACK|XXX|NOTE)' <target_file>

# Related tests. Names often encode the "why"
rg -l '<symbol>' --glob '*test*'
```

## What good evidence looks like here

- A Plan decision recording the problem, chosen approach, and rejected alternatives
- A local design note or commit message explaining the constraint that motivated the change
- An inline comment near the target line that explains a non-obvious constraint
- A regression check showing the failure the change addresses; motivation still needs evidence
- A commit message referencing a local Task, decision, or incident record
- A CHANGELOG entry that summarizes the user-visible rationale

## Common pitfalls

- **Squashed or rewritten history.** Individual commits may be lost. Read local records and
  acknowledge missing lineage rather than inventing the original sequence.
- **Misleading commit messages.** "Small refactor" sometimes hides an intentional behavior change.
  Look at the diff, not the message.
- **Cargo-culted patterns.** The author may have copied a pattern without understanding why. Check
  if the pattern originated earlier in the codebase and investigate *that* commit.
- **Bot commits and auto-merges.** Dependabot, Renovate, and automated backports usually don't carry
  motivation. Skip them when trying to find intent.
- **Treating code as evidence of intent.** The code itself isn't evidence for why it exists.
  Evidence comes from commit messages, decisions, explicit comments, and local notes.
  Don't use a function name as proof of intent.

## What to return

Every relevant commit, artifact, or comment, with:
- The exact text (quoted)
- The commit hash, artifact reference, or file:line
- Author and date
- Whether it's direct (explicitly addresses the question) or circumstantial

## Workflow artifacts

Read relevant Plans, Tasks, Specs, and their history when available. Follow precise decision and
requirement references. Distinguish a contemporary rationale from a later explanation or a current
contract. Preserve source revision, authorship, and date where available. Do not invent artifact
placement; use supplied paths and the project's existing discovery tools.
