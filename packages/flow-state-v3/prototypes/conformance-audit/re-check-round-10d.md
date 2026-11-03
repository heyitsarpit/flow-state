# Re-check of the v3 test system after round 10, stage D

Commit `ef3e1fa9`, branch `flow-rewrite`. Run from a detached worktree in the scratchpad, 10:33 to 10:50. Scripts: `/private/tmp/claude-501/-Users-arpit--claude-spares-spare-cCgI4U/575b2ea3-def0-491f-9ce0-84ae4fd1afbf/scratchpad/recheck10d/scripts/` (`run-mut.ts`, `med.ts`). No subagents, no repo writes besides this file, no commits.

Marks: [ran] reproduced at ef3e1fa9; [read] seen in the code; [reasoning] inferred, not run.

## Verdict: FAIL

One High blocks a pass. It is the same class as H1 and H1', moved to the excuse the inventory calls "checked":

- **H1''.** `parked` pays for an ending that never reaches its live owner. The only check is that a wait names it, and the wait is the runtime's own inspection (allowance A3). Whether parking was allowed (owner retired, or its state does not bind the op) is never asked. I built a runtime that parks `like`'s second failure on a live actor whose state binds `like`. It passes **727/727 named oracles**. Only the whole-output compare sees it (2 cases), and that is a change detector.

H1' itself is fixed. So are the Mediums, with small residues.

Fix H1'' and this is a pass. Before entities, also fix M1'' (the "owner moved" cause is too broad).

| Previous finding | Status | Evidence |
|---|---|---|
| H1': `Released`/`lane.release.*` at the runtime's word | **Fixed**, thin margin | Every `+ Released` lie is red by (j) [ran]. The narrowest, `like2nc-released`, by 1 case (STORE-05). Without `Released` it is 2 cases: MED-01's kill is still excused by a cause the ledger accepts |
| M1': `types-check` counted text | **Fixed** | A mention plus `as any` is red, by its words (`falsify --part tamper`) [ran]. Residue (Low): a typo under a kept directive passes, see L1 [ran] |
| M2': scorer passes empty rows | **Fixed** on every attack from the last re-check, plus a string count and a fractional cycle [ran] | `med.ts` |
| M3': supersede had no oracle | **Fixed** | `lie.serialize-as-latest` is red by `(j) superseded` in 3 cases [ran] |
| M4': literal keys, a no-op corruption | **Fixed** as stated | `corruptStored` with no match throws (`drive.ts:743-744`). `Ctx.record` uses `Reads.actorKey`, and `lanesOf` goes through the codec [read]. The 73/26 counts were not rerun |

## High

### H1''. A3 is an excuse, not a check: a parked ending to a live, bound owner passes every named oracle [ran]

- **Where:**
  - `drive.ts:272-275`: `parked` takes the ending off `told` and puts it on `parkedOwed`.
  - `drive.ts:561-563`: `parkedOwed` is paid by any `parked` wait of the same op and attempt.
  - Nothing compares the park with what the suite holds itself: the owner's published state, and the compiled bindings of that state.
- **Lie:** at `turn.ts:1126` (`admitEnding`), for a live actor:
  - `if (a && LIKE2NC) return parkEnding(tx, item, lane, subject, a.machine);`
  - It replaces `deliver`. The lane really parks it, so `waits()` names it truthfully.
  - Nothing unparks it: unpark comes only on a rebinding turn (`lane.ts:323`) or at boot (`durable.ts:331`).

| Lie | Named (`--no-output`) | Of them by (j) | Whole output |
|---|---|---|---|
| `a3.park-like2nc` | **0 fail (727/727)** | 0 | 2 fail, all `output:` |
| `a3.park-save` | 26 fail | **0** | |
| for comparison: `h1.like2nc-plain` (same trigger, as evidence) | 2 fail | 2 | |

- **What this shows:**
  - The same dropped ending is red by (j) when it is said as `evidenceOnly`, and green when it is said as `parked`.
  - With `save`, (j) is blind in all 26 kills. Hand asserts carry them.
  - In STORE-05/`a-later-failure-does-not`, B's `Refused` never reaches B. The case asserts only the mark, and it ends green.
