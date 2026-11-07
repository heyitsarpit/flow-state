# Absorbing wiring: which amendments to consider

**Status: PROPOSED. Nothing here is decided, and no plan or design section changes because of it.** Ideas with small examples, not a spec. Evidence is [absorb-wiring.md](absorb-wiring.md) (the survey, regex counts: trust direction, not figures), spot-checked against `dispatch-desk/`, `checkout/`, `machine-design.md`, `merge-6-streams/proposal-v3.md` and Effect 4.0.5. Item 15 in `open-items.md`.

Marks: **NEW**, **RENAMED**, existing, user-defined.

## 1. The answer in short

| | Amendment | Verdict | New private state | Silent failure removed |
| --- | --- | --- | --- | --- |
| A | `Flow` key for plumbing reasons | **pursue** | none | yes, M3 |
| B | `Flow.ignore` | **pursue** | none | no, but 25+ events go |
| C | Identity fields; the ref carries them | **design round** (small) | none | yes, ref and input disagreeing |
| D | Identity in calls: `identity` selector, not `scope` | **pursue the selector**; `scope` and auto-fill not now | none | no |
| E | No `signal` in ports, then none in contexts | **pursue, in two steps** | less | yes, M7, S-M2 |
| F | An absent placement instead of `""` | **design round** | none expected, unproven | yes, M8 |
| G | `Outcome.unknownOn` helper; no `lost` declaration | **pursue the helper**, drop the declaration | none | no |
| H | `hold: { resend }` | **drop** | a re-send outside any turn | one (M4), and adds one |
| I | Leaving: name the data loss at `dispose` | **pursue the rename**; drop `onUnload` and the failing dispose | none | partly |
| J | Entity key from input | **pursue only as one sentence** | none | no |
| K | Fragment input lists, Story ids, default fixture | **drop** | none | no |

The pattern: the amendments worth having **add no private state and remove a word or a whole declaration**. The ones that make Flow *do* something on the author's behalf (H, `scope`'s completion, auto-fill) cost more than they looked. So the test below (section 2) is the main proposal; the verdicts follow from it.

## 2. A filter, from the streams experience

Streams absorbed `cursor`. It removed a silent loss, and paid: private state, three reviews each finding a High in it, no total shrink (trial: feed 382 to 386 lines, Presence 301 to 330). That was worth it because the thing removed lost data silently and was written in every handler. So, for each candidate:

1. **Is there a silent failure today, with real evidence?** Otherwise this is brevity, and brevity must be free.
2. **Does it add state or behaviour Flow runs by itself?** A declaration read at build time is cheap. A new thing the Runtime does needs table cells, Stories and reviews.
3. **Count both sides.** A list on every operation is lines too.
4. **Is one fact stated twice, or is it two facts that look alike?** Only the first can be derived.

## 3. Where the check changed the survey's picture

Each of these moved a verdict.

- **M9 and M10 are not key mistakes.** M9 is `pending` for `predicted` on an entity read; M10 is an array for `pick`. S-H3 is a keyed row read as a plain one, which real types reject. No REVIEW misuse is a wrong key part. So `scope` prevents a mistake not yet seen.
- **`Pay` and `Panels` have no fixed identity.** `cartId` and `intentId` are `Flow.initial(…, "")`, written by an event (`pay.machine.ts:42-43`); `Panels`' `ticketId` is written by `ShowTicket`. The survey's "Pay works under scope" reads a field that is `""` until an event arrives and can change after.
- **`actorRef(M, record)` has a hole.** Without a declared list, which fields make the id? `editorRef(ticket: TicketKey)` accepts a `TicketRow`, since extra fields pass TypeScript. The whole row becomes the id, so a title change names a new actor, silently. The "+0 words" version needs a declaration after all.
- **A catch-all makes M4 easier.** The survey credits `Flow` with preventing M4. M4 was `Restored` mapped to the re-sending event by hand; under a catch-all nobody even writes that line. Hence A's narrower form.
- **`signal` has a gap the survey did not see.** Run (scratchpad probe): interrupting a fiber after `Effect.tryPromise((signal) => fetch(…))` has resolved does **not** abort that signal. Effect's finalizer is popped at resume (`internal/effect.ts:1141`). So the body phase is outside it. Stream bodies are still safe: `Stream.fromReadableStream` calls `reader.cancel()` on scope close (`Channel.ts`). A `response.json()` keeps downloading, harmlessly.
- **The two `beforeunload` copies differ.** The desk warns on any unsettled write. `Pay.tsx:47` warns only for `pay` and `placeOrder`: "a shipping quote is not" worth a prompt. A default gets one of them wrong.
- **`lost` helps Fakes less than claimed.** `fakes-v2` produces a lost request with `Fake.Lost` at the wire, then the adapter classifies it. A Story does not name `NoResponse` to get an unknown.
- **`get` already takes memory.** "Members take any value carrying the key's fields" (rule 43), so the three long lines in `TicketPanel.tsx` can be `O.save.get(s, s.memory)` today. Not all "wiring" needs an amendment. Unchecked by a compiler.

