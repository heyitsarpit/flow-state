# Proposal: server calls and entity domains (merge 4)

Status: **merged into machine-design.md on 2026-10-30; kept as the record behind it.** It was merge 4 into
[machine-design.md](../machine-design.md) (section 2.8, rules 26–38, section 5's C21–C30 and the "Decisions" section
there; plan: [merge-plan-4-5.md](../../../../../archive/flow-design-2026-11/machine-fragments/merge-plan-4-5.md)). Where this record and the design differ, the design wins:
the design decides every start in step 5, before publication, for every write (rule 28 here was written for domain
writes only). Accepted by the owner on 2026-10-30 (E1–E16), revised by the multiplicity audit (2026-10-31, E17, E18,
[audit-multiplicity.md](../../../../../archive/flow-design-2026-11/machine-fragments/audit-multiplicity.md)). Its `MD:` citations are line numbers of the design before this
merge. Section 9 is kept as the reasoning behind section 10's decisions.

Sources and the short names used for citations:

| Short name | File (under `workflow/plans/flow/`) |
| --- | --- |
| MD | `references/explorations/machine-fragments/machine-design.md` |
| REV | `references/explorations/machine-fragments/merged/server-calls/reviews/entities.md` |
| LIST | `references/explorations/machine-fragments/merged/server-calls/rewrites/list.ts` |
| EDP | `EntityDomains.plan` |
| ED | `references/design/entity-domain.md` |
| EDX | `references/design/entity-domain-examples.md` |
| OPS | `Operations.plan` |
| PER | `Persistence.plan` |

"Flow" means Flow's own runtime; nothing in Flow reads an HTTP status or an author error type (MD:775-776). "The
store" is the Runtime's record store (EDP:6, EDP:62-64). "The lane" is the commit value's lane per actor, transaction
and key (rule 21, MD:551-563).

## 1. The problem

Merge 2 was written without entity domains (REV:9-12). Its rewrites keep rows, predictions and rollback in machine
memory (LIST:8-19, LIST:117-128), while EntityDomains replaces call-site `optimistic` and `setData` with `.predicts`
(EDP:60-61, EDP:185-187), forbids temporary ids (EDP:118-119) and still spells retry `O.x.retry(select)` (EDP:107-108,
OPS:113). MD defers the meeting point to open item 14 (MD:875-876, MD:2253-2255). The two reviews in REV found:

**Ownership and API**

- **A-H1** (REV:15-19): a write about an entity has two owners. Renaming is about 22 lines and 5 concepts in
  `list.ts` against about 3 lines of `.predicts`; without a canonical path an author writes both and shows two truths.
- **A-H2** (REV:20-22): two retry shapes, `O.x.retry(select)` (OPS:113, EDP:107-108) and `pay.retry(key)` (MD:989).
- **A-H3** (REV:23-25): `latest` and `reject`-as-ending (MD:525-534, MD:1215) against OPS's "without work or
  outcome" (OPS:92-93) and EDP's `cancel` error (EDP:112-113); what a superseded waiting start does to its prediction
  and the record queue is unanswered.
- **A-M1** (REV:26-27): one id, three spellings (entity primary key, transaction `key`, `.each` key).
- **A-M2** (REV:28-29): `list.ts`'s temporary-id create (LIST:11-12, LIST:142-148) contradicts EDP:118-119.
- **A-M3** (REV:30-32): `pending` and uncertain live in two stores, the lane and the record (EDP:130).
- **A-M4** (REV:33-34): `StillUnknown` (rule 18) remaps a failure; the domain must consume the classified ending.
- **A-L1–A-L3** (REV:35-37): `.each` rows restate `{ id: key }`; `flow check` does not see entity effects; `pending`
  names two things.

**Data flow and cache consistency**

- **F-H1** (REV:40-42): the store changes at settlement (OPS:101) while the lane and event change at admission
  (MD:1322-1324), so a view can show confirmed data with "Saving…", or the reverse.
- **F-H2** (REV:43-45): a retry's prediction, its `basedOn`, and whether its late response overwrites a newer write.
- **F-H3** (REV:46-48): merge 2 invokes a waiting `latest` start at settlement (MD:1322), but EDP holds the record
  queue until an uncertain write's forced repair settles (EDP:115-116).
- **F-H4** (REV:49-52): rule 22's view for `writes` and `optimistic` (MD:583) is circular or vague; merge 2 left it
  open (MD:2240-2243).
- **F-M1–F-M7** (REV:53-65): the cache follows the channel but rule 18 changes the channel; no rule clears
  `uncertain`; no table of `NotSent` reasons against predictions; temporary-id rows show one issue twice; late
  store effects are unstated and `LikeSynced` lacks a `superseded` check (LIST:123); `AdmissionOverloaded` rejects
  the batch (OPS:96-97) against rule 16; lanes and predicted keys persist separately.
- **F-L1, F-L2** (REV:66-67): resource call values must carry confirmed data and say what a read's defect does; rule
  22 states as decided what open item 10 leaves open.

The split already exists in the plans: "Machines own workflow; the domain records places, dependencies, predictions
and server effects" (EDP:6-7) and "Machines own uncertain workflow" (EDP:192). This proposal applies it to every
point above.

## 2. Where the data comes from

Three places hold facts about one write. Each has one writer and one moment.

| Fact | Kept in | Written by | When | Read by |
| --- | --- | --- | --- | --- |
| The record's confirmed fields, versions, positions | the store (EDP:62-70) | responses, pushes, a write's success | when the response lands; a write's at **settlement** | views (`Issue.get`), answers, `value` outcomes |
| A prediction | the store, per record and Attempt (EDP:64-65) | the domain's `.predicts`, with the real input (EDP:51-52) | joined at the **start**, in the starting turn's publication (rule 28) | views, as `predicted` |
| The record queue | the store, per record, across actors (EDP:112-116) | Flow, from starts and retries | joined at start or retry; released at **settlement**, or after the forced repair for an unknown | Flow; `Entity.queue` in Stories (EDP:138) |
| `uncertain` | the store, per record and Attempt (EDP:103-106) | Flow, from the Attempt's ending | set at **settlement** of an unknown; cleared per rule 32 | views, as `uncertain` |
| `unconfirmed` fields | the store (EDP:93-100) | Flow, from a success that omitted a predicted field | **settlement**; cleared by a confirming read | views |
| `pending`, `retryCount`, the addressable Attempt | the lane (rule 21) | Flow | `pending` from the starting turn until the ending's turn is **admitted** | guards and views, as the snapshot's lane rows (`s.calls.Issues.setLike`; Revision (multiplicity audit, 2026-10-31): replaces `like.pending(s, key)`, design D18), never the store |
| The ending as an event, its route | the mailbox and the commit value's `outcomes` (rules 13, 14) | Flow, at **admission** | the ending's turn | the machine's handlers |
| Drafts, toasts, reconcile keys, selection | memory | the machine's handlers | its turns | views, guards, selects |
| `attempt.id` on the wire, `basedOn` | the request | the commit author (rule 19); Flow passes `basedOn` (OPS:88-89, EDP:109) | each send; a retry sends the same (rule 31) | the server |

**Store versus lane.** The record is shared truth: every actor and view in the Runtime sees it the moment the
server's answer lands. The lane is this actor's workflow: whether this actor has handled the ending yet. They answer
different questions, so they change at different moments, and a view picks the one that means what it shows:

```ts
const row = useView(list, (s) => Issue.get(s, { id }, Issue.pick("title", "liked", "likes")))   // { data, predicted, uncertain, unconfirmed }
const saving = useView(list, (s) => s.calls.Issues.setLike.find((l) => l.key.id === id)?.pending ?? false)   // this actor's call is in flight or not yet handled (Revision (multiplicity audit, 2026-10-31): lane rows, design D18)
// "Saving…" reads `saving`; the grey "not yet confirmed" style reads `row.predicted`; the "?" badge reads `row.uncertain`
```

Between a write's settlement and its ending's admission, `row.predicted` is already false and `saving` still true.
That is not a contradiction: the server has answered, and this actor has not yet reacted (rule 27).

## 3. Design

### 3.1 The list, rewritten against an `Issues` domain

LIST (197 lines: definition 52, machine 142) keeps every issue in memory as an `Item` with `sync`, `like.desired` and
`like.confirmed`, `pendingTitle`, `deleted` and a temporary id (LIST:8-19), and writes prediction and rollback by hand
(LIST:117-128, LIST:104). The rewrite moves shared data to the domain and keeps workflow in memory.

