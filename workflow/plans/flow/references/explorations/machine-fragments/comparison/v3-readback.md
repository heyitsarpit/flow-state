# v3 readback: does proposal-v3.md answer the 19 UNCLEAR items alone?

Read: proposal-v3.md lines 1-870 only. The file has no heading "Changes after the build"; the final
section is "Changes after review" (line 871), and I stopped before it. Questions: the UNCLEAR list in
"Building from v3" of build-v3.md.

Totals: **18 ANSWERED, 1 PARTIAL, 0 NOT ANSWERED.**

## The 19 items

1. **Is `operations: { Auth }` / `O.Auth.verifyCode` allowed?**
   - v3: "`operations` may group operation handles one level deep (`{ Auth }` gives `O.Auth.verifyCode`)" (section 5, Machines O1). Also the section 3.1 definition comment.
   - ANSWERED.

2. **How is a required guard or callback spelled?**
   - v3: "A port declared with `{}` or a payload record is **required**" (section 2.2), with `optional(...)` as the opt-out.
   - ANSWERED.

3. **How are helpers and shared handlers declared outside a node typed, given `.at` slices?**
   - v3: "typed as present in every handler, guard and select declared at or below X, or wrapped in `Def.handler("X", …)`" (rule 1); section 2.3 row for `Def.handler` / `Def.guard`.
   - PARTIAL. Shared handlers are covered. Not covered:
     - A commit mapper declared as a `const` outside any node that reads a `.at` slice. v3's own `verify` in 3.1 reads `memory.code.value` this way, and the rule only mentions handlers, guards and selects.
     - A plain helper function (`wrongHere`) has no named input type.
     - `Def.guard` is never shown in an example.
     - The example calls `SignIn.handler(...)` while the rules say `Def.handler`.

4. **Does `S.X.is(state)` work, or only `is(snapshot)`?**
   - v3: "`token.is` accepts a snapshot or a state path, so guards write `S.X.is(state)`" (section 5, Machines O2).
   - ANSWERED.

5. **How does a mapper receive `{ input, attempt }`?**
   - v3: "Every outcome mapper has one form, `(value, { input, attempt })`. For `retrying`, the value is `{ retry, error }`" (P1).
   - ANSWERED.

6. **How do Stories seed or know list keys?**
   - v3: "In Stories, minted keys are deterministic: `invites#1`, `invites#2`" (rule 9), used in the 3.3 Story.
   - ANSWERED. No seeding syntax is needed.

7. **Where do a subroutine's schedules appear?**
   - v3: "`s.memory.CANCELLING` and `s.schedules.HOLDING.<name>` for a subroutine" (section 2.1, Reading).
   - ANSWERED.

8. **Where do the host's own schedules appear, and do their names share a namespace with instances?**
   - v3: "`s.schedules.<name>` for the host's own schedules" and "Instance names, host schedule names, state names and memory keys share one namespace" (section 2.1).
   - ANSWERED.

9. **What is the syntax for a fragment nesting a child fragment?**
   - v3: rule 10, the contract's `traits` / `states`, and the 3.5 `Flash` example (`traits: { timer: Countdown(...) }`, filled in the body).
   - ANSWERED.

10. **Does a trait with no memory have an `s.memory.<instance>` slice?**
    - v3: "`s.memory.code` (absent if the fragment declares no memory)" (section 2.1).
    - ANSWERED.

11. **Can a raised `hostEvent` arm an `armOn` schedule?**
    - v3: "A raised event accepted in the turn counts as accepted. In particular, it arms the `armOn` schedules that list it" (rule 7).
    - ANSWERED.

12. **Can a subroutine have no states?**
    - v3: "optional, under its state … Without `states` it is a leaf (`Confirm`)" (section 2.1 table).
    - ANSWERED.

13. **May a fragment guard over its own memory inline?**
    - v3: "A fragment's transitions may also carry ordinary guards over its own memory" (section 2.2).
    - ANSWERED.

14. **How are a list's `Add` and `Remove` guarded?**
    - v3: "`Add` is refused at `max`, or by the optional `canAdd` guard. `Remove { keys }` is refused only by the optional `canRemove`" (rule 9).
    - ANSWERED.

15. **What does a raise's `.from` mapper read?**
    - v3: "Payload mappers (`raise`, `notify` and `exits` `.from`) also read the pre-turn snapshot and the event" (rule 7).
    - ANSWERED.

16. **Do the host's root handlers run while inside a subroutine state?**
    - v3: "host events fall through to the host's ancestors and root as usual (Machines O2)" (rule 6).
    - ANSWERED.