## 4. The amendments

### A. One `Flow` key, for plumbing reasons only

**Idea.** In a record by tag, `Flow` covers Flow's own plumbing reasons you did not name. Same concept as streams' `Feed` key, one word across reads, streams and writes.

```ts
// BEFORE: editor.definition.ts
ticket: TicketsDomain.ticketById.outcomes({
  value: E.TicketLoaded.from((ticket) => ({ title: ticket.title })),
  failure: { TicketNotFound: E.TicketGone, NoResponse: E.TicketLoadFailed,
             Defect: E.TicketLoadFailed, Interrupted: E.TicketLoadFailed },
}),
save: TicketsDomain.saveTitle.outcomes({
  success: E.Saved.from((ticket) => ({ ticket })),
  failure: { TitleRejected: E.SaveFailed.from((e) => ({ reason: e.reason })), NotSent: E.SaveNotSent },
  unknown: { Cancelled: E.SaveStopped, NoResponse: E.SaveUnsure, ServerError: E.SaveUnsure, Restored: E.SaveUnsure,
             Interrupted: E.SaveUnsure, Defect: E.SaveUnsure, StillUnknown: E.SaveUnsure, StorageRefused: E.SaveUnsure },
}),

// AFTER
ticket: TicketsDomain.ticketById.outcomes({
  value: E.TicketLoaded.from((ticket) => ({ title: ticket.title })),
  failure: { TicketNotFound: E.TicketGone, NoResponse: E.TicketLoadFailed, Flow: E.TicketLoadFailed }, // NEW key: Flow
}),
save: TicketsDomain.saveTitle.outcomes({
  success: E.Saved.from((ticket) => ({ ticket })),
  failure: { TitleRejected: E.SaveFailed.from((e) => ({ reason: e.reason })), NotSent: E.SaveNotSent }, // NotSent: existing, stays named
  unknown: { Cancelled: E.SaveStopped, Restored: E.SaveUnsure,                // existing: both stay required
             NoResponse: E.SaveUnsure, ServerError: E.SaveUnsure,             // user-defined tags: still exhaustive
             Flow: E.SaveUnsure },                                            // NEW: Interrupted, Defect, StillUnknown, StorageRefused
}),
```

