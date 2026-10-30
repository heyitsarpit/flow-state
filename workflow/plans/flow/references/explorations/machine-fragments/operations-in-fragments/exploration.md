# Exploration: operations owned by fragments

Status: **exploration, nothing decided, nothing accepted.** Written 2026-10-30 for the owner's idea: a trait or subroutine
owns its operations completely, and exposes only what it chooses through its existing ports. This file edits no plan
and no other proposal. No type spike was built; every code sample is a working draft and was not type-checked.
It builds on `../merged/operations/proposal.md` (short name **OID**) and answers its section 3.10.

Short names for citations (all under `workflow/plans/flow/references/explorations/machine-fragments/` unless noted):

| Short | File |
| --- | --- |
| MD | `machine-design.md` |
| PR | `principles.md` |
| IM | `calls-object/impact.md` |
| OID | `merged/operations/proposal.md` |
| M3, M4, M6 | `merge-3-stories/proposal.md`, `merged/entities.md`, `merge-6-streams/proposal.md` |
| v2, v3 | `git show 26bf7ab9:<this folder>/proposal-v2.md` and `proposal-v3.md` (removed from the tree; line numbers are those of the commit) |
| CMP | the same commit's `comparison/README.md`, `comparison/reviews/principles.md`, `comparison/reviews/correctness.md`, `comparison/build-a-v2-amended.md`, and `reviews/v2-principles.md` |
| RT | `workflow/plans/flow/Runtime.plan` |

Marks in code: `// NEW`, `// REVIVED` (a word from an earlier proposal), `// NEW MEANING`, `// existing`, `// user-defined`.
A line with no mark is unchanged from MD/OID.

## 0. The answer in short

1. **Why it was rejected.** Mostly not lifecycle. The recorded decisive reasons were *redundancy* (the plan amendments
   P1–P4 made v2's one I/O fragment unnecessary), *size* (+29 % over the baseline, six roles for `requests`) and
   *relays* (nesting). Lifecycle (the abandoned ending) was a real cost in v2 and returns as IM's N4. Section 1 lists
   ten reasons and whether each still holds. Net: four no longer hold, one holds partly, and five still hold (one in a changed form, two as
   work items, one only if done IM's way, one for correctness). None is a blocker.
2. **The model.** A fragment declares `operations` like a definition. A lane belongs to the **placement** (instance
   path plus `.each` key), not to one incarnation; an ending is routed to the **incarnation that started it**. If that
   incarnation is gone the ending is an **orphan** and goes to the fragment's optional `whenOrphaned` callback, else
   to the contract's `orphaned` handler (P19). No required host port, no host cancel, rows private unless `.public()`.
3. **Recommendation: both kinds, one rule set; build traits first.** Subroutines add one hook (`start`). If only one:
   traits.
4. **Buildable with rule changes** (section 5). Not as is: rule 3, the incarnation counter, the orphan route, rule 15's
   scope, Stories fixtures and the contract `orphaned` signature all change.
5. **Honest judgement.** It removes a lot of host wiring when the same I/O policy is used twice or more, and it makes the
   `unknown`-misrouting bug (H4/H5) unwritable in a host. It does **not** make a single-use host smaller: the first use
   costs more lines than the host-owned version (section 3.6), as every earlier comparison found (CMP principles:42).

## 1. Why fragment I/O was rejected, and does each reason still hold

The history has three layers: v2 had fragment `requests` (v2:84, 129–165); v3 cut them (v3:897–901); MD kept the cut
(MD:34–36, 409, 2088, 2173–2176) and OID deferred a second attempt (OID:287–300). IM had recommended reversing it for
per-row traits (IM:261–268) before OID changed course.

| # | Reason, with its source | Still holds? | Why |
| --- | --- | --- | --- |
| **R1** | **Redundant after the plan amendments.** With P2 (fenced host commits) and P4 (retry on the descriptor), `CommitWithRetry` had no users left; only `TwoFactorStep` still used `requests` (CMP build-a-v2-amended:28–29, 33–34, 2003–2005; CMP README:40–41; v3:897–899). | **No (reversed).** | P4 itself is gone: MD rule 25 says "No Flow timeout and no Flow retry" (MD:609–610, 2186–2187). Waiting, trying again and reconciling are now states and schedules the host writes (MD:1107–1153, 1189–1211). The reuse the cut gave up is exactly that code. v3 named the trigger: "If a policy appears that commit options cannot express, v2's request semantics are the ready design" (v3:900–901; CMP principles:167: "Revisit … if a second retry policy appears"). Checkout (Busy wait, Unsure check), upload (cancel then clean up), chat post and likes (OID 5.1–5.4) each rewrite a WAIT/CHECK pair. |
| **R2** | **Size and concept count.** v2 was 29 % above the baseline; "no fragment system is smaller than the baseline" (CMP principles:42, 46–48); `requests` had six roles: contract, body, host binding, action token, Story option, cut field (CMP v2-principles:186). | **Partly.** | The six roles came from the host binding (`operation`, `results`, result tokens). Owning the operation inside removes the binding: the fragment reuses OID's `operations` declaration, so no `kind`, `operation`, `results`, token, or host `abandoned` handler. The first-use line cost remains (3.6). |
| **R3** | **Nesting and relays.** v2 limited requests to fragments placed directly by a machine (v2:84) and deferred subroutines inside subroutines to remove "request relays, nested `start`, nested generations and `abandoned` routing through relays", "the deepest rules in every proposal" (v2:2134–2136, 2240). | **No.** | Relays existed because a request was bound to a *host* operation. Total ownership has nothing to relay; a nested fragment's lane is named by its own placement path. (Subroutine-in-subroutine stays deferred for its own reasons; MD's table lets a subroutine contain subroutines, MD:70.) |
| **R4** | **Lifecycle: the abandoned commit.** v2 rule 10 gave every commit binding a host `abandoned` handler run twice (a "pending" run fused into the leaving turn, then the terminal outcome later), writing host memory only (v2:150–160). Problem L5 (PR:126): a late unknown dropped means "double delete, double order". | **Yes, in a different form.** | Late routing now exists for all calls at admission (MD rule 14, 2.5 step 1: MD:515–520, 655–658), and "only A's fragment requests are fenced" (CMP correctness:169) is no longer true. What is left is the case rule 14 cannot answer: the owner is a dead *fragment incarnation* and the host cannot read its events (rule 4). That is IM's N4 (IM:47–58) and OID's orphan (OID:283, 293–294). Section 2.4 answers it. |
| **R5** | **Principle A5, "I/O inside fragments: I/O is split between fragment and host"** (PR:171, 200). | **No, if ownership is total.** | The complaint was the *split*. With one owner per operation there is no split. It becomes a lint: one operation, one owner (`SharedContract`, OID:252–256, widened across placements). |
| **R6** | **Rule 10: swapping a fragment for one with the same contract and summary cannot break the host** (MD:481–485); IM:261–268 notes the promise assumed effects are callbacks and exits. | **Yes, as a work item.** | The summary must also record starts, required services and orphan policy (2.7). Then the promise holds: a swap with the same summary cannot change what the host must fill. |
| **R7** | **Stories alone have no `services` or `fixtures`, "because fragments have no I/O"** (M3:147–149, 367–368). | **Yes, as a work item.** | `story.trait` and `story.subroutine` gain `fixtures` (2.6). Not a blocker. |
| **R8** | **The orphan port costs host wiring.** IM's N4 is one required `onOrphaned` port per call per placement; its payload is an ending report the host cannot reuse (IM:51–55, 270–275). OID 3.10 reason 2 (OID:293–295). | **Yes, if done IM's way.** | Avoided by the placement-owned lane and an *optional* fragment-chosen `whenOrphaned` (2.4). |
| **R9** | **"None of the bugs needs it"** (OID:291–292): every list case is an `.each` site on the host; IM:439–440 recommended host `.each` for rows that are host data and per-row traits only for rows that are "their own thing". | **Yes, for correctness.** | Nothing in OID is *wrong* without fragment operations. The case is reuse and host size, not a bug. This exploration must be judged on that, not on bugs. |
| **R10** | **Section 1 and 6: policy is written once per machine; the cost is "a host handler can still start a new write from an `uncertain` event instead of `.retry`"** (MD:49–52, 2173–2175; v3:900–901). | **No (the cost disappears).** | If the mapping and the reconcile live inside the fragment, the host cannot misroute an `unknown` (H4, H5: PR:148–149). The rejection's own stated cost becomes a benefit. |

Changes since the rejection that bear on it, in the owner's list: **outcome channels** (three channels, MD 2.7.1)
make an ending's meaning part of the contract, so the fragment, not the host, can own the mapping safely. **Lanes per
operation** (OID 3.2) split "what is in flight" (the lane) from "where the ending goes" (the route, OID:145–146), which
is the split fragment ownership needs. **Late routing at admission** (rule 14) supplies the machinery v2 lacked.
**The turn algorithm** (MD 2.5) already treats a fragment's timer firing as a turn addressed to an incarnation
(MD:659); a call ending is the same shape. **`.each` incarnations** (MD:467–473) already number lives per copy.
**`whenAbandoned`** (MD:421–425) already fuses an end-of-life hook into the leaving turn. **Freezing** is the one
thing that fights this (2.4, F8). **Entity domains** (M4) apply store effects at settlement regardless of routing
(M4:366–369: "Routing never changes store effects (E13)"), so a fragment-owned domain write cannot lose its store
consequences when the fragment dies.

## 2. The model

### 2.1 Where the data comes from

Start at the wire, as OID 2 does. Nothing here changes the first four rows of OID 2.

| Step | Real source | Written in | Changes here |
| --- | --- | --- | --- |
| Request and response | `fetch`, XHR, `WebSocket`, an SDK | an Effect service (`DocsApi`, `UploadApi`, `ChatSocket`) | no |
| Cancel | `AbortController`: Flow interrupts the fiber, which aborts the `signal` | the commit | no |
| Classification | `Outcome.success / failure / unknown`; `Session.*` | the contract, module scope | no |
| Which event an ending becomes | the site's `outcomes` | **the fragment's `operations`** | **moved** from the host definition to the fragment |
| The input of one start | the start's select over after memory | **the fragment's transition** | **moved** into the fragment |
| Lane state (`pending`, `retryCount`, `progress`, `connection`) | Flow, per placement and site | **`s.operations.<instance>.<site>`**, private unless `.public()` | **new** namespace, beside `s.schedules.<instance>` |
| Shared record data | the store (M4) | `Entity.get(s, key)` | no |
| What the host learns | the fragment | callbacks and exits, payloads shaped by the fragment | as today |

### 2.2 The rules (proposed)

Numbered F1–F10; if accepted they would follow OID's S1–S8.

- **F1. A fragment declares `operations`.** Same shape and meaning as a definition's (OID S1), written in the
  declaration beside `memory` and `traits`. MD's key-order table already lists `operations / context` for traits and
  subroutines (MD:745); only MD:292 forbids it. The endings map onto the fragment's own events; `internalEvents` are
  now "produced only by this fragment's own schedules **or operations**" (extends MD rule 2, MD:402–405).
- **F2. Only the fragment can use them.** `O.x.start`, `fetch`, `retry`, `cancel`, `idle` and `params` exist in the
  fragment body. The host's body does not receive them (rule 4 holds). A host influences a call only through the ports
  the fragment declares: `guards` (policy), `hostEvents` (a `Cancel`, a `Resolve`), `input`.
- **F3. A lane belongs to the placement.** Lane identity = (instance path, site, `.each` key). Routing owner = the
  incarnation that started the work. This is OID 3.2's split applied to fragments: the lane says what is in flight, the
  route says where the ending goes. It is what stops a re-entered fragment from starting a second write beside the
  first one's unknown (L7, PR:128).
- **F4. A current ending is a turn addressed to its incarnation.** Same shape as a timer firing (MD:659–660). Its
  source is the fragment's handler; its effects are callbacks and exits, fused as usual. If the fragment is a
  subroutine with states, rule 14 applies inside it (the owner state, then its strict ancestors).
- **F5. A dead owner makes an orphan.** An ending whose incarnation has ended is never delivered to a successor
  incarnation (fresh memory is not the memory that started the call). It goes, in order, to (a) the site's optional
  `whenOrphaned` callback, else (b) the contract's `orphaned` handler (P19; MD:2157, 2263–2266). It is admitted and
  recorded either way (rules 8, 17). `flow check` errors (`UnreconciledOrphan`) when an op can end `unknown` and has
  neither.
- **F6. Ending a life never cancels a write; it releases a read.** One-off reads and subscription placements are released
  with the incarnation (as activities are, OID:148–151; M6 rule 44 discards released deliveries). A write keeps
  running (C12, MD:2147). `whenAbandoned` may list `O.x.cancel` (and nothing else from `O`).
- **F7. Rows are private unless `.public()`.** Public means part of the contract and the summary (so rule 10 holds).
  A public row is read as `s.operations.<instance>.<site>` (a keyed list for `.each`, N1), beside `s.schedules`.
- **F8. No `.resumable()` beside a write site (v1).** A frozen owner is alive, so its ending would have to wait for the
  thaw, and call endings cannot be retracted the way queued timers are (MD:371–372 vs rule 8). Banning the pair is
  smaller than the held-ending channel IM sketched (IM:56–57, 352). Place the fragment higher instead (MD:354–356).
- **F9. Services are ambient.** A fragment's contracts carry their Effect requirements into the fragment's type; the App's
  Layer provides them; Stories provide them with fixtures. Nothing is passed at the placement.
- **F10. A subroutine may `start`.** `start: [O.x.start(select)]` in the body runs on every entry (REVIVED from v2:382,
  v2 review R4: "`start` on subroutines only"). It reads the entry's after memory. It exists because the host's entering
  transition cannot start the subroutine's operation (rule 2), the "forgotten first send" (A7, PR:173; MD:2090 marked it
  "not applicable" only because the host started everything).

