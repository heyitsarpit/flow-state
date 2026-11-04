# Progress: Flow State v3 production

Roadmap: roadmap.md
State: stopped: the roadmap's rewritten text is not yet approved
Phase: none started. Iteration: 0.
Next action: on approval, start phase 1 (the plan merge, approved by Arpit on 2026-11-04), with `FOR-ARPIT.md` Q1-Q8 in the first question round.
Waiting on the owner:
- approval of roadmap.md and answers to R1-R5;
- `FOR-ARPIT.md` Q1-Q8 and the 20 calls;
- the services choice: no `services` list, types only (recommended), or a required list on every operation;
- which example apps to build (phase 7). Candidates are below.

## Phases

- [ ] 1 Plan merge: not started
- [ ] 2 Pre-work prototype (entities, streams, migration; round 13's H1 and H2): not started
- [ ] 3 Conformance rewrite: not started
- [ ] 4 Core: not started
- [ ] 5 Features: not started
- [ ] 6 Documentation: not started
- [ ] 7 Example apps: not started
- [ ] 8 Hardening and budgets: not started
- [ ] 9 Release: not started

## Example app candidates (proposed, for Arpit's pick)

Each is a Next.js demo with a live inspector panel beside the app, showing `flow trace` and `flow graph` as it runs, so the demo shows its own guarantees.

| App | What it demos |
| --- | --- |
| **Pull the plug**, a shop where you can kill the tab, go offline or reload mid-payment, and still never get charged twice | Write-ahead, unknown outcomes, business keys, 3-D Secure as a fragment |
| **Live auction**, with bids streaming in, optimistic bids, outbid races, countdowns and reconnects | Streams, entities, `latest`/`reject` concurrency, timers |
| **Agent console**, a small Codex-like chat: streamed output, tool calls approved step by step, runs resumable across a reload | Streams, subroutines, persistence, cancel and retry; a step toward the Electron stretch goal |
| **Mission control**, thousands of live objects (satellites or flights) on a map, with doubt marks when the feed drops and repairs when it returns | Entities at scale, listen frames, doubt and repair, performance |
| **Smart home**, a panel of simulated devices where a command may or may not have happened ("did the light turn on?") | Unknown outcomes, retries, device streams, multi-tab ownership |
| **Escape room**, a puzzle game whose deep state machine doubles as its own walkthrough, with Stories as replays | Fragments, `flow graph`, Stories, record migration between game versions |

## Log

- 2026-11-04 setup `5d92e2d3`: lint-bomb vendored and wired. The throwaway file caught 6 of its 6 seeded violations, the frozen and prototype paths were not linted, and the rule tests passed. `nub run verify` fails at `build:library` (the frozen package), as it did at `d4d54074`. Results: `tools/lint-bomb/FLOW-STATE.md`.
- 2026-11-04 first roadmap draft `0ecda35d`. Arpit rejected its new prototype rounds and gave the shape himself.
- 2026-11-04 `tools/oxlint/anti-slop/` deleted (`6bd32fbb`).
- 2026-11-04 roadmap rewritten from Arpit's shape. Cold read not run.
