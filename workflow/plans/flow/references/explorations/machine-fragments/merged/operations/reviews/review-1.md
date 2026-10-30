# Review 1 of operations-in-definition (2026-10-31)

Two independent Sonnet reviews: correctness (gains against losses) and authoring (complexity, five new apps).
Not yet verified line by line by the main session; treat as advice.

## Gains, checked

- Holds: keyless reads for plain operations (`s.operations.pay.pending`); `.each` copies no longer share lanes; two
  operations no longer collide; commit values have a home; one lane identity model instead of two.
- Overstated: "13 of 14 wrong cells fixed" is about 6 (9 of the 13 are "several Attempts per lane", which `latest`,
  `cancel`, `allow` and `serialize` still have; N2 already fixes them). "10 of 20 undefined" is about 6. Keyed lookup
  and never-started reads are fixed for plain operations only; `.each` operations still need `find` in views.

## Losses

- D9's cross-operation exclusion: two `reject` operations on one contract can both charge (only a warning).
- On-demand keyed lanes (D11): per-id work now needs an id list mirrored into memory; paged lists past `max` have no
  rule.
- `reject` per key: sign-in's new challenge is blocked by the old challenge's late verify; pin refuses row 2 while
  row 1 is in flight.
- The stream mapper loses `params`, and `key` changes meaning.
- Per-start outcomes: two kinds of start on one operation need a discriminator in the input.
- `DuplicatePlacement` rejects two placements of one stream even under disjoint `when`.

## High findings

1. Operation names as persisted identity: renaming `pay` to `charge` restores an unknown Attempt as orphaned, the
   new name starts idle, and Pay charges again. Fix: persist by (contract, name), rebind, and allow `was: "pay"`.
2. The "different key is Rejected" rule strands writes: after doc A's save ends unknown, doc B's saves are refused
   until A resolves, so B's edits are lost; domain writes get an implicit key. Fix: delete the runtime rule; a keyed
   contract on a plain operation is an error unless `.each` or marked single.
3. `SharedContract` is only a warning: make it an error unless operations declare an explicit link.
4. Wiring leaks into user code: id lists mirrored into memory, a `listed` guard, input shaped `{ key: { id } }`, `for`
   repeated, a member named four times. Fix: `.each` follows a live read or entity query (`of: O.issues`).
5. Retry budgets leak through events (`resends` on every `Unsure`).

## Medium

- A removed member holding an unknown Attempt never drains, so it leaks and persists.
- Same-turn removal and drain are not ordered.
- Membership lag: a Toggle before `Listed` is denied; a stale `Listed` drops ids.
- Splitting one call across definition (outcomes, `.each`), machine (input) and contract hurts reading; mappers that
  carry retry policy are behaviour on the definition.
- Definitions roughly double in size; total lines about even.
- Names: `.subscribe` collides with `stream({ subscribe })`; `outcomes` misnames a stream's mapper; `operations`
  means three things; `fetch` shadows the global; `start`/`fetch`/`params` are three verbs for "begin".
- `superseded` boilerplate in every `latest` mapper.

## Keyed lookup

Not inherent to named operations; inherent to publishing lanes as a list apart from the data the view renders. Fixes,
best first: `.each` rows carry their item (`{ key, item, pending }`) so views map over them; domain writes publish
`pending` on the entity record (`Issue.get(s, key)`); chat reads its outbox status from memory.

## Top improvements proposed

1. `.each` follows a live read or entity query, so no id list is mirrored into memory.
2. Remove `key` from transactions and the "different key" rule; misuse is a declaration error.
3. Rename `.subscribe` to `.live`, and let a bare contract be placed directly in `activities`.

Both reviewers: the correctness gain (one identity model) is real; accept only with improvements 1 and 2.
