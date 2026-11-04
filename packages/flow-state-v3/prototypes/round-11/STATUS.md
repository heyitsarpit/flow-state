# Round 11: status at the end

Proposed, all of it. The round's report is `RESULTS.md`; the decisions D194-D212, findings F1-F11 and the `Compiled` changes are in `../convergence-11.md`; the fixture front end's departures from the public API are in `api-changes.md`; the mid-session review is `review-mid.md`, and what was done with each of its findings is in `../convergence-11.md`.

- 691/742 cases boot only typed output; 30 boot typed output the case edits; 21 boot a hand machine (F2, F11).
- Codec: in-process (D194), restated after review M2; numbers remeasured at the end.
- `Compiled`: every closure a Slot and one per path, refused at the seal otherwise (D207); the Runtime takes services at boot (D211). The rest owed, with reasons.
- Gates: see RESULTS. Suite 742/742 with catalog, lock clean; `--swap` 742/742; `mutate-one` control not killed; types, front, CLI and every check pass; falsify's suite, tamper, mutants, search and watch parts ok; lies in 32 slices as RESULTS says.

For the coordinator, in order:

1. `round-11/RESULTS.md`, then `../convergence-11.md`'s findings table and its `Compiled` table.
2. `round-11/api-changes.md`: the seams (`index`, `labFollowUps`, `labHostOp`) and the deviations owed to the compile prototypes.
3. Arpit's calls: F2's design question (carry an input by its Schema's encoding, so a bigint key is reachable), retiring the F2 and F11 hand cases, and D210.
