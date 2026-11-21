---
review review-external-rules-b
status open 2026-11-22
---
# Review of @proposal.external-rules, types and consistency (2026-11-22)

**Verdict: SOUND, with fixes.** The chained `.rules(build)` typing holds for machines, and my own spike shows it
holds for traits (no `S`) and for tokens that carry the definition id. Four gaps need a fix before T106 builds
it: duplicate names across `invariants` and `turns` are not a type error, trait and subroutine are unspiked,
fragment token ids contradict themselves, and the inventory still says `Machine<D>` has one parameter. The shared
`rules(Def, build)` is worth keeping but can be one overload simpler.

**Why now:** the proposal claims "spiked" typing and "nothing reintroduced" from Types Q19. Read first:
@proposal.external-rules, @spec.Types (Q2, Q3, Q5, Q19, R9, I12, I13), @review.rules-exactness-inventory.

**Spike:** the proposal's `spike/chain.ts` uses a toy `Def` and a machine only. Mine is
`scratchpad/rb/b.ts`, `c.ts`, `e.ts` (same toy, `strict` and `exactOptionalPropertyTypes`, also not the real
`Definition`; it needs a re-run on the real package).

## 1. Typing claims

| Claim                                                                 | Result                                                  |
| --------------------------------------------------------------------- | ------------------------------------------------------- |
| Only name keys captured; `event` typed from `turn` with no annotation | holds                                                   |
| Machine builder `S`, `E`, `turn`; trait builder `E`, `turn`           | holds (`S` on a trait is TS2339)                        |
| `.rules` twice is a type error                                        | holds (`rules` is a record, not callable)               |
| Bare value cannot be run                                              | holds (`app({ machines: { b } })` fails)                |
| Shared build, two machines of one definition                          | holds; wrong definition is refused                      |
| Tokens keep ids; `off: [Cart.rules.X]` without Cart is an error       | holds (`R` is a union of `${id}.${name}`)               |
| `Machine<D, N>` assigns to `Machine<D>`                               | holds; `Machine<D>` annotation loses tokens, as Q2 says |
| `DEV ? shared : none`                                                 | compiles                                                |

## 2. Findings

**M1 (medium): a duplicate name across `invariants` and `turns` is not a type error.** Feature #9 says it is.
Spike: `{ invariants: { X }, turns: { X } }` gives `N = "X"` and compiles. Only a duplicate inside one object is
refused by TypeScript. Fix: say #9 is a construction refusal (`RuleNameTwice`, I13's twin) and add a pin; or
infer `T extends Exclude<string, I>`-style, which I did not spike.

**M2 (medium): trait and subroutine typing is claimed in section 1 and deferred in M4.** Section 1 says the
trait builder has no `S`, `terminals` or `in`; M4 says those forms "wait for their types". A trait needs its own
`Bare` overload with a `Build` that has no `terminals` and a `Turn` without `in`. My toy `BareT` works, but a
subroutine's `hostEvents` and the real `Definition` for a trait are untested. Fix: spike both on the real package
under @task.V3.T109 and drop "spiked" from the bottom line until then.

**M3 (medium): a fragment token's id is two things.** Section 5 case 3 shows `Upload.CancelSticks` for
`Story.fragment` and `Desk/Editor/uploads.CancelSticks` for a host; #37 says ids name the placement and copy;
section 1 says token ids are `<definition id>.<Name>`. A trait token `Upload.rules.X` then carries `Ui/Upload.X`,
which is in no run's id list, so `off: [Upload.rules.X]` on a `Story.app` is a type error or a mismatch. Also `R`
for an app is built from `Machine<D, N>` values, and a placed trait's names are not in `N`. Fix: state that the
token carries the trait id, that a placement id is derived at run time, and that `R` for an app adds the traits
placed by its definitions (a type walk of `D`); spike it.

**M4 (medium): `none` and `Rules<D, N>` are not typed in the proposal.** `none` must be `Rules<any, never>` or a
`Build` that returns `{}`; a `Rules<D, never>` would make `.rules(none)` fail for every `D` but one. My toy used
`Rules<any, never>`. Fix: give `none`'s type in section 1.

**M5 (medium): Q3 is a user decision (turn is a body token, 2026-11-22) and this moves it.** The user chose the
chained form, which implies it, but the proposal does not say so. Fix: list Q3 as "superseded by the chained
form, asking the user", with the reason (a token's memory type comes from the definition, which `.rules` has).

