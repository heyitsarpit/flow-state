# Gate-close check of oracle (j) after stage L

Commit `74d500a1`, branch `flow-rewrite`. This is an independent check, not another attack round. I built none of what it checks. It ran from a detached worktree at `scratchpad/gateclose`, with the main checkout's `node_modules` linked at the worktree root (as D172 does, so `effect` resolves to the pinned 4.0.5 and not Bun's cached 4.1.2). The worktree was removed by exact path at the end. The lie runner is `scratchpad/gateclose-scripts/run-mut.ts`. It is byte for byte `review-k-scripts/run-mut.ts`, except `P`, which points at this worktree, and one comment line. One more script, `scratchpad/gateclose-scripts/all-fails.ts`, prints every FAIL line, output ones included, for the probes in section 3. Every command was bounded by `watch.ts --seconds 295` and run one at a time, with a peak of 1430 MB. No subagents, no commits, and no repo writes besides this file. One edit went into the worktree only, in section 3, and was reverted before the gates in section 4.

The code under test is unchanged since `c93813f1`. `git diff c93813f1 74d500a1` touches only docs and `codec/`.

Marks: [ran] reproduced at `74d500a1`; [read] seen in the code; [reasoning] inferred, not run.

## Verdict: BLOCKED

There is one plain miss in ordinary single-actor delivery. A **late** ending (rule 14) that the runtime says is `delivered` and `Unhandled`, and that runs nowhere, passes (j). This happens even when the late start's chain handles the event with no token. This is review H7 (the runtime's `Unhandled` pays) closed only for current deliveries. The exemption is not stated: L4 and D4 say such a delivery is red, and the code skips it when `s.late` holds. The shape is the most ordinary one there is: leave a screen while a payment or save is in flight, and the reply comes back. The fix is one token. Section 3 has the lie, the cases and the fix [ran].

Everything else holds. The review's lies are red as the builder reported, every one of them [ran]. The harness does not change runtime behaviour [ran, read]. The gates are green [ran].

## 1. The review's lies, rerun [ran]

All edits applied (`unapplied: []`). `--no-output`. The table gives failing cases with a `(j)` FAIL line out of all failing cases. Every result matches `ending-check-design.md` section 6 and `round-10/STATUS.md`.

| Lie | Here | Builder | Lie | Here | Builder |
|---|---|---|---|---|---|
| control | 742/742, RECIPIENTS = lock | same | `k.no-boot-ev+at-send` | 149/152 | 149/152 |
| `k.no-leaves+at-send` | 107/107 | 107/107 | `k.no-boot-ev+boot-order` | 149/152 | 149/152 |
| `k.held-silent` | 8/8 | 8/8 | `k.restored-as-success` | 57/60 | 57/60 |
| `k.drop-row` | 62/68 | 62/68 | `k.failure-as-success` | 90/96 | 90/96 |
| `k.drop-copy` | 9/9 | 9/9 | `k.send-ahead` | 1/2 | 1/2 |
| `k.vanish-live` | 80/85 | 80/85 | `k.parked-every-boot-silent` | 24/25 | 24/25 |
| `k.ghost-life` | 9/9 | 9/9 | `k.parked-reversed` | 1/1 | 1/1 |
| `k.late-as-current` | 5/6 | 5/6 | `k.supersede-head` | 11/13 | 11/13 |
| `k.restored-from-root` | 13/15 | 13/15 | `h.boot-order` | 2/2 (FRAG-24 slow-load, R10-BOOT-ORDER) | 2/2 |
| `k.claim-unhandled` | 49/56 | 49/56 | `h.restore-at-send` | 17/17 | 17/17 |
| `k.ev-late+at-send` | 17/17 | 17/17 | | | |

The limit lies behave as stated:
- `k.stream-other` is 0 by (j). It is red only in REV6-H4 by a hand assert (L10).
- `probe.frozen-at-send` fires in 4 cases (L11).
- `probe.read-orphan` fires in none (L12).

## 2. The stage L diff (`6da37c42..74d500a1`), as the missed mid-session review

