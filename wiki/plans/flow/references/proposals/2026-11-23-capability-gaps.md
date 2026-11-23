---
proposal capability-gaps
status proposed 2026-11-23
description Researches what Flow v3 still cannot build (gesture-rate, DOM-owned, multi-writer, huge-data apps); nothing decided.
---
# Capability gaps: what Flow State v3 still cannot build (proposed research)

**Bottom line:** once every Plan is built, Flow will build server-backed, state-heavy React and Next.js apps (shops,
chats, boards, document savers, wizards, media-room controllers) and the state half of UI primitives, but not apps
whose core is (1) frame-rate gesture or render-loop state (canvas editors, drag-heavy boards, games), (2) state the DOM
owns (focus, measurement, caret, media elements, exit animations), (3) multi-writer merge or a local-first query
engine (CRDT editors, Replicache- or Zero-style apps), (4) huge windowed datasets (grids, 100k-row lists) or
(5) non-React and non-browser targets. Classes 1, 3 and 5 are deliberate and cited non-goals; 2 and 4 are done by
pairing Flow with a view library. Four spots look like Plan or convention omissions, not non-goals: DOM-measured and
animation-end values entering a machine, user-level undo and redo, function-valued options, and the unmeasured cost
of publishing a 30 to 60 Hz source through React.

**Status:** proposed research. Nothing here is decided, and no Plan, Spec, Task or code was changed. Claims cite a
Plan, Spec, convention, code or exclusion; "unconfirmed" marks what could not be verified. Web sources are GitHub
default-branch files and docs read on 2026-11-23, so line numbers may drift. Link names in `[brackets]` are
resolved in the Sources list at the end.

**Read first:** `wiki/plans/flow/FlowState.plan` (C2), `wiki/tasks/V3/epic.task` (Scope), `wiki/conventions/`.

## Method and limits

- Part 1 is rebuilt from the deleted `ui-primitives*` proposals (full text at commit `3a84b878`, see
  `wiki/conventions/README.md`), Task @task.V3.T71 (done) and the built fixtures.
- Only two ui-sdk fixtures exist: `fixtures/command-palette/` and `fixtures/number-input/`. The toaster, menu,
  combobox, tree and token input (@task.V3.T72, `T73`, `T129`, `T130`) are not built, so their gaps come from the
  proposals' sketches and decisions, not from code that had to fake something.
- Linear's sync engine is closed source, so it is judged only through Replicache, Zero and tldraw sync (unconfirmed
  for Linear itself).

## Part 1: gaps already found when porting `codebases/ui-sdk`

Paths: `U` is `codebases/ui-sdk/packages/core/src/`, `F` is `packages/flow-state-v3/fixtures/`. "Built" means the
Task is done in `wk`. Sources for each row follow the table.

| Id  | Feature Flow lacked                        | What the port did                  | Now covered by                       |
| --- | ------------------------------------------ | ---------------------------------- | ------------------------------------ |
| G1  | timer that pauses, keeps left              | stamps and `settle` in 10 handlers | `paused`; built, @task.V3.T57        |
| G2  | per-item duration (`key`)                  | a fake single key, soonest         | `key` in `schedule`; built, T57      |
| G3  | raise into every `.each` copy              | unspecified; pause-all unwritable  | Machines O1; @task.V3.T110 draft     |
| G4  | parent options (`props`)                   | `Configure` event, memory copy     | @task.V3.T76 draft, T78 migrates     |
| G5  | one-shot view command                      | `lastCommit.seq` counter           | `emits`; @task.V3.T77, T127 draft    |
| G6  | controlled value                           | case dropped (C25)                 | props plus emit; T76, T77, T30 draft |
| G7  | function-valued option                     | a `scores` table as data           | nothing; see Part 1 notes            |
| G8  | ending sees its starting event             | `CommandFailed` plus catchTag      | `{ input }` mapper; built, fixtures  |
| G9  | gesture state not restored                 | local actor, `Move` event          | convention only, no feature          |
| G10 | reusable primitive over an app action      | factory convention                 | convention; no fragment props        |
| G11 | cross-tab sync, SSR-readable cookie        | left out, deferred                 | nothing; FlowState C2                |
| G12 | DOM, locale, ARIA, timing                  | 8 of 37 cases dropped              | React side, @task.V3.T30, T111       |
| G13 | shared actor mid-gesture, stale level fact | conventions                        | conventions H3, H6 (now emits)       |

