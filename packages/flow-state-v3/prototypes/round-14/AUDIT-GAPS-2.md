# Audit gaps to close (audit 2 on entities; audit 1b re-auditing rounds 14-15b and area H)

Status: open, 2026-11-08. The auditors' own wrong runtimes are in `mutants-audit-2.ts` (entities, 80; 17 real survivors)
and `mutants-audit-1b.ts` (26 new; 7 survivors, plus lies). For each survivor: add a case derived from the design text
(never from the mutant) that turns it red by assertion, and keep the auditor's wrong runtime as a standing gate.

## Entities (audit 2)

1. Business-key replay: a same-key success may end only given-up doubts of the same contract with the same key values
   (released-write-proof-proposal-2 §4). Cases: a doubt with a different key; one on a different contract.
2. `guarded` proofs come from a read, a feed frame, or any write's success showing the target's version past the sent
   base. Cases: a frame proof; another write's success proof.
3. No rebase after send (Q5 "only until sent"; rule 31: a retry sends `basedOn` unchanged). Case: a D3-overtaken earlier
   draft succeeds while a later, already-sent write is held; its retry keeps its base.
4. Rule 28: a write is invoked only once it heads every queue it joined. Case: a two-record write blocked on its second
   record.
5. Rule 32: an unresolved mark stays. Cases: an unresolved mark beside a business-key replay, and beside a full cap.
6. The `.covers` mask: hides, never ends; only when the filter reads no written field; not for removals; not while a gap
   is open; registration after the give-up. Cases for each.
7. U10: a later success demotes only if it carried every field the mark covers (partial overlap case); only the next
   read demotes, not a frame (rule 32).
8. `GuardContradicted` only on a first send, never a re-send.
9. `.gone` on a gap refetch that answers the tag.
10. The cap is 4,096 per entity (proposal 2): cases for per-entity scope and the value.
Runtime bugs: rule 35's `many` cap (a key array past 4,096 is `Overloaded`); key fields get no cell (proposal 2 §2.2) —
`readRecord`'s gap marking must not mark `id`, and the suite's pins that include key fields (`ALL_Q`,
`phase1e.scenario.ts` ~45, ~563, ~582) are wrong; `coveredBy` must over-mark — a record that moved into the cover during a
gap is marked (filter on the record's possible values, not only the last-known base).
Harness excuses built on the runtime's own report (forbidden by `policy-testing`): `ctx.ts` ~161 (any wire wait without
an attempt excuses every open send), `ctx.ts` ~144 and `checkMints` (the runtime's `DisposeStart` clears what's owed),
`like.search.ts` ~75 (the drain skips rows the runtime reports as predicted/uncertain/unconfirmed — a runtime uncertain
forever passes), ~118/136/143 (`Released` anywhere excuses S5), ~82 (the drain stops silently after 24 steps),
`chain.search.ts` ~75 ((m) excused by `InvalidTurn` or any non-timer wait). Rebuild each from what the harness observed,
or narrow it and add a lie.
Over-narrow pins: `unconfirmed` arrays order-sensitive and including key fields; "no read asked" at give-up (~410);
`chain.search.ts` ~78 hard-coded disk key.

## Rounds 14-15b and area H (audit 1b)

11. 2.7.13 disposal shape (OD50): a definite ending first, then W — case: serialize, head succeeds within the bound, W
    queued, reload, assert the order.
12. Rule 15, "lateness is not transitive": a call started in a late stay-put turn ends current.
13. Rule 15 / F8: a denied turn keeps its lane effect — after the denial, still uncertain, no new send; then `cancelAll`
    gives it up.
14. Rule 14 (OD49): re-entry by a history target while a call is in flight makes its ending late.
15. OD50 "live or retired": a retired identity with a held lane is listed unbound and reported at boot.
16. 2.7.15 "under every policy": old-version holds under `latest` and `cancel`.
Excuses: the self-release cause hides a faked release in `R15-01/a-kill-inside-the-disposal-window-...` and is
load-bearing for 4 correct cases (FRAG-10, REAL-03 ×2, R15-01 stay-put) — rebuild it from harness-observed facts; the
forget excuse is unused (control 941/941 without it) — delete it.
Pins: `phase1h.scenario.ts` ~273 pins the proposed name `HoldForgotten`; `pay.scenario.ts` ~195, ~741 pin `TimedOut`,
which U1 B (OD48) did not take — assert behaviour, or follow U1 B.
Off-target kills to aim on target: `r15-own-op-only`, `r15-held-head-is-live`, `old-version-declines-under-reject-only`,
`restore-lanes-newest-first`, `1b.disposal-definite-keeps-head`. Delete the vacuous `forget-gone-op-hold-silent`.
