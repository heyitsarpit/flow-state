# Review of `.each`: API simplicity and readability

Angle: an application developer who knows React and TypeScript, not this library. Read:
proposal-each.md (1.0 first, then all), problem.md section 6, v4 sections 2.2, 2.3, 2.6,
principle 11.

## Verdict

`.each` is a real simplification over `.list`. The big wins are real: no built-in `Add`/`Remove`,
no minted keys, no `owner`, incarnations hidden. "Membership is the host's own array" is easy to
say and easy to read. The view side is close to React.

What still costs the newcomer: the word `key` does five jobs, `max` is soft, the async relay
(3.1) threads `key` through four places, and every copy that ends repeats the same `filter`
line. None needs a redesign. All are naming, defaults or sugar.

## What a newcomer predicts from 1.0 alone

Easy:

- `deleting` is a list of ids. `.each("deleting")` means one `undo` per id. Reading the trait
  first, then the definition, then the view, the story holds.
- The view is `undos.map(u => <Snackbar key={u.key} …/>)`. That is React.
- Delete adds an id behind a guard. Nothing magic.

Where they stumble:

1. "Why do I have `deleting` and `undo`, and which do I read?" Two lists, same ids, in one view.
2. "Where did `key` come from?" It is not in `Delete`'s handler (no `key` there), only in
   `traits.undo`. The rule "`key` exists only inside a placed `.each` filling" is not visible in
   the code.
3. "Why does Undo go to the trait, come back as `onUndo`, and then I remove the id?" Two hops for
   one idea. It is the right design (host owns membership), but the code does not say so.
4. "What happens when I Delete 51 messages?" `max: 50` is declared; no guard uses it. The answer
   (`InvalidTurn`) is not discoverable from the example.

## Findings

### Major

**M1. `key` is five different things.**

| Where | Meaning |
| --- | --- |
| `.each("notices", { key: "id" })` | the **name of a field** inside each record |
| `({ memory, key }) => …` | the **value** for this copy |
| `u.key` in a view | the value again |
| `E.undo.key(u.key).Undo()` | a **method** |
| `RemoveRow: { key: Schema.String }`, `raise … ({ key: event.id })` | an **event payload field** |

React's `key` is one thing: a prop. In 3.1 the author's own event `RemoveRow({ key })` sits next
to the framework's `key`, and it is hard to tell which is which. The worst is the option
`key: "id"`, which names a field but reads like a value.

Before:

```ts
Toast(...).each("notices", { key: "id", max: 5 })
```

After:

```ts
Toast(...).each("notices", { by: "id", max: 5 })   // "one copy per notice, by its id"
```

`by` is the usual word (`keyBy`, `groupBy`, `sortBy`). It reads as English. The value stays
`key`, matching React. Trade-off: one more short word to learn, but it removes the only
position where `key` means "a field name". Also reserve `key` and `item` as names a trait
cannot use for its own memory (see N1).

**M2. `max` should be required, and the refusal should be explainable.**

Today `max?` is optional, yet `max` is what makes the shape finite for `flow check`, Stories and
`model()` (K2). An optional bound means an unbounded graph for people who omit it. And going over
`max`, or duplicating a key, gives `InvalidTurn`, "the host's own guard gives the friendly
reason". So every author must remember to write that guard, and the 1.0 example does not.

- Make `max` required. It is the declared shape. Cost: one number at each placement. In every
  example in this file it is already given except 1.0's own explanation text.
- In 1.0 add the guard, or a comment saying what happens without it:

```ts
guard: ({ memory, event }) =>
  memory.deleting.length < 50 && !memory.deleting.includes(event.id) || deny("AlreadyDeleting"),
```

- Consider reporting over-max and duplicate as an ordinary denial with a fixed code
  (`deny("EachFull")`, `deny("EachDuplicate")`) instead of `InvalidTurn`. The sender then sees
  the same kind of refusal as for any guard. Trade-off: it hides a host bug as a normal denial.
  Either choice is defensible; pick one and say it in one sentence.

**M3. The async relay (3.1) is the least React-like part, and `key` is threaded four times.**

Flow for one email check: commit (mapper reads `key`) -> internal event `Checked { key, value,
taken }` declared in the definition -> host handler `Checked` -> `raise: [E.rows.Checked.from(({ event }) => event)]`.
The author writes the same `key` in the mapper, the event schema, and the raise. Then the
comment says a removed row's raise is "dropped with evidence".

An author who knows React would expect: the call started in the row comes back to the row.

Option (sugar, no new concept): when a commit is started in a copy's callback filling, its
outcome may name the copy's own host event directly, and the key is implied:

```ts
const check = O.Team.isMember.commit(({ payload }) => ({ email: payload.value }), {
  outcomes: { success: E.rows.Checked.from((r, { input }) => ({ value: input.email, taken: r.member })) },
});
// no internal Checked event, no host `on.Checked`, no key in the mapper
```

This removes one internal event, one host handler and the key plumbing from the most common
per-copy server pattern. Trade-off: it widens the rule that host events are only sent by `raise`
(v4 2.2) into "or by an outcome of a commit started in the same copy". It stays one turn and one
graph; the edge is statically known. If that is too large a change, keep the current form and
state the three-step shape once, in section 1, as "the relay pattern", so it is not rediscovered
in every example. Do not add both.

### Minor