### Part 1 sources and notes

- **G1.** ui-sdk keeps remaining time per pause reason: `U components/toast/toast-timers.ts:2-12, 65`. The first
  pass kept `remaining`, `countingSince` and a `settle` call in ten handlers (idiom pass section 2.1, 17 wiring
  lines); decision Q2 added `paused` (Machines.plan:408-, :510). No toaster fixture exists yet (@task.V3.T129).
- **G2.** Toast restart on update, `U components/toast/toast.ts:132`; per-toast `duration`,
  `U components/toast/toast-api.ts:184`. The generality pass rejected the key and used one soonest timer; the idiom
  pass reversed it (`key` reaches `schedule`, `restartOn`, `paused`, `send`). Built by T57.
- **G3.** Generality pass H2: "raise into every copy" had no stated meaning for six unrelated scenarios.
  Merged as Machines.plan:112-; the build is @task.V3.T110 (draft).
- **G4.** ui-sdk hands options over during render with `follow` and `setOptions`:
  `U foundation/kernel/primitive.ts:312-315`; number input options `U components/number-input/number-input.ts:121-151`.
  Fixture: `F number-input/machines/stepper.ts:23,131` (`Configure`, seven mirrored settings) and
  `F command-palette/machines/palette.ts:22,157-161`. Limit that stays: props only on local actors
  (Runtime.plan:110-111; Machines.plan:82); a shared actor is configured by context or input.
- **G5.** ui-sdk reports commits and moves focus through callbacks: `U components/number-input/number-input.ts:106-111`,
  `U components/menu/menu-api.ts:31`. Fixture: `F number-input/machines/stepper.ts:17,44,65-68` keeps
  `lastCommit { seq, value }` only so two equal commits differ. T77 (draft) and T127 (draft) build `emit`.
- **G6.** `U components/command/command.ts:190-198` (value and `onValueChange`); dropped as C25 in T71's mapping
  comment. Route: `wiki/conventions/controlled-values.md`, a prop paired with an emit.
- **G7.** `U components/command/command.ts:238-243` (`filter` may be a scoring function). A function cannot be event
  data, so the fixture sends a table: `F command-palette/machines/commands.ts:45-46` (`Scores`), used at `:135-136`,
  and `F command-palette/machines/palette.ts:22,39`. No Plan or Task covers it. The factory convention
  (`wiki/conventions/reusable-primitives.md`) could carry a function at definition time; whether it fits a
  per-query scorer is unconfirmed. This is the clearest Part 1 item with no owner.
- **G8.** `U components/menu/menu.ts:239` (`onAction`). The palette names the failed command through a tagged error:
  `F command-palette/machines/palette.ts:49`, `F command-palette/operations/writes.ts:19`. Mappers now receive
  `{ input, key }` (Operations.plan:121; `src/event-tokens.ts:49-60`; used at `F chat/machines/thread.ts:59`), so the
  palette has not migrated.
- **G9.** Tree move and resizable drag survive a reload in a persisted machine. Decision Q4 A: frame-rate data in
  refs, milestones in a local actor, one `Move` event (`wiki/conventions/interaction-state.md`). A local actor
  cannot be a send target (Runtime.plan:110), so the view relays the drop.
- **G10.** The first pass asked for operation ports; dropped with `machine.provide` (D15). Replaced by a factory
  (`wiki/conventions/reusable-primitives.md`); fragments take input and host events, not props (decision Q5c).
- **G11.** `U foundation/preferences/preference.ts:8, 215-240` (cookie and storage sync) and
  `U components/resizable/resizable-storage.ts:7`. Excluded by FlowState.plan:86; a second tab saves nothing
  (Persistence.plan:343-362). Deferred in `references/proposals/revisit.md` (cross-tab entry) with
  `wiki/conventions/cross-tab-bridge.md` as the interim host-code recipe.
- **G12.** T71's mapping: 29 of 37 cases ported, 8 dropped: ranking timing (a bench measure), `onSelect` and DOM
  events, element registration warning, controlled value, and number formatting, part attributes and keyboard mode
  (`U components/number-input/number-input.ts:136-146`). These are view work, which the first pass assigned to React
  (first pass section 1 table: "DOM, focus, geometry"). Real-browser proofs: @task.V3.T111 (draft).