- **The narrowing, proposed.** A reason a person must think about is not swallowed: `Cancelled` (the user's stop; under a catch-all the editor would re-send what the user stopped) and `Restored` (M4), and `NotSent` in `failure`, stay named where they can occur. `Flow` is only what no author reacts to differently. On a stream, that is what `Feed` covers today.
- **Gain.** About 3 lines in each of 4 write records, 1 in each of 9 read records and 6 stream records. M3 (`StorageRefused` missing in two records) cannot happen. **Removes** a "where it can occur" clause for four reasons. Author tags stay exhaustive, so this is not `otherwise`.
- **Lose.** The record no longer lists every path. `flow explain` must print the expanded mapping. A new Flow reason lands in `Flow` silently; acceptable only because a release adds it and it is plumbing by the definition above.
- **Interacts.** Streams v3: `Feed` key **RENAMED** to `Flow` (Q7 words, 3.5, examples; `Feed.Reason` stays). Rule 13's list of reserved tags gains `Flow`. Static analysis unaffected: the expansion is computable from the summary.
- **Cases.** Upload: `Restored: E.Lost` named, the rest `Flow`: correct. Assistant: `Stalled` and `Truncated` are its own tags, still required. A read in a frozen trait wanting `Interrupted` to mean "resync": names it, and it beats `Flow`. **Fails:** one author wanting `Defect` to crash loudly and `StorageRefused` to retry names them; no loss. A single-event `unknown: E.X` already swallows everything, including `Restored`; this does not fix that and should not.

**Verdict: pursue.** Cheap, independent, real evidence. Owner picks whether `Cancelled` and `Restored` stay out.

### B. `Flow.ignore`: an ending that needs no reaction

**Idea.** A mapping value meaning "no event, no handler". A person still decides at the mapping, so rule 20's reason stands.

```ts
// BEFORE: cart.definition.ts, cart.machine.ts
internalEvents: { QuantitySet: {}, LineGone: {}, Removed: {}, QuantityUnsure: Flow.uncertain({}) },
setQuantity: CartDomain.setQuantity.outcomes({
  success: E.QuantitySet,
  failure: { LineGone: E.LineGone, NotSent: E.QuantitySet },
  unknown: E.QuantityUnsure,
}),
on: { QuantitySet: { target: "self" }, LineGone: { target: "self" } },
// BEFORE: editor.definition.ts, editor.machine.ts
removeFile: AttachmentsDomain.remove.outcomes({ success: E.FileRemoved, failure: { RemoveRefused: E.FileKept.from(/* … */), NotSent: E.FileRemoved }, unknown: E.FileRemoveUnsure }),
on: { FileRemoved: { target: "self" }, FileRemoveUnsure: { target: "self", actions: [O.removeFile.cancel] } },

// AFTER
internalEvents: { QuantityUnsure: Flow.uncertain({}) },
setQuantity: CartDomain.setQuantity.outcomes({
  success: Flow.ignore,                               // NEW: Flow.ignore
  failure: { LineGone: Flow.ignore, NotSent: Flow.ignore },
  unknown: E.QuantityUnsure,
}),
removeFile: AttachmentsDomain.remove.outcomes({
  success: Flow.ignore,
  failure: { RemoveRefused: E.FileKept.from(/* … */), NotSent: Flow.ignore },
  unknown: Flow.ignore,                               // NEW meaning here: not retained, as a bare write's unknown is (rule 40)
}),
on: {},
```

- **On `unknown`: no new semantics.** Rule 40 already has it: a bare write's "unknown is not retained, so it never holds". `unknown: Flow.ignore` is that fact per channel, so `Flow.ignore` also absorbs the 10 release-only handlers **without** any hold policy. Saying it at the mapping beats the cancel-in-a-handler two files away.
- **Gain.** About 27 events and handlers, plus the 10 release-only ones, plus many of the 32 `NotSent` lines. The graph loses nodes that say nothing. Only `Changed` among the ignored events sampled appears in Stories (3 files, and it may be another event of that name). Concepts: fewer, because "bare" becomes the all-ignored case rather than a separate idea.
- **Lose.** A handler can no longer be added without adding an event: fine, that is a one-line change. Debugging needs evidence: `ignored` in `Story.ending`'s record and `save → ignored` in `flow explain`. "Flow.ignore" on a maybe-landed write is blunt, and that is correct: it should look blunt.
- **Interacts.** Rule 13 (value may be `Flow.ignore`), rule 20 (satisfied in all arrivals), rule 45 (`UnresolvedHold` not raised: nothing is retained), rule 47 trivially. Domain writes: rule 30's store effects on an unretained unknown must equal those on `cancel`. **Not checked against the 2.7.13 table**; first thing a design pass should do.
- **Cases.** Cart: fits. Pay's late-only `Declined`: handled for real in a state, so not ignorable; the 9 late ignores stay. Sign-in's late `WrongCode`: mapped to a real event. A `reject` lane ignoring `unknown`: the next commit may race a request that may land; visible at the mapping. **Fails, must be forbidden:** a stream's `missed` (streams v3's safety rule: a gap must be handled). And a `Flow.ignore` on a read's `failure` is legal only because the row shows the error.

**Verdict: pursue.** Largest real shrink, with no private state, and it covers half of H.

### C. Identity fields: the ref carries them

**Idea.** A memory field declares itself part of the actor's identity. It is given once, by the ref, and is read-only.

```ts
// BEFORE: editor.definition.ts, editor.ref.ts, useEditor.ts
memory: { workspaceId: Flow.input(Schema.String), ticketId: Flow.input(Schema.String), draft: Flow.initial(Schema.String, "") },
export const editorRef = (ticket: TicketKey) =>                                  // user-defined: editorRef, TicketKey
  actorRef(EditorMachine, [ticket.workspaceId, ticket.ticketId], { persist: true, retain: "10 minutes" });   // existing: actorRef
const editor = useActorByRef(editorRef(ticket), { input: ticket });              // the same two values again

// AFTER
memory: { workspaceId: Flow.identity(Schema.String), ticketId: Flow.identity(Schema.String),   // NEW: Flow.identity
          draft: Flow.initial(Schema.String, "") },
export const editorRef = (ticket: TicketKey) =>
  actorRef(EditorMachine, ticket, { persist: true, retain: "10 minutes" });      // arg 2 RENAMED: parts array to a value carrying the fields
const editor = useActorByRef(editorRef(ticket));                                 // no input
// Visit: identity plus a per-run field. existing: input
const visit = useActorByRef(visitRef(ticket), { input: { assignee } });
// Singleton: unchanged. existing: string id, input
export const SessionRef = actorRef(SessionMachine, "coordinator", { persist: true });  runtime.ensureActor(SessionRef, { input: { userId } });
```

