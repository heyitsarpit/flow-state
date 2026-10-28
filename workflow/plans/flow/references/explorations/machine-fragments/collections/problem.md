# Dynamic collections: the problem

Status: problem statement, no solution chosen. Proposal v4 marks `.list` open (rule 9, section 7);
this folder designs the answer from requirements and prior art. Evaluated against
[principles.md](../principles.md).

## 1. The problem in one sentence

A machine sometimes needs **a changing number of copies of the same behaviour**: each copy with its
own state, timers and rules, all composed into **one actor** and changing in **one turn** with it.

A trait is one fixed piece, placed once under a fixed name. Reusing a trait a fixed number of times
already works (`code`, `resendCooldown`, `unlock` are three placements). What does not work is a
count known only at run time: rows added and removed while the screen is open.

## 2. Cases that need it

Each case is a reason, not a design. A solution must handle all of them, or say why one is out of
scope.

| # | Case | What each copy has | Why it is not just data |
| --- | --- | --- | --- |
| C1 | **Invite rows**: 0–5 email fields; each validates as typed and checks "already registered" with the server 400 ms after typing stops | a value, an error, a debounce timer | the per-row debounce is a timer per copy |
| C2 | **Issue table**: each row can be pinned optimistically; a failed pin reverts that row and flashes a message for 3 s | an in-flight flag, a flash timer | the per-row flash is a timer per copy; the in-flight flag is server state |
| C3 | **Two-factor challenges**: strikes and a 5-minute lockout per challenge, surviving Back | a strike count, a lockout timer | the per-challenge lockout is a timer per copy |
| C4 | **Toast stack**: each toast dismisses itself after 4 s, pauses while hovered | a hovered flag, a dismiss timer that can pause | per-copy timers with per-copy state |
| C5 | **Inline editors in a list**: any row can be opened for editing, with a draft and autosave after 2 s | a mode (viewing / editing), a draft, a debounce | per-copy modes and timers |
| C6 | **Plain data rows**: tags, line items with quantity and price | values and rules only | (control case) no behaviour per copy |

C6 is included so a solution does not force behaviour machinery onto plain data.

## 3. Requirements

| # | Requirement |
| --- | --- |
| R1 | **Changing count.** Copies are added and removed while the actor runs; the count may be bounded. |
| R2 | **Reuse.** A copy's behaviour is written once (a trait, or something like it) and reused for every copy and in other machines. |
| R3 | **Own state and timers per copy**, with the same lifecycle guarantees traits have: fresh on creation, timers stop on removal (L1, L3). |
| R4 | **Stable identity.** Events, results and timer firings reach the copy they were meant for, even after other copies are removed or the same id is added again (L2, L8, E5). |
| R5 | **The host controls membership**, and can apply its own policy to adding and removing (H1, H2). |
| R6 | **Reading.** Views and the host read every copy's readable memory directly, in order, with no copies of copies (D1). |
| R7 | **Addressing.** The UI and the host can send to one copy; the copy can report to the host which copy it is. |
| R8 | **Shared rules for plain data** (C6) stay plain: no per-copy machinery when nothing per copy runs. |
| R9 | **Familiar.** Ideally it reads like a keyed list in UI code (`items.map(item => …key={item.id}…)`). |

## 4. What must not break

These are fixed by the plans. A solution that needs one changed must argue it separately.

| # | Constraint | Source |
| --- | --- | --- |
| K1 | **One actor, one mailbox, one turn.** Copies change in the same atomic turn as their host; a refusal anywhere refuses the whole turn. | Machines O3, v4 §2.5 |
| K2 | **Static analysis and a single graph.** `flow graph` and `flow check` see the whole actor, copies included, as one graph known before run time. A collection must be analysable as a declared shape, not discovered at run time. | FlowState D1, CommandLine |
| K3 | **No machine-spawned child actors.** The set of machines is closed; a machine does not create actors. | Runtime O1, Package O3 |
| K4 | **One active leaf state per actor.** Copies cannot each be in a different host state; their own phases must fit this rule. | Machines O2 |
| K5 | **Definition / machine split.** Structure (what exists, its types) is in the definition; behaviour (fillings, handlers) is in the machine. | Machines O1 |
| K6 | **Typed end to end.** `S`, `E`, memory and view types stay exact, without casts. | Package O3 |
| K7 | **Deterministic Stories, persistence and hydration.** Ids, creation order and timers are reproducible; copies restore and hydrate with their actor. | Testing O2, Persistence, ServerRendering |
| K8 | **Fragments do no I/O.** Per-copy server work is the host's commit, attributed to its copy. | v4 rule 3, P1–P4 |
| K9 | **Locality.** A property of a thing is written on that thing. | principles 11 |

## 5. Out of scope

- Collections of **actors** (each copy its own actor and mailbox): already expressible with refs
  created by the UI, and a different composition model. Considered only as a contrast.
- Unbounded performance at scale (thousands of copies with timers): note costs, don't optimise.

## 6. The current draft and why it is open

v4's `.list` (rule 9) places keyed instances of a trait: `Field(…).list({ max, key?, owner? })`,
with built-in `Add` / `Remove` events, minted or author-chosen keys, `E.list.key(k)` addressing,
`s.memory.list` as an ordered array, and **incarnations** so a late result never reaches a re-added
key. It met R1–R7 on paper, but:

- it was hard to explain (three explanations failed): minted-key strings, `owner`,
  `canAdd` / `canRemove`, incarnations all surfaced as API;
- `owner: "host"` leaked an internal sender rule as a configuration flag;
- each piece was added to patch a review finding, not from a model.

Rejected so far: **one actor per item** (breaks K1 and K3), and **plain arrays as the general answer**
(meets R8 only; fails R3 for C1–C5).

## 7. How solutions will be judged

1. Correctness: R3, R4 and the yardstick problems hold by construction.
2. K1–K9 hold without plan changes, or each change is argued.
3. Readability: the five cases read clearly, and the UI side looks like a keyed list.
4. Fewest new concepts; C6 needs none.
5. Prior art: the closer to an established model, the better.
