# Blind audit of conformance expected results

Commit 3836abc4. Status: an audit, nothing here is decided. Marks: [ran] run against `round-9/adapter.ts`, [read] read in the source, [reasoning] my inference.

## Verdict

No sampled expectation is shown to be wrong. In 3 of 25 cases the suite disagrees with `machine-design.md`, and all 3 are the design being stale: the runtime and suite follow a later decision the design never took in. In 6 more cases the design does not determine the result, and the suite pins a choice made elsewhere. This holds for this sample only.

| Measure | Result |
| --- | --- |
| Cases compared | 25, one variant each |
| Agree on everything the design determines | 16 (64%) |
| Under-specified, the suite chooses | 6 (24%) |
| Disagree | 3 (12%): design stale 3, suite wrong 0, ambiguity 0 |
| My reading wrong (not a disagreement) | 1 point, PAY-08 |
| Cases with an assertion weaker than the design requires | 7, one shown vacuous [ran] |
| Cases citing nothing `machine-design.md` states | 10 |

All 25 cases pass on the round 9 runtime, 122 variants in all [ran]. So a pass here says "the runtime matches the suite", and for the 9 cases above it does not say "matches the design".

## Sampling, and what limits it

- **Method.** Within each of the 15 scenario files, cases ranked by `sha1("audit-blind-3836abc4:"+id)`; one variant per case, top of `sha1("audit-v:"+id#name)`. Allocation: pay 3, frag 2, review 2, round4 2, store 2, round5 1, round6 2, order 2, round7 2, round8 1, round9 1, round9b 1, flows 1, stream 1, streams5 2. Population: 176 ids. Small strata make the rate rough: 3 in 25 cannot support a suite-wide figure.
- **Reduced.** Planned about 50; cut to 25 on the coordinator's usage instruction, before any derivation, by taking the top ranks. Only 25 of the 122 variants those cases hold were compared.
- **Not reached.** The widened scope: `round-9/typed/`, `round-9/cli/` pins, `round-9/reality/` scoring and `round-9/entity-model-2/`. Skipped on the same instruction. No statement here covers them.
- **Design coverage.** Read: 2.1–2.5, 2.7.1 (first part), 2.7.12, 2.7.13, 2.7.15, 2.8.5, 2.8.6, 2.9.3, 2.11.4, 2.11.6–2.11.11. Not read: the rest of the 8,525 lines, so a "not in the design" claim beyond a grep is limited to those sections. Greps for a repair bound and a capture interval found neither.
- **Blindness was imperfect.**
  - Variant names state expected behaviour. Six sampled cases had names visible at derivation (PAY-08, FRAG-08, FRAG-11, HIGH-03, REV4-H2, REV4-H3); the others were masked as `v1…` once I noticed, or have no variant.
  - Those six gave 0 disagreements, the other 19 gave 3. Too few to conclude anything, but it is the direction leakage would produce.
  - Fixture comments, allowed by the brief, also hint at intent. `cites` were visible.
  - The first CLI listing exposed `cli/main.ts`'s expected values in full before any derivation. That alone would have made CLI pins non-blind; they were not audited.
- **Hash.** The blind file was hashed before the assertions were opened: `a9447d3fd24ea91aefed01258ddc07e3ff4756a44b1f34e6eb049479b7f0bb5d`. It is reproduced verbatim in the appendix (hash covers the text between the fence lines, with a trailing newline).

## Disagreements

