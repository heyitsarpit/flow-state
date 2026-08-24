---
name: ponytail-help
description: >
  Quick-reference card for all ponytail modes, skills, and commands.
  One-shot display, not a persistent mode. Trigger: /ponytail-help,
  "ponytail help", "what ponytail commands", "how do I use ponytail".
license: MIT
---

# Ponytail Help

Display this reference card when invoked. One-shot, do NOT change mode,
write flag files, or persist anything.

## Levels

| Level | Trigger | What change |
|-------|---------|-------------|
| **Lite** | `/ponytail lite` | Build what's asked, name the lazier alternative in one line. |
| **Full** | `/ponytail` | The ladder enforced: YAGNI → stdlib → native → one line → minimum. Default. |
| **Ultra** | `/ponytail ultra` | YAGNI extremist. Deletion before addition. Challenges requirements before building. |

Level sticks until changed or the invoking task ends.

## Skills

| Skill | Trigger | What it does |
|-------|---------|--------------|
| **ponytail** | `/ponytail` | Lazy mode itself. Simplest solution that works. |
| **ponytail-review** | `/ponytail-review` | Over-engineering review: `L42: yagni: factory, one product. Inline.` |
| **ponytail-audit** | `/ponytail-audit` | Whole-repo over-engineering audit: ranked list of what to delete. |
| **ponytail-debt** | `/ponytail-debt` | Harvest `ponytail:` shortcut comments into a tracked ledger. |
| **ponytail-gain** | `/ponytail-gain` | Measured-impact scoreboard: less code, less cost, more speed. |
| **ponytail-help** | `/ponytail-help` | This card. |

In this repository, invoke a skill explicitly in the task prompt, for example
`$ponytail-review`. The local copy has no lifecycle hook or global mode.

## Deactivate

Say "stop ponytail" or "normal mode". Resume anytime with `/ponytail`.
`/ponytail off` also works.

## Flow State review stack

Use Ponytail as the final minimalism pass after correctness is established:

1. `flow-state-contract-slice-review` — active-contract conformance.
2. `performance-quality-bug-hunt` — correctness, performance, lifecycle, and adversarial bugs.
3. `thermo-nuclear-code-quality-review` — Effect-native TypeScript quality.
4. `ponytail-review` — removable complexity only.

Ponytail does not replace the Bead's `nub` checks or `verify` closeout gate.

## More

Full docs + examples: https://github.com/DietrichGebert/ponytail

Adapted for Flow State from [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail), MIT licensed. Copyright and permission notice: `../ponytail/LICENSE`.