- **G13.** Generality pass H3 and H6: a shared actor mid-gesture resumes its timers when a view returns, and a level
  fact such as `focused: "x"` does not re-fire. H6 is superseded by emits; H3 stays a convention (end the gesture in
  the effect cleanup). Neither is built as a feature.

## Part 2: what still cannot be built, by capability class

Verdict words: **non-goal** (a cited exclusion or user decision), **gap** (no Plan covers it; worth a Plan or a
convention page), **pair** (Flow plus a named library), **unconfirmed**.

### Class A: frame-rate and render-loop state

Sources: [dndkit-sensor], [dndkit-collision], [baseui-swipe], [radix-slider], [zag-slider], [tldraw-state],
[tldraw-tick], [excalidraw-app], [motion-value], [motion-frame], [ttable-resize].

Flow side: a pointer move as an event "costs a turn, a frozen snapshot and a render per frame", so frame-rate data
stays in refs and milestones go to a local actor (`wiki/conventions/interaction-state.md`, decision Q4 A, [decided:
user 2026-11-16]). A core turn measures 0.05 to 0.28 ms (`packages/flow-state-v3/bench/history/scale.csv`), but React
notifies once per task, not per frame (React.plan:106-107) and no browser throughput suite exists yet (@task.V3.T35
draft, P8). So Flow could not be shown to hold a 60 Hz source through React; that is unconfirmed, not disproved.

| Project and behaviour                 | Flow gap                       | Verdict                        |
| ------------------------------------- | ------------------------------ | ------------------------------ |
| dnd-kit: collisions on every move     | per-move state                 | non-goal; pair dnd-kit         |
| Base UI swipe-dismiss, velocity       | pointer capture, release speed | non-goal; milestones only      |
| Radix and Zag slider thumb drag       | rect reads, pointer capture    | non-goal; value on release     |
| tldraw tools receive pointer and tick | tool statechart at frame rate  | non-goal by Q4; unmeasured     |
| Excalidraw canvas pointer handlers    | 11k-line pointer pipeline      | non-goal; pair canvas renderer |
| Motion values and frame loop          | per-frame animated values      | non-goal; pair Motion or CSS   |
| TanStack Table column drag-resize     | live delta while dragging      | non-goal; commit on end        |
| Real-time game loop                   | render loop and input sampling | non-goal; Flow holds session   |

- Why it holds: Flow's Runtime Clock is virtual in Stories (Testing.plan:293), which suits game rules and timers,
  not the render loop.
- Worth a Plan: only a measurement. A bench of publishing a `latest` stream at 30 to 60 Hz through React in a real
  browser would turn the unconfirmed claim into a fact (@task.V3.T35).

### Class B: state the DOM owns

Sources: [baseui-toast], [baseui-anim], [radix-presence], [ra-focus], [zag-slider], [zag-combobox], [mc-store],
[mc-mediator], [vidstack], [tiptap].

Flow side: the first pass splits logic three ways and gives "DOM, focus, geometry" to React, which sends semantic
events (first pass section 1). Emits go from machine to view only (Machines.plan O2;
`wiki/conventions/view-commands.md`).
No Plan covers a measured value, an animation end or a caret entering a machine.

| Project and behaviour                    | What Flow lacks                   | Verdict                         |
| ---------------------------------------- | --------------------------------- | ------------------------------- |
| Base UI toast stores each toast `height` | DOM measurement in store state    | gap (convention); view event    |
| Base UI, Radix exit animation unmount    | animation end tells the state     | gap (convention); view event    |
| React Aria FocusScope restore, contain   | focus order, restore, trap        | pair React Aria or Radix        |
| Zag machines read the DOM in effects     | machine reaches DOM itself        | non-goal; state machine in Flow |
| Media Chrome and Vidstack media element  | state owned by the element        | pair; Flow holds intent only    |
| Tiptap and ProseMirror editor            | caret, selection, IME, schema doc | non-goal; pair Tiptap           |
| ui-sdk token input editing               | caret decides undo steps          | non-goal; typed text view-owned |

- Media: Flow's `player` fixture has "no source", and its position tick is a schedule, not an `HTMLMediaElement`
  (`wiki/conventions/fixture-catalog.md`, player block). Media Chrome waits for events from the media element before
  committing state ([mc-store]), so the machine would receive `timeupdate`-rate events.
