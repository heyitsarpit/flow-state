---
name: playbook-improve-skills
description: >-
  Improve this skill library or a project's skills: learn from a session, write or revise a package,
  and prove the change with trials in Codex and Claude Code. Use for "reflect", "write a skill",
  "fix this skill", or "does this skill actually work?".
metadata:
  kind: playbook
  uses: [reflect, eval]
  applies:
    - principle-design-for-verification
    - principle-enforce-with-structure
    - principle-claim-only-what-you-checked
    - policy-writing
    - policy-authority
    - policy-delegation
---

# Improve Skills

This playbook improves skills: this skill library's, or a project's own. It turns a session's
lessons into changes, writes or revises a package, and proves the change with trials in Codex and Claude Code.
It ends when the approved changes are applied and validated, with trial evidence for any change in
behavior. Committing and publishing follow `policy-authority`.

You read sessions, the packages involved, and, when editing this library, its `DESIGN.md`. You write
package edits, new packages, checks, or preference blocks, each only after the user approves it.

This page is an outline. Each part names a skill that holds the actual method. Open that skill's
`SKILL.md` in the folder beside this one (`<skills-root>/NAME/SKILL.md`), along with the principles
and policies in its `metadata.applies`.

## Pick the entry

| Starting point | Parts |
|---|---|
| A session with lessons ("reflect") | Learn → Write → Prove |
| An idea for a new or changed package | Write → Prove |
| A doubt ("does this skill work?") | Prove |

## Learn

Run `reflect` on the session. It proposes where each lesson belongs and waits for the user's
approval before applying anything.

## Write

1. **Read first:** the purpose the user asked for, the existing package, `DESIGN.md`, and the
   packages that already own related rules. Extending an existing owner is usually better than
   adding a package that overlaps it.

2. **Define the package.** State its kind (router, entry point, playbook, principle, policy, or
   skill), what triggers it, who reads it, its inputs, what it may write, what it returns, and how
   you would know it worked. Before drafting, write down a few realistic requests and the success
   and failure you would observe for each; they become the trials in Prove.

3. **Draft under `policy-writing`.** Lead with what the reader should do. Name the actual paths and
   supported commands. A skill holds its whole method in its `SKILL.md`; references hold depth
   that is optional or only needed in some cases. List principles and policies in
   `metadata.applies`, and in a playbook, list its skills in `metadata.uses`. A skill never
   requires another procedure skill.

4. **For a substantial rewrite, account for every obligation.** First list each obligation in the
   old text. Then mark each one as kept, moved, or dropped with a reason, and have an independent
   checker compare that list with the new text. Rewrites lose rules quietly; the list makes the
   losses visible.

5. **Prefer enforcement.** When a rule keeps being broken, add a check
   (`principle-enforce-with-structure`) instead of more prose. Keep proposals, accepted guidance,
   and structural enforcement distinct.

6. **Write and validate.** In this library, packages live in `suites/workflow/<name>/SKILL.md` in
   the skills repository, and the validator runs from its root:

   ```bash
   uv run -q --with pyyaml python scripts/validate-suite.py
   ```

   It checks frontmatter, names, kinds, links, and invocation policy. For another project, put the
   package where that project already keeps its skills and run whatever checks it has. If it has
   no established location, ask the user where the package belongs, and if it has no validator,
   check the frontmatter and links by hand and say so. Either way, preserve unrelated metadata, do
   not invent platform configuration formats, run every new executable helper, read the full diff,
   and recheck each package you corrected. Passing validation shows the package is well formed,
   not that it changes behavior.

## Prove

Run `eval` with small, realistic trials in both harnesses. Judge from what the agents did, not
from what they reported. A behavior claim stays open until a trial exercises it.

If you delegate a step, apply skill:policy-delegation and hand over the installed
skill paths, not the names.

## What to return

Give the packages you changed or added and their revisions, the existing packages you extended,
and the instructions that now change agent behavior. Add the validation output, the trial results
and their limits, and the next step you recommend.
