# Feature inventory (prototype)

An internal, throwaway, read-only inventory of the new Flow State design, to be folded into the docs later.
Same stack as `apps/docs` (Vocs 2.1.5, Waku, React 19). Plain MDX: no components, no build step.
Only Definition and Machine are written; the other areas show as "(later)" in the sidebar.

## Run

After `nub install` has registered this workspace (it updates `nub.lock`):

```sh
nub run --filter @flow-state/features dev       # http://127.0.0.1:5174
nub run --filter @flow-state/features build
```

## Page shape

1. `# Area` and one sentence.
2. Two or three `## Example: <name>` sections: one line of text at most, then a complete snippet with short comments.
3. `## Keywords`, then one `### <keyword>` per keyword in the order the examples meet them:
   **What** (one sentence), **Why it exists** (one sentence), an optional 2-6 line snippet for a use the examples miss,
   at most two bullets, and `<small>Source: Machines O2 · machine-design 2.5</small>`.
   A plan/design disagreement gets one plain sentence in a bullet. The plan wins.

Headings are real markdown, so the right-hand "On this page" outline lists every example and keyword.
Sources: `Machines.plan` and `machine-design.md` under `workflow/plans/flow/`.

## Add an area page

1. Create `src/pages/<area>.mdx` in the shape above.
2. In `vocs.config.ts`, give the area in the `areas` list a `link: "/<area>"`.