- **Why it is a High:**
  - It is plausible as an honest bug, not only a lie: a wrong `bindingOf` (wrong subject, wrong path, wrong copy) parks and reports truthfully.
  - Entities fan endings out across actors by binding. A binding miss on a non-owning copy is the likely bug there. The general guard says nothing, so only a hand case that happens to assert the copy would see it.
- **Fix, in D154's own terms:** a `parked` pays only for a cause the suite sees:
  - the owner not alive, or retired (life over);
  - or the owner's published state, read by the suite, binding no path that maps the op. The compiled machine has the bindings, so the suite can compute this.
  - Otherwise the ending stays on `told`.
  - The same rule goes for `kept` (refused twice), which also rests on the runtime's wait.
  - Add `a3.park-like2nc` to `falsify.ts --part lies`.

## Medium

### M1''. D154's "owner moved" cause is too broad; (j) is blind wherever the owner's state moves in the batch [ran]

- **Where:**
  - `releaseSeen` (`drive.ts:179-184`) pays with `moved.has(actor) && releasable(op)`.
  - `releasable` (`:93-108`) is true if *any* compiled machine anywhere has a `cancel` member or `whenAbandoned.release` with that op's name. That holds for the whole fixture, not for the owner's machine, the state it left, or the alternative it took.
  - `mayLetGo` (`:201`) pays a let-go on `moved.has(a)` with no `releasable` at all.
- **Lie:** `d154.moved-like-released`. Any `like` failure whose owner has other mail in the batch goes as evidence, with `Released`.
  - The trigger fires in one case, SURV-03 (probe `probe.moved-like`).
  - There **(j) is silent**. The only kill is a hand assert on mint order.
  - The same with `save` and with every failure (`moved-fail`) is still red by (j) in 9 of 11 [ran]. The cause pays only where `releasable` is true and the state moved.
- **Why Medium today, a blocker for entities:**
  - A named case kills it.
  - Entity batches move many owners in one batch by design (one write, many screens).
  - An op name shared across machines makes `releasable` true almost everywhere.
  - Under entities this cause will excuse most dropped endings.
- **Fix:** pay only if the owner's machine, between the published state before and after, took an alternative that cancels this op, or left every state that binds it. The suite holds the compiled machine and both states.

### M2''. A1 attribution: a `turn` naming a ghost actor launders (j) [ran]

- **Lie:** `a1.ghost-like2` emits `note(tx, "turn", { actor: "ghost/none", … })` just before `like`'s second mint, and sends the ending as `evidenceOnly`.
  - `lifeOver` sees an owner that publishes nothing, so "gone", and pays (`drive.ts:172-177`).
  - Result: the (j) kills in STORE-05 and MED-01 are gone. It is red only by `(j) superseded` in one MED-01 case, a side effect of the wrong owner.
  - With `save`: (j) goes from 19 to 14 kills.
- **Why not High:** it needs two false self-reports, and it is still red by a named oracle.
- **Fix:** attribute only to an actor the suite addressed (`known`) or that published before. A `turn` of an unknown actor is itself red.

### M3''. A4: (j) is blind to a refusal's lost second try [ran]

- **Lie:** `a4.refused-fence` and `a4.refused-denied` drop D50's redelivery and say `fence` (clears every refusal, `drive.ts:298-300`) or `Denied`.
  - Each gives 32 named fails, **0 by (j)**.
  - PAY-11, REV8-KEPT and REV9-M1 catch it by hand.
- **Fix:** `fence` clears only the refusals of the fenced attempt or timer it names; `Denied` pays only its own event of the same actor.

### Inventory: misclassified inputs [read]

1. **Row 15 (`parked`, `kept`) is "Checked" but is an excuse at the runtime's word.** The wait it checks against is the runtime's too. H1'' shows it.
2. **Rows 2-3 together are not what D154 says.**
   - D154 says the move happens "while the compiled machine can let the op go".
   - The code checks a global op-name set (M1''), and `mayLetGo` checks no set at all.
3. **Row 4 is broader than "driven to the owner".**
   - A driven reload adds every mapped event of every op to `drivenAny`, for every actor (`drive.ts:518`).
   - `advance` adds every schedule event (`:700`).
   - So after any reload in a `do`, `cancelSeen` is true for every op that some outcome event cancels.
   - I did not get a lie to fire there (L2).