**The domain** (26 lines, new; LIST's `list.operations.ts` was not shown):

```ts
// ───────────────────────────────────────────────── issues.operations.ts (plain structs; no entity imports, EDP O1)
export const issuesInProject = resource({ id: "issues/in-project", key: (i: { projectId: string }) => i, result: IssuesPage, … })
export const setLike = transaction({ id: "issues/set-like", input: Schema.Struct({ key: IssueKey, liked: Schema.Boolean }), concurrency: "latest", commit: … })
export const renameIssue = transaction({ id: "issues/rename", input: Schema.Struct({ key: IssueKey, title: Schema.String }), concurrency: "latest", commit: … })
export const removeIssue = transaction({ id: "issues/remove", input: Schema.Struct({ key: IssueKey }), concurrency: "reject", commit: … })
export const createIssue = transaction({                          // no predicts, so its key is declared (E10)
  id: "issues/create", input: Schema.Struct({ draftId: Schema.String, projectId: Schema.String, title: Schema.String }),
  key: (i) => ({ draftId: i.draftId }), concurrency: "reject", commit: …,   // attempt.id on the wire (rule 19); draftId stays on the device
  // Revision (multiplicity audit, 2026-10-31): was "allow". One lane per draft is one call, so `create.retry(drafted)` names it (design rule N2);
  // under "allow" retry is a type error, because two creates of one draft would share a lane.
})
// the three predicting writes declare no key: their lane is the predicted record, { id } (E10)

// ───────────────────────────────────────────────── issues.domain.ts
export const Issue = entity({ id: "issues/Issue", fields: IssueRow.fields, primaryKey: ["id"] })
export const Issues = domain("issues", {
  list: read(issuesInProject)
    .list(Issue, ({ result }) => result.issues)
    .where(({ input, record }) => eq(record.projectId, input.projectId))
    .orderBy(({ record }) => [desc(record.number), asc(record.id)]),
  setLike: write(setLike).one(Issue).predicts(({ input }) => Issue.patch(input.key, {
    liked: input.liked,
    likes: (i) => i.likes + (input.liked === i.liked ? 0 : input.liked ? 1 : -1),
  })),
  rename: write(renameIssue).one(Issue).predicts(({ input }) => Issue.patch(input.key, { title: input.title })),
  remove: write(removeIssue).predicts(({ input }) => Issue.delete(input.key)),
  create: write(createIssue).one(Issue),                          // membership arrives by refetch (EDP O1)
})
```

**The definition and machine** (159 lines: definition 49, machine 109; LIST was 197: definition 52, machine 142):

```ts
// ───────────────────────────────────────────────── list.definition.ts
import { definition, deny, Flow, machine } from "flow-state"
import { Schema } from "effect"
import { Issues } from "./issues.domain"

export const MAX_LIKE_RESENDS = 3

export const Draft = Schema.Struct({            // workflow, not entity data: a create the list does not hold yet (E9)
  draftId: Schema.String,                       // the view's key and the create's lane; never sent
  title: Schema.String,
  status: Schema.Literals(["sending", "failed", "unsure", "created"]),
  failure: Schema.NullOr(Schema.String),
  id: Schema.NullOr(Schema.String),             // the real id once Created; the view hides the draft once the list holds it
  discarded: Schema.Boolean,                    // discarded while it may land: deleted once Created
})
export type Draft = typeof Draft.Type

export const List = definition({
  id: "Issues/List",
  states: ["READY"],
  events: {
    Toggle: { id: Schema.String, liked: Schema.Boolean },   // the view sends the value it wants, read from the record
    Edit: { id: Schema.String, title: Schema.String },
    Delete: { id: Schema.String },
    Open: { id: Schema.String },
    Create: { draftId: Schema.String, title: Schema.String },
    Retry: { draftId: Schema.String },
    Discard: { draftId: Schema.String },
  },
  internalEvents: {
    Listed: { ids: Schema.Array(Schema.String) },
    Settled: {}, IssueGone: {},
    Failed: { message: Schema.String, superseded: Schema.Boolean },
    Unsure: Flow.uncertain({ message: Schema.String, superseded: Schema.Boolean }),
    LikeUnsure: Flow.uncertain({ id: Schema.String, superseded: Schema.Boolean }),
    Created: { draftId: Schema.String, id: Schema.String },
    CreateFailed: { draftId: Schema.String, message: Schema.String },   // Revision (multiplicity audit, 2026-10-31): a NothingToResend names its draft through laneKey (design D21)
    CreateUnsure: Flow.uncertain({ draftId: Schema.String }),
    ReconcileLike: { id: Schema.String }, ToastExpired: {},
  },
  memory: {                                                        // workflow only: no row, title, like or rollback (E1)
    projectId: Flow.input(Schema.String),
    creating: Flow.initial(Schema.Array(Draft), []),
    likeUnsure: Flow.initial(Schema.Array(Schema.String), []),     // the keyed schedule's keys
    selectedId: Flow.initial(Schema.NullOr(Schema.String), null),
    toast: Flow.initial(Schema.NullOr(Schema.String), null),
  },
  operations: { Issues },
})

// ───────────────────────────────────────────────── list.machine.ts
type Memory = typeof List.Memory.Type
const draft = (m: Memory, draftId: string) => m.creating.find((d) => d.draftId === draftId)
const editDraft = (m: Memory, draftId: string, f: (d: Draft) => Draft) => ({ creating: m.creating.map((d) => (d.draftId === draftId ? f(d) : d)) })
const dropDraft = (m: Memory, draftId: string) => ({ creating: m.creating.filter((d) => d.draftId !== draftId) })
const without = (ids: ReadonlyArray<string>, id: string) => ids.filter((x) => x !== id)

export const ListMachine = machine(List, ({ S, E, O }) => {
  const issue = ({ event }) => ({ id: event.id })                  // the lane key is the record key (E10)
  const drafted = ({ event }) => ({ draftId: event.draftId })
  const fail = (message: string) => E.Failed.from((_r, { superseded }) => ({ message, superseded }))
  const unsure = (message: string) => E.Unsure.from((_r, { superseded }) => ({ message, superseded }))

  // B1: the store predicts liked and likes; `latest` coalesces inside the record queue (E5)
  const like = O.Issues.setLike.commit(({ event }) => ({ key: { id: event.id }, liked: event.liked }), {
    outcomes: {
      success: E.Settled,                                          // the store confirms; memory has nothing to write
      failure: { Gone: E.IssueGone, Refused: fail("Could not update"), NotSent: fail("Could not update") },   // NotSent: Superseded or Overloaded (E11)
      unknown: E.LikeUnsure.from((_r, { input, superseded }) => ({ id: input.key.id, superseded })),
    },
  })
  const rename = O.Issues.rename.commit(({ event }) => ({ key: { id: event.id }, title: event.title }), {
    outcomes: { success: E.Settled, failure: { Gone: E.IssueGone, Refused: fail("Couldn't save the title"), NotSent: fail("Couldn't save the title") }, unknown: unsure("Couldn't confirm the title") },
  })
  const remove = O.Issues.remove.commit(({ event }) => ({ key: { id: event.id } }), {   // Delete, and Created for a discarded draft
    outcomes: { success: E.Settled, failure: { Refused: fail("Couldn't delete"), NotSent: fail("Couldn't delete") }, unknown: unsure("Couldn't confirm the delete") },
  })
  // B2: Create and Retry both start it; the select reads the draft from the after memory (rule 22)
  const create = O.Issues.create.commit(({ memory, event }) => ({ draftId: event.draftId, projectId: memory.projectId, title: draft(memory, event.draftId)?.title ?? "" }), {
    outcomes: {
      success: E.Created.from((v, { input }) => ({ draftId: input.draftId, id: v.id })),
      failure: {
        Invalid: E.CreateFailed.from((r, { input }) => ({ draftId: input.draftId, message: r.message })),
        Refused: E.CreateFailed.from((r, { input }) => ({ draftId: input.draftId, message: `Refused (${r.status})` })),
        NotSent: E.CreateFailed.from((r, { laneKey }) => ({ draftId: laneKey.draftId, message: `Not sent (${r.why})` })),   // laneKey: always present
      },
      unknown: E.CreateUnsure.from((_r, { input }) => ({ draftId: input.draftId })),
    },
  })
  const reload = O.Issues.list.refetch(({ memory }) => ({ projectId: memory.projectId }))   // a failure repairs nothing (C4): ask again
  const draftIs = (pred: (d: Draft) => boolean, code: string) => ({ memory, event }) => { const d = draft(memory, event.draftId); return (d !== undefined && pred(d)) || deny(code) }
  const toastUnlessSuperseded = [
    { target: "self", guard: ({ event }) => event.superseded || deny("Latest") },   // a newer write on the lane decides
    { target: "self", updateMemory: ({ event }) => ({ toast: event.message }) },
  ]

  return {
    default: S.READY,
    states: {
      READY: {
        activities: {   // value sees confirmed data only (EDP O1); the event carries ids, never rows
          issues: O.Issues.list.subscribe(({ memory }) => ({ projectId: memory.projectId }), { outcomes: { value: E.Listed.from((v) => ({ ids: v.issues.map((i) => i.id) })) } }),
        },
        schedules: {
          reconcile: { keys: ({ memory }) => memory.likeUnsure, schedule: "3 seconds", send: E.ReconcileLike.from(({ key }) => ({ id: key })) },
          toastOff: { schedule: "4 seconds", send: E.ToastExpired, armOn: [E.Failed, E.Unsure, E.LikeUnsure] },
        },
        on: {
          // ───────────── B1 likes, rename, remove: the store predicts, confirms, rolls back and marks uncertain (E1)
          Toggle: { target: "self", updateMemory: ({ memory, event }) => ({ likeUnsure: without(memory.likeUnsure, event.id) }), actions: [like] },   // a newer write replaces the reconcile
          Edit: { guard: ({ event }) => event.title.trim() !== "" || deny("EmptyTitle"), target: "self", actions: [rename] },
          Delete: { guard: [remove.idle(issue)], target: "self", updateMemory: ({ memory, event }) => ({ selectedId: memory.selectedId === event.id ? null : memory.selectedId }), actions: [remove] },
          Open: { guard: ({ activities, event }) => activities.issues?.data?.issues.some((i) => i.id === event.id) || deny("NoSuchRow"), target: "self", updateMemory: ({ event }) => ({ selectedId: event.id }) },
          Settled: { target: "self" },
          IssueGone: { target: "self", actions: [reload] },
          Failed: toastUnlessSuperseded,
          Unsure: toastUnlessSuperseded,                             // the record reads uncertain until a later write or a retry succeeds (E3)
          LikeUnsure: [
            { target: "self", guard: ({ event }) => event.superseded || deny("Latest") },   // the newer write's success clears it (E3)
            { target: "self", guard: ({ calls, event }) => (calls.Issues.setLike.find((l) => l.key.id === event.id)?.retryCount ?? 0) < MAX_LIKE_RESENDS || deny("GaveUp"), updateMemory: ({ memory, event }) => ({ likeUnsure: [...without(memory.likeUnsure, event.id), event.id] }) },   // setLike is latest: one addressable Attempt (design rule N2)
            { target: "self", updateMemory: ({ memory, event }) => ({ likeUnsure: without(memory.likeUnsure, event.id), toast: "Couldn't confirm your like" }) },
          ],
          ReconcileLike: { target: "self", updateMemory: ({ memory, event }) => ({ likeUnsure: without(memory.likeUnsure, event.id) }), actions: [like.retry(issue)] },   // the same request, no new prediction (E7)

          // ───────────── B2: create as a draft, shown apart from the list (E9)
          Create: {
            guard: [({ event }) => event.title.trim() !== "" || deny("EmptyTitle"), ({ memory, event }) => draft(memory, event.draftId) === undefined || deny("DuplicateDraft")],
            target: "self",
            updateMemory: ({ memory, event }) => ({ creating: [...memory.creating, { draftId: event.draftId, title: event.title, status: "sending", failure: null, id: null, discarded: false }] }),
            actions: [create],
          },
          Created: [
            { guard: draftIs((d) => d.discarded, "NotDiscarded"), target: "self", updateMemory: ({ memory, event }) => dropDraft(memory, event.draftId), actions: [remove] },
            { target: "self", updateMemory: ({ memory, event }) => editDraft(memory, event.draftId, (d) => ({ ...d, status: "created", id: event.id })) },
          ],
          Listed: { target: "self", updateMemory: ({ memory, event }) => ({ creating: memory.creating.filter((d) => d.id === null || !event.ids.includes(d.id)) }) },
          CreateFailed: [
            { guard: [draftIs((d) => d.discarded, "NotDiscarded")], target: "self", updateMemory: ({ memory, event }) => dropDraft(memory, event.draftId) },
            { target: "self", updateMemory: ({ memory, event }) => editDraft(memory, event.draftId, (d) => ({ ...d, status: "failed", failure: event.message })) },
          ],
          CreateUnsure: [
            { guard: [draftIs((d) => d.discarded, "NotDiscarded"), ({ calls, event }) => (calls.Issues.create.find((l) => l.key.draftId === event.draftId)?.retryCount ?? 0) < 3 || deny("GaveUp")], target: "self", actions: [create.retry(drafted)] },   // find out, so a landed create is deleted
            { target: "self", updateMemory: ({ memory, event }) => editDraft(memory, event.draftId, (d) => ({ ...d, status: "unsure" })) },
          ],
          Retry: [
            { guard: [draftIs((d) => d.status === "failed", "NotFailed"), create.idle(drafted)], target: "self", updateMemory: ({ memory, event }) => editDraft(memory, event.draftId, (d) => ({ ...d, status: "sending", failure: null })), actions: [create] },   // a new write (rule 19)
            { guard: [draftIs((d) => d.status === "unsure", "NothingToRetry"), create.idle(drafted)], target: "self", updateMemory: ({ memory, event }) => editDraft(memory, event.draftId, (d) => ({ ...d, status: "sending" })), actions: [create.retry(drafted)] },   // the same Attempt
          ],
          Discard: [
            { guard: [draftIs((d) => d.status === "failed", "NotFailed")], target: "self", updateMemory: ({ memory, event }) => dropDraft(memory, event.draftId) },
            { guard: [draftIs((d) => d.status === "unsure", "NotUnsure"), create.idle(drafted)], target: "self", updateMemory: ({ memory, event }) => editDraft(memory, event.draftId, (d) => ({ ...d, discarded: true })), actions: [create.retry(drafted)] },
            { guard: [draftIs((d) => d.status === "sending", "NotSending")], target: "self", updateMemory: ({ memory, event }) => editDraft(memory, event.draftId, (d) => ({ ...d, discarded: true })) },
          ],
          ToastExpired: { target: "self", updateMemory: () => ({ toast: null }) },
        },
      },
    },
  }
})
```

**The view** (excerpt): rows come from the answer, row fields from the record, drafts from memory, "Saving…" from the
lane.

```tsx
const rows = useView(list, (s) => s.activities.issues?.data?.issues ?? [])
const drafts = useView(list, (s) => s.memory.creating.filter((d) => !d.discarded && !rows.some((r) => r.id === d.id)))
const row = useView(list, (s) => Issue.get(s, { id }, Issue.pick("title", "liked", "likes")))
<LikeButton liked={row.data.liked} count={row.data.likes} unsure={row.uncertain} onClick={() => send(E.Toggle({ id, liked: !row.data.liked }))} />
```

**What changed, case by case.**

| Case | LIST | Rewrite |
| --- | --- | --- |
| Like | memory `desired`/`confirmed`/`count`; `LikeSynced`, `LikeRefused` rollback with a `superseded` guard (LIST:117-128) | `.predicts` (2 lines); success is `Settled`; failure only toasts; the store replays the newer waiting prediction, so a failure can never undo newer intent |
| Like unknown | keyed reconcile, `retryCount` budget (LIST:130-138) | the same; `Toggle` drops the key, because a newer write's success clears `uncertain` (rule 32) |
| Rename | select reads memory; `Edit` with two alternatives and `pendingTitle` for an unsaved row; `Created` re-sends (LIST:93, LIST:152, LIST:172-178) | one transition; the store predicts and confirms. Editing a draft while it sends is dropped: a draft is not a record |
| Remove | `deleted` flag, `notConfirmed` restores it (LIST:104, LIST:180-184) | `.predicts(Issue.delete)` hides it everywhere; failure restores it in the store |
| Create | a temporary-id row adopted on `Created` (LIST:100-103, LIST:150-154) | a `creating` draft, hidden by the view once the list holds its id, pruned by `Listed` (rule 33) |
| A gone issue | `dropId` from memory | `IssueGone` refetches the list: a failure repairs nothing (C4, MD:2136) |

**Count.** The file shrinks by 38 lines (197 to 159), the machine body by 33 (142 to 109), and the domain adds 26; the concepts per write fall from five
(select, outcomes, mapped events, memory prediction, hand rollback; REV:15-17) to three (select, outcomes, events).
The win is not lines but one truth: no row exists in memory, so no view can show two.

### 3.2 Ownership (E1)

For an operation registered in a domain, **the domain owns shared data and the commit value owns workflow**:

| The domain (store) | The commit value (machine) |
| --- | --- |
| applies the prediction at start, replays it over each new base | which event each ending becomes (`outcomes`, rule 13) |
| confirms, rolls back, repairs, forces a repair for unknown | where that event routes: current or late (rule 14) |
| marks and clears `uncertain`, `unconfirmed` | whether to retry, when, with what budget (rules 19, 25) |
| orders sends per record (the record queue) | whether to cancel (rule 24) |

```ts
// before (LIST:117-128): memory is a second store
Toggle: { updateMemory: ({ memory, event }) => ({ items: editId(memory, event.id, (i) => withLike(i, { desired: !i.like.desired })) }), actions: [like] },
LikeRefused: [{ guard: superseded }, { updateMemory: …(i) => withLike(i, { desired: i.like.confirmed }) }],
// after: the domain predicts; memory holds nothing about the like
setLike: write(setLike).one(Issue).predicts(({ input }) => Issue.patch(input.key, { liked: input.liked, likes: … })),
Toggle: { target: "self", actions: [like] },
```

- Machine memory never mirrors entity data. It holds drafts, toasts, reconcile keys and selection. Views read records
  and answers.
- This is EDP D1 (EDP:185-187) stated for the merged commit value: `optimistic` and `setData` stay type errors on a
  domain operation (EDP:60-61, ED:294-299).
- A plain operation (not in a domain) keeps memory-held or `optimistic` predictions; nothing in 2.7 changes for it.

### 3.3 Timing: settlement and admission (E4, E13)

```text
settlement ── classify the send (2.7.1); apply rule 18 from the Attempt's send history
           ── store: apply the Attempt's ending (rule 30), release the record queue   ── one publication
           ── queue the ending in the actor's mailbox; the lane is untouched, pending stays true
admission  ── map through outcomes, test the owner (rule 14), update the lane (rule 21)
```

- **Store effects publish at settlement.** Shared truth never waits for one actor's mailbox: a busy or disposed
  actor (OPS:105-106 keeps cache consequences during disposal) must not hold another screen's view of a record.
- **The lane changes at admission**, as merge 2 decided (MD:1322-1324): it records whether this actor has handled
  the ending, which is what `pay.idle` and "Saving…" mean (D5, D6).
- **Rule 18 moves to settlement** (found checking E4/E8). MD:655 applies rule 18 at admission, but the store needs
  the Attempt's ending at settlement. Rule 18 reads only the Attempt's send history, which is known at settlement, so
  nothing else moves; admission only maps it.
- **Routing never changes store effects (E13).** A late, superseded or current ending has the same store effect,
  because routing is decided later, at admission, from the machine's state. So `LIST`'s `LikeSynced` overwrite of
  newer memory (REV:60-61) cannot happen in the domain path: there is no memory to overwrite.

```ts
// A late success (the owner state was left) still confirms the rename for every screen:
rename: …,                         // store at settlement: fields the response carries are confirmed; omitted ones stay predicted until a confirming read (EDP:92-100). Erratum (2026-10-30)
Settled: { target: "self" },       // at the root: handled whether current or late (rule 20)
```

**The starting side** (found checking E4). A start applies its prediction "on start" (OPS:82), but step 6 publishes
the turn first and starts actions after (MD:729-730). The rewrite would publish a snapshot in which this actor's lane
is not yet pending and the record not yet predicted, then a second one. Rule 28 joins them: a domain write's queue
join and prediction publish in the starting turn's publication. A declined start (Rejected, Overloaded) applies
nothing, and that is known before publication.

### 3.4 Concurrency: the record queue wins (E5, E6, E11)

The actor decides first, then the record queue (ED:643-651). Merge 2's `latest` is an actor mode; the record queue is
shared and decides when a send leaves.

```ts
// setLike is `latest`. Three quick toggles on one issue while another actor's rename (R) is queued on it (Erratum (2026-10-30): was "another tab's"; each tab is its own Runtime and store):
// t0 Toggle(true)   A starts: the actor's current write; joins the record queue [R, A]; the record shows liked
// t1 Toggle(false)  B starts: the actor's one waiting write; joins [R, A, B]; B's prediction replays over A's: not liked
// t2 Toggle(true)   C supersedes B: B was never invoked, so it is removed from the queue and ends
//                   NotSent Superseded, prediction removed, no repair; C joins [R, A, C]; the record shows liked
// R settles unknown → the queue holds A until R's forced repair settles (EDP:115-116); then A is sent, then C
```

- **E5. A `latest` waiting start joins the record queue.** Superseding it removes a queued, never-invoked write,
  which EDP already allows (EDP:114-115): it ends `NotSent { why: "Superseded" }` with its prediction removed and no
  repair. The record queue, not merge 2's settlement rule (MD:1322), releases the next send, so a waiting `latest`
  start never runs over an unrepaired record (F-H3).
- **`cancel`.** EDP makes `concurrency: "cancel"` on a predicting write a `flow check` error (EDP:112-113,
  ED:645-646). The proposed E5 extends that to "`cancel` of an invoked predicting write"; section 9 (question 2.1)
  explains why that is not checkable and recommends that the `.cancel(key)` action stay allowed, with rule 24's
  endings and rule 30's store effects.
- **E6. `reject` is the design's:** a start on a busy lane is an ending, `NotSent { why: "Rejected" }`, and the
  transition runs (rule 16, D5), replacing OPS's "declines … without work or outcome" (OPS:92-93). A Rejected start
  has no Attempt, so it never applies a prediction or joins a queue.
- **E11. Queue overflow is an ending.** A start that would exceed the actor's `serialize` queue (64, OPS:95-96) or
  any record queue it joins (64, EDP:179-182) ends `NotSent { why: "Overloaded" }`: no prediction and no queue join
  in any record (EDP's "no partial joins", EDP:209-210). The batch's other actions and the transition run. This replaces
  "rejects the whole action batch" (OPS:96-97) and is rule 16 applied to one more decline.

```ts
failure: { …, NotSent: fail("Could not update") },   // Superseded (superseded: true, no toast) or Overloaded (toast)
```

**Every `NotSent` against the store (F-M3).**

| `NotSent { why }` | Prediction | Queue | Repair | `uncertain` |
| --- | --- | --- | --- | --- |
| `Rejected` | never applied | never joined | none | unchanged |
| `Overloaded` | never applied | never joined (no partial join) | none | unchanged |
| `Superseded` | removed | removed | none | unchanged |
| `Cancelled` (queued, before invocation) | removed | removed | none | unchanged |
| `Restored` (unacknowledged at reload) | none: predictions are never persisted (EDP:127-128) | none | none | unchanged |
| `NothingToResend` | none: no write | none | none | unchanged |

This replaces ED:650-651's "settles interrupted" for a queued cancel.

### 3.5 Unknown, retry and uncertain (E2, E3, E7, E8)

**E2. One retry shape.** `pay.retry(key)` (MD:989, rule 19) replaces `O.x.retry(select)` in OPS O3 (OPS:113-117) and
EDP O1 (EDP:107-108), with OPS's "known settled result settles immediately" (OPS:114-115): under rule 21 a lane whose
Attempt succeeded has no addressable Attempt, so a retry ends `NotSent { why: "NothingToResend" }`. "The machine
reconciles the Attempt" (EDP:105-106) is spelled `pay.retry(key)`.

**E7. A retry is the same request.**

```ts
ReconcileLike: { target: "self", updateMemory: …, actions: [like.retry(issue)] },
// sends the Attempt's input and basedOn unchanged; applies no prediction; joins the record queue behind any newer write
```

- **The same `basedOn`.** REV's direction was "a fresh `basedOn`" (REV:44-45). A server that deduplicates by
  `attempt.id` compares the request with the stored one; a different `If-Match` makes it a different request under
  the same key, which such servers refuse or, worse, apply. A stale `basedOn` that the server now refuses with 412 is
  a definite failure after an unknown send, so it arrives as `StillUnknown` (rule 18): honest, because the first send
  may be the reason the version moved. The loop REV:45 fears is bounded by the machine's `retryCount` budget.
- **No prediction.** The Attempt's prediction ended when its forced repair landed (EDP:103-105); re-applying it
  would show a value the server just contradicted.
- **It joins the record queue** (found checking E7). E7 does not say; it must, because "one write in flight per
  record" (ED:639) covers every send. It joins at the tail and adds no prediction.
- **Its response takes the position of the Attempt's first send**, so it cannot beat a newer write by position.
  That is right when the server replays a stored response, and wrong when the server applies the request fresh,
  after the newer write. Flow cannot tell the two apart, and it does not have to: a field the response carries that
  differs from a newer value loses by position and is therefore **contested** (EDP:66-69, ED:598-601), so the
  record's loader and holders refetch and the server decides. With versions, the version decides (EDP:65-66).

**E8. The store follows the Attempt's ending**, after rule 18, not the send's channel (F-M1, A-M4). A definite failure
of a retry after an unknown send is `StillUnknown`: the store treats it as unknown, keeps any prediction still live
(one exists only if the retry was sent before the first forced repair landed), forces the repair and keeps the record
uncertain. It never takes the failure row (predictions removed, no repair).

**E3. What clears `uncertain`** (F-M2):

```ts
// cleared: a later write to the record succeeds; a retry of the same Attempt succeeds
// not cleared: a read, a failed or StillUnknown retry, a later write that fails, the forced repair landing
```

A read never clears it: a read cannot prove the write will not still land (ED:656-658). The mark is per record and
Attempt (found checking E3): a record reads `uncertain` while any of its marks remains; a retry's success clears that
Attempt's mark, and a later write's success clears every mark on the record (EDP:105-106).

**The rule table** (replaces the cache table of MD:865-871 for domain operations; C4, MD:2136):

| The Attempt's ending (after rule 18) | Predictions | Repair | Queue release | `uncertain` |
| --- | --- | --- | --- | --- |
| success | confirmed fields replace them; omitted ones `unconfirmed` (EDP:92-100) | answers from both bases | at settlement | this Attempt's mark and the record's cleared |
| failure (author's tag) | removed | none (C4) | at settlement | unchanged |
| failure `NotSent` | section 3.4's table | none | at settlement | unchanged |
| unknown (author's, `Cancelled`, `Restored`, `Interrupted`, `Defect`, `StillUnknown`) | kept until the forced repair lands | forced | after the forced repair settles | set for this Attempt |

### 3.6 Creates (E9)

No temporary id enters a domain list. A pending create is workflow: memory holds a `creating` draft, the view shows it
apart from the answer, and membership appears when the answer's refetch holds its key (EDP:118-119, ED:670-674).

```ts
Create:  { updateMemory: …({ creating: [...memory.creating, { draftId, title, status: "sending", id: null, … }] }), actions: [create] },
Created: { updateMemory: …editDraft(memory, event.draftId, (d) => ({ ...d, status: "created", id: event.id })) },   // the view hides it once rows hold the id
Listed:  { updateMemory: …({ creating: memory.creating.filter((d) => d.id === null || !event.ids.includes(d.id)) }) },   // housekeeping; the view's filter is what shows
```

- **`draftId` is the view's key and the create's lane, never the server's id.** The idempotency key on the wire is
  `attempt.id` (rule 19); `draftId` stays on the device.
- **One source of rows** (F-M4): rows come from the answer; a draft is shown only while the answer does not hold its
  id, so one issue never shows twice.
- **`Listed` carries ids, not rows**, from the activity's `value`, which sees confirmed data only (EDP:130-131).
- A draft discarded while its create may land is created-then-deleted: `Created` starts `remove` with the real id
  (LIST kept the same behaviour, LIST:151).

### 3.7 Keys (E10)

E10 proposes that a domain write's transaction `key` defaults to "its `.one(Entity)` primary key", and that
`flow check` warns when a declared key is not that projection (A-M1). Checking it against ED found a gap (section 9,
question 4.3): `.one(Entity)` on a write locates the record **in the response** (ED:247-251; EDX:96-97 takes it from
`result.from`), which does not exist when the lane key is needed, at start. The key the domain knows at start is the
key expression recorded from `.predicts` (ED:338). The rewrite uses the recommended form:

```ts
rename: write(renameIssue).one(Issue).predicts(({ input }) => Issue.patch(input.key, { title: input.title })),
// renameIssue declares no key: its lane key is the predicted record's key, input.key = { id } (rule 34)
const issue = ({ event }) => ({ id: event.id })   // so retry, cancel, idle and pending take the entity's key record
create: write(createIssue).one(Issue),            // predicts nothing: createIssue declares key: (i) => ({ draftId: i.draftId })
```

- A write that predicts exactly one record defaults its lane key to that record's key; a declared `key` that is not
  that projection is a `flow check` warning, since two lanes for one record would let `reject` pass two writes.
- A write that predicts several records (EDX:95-101) or none (a create) keeps its declared key, or `{}` (D7).
- The `.each` spelling (strings, rule 9) is not changed here (A-L1, section 9 question 6.3).

### 3.8 Callback memory reads (E12)

Rule 22 lists "optimistic and write callbacks" as after reads (MD:583) while open item 10 leaves them open
(MD:2240-2243; F-H4, F-L2). Proposed:

```ts
O.Notes.save.commit(select, {                 // a plain operation
  optimistic: ({ memory, input }) => …,       // the starting turn's after memory, captured at start, even if the start waits
  writes: ({ value, input }) => …,            // no memory: it runs at settlement, before any turn of the ending exists
  outcomes: { … },
})
```

- `optimistic` (plain operations only) reads the starting turn's after memory, captured when the start is recorded,
  so a queued `serialize` start applies what its own turn saw, not a later turn's memory.
- `writes` receives `{ value, input }` and reads no memory: it runs at settlement (OPS:83), and the after memory of
  the ending's turn does not exist yet.
- Domain operations have no `optimistic` (EDP:60-61). The proposed E12 also says they have no `writes`; ED:297-299
  keeps `writes` on domain operations, restricted to `invalidate`. Section 9 (question 5.1) recommends keeping it.

### 3.9 Reads around writes (E15)

A resource's call value (MD:1245-1254) carries confirmed data only: predictions never reach a `success:` mapper,
as they never fire `value` (EDP:130-131). A read's defect or interruption arrives on `failure` as the Flow reasons
`Defect` and `Interrupted`:

```ts
const read = O.Issues.issueById.lookup(key, { outcomes: { success: E.Loaded, failure: E.ReadFailed } })   // one event: Defect and Interrupted arrive here
const read2 = O.Issues.issueById.lookup(key, { outcomes: { success: E.Loaded, failure: { NotFound: E.Gone, Defect: E.ReadFailed, Interrupted: E.ReadFailed } } })
```

E15 makes them "optional to map". Section 9 (question 5.2) finds that an unmapped read defect leaves a state
waiting with no event, the silent decline merge 2 removed for writes (D5), and recommends `flow check` require them
in a tag record, as it requires `NotSent` where it can occur (rule 20).

### 3.10 Persistence (E14)

A lane, its Attempt and the keys that Attempt predicts persist in **one capture**, the Attempt acknowledgement
Persistence O6 already requires before invocation (PER:123-127, C17 MD:2149). Restore therefore finds either both or
neither: an acknowledged Attempt whose predicted keys are marked `uncertain` with a forced repair (EDP:106-107), or an
unacknowledged one that ends `NotSent { why: "Restored" }` with nothing to repair (F-M7). Prediction values are never
persisted (EDP:127-128).

### 3.11 Names (E16)

The record read's `pending` (EDP:130, ED:705-706, ED:749) is renamed `predicted`:
`{ data, predicted, uncertain, unconfirmed }`. Then `pending` means one thing: this actor's call is in flight or its
ending not yet handled (rule 21). Section 9 (question 5.3) finds a second `pending` with the same meaning as the
record's: the resource and answer lane's `pending`, "true for live optimistic values or predictions" (OPS:153,
OPS:166, ED:703-704); it recommends renaming that one too.

## 4. Rules

Rules 13–25 (MD:504-610) still apply. These are added to 2.4 as rules 26–38; each names its decision.

26. **One split** (E1). For an operation registered in a domain, the domain owns shared data: the prediction, its
    confirmation and rollback, repair, the record queue, `uncertain` and `unconfirmed`. The commit value owns
    workflow: which event each ending becomes, its route, retry and cancel. Call-site `optimistic` and `setData` are
    type errors on it (EDP:60-61). Memory holds workflow and never a copy of a record field; views read records and
    answers.
27. **Settlement for the store, admission for the lane** (E4, E13). At settlement Flow classifies the send, applies
    rule 18, applies the Attempt's ending to the store (rule 30) and releases record queues, in one publication, then
    queues the ending. At admission it maps the ending, tests its owner and updates the lane (rules 14, 21). Store
    effects never depend on whether the ending routes current, late or superseded.
28. **A start publishes with its turn.** A domain write that starts joins every record queue it predicts and applies
    its prediction in the starting turn's publication (2.5 step 6). A start declined as `Rejected` or `Overloaded`
    applies nothing.
29. **The actor first, then the record queue** (E5). Actor concurrency (`reject`, `latest`, `allow`, `serialize`)
    decides whether a start is admitted; the record queue decides when it is sent. A `latest` waiting start joins
    the record queue; superseding it removes a never-invoked queued write: `NotSent { why: "Superseded" }`,
    prediction removed, no repair. `concurrency: "cancel"` on a predicting write is a `flow check` error;
    `.cancel(key)` follows rule 24, with rule 30's store effects.
30. **The store follows the Attempt's ending** (E8). Success confirms; a definite failure removes predictions without
    repair; `NotSent` removes or never applies them, without repair (3.4); unknown, including `StillUnknown`, keeps live
    predictions until a forced repair lands, holds the record queue until that repair settles, and marks the record
    uncertain for that Attempt. **Revision (multiplicity audit, 2026-10-31) (E18).** A prediction over a record the store does not hold (never held,
    or deleted beneath it by an earlier write or a push) shows nothing, and the record reads absent; it stays with its
    Attempt for the record queue and settlement, and its field functions run only once a base exists.
31. **A retry is the same request** (E2, E7). `pay.retry(key)` is the only re-send of a domain write. **Revision (multiplicity audit, 2026-10-31)
    (E17).** It exists only where the lane has one addressable Attempt (`reject`, `latest`, `cancel`; design rule
    N2); a domain write that must be retried under several concurrent calls takes a per-call key and `reject`. It sends the
    Attempt's input and `basedOn` unchanged, applies no prediction and joins the record queue. Its response is
    positioned at the Attempt's first send; a differing field it loses on is contested (EDP:66-69).
32. **What clears `uncertain`** (E3). A mark is per record and Attempt. A success of a retry of that Attempt clears it;
    a success of a later write to the record clears every mark on that record. A read, a forced repair, a failure and
    `StillUnknown` clear nothing. **Revision (multiplicity audit, 2026-10-31) (E18).** A mark holds its record, as a prediction does, so the record is
    not collected while it may still be changed by a lost request.
33. **No temporary ids** (E9). A domain list holds only records the server returned. A pending create is a memory draft
    the view shows apart from the answer; membership appears when an answer's refetch holds its key.
34. **The lane key of a domain write** (E10, as corrected in 9.4.3). A write that predicts exactly one record and
    declares no `key` has that record's key as its lane key. `flow check` warns when a declared key is not that
    projection. Other writes keep their declared key or `{}`.
35. **Overflow is an ending** (E11). A start that would exceed its actor queue or any record queue ends
    `NotSent { why: "Overloaded" }`, with no prediction and no queue join; the transition and its other actions run.
36. **Callback reads** (E12, amends rule 22). `optimistic` reads the starting turn's after memory, captured at start.
    `writes` receives `{ value, input }` and reads no memory. Domain operations have no `optimistic`; their `writes`
    may only invalidate (9.5.1).
37. **Reads carry confirmed data** (E15). A resource call value's `success:` sees confirmed data only. A read's defect
    or interruption ends on `failure` as `Defect` or `Interrupted`; a tag record must map them (9.5.2).
38. **Lanes and predicted keys persist together** (E14). A persisted actor's lane, its Attempt and that Attempt's
    predicted keys are written in one capture, the Persistence O6 acknowledgement before invocation.

## 5. How it is implemented

One runtime: the store and the actors already share the Runtime (EDP:6); nothing here adds a second execution path,
and `check()` still runs steps 2–6 and publishes nothing (MD:635-636), so it never predicts.

- **Start** (step 6). After step 5 computes the input and key, a domain write runs `.predicts` with the real input
  (ED:339), checks every record queue's bound, and either declines (`Overloaded`, `Rejected`) or joins all its queues
  at once. The store revision and the actor's snapshot publish as one cut. A persisted actor captures the lane, the
  Attempt and the predicted keys in one record and waits for the acknowledgement before invocation (rule 38).
- **Send.** A write is invoked when it heads every queue it joined. A retry joins like a start, without a prediction,
  and keeps its first send's position.
- **Settlement.** The watcher fiber that merge 2's spike uses (`{ lane, outstanding, sendEnding }`, merge 2
  proposal section 5) classifies the send, applies rule 18 from the Attempt's send history (kept with the Attempt),
  calls the store with the Attempt's ending, which publishes and releases queues, and only then queues the ending in
  the mailbox. Routing stays in `admitEnding`.
- **Admission** is unchanged: map, test the owner, update the lane.
- **Restore.** Predicted keys come back with their Attempt; the store marks them uncertain and forces their repair
  before readiness, and the ending (`Restored`) is routed by rule 14 after readiness (MD:1327).

## 6. Changes

### 6.1 Added

| Added | Kind | Meaning |
| --- | --- | --- |
| Rules 26–38 | design rules | section 4 |
| `NotSent { why: "Overloaded" }` | Flow failure reason | a start past an actor or record queue bound (rule 35) |
| The record read `predicted` | name | replaces the record's `pending` (E16) |
| `uncertain` per record and Attempt | store semantics | what a retry's success clears (rule 32) |
| A `flow check` warning | tooling | a domain write's declared `key` is not its predicted record's key (rule 34) |
| A `flow check` requirement | tooling | `Defect` and `Interrupted` in a read call value's tag record (rule 37) |
| Store effects in `flow check` and `flow graph` (proposed, 9.6.2) | tooling | the commit node shows its domain entry's recorded `.predicts` entity and fields and `.alsoChanges` targets (A-L2) |

### 6.2 Changed

| Changed | Before | Now |
| --- | --- | --- |
| Who predicts a domain write | memory (LIST:117-128) or the domain (EDP:52-61) | the domain only (rule 26) |
| When store effects apply | "publish together before its event" (OPS:101) | at settlement, before the ending is queued (rule 27) |
| When rule 18 runs | at admission (MD:655) | at settlement; admission maps it |
| When a start's prediction shows | "on start" (OPS:82), after the turn publishes (MD:729-730) | in the starting turn's publication (rule 28) |
| `latest`'s waiting start | invoked at settlement (MD:1322) | joins the record queue; sent when it heads it (rule 29) |
| A queued cancel | "settles interrupted" (ED:650-651) | `NotSent { why: "Cancelled" }`, no repair |
| Retry of a domain write | `O.x.retry(select)` (EDP:107-108, OPS:113) | `pay.retry(key)`, identical request, no prediction, record queue (rule 31) |
| Clearing `uncertain` | "a later write … succeeds or the machine reconciles" (EDP:105-106) | a later write's success, or a retry's success (rule 32) |
| A definite failure after an unknown send | the failure row (MD:870) by channel | unknown in the store (rule 30) |
| Queue overflow | rejects the whole batch (OPS:96-97); the whole write (EDP:180-182) | `NotSent { why: "Overloaded" }` for that write (rule 35) |
| `optimistic` and `writes` reads | after memory (MD:583; C15, MD:2147), open (MD:2240-2243) | rule 36 |
| Domain write lane key | `{}` when omitted (D7, MD:2400) | the predicted record's key (rule 34) |
| The list rewrite | rows in memory with temporary ids (LIST) | section 3.1 |

### 6.3 Removed

| Removed | Was | Why |
| --- | --- | --- |
| `O.x.retry(select)` and "a known-settled attempt settles without calling the adapter" | EDP:107-109, OPS:113-117 | `pay.retry(key)`; a succeeded lane has no addressable Attempt (rule 21) |
| `InvalidAttempt` | OPS:115-116 | no Attempt argument exists |
| "rejects the whole action batch with AdmissionOverloaded" | OPS:96-97 | rule 35 |
| Memory rows, temporary ids, `pendingTitle`, `deleted`, `like.desired`/`confirmed` | LIST:8-19 | rules 26, 33 |
| The record read's `pending` | EDP:130 | `predicted` (E16) |

### 6.4 Amendments by target

The `.plan` files change only when this proposal is accepted (D14).

**`machine-design.md`**

| Where | Amendment |
| --- | --- |
| 2.4 | add rules 26–38 |
| Rule 16 (MD:525-534) | the declines list gains `Overloaded` (rule 35) |
| Rule 18 (MD:536-538) | "decided at settlement, from the Attempt's send history" |
| Rule 21 (MD:551-563) | a domain write's key defaults per rule 34; the lane does not hold store state. Revision (multiplicity audit, 2026-10-31): the design's rule 21 now reads lanes as `s.calls` rows and decides per-call members by concurrency (D18–D20); rules 31 and 32 follow it (E17, E18) |
| Rule 22 (MD:579-585) | callback rows per rule 36; closes open item 10 |
| 2.5 step 1 (MD:655-658) | rule 18 is already applied; admission maps |
| 2.5 step 6 (MD:729-730) | domain starts join queues and predict in the turn's publication (rule 28) |
| 2.7.1 cache table (MD:865-876) | the domain column follows section 3.5's table; the sentence "How domains meet the rest of this section is open" goes |
| 2.7.2 table (MD:888-907) | rows for the store: prediction, record queue, `uncertain`, `predicted` (section 2) |
| 2.7.8 (MD:1210-1243) | `latest` with a predicting write (rule 29); the like example becomes section 3.1's |
| 2.7.9 (MD:1252-1254) | rule 37 |
| 2.7.12 (MD:1314-1327) | settlement row: "store effects applied and queues released; rule 18 applied; under `latest` the waiting start is invoked when it heads its record queues (domain) or now (plain)" |
| C4 (MD:2136) | by the Attempt's ending, not the channel (rule 30) |
| C10 (MD:2142) | `latest` and the record queue; `Overloaded` |
| C15 (MD:2147) | rule 36 |
| C17 (MD:2149) | one capture with predicted keys (rule 38) |
| Section 7 (MD:2240-2243, MD:2253-2255) | items 10 and 14 closed by this proposal; item 16 unchanged |

**`Operations.plan`**

| Where | Amendment |
| --- | --- |
| O1 (OPS:26) | concurrency gains `latest` (already C10) |
| O2 (OPS:64-75) | a resource call value's `success:` sees confirmed data; `Defect`/`Interrupted` on `failure` (rule 37) |
| O3 (OPS:81-84) | callback reads per rule 36 |
| O3 (OPS:92-97) | `reject` per rule 16; overflow per rule 35 |
| O3 (OPS:101) | "Its store effects publish at settlement, before its ending is queued" (rule 27) |
| O3 (OPS:113-117) | `O.x.retry(select)` replaced by `pay.retry(key)` (already C7); the known-settled sentence and `InvalidAttempt` removed |
| O5 (OPS:153), O6 (OPS:166) | the lane field "true for live optimistic values or predictions" is renamed `predicted` (if 9.5.3 is accepted) |

**`EntityDomains.plan`**

| Where | Amendment |
| --- | --- |
| O1 (EDP:100-102) | (already C4) failure removes predictions without repair; defect is unknown |
| O1 (EDP:105-109) | rule 32 for clearing; rule 31 for retry; "unknown delivers an Attempt; O.x.retry(select) reissues…" replaced by "unknown reaches the machine through the commit value's `outcomes`; `pay.retry(key)` re-sends the identical request" |
| O1 (EDP:112-116) | rule 29: actor concurrency includes `latest`; a superseded or cancelled queued write ends `NotSent` without repair |
| O1 (EDP:118-119) | rule 33's draft pattern named |
| O1 (EDP:130) | `{ data, predicted, uncertain, unconfirmed }` |
| O1 (new sentence) | rule 34's default lane key |
| O2 (EDP:138) | `Entity.queue` states include removals with their `NotSent` reason |
| O5 (EDP:179-182) | overflow ends that write `NotSent { why: "Overloaded" }`, no partial join |

**`Persistence.plan`**

| Where | Amendment |
| --- | --- |
| O6 (PER:123-127) | the acknowledgement captures the lane and the Attempt's predicted keys with it (rule 38) |
| O6 (PER:133) | "Explicit retry(attempt) and known-settled behavior" becomes "`pay.retry(key)` (Operations O3)" |

**Inspection** (through ED section 7's evidence table, ED:911-912): `queue` events gain `superseded`, `cancelled`
and `overloaded` removals; `uncertain` "ended (later write or reconciliation)" becomes "ended (a later write
succeeded, or a retry of the Attempt succeeded)".

## 7. Coverage

| Finding | Answer |
| --- | --- |
| A-H1 two owners | E1, rule 26, 3.1, 3.2 |
| A-H2 two retry shapes | E2, rule 31, 3.5 |
| A-H3 concurrency collides | E5, E6, rules 16 and 29, 3.4 |
| A-M1 three spellings of one id | E10 (corrected), rule 34, 3.7; the `.each` part is 9.6.3 |
| A-M2 temporary-id create | E9, rule 33, 3.6 |
| A-M3 pending and uncertain in two stores | section 2; E16 |
| A-M4 domain consumes the classified ending | E8, rule 30 |
| A-L1 `.each` rows restate `{ id: key }` | open, 9.6.3 |
| A-L2 `flow check` does not see entity effects | proposed, 9.6.2 |
| A-L3 `idle`/`pending` versus record `pending` | E16, 3.11 |
| F-H1 settlement versus admission | E4, rules 27 and 28, 3.3 |
| F-H2 retry versus predictions | E7, rule 31, 3.5 |
| F-H3 queue release versus `latest` | E5, rule 29, 3.4 |
| F-H4 callback reads circular or vague | E12, rule 36, 3.8 |
| F-M1 cache keyed by channel | E8, rule 30 |
| F-M2 what clears `uncertain` | E3, rule 32 |
| F-M3 `NotSent` reasons against predictions | 3.4's table |
| F-M4 one thing shown twice | E9, rule 33 |
| F-M5 late store effects, `LikeSynced` | E13, rule 27; the domain path has no memory copy to overwrite |
| F-M6 `AdmissionOverloaded` rejects the batch | E11, rule 35 |
| F-M7 lanes and predicted keys restore separately | E14, rule 38 |
| F-L1 resource call values | E15, rule 37 |
| F-L2 rule 22 decided while open | E12, rule 36 |

## 8. Alternatives considered

- **Memory as an equal owner** (LIST as written). Two truths for one record, and no rule says which a view reads
  (A-H1). Rejected for rule 26.
- **Store effects at admission.** One actor's mailbox would gate every screen's view of a shared record, and a
  disposed actor's write would never confirm. Rejected for rule 27.
- **The lane changes at settlement.** `pending` false before the ending is handled let a timeout say "not charged"
  for a charge that landed (merged/server-calls/proposal.md:23-24). Rejected; merge 2 already rejected it.
- **Retry with a fresh `basedOn`** (REV:44-45). Changes the request under the same idempotency key. Rejected for 3.5.
- **Retry re-applies the prediction.** Shows a value the forced repair just contradicted. Rejected.
- **Retry's response by its own position.** Overwrites a newer confirmed write whenever the server replays a stored
  response. The first-send position plus the existing contest rule is right in both server behaviours. Rejected.
- **`latest` bypasses the record queue** (MD:1322 as written). Sends over an unrepaired uncertain record (F-H3).
  Rejected.
- **Temporary ids with re-keying** (TanStack DB's model). EDP C1 forbids instant inserts (EDP:189-192). Rejected.
- **A read clears `uncertain`.** It cannot prove the lost request will not still run (ED:656-658). Rejected.
- **Overflow rejects the batch** (OPS:96-97). Breaks rule 16: a lane must not refuse a transition's other effects.
  Rejected.
- **Rename the lane's `pending`** instead of the record's. The lane name is in rules 16, 21, D5, D6 and every rewrite;
  the record's is in one plan line and its design. Rejected.
- **Key from `.one(Entity)`** (E10 as proposed). Not available at start (3.7). Replaced by the predicted record key.

## 9. Open questions

Every decision E1–E16 is **proposed, unconfirmed**. They are grouped in rounds of about three, in dependency order.
Each gives the before, the after and a recommendation. Corrections found while checking are marked
**Correction**; additions not in E1–E16 are marked **Found**.

### Round 1: ownership and timing

1.1 **E1 Ownership** (A-H1). *Before:* a write about an entity may be predicted in memory or by the domain. *After:*
the domain owns shared data, the commit value owns workflow, memory never mirrors entity data. *Recommendation:*
confirm; it is EDP's goal sentence (EDP:6-7) applied to the merged commit value.

1.2 **E4 Timing** (F-H1). *Before:* store effects "before its event" (OPS:101). *After:* at settlement; the lane at
admission. **Found:** rule 18 must then be decided at settlement (MD:655), and a start's prediction should publish
with its turn (rule 28). *Recommendation:* confirm E4 with both additions.

1.3 **E13 Store effects never depend on routing** (F-M5). *Before:* unstated. *After:* rule 27's last sentence.
*Recommendation:* confirm; no `flow check` hint for plain-operation memory mirrors, which the checker cannot tell
from workflow memory.

### Round 2: concurrency

2.1 **E5 The record queue wins** (F-H3, A-H3). *Before:* `latest` invokes its waiting start at settlement (MD:1322).
*After:* the waiting start joins the record queue; superseding it is a removal without repair. **Correction:**
"`cancel` of an invoked predicting write stays a `flow check` error" conflates two things. EDP's error is
`concurrency: "cancel"` (EDP:112-113, ED:645-646). Whether a `.cancel(key)` action reaches an invoked or a queued
write is runtime data, so it cannot be a check. *Recommendation:* keep `concurrency: "cancel"` an error; allow
`.cancel(key)` on a predicting write with rule 24 (queued: `NotSent Cancelled`, no repair; invoked: unknown
`Cancelled`, forced repair, uncertain), because the hard abort of 2.7.6 needs it.

2.2 **E6 `reject` is an ending** (A-H3, F-M3). *Before:* "declines … without work or outcome" (OPS:92-93). *After:*
rule 16; a Rejected start never predicts. *Recommendation:* confirm; it is D5.

2.3 **E11 Overflow is an ending** (F-M6). *Before:* the batch (OPS:96-97) or the write (EDP:180-182) is rejected.
*After:* `NotSent { why: "Overloaded" }`. *Recommendation:* confirm, with the name `Overloaded` beside `Rejected`.
`InvalidKey` from a failing key select stays a turn rejection (`InvalidTurn`, MD:584-585): it is a programmer error,
not load.

### Round 3: retry and uncertain

3.1 **E2 One retry shape** (A-H2). *Before:* `O.x.retry(select)` (OPS:113, EDP:107-108). *After:* `pay.retry(key)`;
known-settled and `InvalidAttempt` go. *Recommendation:* confirm. `orphaned`'s `retry(attempt)` (MD:2262-2262) stays
open item 16.

3.2 **E7 A retry is the same request** (F-H2). *Before:* unspecified. *After:* same input and `basedOn`, no
prediction, first-send position. **Found:** it must join the record queue (ED:639), and its losing-but-differing
fields are contested (EDP:66-69), which covers a server that applies the retry fresh. *Recommendation:* confirm with
both.

3.3 **E3 What clears `uncertain`** (F-M2). *Before:* "a later write … succeeds or the machine reconciles" (EDP:105-106).
*After:* a later write's success, or a retry's success; never a read. **Found:** with two unknown Attempts on one
record, a retry's success must clear only its own mark, so marks are per record and Attempt. *Recommendation:*
confirm with per-Attempt marks. Note the residue the plan already accepts: a later write's success does not prove an
older lost request will not still land; `basedOn` checked by the server is the only protection (ED:664-666).

### Round 4: store endings, creates, keys

4.1 **E8 The store follows the Attempt's ending** (F-M1, A-M4). *Before:* by channel (MD:865-871). *After:* after rule
18. *Recommendation:* confirm. Refinement: "keeps predictions" applies only to predictions still live, which exist
only if the retry was sent before the first forced repair landed.

4.2 **E9 No temporary ids** (A-M2, F-M4). *Before:* LIST's temp-id rows. *After:* `creating` drafts. *Recommendation:*
confirm. The cost: a draft cannot be renamed while it sends (LIST:152, LIST:172-178 could).

4.3 **E10 Keys** (A-M1). **Correction:** `.one(Entity)` on a write names where the record is in the response (ED:247,
EDX:96-97), unknown at start, when the lane key is computed (MD:1319). *Recommendation:* default the lane key to the
recorded key of `.predicts` when it predicts exactly one record (ED:338); creates and multi-record writes declare
their key or use `{}`; `flow check` warns when a declared key differs from the predicted record's key. Because
operation modules never import entities (EDP:18-19), the default is supplied at registration, by the domain.

### Round 5: callbacks, reads, names

5.1 **E12 Rule 22 for callbacks** (F-H4, F-L2). *After:* `optimistic` reads the starting turn's after memory,
captured; `writes` reads `{ value, input }` only. **Correction:** "Domain operations have neither" contradicts
ED:297-299 and EDP:60-61, which keep `writes` on domain operations for `invalidate` only. *Recommendation:* domain
operations have no `optimistic`, and their `writes` may only invalidate, with the same `{ value, input }` view.

5.2 **E15 Reads carry confirmed data** (F-L1). **Correction:** "optional to map" lets an unmapped `Defect` leave a
waiting state with no event, the silent decline D5 removed for writes (spike P5, MD:2394). *Recommendation:* with a single
`failure:` event they arrive there; in a tag record they are optional in the type and required by `flow check`, as
`NotSent` is where it can occur (rule 20). A read can always defect, so in practice they are always required.

5.3 **E16 `pending` becomes `predicted` on the record** (A-M3, A-L3). **Correction:** it misses the resource and answer
lane's `pending`, "true for live optimistic values or predictions" (OPS:153, OPS:166, ED:703-704), which means
what the record's means. *Recommendation:* rename both to `predicted`, so `pending` is only ever the commit value's
lane.

### Round 6: persistence, lifetime, tooling

6.1 **E14 One capture** (F-M7). *After:* rule 38. *Recommendation:* confirm; it costs no extra write, since the
acknowledgement already exists (PER:123-127).

6.2 **Found: entity effects in `flow check`** (A-L2). *Before:* `flow check` sees event → commit → ending → handler.
*After:* the commit node also lists its domain entry's recorded effects (`.predicts` entity and fields, `.alsoChanges`
targets), already recorded at construction (ED:338). *Recommendation:* add it as a CommandLine O5 display; no new
analysis.

6.3 **Found: `.each` keys versus record keys** (A-L1). `.each` keys are strings (rule 9, MD:445), record keys are
records. *Recommendation:* leave to section 7 item 0, "Collections, after `.each`" (MD:2214-2217); rule 34 removes
the transaction side of the remap.

6.4 **Open: unknown lanes live until success** (D11, MD:2416-2420). A lane holding an unknown Attempt is kept for
`retry`, so a never-retried unknown lane lives as long as the actor, and persists with it. *Recommendation:* keep D11
(correctness: evicting it would turn a later reconcile into `NothingToResend`); a new write on the lane replaces it
(rule 21), so the growth is one lane per key the user touched and abandoned. Add held unknown lanes to actor
evidence, so a leak is visible, rather than a bound that would silently drop one.

## 10. Decisions

Settled by the owner on 2026-10-30: the whole proposal is accepted as written, including every recommendation in
section 9. In short:

- **E1** One split: the domain owns shared data, the commit value owns workflow; memory never mirrors a record (rule 26).
- **E2, E7** One retry shape, `x.retry(key)`: the identical request, no new prediction, joins the record queue,
  positioned at the first send (rule 31). *Superseded in part by E17 (2026-10-31): `x.retry(key)` exists only where
  the lane has one addressable Attempt.*
- **E3** `uncertain` is per record and Attempt; a successful retry or a later successful write clears it; a read never
  does (rule 32).
- **E4, E13** The store applies endings at settlement (rule 18 decided there); the lane changes at admission; routing
  never changes store effects (rule 27). A start publishes its prediction with its turn (rule 28).
- **E5, as corrected** The actor decides whether a start runs, the record queue when it is sent; `latest` joins the
  queue and supersedes by removal; `concurrency: "cancel"` on a predicting write stays a `flow check` error, while the
  `.cancel(key)` action is allowed under rule 24 (rule 29).
- **E6** `reject` is an ending; a Rejected start applies nothing (rules 16, 28).
- **E8** The store follows the Attempt's ending after `StillUnknown` (rule 30).
- **E9** No temporary ids; pending creates are memory drafts (rule 33).
- **E10, as corrected** A write predicting one record uses that record's key as its lane key; `flow check` warns on a
  different declared key (rule 34).
- **E11** Queue overflow ends `NotSent { why: "Overloaded" }` for that write only (rule 35).
- **E12, as corrected** `optimistic` reads the starting turn's after memory, captured; `writes` reads `{ value, input }`
  only; domain operations keep `writes` for `invalidate` only (rule 36).
- **E14** A lane, its Attempt and its predicted keys persist in one capture (rule 38).
- **E15, as corrected** Read call values carry confirmed data; `Defect` and `Interrupted` arrive on `failure` and must be
  mapped (rule 37).
- **E16, as corrected** The record read and the resource/answer lane read rename `pending` to `predicted`.
- **Lane lifetime** Lanes holding an unknown Attempt are kept (D11), with evidence added so they are visible.
- **E17 (Revision (multiplicity audit, 2026-10-31); supersedes part of E2, E7).** `x.retry(key)` addresses the lane's one addressable Attempt, so
  it exists only under `reject`, `latest` and `cancel` (design rule N2, D20); a domain write retried under several
  concurrent calls takes a per-call key and `reject`. The list's `createIssue` is `reject` per draft (3.1). Reason:
  under `allow` the lane's "current" Attempt was the newest create, so a retry re-sent the wrong draft's write
  ([audit-multiplicity.md](../../../../../archive/flow-design-2026-11/machine-fragments/audit-multiplicity.md) F1). Views and guards read lanes as `s.calls` rows (design D18);
  the `NotSent` mapper's `laneKey` names the draft (design D21), so `CreateFailed.draftId` is never `null`.
- **E18 (Revision (multiplicity audit, 2026-10-31); new).** A prediction over a record the store does not hold shows nothing and waits for a base;
  an uncertain mark holds its record (rules 30, 32). Reason: a patch replayed over a deleted or never-loaded record had
  no defined result, and a collected record lost its mark (audit F12). Merge 5's replay rule needs the matching
  sentence (audit section 4).

Not caused by server calls, and recorded only to correct merge 2's example: E1's "memory never mirrors a record" and E9
were already required by EntityDomains (D1, O1).

## New keywords

| Keyword | Meaning |
| --- | --- |
| `predicted` | the record read field (and, if 9.5.3 is accepted, the lane field) for "a live prediction shows here"; replaces `pending` there |
| `NotSent { why: "Overloaded" }` | a start past an actor or record queue bound |
| `creating` (convention, not API) | the memory list of drafts for pending creates (rule 33) |
| record queue | the store's per-record FIFO of predicting writes across actors (EDP:112-116), now also holding retries |
| uncertain mark | per record and Attempt; the record reads `uncertain` while any remains (rule 32) |
