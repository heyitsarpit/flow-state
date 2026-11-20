# Prototypes

Throwaway experiments for the runtime. Each folder answers one question and holds its code and a `RESULTS.md` with the
inputs, conditions, results and limits. Nothing here becomes production code; the findings carry over.

Everything is proposed. Context: `workflow/plans/archive/flow-design-2026-11/runtime-architecture/discussion.md` and
`review-1.md`. Method: the `prototype` skill.

Rules:

- Name entry files `main.ts`, not `*.test.ts`, because `vp test` covers `packages/**`.
- Run every suite, lie, search and mutation under `conformance/watch.ts`, each process under 2 GB.
- Deterministic work (suite slices, lies, mutants) may run up to 8 processes at once, under about 16 GB in total (Arpit: up to 16-20 GB of the 24 GB). Before adding one, check that the machine isn't swapping (`vm_stat`'s swapouts). Real-browser runs, benchmarks and timing-sensitive searches still run one at a time, with nothing else beside them. (Arpit, 2026-11-04: "just don't burn out my laptop".)
- Lies run targeted by default: each lie only on the cases its probe fires in. Run the full lie gate once before a round's final commit.
- No new dependencies. `effect` resolves from the workspace root (4.0.5).
- A result claims only what ran.
- Runtime only: feed in realistic data that is already compiled and validated. Build no definition layer or outside world.
- Design rules are suggestions here. Break one if it really needs breaking, and list it with why in `RESULTS.md`. Rule 25 is cancelled.
- Sources: `machine-design.md` wins. The converted Checkout and desk code show what is wanted; a disagreement between them is a finding. The `.plan` files are outdated: read one only for what the design leaves out, and note any conflict.
- Read how real code does it in `codebases/` (read only; never install or run from there), and cite the file paths you take from.

| Spike   | Question                                                                                       | State                                                                                                                                               |
| ------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1      | Is lane plus record queue live? What else can wait forever?                                    | done: [s1-wait-graph/RESULTS.md](s1-wait-graph/RESULTS.md)                                                                                          |
| S2      | Can one completion per Attempt be guaranteed?                                                  | done: [s2-completion/RESULTS.md](s2-completion/RESULTS.md)                                                                                          |
| S5      | Does a stream session need to live in the world?                                               | done: [s5-session/RESULTS.md](s5-session/RESULTS.md)                                                                                                |
| Round 1 | Does Pay run on one pure step under its suite?                                                 | done: [round-1/RESULTS.md](round-1/RESULTS.md)                                                                                                      |
| Round 2 | Does the shape hold with two actors, `latest` and the store module?                            | done: [round-2/RESULTS.md](round-2/RESULTS.md), decisions in [convergence-2.md](convergence-2.md)                                                   |
| Round 3 | Do fragments run on one step, with every review fix, and do streams fit the seam on paper?     | done: [round-3/RESULTS.md](round-3/RESULTS.md), decisions in [convergence-3.md](convergence-3.md). Second author 35/50                              |
| Round 4 | Does one gate hold, what does a position mean, and do streams fit the seam for real?           | done: [round-4/RESULTS.md](round-4/RESULTS.md), decisions in [convergence-4.md](convergence-4.md). Reviewed: [round-4/review.md](round-4/review.md) |
| Round 5 | Is the gate enforced at the boundary, does the version decide, and do the rest of streams fit? | done: [round-5/RESULTS.md](round-5/RESULTS.md), decisions in [convergence-5.md](convergence-5.md). Builder mutants only; independent review owed    |
| Round 6 | Does the runtime hold on real IndexedDB and a real server, with evidence placed then disposed? | done: [round-6/RESULTS.md](round-6/RESULTS.md), decisions in [convergence-6.md](convergence-6.md). Builder mutants only; independent review owed    |
| Round 7 | Does one rule hold the persistence edge, and does `Compiled` come from a typed definition?     | done: [round-7/RESULTS.md](round-7/RESULTS.md), decisions in [convergence-7.md](convergence-7.md). Mid-round review only; the edge has builder mutants only |
| Round 8 | Are the persistence edge and the tests trustworthy, and who deletes an origin?                 | done: [round-8/RESULTS.md](round-8/RESULTS.md), decisions in [convergence-8.md](convergence-8.md). Mid-session review: [round-8/review-mid.md](round-8/review-mid.md). Builder mutants only since; final independent review owed |
| Round 9 | Part one: does the runtime hold bulk writes, and can the tests see a missing ending?              | done: [round-9/RESULTS.md](round-9/RESULTS.md), decisions in [convergence-9.md](convergence-9.md). Builder mutants only; independent review owed |
| S3      | What does persistence cost per commit?                                                         | done on this Mac, real IndexedDB: [round-6/RESULTS.md](round-6/RESULTS.md). Not a phone                                                             |
| S4      | Does the turn hold on a throttled browser?                                                     | done for Chromium headless at 1x and 6x; reusable in `conformance/bench/`: [round-6/RESULTS.md](round-6/RESULTS.md). Not a phone                    |