4. **Row 18 (`DisposeStart`):**
   - `runtimeDisposed` is sticky: after one driven dispose, a later false `DisposeStart` turns the ledger off.
   - The `Superseded` oracle skips a whole batch that holds any `DisposeStart` (`:237`).
   - Low.
5. **Row 13, lookups:** any move of the owner supersedes a lookup (`:250`). Rule 52 binds a lookup to its activation, not to any move. Low.
6. **Row 14 (A2):** `heard` is batch-wide, so any actor's turn pays every `delivered`. My lies did not exploit it (see below).

Nothing else excuses at the runtime's word outside A1-A7. A3 is the one that matters.

## Allowances and D154 limits, by lie [ran]

All named-only (`--no-output`), on a copy of `round-10`, edit at `turn.ts:1126` unless stated.

| Allowance | Lie | Named fails | By (j) | Judgement |
|---|---|---|---|---|
| A1 attribution | `a1.ghost-like2` / `-save` | 1 / 31 | 1 (superseded, incidental) / 14 | Medium (M2''). Fix before entities: fan-out makes attribution matter |
| A2 `delivered` | `a2.deliv-like2nc` / `-save` / `-fail-samemail` | 2 / 31 / 12 | 2 / 19 / 12 | Tolerable: red by (j) wherever it fires |
| A3 `parked` | `a3.park-like2nc` / `-save` | **0** / 26 | **0** / 0 | **Blocker (H1'')** |
| A4 refusals | `a4.refused-fence` / `-denied` | 32 / 32 | 0 / 0 | Medium (M3''): hand cases only |
| A5 `UnmappedEnding` | `a5.unmapped-like2nc` / `-save` | 2 / (not printed) | 0 | Tolerable: D130 (an unnamed issue fails) catches it, as stated |
| A6 `AbandonedFiber` | `a6.abandoned-like2` / `-save` (ending not noted, not delivered) | 3 / 31 | 0 / 14 | Tolerable: `checkMints` ("a minted Attempt vanished") catches it |
| A7 `disabled` + `ModuleDefect` | not built | | | [reasoning] Tolerable: the `ModuleDefect` must be named by the case (D130), so a lie needs a case that expects one |
| D154: owner moved | `d154.moved-like-released` | 1 | **0** | Medium, entity blocker (M1'') |
| D154: owner moved | `d154.moved-save-released` | 0 | 0 | Vacuous: `probe.moved-save` fires in no case |
| D154: cancel by event | `d154.event-fail-released`, `-like-released` | 0 | 0 | Vacuous: `probe.event-fail` fires in no case. Not shown either way (L2) |

## Low

- **L1** [ran], M1' residue. In a copy, I changed `type-tests.ts:18` to `key: ["a"], concurrency: "rejct"`. The directive is kept, and its line now errors for a typo, not for the refusal its words name.
  - Result: `TYPES PASS tsc clean, 8 directives, each by its words`.
  - The lock still sees the text.
  - `@ts-expect-error` names no error code. A follow-up could pin each error's code from `tsc --noEmit` output with the directive removed.
- **L2** [reasoning], the cancel-by-event limit. My event lies never fired: no batch had a failure ending beside a same-actor `send`.
  - The over-broad `drivenAny` (inventory 3) is not shown to pass, and not shown to be safe.
  - A case is owed: a cancel alternative whose guard refuses, beside a dropped ending.

## falsify.ts, every part [ran]

| Part | Result |
|---|---|
| `watch` | 3 ok |
| `suite` | 12 ok (null 0/727, constantHash 61, noEvidence 36, noWaits 179, bogusIssue 5, lyingReplay 2, junkDiskKey 255) |
| `search` | 42 ok |
| `tamper` | 10 ok, run from the main checkout at `ef3e1fa9` (it writes only under the OS temp dir). In the worktree, 3 are BAD with "no tsc found": `falsify.ts:88` symlinks `../../../../node_modules`, which a fresh worktree lacks. An environment artifact, not a gate failure. Worth a clear error |
| `mutants` | 3 ok (g125 by 2 cases, timer fence 1, dispose reads 1) |
| `lies` | 11 ok |

Every part ends `FALSIFY every gate fails on what it should`, exit 0.

## Not reached

- `mutate.ts`'s later gates on my survivors.
- The variant adapter's 73/26 counts.
- Real Chrome runs.
- A lie for A7.
- Firing the cancel-by-event limit.
