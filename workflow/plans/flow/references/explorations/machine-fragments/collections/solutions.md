# Dynamic collections: candidate solutions

Status: candidates for the user to choose from. Nothing here is in proposal v4 yet. Judged against
[problem.md](problem.md) (cases C1–C6, requirements R1–R9, constraints K1–K9), using
[prior-art-ui-and-ecs.md](prior-art-ui-and-ecs.md) and
[prior-art-reactive-languages.md](prior-art-reactive-languages.md).

## 1. What prior art agrees on

The two notes surveyed different families (React, Elm, Redux, ECS, behaviour trees; Céu, SCADE,
Esterel, SCCharts, Rhapsody, P, Erlang) and reached the same answer:

1. **Membership is the owner's data, not commands on the collection.** React children, Elm
   submodels, Redux entities, ECS entities, SCCharts `region for i : ACTIVE` and SCADE `map` all
   derive which copies exist from data. Only actor systems (Céu `spawn`, Erlang, XState) use
   add/remove verbs, and those fail K1 or K3 except Céu.
2. **Identity is a public key plus a private life.** React fibers, Bevy generations, Céu
   references, Erlang pids versus names: none makes the author name an incarnation. v4's draft
   exposing incarnations is the main thing prior art contradicts.
3. **The behaviour is written and analysed once, over every copy.** ECS systems, SCADE `map`,
   Esterel `dopar`. Only *which* copies exist changes, and it changes at one defined point of the
   step.
4. **Late deliveries to a removed copy are dropped.** Flow State's "dropped with evidence" is
   already the strictest version.

## 2. The candidates

### S1. Copies follow a key list in host memory (recommended)

The host keeps the keys as its own memory. The definition places the trait **once per key** and
names which memory field holds the keys. The turn reconciles copies by key at the point where
`resetOn` already runs: a new key gets a fresh copy, a removed key's copy ends (schedules
cancelled, `onLeave` run), a kept key keeps its copy. It is `resetOn` generalised from one value to
a set of keys.

```ts
// definition: structure (K5). `.each` names the key field; flow check types it (K6).
memory: {
  inviteIds: Flow.initial(Schema.Array(Schema.String), []),   // existing: plain host data
  nextInvite: Flow.private(Flow.initial(Schema.Int, 1)),       // deterministic keys (K7)
},
traits: {
  invites: Field(Schema.String, { validate: optionalEmail }).each("inviteIds", { max: 5 }), // new: .each
},

// machine: behaviour. Adding and removing are the host's own events and guards (R5).
traits: { invites: { input: () => ({ value: "" }) } },          // per-copy start, may read { key, memory }
INVITE: {
  on: {
    AddInvite: {
      target: "self",
      guard: ({ memory }) => memory.inviteIds.length < 5 || deny("TooManyInvites"),
      updateMemory: ({ memory }) => ({ inviteIds: [...memory.inviteIds, `invite-${memory.nextInvite}`], nextInvite: memory.nextInvite + 1 }),
    },
    RemoveInvite: {
      target: "self",
      updateMemory: ({ memory, event }) => ({ inviteIds: memory.inviteIds.filter((k) => k !== event.key) }),
    },
  },
},
```

```tsx
// UI: reads like a keyed list (R9)
{invites.map((f) => (
  <div key={f.key}>
    <input value={f.value} onChange={(e) => signup.send(E.invites.key(f.key).Changed({ value: e.target.value }))} />
    <button onClick={() => signup.send(E.RemoveInvite({ key: f.key }))}>Remove</button>
  </div>
))}
```

C3 (lockout per challenge) becomes `challenges: Lockout(…).each("challengeIds")`. The host adds the
id on `PasswordAccepted` and removes it in the `onUnlocked` filling, which receives `key`.

**Rules it needs** (all from prior art):

- The key field is an array of strings in the host's memory; order of copies is its order.
- Reconciliation runs where `resetOn` runs (v4 §2.5 step 3), on the source-updated memory, so a
  source transition that adds a key and raises into it in one turn reaches the fresh copy. A
  callback filling that changes the keys takes effect in the follow-up turn, as a pending reset
  does (see open question 1).
