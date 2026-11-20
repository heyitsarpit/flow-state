---
proposal conventions
status accepted user 2026-11-16
    proposed 2026-11-16
---
# Conventions: a folder that teaches the idiomatic way

**Bottom line:** start `wiki/conventions/`, one page per idiomatic way of doing something in Flow, each
with the problem, the rule, a before and after, and why. It is seeded from the conventions the user accepted in
`ui-primitives-decisions`; fixtures and Tasks cite its pages; the public docs' guides are rebuilt from
it once the API it uses is built. Accepted (the user, 2026-11-16): §5's four answers, all A.

**Why now:** the UI-primitives review ended with more conventions than features (Q4, Q6, Q7, Q8, W8). They live
only in a decisions log, and the docs' guides (`apps/docs/src/pages/guide/patterns.md`, `recipes.md`, last changed
2026-07-03) teach the old API (`flow.after`, `submit`, `useResource`).

**Read first:** `ui-primitives-decisions` §3, §5 to §8, `revisit.md` ("Refresh the reference apps").

## 1. Where it lives

- **A `wiki/conventions/` (recommended):** next to the Plans and Specs; Tasks and fixtures cite it. Not public until
  the docs are rebuilt.
- **B `apps/docs/src/pages/guide/`:** public at once, but it would teach API that is not built, beside stale guides.
- **C inside `packages/flow-state-v3/`:** ships with the code, but the package holds code, not prose.

## 2. A page

Each page is plain Markdown, lines at most 120 characters, and follows one shape:

1. **The rule**, in one sentence (the bottom line).
2. **When it applies**, with the real data source (fetch, SDK, the DOM).
3. **Before and after**, complete and small, keywords marked existing or user-defined.
4. **Why**, and what goes wrong otherwise (the bug, not the style).
5. **Prior art**, with file:line where a codebase in `codebases/` has it.
6. **Status:** which parts rest on API that is accepted but not built yet.

## 3. First pages (from the accepted decisions)

- `where-a-value-lives.md` (Q5's rule of thumb, W8): input, props, memory, context; R1 to R6.
- `interaction-state.md` (Q4): frame-rate data in refs; milestones in a local actor; send `Move`, not a list.
- `view-commands.md` (Q3): a one-shot command is an emit, never a stored request.
- `controlled-values.md` (Q5f): a parent-owned value is a prop paired with an emit.
- `app-actions.md` (Q6a): app actions are Effect services in the one Runtime Layer.
- `what-an-ending-knows.md` (Q6b, Q6c): ids ride the call's input; view flags come from props or memory.
- `reusable-primitives.md` (Q8): a library primitive is a factory over the app's contract.
- `cross-tab-bridge.md` (Q7, deferred): host code, emit out, decoded send in, no echo.

## 4. Upkeep

- A convention the user accepts in a decision round gets a page in the same change; the decisions log links to it.
- A page whose API changes is updated with that change; its Status line says what is not built yet.
- Fixtures and Task descriptions cite pages (`code:wiki/conventions/<page>.md`) instead of repeating rules.
- When the API a page uses is built, the docs' guide is rebuilt from the page.

## 5. Decisions for the user

1. **Location:** A `wiki/conventions/` (recommended), B the docs' guides now, or C inside the package.
2. **First pages:** the eight in §3 (recommended), or start with `where-a-value-lives.md` alone.
3. **Upkeep:** the four rules in §4 (recommended).
4. **Stale guides:** leave `apps/docs/src/pages/guide/patterns.md` and `recipes.md` until the rebuild, and add a
   `revisit.md` line (recommended), or delete them now.

Answered (the user, 2026-11-16): 1 A, 2 A, 3 A, 4 A. The folder is `wiki/conventions/` with the eight pages; the
stale guides wait for the rebuild (`revisit.md`).