- Rich text: ui-sdk's decision W8b makes typed text view-owned (decisions doc section 8). Flow can own the saved
  document and its save lifecycle (fixture `draft`: `save` is `latest`, a collaborator's op arrives mid-save) but not
  the editor model.
- Gap detail: Zag and Base UI machines pull measurement and animation end into state; a Flow primitive would route
  them as view events at human speed. T77 gives the return path only. A convention page would close it
  (proposed, not decided).

### Class C: huge or windowed data

Sources: [tvirtual], [ra-virt], [baseui-combobox], [ttable-resize], [excalidraw-app], [tldraw-editor].

Flow side: @plan.Pending.D23 says an app with 5,000 rows "virtualises them or holds pointers". Per-turn cost at 5,000
saved identities is 0.14 ms (`bench/history/scale.csv`); nothing larger is measured, so 100k rows is unconfirmed.
Paging exists (`pagedBy`, `more`: catalog `chat` step 12, EntityDomains O1). Client-built query results and arbitrary
predicates are excluded (EntityDomains.plan:356), so a grid that sorts, filters or groups locally is not Flow's job.

| Project and behaviour                   | Flow gap                      | Verdict                           |
| --------------------------------------- | ----------------------------- | --------------------------------- |
| TanStack Virtual measures rows          | ResizeObserver, scroll offset | pair TanStack Virtual             |
| React Aria Virtualizer, Base UI virtual | layout, scrollTop sync        | pair; Base UI combobox has a flag |
| TanStack Table sort, filter, size state | local query over loaded rows  | non-goal (EntityDomains C1)       |
| AG Grid server-side row model           | block reads keyed by range    | unconfirmed; keys may fit         |
| Excalidraw, tldraw 10k+ shapes          | one huge record set per frame | unconfirmed beyond 5,000          |

### Class D: multi-writer merge and local-first sync

Sources: [yjs], [yjs-internals], [excalidraw-merge], [excalidraw-collab], [pm-collab], [replicache],
[zero-mutators], [zero-offline], [tldraw-sync].

Flow side: C2 excludes "multi-tab sharing, sync engines and cross-origin sync" (FlowState.plan:86); C1 of
EntityDomains excludes "offline completeness, client-built query results, ... field merge" (EntityDomains.plan:356);
TanStack DB integration is out (`wiki/tasks/V3/epic.task:86`); a second tab saves nothing (Persistence.plan:343-362).
What is covered: server-ordered collaboration. The `kanban` and `draft` fixtures copy tldraw's push, ack and rebase
scenarios onto Flow's own records and predictions (catalog, kanban and draft blocks, `TLSyncClient.test.ts` rows), and
`draft` takes a collaborators' `ops` stream.

| Project and behaviour                   | Flow gap                         | Verdict                          |
| --------------------------------------- | -------------------------------- | -------------------------------- |
| Yjs shared types, undo manager, offline | CRDT merge on every client       | non-goal; pair Yjs for the doc   |
| Excalidraw per-element version merge    | last-writer-wins reconcile       | non-goal (field merge excluded)  |
| prosemirror-collab central authority    | step rebase over server order    | gap-free for order; no editor    |
| Replicache and Zero mutators            | local datastore plus local query | non-goal (sync engine)           |
| Zero offline                            | automatic conflict resolution    | non-goal; Zero says none exists  |
| tldraw sync-core push, rebase           | speculative changes, git-like    | covered in spirit by predictions |
| Linear-style sync engine                | closed source                    | unconfirmed                      |

- Pairing: Yjs with a websocket provider for a document, Flow around the save, presence (`latest` stream) and
  permissions. No fixture integrates Yjs (unconfirmed it fits the Store and Stream contracts).

### Class E: undo and redo of user edits

Sources: [tldraw-editor], [yjs]; ui-sdk `U components/token-input/token-input-editing.ts:69,238,298`.

Flow side: `S.X.history` restores control only, not data (Machines.plan:207-209); an operation's "undo" is a
compensating write (Operations.plan:256). No Plan defines a user-level undo stack. The token input builds its own in
memory (@task.V3.T73 Approach: undo history with late-settling items), which is a fixture, not a feature.

| Project and behaviour                  | Flow gap                          | Verdict                     |
| -------------------------------------- | --------------------------------- | --------------------------- |
| tldraw history manager and squashing   | inverse diffs over a record store | gap (convention or Plan)    |
| Yjs UndoManager                        | per-user undo over shared types   | non-goal with Yjs; pair Yjs |
| ui-sdk token input undo groups by time | text edits as undo steps          | per-fixture memory (T73)    |

- Open question for the user: whether undo over server-confirmed records (inverse patch versus server answer) needs
  a Plan line. EntityDomains C1 forbids inventing server answers, so an undo would be a new write, not a local pop
  (inference; unconfirmed).

### Class F: parallel statechart regions and tooling parity

Sources: [xstate-parallel], [xstate-docs], [zag-combobox], [zag-toast]; `wiki/tasks/V3/epic.task:87` (CLI scope).

Flow side: "Exactly one leaf is active" (Machines.plan:201). Independent concerns are traits and `.each` copies with
their own memory (Machines.plan:87-112), or separate actors.

| Project and behaviour              | Flow gap                          | Verdict                           |
| ---------------------------------- | --------------------------------- | --------------------------------- |
| XState parallel states (regions)   | sibling regions in one snapshot   | deliberate; traits substitute     |
| XState spawn and invoke            | dynamic child actors              | covered: `createActor`, `.each`   |
| Zag combobox, menu, toast machines | effects, computed, tags in config | partly: Flow splits to operations |
| Stately editor and inspector       | visual editing of a machine       | non-goal; CLI keeps 5 commands    |

- A region needing the same memory as its sibling cannot be a trait (traits own their memory); the workaround is
  one state tree with a product of states, or events between actors. No Plan lists this as a limit (unconfirmed
  that it hurts a real app).

### Class G: read-cache parity with TanStack Query

Sources: [tq-observer], [tq-infinite], [tq-broadcast], [tq-persist].

| Behaviour                            | Flow                                 | Verdict                        |
| ------------------------------------ | ------------------------------------ | ------------------------------ |
| refetch on window focus or reconnect | no `Trigger` cue; a schedule runs it | non-goal (Operations.plan:104) |
| Suspense queries                     | excluded                             | non-goal (FlowState.plan:86)   |
| cross-tab cache broadcast            | experimental there; out here         | non-goal (C2)                  |
| `maxPages` on infinite queries       | no caps by decision D24              | non-goal                       |
| `select` with structural sharing     | selectors compare by `Equal`         | covered (React.plan O4)        |

### Class H: platforms and hosts

Sources: `wiki/tasks/V3/epic.task:86`, Package.plan:37-48, Persistence.plan:31, ServerRendering.plan:185.

| Target                             | Flow                                  | Verdict                       |
| ---------------------------------- | ------------------------------------- | ----------------------------- |
| Vue, Solid, Svelte, web components | "UI is React and Next.js only"        | non-goal (epic:86)            |
| Electron                           | excluded                              | non-goal (epic:86)            |
| React Native                       | React peer; store is IndexedDB        | unconfirmed; custom Store     |
| Server Components                  | hooks client-only; `dehydrate` server | covered (Package.plan:42-48)  |
| Server Actions                     | a commit is any Effect                | unconfirmed; no Plan, fixture |
| Web Workers, SharedWorker          | no Plan                               | unconfirmed                   |

- Server Actions: a commit is any Effect, so it could call one, but no Plan or fixture shows it (unconfirmed).
- Custom storage: `Store` is a service with `storeContract` (@task.V3.T58 done), so a non-IndexedDB store is
  possible in principle (Persistence.plan:31, Package.plan:37).

### Class I: done fine, or fine by pairing

Sources: [rhf], [rhf-effect], [ai-chat], [ai-stream], [mc-store], [motion-frame].

| Project and behaviour               | Flow                              | Verdict                       |
| ----------------------------------- | --------------------------------- | ----------------------------- |
| React Hook Form uncontrolled fields | DOM refs own values; Flow: submit | pair; Effect resolver exists  |
| Chat or streaming AI UI             | `ask`, stream `reply`, resume     | covered; token rate unbenched |
| Real-time games, media players      | session, lobby, intent only       | see Classes A and B           |

- Forms: RHF's `_fields` refs and dirty state live in the DOM ([rhf]); a `@hookform/resolvers` Effect adapter
  exists ([rhf-effect]), so validation can share Flow's Schema. Controlled values use props plus an emit
  (`wiki/conventions/controlled-values.md`).
- Chat: AI SDK `AbstractChat` and partial tool-call state ([ai-chat], [ai-stream]) map to Flow's `chat` fixture
  (catalog chat block: ask, reply, reload, resume, stop). A stream `every` delivers one item per turn
  (Operations.plan:293); at LLM token rates that is one turn and one publication per delta. Unbenched (unconfirmed).
- Binary values: memory must encode canonically (no `notPlain`, cycles or NaN; Inspection.plan:67-82), and no
  fixture holds a `File` or `Blob` (`grep` of `fixtures/` found none), so uploads probably go through a service. How
  large binary payloads cross a machine is unconfirmed.

## Plan omissions versus non-goals

Likely omissions (proposed only; each needs the user's decision before any Plan edit):

1. **DOM measurements and animation end into a machine** (Class B). No Plan or convention. Fix: a convention page.
2. **User-level undo and redo** (Class E). Only fixture-level memory. Fix: a convention page, or a Plan line.
3. **Function-valued options** (Part 1 G7). The fixture used a data table; no owner exists.
4. **A browser measure of 30 to 60 Hz publication through React** (Class A). Turn cost is measured; the browser path
   is not (@task.V3.T35, draft).

Deliberate non-goals, with their homes: CRDT and sync engines (FlowState C2, EntityDomains C1), Electron and non-React
UIs (epic Scope), Suspense (FlowState C2, ServerRendering.plan:185), frame-rate state (decision Q4 A), parallel regions
(Machines.plan:201), refetch-on-focus (Operations.plan:104).

## Sources

Flow records are cited inline. Web sources, default branch read on 2026-11-23:

- [baseui-swipe] lines 454, 752-754, 988:
  https://github.com/mui/base-ui/blob/master/packages/react/src/utils/useSwipeDismiss.ts
- [baseui-toast] lines 41-60, 100, 125-148:
  https://github.com/mui/base-ui/blob/master/packages/react/src/toast/store.ts
- [baseui-anim] lines 7-10:
  https://github.com/mui/base-ui/blob/master/packages/react/src/utils/getFiniteAnimations.ts
- [baseui-combobox] lines 45, 159:
  https://github.com/mui/base-ui/blob/master/packages/react/src/combobox/store.ts
- [ra-press] lines 605:
  https://github.com/adobe/react-spectrum/blob/HEAD/packages/react-aria/src/interactions/usePress.ts
- [ra-virt] lines 74:
  https://github.com/adobe/react-spectrum/blob/HEAD/packages/react-aria/src/virtualizer/Virtualizer.tsx
- [ra-focus] lines 44, 153-155:
  https://github.com/adobe/react-spectrum/blob/HEAD/packages/react-aria/src/focus/FocusScope.tsx
- [ra-drag] lines 145-157:
  https://github.com/adobe/react-spectrum/blob/HEAD/packages/react-aria/src/dnd/useDrag.ts
- [radix-presence] lines 59-73, 111:
  https://github.com/radix-ui/primitives/blob/HEAD/packages/react/presence/src/presence.tsx
- [radix-slider] lines 367, 540:
  https://github.com/radix-ui/primitives/blob/HEAD/packages/react/slider/src/slider.tsx
- [zag-slider] lines 2, 205, 239:
  https://github.com/chakra-ui/zag/blob/HEAD/packages/machines/slider/src/slider.machine.ts
- [zag-toast] lines 23-33, 87-88:
  https://github.com/chakra-ui/zag/blob/HEAD/packages/machines/toast/src/toast.machine.ts
- [zag-combobox] lines 81, 176:
  https://github.com/chakra-ui/zag/blob/HEAD/packages/machines/combobox/src/combobox.machine.ts
- [xstate-parallel] lines 193, 282:
  https://github.com/statelyai/xstate/blob/HEAD/packages/core/src/stateUtils.ts
- [xstate-docs]:
  https://stately.ai/docs/parallel-states
- [tq-observer] lines 74-77:
  https://github.com/TanStack/query/blob/HEAD/packages/query-core/src/queryObserver.ts
- [tq-infinite] lines 52, 84:
  https://github.com/TanStack/query/blob/HEAD/packages/query-core/src/infiniteQueryBehavior.ts
- [tq-broadcast] lines 1-6:
  https://github.com/TanStack/query/blob/HEAD/packages/query-broadcast-client-experimental/src/index.ts
- [tq-persist] lines 16-39:
  https://github.com/TanStack/query/blob/HEAD/packages/query-persist-client-core/src/persist.ts
- [yjs] lines 4-12, 170:
  https://github.com/yjs/yjs/blob/HEAD/README.md
- [yjs-internals] lines 7:
  https://github.com/yjs/yjs/blob/HEAD/INTERNALS.md
- [pm-collab] lines 14-22, 36:
  https://github.com/ProseMirror/prosemirror-collab/blob/HEAD/src/collab.ts
- [tiptap] lines 5, 71:
  https://github.com/ueberdosis/tiptap/blob/HEAD/packages/core/src/Editor.ts
- [tldraw-state] lines 24-55, 276-289:
  https://github.com/tldraw/tldraw/blob/HEAD/packages/editor/src/lib/editor/tools/StateNode.ts
- [tldraw-tick] lines 8-35:
  https://github.com/tldraw/tldraw/blob/HEAD/packages/editor/src/lib/editor/managers/TickManager/TickManager.ts
- [tldraw-editor] lines 396, 434:
  https://github.com/tldraw/tldraw/blob/HEAD/packages/editor/src/lib/editor/Editor.ts
- [tldraw-sync] lines 323, 384-396:
  https://github.com/tldraw/tldraw/blob/HEAD/packages/sync-core/src/lib/TLSyncClient.ts
- [excalidraw-app] lines 634, 2736:
  https://github.com/excalidraw/excalidraw/blob/HEAD/packages/excalidraw/components/App.tsx
- [excalidraw-merge] lines 23-41:
  https://github.com/excalidraw/excalidraw/blob/HEAD/packages/excalidraw/data/reconcile.ts
- [excalidraw-collab] lines 6, 20, 64:
  https://github.com/excalidraw/excalidraw/blob/HEAD/excalidraw-app/collab/Collab.tsx
- [replicache]:
  https://doc.replicache.dev/concepts/how-it-works
- [zero-mutators]:
  https://zero.rocicorp.dev/docs/mutators
- [zero-offline]:
  https://zero.rocicorp.dev/docs/offline
- [dndkit-sensor] lines 98-121:
  https://github.com/clauderic/dnd-kit/blob/HEAD/packages/dom/src/core/sensors/pointer/PointerSensor.ts
- [dndkit-collision] lines 13-22:
  https://github.com/clauderic/dnd-kit/blob/HEAD/packages/abstract/src/core/collision/observer.ts
- [rhf] lines 137, 144, 178:
  https://github.com/react-hook-form/react-hook-form/blob/HEAD/src/logic/createFormControl.ts
- [rhf-effect]:
  https://github.com/react-hook-form/resolvers/blob/HEAD/effect-ts/src/effect-ts.ts
- [ai-chat] lines 138, 269:
  https://github.com/vercel/ai/blob/HEAD/packages/ai/src/ui/chat.ts
- [ai-stream] lines 38, 76:
  https://github.com/vercel/ai/blob/HEAD/packages/ai/src/ui/process-ui-message-stream.ts
- [mc-store] lines 13-16:
  https://github.com/muxinc/media-chrome/blob/HEAD/src/js/media-store/media-store.ts
- [mc-mediator] lines 223, 561:
  https://github.com/muxinc/media-chrome/blob/HEAD/src/js/media-store/state-mediator.ts
- [vidstack] lines 76:
  https://github.com/vidstack/player/blob/HEAD/packages/vidstack/src/providers/html/provider.ts
- [motion-value] lines 94:
  https://github.com/motiondivision/motion/blob/HEAD/packages/motion-dom/src/value/index.ts
- [motion-frame] lines 17-29:
  https://github.com/motiondivision/motion/blob/HEAD/packages/motion-dom/src/frameloop/batcher.ts
- [tvirtual] lines 135-145, 241, 258:
  https://github.com/TanStack/virtual/blob/HEAD/packages/virtual-core/src/index.ts
- [ttable-resize] lines 29:
  https://github.com/TanStack/table/blob/HEAD/packages/table-core/src/features/column-resizing/columnResizingFeature.ts

Not read, so unconfirmed: AG Grid docs (the page served no readable text), Linear's engine, React Native,
Server Actions.