**LIB-02: design stale.** Two actors, A's like lost, B writes the same record, repair lands.
- Design: the queue is held "until that repair settles" (rule 30, 2.8.6 table), then the next is sent (2.8.5's trace). A retry "joins at the tail" (2.8.6 E7, rule 31), "behind any newer write". So B goes first.
- Suite: B waits, A's retry goes first, then B. Runtime agrees: after the repair, requests are `[true]`, B's wait is `queue` behind A's Attempt [ran].
- Cite: convergence-1 D3, "a retry never rejoins", because rejoining makes a queue-lane deadlock; S5. D40 restates it for a live hold.
- Effect: 3 sentences in the design describe behaviour the runtime deliberately does not have. Also rule 32's and 2.8.5's limit wording should be rechecked. Reasoning for the suite's side looks sound [reasoning].

**STORE-07 `a-late-repair-is-fenced`: design stale.**
- Design: rule 25, "no Flow timeout", and no bound on a repair in the sections read. So a hung repair holds on, and its late answer writes `stale`.
- Suite: the repair ends at 30 s, the late answer is dropped, `fence` evidence.
- Cite: convergence D40 (D12 made exact). This is a Flow timeout on Flow's own read. Rule 25's wording speaks of "a session or a call", so the design needs either a carve-out or a new rule.

**REV9-EDGE `two-parked-on-a-lane-at-boot-are-both-heard`: design stale.**
- Design: success cell gives `Idle`; "step 1's admitted ending keeps its cell" (2.5). "Counts as delivered" names only `Denied` and `Unhandled`, so `InvalidTurn` is left open. A second `Go` on an `Idle` lane mints.
- Suite: an ending whose turn refused twice stays on the lane as `parked`, the second `Go` adds another, and both are delivered at the next boot.
- Cite: D109, D118, D123. Rule 8 is the design's nearest sentence and does not say this. The mechanism of the second parked entry is [read] from the assertions, not probed.

## Under-specified by the design

| Case | Missing or ambiguous | Suite pins | Comes from |
| --- | --- | --- | --- |
| HIGH-03 `a-read-mapper-throws` | Rule 37 vs 27: is a throw in a domain `reads` mapper the read's `Defect`? | issue `UserClosure`, store lives | D46. See below: the machine hears `Listed` [ran] |
| REV4-H2 `a-confirms-mapper…` | Rule 27/30 have nothing on `confirms` throwing | record `uncertain`, stays after failed repair | D59 and later |
| REV4-H3 `lane-head-of-no-shape` | Rule 46 covers only a bad key or a gone operation | alive, `RecordQuarantined`; design's word would be `orphaned` | D57, D61 |
| REV7-M9 `memory-that-cannot-encode…` | 2.2.2, rule 12: memory that cannot encode | turn commits, last good capture kept, recovers | D89 (replaces D57) |
| REV7-M1 `a-success-does-not-come-back…` | No capture interval; I allowed `B` or `U` | `B`, no lane, flush at once | D84 |
| REV9-STREAM `a-refused-stream-failure…` | T1 marks `InvalidTurn` in `Ended` as "—", yet it is reachable; no refusal retry in 2.5 | refused twice, `stranded` wait, reload clears | D50, D118 |

Partial gaps inside cases counted as agreeing: REV6-M7 (no capture retry or 5 s interval in the design; D80), SURV-08 (does a disposal force a repair? table says nothing is invoked from its start, rule 30 says forced; the runtime sends one [ran]), FRAG-08 (does a rebind's `unknown { Restored }` force a repair?).

## Weak assertions

- **FRAG-08 `rebind-delivers-a-hold-once`: vacuous last check.** "the new incarnation owns it" is `keys("like").length === 1`, which stays true with `ReconcileLike` removed: keys 1, requests 1, against keys 1, requests 2 with it [ran]. Nothing proves the re-send. Should assert requests 2.
- **HIGH-03.** No ending asserted. The runtime records the read as `success` and delivers `Listed` with nothing stored [ran]. Under rule 37's reading I expected `ListFailed`. A machine would believe it has a list. Worth a call by the owner: this is the sample's most consequential loose end [reasoning].
- **SURV-08.** No request count or `Disposed` reason. Both are right when run: 1 request, `failure/Disposed` after the head's `unknown/Interrupted`, so the W order matches the table [ran]. The case's comment says the head's prediction stays "until it ends", but the head has ended by then and it stays until the repair [ran].
- **REV8-STORM `an-ordinary-burst…`.** Counts 1,000 requests; not rule 42's 999 `Superseded` or only-latest-delivered [read].
- **SPIKE-03.** No check of the one `missed Unproven` (T1) [read].
- **STREAM5-REPAIR `a-release-abandons…`.** No check that no bookmark record exists (T2 row 3) or that notices are 0 [read].
- **STREAM5-PULL `every-value…`.** No check of one per turn or notices 0 [read].

## Citations

- **Different things under one name.** The suite's `D` numbers are convergence decisions; the design has its own `D1`–`D21` and `D53`. 10 suite ids collide by number. Checked: `D3` in the design is "`Flow.uncertain` is kept" and a principles row on feedback loops, and `D6` is about reading a lane; in the suite `D3` means record order, and DRV-02 uses `D6` for a start that throws (I did not open convergence D6). LIB-02 and SURV-08 cite `D3`, DRV-02 cites `D6`. A reader following them lands on the wrong text [read]. The other 8 collisions were not checked.
- **Suite-wide counts** [ran, a script]: 71 distinct `D` ids, 176 of 520 cite uses; 61 ids do not occur in the design at all.
- **10 of 25 sampled cases cite nothing the design states:** STORE-07, REV6-M7, REV6-M8, DRV-02, REV7-M9, REV7-M1, REV8-STORM, REV9-STREAM, REV9-EDGE, LIB-02. Their `O3`/`O5` ids are plan ids I did not open.
- **A cited rule that does not state the assertion:** REV4-H2 cites rule 32 and 2.8.6, which say success clears marks and are silent on a throwing `confirms`. HIGH-03 cites rule 27, silent on a throwing read mapper. The rest of the sample's rule and cell cites do state what they assert [read].

## Corrections to my own reading

PAY-08: I marked "does the boot frame show `uncertain`?" as undetermined. The suite pins false, and the restore row's "delivered → `Held`" does determine that. My error, not a gap.

## All cases

| Case | Variant | Result |
| --- | --- | --- |
| PAY-04 | run | agree |
| PAY-02 | run | agree |
| PAY-08 | reloadDuringCharge | agree |
| FRAG-08 | rebind-delivers-a-hold-once | agree, weak |
| FRAG-11 | postedInOrder | agree |
| SURV-08 | run | agree, weak |
| HIGH-03 | a-read-mapper-throws | under-specified, weak |
| REV4-H2 | a-confirms-mapper-that-throws-keeps-the-mark | under-specified |
| REV4-H3 | lane-head-of-no-shape | under-specified |
| STORE-05 | an-unresolved-mark-outlives-another-success | agree |
| STORE-07 | a-late-repair-is-fenced | design stale |
| REV5-H1 | prototype-names-at-the-doors | agree |
| REV6-M7 | newer-state-wins-a-retry | agree |
| REV6-M8 | a-declared-decode-gives-the-new-field-its-default | agree |
| ORDER-05 | run | agree |
| DRV-02 | run | agree |
| REV7-M9 | memory-that-cannot-encode-does-not-refuse-the-turn | under-specified |
| REV7-M1 | a-success-does-not-come-back-as-a-hold | under-specified |
| REV8-STORM | an-ordinary-burst-goes-through | agree, weak |
| REV9-STREAM | a-refused-stream-failure-is-a-stranded-wait | under-specified |
| REV9-EDGE | two-parked-on-a-lane-at-boot-are-both-heard | design stale |
| LIB-02 | run | design stale |
| SPIKE-03 | refetch-forgets-the-place | agree, weak |
| STREAM5-REPAIR | a-release-abandons-the-read | agree, weak |
| STREAM5-PULL | every-value-still-arrives-in-order | agree, weak |

## Appendix: the blind file, verbatim

~~~text
# Blind derivations, machine-design.md + fixtures only, before reading any selected assert. commit 3836abc4.
Sample: 25 cases, top-ranked by sha1("audit-blind-3836abc4:"+id) within each scenario file (pay3 frag2 review2 round4 2 store2 round5 1 round6 2 order2 round7 2 round8 1 round9 1 round9b 1 flows1 stream1 streams5 2); one variant each, top by sha1("audit-v:"+id#name).
U = design does not determine it; rule named.

PAY-04: final PLACING; authorized true; afterUnsure true; notice ""; pay requests 2, 1 distinct key (r19); pay lane Idle after success; retryCount was 1 at invocation (counted at invoked cell); place lane InFlight, not sent (no ack yet), 0 place requests; re-send needed a capture ack (r46) before request 2.
PAY-02: stays PAYING; 1 pay request; second commit NotSent{Rejected}, attempt undefined (r16); PayNotSent why Rejected hits alt 0, no move; notice ""; lane still InFlight, pending true; second has no mint.
PAY-08 reloadDuringCharge: reload: ack'd Attempt -> unknown{Restored}, delivered, Held; PayUnsure from saved leaf PAYING -> UNSURE, afterUnsure true. Late answer of dead send: no ending delivered, no state change. 3000 -> CheckTick; order null stays; intent requires_capture -> PLACING, pay cancel (Released), place commit. After ack, place ok -> PAID, receipt {o1, afterUnsure true, alreadyPlaced false}. pay requests 1, keys 1; place requests 1. boot frame 2 precedes delivery; U: whether the boot frame itself shows pay uncertain (2.7.15 flags derived; restore row says delivered -> Held; publication order at restore not stated) (rule 44/2.5).
FRAG-08 rebind: after lost: LikeUnsure alt0, no action, Held, repair sent. Dispose keeps lane (r44). Ensure: exactly one further unknown{Restored}, LikeUnsure again. ReconcileLike -> re-send: like requests 2, keys 1, pending true, uncertain false, retryCount 1. No Load, so record absent before repair then server value; mark uncertain remains. U: does a rebind's unknown{Restored} force a second repair (r30 forces at settlement; 2.7.12 says repaired only on restore) (rule 30/44).
FRAG-11 postedInOrder: after two Posts row pending true, waiting true, outstanding 1; 1 request out. Answer -> Posted, promote c2, sent. Answer -> Posted; server posts [first, second]; 2 distinct keys; lane Idle, row idle; order by mint.
SURV-08: 1 like request only; W never invoked. W ends NotSent{Disposed}, evidence (non-persisted); its prediction removed, no repair. Head: Runtime O6 settles within bound else unknown. U: repair after head unknown on disposal: r30 "forced" vs table "from its start nothing is invoked"; U: O6 bound value not in design (2.7.13 Runtime disposal row).
HIGH-03 a-read-mapper-throws: list {ok:null} makes reads mapper throw; read defect ends failure Defect (r37) -> ListFailed; actor issue; no store change; actor alive; then Toggle sends 1 like. U: whether a domain `reads` mapper throw counts as the read's defect vs a store defect; design says nothing of store-mapper throws (rule 37/27).
REV4-H2 a-confirms-mapper-throws: U in the main (rule 27/30: no text on confirms throwing at settlement). What design does fix: send succeeded so the Attempt's ending is success, Settled delivered once, lane Idle (r18). Principle (no silent wrong): record must not read clean-confirmed with a value nobody confirmed; I expect a mark or repair, but that is inference, not text. Repair after that: U.
REV4-H3 lane-head-of-no-shape: U (rule 46: only "key no longer decodes"/"operation gone" go to `orphaned`; a corrupted head with good key not covered). Expect: boot survives, no send, no fake ending for id 5, an issue/evidence. Whether lane goes orphaned or is dropped: U.
STORE-05 v5: a0 lost -> Unsure, Held, r1 uncertain for a0, repair. a1 (mask 2 = r2) sends freely (different record queue), success. r1 uncertain stays; r2 not uncertain (r32 per record); a0 row uncertain true; server r1 0, r2 2; a1 lane Idle.
STORE-07 v3: design has NO repair bound (r25, grep finds none). So: repair hangs, record queue held forever, 30 s does nothing; late answer settles the repair and writes title "stale"; mark stays. U if suite relies on a bound: no rule. (rule 30 "until that repair settles")
REV5-H1 v1: all sends Unhandled or InvalidEvent, no crash, no prototype pollution, memory and state unchanged, runtime alive. Exact code U (rule 2: InvalidEvent only named for host/internal events; 2.5 step 2 Unhandled).
REV6-M7 v2: end memory muted false. Disk after 5000: not true; muted false once a capture lands. A failed capture leaves last good; retry policy U (no capture interval or retry in design; Persistence plan only).
REV6-M8 v1: restore decodes with restore default: unknown{Restored} once -> Unsure under release 2: oks 0+0+100 = 100; lane Held; no issue; 1 request; no re-send.
ORDER-05: frames after answer: first publication settlement: record confirmed liked true while row pending true; later frame row gone/idle (r27, 2.8.1). At least 2 frames.
DRV-02: job start throw -> unknown{Defect} plus actor issue (2.7.1); Ended how=unknown-mapped once. other invoked independently and ends success ("sync"). Turn commits. Job lane Held (reject/latest) if holding; U: throw before fiber start counted as "commit threw" assumed yes.
REV7-M9 v5: U (no rule on memory that cannot encode; 2.2.2 says Schema, fixture has none). Must: Note "better" reaches memory; a bad value does not wedge saving. Whether NoteBad refuses (InvalidTurn) or commits and blocks one capture: U. rule 12/46.
REV7-M1 v1: U on capture interval (none in design). Fixed: no second charge; no regress to a state with lost hold: after reload either B (success captured, last n:1) or U with Held (unknown{Restored}, r17 "across a crash the restore row decides"); never W with idle lane, never A.
REV8-STORM v4: 1000 lookups: each releases previous (Superseded evidence, r42) 999; 1000 turns accepted; looked true; no issue; only latest deliverable; state unchanged. U: bound on released lookups still open outside (OPS O2 shared request).
REV9-STREAM v1: no reconnect: Connecting, stream fails -> end(e): Ended; failure queued; Ended handler throws -> InvalidTurn on a delivery in Ended, T1 says "—" (cannot occur): U, table gap (Streams T1 InvalidTurn row). Fault times 2. memory.ended stays "" for the refused turn. Reload: new session, Connecting, no replay (T9). Rule 8 says never lost; T9 no replay: tension.
REV9-EDGE v23: Saved throws -> InvalidTurn, ending cell kept (2.5 step 2/5), lane Idle (success), state stays W, row idle. Go again: mints new Attempt (lane Idle), waits ack. Fault on NotSent irrelevant until reload. Reload: never ack'd -> NotSent{Restored}; mapper throws under fault if not spent. U: a mapped ending whose turn is InvalidTurn: "counts as delivered" names only Denied/Unhandled (2.7.13, r8) - is the Saved re-delivered, lost, or kept? U. U: a mapper throw on NotSent.
LIB-02: IB's write waits for repair then sends; IA retry joins tail behind it. Answer applies IB: server liked false. IA mark stays (Attempt unresolved, r32). IA re-send now out, row pending; IB idle. like requests 3, IA key shared by 2.
SPIKE-03 v3: Refetch: no catchUp: one missed Unproven (T1), b={at undefined, filled false}. Reload: new session Connecting. No replay. Disk state after reload per last capture: U on timing; if captured, at undefined.
STREAM5-REPAIR v16: first open, Repairing, read out. Leave: read aborted (signal aborted), session Releasing, row undefined, state CLOSED, messages [], notices 0, no bookmark record (made at complete; interrupted first read stays first, T2 row 3).
STREAM5-PULL v2: m1..m4 one per turn, in order; pulled at turn pace; bookmark at 4; notices 0; Live; pages 0.
~~~
