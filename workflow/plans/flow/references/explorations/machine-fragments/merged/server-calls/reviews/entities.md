# Review: merge 2 against entity domains (2026-10-30)

Two independent read-only reviews (Sonnet): data flow and cache consistency, and API coherence and ownership.
Sources: `EntityDomains.plan` (EDP), `references/design/entity-domain.md`, `entities.md`, `entity-domain-examples.md`,
`Operations.plan` (OPS), `merge-1-outcomes.md` (M1). Findings marked **verified** were checked against the source by the
main session.

**The main fact (verified):** merge 2 never mentions entity domains. Its rewrites keep rows, predictions and rollback
in machine memory (`rewrites/list.ts`). EDP replaces call-site `optimistic` and `setData` with `predicts` (EDP:60, 186),
forbids temporary ids and optimistic inserts (EDP:119), and still spells retry `O.x.retry(select)` (EDP:108, OPS:113).
So a write about an entity has two possible owners, and nothing keeps the two paths consistent.

## Ownership and API

- **A-H1 Two owners for a write about an entity.** Renaming an issue is about 22 lines and 5 concepts in `list.ts`
  (select, outcomes, mapped events, memory prediction, hand rollback) against about 3 lines of `predicts` in the domain
  plus about 6 in the machine. Without a stated canonical path an author writes both and shows two truths. Smallest
  move: for a domain-registered operation, the commit value carries no memory prediction; memory holds workflow only
  (toast, draft, selection). **Owner decision**, then a paragraph in merge 2.
- **A-H2 Two retry shapes** (verified): `O.x.retry(select)` on an Attempt (OPS:113, EDP:108) versus merge 2's
  `pay.retry(key)` on a hidden lane Attempt. EDP's "uncertain until the machine reconciles the Attempt" has no merge 2
  spelling. Move: rewrite OPS/EDP retry to merge 2's shape; add the amendment to merge 2's 6.5.
- **A-H3 Concurrency collides.** Merge 2's `latest` and its `reject`-as-ending versus OPS O3 `reject` "without work or
  outcome" and EDP's `cancel` on a predicting write being a `flow check` error. Unanswered: what a superseded waiting
  start does to its prediction and to the record queue. Needs an owner decision on `reject`.
- A-M1 Three spellings of one id: entity primary key (record), transaction `key(input)` (record), `.each` key (string);
  authors remap by hand at each seam. Move: check a domain transaction's `key` against the primary-key projection.
- A-M2 `list.ts`'s temporary-id create contradicts EDP's "no temporary ids". Decide whether `Created` is the one seam
  between machine-held pending creates and the store.
- A-M3 Pending and uncertain live in two stores: the lane (`pay.pending`, clears at admission) and the record
  (`pending`, `uncertain`, which outlasts it). Name them apart and document "lane = this actor's call; record = shared
  truth".
- A-M4 `StillUnknown` remaps a definite failure to `unknown` (rule 6); the domain must consume the classified ending,
  not the mapped event.
- A-L1 `.each` rows restate `{ id: key }` in every callback. A-L2 `flow check` sees event → commit → ending → handler
  but not the entity effects. A-L3 Naming: `idle`/`pending` versus record `pending`.

## Data flow and cache consistency

- **F-H1 Settlement versus admission** (verified: OPS:101 "publish together before its event"). The store may confirm
  or roll back a record at settlement while the machine's lane and event change only at admission, so a view can show
  confirmed data with "Saving…", or the reverse. State when store effects publish relative to admission.
- **F-H2 Retrying the same Attempt versus predictions.** Unspecified whether a retry re-applies the prediction, whether
  its late response can overwrite a newer confirmed unversioned field, and which `basedOn` it sends (a stale one gives
  412 → `StillUnknown` → a loop to the retry cap). Direction: a retry is settle-only and sends a fresh `basedOn`.
- **F-H3 Queue release versus `latest`/`serialize`** (verified: EDP:115 "An uncertain write releases the next only after
  its forced repair settles"). Merge 2 invokes the waiting `latest` start at settlement, over an unrepaired record.
  Reconcile; the record queue should win.
- **F-H4 Rule 10 for `writes` and `optimistic` is circular or vague.** `writes` runs at success before the outcome event
  (OPS:83), so "after" memory of the ending's turn depends on the cache it writes; `optimistic` on a queued start applies
  later than its starting turn. Direction: `optimistic` reads the starting turn's after memory, captured; `writes` reads
  only `{ value, input }`. (Merge 2 open question 5.)
- F-M1 Merge 1's cache table is keyed by channel, but rule 6 changes the channel; the store should follow the Attempt's
  ending, not the send.
- F-M2 Reconciling by a read (`read.fetch`) never clears a record's `uncertain`. Define what clears it.
- F-M3 Each `NotSent` reason against prediction state needs one table (`Rejected`: no prediction; `Superseded`: a queued
  prediction removed without repair; `Cancelled`, `Restored` match EDP).
- F-M4 Temporary-id rows in memory and the record installed under its real id show one thing twice. Pick one source of
  list rows.
- F-M5 Store effects apply late (OPS:83) but rule 2 doesn't say so; `list.ts`'s `LikeSynced` lacks a `superseded`
  check, so a superseded success overwrites memory. Add a `flow check` hint.
- F-M6 `AdmissionOverloaded` (OPS:97, verified) rejects the action batch, against rule 4's "declines are endings; Flow
  adds no guard". Map it to an ending or name it as the exception.
- F-M7 Lanes and EDP's predicted keys both persist with one Attempt; nothing says they restore atomically. (Open
  question 6.)
- F-L1 Resource call values (3.12) must carry confirmed data only, and say what an unmapped defect or interrupt does.
- F-L2 Rule 10 states the callback view as decided while open question 5 leaves `writes`/`optimistic` open.

## What this means

Merge 2 is consistent as an in-machine design, but it was written without entity domains. Before it merges, the
owner needs to decide who owns a write about an entity (A-H1), and merge 2 needs an "entity domains" section answering
F-H1, F-H2, F-H3, A-H2 and A-H3, plus amendment rows for OPS O3 and EDP.