17. **What is the shape of `optimistic`, and what is `setData`'s key?**
    - v3: "`optimistic` is a list of `setData` writes keyed by params" (P13), with an example in 3.4.
    - ANSWERED. The example's key is the params object (`listQuery`).
    - Minor: `pinRow` is undefined, and it is not said whether the `setData` mapper reads the pre-turn snapshot.

18. **Does a Story `send` run its own turn?**
    - v3: "`send` runs its turn before the next command; `process()` drains operation work and due timers" (section 5, Testing O1).
    - ANSWERED.

19. **Can the view see WIZARD's remembered child while CANCELLING is active?**
    - v3: "`S.X.history.child(s)` reads that child from a view" (P5), used in the 3.2 view as `S.WIZARD.child(s) ?? S.WIZARD.history.child(s)`.
    - ANSWERED.

## New confusions a builder would trip over

- **Rule 11 points to something that is not there.** It says ".enter(input) and .leave() drive a
  subroutine (section 3.1 ends with one)". Section 3.1 ends with a trait test (`Countdown`, using
  `.send`). No example anywhere uses `.enter` or `.leave`, so their arguments and return are
  unspecified.
- **"Selection" means two things.** In rule 1 it is the value `resetOn` returns. In 3.4 it is also a
  trait named `selection`. "A selection that changes again after its trait reset is a pre-commit
  defect" reads two ways.
- **`resetOn` comparison.** No equality rule is given. It returns an array in one place (`pager`)
  and an object in another (`listQuery`). Is the comparison deep or by reference? How does it behave
  on a list trait (per instance, or all)? Rule 1 also says "before validation", and validation is
  not defined.
- **`{}` means different things.** In `guards`, `hasNext: {}` is a required guard. In `callbacks`,
  `{}` is a required callback with an empty payload. `optional()` and `optional({})` differ the same
  way. A builder will not know whether a guard may carry a payload.
- **Callback and exit shorthand is undeclared.** Section 2.2 says an exit is filled by "an on-style
  handler", but 3.2 fills it with a bare token (`Confirmed: S.CANCELLED`). Likewise `Yes: exits.Confirmed` is
  a bare reference. The shorthand is plausible but never stated.
- **`Remove` with an unknown key.** Rule 9 makes an event "addressed to an absent key" `Unhandled`.
  `Remove` carries `keys` in its payload. What happens when a listed key is absent (no-op, refuse,
  `Unhandled`) is not said.
- **The late-strike behaviour hinges on a guard.** In 3.1, `abandoned` raises `lock` into the root
  list, and `onStart` then moves the actor. A builder must see that `onStart`'s guard reads the
  pre-turn state. This is covered only by the one paragraph after the machine and by section 4 (E5).
  It is an easy place for a builder to fuse `Add` and `Start` wrongly (`Add` must come first and be a
  no-op if present).
- **Abandoned attempts for a different challenge.** `wrongHere` ignores a late wrong code for a
  different `challengeId`, and host `wrongAttempts` is one slot. The 3.1 behaviour matches the
  stated scenario, but the loss of the other challenge's count is silent.
- **Window of the `abandoned` double run.** P10 says the handler runs with `"pending"` fused into the
  leaving turn, then again on settlement. Whether it must be idempotent on `"pending"` (it is in
  3.1, via `wrongHere` returning false) is left implicit.
- **`Def.handler` vs `SignIn.handler`.** The rules and the amendments table say `Def.handler` /
  `Def.guard`; the example calls the method on the definition value. Fine once read as "the
  definition's method", but not stated.
- **Keyword table counts.** The table says "New, fragments (19)" and "New, plans (14)" but its
  rows do not obviously add up to those numbers (for example, `uncertain` and `.history` are
  listed under plans while `.key(k)`, `Add` / `Remove` / `canAdd` / `canRemove` are bundled).
  Low risk.
- **Missing import.** The 3.2 excerpt uses `subroutine` and `Schedule` with no import shown (the
  3.1 imports do not include them). Low risk.

## Contradictions inside v3

- **Rule 11 vs section 3.1**, as above: the "ends with one" claim is false.
- **Section 2.1 "Contains" row vs the contract comment.** The table says a trait contains only
  traits. The contract comment (section 2.2) says "subroutines also: states?, default?, exits",
  which is consistent only if "subroutines also" means those fields apply to subroutines. It reads
  ambiguously but is not a hard conflict.
- **Section 3.1 and section 4 on late strikes.** Section 3.1's comment says `lockouts.onStart`
  "moves the user if they are back", and E5 says `abandoned` "never targets, but it may raise into
  root traits, whose callbacks may move the actor". These agree. Open question 1 still asks whether
  the rule-6 guard is enough, so the design flags its own gap.
- No other hard self-contradictions found.