**Runtime behaviour is unchanged** [ran, read]. `round-10/` changes only `adapter.ts`'s `disk.parked`, a codec reader that only the suite calls (`disk` is used nowhere else in the runtime). The new wraps in `drive.ts` only record and pass through:
- `activities` input Slots, which record who opened a stream's session
- commit and lookup input Slots (`owned`), which record each ask's owner node
- `memory.restore`, which notes a throw and rethrows it
- ears on stream events, which return `true` like the old ears

With output, every old case's output hash is unchanged. `expected-output.txt` gains only the new FRAG-24 variant.

**Trust in the runtime's word.** Most of R6 is closed for real:
- alive is `ensured`
- what a boot owes comes from `disk.heads` and `disk.parked`
- `loading` is `fake.loadPending`
- the anchor runs at the first run, at the boot evidence, or at the step's end
- the codec reads a copy of the bytes

What is still trusted:

| Trusted | Where | Stated? |
|---|---|---|
| The batch's `turn`/`Denied`/`Unhandled`/`refused` pays an unobserved delivery (`heard`, `drive.ts:894`) unless the free-handler check reds it. That check runs only for a **current** start (`drive.ts:851`, `s && !s.late && freeHandler(...)`) | `drive.ts:846-852` | **No.** L4 says "a delivery to a state with a token-free alternative is red (D4)". The code comment says "Only a token-gated or unhandled event is A2's". Neither is true for late deliveries. **This is the block** (section 3) |
| The free-handler check is skipped for a delivery whose owner is unknown, which includes any attempt the runtime's own `invoked` evidence says was resent (`drive.ts:679`, from `sends`, the gens the runtime reports). The fake's request count is not consulted | `drive.ts:679`, `:849` | In part. L7 names "a resend by a retry" for the start node, not for the no-run check, and not that the runtime's word decides it is a resend. Low |
| `restoreThrew` is one flag per case: any restore throw lets a `RecordQuarantined` excuse any actor | `drive.ts:522` | No. Low: it needs a throwing restore in the same case |
| The live channel comes from the `ending` evidence | `eventOf` | Yes (L9) |

**Faked checks: none found** [read]. Each new message has a lie in section 1 that reaches it. The rule 47 assertion runs at `start`. The disk-parked check is gated on `captureMs: 0`, every write landed, and no failing store, which matches D190's stated cost.

## 3. The stated limits L1-L13

| Limit | Honest, with a named case? | A single-actor delivery miss? |
|---|---|---|
| L1 codec and restore share one decode | Yes | No: a Port-contract issue |
| L2 a turn's target is not derived | Yes | No: a turn bug, not delivery. Hand asserts and output own it |
| L3 order across actors | Yes, not promised | No, by definition |
| L4 A2 where every handler is token-gated | **Its reason is false as worded.** It claims a token-free handler makes a no-run delivery red. That holds for current starts only | **Yes, for late deliveries: below** |
| L5 a serial moved by a spread | Yes | No |
| L6 a copy unplaced by a lost reset | Yes | No: copies |
| L7 "late" sampled at batch ends | Yes. Its named case is a follow-up. A commoner instance: REV8-H1/a-refused-head-promotes-what-waits (`Go Go` re-enters `W`, so the first charge's `No` is late and Denied by rule 15). Under `k.late-as-current` it turns to `A` and is red by **output only** [ran]. Name it as L7's case | Stated. Not blocking alone |
| L8 rule 15's active subroutine | Yes (REV5-S hand assert) | No |
| L9 the live channel is the ending evidence's word | Yes. Its reason is the weakest: the suite wraps the compiled op and could tap the commit's exit. It concerns what the ending is, though, not where it goes | No |
| L10 a stream frame's session | Yes for the session. Also unstated: stream runs are not conserved. An ear on a stream-only event returns before `ears.push` (`drive.ts` ear), so a frame dropped or run twice in one actor is not counted by (j) [read]. Say so in L10 | Not tested. Stream coalescing may make counts legitimately loose [reasoning] |
| L11 frozen copies | Yes, no case reaches it | No |
| L12 two incarnations at one path | Yes, no case fires it | No |
| L13 an empty boot after the runtime's own bound | Yes (the bound is `bounds.bootMs`, the runtime's) | No: the records are left unread on disk and not overwritten |

