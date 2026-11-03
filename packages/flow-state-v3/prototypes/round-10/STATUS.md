# Round 10, status at the stage B checkpoint

Proposed throughout. Decisions are in `../convergence-10.md`, D129-D146.

## Stage A, as accepted (`fba520e2`), and rechecked at the start of stage B

- `falsify.ts --part suite` was **not red everywhere it should be**. A MailQ unit case passed on no runtime, since it never touched the port. It moved to `checks/mailq-check.ts`, and `mutate-one.ts` gates every `checks/*.ts`. The part is red everywhere now.
- A mutant rerun was **contaminated**: `mutate.ts` copied the live folder per mutant, so an edit made during the run reached later mutants (605 failures of a half-made edit). Killed. `mutate.ts` now snapshots the sources once at its start. The clean rerun is after this checkpoint.

## Stage B so far

| Item | State |
| --- | --- |
| 7. Oracles over meaning (D142, D143) | Done. `Port.disk`, the runtime's codec: kind, scope, heads, parked, decode. Every-step oracles and `stored()` ask it. Output counts disk by kind and `acked` bytes by count. A correct runtime with renamed keys: 312 cases failed before, **112** now; with wrapped values: 279 before, **30** now. What fails is cases that name a stored key, a format pin on purpose. `normalise` treats user data as opaque (`{pos:1}` and `{pos:2}` are two states). `Ctx.eq` compares values |
| 8. Fake against reality | Done: a freeze stops everything and drops page input (D146); a strict server: keys pruned, 409 in flight, replayed 500, body mismatch refused, every landing in the ledger (D145); `reality/` scored (D144). Not done: bfcache and the lock, hidden throttling, plain writes queued behind a strict one, connection loss, `bench/main.ts` scoring |
| 9. Under-specification | Done: `letgo-takes-all`, FRAG-08's vacuous check, M5 (`delivered` pays only with a turn), M4 (chain sends to both actors), (p) as a probe (plant `noMerge` dies at depth 2), A07 (rule 12, an issue names its origin), A02 (whole output). Not yet: A05, A12, A15, M6, HIGH-03, M2 recorded, design edits |

Suite 722/722 at this checkpoint.