- **Why a marker, where the survey had none.** It closes the hole in section 3: Flow picks the declared fields, extra fields ignored, the same rule as contract keys (`machine-design` 2.7.3). So a `TicketRow` names the same actor as a `TicketKey`. Locality: the property sits on the field. And it can be read-only, by type. Regex finds no handler writing a `Flow.input` identity in either app; `Panels`' and `Pay`'s writable ids are `Flow.initial`, which stay ordinary memory.
- **Gain.** `{ input }` leaves 46 sites; parts arrays and their ordering go; `ensureActor(editorRef(T42), { input: T43 })`, wrong and silent on first ensure, cannot be written. **No real instance was found**: this is a correctness guard, not a fixed bug. The "a/b","c" ambiguity stays closed: encode by field Schema, in sorted field order.
- **Lose.** One word. Two spellings of an id (record, string). Local actors and machine Stories still pass identity as input: `createActor(EditorMachine, { input })`, `Story.machine(EditorMachine, { input: T42 })`. So "input" stays one concept with one exception, the ref.
- **Interacts.** Persistence: the id's encoding changes; nothing shipped, so no migration. Lane identity includes actor identity, so lane records follow. Inspection gets better: `editor{workspaceId,ticketId}`. Stories: `.ensure(assistantRef(T42), { input: T42 })` loses the input. SSR: `page.tsx` shortens. `InputIgnored` (Runtime O3) now speaks of non-identity input only. Plans: Runtime O3, Machines O1. Fragments: a trait's `Flow.input` could use the marker too, fixed per incarnation since `resetOn` makes a new one; see F.
- **Cases.** Compound (editor): fits. One field (`queueRef(workspaceId)`, now a string id): `actorRef(QueueMachine, { workspaceId })`, or keep the string and `{ input }`? Pick one. Singleton with input: unchanged. Number or branded id: encoded by Schema. Nullable identity: type error. **Fails:** an actor whose id is not a memory field at all (a hash of inputs): keeps the string form. An actor that "moves" (Pay): not identity, by design.

**Verdict: design round**, small: the marker's name, one-field refs, whether trait fields share it.

### D. Identity in calls: a selector, not `scope`

**Idea, three options.** Assume C. Which is the right size?

```ts
// BEFORE: editor.machine.ts, comments.trait.ts
const ticketKey = ({ memory }: { memory: Memory }) => ({ workspaceId: memory.workspaceId, ticketId: memory.ticketId }); // user-defined, 13 copies
const commitDraft = O.save.commit(({ memory }) => ({ ...ticketKey({ memory }), title: memory.draft }));
activities: [O.ticket.subscribe(ticketKey), O.files.subscribe(ticketKey), O.details.subscribe(ticketKey)],
guard: [canSave, O.save.idle(ticketKey)],
PermissionRevoked: { target: S.CLOSED, actions: [O.save.cancel(ticketKey)] },

// OPTION 1, recommended: Flow supplies the selector. Calls keep their shape
machine(Editor, ({ S, E, O, identity }) => {                                     // NEW in the machine body: identity
  const commitDraft = O.save.commit(({ memory }) => ({ ...identity({ memory }), title: memory.draft }));
  // activities: [O.ticket.subscribe(identity), O.files.subscribe(identity), O.details.subscribe(identity)],
  // guard: [canSave, O.save.idle(identity)],
  // actions: [O.save.cancel(identity)],
});

// OPTION 2, the survey's: per operation
save: TicketsDomain.saveTitle.outcomes({ scope: ["workspaceId", "ticketId"], success: /* … */ }),  // NEW: scope
const commitDraft = O.save.commit(({ memory }) => ({ title: memory.draft }));
// activities: [O.ticket.subscribe], guard: [canSave, O.save.idle], actions: [O.save.cancel],

// OPTION 3: name matching. An identity field fills a same-named input field, with no list
const commitDraft = O.save.commit(({ memory }) => ({ title: memory.draft }));
```

**Against `scope` (option 2), on four grounds.**

- **It does not shrink.** About 67 `.outcomes` sites, most with a same-name key. `scope` adds a line or field-list to each of perhaps 50; it removes 13 helpers (about 45 lines) and shortens calls by one word each. Net near zero, as in streams. The editor repeats `["workspaceId", "ticketId"]` five times.
- **The keyless form would mean two things.** Today `O.save.cancel` with no key means "this ending's Attempt" (rule 43), and elsewhere is `KeyRequired`. Under scope it also means "the key from memory, now". For a writable field those differ: a held lane for ticket A while memory says B. `KeyRequired` catches that mistake today and would stop catching it.
- **A commit no longer shows its key**, priority two.
- **No evidence of the mistake it prevents** (section 3). `KeyRequired` and types already catch most.
- **Against option 3.** Shortest by far, but it introduces a silent failure where none is observed. A contract about *another* ticket, whose selector forgets its `ticketId`, posts to this one. It is the "accidental binding" the survey rejected.
- **For option 1.** It is today's helper, written by Flow. No binding rule, no meaning change, every call as readable as today. Tagged, so summaries can print `save × identity`, which a closure cannot do: static analysis gets better. Removes 13 helpers (roster's `technician` stays, spreading `identity`). In a fragment body it reads the fragment's identity fields. **Cost:** one name. **Gain is modest**, and it prevents nothing, which is the honest size of this repeat: after the helper it is one word per call.
- **Cases.** Roster: `{ ...identity({ memory }), technicianId: event.technicianId }`. Pay, Panels: no identity; own selector stays. Queue toggles by `item`: own selector. Merge (two customers): spread plus the second. All work because nothing is implicit.
- **Interacts.** With C: needs it. With F: an absent placement has no identity, so a body never runs without one. Nothing else moves.