**m1. Every copy that ends repeats the same removal line.** Nine examples contain
`memory.x.filter((id) => id !== key)`, with `n.id !== key` and `f.id !== key` variants for
records. It is correct, but it is noise, and typing `n.id` vs `id` is where bugs creep in.
Without breaking "membership is never commanded", ship a typed helper, plain data in, plain data
out:

```ts
updateMemory: ({ memory, key }) => ({ deleting: Flow.without(memory.deleting, key) })
```

It must be a function over the host's own list (not a command to `.each`), so the host still
writes the field. Trade-off: one more export. If it is not added, define `without` in the
examples' shared helpers (section 3 already lists `upsert`).

**m2. Two names for one thing (`deleting` and `undo`).** This is inherent: the field is the
membership, the trait name is the behaviour. The 1.0 view reads both lists, which is the
confusing part. Two small fixes, neither a new concept:

- Name the field as what the host means (`deleting`) and the trait as what each copy does
  (`undo`). Already done. Add one comment in the definition: `// undo.<id> exists for each id in deleting`.
- Show in the view where each is used: `deleting` hides the message, `undo` draws the button.
  That is already so, but the second `useView` line should say it.

A built-in alias (reading `s.memory.deleting` as the copies) would hide the sharing and
break principle 11 (the placement, not the field, describes the copies). Do not add it.

**m3. `item` is optional, so its type changes with the field.** With bare string keys `item` is
absent; with records it is the record. A newcomer meets `item?` and a conditional type. Make it
uniform: `item` is always the host's element (the string itself for bare keys), and `key` is its
key. Then `({ key, item })` has one rule, and the view never branches. Trade-off: for bare
keys `item === key`, a little redundancy.

**m4. Two spellings for "to this copy".** The view uses `E.undo.key(k).Undo()`. A host raise uses
`E.toasts.Shown.from(… => ({ key: event.id }))`. One is a method chain, the other a payload field.
Both are consistent with v4's `from(f)`, but a newcomer learns two forms. Prefer one in docs:
`E.toasts.key(id).Shown` for the common case where the key is known without a mapper, and keep
`.from` for payload. Check that `.key(k)` can be called inside a mapper without hurting types.

**m5. `Shown` (3.3) shows a hidden lifecycle rule.** Toast needs an extra `Shown` raise because
`armOn` schedules do not start on creation (v4 P7), while a schedule with no `armOn` does
(Undoable). Two creation behaviours in one library, both defensible, but the second one leaks as
a required "nudge" event in every trait that mixes them. The proposal lists this as gap 2.
Raise priority: it is the one place where a copy's life start is visible to the author. Allowing
a creation or entry marker in `armOn` is a better fix than teaching the nudge.

### Nits

**N1. Reserve names.** `s.memory.<name>` is `{ key, item, …memory }` spread flat. A trait with a
memory field called `key` or `item` collides. State it: those two names are reserved in a trait
that is placed with `.each` (a lint or type error).

**N2. `.each` as a name.** It sounds like iteration with a callback (`items.each(i => …)`). The
shape is "one copy per entry", so `.perItem`, `.many` or `.keyed` are possible. None is clearly
better. `each` is short, the examples read well (`.each("deleting")`), and it matches Rust/CSS
"for each" usage. Keep.

**N3. Bound event creators on the view copy.** `inbox.send(E.undo.key(u.key).Undo())` repeats
`u.key`. Something like `inbox.send(u.E.Undo())` would read closer to `onClick`. Not worth a
second way yet. Revisit if `.key(k)` shows up in many views.

**N4. 1.0 says "ids ... armed deadline persist ... overdue window fires once".** True and nice,
but it is a persistence promise in an introductory example. Move to a note under K7 so 1.0 stays
about the idea.

## What is not a leak (author need not know)

- **Two reconciliation passes.** Authors only see: "a copy is gone in the same snapshot its key
  is gone", and "a late result for a removed key is dropped". Keep passes in 1.1 (spec side).
- **Incarnations.** Only in Inspection and Stories. Good.
- **Edge rules in 1.1** ("removed by source and re-added by a part is a new copy", "raise to a key a
  later part adds refuses the turn"). Rare. Keep them in the spec, and give them a
  `flow check` diagnostic with a plain message, rather than prose the author must remember.

## Is it as simple as React's `items.map(i => <X key={i.id} />)`?

Close on the view. On the machine side it is two things where React has one: a list in memory,
and a trait placed on it, joined by a field name. That cost is the price of "one actor, one
turn". I would not try to hide it. Make it cheaper to read:

1. `by:` instead of `key:` in the option (M1).
2. `max` required (M2).
3. `item` always present (m3).
4. The async relay without `key` plumbing (M3).
5. A `without` helper (m1).

## Cut candidates

- `max?` optional: make it required.
- `item?` optionality: make it uniform.
- The relay's internal `Checked` event and host `on.Checked`, if M3 sugar is accepted.
- Section 1.0's persistence paragraph (N4).
- Nothing else. `key`, `item`, `.each` and the commit-mapper `key` are each used in the examples
  and earned. `resetOn` per copy and `.resumable()` are existing v4 words, not new.

## Principle 11 check

`.each` is a method on the trait placement, not a separate list naming the trait. The field
name in it is a reference, but the property "how many copies" is on the placement. Passes.
`max` and `by` sit next to the thing they describe. Good. The only violation risk is the
"membership guard" living on the host transition, not the placement. That is written down in K9
and is correct: who may add is a host rule.