### The block: a late ending said `Unhandled`, run nowhere

Lie `g.late-unhandled`, one edit to `round-10/turn.ts` `deliver`:

```ts
// before
const { start, late } = routeFrom(tx, a, item, inc); runTurn(tx, a, path, ev, start, late, item);
// lie: rule 14's late route lost; the runtime says Unhandled, a legitimate word when no handler exists
const { start, late } = routeFrom(tx, a, item, inc); if (late) { note(tx, "Unhandled", { event: ev.tag }); return; } runTurn(tx, a, path, ev, start, late, item);
```

Results [ran]:
- **`--no-output`: 11 failing cases, 1 by (j).** That one is REV8-H1, and only because L7 takes its late ending for current. The other 10 are red by hand asserts alone: PAY-07/leaveMidCharge "void sent", SURV-01 "late", SURV-02 "state", FRAG-10/lateChallenge, REV4-S2 ×2, and others.
- With output, 17 cases fail. Six are red by output alone (PAY-03, PAY-07/late-in-a-new-PAYING, PAY-12/shuffle, PAY-19/place-answers-first, FRAG-10/lateWhilePaying, REV5-S). So the lie changes behaviour in every case where `probe.late` fires, and (j) sees one of them.
- Unobserved (A2) goes from 143 to 215.
- The RECIPIENTS lock prints "moved". That line is a regression pin for this runtime, not an oracle for another one.
- Control: `g.late-silent`, the same drop with no `Unhandled`, is red by `(j) an ending reached nobody` in 17 of 17. The miss is exactly the runtime's `Unhandled` paying, which is R6.

Why it blocks: one actor, one op, no reload and no copies. An ending owed to a live recipient whose state chain handles the event with no token reaches nobody, and (j) is green. This is D4's "once, not zero", in the most common late shape: PAY-07/leaveMidCharge and SURV-02's list/detail navigation.

Fix, tried in the worktree only and reverted [ran]. At `drive.ts:851`, drop `!s.late &&`: `if (s && freeHandler(...))`. The late start's chain is what the start-node check already trusts. Results:
- **The control stays 742/742 (`--no-output`), with RECIPIENTS identical to the lock.** The only extra summary item is the drive.ts hash, which is expected.
- `g.late-unhandled` becomes red by `(j) delivered, and no handler ran` in **16 of 17**. FRAG-09/voidLostRace throws in the fake first.

The direction of L7's error makes the fix safe from false greens. The suite's live set can only be a superset of the true one, so a false red is possible only if an ancestor left and came back inside one batch, and that red is loud. If that is wanted, state it under L7. Add `g.late-unhandled` to `falsify --part lies` with the mark `(j) delivered, and no handler ran`.

## 4. Gates, once [ran]

| Gate | Result |
|---|---|
| Suite, `main.ts --round 10 --runtime ../round-10/adapter.ts` (output and catalog) | `742/742`; unlogged none; stale lock 0; catalog none; RECIPIENTS equal to `expected-recipients.txt` (no "moved" line); 62 s |
| 5 s gate, `gate5s.ts --runtime ../round-10/adapter.ts` | `GATE-5S 30 failed, 30 expected; unexpected: none; failing differently: none; expected but passed: none`; 64 s |
| `mutate-one.ts --runtime ../round-10/adapter.ts` (control) | `{"killedBy":null,"killers":[],"search":"not run"}`; 192 s, peak 1430 MB |

## What closes the gate

1. `conformance/drive.ts:851`: `s && !s.late && freeHandler(` becomes `s && freeHandler(`.
2. `conformance/falsify.ts`, `LIES10L`: add `g.late-unhandled` (the edit above), marked `(j) delivered, and no handler ran`.
3. `conformance-audit/ending-check-design.md` section 4: L7 gains REV8-H1 as a named case. It also says that an unknown owner (a resend, by the runtime's `invoked`) skips the no-run check too. L10 says stream runs are placed, not counted.
4. Rerun the suite, the 5 s gate, and `falsify --lie g.late-unhandled,k.claim-unhandled`. Nothing else was found that blocks.