**Verdict: pursue option 1, after C.** Hold 2 and 3. Reopen only if converting the desk's editor and Comments shows the calls still read badly; count lines before deciding. Separately, today's views can shorten with `O.save.get(s, s.memory)`.

### E. No `signal` in ports, then none in contexts

**Idea.** Interruption already reaches the request. The port stops taking a signal. Then the contract's context can lose it.

```ts
// BEFORE: ticket.contracts.ts, ticket-api.ts, http-api.ts
lookup: (key, { signal }) => TicketApi.use((api) => api.load(key, { signal })),            // existing: signal, 61 lines
load: (key: TicketKey, options: { signal: AbortSignal }) => Effect<TicketRow, TicketNotFound | NoResponse>;
Effect.tryPromise({ try: (lifetime) => fetch(url, { signal: AbortSignal.any([options.signal, lifetime]) }), catch: () => new NoResponse() });
// BEFORE: feed.contracts.ts:65, a page of catchUp
Effect.acquireUseRelease(Effect.sync(() => new AbortController()),
  (controller) => TicketApi.use((api) => api.eventsSince({ workspaceId, after: cursor }, { signal: controller.signal })),
  (controller) => Effect.sync(() => controller.abort()));

// AFTER
lookup: (key) => TicketApi.use((api) => api.load(key)),
load: (key: TicketKey) => Effect<TicketRow, TicketNotFound | NoResponse>;
Effect.tryPromise({ try: (signal) => fetch(url, { signal }), catch: () => new NoResponse() });  // existing: Effect's signal, not Flow's
TicketApi.use((api) => api.eventsSince({ workspaceId, after: cursor }));
```

