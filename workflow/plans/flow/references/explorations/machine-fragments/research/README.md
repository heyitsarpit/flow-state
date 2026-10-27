# Machine fragment research: outcome

Seven proposals, written from scratch against [principles.md](../principles.md), reviewed by two
Opus reviewers (correctness and static analysis; principles, prior art and simplicity) over three
rounds. Six were revised twice by their own authors. Nothing here is accepted; this file records
where the research landed and what is left for the user to decide.

## Files

| Proposal                                                     | Shape                          | Author        |
| ------------------------------------------------------------ | ------------------------------ | ------------- |
| [opus-split.md](opus-split.md)                               | `trait()` / `subroutine()`     | Opus          |
| [codex-split.md](codex-split.md)                             | `trait()` / `subroutine()`     | GPT 6.1 Sol   |
| [sonnet-split.md](sonnet-split.md)                           | `trait()` / `subroutine()`     | Sonnet        |
| [opus-single-fragment.md](opus-single-fragment.md)           | one `fragment()`               | Opus          |
| [codex-single-fragment.md](codex-single-fragment.md)         | one `fragment()`               | GPT 6.1 Sol   |
| [sonnet-single-fragment.md](sonnet-single-fragment.md)       | one `fragment()`               | Sonnet        |
| [opus-trait-routine-actor.md](opus-trait-routine-actor.md)   | every state is a node; traits, routines, actor | Opus (not revised) |

Reviews are in [reviews/](reviews/): `round1-*`, `round2-*` (with `round2-simplicity.md`, the
simplicity audit), `round3-*`, and `round3-trait-routine-actor-*`.

## Where it landed

1. **Split, not single.** All three single-fragment proposals conceded that, once a fragment cannot
   be placed either way, their kind is inferred from what it declares: the split under one name.
   The principles favour naming the two kinds, `trait` and `subroutine`.
2. **Basis: opus-split.** Both reviewers recommend opus-split's surface (about 27 keywords, 11
   numbered rules) with codex-split's request semantics. On correctness alone the codex proposals
   rank first; opus-split has since adopted most of their semantics.
3. **Converged semantics** (in all six after round 2): the fragment declares who may send
   (`events`, `hostEvents`, `internalEvents`), so nothing is forwarded; frozen `input` at entry;
   `start` for the first send; outcome kinds (`notSent` distinct from uncertain; the host maps only
   success and named failures); one `abandoned` handler that records a pending commit in the turn
   the step is left and never moves the actor; deliveries (replies, exits, timer firings) that are
   never declined; whole-turn decline for refused raises; persisted generations; one outstanding
   call per port.
4. **Correctness:** no blockers remain in the six. Four (codex-single, codex-split, opus-split,
   sonnet-split) have no majors in round 3 correctness; the principles review lists three majors
   still open in opus-split (a commit `defect` routed to `Rejected`, a throwing `defect` mapper,
   three unlisted plan amendments).
5. **The trait / routine / actor model** is the most cohesive for fragment authors but not simpler
   for plain machines, is within noise on total size, has four correctness majors in its new scoping
   rules (late `abandoned` scope, drafts lost on leaving, stale edge input, re-entry resets), and
   rewrites the Machines plan core. Both reviewers: keep opus-split as the basis and borrow from it
   traits on any node, per-edge input for routines, fillings shaped as total `on` handlers,
   `story.machine` for pieces, and possibly `start` on any node. Node-scoped memory is deferred to
   its own Machines decision after the type spike.
6. **A real bug in today's reference app.** The editor's autosave schedule on `EDITING` uses
   `restartOn`, whose entry baseline is silent (Machines O5), and every path back into `EDITING`
   arrives with the new draft already set, so `editedWhileSaving` cannot autosave and the first edit
   after a save never autosaves. Machines O5 should say the entry baseline is the entering turn's
   committed memory, or the autosave should move to a debounce on `OPEN`.

## Decisions for the user

1. **Feature cuts** (ranked, deduplicated in [reviews/round3-principles.md](reviews/round3-principles.md)):
   cheap ones (trait callbacks that move the host; live value props; "every port required"), real
   decisions (read requests; steps inside steps), and cuts that save less than claimed or remove the
   reason fragments exist (forbidding leaving mid-commit; `raise`; request ports).
2. **Two choices:** entry input per placement or per edge; `start` as actions on the entering
   transition or as its own transition, and whether `start` applies to any node (this reverses the
   plans' "no entry actions" rule).
3. **Five policy points** from [reviews/round3-correctness.md](reviews/round3-correctness.md):
   pre-invocation cancel is `notSent`; step input is read after the entering transition's updates;
   no `allow` concurrency on request commits; one `abandoned` handler per operation or per binding;
   a key written by both the pending record and the leaving transition is a construction error.
4. **Pieces of the trait / routine / actor model** to borrow into opus-split (item 5 above).
5. **Yardstick additions** proposed by the reviewers (E4, E5, L5–L8, H4, H5, D5–D7, T1, T2, A7) for
   [principles.md](../principles.md).

## Recommended next steps

1. Decide items 1–4 above.
2. One consolidation pass on opus-split with those decisions and the borrowed fixes.
3. The S1 type spike: a small TypeScript prototype of the reply binding, nested event paths and
   inference without assertions, which no document can settle.
