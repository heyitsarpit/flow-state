# Round 13: round 12's review fixed, key evolution redesigned once, the story prototype, and `flow story`, `flow trace`, `flow graph`

Status: **everything here is proposed**, except what is marked **Arpit's call**. Builder-run; the independent review that follows is the measure. Decisions D221-D228 are in `../convergence-13.md`; every difference from `machine-design.md` is in `api-changes.md`; the mid-session review is `review-mid.md`; measured run costs are `run-costs.md`. Marks: [ran], [read], [reasoning].

Commits: `ea087ca1` (checkpoint 1), `1ee5e5f7` (checkpoint 2: Stories, the commands, the graph gate), `0d3c1137` (api-changes), `1f230e00` (mid review copied), `42a1f4e8` (D221 and D222 redone, M3), `b9539ddc` (targeted lies), **`3cce106b` (the final code commit, gated below)**, and this file's commit.

## The answer

- **Key evolution has one rule** (D221). **Arpit's call:** key fields are required; the compile refuses an optional or defaulted one. **Coordinator's addition, proposed:** an op's key fields are its version. A lane minted under other fields is an old-version hold: never renamed or matched by projection, reached by its own old key, and every commit of the op declines beside it. This replaces D217's shape test, the first D221's projection and the stamped rename, which failed review three times. The mid review's collision cannot occur, in either mint order [ran].
- **Eight Stories run in the design's public Story API** on the round 13 runtime and the harness's fake world [ran]. They cover Checkout (paid, pressed twice, busy then paid, reload mid-charge), 3-D Secure alone in a stand-in host (timed out, help and back), and the desk (rename under `latest`, archive twice under `reject`). There are 53 checks, each read from a checkpoint after the run.
- **`flow graph` is conformance proof** [ran]. Over the suite with its searches, each of 78,543 turn parts is an edge of its graph, from its node, to its target: **0 disagreements**. Getting there took 3 graph fixes and 1 fixture fix. 62 edges are claimed, unmarked and never taken; they are listed.

## Step 1: the reviews, by root cause

| Finding | Done |
| --- | --- |
| Round 12 **H1**, mid **H1, M1, M4, L1, L2, L3, L5** (key evolution) | D221 (above). `R13-KEYS` ×8: a field added; a field removed with two holds, both mint orders; several old holds; `serialize`; a reload in between; a keyed `idle`; another actor; no release. `R12-KEYS` ×2 under the rule. `front-check`: `KeyFieldOptional` ×3, a required key compiles. Mutants [ran]: no decline (7 cases red), stamped lanes renamed (3 red; the collision is raised loudly), the guard blind (red). The mid review's four survivors name code that no longer exists |
| Round 12 **M1** (`KeyOf`) | a plain required pick (D221) |
| Round 12 **M2**, mid **M2** (defaults) | D222 redone: one default per field at both doors; `TwoDefaults`. `R13-DEFAULTS` ×2; `front-check` ×4; a restore split by door goes red [ran]. The four fixtures are back to one default |
| Round 12 **M3** | D223: a fragment's `kind`, `events` (with `payloads`, and `uncertain` for mid L4), `ports`. A machine's events have payloads too. Mid **M3**: `flow check` reads fragment ops and schedules against the fragment, so `attach` and `panels` say nothing; `frag-typo` is `UnknownEvent` (CLI pins) |
| Round 12 **L1-L7** | D218 directives ×3 (both mutants die); `front-check` pins for L2, L3, L4 and D124; `compare-all` skips by path; L6's stale rows are gone; L7's comment is fixed |

## Step 2: the story prototype (`round-13/story/`)

| Story | Subject | What it covers |
| --- | --- | --- |
| `checkout/paid` | Pay | the common case; the wire key is the Attempt's id; the lane reads gone, the row settled |
| `checkout/pressed-twice` | Pay | `hold`/`release`; a second press declines (`Rejected`); one charge; verdicts |
| `checkout/busy-then-paid` | Pay | a server control; `Busy` classified by Pay's own commit; two Attempts by `attempt(op, { n })`; `AmbiguousRead` |
| `checkout/reload-mid-charge` | Pay | a reload with a request in transit; `orphan`; restore `unknown { Restored }`; the check places once (STF12) |
| `threeds/timed-out` | ThreeDS alone | the stand-in host; a raise into Countdown; its callback; an exit; `SubjectAbsent` |
| `threeds/help-and-back` | ThreeDS alone | `S.OPEN.history`; private memory; a host event to `Passed` |
| `desk/rename-latest` | Desk/Tickets | `latest`: the second waits on the lane, both reach the server in order, the last title wins |
| `desk/archive-twice` | Desk/Tickets | `reject`: the second press declines; one request |