- **Where the real API gets it.** `fetch`: `Effect.tryPromise`'s argument. SDK taking a signal: the same. XHR: `Effect.callback((resume, signal) => …)`, or return a cleanup Effect, in place of streams 6.6's `signal.addEventListener`. Streaming body: `Stream.fromReadableStream`'s scope cancels the reader. Socket or SDK callback: `Feed.callback`'s scoped `register`.
- **Verified, section 3.** The first three hold. **The gap:** after headers, a non-stream `response.json()` is not cancelled by interruption. A cancelled read keeps downloading its body and the result is thrown away. Correctness holds (rule 24's ending comes from the fiber) but bandwidth does not. Fix inside the adapter when it matters: read the body inside the same `tryPromise`.
- **Gain.** 61 lines shortened, 239 port mentions gone, 5 hand-made `AbortController`s gone, two of them real bugs (R: M7, S-M2), and the `AbortSignal.any` of two signals, which shows even the desk's author was unsure. Flow's context loses a word and the Runtime stops making a controller.
- **Lose.** A multi-step adapter wanting one signal across `fetch` then body has no ready handle; it makes a scoped controller. That is the one thing `signal` did well.
- **Interacts.** Streams v3 Q9 says "`signal` keep" and its R17, 3.2, 6.5, 6.6, 6.8 use it; `catchUp` and `subscribe` contexts change. So step 2 reopens a settled word, and is worth doing only once. `machine-design` 2.7.3 examples, 2.8.2, and the table at 2.9.1 ("aborts the `signal` the adapter passed"). Stories: `drop` interrupts a fiber; Fakes do not see signals. CLI: none.
- **Cases.** Fetch, SDK, XHR, NDJSON, SSE, WebSocket, Stripe: each above. `host.ts`'s demo: a port with no signal needs none. **Fails:** an adapter wrapping one request in several Promises, as said. And `f.length !== 0` in Effect: `try: (...args) =>` gets no signal. Rare.

**Verdict: pursue in two steps.** Step 1, no design change: ports take no signal, in both apps. Step 2, once nothing reads it: remove the word, editing streams v3 in one pass.

### F. An absent placement, instead of `""`

**Idea.** A placement's `resetOn` may be `null`: not placed. The trait never sees an absent subject.

```ts
// BEFORE: queue.machine.ts, comments.trait.ts
preview: {
  input: ({ memory }) => ({ workspaceId: memory.workspaceId, ticketId: memory.previewId ?? "" }),
  resetOn: ({ memory }) => memory.previewId ?? "",
},
ticketId: Flow.input(Schema.String), // "" while the queue previews nothing
const noTicket = ({ memory }) => memory.ticketId !== "" || deny("NoTicket");       // user-defined, 5 guards
O.thread.subscribe(ticketKey, { when: ({ memory }) => memory.ticketId !== "" }),

// AFTER
preview: {
  input: ({ memory }) => ({ workspaceId: memory.workspaceId, ticketId: memory.previewId! }),   // runs only when placed; typing is the design question
  resetOn: ({ memory }) => memory.previewId,                                                   // NEW meaning: null is not placed
},
ticketId: Flow.input(Schema.String),                                                           // always a real ticket
O.thread.subscribe(ticketKey),
```

- **Gain.** M8 (a post into ticket `""`, path `[""]`) is gone by construction. 5 guards, 2 `when`s, 2 sentinels go. The trait stops knowing one host's absent state, which is real locality. M11's belief becomes true.
- **Lose.** Root traits are no longer always placed. Views and events must handle absence, as they do for a node-placed trait already (rule 59's rows are `undefined` while inactive; `CommentsPanel` already writes `?.`).
- **Interacts.** Rule 56: `resetOn`, "A, B, A", must become "A, nothing, A", same path and same park. Rule 51: no subject path rather than `[""]`, which removes a nonsense lane record. Rule 60's release on leave fires as for any end. `resetOn` on a root trait may need a starting turn with no incarnation. 2.9.4 restore, `Story.fragment` `reset(null)`, `flow explain`. **Rule 59 is less in the way than the survey says**; it is M11's reading that changes.
- **Split from selects.** The survey also has a commit select returning `undefined` for "no call". **Drop that half.** `skillsFor ?? ""` in `roster.machine.ts:339` is real, but a commit that silently doesn't happen is a new silent failure, in the turn's step 5 after guards passed. Fix those in apps: carry the id in the event, or a state that holds it. Same for `signatureRef`, `paymentMethodId`, `clientSecret`. This leaves about 3 of the 9 sentinels for Flow.
- **Cases.** Queue preview, order-summary slot: fit. `.each`: absent by membership already. Node-placed: absent by state already. Subroutine: not applicable. **Fails:** a trait that must be alive with no subject, to hold a draft for a not-yet-chosen ticket. It keeps a nullable `Flow.initial`, or a host state.

**Verdict: design round**, on placement only. Real bug, but narrow: two hosts. Before a new meaning, try the same queue with a state or `.each` of at most one, and compare; 2.9.5's F8 moved away from a list of one, so check why first.

### G. `Outcome.unknownOn`, and no `lost`

**Idea.** The 40 pipes are real, and two copies of the helper are silly. Ship the helper.

```ts
// BEFORE: shared/outcomes.ts (and again in cart.contracts.ts), ticket.contracts.ts
export const unknownWhenLost = (write) => write.pipe(Effect.catchTags({                       // user-defined
  NoResponse: (e) => Outcome.unknown(e), ServerError: (e) => Outcome.unknown(e) }));
commit: (input, { attempt }) => TicketApi.use((api) => api.saveTitle(input, { idempotencyKey: attempt.id })).pipe(unknownWhenLost),

// AFTER: one app-level constant, in Effect's own shape
export const unknownWhenLost = Outcome.unknownOn("NoResponse", "ServerError");                // NEW: Outcome.unknownOn
commit: (input, { attempt }) => TicketApi.use((api) => api.saveTitle(input, { idempotencyKey: attempt.id })).pipe(unknownWhenLost),

// NOT PROPOSED: the declaration
lost: ["NoResponse", "ServerError"],   // on the transaction
```

- **Why not the declaration.** Its gain is smaller than claimed (Fakes: section 3), the types already carry the split, and it gives one idea two places: Assistant must still write `Outcome.unknown(new Truncated())` mid-commit, as Pay's branches do. It also moves one line per commit from pipe to field: net zero. And `lost` is loaded: `missed Lost`, `Fake.Lost`, the upload's `Lost` event, and streams just cut a `lost`.
- **The one argument for it.** Forgetting the pipe makes a 5xx a definite failure, and a retry a new Attempt: a possible duplicate write. A **required** field would force the question, an upfront contract. That is a real correctness case, and no review found it happening. Note it in `revisit.md`.

**Verdict: pursue the helper; drop the declaration for now.**

### H. `hold: { resend }`: drop

**Idea, as surveyed.** `hold: { resend: 1 }` on the operation; Flow re-sends and delivers the event after the budget. **Reverses** 2.9.5's "keep", and rule 25's "no Flow retry".

```ts
// BEFORE: roster.machine.ts
MoveUnsure: [
  { target: "self", guard: [O.move.retryable({ times: 1 })], actions: [O.move.retry] },     // existing: retryable, retry
  { target: "self", updateMemory: () => ({ notice: "We couldn't confirm that move" }), actions: [O.move.cancel] },
],
// AFTER
move: moveTechnician.outcomes({ success: E.Changed, failure: { /* … */ }, unknown: E.MoveUnsure, hold: { resend: 1 } }),  // NEW: hold, resend
MoveUnsure: { target: "self", updateMemory: () => ({ notice: "We couldn't confirm that move" }) },
```

**Why drop.**

- **Saves about 1 line per site.** Two handler lines become one, and one is added to the definition. Maybe 20 lines. The 10 release-only cases are B's.
- **A write re-sent with no turn.** Today `retry` is an action in a turn, visible in the graph, in Stories and to guards. A Flow re-send needs new 2.7.13 cells, a new Story record, new row timing, and a rule for what "not delivered" means for the current or late test (rule 14). This is the private behaviour streams' Highs came from.
- **A new silent failure.** `Restored` after a reload would re-send with nobody's code on the path. Open item 12 says a hold adopted after the server's idempotency window "is a new write there". Today the machine has a line to look at; with `hold` a person never sees it.
- **Two spellings.** The 9 timer sites (editor, upload, autosave, body, comments) keep the machine, as do the 7 owner-held ones.
- **M4 is not fixed in general.** It needs `Restored` mapped apart; A forces that word, cheaper.
- **What would change this.** The survey's "three budgets, one delay" is true, but the budget isn't the problem. If handlers still grate after A and B, a pure function returning the two-element array is a fragment-sized helper with no new semantics, and the app can write it.

**Verdict: drop**, keep 2.9.5. The evidence does not support reversing it.

### I. Leaving: name the loss; no `onUnload`

**Idea.** `dispose({ forget: true })` drops unsettled writes and hides it in a boolean. Say so at the call.

```ts
// BEFORE: host.ts
const unsettled = runtime.unsettledWrites();                                          // existing
if (unsettled.length > 0) { if (!(await confirmDiscard(lost))) return "Refused"; }
await runtime.dispose({ forget: true });                                              // existing: forget, also drops lane records

// AFTER: the check stays, it is the app's UI
const unsettled = runtime.unsettledWrites();
if (unsettled.length > 0) { if (!(await confirmDiscard(lost))) return "Refused"; }
await runtime.dispose({ forget: "dropUnsettled" });                                   // RENAMED value: true to "dropUnsettled"
```

- **Why not the survey's.** A failing `dispose`: a rejected Promise mid sign-out leaves half a session, and a forced sign-out (a 401, an expired token) can't refuse. So the author writes `discard: true` everywhere that matters. `onUnload: "warn"` default: `Pay.tsx` proves the policy is the app's (section 3). A browser listener in core is also a new platform dependency.
- **Gain.** One honest word; an agent copying the line sees what it does. **Lines: none.** **Cases.** Shared computer privacy: drops, stated. Kiosk: unaffected. Server: none. **Interacts.** Rule 44, C43, Story `{ how: "forget" }` (rename it too), `Fake.storage`. Reading a Story gets better.
- **Candidate for later.** A one-line `flow-state/react` hook taking a filter, `useWarnOnLeave((w) => w.contract === pay.id)`. It is a smaller gain than it looks: 2 copies.

**Verdict: pursue the rename, if at all at low priority.** Not a smaller API. It doesn't fix tab close, where the persisted lane returns `Held` anyway and rule 44 applies.

### J. Entity key from input

`Ticket.patch(input, { title: input.title })` where 11 literals repeat a same-named key. Passing a value carrying the key's fields is already the rule for contract keys. **Pursue only if it is one sentence**: extend 2.7.3's "extra fields are ignored" to entity keys, after checking `Entity.patch`'s types. If it costs a type puzzle, drop. **Fails:** input names it `id`, keep the literal. Silent risk: none, a missing field is a type error.

### K. Drop

- **Fragment input lists.** A second form of `input` for 11 sites. Once C is done, revisit only if `flow explain` wants the edge.
- **Story ids from file names.** `id` is a public name for `flow story run` and saved traces; a rename would silently break them. `stories-amended` requires `id` on all three subjects.
- **Default fake fixture.** Hides which world a Story runs in, and the fixture list is one word. Stories are meant to be read cold.

## 5. How they combine

**Overlaps.**

- **C and D are one design.** C declares; D reads. C without D still pays. D without C has nothing to read.
- **A and B both shape a mapping.** `unknown: { Cancelled: Flow.ignore, Flow: E.Unsure }` is legal and useful: the stop releases at once (editor `SaveStopped`, a 2.9.5 row moved to `open-items`). So the per-tag retention must be read by tag. Decide with B.
- **B removes H's best case**, 10 release-only handlers.
- **E and G shorten the same line**, and neither depends on the other.
- **F depends a little on C.** Do C first so identity's meaning is fixed before absence is added.

**A general idea that covers several: one fact, one place.** A, C, D, E, G each remove a fact stated twice or a thing Flow or Effect already knows. B removes a *non-fact*, an event that says nothing. H, `scope`'s completion and name matching are different: they ask Flow to act. That line is the same as section 2's, and is what I would hold to.

**Combined, on the real save** (proposed, all of A, C, D, E, G):

```ts
// ticket.contracts.ts
export const saveTitle = transaction({
  id: "DispatchDesk/save-title",
  input: { workspaceId: Schema.String, ticketId: Schema.String, title: Schema.String },
  output: TicketRow, key: ["workspaceId", "ticketId"], concurrency: "reject",
  commit: (input, { attempt }) =>                                                     // dropped: signal
    TicketApi.use((api) => api.saveTitle(input, { idempotencyKey: attempt.id })).pipe(unknownWhenLost),
});
// editor.definition.ts
memory: { workspaceId: Flow.identity(Schema.String), ticketId: Flow.identity(Schema.String), draft: Flow.initial(Schema.String, "") },
save: TicketsDomain.saveTitle.outcomes({
  success: E.Saved.from((ticket) => ({ ticket })),
  failure: { TitleRejected: E.SaveFailed.from((e) => ({ reason: e.reason })), TicketNotFound: E.SaveFailed.from(() => ({ reason: "This ticket no longer exists" })),
             TicketLocked: E.SaveLocked.from((e) => ({ lockedBy: e.lockedBy })), NotSent: Flow.ignore },
  unknown: { Cancelled: Flow.ignore, Restored: E.SaveUnsure, NoResponse: E.SaveUnsure, ServerError: E.SaveUnsure, Flow: E.SaveUnsure },
}),
// editor.machine.ts
const commitDraft = O.save.commit(({ memory }) => ({ ...identity({ memory }), title: memory.draft }));
const withinBudget = O.save.retryable(identity, { times: MAX_RESENDS });
// editor.ref.ts, useEditor.ts
export const editorRef = (ticket: TicketKey) => actorRef(EditorMachine, ticket, { persist: true, retain: "10 minutes" });
const editor = useActorByRef(editorRef(ticket));
```

The retry trio stays visible; the key stays at the call; nothing runs that the author can't see.

**Size, sober.** A rough estimate over both apps, not measured: A about 40 lines, B about 100, C about 50, D about 45, E about 60 tokens with no line change on most, G about 15 lines. Perhaps 250 lines of about 25,000. Words: **NEW** `Flow` key, `Flow.ignore`, `Flow.identity`, `identity`, `Outcome.unknownOn`; **dropped** `signal`, `Feed` key, parts-array form. Net API: slightly *larger* in names, smaller in forms and in what must be declared. Total code will not shrink much. As with streams, the value is what can no longer go wrong: M3, M7, S-M2, M8, a mismatched ref.

## 6. Better candidates, and what else was looked at

- **`Flow.ignore` as the generalised bare write** (B). The survey treated release-only as a hold-policy question. Rule 40 already answers it.
- **`get(s, s.memory)` and ports without signal** (D, E step 1). No amendment. Do these whatever else happens.
- **`Cancelled: Flow.ignore`** answers "release on user cancel", deferred in 2.9.5, without its own rule. Upload's tombstone keeps its handler.
- **`target: "self"`: 334 lines.** The largest token repeat, missed by the survey. Omission could mean "stay". **Not proposed:** a forgotten target would silently stay, for the benefit of a token, and "no move" reads well. Worth a sentence from the owner, nothing more.
- **`Flow.uncertain`: 48 events.** Looks like one fact twice (the marker, and being targeted by `unknown:`). It is two: it stops `unknown: E.Saved` compiling. Keep.
- **`NotSent` as a default, `idle` on every commit:** left alone. `NotSent` means intent never left the device; it stays named, even if the name is `Flow.ignore`.

## 7. Order

Each step is usable if the next is refused.

1. **No design change.** Ports take no `signal` (E step 1); `O.x.get(s, s.memory)`. Tells us whether anything really needs `signal`.
2. **A and B together**, one round: one word across channels, `Flow.ignore`, and check per-tag retention against 2.7.13 and rule 30. Rename `Feed` in streams v3 **before** streams merges, to avoid doing it twice.
3. **G** helper. Minutes.
4. **C and D**, a small design round. Then convert the editor and Comments, with counts, before claiming the gain.
5. **E step 2**, if step 1 leaves nothing reading `signal`.
6. **F**, a design round; compare with a state or `.each`.
7. **I** rename; **J** if one sentence.

H and K: record in `revisit.md`, if accepted.

## 8. Not verified

- No type-check of any **after**. The `identity` selector's types, `memory.previewId!`, and `Flow.identity` in a fragment are sketches.
- The size figures in section 5 and D's arithmetic for `scope` are estimates from regex and a few files. Directions only.
- `unknown: Flow.ignore` as equal to `cancel` for domain writes and `HeldThisTurn` is by reading rules 30 and 40, not the 2.7.13 table cell by cell.
- The Effect signal probe ran on 4.0.5, without a real `fetch`. The stream cancel is from reading `Channel.ts`.
- Input-field writes were checked by single-line regex; a multi-line `updateMemory` could hide one.
- `machine-design.md` was read while being edited by the Stories merge; line and rule anchors may shift.
- No review of this list has run; one Opus review, then a redesign of what survives, once the owner has reacted.
