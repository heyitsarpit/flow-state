# Round 8 status, checkpoint 2

Status: proposed, in flux. Everything here is the builder's own reading; RESULTS comes last.

**Done [ran].** Suite 607/607 (563 plus 44 new). D96: `acked` removed, no case but five reads of the field needed changing. H1 on real IndexedDB with a store slowed 400 ms: round 7 12/12 second key beside an undecided first on `serialize` bare and on `Checkout/Refunds`; round 8 0/12 on both (`reality/results-h1store.json`). Directed search `flush.serialize.directed`: finds H1 on round 7 at depth 11 in 43 s; round 8 complete to depth 12, clean. D97 (hidden), D98 (fatal), D99 (boot stamp; the M3 harm is real: a read reached another copy), D100 (doors, plus a fourth, a member's key). Gate reasons repaired, and a listed case must now fail as it was read to fail. Log keyed by id; deleted ids and variants fail.

**Why the builder's three search-only kills did not reproduce [ran].** At `30d3290f`, the commit the mutants ran on, `flush.pay.tight` fails on the *unmutated* code, in 15 s. `f4b13887` then pinned that class (P4). So every mutant that reached the search "died". All three survive at `f4b13887`. `mutate.ts` now runs a control first.

**H3 [ran]: what deletes it is Chrome's own recovery.** 12 of 12 natural wipes with Chrome's log: `Corruption: checksum mismatch`, then `IndexedDB recovering from a corrupted (and deleted) database`. The bytes: a bare 7-byte record header, then a whole record from the next process. Planted bytes, no kill timing: 12/12 wipe at the second open, also after a clean exit; control 0/12. Not main-only: `killTree` 5/71, `Browser.crash` 2/64, under a strict write loop.

**Mutants [ran, builder-written].** 48 listed; 5 still to read closely (`driver.credit-kept`, `durable.ticket-not-fenced`, `turn.refusal-keeps-asks`, equivalents by reading). `run-plants.sh` not rerun; searches not rerun past the directed one.

**What I doubt.**
- `REV8-H1`'s restored state: on `serialize`, `W`'s `NotSent` moves the state out of `U` over a hold (A, with the row uncertain). True and old, but an author's reading of it is untested.
- `resetOn` still refuses a value with no text. I kept it: a reset value is a fragment's identity. Reported, not decided by anyone else.
- D99's stamp makes each restored and touched lane rewrite once per boot. The suite does not mind; real cost not measured.
- A guard's `UnencodableValue` issue fires per evaluation, so a noisy guard could report on every event.