**L1: option C holds, with one soft spot.** Nothing captures the body; `const B`, `Exact`, `RuleNames<B>` and G3
are deleted. But excess-key refusal inside `.rules()` is accidental. Spike: `{ invariantz: {} }` is refused
only when no valid sibling key exists; `{ invariants, terminalz }` compiles; an extra `deny` on an invariant entry
compiled, while `chek` was refused. The proposal says "refused at construction, as option C has it"; that is true,
but the claim "spiked: one misuse is a type error" suggests more than it gives. Fix: state that only the runtime
and `flow check` refuse an unknown key, and add the construction pin.

**L2: the Runtime/test additions go past the decisions.** `flow-state/testing/setup`, `brokenRules` and
`ruleCoverage` are new public API; the user's memory says "no private test tooling, keep it stupid simple". Q3 asks,
so it is open, but the setup file is the biggest unrequested surface. Fix: offer B (R8 amended to Stories only)
beside A with its cost, or defer `brokenRules` and `ruleCoverage`.

**L3: overload messages.** A wrong payload reports "no overload matches" at `.rules(` (the proposal says so). The
second overload (`Rules<D, N>`) adds a "last overload" line that hides the real error. Fix: see section 3.

**L4: `Machine`'s `rules` key and a rule named `rules`, `definition` or `construction`.** The token record is its
own property, so no clash with fields, but a rule named `constructor` compiled in the spike. Fix: refuse reserved
names at construction (`InvalidName` already exists).

## 3. Simplicity

Keep a shared `rules(Def, build)`: without it a shared build needs a hand annotation, which G2 says should not be
needed. But it need not return a branded `Rules<D, N>` with a second `.rules` overload. Spike (`e.ts`):
`rules<D, const I, const T>(def: D, build: Build<D, I, T>): Build<D, I, T>` returns the build, `.rules(shared)`
goes through the one overload, tokens keep `Shop/Order.PaidHasReceipt`, and a wrong definition is refused. That
drops the brand, `Rules<D, N>`, the second overload and L3, and `none` becomes `() => ({})`. Fix: use it.

## 4. Consistency and record edits

The inventory was written for `rules(subject, build)`. Changes by this design:

- **Becomes unnecessary or reversed:** the superseded notes for R9, I12, Q2 and "`Machine<D>` keeps one parameter"
  (`Types.spec:71-75`, `:129-132`, `:647-648`, `:662`, `:505-513`, `:287`); Q17's "moot" note; `RuleSet<D, Names>`
  and the `rules()` row; Rules.plan O3's "delete the paragraph" (the paragraph stays, retargeted: `machine()` is
  unchanged, `.rules` returns `Machine<D, N>`); `[H1]` to `[H6]` wording (answered in proposal section 3).
- **Changed:** Rules.plan O1, O2, O3, O7 use `.rules(...)` on the value, not `rules(subject, ...)`; V1, V7, V8
  keep `machine.rules.X`; `OrderRules.X` becomes `OrderMachine.rules.X`; the Testing.plan and Runtime.plan entry
  edits (`{ machine, rules }`, lazy entries, `defineConfig` globs) disappear; no scan, no `RulesUnregistered` or
  `RulesSubjectAbsent` in `CHECKS`; `Story.app`'s run-rules option becomes `runRules` (Testing.plan).
- **Kept:** Q5 (`rules: "judge" | "off"`, no `enabled`, now required), Q6, Q19 (C), strict decode, I13 (moves to
  `.rules()`), G3 dropped, T1 loses `ExactBodyOf`, the cost table.
- **New edits needed:** Types `RuleToken<Id>` (the id now carries the definition: `Types.spec` BodyCapture row
  `RuleToken<K>` becomes `RuleToken<\`${D["id"]}.${K}\`>`); `Machine`'s second parameter `N` stays (not deleted);
  Q3 marked superseded with the user's yes (M5); Host R8 and Q5 gain the setup-file or Stories-only choice;
  `Verdict<R>` and `Broken.rule` defined over token ids; Host's `RuleBroken.rule` as the full id; a new
  `RulesMissing` and `RulesTwice` in `CHECKS`; a type row that `machine()`, `trait()` and `subroutine()` return
  `Bare<D>` and that `app`, `Story.*` and slots accept only a ruled value; the `.rules(none)` migration (about 50
  fixtures) as a Task; CommandLine.plan keeps its additive `flow explain` and `flow check` lines unchanged.
- **Plan edits wait for the user's yes** (AGENTS: no Plan edit before acceptance).
