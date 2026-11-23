# Audit gaps to close (re-audit 3, after the rule 30 ruling)

Status: open, 2026-11-08. The auditor's wrong runtimes are in `mutants-audit-3.ts` (17; 8 survive) and the earlier
files. For each: a case from the design text (cite it) that turns the auditor's wrong runtime red by assertion on that
case; keep the wrong runtime as a standing gate.

## Rule 30 as ruled (a record's queue is released once the forced repair settles; the held write keeps its lane hold)
1. Regression `audit-2.r30-release-stays-queued`: after `RepairOverdue`, `Released` withdraws the queue entry and frees
   the next writer at once (it was red on LIKE-04 before the ruling; green now).
2. Per record: a two-record unknown — one record's repair settling frees only that record (`a3.r30-settle-every-record`).
3. A second re-send on the wire holds the record again (`a3.r30-resend-no-rehold`).
4. A restored unknown holds its record until the boot repair settles (`a3.r30-restored-holds-nothing`).

## Other requirements
5. Rule 35 counts items: 4,097 items with one repeat are `Overloaded` (`a3.many-distinct-keys`).
6. `.covers` over-marking (Q3 A): a record predicted into the cover, one in doubt, and one unconfirmed are marked at a
   gap (`a3.cover-ignores-prediction`, `a3.cover-ignores-doubt`, `a3.cover-ignores-unconfirmed`).
7. Key fields get no cell (proposal 2 §2.2): add a gap fixture whose key is not named `id` (`a3.key-field-is-id`).

## Harness
8. The like drain skips a missing row (`like.search.ts` `settled`: `if (row === undefined) continue`) — require a row for
   every record the server holds (`lie:a3.like-row-hidden` passes today).
9. `checkMints` counts a mint as accounted when the runtime's own waits name it (`ctx.ts` ~201) — rebuild on what the
   harness observed; `spare` accepts any open request of the same op — narrow it; `cancelsWherever` ignores the
   cancel's key — fix.
10. `runtimeDisposed` is never cleared at a reload (`drive.ts` ~1649) — clear it.

## Pins
11. `store.scenario.ts` ~203, ~208 ordered `unconfirmed`; `round10.scenario.ts` ~365 `TimedOut` (U1 B); `round15.scenario.ts`
    ~369 `inspect(RL)?.unbound ?? []` passes a runtime with no inspection; `P1-E-CAP` checks only the eviction count, not
    which mark went.