- Removing and re-adding a key in one turn changes nothing; in a later turn it is a new copy.
  Deliveries armed or started for the old copy are dropped with evidence. Incarnations appear only
  in Inspection and Stories, never in types, events or views.
- Duplicate keys, or more than `max`, refuse the turn (`InvalidTurn`). The host's own guard gives
  the friendly reason.
- A view event to an absent key is `Unhandled`, as today. A host raise to an absent key refuses
  the turn unless the same patch adds it.
- To reset one copy, give it a new key, or a per-copy `resetOn`.

**Removed from the v4 draft:** built-in `Add` / `Remove`, minted keys, `key:` and `owner:` options,
`canAdd` / `canRemove`, incarnations as API. **Added:** `.each(field, { max? })`, and `key` in the
copies' view and callback fillings. `.key(k)` addressing stays.

**What does not break:**

- **K2 static analysis, single graph.** The trait is analysed once, as one node marked
  "× inviteIds ≤ 5"; the key field is a declared, typed memory path, not a run-time discovery.
  `flow check` checks the template; Stories and `model()` explore up to `max` copies (P's split
  between type checking and bounded exploration).
- **K1** copies change inside the host's turn; a refusal anywhere refuses it all. **K3** no actors.
  **K4** copies are traits with no states; a copy's mode is memory. **K5** placement in the
  definition, input in the machine. **K7** keys are host data, persisted and hydrated with it.
  **K8, K9** membership policy sits on the host's own transitions.
- **R8.** C6 (tags, line items) is a plain `Schema.Array` in memory, with no `.each`.

### S2. A pool with spawn and finish (Céu, Erlang)

`Toast.pool({ max })`; host transitions get `spawn` and `end` effects; a copy can finish itself
through a done port. Better for C4 (a toast removes itself with no lag), but it brings back
add/remove verbs under new names, so the host's policy becomes a guard on `spawn` again (close to
`canAdd`), and C6 still needs a plain array: two models of a list. Not recommended.

### S3. Fixed slots (Esterel `dopar`, SCADE `map`)

`Lockout(…).slots(4)`: four copies addressed by index, each occupied or not. Strongest on K2 (the
graph is literally four copies) but fails R9 and makes the host map ids to slots. Useful only as
how `flow check` and `model()` unfold S1's `max`. Not a separate API.

### S4. Patterns that need no collection

Not alternatives to S1, but advice that keeps cases off the collection machinery:

- **Deadlines as data** (Elm, Bevy, Zag): toasts and the pin flash store `dueAt` per row, and one
  host schedule fires at the earliest. Needs one schedule feature, a deadline computed from memory.
  Fits C4 and C2 when the copy's only behaviour is a timer.
- **One focus slot** (Zag's `editedTagId`): C5 with one editor at a time is a single trait with
  `resetOn: ({ memory }) => memory.editingId`. Works in v4 today.
- **Keyed host schedules** (`per: ({ event }) => event.id`): the C2 flash without a trait. Few new
  concepts but not reusable (fails R2). Optional.

## 3. Coverage

| Case | S1 | Also fits |
| --- | --- | --- |
| C1 invite rows with debounce | yes | — |
| C2 pin plus 3 s flash | yes | deadlines as data |
| C3 lockout per challenge | yes | — |
| C4 toasts | yes, with one snapshot of lag on self-removal | deadlines as data (no lag) |
| C5 inline editors | yes, several at once | one focus slot (one at a time) |
| C6 plain rows | plain array, no `.each` | — |

## 4. Open questions for S1

1. **Removal from a callback lags one snapshot.** When a copy's callback filling removes its own
   key (a toast's `onExpired`), the copy ends in the follow-up turn, so one published snapshot shows
   a copy whose key is gone. Either apply removals at commit (removal cannot refuse; only `onLeave`
   would run in the follow-up turn), or document the lag and point C4 at deadlines as data.
2. **Where the key list may come from.** Host memory only (recommended), or also activity data
   such as server rows. Activity data changes outside the turn, so it would first have to be
   copied into memory by the host.
3. **Keys as strings only**, or any Schema with `Equal`. Strings are simplest for views, Stories
   and persistence.
