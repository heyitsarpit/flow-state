# Flow State

## Where things live
- `workflow/plans/flow/` — current plans. Proposals are in `references/explorations/`.
- `workflow/plans/archive/`, `reference/`, Beads — historical. Read-only.
- `packages/flow-state-rewrite/` — the rewrite. `packages/flow-state/` — frozen, never edit.
- `apps/docs/`, `apps/features/` — docs. Generated files are produced by commands; don't hand-edit them.
- `codebases/effect-v4/` — Effect reference. Installed packages are what's authoritative.

## Commands
Use the pinned `nub` toolchain. See `package.json` for scripts.
```sh
nub run check        # format, lint, types
nub run check:fix    # lint + format fixes
nub run test
nub run docs:build   # public API or docs changes
nub run verify       # full gate; don't claim full verification without it
workflow check       # see .agents/skills/workflow-cli/SKILL.md before editing Workflow records
```

## Working with Arpit

### Talking
- Answer the question asked first. Don't act on it until I say go.
- Be short. When I'm tired, give one example with comments on the lines I should look at.
- Handoffs and next steps: 5–10 lines, with exact file paths, in order.
- Work on one thing at a time. Tell me about background work only once it's finished.

### Showing designs
- Show code. Give small before/after examples that are complete: definition, machine, and fragment written in full, no `…`.
- Mark every keyword: say whether it's **new**, **renamed**, existing, or user-defined.
  `// NEW: armOn   // user-defined: Unsettled   // existing: on`
- List what's added as well as what's dropped.
- Start from where the data comes from. Show how the value gets from the real API (fetch, SDK, AbortController) into ours. Flow is not a network library.
- Make it general. Test it against many very different real-world cases, not one example.

### API judgement
- Order of priority: correctness first, then how easy the code is to read at a glance, then agent UX. Prefer standard upfront contracts to clever hybrids.
- Locality: a property sits next to the thing it describes.
- Don't leak internal wiring (ids, keys, timers) into user code.
- Follow Effect/Schema conventions. Check prior art first (Effect, TanStack DB, XState, research).
- Don't break static analysis, the single graph or runtime, Stories, or CLI inspection. Truth is a compilation target.
- Exercise abstract thinking and consider the broad implications of any API or feature change for the rest of the system. Tell agents to do the same.
- Question whether each addition is worth it. Cutting scope for correctness is fine.
- Design by convergence. Fixing findings one review at a time solves problems in increments and leaves case-by-case rules. So run the reviews first; once several rounds have surfaced the problems, gather every requirement and finding at once and redesign from scratch for one API that handles all of them, keeping the current draft as prior art. A holistic API is only possible after that iteration.

### Decisions and files
- Ask me in numbered rounds: options, before/after, your recommendation. I reply with `Q1 A`. Write down only what I confirm.
- Never present something as decided unless I accepted it. Mark everything else as proposed.
- Before you edit, delete, or merge into a plan, list the change and wait for my yes.
- Put new ideas in a new proposal file. Don't overwrite one. Superseded proposals stay as prior art.
- Deferred items go in `revisit.md`.
- Commit only when I say. "Commit first" means commit before you change anything. Never push unless asked.
- Run the linter and formatter when you're done changing code.

### Agents
- You decide. Reviewer findings are advice, and you have the most context.
- Opus: design, proposals, from-scratch redesigns, and reviews (one Opus covers correctness and real code against the proposal; flag hacks and faked features). Sonnet: simple coding work, such as executable models. Haiku: research fan-out only.
- Lenses (correctness, simplicity, agent UX, generality, consistency, semantics, type spike) are for judging proposals, not for shaping them.
- From-scratch agents get the problem and the gaps, not the old draft, so they don't inherit its assumptions.
- Watch usage limits. Check that running agents are actually making progress.
