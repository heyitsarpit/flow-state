# Review 1 of the Story proposal (2026-10-30)

Two independent read-only reviews (Sonnet): correctness and consistency, and simplicity and playback fit. D1–D3 were
not relitigated. Findings marked **verified** were checked against the source by the main session.

## Correctness and consistency

**High**
- **C-H1 Lanes on snapshots need a Machines O8 amendment** (verified). Mc:162-166 gives the snapshot a closed field list
  (state, memory, context, issues, lifecycle, activities) and says "Reading an old snapshot never consults live lanes".
  Rule 8 and 3.6 put lanes on the snapshot but amend only Operations. Add a Machines O8 row to 6.4.
- **C-H2 "Admitted" means two things.** Merge 2 uses it for step 1 of the ending's turn (M2:395-397, 481); this proposal
  also uses it for an arrival entering the mailbox (rule 9, 3.7). Use "queued" for mailbox entry, keep "admitted" for
  M2's step 1, and say a queued ending is one lane entry in phase `settled`.
- **C-H3 Run-scoped fixtures contradict "Fixtures may depend on setup services and shadow those services"** (verified,
  T:57). Rule 11 and section 5 build fixtures before any tab's Runtime. Restrict fixture dependencies to run-scoped
  services, or share only the truth `Ref` and build the rest per tab.
- **C-H4 Section 5 says calls, lives and endings are evidence the Runtime "already emits" (In O4)** (verified: In:85-90
  lists no such kinds), and cites D:1325, which amends Inspection O1. Say they are new Inspection O4 kinds.

**Medium**
- C-M1 The equal-deadline tiebreak orders only Flow schedules; a fixture sleep at the same instant (the P1 race shape)
  has no order. Add a final tiebreak (owner kind, then registration order).
- C-M2 D2's consequence (callback and exit names unique within a contract) has no change row or `flow check` row; the
  design's keyword row D:1261 still lists `story.machine(fragment)` and `run.calls`.
- C-M3 `Fixture.storage({ acknowledge })` would also delay bootstrap restore, so `openTab` hangs until the clock moves.
  Scope it to Attempt acknowledgement (Persistence O6).
- C-M4 A trait placed at the harness root cannot be left, so it cannot freeze. Place it on a harness child state.
- C-M5 Lane phases don't cover a kept failed or unknown Attempt (M2:435-439: `pending` false), and `pending` then holds
  non-pending items, clashing with `pay.pending`.
- C-M6 What `send` runs when arrivals are already queued (after an `advance`) is unspecified.
- C-M7 `Fixture.stateful` lacks the push/disconnect controls stateful fixtures need (T:136); unclear whether plain
  Layers are still accepted; `initial` is not in D3's signature.
- C-M8 Collapsed frames make `cause` a list, and the fragment-run type error needs `StoryRun` branded by kind: neither
  is in the change tables.
- C-M9 `LateMayNotLeave` has no readable place on the cut.
- C-M10 The keyed schedule path `s.schedules.<name>[key].dueAt` clashes with the design's `[i]` array reads (D:72-73).
- C-M11 Rule 12 makes Story ids unique across the configuration (T:12-13 says within an App), unlisted; Inspection O5's
  closed import schema needs the new checkpoint members.

**Low and wording**: `frozen` flips between 3.2 and 3.4; 3.2 uses an undefined `E`; D1's options omit `guards?`;
`kind` on pending entries and the `STATE#n` owner numbering are undefined; `TabClosed` is not an actor gap; say why
`.guards()` is not a raw state override; rule 13 and the harness rules have no row in section 7;
`InvalidStoryCommand` rejects at the command, not before execution.

**Merges 1 and 2**: every ending and reason name matches merge 2. **Determinism**: no live handles, callbacks or second
execution path; the gaps are C-M1 and C-M6.

**Citations**: about 80 checked, 12 wrong or imprecise: T:21→22, T:89-90→90-91, T:91→93 (used repeatedly), T:92-93→93-94,
T:94→~96, M2:525→524, M2:556 (Timeout drop is at M2:571, 602), M2:665, M1:214-227 (classifier is M1:148-167),
M1:224-226 (Interrupted is M1:72, 163), D:1324 (no `model()` clause; it is at D:1262, 1391), D:1325 (Inspection O1).

## Simplicity and playback fit

**Rewritten spike Stories**: the late-WrongCode race and charge-once-after-Busy take 4 scenario lines each against 8–10
in the spike; fixtures grow by about 6 lines. Authors must know that `advance` needs `.process()` (a Story ending on
`.advance()` captures stale state silently), the seeded Attempt id scheme to assert exact keys, and admission order to
index `endings[0]`.

**High**
- **S-H1 Cumulative records in five homes.** `endings` is a new top-level read while repairs, dropped deliveries,
  dropped raises and resets are evidence kinds; lane state is read twice (`pay.pending(snapshot)` and `pending` entries
  `kind: "lane"`). Put endings in the cumulative evidence list; drop lane entries from `pending`.
- **S-H2 Frame weight.** Every frame is a cut carrying cumulative calls, endings, evidence, a lives tree, every
  fixture's truth and lanes; copied per frame this is quadratic in run length. Require one append-only log with a
  per-frame length; capture truth only when it changed; put only `pending` and `retryCount` on snapshots.
- **S-H3 Collapse merges causes** (verified), turning `cause` into a list for every consumer. Never collapse across a
  command boundary instead: one frame per send, with a singular `verdict`.

**Medium**
- S-M1 Two ways to set a harness guard (option and `.guards()` command, verified). Keep the option, defer the command.
- S-M2 The `"pendingReset"` cause is visible only in `frames: "publication"` and duplicates `reset` evidence. Drop it.
- S-M3 `phase: "queued"` serves only the overlay and gives `phase` two vocabularies. Defer.
- S-M4 `owner: "PAYING#1"` (verified) is a magic activation string. Keep `route`; defer `owner` and `from`.
- S-M5 Names: `endings[].key` is a transaction key (object) while `calls`/`lives` keys are copy keys (strings);
  `pending` now has four meanings; `by: "exit"` next to `checkpoint.exit`; `Fixture.stateful` names a kind while
  `Fixture.storage` names a subject.

**Low**: `Fixture.storage({ seed })` may duplicate existing seeding; `Fixture.stateful` takes `initial` (verified) not in
D3; document the deadline tiebreak and add no more levels; say `checkpoint.exit` is the subroutine-alone shorthand.

**Rejected finding**: "`deny(...)` is defined nowhere" — `deny` is existing design API.

**Concept verdicts** (reviewer's): keep the D1–D3 concepts, the `guards` option, slim lanes on snapshots, fragment
evidence kinds, `reset` evidence, the singular `verdict` cause, the keyed `dueAt` path, `Fixture.storage({ acknowledge })`,
tab-shared fixtures, the `TabClosed` gap, `defineConfig({ stories })` and `InvalidStoryCommand`; merge `endings` into
evidence and `seed` into existing seeding; defer `.guards()`, `phase: "queued"`, `owner` and `from`; drop lane entries in
`pending`, the `pendingReset` cause and cause-merging on collapse.