`checks/story-check.ts` also makes eight Story errors happen, and shows that steps are JSON and that a prefix never changes.

## Step 3: three commands

- `flow story list | describe <id> | run <id>`. `describe` reads the plan alone. It counts the callbacks run, which is 0, after wrapping every fake handler and control. `run` reports what ran, with no verdict.
- `flow trace <id> [--at cp]` (D225). It shows the timeline: each step's data form, the runtime's evidence (each turn's alternatives by instance), the wire's phase changes and the checkpoints.
  - Compared with round 7's paper: there is no trace file yet, so the Story is run.
  - The paper's point form, `explain --trace --at`, is not built. Neither are `diff` and filters.
- `flow graph <machine>` (D226). There is one edge per alternative, named by its place. Each edge says what decides it and is marked `late`, `shadowed`, `unreached` or `unsourced`.

## What `flow graph`'s conformance check found

- **Three graph bugs:**
  - a filling runs from the host's leaf, under the placing node;
  - a `whenAbandoned` callback runs in the turn that ends the life;
  - a resumable trait's runs from anywhere.
- **One fixture bug:** `cells.ts` handled an undeclared `AbortPay`.
- **One fact for Arpit:** Pay's `CartLoaded` has no source in the pinned Pay; only FRAG-09 sends it.
- **No compiler or runtime disagreement.**
- **Two gate mutants each go red** [ran]: a graph without fillings, and a runtime that misreports the moved leaf.
- **Final numbers:** 77,522 turns, 730 edges over 55 machines, 483 taken, 178 guarded and not taken, 62 unmarked and not taken, 5 unreached, 3 unsourced.

## Gates, on `3cce106b` [ran]

Arpit's rule allowed up to 8 deterministic processes at once. How many ran alongside each is in `run-costs.md`.

| Gate | Result |
| --- | --- |
| Suite with catalog and searches | 761/761; output alone 0; unlogged none; stale lock 0; catalog none; RECIPIENTS as written |
| `mutate-one` control | `{"killedBy":null}` (suite, `--swap`, compares, date check, CLI pins, every `checks/*.ts`, the 5 s gate) |
| `checks/` one by one | front 67 pins, types 16 directives, story 53 checks, mailq, score, search vacuity: all pass |
| CLI pins | all pass, with new pins for `story`, `trace`, `graph` and M3 |
| Graph gate with searches | `GRAPH PASS`, 0 disagreements |
| falsify `watch`, `tamper`, `search`, `suite1`, `suite2`, `suite3`, `mutants` | each `every gate fails on what it should` |
| falsify `lies`, full | all 32 `/32` slices green on 42a1f4e8; then `--full` in 48 slices on 3cce106b's tree: 75 of 75 lies red, cases recorded |
| falsify `lies`, targeted (`--parallel 8`, the new default) | 75 of 75 red on their recorded cases, none fell back; 64.9 s |

## Not run, and stated

- Real browsers, Safari, `nub run verify`, the formatter and the linter (these are prototypes).
- The old mutant lists through `mutate.ts`. Only the review's survivors, the D221/D222 mutants and the two gate mutants were run.
- The graph gate is not in `mutate-one`, for time. It ran with the suite's searches, not with `search/run.ts`'s deep ones.
- Not built: `Story.app`, tabs, `together`, `suspended`, streams, `Fake.storage`, rule 61's finish and `HostTimeWait`, and typed access to an old-version key.

**Shell rules:**

- One slip early on: a `cat > file <<EOF` heredoc wrote a probe into the scratchpad.
- Once, `> /dev/null` lost a targeted run's output. I killed that run and its orphaned inner suites by exact pid.
- I removed my own leftover falsify scratch folder by exact path.
- The only copy in the repo was `round-12/` to `round-13/`, with `rsync`, code only.