**Added:** `operations` and `start` and `activities` in fragment bodies, `whenOrphaned`, `.public()`, `s.operations.<instance>`,
`UnreconciledOrphan`, the `orphaned` handler's `ending` argument, `fixtures` on fragment Stories. **Dropped:** rule 3
(MD:409) and its echoes (MD:34–36, 292, 303, 2081, 2088, 2173–2176); IM's required `onOrphaned` port; v2's
`requests`, `kind`, `operation`, `results`, host `abandoned`.

### 2.3 Who starts, retries, cancels; what the host sees

| Action | Who | How |
| --- | --- | --- |
| start, retry, `idle` guard | the fragment body only (F2) | `O.save.start(select)` |
| cancel | the fragment body; the host asks | a `hostEvents: { Cancel }` the fragment handles; `whenAbandoned` for abandonment |
| what a result means | the fragment (it owns `outcomes`) | the host never sees a raw `Outcome` |
| tell the host | callbacks and exits | payload chosen by the fragment |
| read progress or status | a `.public()` row, or the fragment's own public memory | `s.operations.UPLOADING.put.progress` |
| read raw lane state of a private site | nobody but Stories and Inspection (PR rule 9: "Nothing off the record") | as `Flow.private` memory is |

### 2.4 Lifetime: where does an ending go

The question is only ever "is the incarnation that started the call still alive". Everything else is a consequence.

| What happens to the fragment | Calls in flight | The ending goes to | Notes |
| --- | --- | --- | --- |
| **Root trait**, actor alive | none lost | its incarnation (current) | no new semantics; the owner is the actor's life |
| **Subroutine takes an exit** | the author sequenced it, or chose not to | current if alive; an exit with a write still outstanding makes an orphan | author's choice, visible in the body. `flow check` Story-derived warning `ExitWithCallInFlight` |
| **Subroutine abandoned** by a host transition | writes keep running; reads released | orphan (F5). `whenAbandoned` may `cancel`, then the ending is `unknown(Cancelled)` and orphans too | the case `Upload` handles with the contract's `orphaned` (3.3) |
| **Trait's node left** | as abandoned | orphan | same |
| **`resetOn` reset** | the old incarnation ends, a new one starts in the same turn | orphan, **not** the new incarnation | rule 9's "same turn created a new one, reach it" is for raises and timers (MD:467–470); call endings never jump incarnations. The new incarnation's `idle` reads busy until the orphan is admitted (F3) |
| **Frozen** (`.resumable()`) | n/a | banned with write sites (F8) | |
| **`.each` copy removed** | write keeps running; the lane is kept until it drains (OID S5 applied to placements) | orphan (key in the payload) | a re-added key finds its lane again |
| **Actor disposed** | as for host operations: outcome events dropped, cache and store consequences applied, persisted actors save the Attempts (RT:81–89; OID:280) | | unchanged |
| **Restore / version change** | an invoked send ends `unknown(Restored)`, an unacknowledged `NotSent { Restored }` | the restored incarnation if its slice is restored, else orphan; a lane whose placement no longer exists goes to P19 `orphaned` | lanes persist by instance path, site and key (OID S8 extended) |

**Reconciling with the delivery rules.** Rule 8 ("Deliveries are never lost", MD:431) gains "orphan endings" in its
list; rule 17 (every start ends once) holds because an orphan is an ending delivered to the orphan route; N3
(MD:627–631) says "call endings are never dropped and route by owner", and a dead owner's route is the orphan route.
Rule 14 stays for host-owned calls and applies inside a subroutine unchanged. Rule 20's "every late event that can occur
is handled" becomes: every op that can end `unknown` has an orphan policy (`UnreconciledOrphan`), and a `whenOrphaned`
callback is an ordinary port, so it is filled or explicitly optional (rule 5).

**How a `whenOrphaned` callback runs.** It is filled where the fragment is placed. When it fires, the placement's node
may be gone, so the turn is a late turn sourced at the placement's nearest surviving ancestor, and rule 15 applies
(`LateMayNotLeave`), widened by one clause: a state also "owns a pending call" if a fragment placed under it holds an
outstanding Attempt. A filling can write memory and start the host's own operations (lateness is not transitive, rule 15).
It cannot target a state that exits live work. This is exactly what the sign-in's late `WrongCode` needs (MD:549–550).

**The contract's `orphaned` handler** is the minimal generalization of P19. Today it sees `{ attempt, retry }`
(MD:1164, 2263–2266). It would also see `ending` (`Success`, `Failure` or `Unknown`), and may return an Effect (so an
upload's clean-up can run with no actor). Delivery stays at least once and the adapter idempotent (P19, MD:2157).
**This is a proposed change to a decision, not an existing capability.**

The honest limit: **an orphan cannot make a decision that needs the fragment's memory**, because the memory is gone. What
survives is the Attempt's input and the ending. A fragment that must keep deciding after its life (a saga) belongs to the
host, or declares `whenOrphaned` and lets the host decide.

### 2.5 Placed twice, and `.each` copies

- **A trait placed twice** (two instance names): two lanes per site by construction (F3). Two placements of one `reject`
  transaction can both write one server resource; `flow check` warns `SharedContract` (OID:252–256, widened across
  placements). Domain writes are ordered per record by the store (M4 rule 29), so two fragments writing one entity queue.
- **`.each` copy of a trait with operations:** one lane per copy and site, `key` available as `memory.key` (MD:457–458),
  rows a keyed list `s.operations.likes[i].set` in key order (N1). The audit's old `SharedCopyLane` hazard (MD:453–455)
  cannot occur. A removed copy's lane drains before it goes. `max` bounds copies; drained non-copies do not count.
- **Bulk actions** ("like all selected") are a raise into every copy, which remains not expressible (IM:285–291;
  AU F13). Fragment operations do not fix it and do not make it worse.

### 2.6 Services, fixtures, persistence, Stories, `flow check`, entities

- **Services (F9).** `Docs.save` needs `DocsApi`; the `Autosave` type carries `DocsApi` as a requirement; `machine(Editor, …)`
  and the App's Layer must satisfy it, as they do for a host operation. A `Flow.Service` port that the host fills at the
  placement was considered and rejected: a service is ambient, not a per-instance value, and Stories already swap it
  with fixtures.
- **Fixtures.** M3 says fragment Stories have "no `context`, `services` or `fixtures`" (M3:367–368). Change:
  `story.trait(T, { id, input?, guards?, fixtures? })`, and the harness (M3:369–372) provides them. A Story then tests
  the retry policy of a reusable fragment with no host, including a host that refuses or never answers a callback
  (PR principle 10).
- **Persistence.** Fragments declare none (MD:292 stays for `persist` configuration). Lanes persist with the actor by
  placement path, site and key, with Attempts acknowledged before invocation (PER O6). Site names inside a fragment are
  persisted identity, like memory field names (OID B6).
- **`flow check` and summaries (rule 10).** A fragment's summary gains: `starts` per alternative (as callbacks notified
  are recorded, MD:278–282), `requires` (services), each op's orphan policy, and public rows. The ending chains
  (op ending, event, callback) are checked the way timer chains are (MD:279). A host is checked against the summary
  only. `flow graph` prints the ops under the placement; `flow explain` prints `autosave  Settle → starts save
  (Docs.save, reject)`.
