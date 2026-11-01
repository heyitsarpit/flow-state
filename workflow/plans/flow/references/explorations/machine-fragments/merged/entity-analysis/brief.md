# Brief: making entity domains statically analysable (merge 5)

Status: brief for a proposal, written 2026-10-30. The proposal itself goes in `proposal.md` beside this file.

## Why

Entity domains are only partly analysable. Their declarations are **recorded** by calling each recorded function
once, at construction, with recording proxies (`references/design/entity-domain.md:330-344`). That has five gaps:

1. **Logic in recorded positions** (`?:`, `&&`, `||`, `if`) silently records one branch. It is "not detectable by
   the proxy or the types" (`entity-domain.md:477`); the only guard is a mandatory `flow check` source scan.
2. **Runtime functions are opaque:** `.predicts` field values (`likes: (i) => i.likes + 1`) and `listen(...).as`
   mappings; tools see only the declared effect (`entity-domain.md:339`).
3. **Server behaviour** (a filter with no input, an undeclared side effect) cannot be seen statically
   (`entity-domain.md:148-152`); only audit mode and `propertyTest` catch it.
4. **Machine and domain are analysed separately:** `flow check` does not join event → commit → predicted fields →
   repaired answers → reading views (merge 4, finding A-L2).
5. **"Static" requires constructing the App**, running module code, unlike the rest of Flow's analysis.

Gap 3 is out of scope: no client-side tool can see server behaviour.

## What to explore (the owner's agreed scope)

1. **A small, exact operator set for recorded positions.** `when(cond, a, b)`, `or`, `not` (with the existing `and`,
   `eq`, `oneOf`, `contains`, `between`, `overlaps`), numeric comparison and arithmetic (`gt`, `lt`, `add`, `sub`, …),
   null handling (`coalesce`, `isNull`). The constraint: every operator usable in a **condition** must evaluate on the
   client exactly as the server does, because the client decides repairs from conditions. No string transforms,
   locale comparison or date logic beyond exact equality: those stay `serverMatches`.
2. **Recorded predicted values.** `.predicts` field values written with operators, e.g.
   `likes: add(field("likes"), when(eq(input.liked, field("liked")), 0, when(input.liked, 1, -1)))`, so tools see how
   a field changes. An opaque function stays allowed for real data work (list edits such as `addReaction`) and is
   shown as opaque. Decide the same for `.as` mappings.
3. **Analysis from source.** `flow check` reads domain declarations through the TypeScript AST, like the rest of
   Flow, instead of (or as well as) recording proxies. The `?:` / `&&` scan becomes a lint with a fix-it.
4. **Machine and domain joined** in `flow check`: event → commit value → the record fields its write predicts →
   the answers it repairs → the views that read them.
5. **A spike** proving 1–3 on the reference domains: write them with operators, record them, read them from source,
   and check that both descriptions agree.

## Hints

- **Prior art:** TanStack DB's query builder (`query/builder/ref-proxy.ts`, `query/ir.ts`), which the design already
  cites (`entity-domain.md:1122`); it has `and`, `or`, `not`, comparison, `add`, `coalesce`, `concat`, `upper`,
  and evaluates the IR client-side. Check what it evaluates exactly and what it cannot.
- **Reference domains:** dispatch-desk's `references/dispatch-desk/features/Tickets/ticket.domain.ts`; the `Issues`
  domain in `merged/entities.md` 3.1; the examples in `references/design/entity-domain-examples.md`.
- **The design to amend:** `EntityDomains.plan` O1 (recorded positions, predicts, the "one expression" rule),
  `references/design/entity-domain.md` sections 2.3, 4.1–4.7 and 7.2, and `CommandLine.plan` (`flow check`,
  `flow explain`, `flow graph`).
- **Accepted context:** `machine-fragments/machine-design.md` (merged design, server calls 2.7) and
  `machine-fragments/merged/entities.md` (accepted: who owns a write, lane keys from `.predicts`, rules
  26–38). Merge 4's rule 34 reads the key from `.predicts`; recorded predictions should keep that working.
- **Effect 4.0.5** is installed at the repository root (`node_modules/effect`), with TypeScript; a spike can use the
  TypeScript compiler API from `node_modules/typescript`.
- **Principles:** correctness first; statically analysable; one runtime; fewer concepts; standard upfront contracts
  over clever hybrids; errors carry information, never configuration.

## Questions the proposal must answer

- The exact operator list, each with its client semantics, its null behaviour, where it may appear (condition,
  order, predicted value), and why any candidate was left out.
- Whether recording proxies stay (runtime IR) beside source analysis, or source analysis replaces them; what happens
  when the two disagree.
- How a recorded predicted value is evaluated at write start and replayed over each new base (EntityDomains O1), and
  whether operator-built values change any repair or ordering rule.
- What stays opaque, how tools show it, and what `flow check` can still promise about it.
- What the machine-to-domain join shows, and how it is computed without running the App.
- Migration: what existing domain code changes, line by line, on the reference domains.