- **Entity domains (M4).** A fragment's site may bind a domain entry (`Issues.setLike`). Store effects follow the
  Attempt's ending at settlement, before routing (M4 rules 27, 30; M4:366–369), so they are the same whether the
  fragment is alive, frozen out or dead. Two fragments predicting one record queue per record (M4 rule 29) and each
  Attempt's `uncertain` mark is its own (rule 32). Rule 34's default lane key does not apply: the lane is the placement's.

### 2.7 Keywords

| Keyword | Status |
| --- | --- |
| `operations` in a fragment declaration | **new meaning** (OID's `operations`, now allowed in `trait` and `subroutine`) |
| `O` in a fragment body | **new meaning** (this fragment's sites only) |
| `activities: [O.x.params(…)]` in a **trait** body | **new meaning** (placed on the incarnation; a trait has no states) |
| `start: [O.x.start(select)]` | **REVIVED** from v2:382 |
| `whenOrphaned` (method on a site) | **new** |
| `.public()` (method on a site) | **new** |
| `s.operations.<instance>.<site>` | **new** namespace (OID's `s.operations.<site>` for definitions) |
| `UnreconciledOrphan`, `ExitWithCallInFlight` | **new** findings |
| `orphaned: ({ attempt, ending, retry })`, may return an Effect | **new meaning** of an existing handler |
| `fixtures` on `story.trait` / `story.subroutine` | **new** option |
| `outcomes`, `start`, `fetch`, `retry`, `cancel`, `idle`, `params`, `when`, `.each`, `of`, `max`, `callbacks`, `exits`, `hostEvents`, `internalEvents`, `guards`, `whenAbandoned`, `schedules`, `armOn`, `Flow.uncertain` | existing |
| `Autosave`, `LiveFeed`, `Upload`, `VerifyCode`, `LikeButton`; instance names `autosave`, `live`, `UPLOADING`, `TWO_FACTOR`, `likes`; all event names | user-defined |

## 3. Benefits and coding patterns

Five reusable fragments, each in full, each with its host, and each compared with OID's host-owned style. Contracts are
shown once (3.0). Counts are in 3.6. "Before" means OID: every operation is a host site, every mapping and policy is in
the host machine.

### 3.0 The data sources and contracts

```ts
// docs.operations.ts: PUT /docs/:id (fetch, If-Match, Idempotency-Key, AbortSignal)
export class DocsApi extends Context.Service<DocsApi, {
  put(p: { docId: string; body: string; ifMatch: string }, o: { idempotencyKey: string; signal: AbortSignal }): Effect.Effect<{ status: number; etag: string }, NoResponse>
}>()("docs/DocsApi") {}
export const Docs = {
  save: transaction({
    id: "Docs.save",
    input: Schema.Struct({ docId: Schema.String, body: Schema.String, etag: Schema.String }),
    result: Schema.Struct({ etag: Schema.String }),
    concurrency: "reject",                                           // the fragment coalesces: one in flight, the newest next
    commit: (input, { attempt, signal }) => Effect.gen(function* () {
      const res = yield* DocsApi.use((a) => a.put({ docId: input.docId, body: input.body, ifMatch: input.etag }, { idempotencyKey: attempt.id, signal })).pipe(Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)))
      if (res.status === 200) return { etag: res.etag }
      if (res.status === 412) return yield* Outcome.failure(new Conflict({ serverEtag: res.etag }))
      if (res.status >= 500) return yield* Outcome.unknown(new ServerError({ status: res.status }))
      return yield* Outcome.failure(new Refused({ status: res.status }))
    }),
    orphaned: ({ attempt, retry }) => retry(attempt),                 // existing (P19): an abandoned unknown save is re-sent, the same id
  }),
}
```

```ts
// uploads.operations.ts: XMLHttpRequest, upload.onprogress turned into a Stream by UploadApi; xhr.abort() on the signal
export const Uploads = {
  put: transaction({
    id: "Uploads.put",
    input: Schema.Struct({ ref: Schema.String }),
    result: Schema.Struct({ url: Schema.String }),
    progress: Schema.Struct({ loaded: Schema.Number, total: Schema.NullOr(Schema.Number) }),   // existing (M6 rule 48)
    concurrency: "reject",
    commit: (input, { attempt, signal, progress }) => Effect.gen(function* () {
      const res = yield* UploadApi.use((a) => a.put(input.ref, { idempotencyKey: attempt.id, signal })).pipe(
        Stream.runForEach((e) => (e._tag === "Progress" ? progress({ loaded: e.loaded, total: e.total }) : Effect.void)),
        Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)))
      if (res.status === 201) return { url: res.url }
      if (res.status >= 500) return yield* Outcome.unknown(new ServerError({ status: res.status }))
      return yield* Outcome.failure(new Refused({ status: res.status }))
    }),
    orphaned: ({ attempt, ending }) => (ending._tag === "Unknown" ? discardUpload(attempt.input.ref, attempt.id) : Effect.void),   // NEW MEANING: sees the ending, returns an Effect
  }),
  discard: transaction({
    id: "Uploads.discard",
    input: Schema.Struct({ ref: Schema.String, uploadKey: Schema.String }),
    concurrency: "reject",
    commit: (input, { signal }) => discardUpload(input.ref, input.uploadKey, signal),   // DELETE /uploads/:ref?key=…: a tombstone the server applies whenever the body lands (MD:1208–1211)
  }),
}
```

The feed uses `Chat.messages` (a `WebSocket` wrapped by `ChatSocket`, `Session.reconnect`) and `Chat.since` (a `fetch`)
exactly as OID 5.4 writes them. Two-factor uses `Auth.verifyCode` (failures `WrongCode`, `Expired`) and
`Auth.resendCode` (failure `Throttled`) as MD 3.1 writes them, with the one change that `WrongCode` carries nothing.
Likes use `Issues.setLike` as a domain write (`.one(Issue).predicts(…)`, OID 5.3).

### 3.1 Autosaving document (a trait): latest-wins save, conflict, unknown, retry

Behaviour: edits are debounced 800 ms; one save in flight; edits during a save are coalesced and the newest body goes
next, with the etag the previous save returned (a queued `latest` start would carry a stale etag and fake a conflict,
the bug this avoids); a 412 is a conflict the host must resolve; an unknown is re-sent as the same write three times, 2 s
apart, then the host is told it stalled. Used on any editor.

**After: the fragment.**

```ts
// autosave.fragment.ts
export const Autosave = trait(
  {
    id: "Autosave",
    events: { Edited: { body: Schema.String } },                                  // existing: a view sends E.autosave.Edited
    hostEvents: { Resolve: { etag: Schema.String } },                             // existing: only the host raises it
    internalEvents: {                                                             // existing; NEW MEANING: also produced by this fragment's operations
      Settle: {}, ResendDue: {}, Saved: { etag: Schema.String }, Refused: {},
      Conflict: { serverEtag: Schema.String },
      Unsure: Flow.uncertain({ resends: Schema.Int }),
    },
    guards: { canEdit: Flow.optional(Flow.Guard) },
    callbacks: {
      onSaved: Flow.optional(Flow.Callback({ etag: Schema.String })),
      onConflict: Flow.Callback({ serverEtag: Schema.String }),
      onStalled: Flow.Callback({}),
    },
    memory: {
      docId: Flow.input(Schema.String), etag: Flow.input(Schema.String), body: Flow.input(Schema.String),
      status: Flow.initial(Schema.Literals(["clean", "dirty", "saving", "unsure", "conflict", "stalled"]), "clean"),
      rev: Flow.private(Flow.initial(Schema.Int, 0)), sentRev: Flow.private(Flow.initial(Schema.Int, 0)),
    },
    operations: ({ E }) => ({                                                     // NEW MEANING: allowed in a fragment
      save: Docs.save.outcomes({
        success: E.Saved.from((v) => ({ etag: v.etag })),
        failure: { Conflict: E.Conflict.from((r) => ({ serverEtag: r.serverEtag })), Refused: E.Refused, NotSent: E.Refused },
        unknown: E.Unsure.from((_r, { attempt }) => ({ resends: attempt.retryCount })),
      }).public(),                                                                // NEW: the row is part of the contract
    }),
  },
  ({ E, O, guards, callbacks }) => {
    const send = O.save.start(({ memory }) => ({ docId: memory.docId, body: memory.body, etag: memory.etag }))   // existing: start; reads after memory
    const stalled = { target: "self", updateMemory: () => ({ status: "stalled" }), notify: [callbacks.onStalled] }
    return {
      schedules: {
        settle: { schedule: "800 millis", armOn: [E.Edited, E.Resolve], send: E.Settle },   // a debounce
        resend: { schedule: "2 seconds", armOn: [E.Unsure], send: E.ResendDue },
      },
      on: {
        Edited: { target: "self", guard: guards.canEdit, updateMemory: ({ memory, event }) => ({ body: event.body, rev: memory.rev + 1, status: memory.status === "clean" ? "dirty" : memory.status }) },
        Settle: [{ target: "self", guard: [({ memory }) => memory.status === "dirty" || deny("NotDirty"), O.save.idle], updateMemory: ({ memory }) => ({ status: "saving", sentRev: memory.rev }), actions: [send] }, { target: "self" }],
        Saved: [
          { target: "self", guard: ({ memory }) => memory.rev > memory.sentRev || deny("Clean"), updateMemory: ({ memory, event }) => ({ etag: event.etag, sentRev: memory.rev }), actions: [send], notify: [callbacks.onSaved.from(({ event }) => ({ etag: event.etag }))] },
          { target: "self", updateMemory: ({ event }) => ({ etag: event.etag, status: "clean" }), notify: [callbacks.onSaved.from(({ event }) => ({ etag: event.etag }))] },
        ],
        Conflict: { target: "self", updateMemory: () => ({ status: "conflict" }), notify: [callbacks.onConflict.from(({ event }) => ({ serverEtag: event.serverEtag }))] },
        Refused: stalled,
        Unsure: [{ target: "self", guard: ({ event }) => event.resends < 3 || deny("GaveUp"), updateMemory: () => ({ status: "unsure" }) }, stalled],
        ResendDue: { target: "self", guard: ({ memory }) => memory.status === "unsure" || deny("NotUnsure"), actions: [O.save.retry] },   // the same write, the same id
        Resolve: { target: "self", updateMemory: ({ event }) => ({ etag: event.etag, status: "dirty" }) },
      },
    }
  },
)
```

**After: the host** (the editor; it only decides what a conflict and a stall look like).

```ts
// editor.definition.ts
export const Editor = definition({
  id: "Docs/Editor",
  states: ["EDITING", "CONFLICT", "STALLED"],
  events: { Overwrite: {}, Dismiss: {} },
  memory: { docId: Flow.input(Schema.String), etag: Flow.input(Schema.String), body: Flow.input(Schema.String), serverEtag: Flow.initial(Schema.NullOr(Schema.String), null) },
  traits: { autosave: Autosave },                                        // existing: a root trait
})
// editor.machine.ts
export const EditorMachine = machine(Editor, ({ S, E }) => ({
  default: S.EDITING,
  traits: {
    autosave: {
      input: ({ memory }) => ({ docId: memory.docId, etag: memory.etag, body: memory.body }),
      callbacks: {
        onConflict: { target: S.CONFLICT, updateMemory: ({ payload }) => ({ serverEtag: payload.serverEtag }) },
        onStalled: S.STALLED,
      },
    },
  },
  states: {
    EDITING: {},
    CONFLICT: { on: { Overwrite: { target: S.EDITING, raise: [E.autosave.Resolve.from(({ memory }) => ({ etag: memory.serverEtag! }))] } } },
    STALLED: { on: { Dismiss: S.EDITING } },
  },
}))
// view: <textarea onChange={(e) => send(E.autosave.Edited({ body: e.target.value }))} />  and  useView(editor, (s) => s.operations.autosave.save.pending)
```

**Before (OID): the host owns the site and every handler.**

```ts
// editor.definition.ts
export const Editor = definition({
  id: "Docs/Editor",
  states: ["EDITING", "CONFLICT", "STALLED"],
  events: { Edited: { body: Schema.String }, Overwrite: {}, Dismiss: {} },
  internalEvents: {
    Settle: {}, ResendDue: {}, Saved: { etag: Schema.String }, Refused: {},
    Conflict: { serverEtag: Schema.String },
    Unsure: Flow.uncertain({ resends: Schema.Int }),
  },
  memory: {
    docId: Flow.input(Schema.String), etag: Flow.input(Schema.String), body: Flow.input(Schema.String),
    status: Flow.initial(Schema.Literals(["clean", "dirty", "saving", "unsure", "conflict", "stalled"]), "clean"),
    rev: Flow.private(Flow.initial(Schema.Int, 0)), sentRev: Flow.private(Flow.initial(Schema.Int, 0)),
    serverEtag: Flow.initial(Schema.NullOr(Schema.String), null),
  },
  operations: ({ E }) => ({
    save: Docs.save.outcomes({
      success: E.Saved.from((v) => ({ etag: v.etag })),
      failure: { Conflict: E.Conflict.from((r) => ({ serverEtag: r.serverEtag })), Refused: E.Refused, NotSent: E.Refused },
      unknown: E.Unsure.from((_r, { attempt }) => ({ resends: attempt.retryCount })),
    }),
  }),
})
// editor.machine.ts
export const EditorMachine = machine(Editor, ({ S, E, O }) => {
  const send = O.save.start(({ memory }) => ({ docId: memory.docId, body: memory.body, etag: memory.etag }))
  const stalled = { target: S.STALLED, updateMemory: () => ({ status: "stalled" }) }
  return {
    default: S.EDITING,
    schedules: {
      settle: { schedule: "800 millis", armOn: [E.Edited, E.Overwrite], send: E.Settle },
      resend: { schedule: "2 seconds", armOn: [E.Unsure], send: E.ResendDue },
    },
    on: {
      Edited: { target: "self", updateMemory: ({ memory, event }) => ({ body: event.body, rev: memory.rev + 1, status: memory.status === "clean" ? "dirty" : memory.status }) },
      Settle: [{ target: "self", guard: [({ memory }) => memory.status === "dirty" || deny("NotDirty"), O.save.idle], updateMemory: ({ memory }) => ({ status: "saving", sentRev: memory.rev }), actions: [send] }, { target: "self" }],
      Saved: [
        { target: "self", guard: ({ memory }) => memory.rev > memory.sentRev || deny("Clean"), updateMemory: ({ memory, event }) => ({ etag: event.etag, sentRev: memory.rev }), actions: [send] },
        { target: "self", updateMemory: ({ event }) => ({ etag: event.etag, status: "clean" }) },
      ],
      Conflict: { target: S.CONFLICT, updateMemory: ({ event }) => ({ status: "conflict", serverEtag: event.serverEtag }) },
      Refused: stalled,
      Unsure: [{ target: "self", guard: ({ event }) => event.resends < 3 || deny("GaveUp"), updateMemory: () => ({ status: "unsure" }) }, stalled],
      ResendDue: { target: "self", guard: ({ memory }) => memory.status === "unsure" || deny("NotUnsure"), actions: [O.save.retry] },
    },
    states: {
      EDITING: {},
      CONFLICT: { on: { Overwrite: { target: S.EDITING, updateMemory: ({ memory }) => ({ etag: memory.serverEtag!, status: "dirty" }) } } },
      STALLED: { on: { Dismiss: S.EDITING } },
    },
  }
})
// view: useView(editor, (s) => s.operations.save.pending)
```

**Wiring that disappears from the host:** the six host events for the save's endings, `status`, `rev`, `sentRev`, the site, both
schedules, and eight handlers (the coalescing, unknown re-send and the `Overwrite` bookkeeping). The host keeps the
two decisions it owns: where a conflict and a stall go. **What the new design adds:** `.public()` (so the view reads
`pending`), `Resolve` as a host event, and the host cannot start, cancel or retry the save.

### 3.2 Reconnecting live feed (a trait): stream, gap, catch-up read

Behaviour: subscribe from the last sequence seen; a `gap` fetches what was missed; a lost feed backs off 1, 2, 4 … 16 s,
five times, then gives up; a sign-out close tells the host. Messages are public memory the view reads.

**After: the fragment.**

```ts
// livefeed.fragment.ts
export const LiveFeed = trait(
  {
    id: "LiveFeed",
    internalEvents: { Message: { message: Message }, Missed: {}, CaughtUp: { messages: Schema.Array(Message) }, CatchUpFailed: {}, FeedLost: {}, SignedOut: {}, RetryFeed: {} },
    callbacks: { onSignedOut: Flow.Callback({}), onGaveUp: Flow.Callback({}) },
    memory: {
      roomId: Flow.input(Schema.String),
      messages: Flow.initial(Schema.Array(Message), []),
      lastSeq: Flow.initial(Schema.Number, 0),
      status: Flow.initial(Schema.Literals(["connecting", "lost", "gave-up"]), "connecting"),
      tries: Flow.private(Flow.initial(Schema.Int, 0)),
    },
    operations: ({ E }) => ({
      feed: Chat.messages.subscribe({
        value: E.Message.from((m) => ({ message: m })),
        gap: E.Missed,
        failure: { SignedOut: E.SignedOut, Dropped: E.FeedLost, Defect: E.FeedLost, Interrupted: E.FeedLost },
      }).public(),
      catchUp: Chat.since.outcomes({
        success: E.CaughtUp.from((v) => ({ messages: v })),
        failure: { Defect: E.CatchUpFailed, Interrupted: E.CatchUpFailed },
      }),
    }),
  },
  ({ E, O, callbacks }) => {
    const after = ({ memory }) => ({ roomId: memory.roomId, after: memory.lastSeq })
    const merge = (m, incoming) => {
      const all = [...m.messages, ...incoming.filter((x) => !m.messages.some((y) => y.seq === x.seq))].sort((a, b) => a.seq - b.seq)
      return { messages: all, lastSeq: all.length === 0 ? m.lastSeq : all[all.length - 1].seq }
    }
    return {
      activities: [O.feed.params(after, { when: ({ memory }) => memory.status === "connecting" })],   // NEW MEANING: placed on the incarnation; false releases, true re-opens from lastSeq
      schedules: { retry: { schedule: ({ memory }) => Duration.seconds(2 ** memory.tries), armOn: [E.FeedLost], send: E.RetryFeed } },
      on: {
        Message: { target: "self", updateMemory: ({ memory, event }) => merge(memory, [event.message]) },
        Missed: { target: "self", actions: [O.catchUp.fetch(after)] },
        CaughtUp: { target: "self", updateMemory: ({ memory, event }) => merge(memory, event.messages) },
        CatchUpFailed: { target: "self" },
        FeedLost: [
          { target: "self", guard: ({ memory }) => memory.tries < 5 || deny("GaveUp"), updateMemory: ({ memory }) => ({ status: "lost", tries: memory.tries + 1 }) },
          { target: "self", updateMemory: () => ({ status: "gave-up" }), notify: [callbacks.onGaveUp] },
        ],
        RetryFeed: { target: "self", guard: ({ memory }) => memory.status === "lost" || deny("NotLost"), updateMemory: () => ({ status: "connecting" }) },
        SignedOut: { target: "self", updateMemory: () => ({ status: "gave-up" }), notify: [callbacks.onSignedOut] },
      },
    }
  },
)
```

**After: the host** (the chat room keeps its own `post` site and outbox; the feed is one line of placement).

```ts
// room.definition.ts
export const Room = definition({
  id: "Chat/Room",
  states: ["LIVE", "SIGNED_OUT", "OFFLINE"],
  events: { Send: { clientId: Schema.String, text: Schema.String } },
  memory: { roomId: Flow.input(Schema.String) },
  traits: { live: LiveFeed },
})
// room.machine.ts
export const RoomMachine = machine(Room, ({ S }) => ({
  default: S.LIVE,
  traits: {
    live: {
      input: ({ memory }) => ({ roomId: memory.roomId }),
      callbacks: { onSignedOut: S.SIGNED_OUT, onGaveUp: S.OFFLINE },
    },
  },
  states: { LIVE: {}, SIGNED_OUT: {}, OFFLINE: {} },
}))
// view: useView(room, (s) => s.memory.live.messages)   and   useView(room, (s) => s.operations.live.feed.connection === "Open")
// the Send guard reads operations.live.feed.connection (public)
```

**Before (OID 5.4, the feed half, in full).**

```ts
// room.definition.ts
export const Room = definition({
  id: "Chat/Room",
  states: ["LIVE", "LOST", "SIGNED_OUT", "OFFLINE"],
  events: { Send: { clientId: Schema.String, text: Schema.String } },
  internalEvents: { Message: { message: Message }, Missed: {}, CaughtUp: { messages: Schema.Array(Message) }, CatchUpFailed: {}, SignedOut: {}, FeedLost: {}, RetryFeed: {} },
  memory: { roomId: Flow.input(Schema.String), messages: Flow.initial(Schema.Array(Message), []), lastSeq: Flow.initial(Schema.Number, 0), feedTries: Flow.initial(Schema.Int, 0) },
  operations: ({ E }) => ({
    feed: Chat.messages.subscribe({
      value: E.Message.from((m) => ({ message: m })),
      gap: E.Missed,
      failure: { SignedOut: E.SignedOut, Dropped: E.FeedLost, Defect: E.FeedLost, Interrupted: E.FeedLost },
    }),
    catchUp: Chat.since.outcomes({
      success: E.CaughtUp.from((v) => ({ messages: v })),
      failure: { Defect: E.CatchUpFailed, Interrupted: E.CatchUpFailed },
    }),
  }),
})
// room.machine.ts
export const RoomMachine = machine(Room, ({ S, E, O }) => {
  const after = ({ memory }) => ({ roomId: memory.roomId, after: memory.lastSeq })
  const merge = (m, incoming) => {
    const all = [...m.messages, ...incoming.filter((x) => !m.messages.some((y) => y.seq === x.seq))].sort((a, b) => a.seq - b.seq)
    return { messages: all, lastSeq: all.length === 0 ? m.lastSeq : all[all.length - 1].seq }
  }
  return {
    default: S.LIVE,
    on: {
      CaughtUp: { target: "self", updateMemory: ({ memory, event }) => merge(memory, event.messages) },
      CatchUpFailed: { target: "self" },
    },
    states: {
      LIVE: {
        activities: [O.feed.params(after)],
        on: {
          Message: { target: "self", updateMemory: ({ memory, event }) => merge(memory, [event.message]) },
          Missed: { target: "self", actions: [O.catchUp.fetch(after)] },
          SignedOut: S.SIGNED_OUT,
          FeedLost: [
            { target: S.LOST, guard: ({ memory }) => memory.feedTries < 5 || deny("GaveUp"), updateMemory: ({ memory }) => ({ feedTries: memory.feedTries + 1 }) },
            { target: S.OFFLINE },
          ],
        },
      },
      LOST: {
        schedules: { retry: { schedule: ({ memory }) => Duration.seconds(2 ** memory.feedTries), send: E.RetryFeed } },
        on: { RetryFeed: S.LIVE },
      },
      SIGNED_OUT: {},
      OFFLINE: {},
    },
  }
})
// view: useView(room, (s) => s.operations.feed.connection === "Open")
```

**Wiring that disappears:** seven internal events, three memory fields, two sites, `merge`, the LOST state and its schedule, six
handlers. The host's LIVE state no longer carries the subscription (it moves with the trait). **What it adds:** `activities`
in a trait body, `when` as the reconnect switch (the before used a state change for the same thing), and one `.public()`
for the connection read. Note the trade: the before shows LIVE/LOST/OFFLINE in the host graph; the after hides LOST
inside the trait, so `flow graph` must draw it from the summary.

### 3.3 Upload (a subroutine): progress, cancel, clean-up after an unknown

Behaviour: starts on entry; `Cancel` interrupts; a cancel before the first byte leaves nothing; a cancel or a lost
connection after bytes were handed to the stack is `unknown`, so the server is told to discard that upload by id; a
host that abandons the step mid-upload cancels it and the clean-up still happens (the contract's `orphaned`).

**After: the fragment.**

```ts
// upload.fragment.ts
export const Upload = subroutine(
  {
    id: "Upload",
    states: ["SENDING", "CLEANING"],
    events: { Cancel: {} },
    internalEvents: {
      Uploaded: { url: Schema.String }, Refused: { message: Schema.String }, Unsent: {},
      Unsure: Flow.uncertain({ uploadKey: Schema.String }), Cleaned: {}, CleanFailed: {},
    },
    exits: { Done: Flow.Exit({ url: Schema.String }), Failed: Flow.Exit({ message: Schema.String }), Cancelled: Flow.Exit({}) },
    memory: { ref: Flow.input(Schema.String), cancelling: Flow.private(Flow.initial(Schema.Boolean, false)) },
    operations: ({ E }) => ({
      put: Uploads.put.outcomes({
        success: E.Uploaded.from((v) => ({ url: v.url })),
        failure: { Refused: E.Refused.from((r) => ({ message: `Rejected (${r.status})` })), NotSent: E.Unsent },
        unknown: E.Unsure.from((_r, { attempt }) => ({ uploadKey: attempt.id })),
      }).public(),
      discard: Uploads.discard.outcomes({ success: E.Cleaned, failure: { Refused: E.CleanFailed, NotSent: E.CleanFailed }, unknown: E.CleanFailed }),
    }),
  },
  ({ S, O, exits }) => ({
    default: S.SENDING,
    start: [O.put.start(({ memory }) => ({ ref: memory.ref }))],               // REVIVED: runs on every entry
    whenAbandoned: { actions: [O.put.cancel] },                                // NEW MEANING: may cancel; the ending orphans to Uploads.put's `orphaned`
    states: {
      SENDING: {
        on: {
          Cancel: { target: "self", updateMemory: () => ({ cancelling: true }), actions: [O.put.cancel] },
          Uploaded: exits.Done.from(({ event }) => ({ url: event.url })),
          Refused: exits.Failed.from(({ event }) => ({ message: event.message })),
          Unsent: exits.Cancelled,
          Unsure: { target: S.CLEANING, actions: [O.discard.start(({ memory, event }) => ({ ref: memory.ref, uploadKey: event.uploadKey }))] },
        },
      },
      CLEANING: {
        on: {
          Cleaned: [{ ...exits.Cancelled, guard: ({ memory }) => memory.cancelling || deny("NotCancelled") }, exits.Failed.from(() => ({ message: "Upload interrupted" }))],
          CleanFailed: exits.Failed.from(() => ({ message: "Could not clean up the upload" })),
          Cancel: { target: "self" },
        },
      },
    },
  }),
)
```

**After: the host** (a composer that attaches the result).

```ts
// composer.definition.ts
export const Composer = definition({
  id: "Mail/Composer",
  states: ["WRITING", { UPLOADING: Upload }, "FAILED"],
  events: { Attach: { ref: Schema.String }, Close: {} },
  memory: { ref: Flow.initial(Schema.String, ""), attachment: Flow.initial(Schema.NullOr(Schema.String), null), message: Flow.initial(Schema.NullOr(Schema.String), null) },
})
// composer.machine.ts
export const ComposerMachine = machine(Composer, ({ S }) => ({
  default: S.WRITING,
  on: { Attach: { target: S.UPLOADING, updateMemory: ({ event }) => ({ ref: event.ref }) } },
  states: {
    WRITING: {},
    UPLOADING: {
      input: ({ memory }) => ({ ref: memory.ref }),
      exits: {
        Done: { target: S.WRITING, updateMemory: ({ payload }) => ({ attachment: payload.url }) },
        Failed: { target: S.FAILED, updateMemory: ({ payload }) => ({ message: payload.message }) },
        Cancelled: S.WRITING,
      },
    },
    FAILED: { on: { Attach: { target: S.UPLOADING, updateMemory: ({ event }) => ({ ref: event.ref }) } } },
  },
}))
// view: useView(composer, (s) => s.operations.UPLOADING?.put.progress)  and  send(E.UPLOADING.Cancel())
```

**Before (OID): sites on the host, `.each` over a queue is not needed for one upload.**

```ts
// composer.definition.ts
export const Composer = definition({
  id: "Mail/Composer",
  states: ["WRITING", "UPLOADING", "CLEANING", "FAILED"],
  events: { Attach: { ref: Schema.String }, CancelUpload: {}, Close: {} },
  internalEvents: {
    Uploaded: { url: Schema.String }, Refused: { message: Schema.String }, Unsent: {},
    Unsure: Flow.uncertain({ uploadKey: Schema.String }), Cleaned: {}, CleanFailed: {},
  },
  memory: {
    ref: Flow.initial(Schema.String, ""), attachment: Flow.initial(Schema.NullOr(Schema.String), null),
    message: Flow.initial(Schema.NullOr(Schema.String), null), cancelling: Flow.initial(Schema.Boolean, false),
  },
  operations: ({ E }) => ({
    put: Uploads.put.outcomes({
      success: E.Uploaded.from((v) => ({ url: v.url })),
      failure: { Refused: E.Refused.from((r) => ({ message: `Rejected (${r.status})` })), NotSent: E.Unsent },
      unknown: E.Unsure.from((_r, { attempt }) => ({ uploadKey: attempt.id })),
    }),
    discard: Uploads.discard.outcomes({ success: E.Cleaned, failure: { Refused: E.CleanFailed, NotSent: E.CleanFailed }, unknown: E.CleanFailed }),
  }),
})
// composer.machine.ts
export const ComposerMachine = machine(Composer, ({ S, E, O }) => {
  const attach = {
    target: S.UPLOADING, guard: [O.put.idle],
    updateMemory: ({ event }) => ({ ref: event.ref, cancelling: false }),
    actions: [O.put.start(({ event }) => ({ ref: event.ref }))],
  }
  const clean = O.discard.start(({ memory, event }) => ({ ref: memory.ref, uploadKey: event.uploadKey }))
  return {
    default: S.WRITING,
    on: {
      Attach: attach,
      // late (the user closed the composer or left UPLOADING): the upload may still land, so it is discarded (rule 20)
      Unsure: [{ target: "self", guard: [S.WRITING], actions: [clean] }, { target: "self" }],
      Uploaded: { target: "self" }, Refused: { target: "self" }, Unsent: { target: "self" },
      Cleaned: { target: "self" }, CleanFailed: { target: "self" },
    },
    states: {
      WRITING: {},
      UPLOADING: {
        on: {
          CancelUpload: { target: "self", updateMemory: () => ({ cancelling: true }), actions: [O.put.cancel] },
          Uploaded: { target: S.WRITING, updateMemory: ({ event }) => ({ attachment: event.url }) },
          Refused: { target: S.FAILED, updateMemory: ({ event }) => ({ message: event.message }) },
          Unsent: S.WRITING,
          Unsure: { target: S.CLEANING, actions: [clean] },
          Close: { target: S.WRITING, actions: [O.put.cancel] },
        },
      },
      CLEANING: {
        on: {
          Cleaned: [{ target: S.WRITING, guard: ({ memory }) => memory.cancelling || deny("NotCancelled") }, { target: S.FAILED, updateMemory: () => ({ message: "Upload interrupted" }) }],
          CleanFailed: { target: S.FAILED, updateMemory: () => ({ message: "Could not clean up the upload" }) },
        },
      },
      FAILED: { on: { Attach: attach } },
    },
  }
})
// view: useView(composer, (s) => s.operations.put.progress)
```

**Wiring that disappears:** six internal events, `cancelling`, two sites, the CLEANING state, five handlers, and the **late** `Unsure`
handler at the root that every host must remember (rule 20). In the before, leaving UPLOADING by `Close` and an unknown
arriving later is a host bug waiting to happen; in the after it is the contract's `orphaned`, once. **What it adds:** `start`,
the `cancel` in `whenAbandoned`, and the widened `orphaned`. Cost to be honest about: the clean-up decision moved from a
visible host state to an Effect in the contract, where a person reading the host cannot see it (mitigated by the summary
printing `orphan: Uploads.put → discardUpload`).

### 3.4 Two-factor verify (a subroutine): verify, resend cooldown, lockout

Behaviour (MD 3.1, reduced to one step): a six-digit code; three wrong codes lock the step for five minutes; resend is
refused for 30 s after each resend; strikes survive Back and return because the host keeps them; a wrong code that
settles after Back still strikes its challenge.

**After: the fragment.**

```ts
// verifycode.fragment.ts
export const VerifyCode = subroutine(
  {
    id: "VerifyCode",
    states: ["ENTERING", "VERIFYING", "LOCKED_OUT"],
    events: { Edit: { code: Schema.String }, Submit: {}, Resend: {} },
    internalEvents: { Verified: { token: Schema.String }, Wrong: {}, Expired: {}, Unchecked: {}, Resent: {}, ResendRefused: {}, CooldownOver: {}, Unlocked: {} },
    callbacks: {
      onStrikes: Flow.Callback({ strikes: Schema.Int }),
      onLateEnding: Flow.Callback({ challengeId: Schema.String, wrong: Schema.Boolean }),
    },
    exits: { Verified: Flow.Exit({ token: Schema.String }), Expired: Flow.Exit({}) },
    memory: {
      challengeId: Flow.input(Schema.String), strikes: Flow.input(Schema.Int),
      code: Flow.initial(Schema.String, ""), error: Flow.initial(Schema.NullOr(Schema.String), null), cooling: Flow.initial(Schema.Boolean, false),
    },
    operations: ({ E, callbacks }) => ({
      verify: Auth.verifyCode.outcomes({
        success: E.Verified.from((v) => ({ token: v.token })),
        failure: { WrongCode: E.Wrong, Expired: E.Expired, NotSent: E.Unchecked },
        unknown: E.Unchecked,
      }).whenOrphaned(callbacks.onLateEnding.from((ending, { input }) => ({ challengeId: input.challengeId, wrong: ending._tag === "Failure" && ending.error._tag === "WrongCode" }))),   // NEW
      resend: Auth.resendCode.outcomes({ success: E.Resent, failure: { Throttled: E.ResendRefused, NotSent: E.ResendRefused }, unknown: E.ResendRefused }),
    }),
  },
  ({ S, E, O, callbacks, exits }) => {
    const told = (n: (m: { strikes: number }) => number) => callbacks.onStrikes.from(({ memory }) => ({ strikes: n(memory) }))
    return {
      default: S.ENTERING,
      schedules: { cooldown: { schedule: "30 seconds", armOn: [E.Resent], send: E.CooldownOver } },
      on: {
        Resend: { target: "self", guard: [({ memory }) => !memory.cooling || deny("Cooldown"), O.resend.idle], actions: [O.resend.start(({ memory }) => ({ challengeId: memory.challengeId }))] },
        Resent: { target: "self", updateMemory: () => ({ cooling: true }) },
        ResendRefused: { target: "self", updateMemory: () => ({ error: "Too many requests, try again later" }) },
        CooldownOver: { target: "self", updateMemory: () => ({ cooling: false }) },
      },
      states: {
        ENTERING: {
          on: {
            Edit: { target: "self", updateMemory: ({ event }) => ({ code: event.code, error: null }) },
            Submit: { target: S.VERIFYING, guard: [({ memory }) => /^\d{6}$/.test(memory.code) || deny("NotSixDigits"), O.verify.idle], actions: [O.verify.start(({ memory }) => ({ challengeId: memory.challengeId, code: memory.code }))] },
          },
        },
        VERIFYING: {
          on: {
            Verified: exits.Verified.from(({ event }) => ({ token: event.token })),
            Expired: exits.Expired,
            Unchecked: { target: S.ENTERING, updateMemory: () => ({ error: "Couldn't check the code. Try again." }) },
            Wrong: [
              { target: S.LOCKED_OUT, guard: ({ memory }) => memory.strikes + 1 >= 3 || deny("StrikesLeft"), updateMemory: ({ memory }) => ({ strikes: memory.strikes + 1 }), notify: [told((m) => m.strikes + 1)] },
              { target: S.ENTERING, updateMemory: ({ memory }) => ({ strikes: memory.strikes + 1, code: "", error: "Wrong code" }), notify: [told((m) => m.strikes + 1)] },
            ],
          },
        },
        LOCKED_OUT: {
          schedules: { unlock: { schedule: "5 minutes", send: E.Unlocked } },
          on: { Unlocked: { target: S.ENTERING, updateMemory: () => ({ strikes: 0, code: "", error: null }), notify: [told(() => 0)] } },
        },
      },
    }
  },
)
```

**After: the host** (the sign-in keeps strikes per challenge; the late strike is one filling).

```ts
// signin.definition.ts (excerpt: the TWO_FACTOR step and what it needs)
states: ["PASSWORD", { TWO_FACTOR: VerifyCode }, "SIGNED_IN"],
memory: { challengeId: Flow.initial(Schema.String, ""), token: Flow.initial(Schema.NullOr(Schema.String), null), strikes: Flow.initial(Schema.Record({ key: Schema.String, value: Schema.Int }), {}) },
// signin.machine.ts (excerpt)
const strike = (strikes, id: string, n: number) => ({ strikes: { ...strikes, [id]: n } })
TWO_FACTOR: {
  input: ({ memory }) => ({ challengeId: memory.challengeId, strikes: memory.strikes[memory.challengeId] ?? 0 }),
  callbacks: {
    onStrikes: { updateMemory: ({ memory, payload }) => strike(memory.strikes, memory.challengeId, payload.strikes) },
    onLateEnding: { updateMemory: ({ memory, payload }) => (payload.wrong ? strike(memory.strikes, payload.challengeId, (memory.strikes[payload.challengeId] ?? 0) + 1) : {}) },
  },
  exits: { Verified: { target: S.SIGNED_IN, updateMemory: ({ payload }) => ({ token: payload.token }) }, Expired: S.PASSWORD },
},
```

**Before (OID 5.2 reduced to the same step, in full).**

```ts
// signin.definition.ts (excerpt)
states: ["PASSWORD", { TWO_FACTOR: ["ENTERING", "VERIFYING", "LOCKED_OUT"] }, "SIGNED_IN"],
events: { Edit: { code: Schema.String }, Submit: {}, Resend: {} },
internalEvents: { Verified: { token: Schema.String }, Wrong: { challengeId: Schema.String }, Expired: {}, Unchecked: {}, Resent: {}, ResendRefused: {}, CooldownOver: {}, Unlocked: {} },
memory: {
  challengeId: Flow.initial(Schema.String, ""), token: Flow.initial(Schema.NullOr(Schema.String), null),
  code: Flow.initial(Schema.String, ""), error: Flow.initial(Schema.NullOr(Schema.String), null), cooling: Flow.initial(Schema.Boolean, false),
  strikes: Flow.initial(Schema.Record({ key: Schema.String, value: Schema.Int }), {}),
},
operations: ({ E }) => ({
  verify: Auth.verifyCode.outcomes({
    success: E.Verified.from((v) => ({ token: v.token })),
    failure: { WrongCode: E.Wrong.from((_r, { input }) => ({ challengeId: input.challengeId })), Expired: E.Expired, NotSent: E.Unchecked },
    unknown: E.Unchecked,
  }),
  resend: Auth.resendCode.outcomes({ success: E.Resent, failure: { Throttled: E.ResendRefused, NotSent: E.ResendRefused }, unknown: E.ResendRefused }),
}),
// signin.machine.ts (excerpt)
const bump = (m, id: string) => ({ strikes: { ...m.strikes, [id]: (m.strikes[id] ?? 0) + 1 } })
on: {
  Wrong: { target: "self", updateMemory: ({ memory, event }) => bump(memory, event.challengeId) },       // late strike, after Back (rule 20)
  Verified: { target: "self" }, Expired: { target: "self" }, Unchecked: { target: "self" },
},
states: {
  TWO_FACTOR: {
    schedules: { cooldown: { schedule: "30 seconds", armOn: [E.Resent], send: E.CooldownOver } },
    on: {
      Resend: { target: "self", guard: [({ memory }) => !memory.cooling || deny("Cooldown"), O.resend.idle], actions: [O.resend.start(({ memory }) => ({ challengeId: memory.challengeId }))] },
      Resent: { target: "self", updateMemory: () => ({ cooling: true }) },
      ResendRefused: { target: "self", updateMemory: () => ({ error: "Too many requests, try again later" }) },
      CooldownOver: { target: "self", updateMemory: () => ({ cooling: false }) },
    },
    states: {
      ENTERING: {
        on: {
          Edit: { target: "self", updateMemory: ({ event }) => ({ code: event.code, error: null }) },
          Submit: { target: S.TWO_FACTOR.VERIFYING, guard: [({ memory }) => /^\d{6}$/.test(memory.code) || deny("NotSixDigits"), O.verify.idle], actions: [O.verify.start(({ memory }) => ({ challengeId: memory.challengeId, code: memory.code }))] },
        },
      },
      VERIFYING: {
        on: {
          Verified: { target: S.SIGNED_IN, updateMemory: ({ event }) => ({ token: event.token }) },
          Expired: S.PASSWORD,
          Unchecked: { target: S.TWO_FACTOR.ENTERING, updateMemory: () => ({ error: "Couldn't check the code. Try again." }) },
          Wrong: [
            { target: S.TWO_FACTOR.LOCKED_OUT, guard: ({ memory, event }) => (memory.strikes[event.challengeId] ?? 0) + 1 >= 3 || deny("StrikesLeft"), updateMemory: ({ memory, event }) => bump(memory, event.challengeId) },
            { target: S.TWO_FACTOR.ENTERING, updateMemory: ({ memory, event }) => ({ ...bump(memory, event.challengeId), code: "", error: "Wrong code" }) },
          ],
        },
      },
      LOCKED_OUT: {
        schedules: { unlock: { schedule: "5 minutes", send: E.Unlocked } },
        on: { Unlocked: { target: S.TWO_FACTOR.ENTERING, updateMemory: ({ memory }) => ({ strikes: { ...memory.strikes, [memory.challengeId]: 0 }, code: "", error: null }) } },
      },
    },
  },
},
```

**Wiring that disappears from the host:** the step's three states and their handlers, the cooldown, `code`, `error`, `cooling`, five
internal events, two sites. **What stays and why:** the host keeps strikes per challenge, because they must outlive the
step (Back, the lockout bypass found in CMP correctness:174). The fragment tells it through `onStrikes` and `onLateEnding`.
Be honest about the shape: the late-strike arithmetic is split between fragment (counts inside) and host (counts
outside); a subtle drift is possible if the two disagree. Of the five fragments this is the weakest fit, because the
step's truth (strikes) must live outside it.

### 3.5 Per-row like (a trait with `.each`): an entity-domain write

Behaviour: the view sends the value it wants; `latest` supersedes; an unknown is re-sent as the same write after 3 s,
up to 3 times, and a newer write cancels the re-send; a missing issue tells the host to reload. The like itself is a
domain write (`Issues.setLike`), so the store predicts it, confirms it and marks it uncertain.

**After: the fragment.**

```ts
// likebutton.fragment.ts
export const LikeButton = trait(
  {
    id: "LikeButton",
    events: { Toggle: { liked: Schema.Boolean } },
    internalEvents: { Settled: {}, Gone: {}, Failed: { superseded: Schema.Boolean }, Unsure: Flow.uncertain({ superseded: Schema.Boolean, resends: Schema.Int }), Reconcile: {} },
    callbacks: { onGone: Flow.Callback({ id: Schema.String }), onFailed: Flow.optional(Flow.Callback({ id: Schema.String })) },
    operations: ({ E }) => ({
      set: Issues.setLike.outcomes({                                           // existing: a domain write (OID 5.3)
        success: E.Settled,
        failure: { Gone: E.Gone, Refused: E.Failed.from((_r, { superseded }) => ({ superseded })), NotSent: E.Failed.from((_r, { superseded }) => ({ superseded })) },
        unknown: E.Unsure.from((_r, { superseded, attempt }) => ({ superseded, resends: attempt.retryCount })),
      }),
    }),
  },
  ({ E, O, callbacks }) => {
    const failed = callbacks.onFailed.from(({ memory }) => ({ id: memory.key }))             // memory.key: the .each copy's key (MD:457)
    return {
      schedules: { reconcile: { schedule: "3 seconds", armOn: [E.Unsure], disarmOn: [E.Toggle, E.Settled], send: E.Reconcile } },
      on: {
        Toggle: { target: "self", actions: [O.set.start(({ memory, event }) => ({ key: { id: memory.key }, liked: event.liked }))] },   // latest: a newer write supersedes
        Settled: { target: "self" },
        Gone: { target: "self", notify: [callbacks.onGone.from(({ memory }) => ({ id: memory.key }))] },
        Failed: [{ target: "self", guard: ({ event }) => event.superseded || deny("Latest") }, { target: "self", notify: [failed] }],
        Unsure: [
          { target: "self", guard: ({ event }) => event.superseded || deny("Latest") },
          { target: "self", guard: ({ event }) => event.resends < 3 || deny("GaveUp") },
          { target: "self", notify: [failed] },
        ],
        Reconcile: { target: "self", guard: O.set.idle, actions: [O.set.retry] },       // the same request, no new prediction (M4 rule 31)
      },
    }
  },
)
```

**After: the host** (the list places one trait per issue id).

```ts
// list.definition.ts (excerpt)
memory: { issueIds: Flow.initial(Schema.Array(Schema.String), []), toast: Flow.initial(Schema.NullOr(Schema.String), null) },
traits: { likes: LikeButton.each({ of: "issueIds", max: 500 }) },          // existing: .each (rule 9)
// list.machine.ts (excerpt)
traits: {
  likes: {
    callbacks: {
      onGone: { actions: [reload] },
      onFailed: { updateMemory: () => ({ toast: "Couldn't update the like" }) },
    },
  },
},
// view: <LikeButton onClick={() => send(E.likes.key(id).Toggle({ liked: !row.data.liked }))} unsure={row.uncertain} />
```

**Before (OID 5.3, the like part, in full).**

```ts
// list.definition.ts (excerpt)
events: { Toggle: { id: Schema.String, liked: Schema.Boolean } },
internalEvents: {
  Settled: {}, IssueGone: {},
  Failed: { id: Schema.String, superseded: Schema.Boolean },
  LikeUnsure: Flow.uncertain({ id: Schema.String, superseded: Schema.Boolean, resends: Schema.Int }), ReconcileLike: { id: Schema.String },
},
memory: { issueIds: Flow.initial(Schema.Array(Schema.String), []), likeUnsure: Flow.initial(Schema.Array(Schema.String), []), toast: Flow.initial(Schema.NullOr(Schema.String), null) },
operations: ({ E }) => ({
  like: Issues.setLike.each({ of: "issueIds", max: 500, for: (i) => i.key.id }).outcomes({
    success: E.Settled,
    failure: { Gone: E.IssueGone, Refused: E.Failed.from((_r, { key, superseded }) => ({ id: key, superseded })), NotSent: E.Failed.from((_r, { key, superseded }) => ({ id: key, superseded })) },
    unknown: E.LikeUnsure.from((_r, { key, superseded, attempt }) => ({ id: key, superseded, resends: attempt.retryCount })),
  }),
}),
// list.machine.ts (excerpt)
const without = (ids: ReadonlyArray<string>, id: string) => ids.filter((x) => x !== id)
const listed = ({ memory, event }) => memory.issueIds.includes(event.id) || deny("NotListed")
schedules: { reconcile: { keys: ({ memory }) => memory.likeUnsure, schedule: "3 seconds", send: E.ReconcileLike.from(({ key }) => ({ id: key })) } },
on: {
  Toggle: { target: "self", guard: [listed], updateMemory: ({ memory, event }) => ({ likeUnsure: without(memory.likeUnsure, event.id) }), actions: [O.like.start(({ event }) => ({ key: { id: event.id }, liked: event.liked }))] },
  Settled: { target: "self" },
  IssueGone: { target: "self", actions: [reload] },
  Failed: [{ target: "self", guard: ({ event }) => event.superseded || deny("Latest") }, { target: "self", updateMemory: () => ({ toast: "Couldn't update the like" }) }],
  LikeUnsure: [
    { target: "self", guard: ({ event }) => event.superseded || deny("Latest") },
    { target: "self", guard: ({ event }) => event.resends < 3 || deny("GaveUp"), updateMemory: ({ memory, event }) => ({ likeUnsure: [...without(memory.likeUnsure, event.id), event.id] }) },
    { target: "self", updateMemory: ({ memory, event }) => ({ likeUnsure: without(memory.likeUnsure, event.id), toast: "Couldn't confirm your like" }) },
  ],
  ReconcileLike: { target: "self", updateMemory: ({ memory, event }) => ({ likeUnsure: without(memory.likeUnsure, event.id) }), actions: [O.like.retry(({ event }) => event.id)] },
},
// view: <LikeButton onClick={() => send(E.Toggle({ id, liked: !row.data.liked }))} />
```

**Wiring that disappears:** `likeUnsure`, the `listed` guard (the copy exists, so a member always has a lane: OID's B2 lag for *this*
site goes), the keyed schedule, five internal events, the site, `without`, and `Toggle` stops carrying an id. **What stays:**
membership (`issueIds`) is host data either way, so the id list and its lag (OID B2) are unchanged for the copies
themselves. This is the case that fits best, and the only one whose multiplicity (one lane per row) is *structural*
instead of declared.

### 3.6 Line counts, and the honest comparison

Counts are lines of the code blocks above (blank lines and comment-only lines included), measured by script.

| # | Case | Before: host owns all (OID) | After: fragment | After: host | First use (fragment + host) | Second host (host only) | Host lines removed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Autosave (trait) | 54 | 54 | 27 | 81 | 27 | 50 % |
| 2 | Live feed (trait) | 55 | 49 | 21 | 70 | 21 | 62 % |
| 3 | Upload (subroutine) | 62 | 45 | 25 | 70 | 25 | 60 % |
| 4 | Two-factor verify (subroutine) | 57 | 62 | 13 | 75 | 13 | 77 % |
| 5 | Per-row like (trait, `.each`) | 32 | 34 | 13 | 47 | 13 | 59 % |

Reading it:

- **A single use is not smaller.** Fragment plus host exceeds the before in every row (the first use costs 8 to 27 lines more). That is
  the same finding as CMP principles:42: "no fragment system is smaller than the baseline", and PR section 1's rule,
  "Extract a fragment on the second use, not the first" (PR:53).
- **Reuse is where it pays.** Every extra host costs only the "host only" column. The feed, the autosave and the upload
  recur in apps; two-factor is the weakest (one use, and its truth leaks out through callbacks).
- **What the lines hide** is the larger gain: a host that cannot get the policy wrong. In the before, each host writes its
  own `Unsure` handling, its own late root handler, its own `idle` guards; in the after, there is one place each is
  written and tested (`story.trait` with fixtures).

### 3.7 Varied real-world cases, quickly

| Case | Kind | Verdict | Strain |
| --- | --- | --- | --- |
| Stripe 3-D Secure step (OID 5.1) | subroutine `PayStep` with `confirm`, `challenge`, a poll read | fits; exits `Paid`, `Declined(code)`, `NeedsHelp` | the booking saga needs the host to refund a late `Paid`: `whenOrphaned` to `onLatePaid`, the host starts the refund (lateness not transitive) |
| Search as you type | trait: debounce + live read `params` | fits; `activities` in a trait | none |
| Infinite-scroll pager | trait: `Next`, a read with `params(page)` | fits | page cache is the resource's, not the trait's |
| Presence heartbeat | trait: stream + schedule | fits | none |
| Polling a long job | subroutine: start, poll read, exits | fits | the poll schedule is a state-local schedule; terminal states are exits |
| LLM answer streamed, with Stop | subroutine: write with `progress`, `Cancel` | fits | none beyond Upload's |
| Optimistic cart quantity stepper per line | trait `.each`, domain write | fits (the like, again) | bulk "clear cart" is not expressible (F13) |
| Booking saga (hold, charge, confirm, refund) | host | **stays in the host** | a saga decides across steps with its own memory; an orphan cannot (2.4's limit) |
| Generic "submit with retry" over any transaction | would be `CommitWithRetry` | **hard** | the failure map is exhaustive per contract (rule 13), so a fragment generic over contracts needs a tag interface; recommend fragments specific to a contract |
| Undo send while the page closes | none | out of scope (MD item 7) | |

## 4. Issues to resolve, each with a recommendation

1. **The orphaned ending (the hardest).**
   *Problem:* a write outlives the fragment that started it, and the fragment's memory and states are gone (L5, PR:126).
   *Options:* (A) IM's required `onOrphaned` port per call (rejected: the host cannot act on what it cannot read, and
   wiring returns). (B) Drop it with evidence (breaks rules 8 and 17 and reopens the sign-in hole, MD:549–550; IM:272–274).
   (C) A lingering "tail" incarnation that runs handlers with no host (heavy; a hidden second machine). (D) **Placement-owned
   lane plus an optional `whenOrphaned` callback, else the contract's `orphaned`** (F3, F5).
   *Recommendation:* D. It reuses a handler that exists (P19), adds one optional method, makes the lane survive the
   fragment (so L7 cannot happen), and forces a decision with a `flow check` error (`UnreconciledOrphan`) when an op can
   end `unknown`. *Residual risk:* an orphan cannot use the fragment's memory, so a fragment whose reconcile needs its own
   state is the wrong shape; the host should own it.
2. **A host that must react to a fragment's server result.** *Recommendation:* callbacks and exits only; the fragment
   shapes the payload and never exposes a raw `Outcome`. Add `.public()` rows for pure display (`pending`, `progress`).
   Hosts that need the raw result own the operation (a fragment is the wrong tool for them).
3. **A host that must cancel a fragment's call.** *Recommendation:* a `hostEvents: { Cancel }` the fragment handles,
   plus `whenAbandoned: { actions: [O.x.cancel] }` for abandonment. Add an info finding `NoCancelPath` for a fragment
   whose op can run long and has neither (problem L4, PR section 4). The host never receives `O`.
4. **Two fragments writing the same entity.** *Recommendation:* no new Flow rule. The record queue orders them (M4 rule
   29), predictions stack, and each Attempt keeps its own `uncertain` mark (rule 32). `flow check` warns `SharedRecord`
   when two placements in one actor bind domain entries that predict the same entity, and Story-derived output shows the
   interleaving. The server's own conflict rule decides who wins.
5. **Concurrency across fragment instances.** *Recommendation:* a lane is (placement, site, key); `concurrency` is the
   contract's per lane. Two placements of a `reject` transaction do not exclude each other: `SharedContract` warning
   (OID:252–256). A re-entered fragment *is* excluded by its predecessor's lane (F3), which is the case that matters.
6. **Error classification ownership.** *Recommendation:* unchanged where it is: the contract classifies at the response,
   the fragment maps (rule 13, exhaustive), the host cannot reclassify. This removes H4 and H5 for hosts. A cross-cutting
   failure (an expired session) is a failure tag the exhaustive map forces every fragment author to route; no hidden
   global handler is proposed.
7. **A frozen fragment with a write in flight.** *Recommendation:* ban `.resumable()` with a write site in v1 (F8); place the
   fragment higher. Revisit with a held-ending channel only if a case needs it (`revisit.md`).
8. **Exits with a call in flight** (subroutine). *Recommendation:* allowed; the ending orphans; `ExitWithCallInFlight` is a
   Story-derived warning. The author usually sequences the exit after the ending (as `Upload` does).
9. **Starting on entry (A7).** *Recommendation:* `start` on subroutines only (F10), reviving v2:382. A trait that must load
   on activation uses a `Flow.entry` schedule or a placed read.
10. **Which kinds.** See section 6.

## 5. Is it buildable

Checked against the pieces named, in the owner's order.

| Piece | Check | Result |
| --- | --- | --- |
| **Turn algorithm (MD 2.5)** | Step 1 already maps a call ending at admission and tests its owner (MD:655–658), and discards a timer of a dead activation (MD:659). Step 2's source for a fragment-addressed event is the fragment's handler, which is how a fragment timer firing must already work; one sentence makes it explicit for call endings. Steps 3–6 are unchanged: a start is an effect recorded at commit (MD:729–730). | works with one added sentence |
| **Mailbox and admission** | FIFO; endings, timers and sends queue together (MD:653–654; RT:81–89: "Outcomes … are never dropped"). An orphan is admitted and routed off-actor, as `orphaned` already is (MD:661–662). | works |
| **Incarnations** | Counters exist for `.each` copies only (MD:467). Orphan detection needs a persisted counter per placement for **every** fragment, and the Attempt must record (placement path, key, incarnation). | **rule change**: extend the counter to all placements |
| **Runtime ownership model** | Today a start is owned by a state activation (rule 14). Ownership by fragment incarnation is the same test against another identity; lanes keyed by placement is OID 3.2 applied to a new owner. Persisted by path, site, key (PER O6, OID S8). | works, with the lane/route split (F3) |
| **Rule 15 (`LateMayNotLeave`)** | Must read lanes of placements below an exited state. | **rule change**: one clause (2.4) |
| **`whenAbandoned` (MD:421–425)** | Must accept `cancel` actions (fused, no targets, no starts). | **rule change**: small |
| **Static analysis** | Summaries gain `starts`, `requires`, orphan policy, public rows; `check()` and `flow check` read declarations only (R10, OID). | works; summary shape changes (rule 10) |
| **Stories** | `story.trait` / `story.subroutine` harness gains `fixtures` (M3:367–372). | works; M3 changes a sentence |
| **Entity domains** | Store effects are independent of routing (M4:366–369). | works unchanged |
| **Dependency** | Needs OID's site model (`operations` on declarations, `start(select)`). On the *current* body-commit-value model (MD 2.7.3) the same idea needs IM's `calls` in traits and the required `onOrphaned` port, which this design exists to avoid. | **depends on OID being accepted** |
| **Types** | `operations: ({ E, callbacks }) => …` needs `E` and the callback handles before the sites (OID section 4 watch item); `.each` row typing under `s.operations.<instance>` is untested. | **unknown until spiked** |

**Verdict: buildable with these rule changes** (incarnation counters for all fragments, the orphan route and the widened
`orphaned`, rule 15's clause, `whenAbandoned` `cancel`, summary and Stories changes, rule 3's removal), **and only after
OID's site model**. It is not buildable as is: rule 3 forbids it, and nothing today lets a dead owner's ending go
anywhere but a required host port.

## 6. Recommendation

**Both kinds, one rule set, built traits first.** The ownership, lane, orphan and visibility rules (F1–F9) are identical
for traits and subroutines, so allowing only one saves almost no rules; the only kind-specific rules are `start` (F10,
subroutines) and the freeze ban (F8, traits). Order of build: traits first (no `start` hook, root-placed and `.each`
traits have the weakest lifetime hazards, and three of the five patterns are traits), subroutines second (one hook).
**If the owner wants one kind: traits.** Reuse is the point, and the autosave, feed and per-row traits recur on more
screens than any single step does. Subroutines are the stronger *typed-result* abstraction (an exit is a typed return
value), and Upload is the neatest case, but a step is more often used once.

**The smallest rule set:** F1 (declare), F2 (only the fragment uses), F3 (lane by placement), F5 (orphan route:
`whenOrphaned`, else the contract's `orphaned`), F7 (private rows unless `.public()`), F8 (no resumable with writes).
F4, F6 and F9 are consequences of existing rules; F10 comes with subroutines. **Defer** `.public()` if it is contested
(a fragment can publish a memory field instead, at the cost of the drifting copy D1, PR:155); **defer** `whenOrphaned` if
the contract's `orphaned` is enough for the first fragments (it covers Autosave, Upload and Like; only the sign-in and
the saga need the callback).

**Reject** fragments generic over any contract (a revived `CommitWithRetry`) in v1, and keep sagas in hosts.

**What to decide first**, in the interview style (Q, options, recommendation):

- **Q1. Allow operations in fragments at all?** A yes (traits first). B no, keep OID 3.10. *Recommend A* only if the owner
  wants reuse of I/O policy; B is correct and smaller if every screen is used once.
- **Q2. Orphan destination.** A `whenOrphaned` then contract `orphaned` (recommended). B contract `orphaned` only. C IM's
  required `onOrphaned`.
- **Q3. Row visibility.** A private unless `.public()` (recommended). B public like memory.
- **Q4. Frozen plus writes.** A ban (recommended). B held endings.
- **Q5. Subroutine `start`.** A yes with subroutines (recommended). B zero-delay schedule hop.

Nothing here is decided; every item is proposed.
