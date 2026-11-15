# UI primitives to rebuild on Flow, from ui-sdk (proposed, 2026-11-16)

**Bottom line (proposed):** rebuild seven ui-sdk primitives as fixtures, in this order: the command palette, the
async combobox, the toaster, the menu with submenus, the number input, the lazy tree and the token input. Each one is
a different behaviour pattern Flow claims to handle: keyed pending actions, debounced latest-wins search with paging,
pausable per-item timers, hover intent with nested popups and stale endings, hold-to-repeat timing, per-branch
cancellable loads and undo history with late-settling items. Only the command palette runs on production today.
The rest need compound states (@task.V3.T17), the full schedule forms (@task.V3.T57) or `subscribe.each`
(@task.V3.T21). ui-sdk is Apache-2.0 (Copyright 2026 Vercel, Inc.). We replicate behaviour and write our own tests,
which the licence does not restrict. Flow lacks four things these primitives need: a schedule that pauses and keeps
its time left, a key argument for a keyed schedule's function, a way to keep a gesture's state out of a restored
record, and operation ports so that a primitive can become a reusable fragment. All four are marked NEW (proposed)
below. Focus, pointer geometry and DOM events stay in React. The machine holds facts such as the highlighted key
and the focus target, and React applies them. Nothing here is decided.

**Why now:** today's five fixtures share one domain: a write with an unknown ending. The user wants a few of the most
complicated UI primitives rebuilt on machines and fragments, with their behaviours and test suites copied, so the
fixtures gain real variety. They later grow into Flow's own demo, a ui-sdk-style project.

**Read first:** https://ui-sdk.dev, https://github.com/vercel-labs/ui (read at commit `98ba9fd0`, 2026-11-15),
@plan.Machines, @plan.Operations, @plan.Testing, `fixture-catalogue-2026-11-11.md`,
`code:packages/flow-state-v3/fixtures/transfers/machine.ts`.

## 1. What ui-sdk is

ui-sdk ("UI SDK") is Vercel Labs' headless component library: it holds behaviour and accessibility and leaves out
styling. A framework-free core (`packages/core`) has more than 50 behaviours (for example `createRovingFocus`,
`createTypeahead`, `createPopup`, `createAsyncOptions`, `bindHold`, `createUndoStack`) and about 48 components
built on them. Thin adapters cover React, Solid, Svelte, Vue and web components. Tests come in two layers:

- `packages/core/test/*.test.ts`: 216 Vitest files of unit and behaviour tests on the core, using fake timers;
- `tests/specs/*.spec.ts`: 365 Playwright files per component (a11y, rtl, ssr, sr, render, enhancements,
  kitchen-sink).

**Licence.** `LICENSE` is the Apache License 2.0, "Copyright 2026 Vercel, Inc." Every package manifest says
`"license": "Apache-2.0"`. There is no NOTICE file and no per-file headers. The README says UI SDK is in beta "subject
to the Vercel beta terms", and its APIs and behaviour may change. A plain reading, not legal advice:

- Behaviour, ideas and test intents are not protected. Writing our own machines and tests from them needs no
  permission at all.
- Copying any source or test text is allowed, with conditions: ship a copy of the licence, keep the copyright notice
  and mark the changed files. We copy nothing, so none of this applies.
- The licence grants no trademark rights. Our fixtures and demo must not use the names "UI SDK" or "Vercel" or their
  branding.
- The beta terms cover using Vercel's product, not reading Apache-licensed code. Because the behaviour may change,
  this proposal pins the commit it read.
- The project's own rule decides the rest: `packages/flow-state-v3/` never names or reads anything outside itself.
  Upstream file paths stay in this proposal and never appear in package code or comments. Tests cite our own
  behaviour statements.

**How the behaviours split.** ui-sdk mixes three kinds of logic, and only one of them belongs in a Flow machine:

| Kind                 | Example                                          | Where it goes in Flow                     |
| -------------------- | ------------------------------------------------ | ----------------------------------------- |
| State, time, async   | pending actions, debounce, hover delay, undo     | the machine (this proposal)               |
| Pure data functions  | fuzzy ranking, tree outline math, layout math    | plain functions the view or machine calls |
| DOM, focus, geometry | focus calls, safe-area triangle, pointer capture | React, which sends semantic events        |

## 2. Ranked table of every primitive

Complexity runs from 1 (trivial state) to 5 (many timers, async races and parts working together). Fit is **yes**
(build now as a fixture), **later** (worth it, after a feature or another fixture lands) or **no** (mostly visual,
pure functions or trivial state). Feature codes follow `fixture-catalogue-2026-11-11.md` §2.

| Rank | Primitive (upstream name)                  | Cx | Flow features exercised                         | Fit       |
| ---- | ------------------------------------------ | -- | ----------------------------------------------- | --------- |
| 1    | Command palette (`command`)                | 4  | ky rj gd, write rows, check-driven keys         | yes (now) |
| 2    | Async combobox (`combobox`, async options) | 5  | cs du lk lr gd rj, cancel, paging               | yes       |
| 3    | Toaster (`toast`, `toaster`)               | 5  | ks rs ky rj ma, pause reasons, sends            | yes       |
| 4    | Menu with submenus (`menu`)                | 5  | cs du ky rj lr gd, hover intent, typeahead      | yes       |
| 5    | Number input (`number-input`, `bindHold`)  | 3  | cs du ms gd, commit once per interaction        | yes       |
| 6    | Lazy tree (`tree`)                         | 5  | sb (`.each`) cs gd rl, step-into, reorder       | yes       |
| 7    | Token input (`token-input`, undo stack)    | 4  | sb (`.each`) cs rl, undo groups by time         | yes       |
| 8    | Resizable with saved layout (`resizable`)  | 3  | rl, persistence; rest is layout math            | later     |
| 9    | Trigger menu (`trigger-menu`)              | 4  | async options per nested level                  | later     |
| 10   | Tooltip and hover card warm group          | 3  | du, cx (a group shares "warm" state)            | later     |
| 11   | Carousel autoplay (`carousel`)             | 3  | pause causes as a set (same need as toaster)    | later     |
| 12   | Preferences, colour scheme                 | 2  | rl, needs cross-tab sync and SSR cookie         | later     |
| 13   | Reorder and transfer lists                 | 3  | cs, Escape restore; overlaps S22 Kanban         | later     |
| 14   | Inline edit (`createInlineEdit`)           | 2  | cs; overlaps S15 rows edited in place           | later     |
| 15   | Stick to bottom (`createStickToBottom`)    | 2  | st; overlaps S04 chat                           | later     |
| 16   | Alert dialog queue (`createConfirm`)       | 3  | questions wait for the one before; small        | later     |
| 17   | Menubar, navigation menu                   | 3  | duplicates menu's hover intent                  | later     |
| 18   | Autocomplete, select, listbox              | 2  | subsets of combobox                             | no        |
| 19   | Dialog, drawer, popover, sheet             | 2  | focus trap and gesture physics are DOM          | no        |
| 20   | OTP input                                  | 2  | paste filter and completion are pure functions  | no        |
| 21   | Date picker, calendar, date and time input | 2  | locale parsing, pure                            | no        |
| 22   | File input                                 | 2  | drop rules pure; uploads are S03's job          | no        |
| 23   | Colour picker, image cropper, slider       | 1  | geometry and colour maths                       | no        |
| 24   | Scroll area, waterfall, timeline, virtual  | 1  | geometry and time-to-pixel maths                | no        |
| 25   | Switch, toggle, checkbox, radio, rating    | 1  | one value                                       | no        |
| 26   | Tabs, accordion, collapsible, segmented    | 1  | one value and roving focus                      | no        |
| 27   | Toolbar, separator, label, field, meter    | 1  | static or one value                             | no        |
| 28   | Avatar, pagination, password input, input  | 1  | image status, page range, visibility toggle     | no        |

**Why these seven.** Each one brings at least one behaviour none of the five current fixtures has:

- the command palette: many keyed pending actions on one screen, with the view asking `check` before it handles a
  key;
- the combobox: a typing debounce, latest-wins reads, paging and cancel on new input;
- the toaster: one timer per item that pauses for several reasons and keeps its time left;
- the menu: hover intent, nested popups, and an action that settles after its menu was closed and reopened;
- the number input: a two-phase repeat timer and a commit once per interaction;
- the tree: concurrent loads per branch, with cancel on collapse and focus that waits for a load;
- the token input: undo grouped by time, and items that settle into history late.

The five shared Flow strengths these exercise are the activation owner test (@plan.Machines.O6), keyed write lanes
(@plan.Operations.O3), schedules (@plan.Machines.O5), `check` (@plan.Machines.O4) and placements
(@plan.Machines.O6).

## 3. Conventions in the sketches

Every keyword carries one of these marks in its comment:

```ts
// existing (built)     in production today (src/definition.ts, src/machine.ts, src/contract.ts)
// existing (Plan, Tn)  in a Plan, unbuilt; Task Tn builds it
// NEW (proposed)       in no Plan; this proposal suggests it
// user-defined         the fixture's own name
```

A sketch shows the definition and machine in full. Contracts and fakes follow `fixtures/transfers/` and are shown
when they carry behaviour. Each fixture keeps the four-file shape (`contracts.ts`, `machine.ts`, `server.ts`,
`stories.ts`) and is DOM-free. React wiring belongs to the later demo (@task.V3.T30, @phase.V3.P6).

Upstream tests split in two:

- **Machine:** what the fixture's Stories assert;
- **View:** keyboard mapping, ARIA, focus calls and geometry, which the later React demo replicates in real-browser
  tests (@phase.V3.P8).

## 4. The chosen primitives

### 4.1 Command palette

**What it is.** An inline searchable list of commands, like a ⌘K palette. Typing ranks the commands with a fuzzy
score. Enter runs the highlighted one. A command with sub-commands opens a page, and Backspace in an empty field goes
back. A command whose action returns a Promise is pending until it settles. Several commands can be pending at once,
and a failed one keeps its reason until it runs again.

**Behaviour.** One state, READY. Memory: `query`, `pages` (a stack of page values), `queries` (the text of each page
below the top, restored on Back), `highlighted` with `highlightBy` (`auto` or `user`) and `errors` (a keyed list of
reasons). Pending is derived from the `run` write rows and never stored.

| Event             | Guard                                   | Effect                                              |
| ----------------- | --------------------------------------- | --------------------------------------------------- |
| Typed { text }    | none                                    | query = text; highlightBy = auto                    |
| Highlight { key } | none                                    | highlighted = key; highlightBy = user               |
| Run { key, page } | page: none                              | push page; save query; query = ""                   |
| Run { key }       | not disabled; `O.run.idle({ command })` | commit run; clear this key's error                  |
| Run, pending key  | idle denies                             | Denied: nothing runs; a link-rendered one stays put |
| Back              | query empty and a page open             | pop page; query = saved text                        |
| Escape            | query not empty                         | query = ""                                          |
| Escape            | else a page open                        | pop page                                            |
| Escape            | else                                    | Denied: React leaves the key to an outer dialog     |
| Ran { command }   | none (lane ending)                      | nothing; the row goes Idle                          |
| RunFailed         | none                                    | errors[command] = reason                            |

Edge cases:

- **Rapid repeat:** Run on a pending key is denied, so the action is invoked once.
- **Concurrency:** another key runs at once, on its own lane.
- **One fails, another runs:** the failure clears only its own key; the other stays pending.
- **Unmount mid-run:** the lane outlives the actor (@plan.Runtime.O6), and the ending reaches a returning incarnation
  or is evidence.
- **Highlight:** the effective highlight is derived. It is the stored key while that key is in the ranked results
  and `highlightBy` is `user`; otherwise it is the best match. Results that keep the highlighted command keep the
  highlight.

**Upstream tests to replicate** (`packages/core/test/command.test.ts`, 25 tests; `tests/specs/command.*`, 43):

Machine:

1. The first command is highlighted at first, without reporting a change.
2. Typing ranks the commands and highlights the best match.
3. Enter runs the highlighted command, and an action that has not settled marks it pending.
4. Pressing a disabled or pending command does nothing.
5. A pending command cannot run again until it settles; another command runs meanwhile.
6. A rejected action keeps its reason as that command's error until it runs again.
7. A command that fails while another runs leaves the other pending.
8. A command with sub-commands opens its page. Backspace in an empty field goes back and restores the text.
9. Escape clears the text, then goes back a page, then leaves the key alone.
10. Results that keep the highlighted command keep the highlight.
11. Without auto-highlight, nothing is highlighted until the arrows move.
12. Commands and their shortcuts are found on every page.

Pure functions, tested beside them without Flow:

13. The whole text beats a prefix, which beats a word start, a substring and scattered letters.
14. Case and accents are ignored.
15. A scoring function ranks, and a score of 0 hides.
16. 10,000 items: a fuzzy keystroke stays well under a frame (a bench case, P8).

View: the input controls the listbox, arrows skip disabled commands and wrap, a group heading hides when its group
is empty, announcements and RTL.

**Sketch.**

```ts
// contracts.ts
// user-defined: CommandsApi, CommandFailed, runCommand
export class CommandFailed extends Schema.TaggedError<CommandFailed>()("CommandFailed", {
  reason: Schema.String,
}) {}

export const runCommand = transaction({          // existing (built): transaction
  id: "Palette/run",
  input: { command: Schema.String },
  key: ["command"],                              // existing (built): one write lane per command
  concurrency: "reject",                         // existing (built)
  services: [CommandsApi],
  commit: (input) => Effect.flatMap(Effect.service(CommandsApi), (api) => api.run(input)),
});

// machine.ts
const Palette = definition({                     // existing (built): definition
  id: "Palette/Palette",
  states: ["READY"],
  events: {
    Typed: { text: Schema.String },
    Highlight: { key: Schema.String },
    Run: { key: Schema.String, page: Schema.Boolean, disabled: Schema.Boolean },
    Back: {},
    Escape: {},
  },
  internalEvents: {
    Ran: { command: Schema.String },
    RunFailed: { command: Schema.String, reason: Schema.String },
    RunUnsure: Flow.uncertain({ command: Schema.String }),  // existing (built): Flow.uncertain
  },
  memory: {
    query: Flow.initial(Schema.String, ""),      // existing (built): Flow.initial
    pages: Flow.initial(Schema.Array(Schema.String), []),
    queries: Flow.initial(Schema.Array(Schema.String), []),
    highlighted: Flow.initial(Schema.NullOr(Schema.String), null),
    highlightBy: Flow.initial(Schema.Literal("auto", "user"), "auto"),
    errors: Flow.initial(Schema.Record({ key: Schema.String, value: Schema.String }), {}),
  },
  operations: ({ E }) => ({
    run: runCommand.outcomes({
      success: E.Ran.from((_v: void, { input }) => ({ command: input.command })),
      failure: E.RunFailed.from((e: CommandFailed, { input }) => ({
        command: input.command,
        reason: e.reason,
      })),
      unknown: E.RunUnsure.from((_u, { input }) => ({ command: input.command })),
    }),
  }),
});

// user-defined: withoutKey, byCommand
const withoutKey = (errors: Readonly<Record<string, string>>, key: string) =>
  Object.fromEntries(Object.entries(errors).filter(([k]) => k !== key));
const byCommand = ({ event }: { readonly event: { readonly key: string } }) => ({ command: event.key });

export const PaletteMachine = machine(Palette, ({ S, E, O }) => ({   // existing (built): machine
  default: S.READY,
  on: {
    RunFailed: {
      updateMemory: ({ memory, event }) => ({ errors: { ...memory.errors, [event.command]: event.reason } }),
    },
    RunUnsure: {
      updateMemory: ({ memory, event }) => ({ errors: { ...memory.errors, [event.command]: "unknown" } }),
    },
    Ran: {},
  },
  states: {
    READY: {
      on: {
        Typed: { updateMemory: ({ event }) => ({ query: event.text, highlightBy: "auto" }) },
        Highlight: { updateMemory: ({ event }) => ({ highlighted: event.key, highlightBy: "user" }) },
        Run: [
          {
            guard: [({ event }) => !event.disabled || deny("Disabled"), ({ event }) => event.page || deny("NoPage")],
            updateMemory: ({ memory, event }) => ({
              pages: [...memory.pages, event.key],
              queries: [...memory.queries, memory.query],
              query: "",
              highlightBy: "auto",
            }),
          },
          {
            guard: [({ event }) => !event.disabled || deny("Disabled"), O.run.idle(byCommand)],  // existing (built)
            updateMemory: ({ memory, event }) => ({ errors: withoutKey(memory.errors, event.key) }),
            actions: [O.run.commit(({ event }) => ({ command: event.key }))],                  // existing (built)
          },
        ],
        Back: {
          guard: [({ memory }) => (memory.query === "" && memory.pages.length > 0) || deny("NothingToGoBackTo")],
          updateMemory: ({ memory }) => ({
            pages: memory.pages.slice(0, -1),
            queries: memory.queries.slice(0, -1),
            query: memory.queries.at(-1) ?? "",
          }),
        },
        Escape: [
          { guard: [({ memory }) => memory.query !== "" || deny("Empty")], updateMemory: () => ({ query: "" }) },
          {
            guard: [({ memory }) => memory.pages.length > 0 || deny("TopPage")],
            updateMemory: ({ memory }) => ({
              pages: memory.pages.slice(0, -1),
              queries: memory.queries.slice(0, -1),
              query: memory.queries.at(-1) ?? "",
            }),
          },
        ],
      },
    },
  },
}));
```

Two Plan items go beyond what production builds today. The mapper's second argument `{ input }` is
@plan.Operations.O3 (built `.from` takes the value only), and `deny` returned from an inline guard is existing
(built).

**Flow features exercised:** keyed `reject` lanes, `O.x.idle` guards, write rows as the source of "pending",
`Flow.uncertain`, `check` returning Denied so the view leaves Escape alone, and guard arrays in order.

**What Flow lacks:** nothing for the fixture. For a reusable palette fragment the app supplies the command action,
and a fragment cannot take an operation from its host. That needs **NEW (proposed) operation ports**, see decision 6.

**Catalogue overlap:** S16 money transfers has the same keyed `reject` lane, with a different trigger (many keys from
one list) and no unknown-heavy world. S02 has the typed-query shape, without the read.

**Stories.**

- **Usual:** type "pro", highlight "profile", run it, open the "theme" page, run "dark", Back, Escape twice. Two
  answers land in either order (checkpoints: `ranked`, `pending`, `settled`).
- **Stress:** 200 steps of bursts. Run the same five keys at random while their answers are held, released
  out of order, failed or lost (unknown). After each step, check that at most one Attempt is in flight per key and
  that every error belongs to a key whose last ending failed.

### 4.2 Async combobox: search as you type, pages, create

**What it is.** A text field with a filtered popup list. ui-sdk splits it in two:

- `createAsyncOptions` loads options for the text. It waits 200 ms after typing stops, aborts the older load,
  keeps the last items while loading, appends pages and keeps the items on an error.
- The combobox handles the list, the chosen value, Escape restore and an optional "Create 'x'" action that may be
  pending.

The Flow fixture is one machine for both.

**Behaviour.** States: CLOSED, and OPEN with children IDLE, WAITING and LOADING. Status is derived: `loading` while
WAITING or LOADING, `error` when `failed` is set, otherwise `idle`. Memory: `value`, `valueLabel`, `query`, `dirty`
(typed since the last choice), `items`, `page`, `hasMore`, `failed`, `clearedValue` (the value removed by emptying
the text, which Escape brings back), `highlighted` with `highlightBy`, and `createError`.

| From         | Event                 | Guard                 | To / effect                                          |
| ------------ | --------------------- | --------------------- | ---------------------------------------------------- |
| CLOSED       | Open                  | none                  | OPEN.IDLE; highlight the value or the first item     |
| any          | Typed { text }        | none                  | re-enter OPEN.WAITING; cancel the running read (*)   |
| OPEN.WAITING | Due (200 ms after)    | none                  | OPEN.LOADING; lookup page 0                          |
| OPEN.IDLE    | More                  | hasMore               | OPEN.LOADING; lookup page + 1                        |
| OPEN.LOADING | More                  | none written          | Unhandled: a load is running                         |
| any          | Found { items, page } | none                  | page 0 replaces items, later pages append; hasMore   |
| OPEN.LOADING | Found                 | none                  | also to OPEN.IDLE                                    |
| any          | FoundFailed           | none                  | failed on; items kept; OPEN.LOADING goes to IDLE     |
| OPEN         | Choose { key, label } | none                  | CLOSED; value = key; query = label; dirty off        |
| OPEN         | Create                | create shown and idle | commit create (owned by this OPEN activation)        |
| OPEN         | Created               | current ending        | CLOSED (single) or clear the query if unchanged      |
| root         | Created               | late ending           | stays: the list was closed and reopened since        |
| any          | CreateFailed          | none                  | createError = reason; stays                          |
| OPEN         | Escape                | none                  | CLOSED; value = clearedValue ?? value; query = label |
| CLOSED       | Escape                | none written          | Unhandled: React leaves the key                      |
| OPEN         | Close { reason }      | none                  | CLOSED; clearedValue = null                          |
| any          | Clear                 | not read-only         | value = null; query = ""; clearedValue = null        |

(*) Typed also sets query = text, dirty on, page 0 and hasMore off. An empty text with a value moves the value to
`clearedValue`. "Create shown" means the trimmed text is not empty and no item has exactly that label.

Edge cases:

- **Rapid input:** each Typed re-enters WAITING as a new activation, which restarts the 200 ms schedule. Only the last
  pause looks anything up, and a load already running is cancelled on the first new key.
- **Stale answers:** a newer lookup supersedes the older one, so only the latest ending is delivered
  (@plan.Operations.O2). The cancel on Typed also stops a page-2 answer from appending to the next query's items.
- **Paging after a new query:** Typed resets `hasMore`. ui-sdk's `createAsyncOptions` does not, so after
  `setQuery` then `cancel()`, `loadMore()` can append page 1 of the new text to the old items. That is
  `async-options.ts:144-178` read by hand and not executed. Our test 9 pins the correct behaviour.
- **Close and reopen during create:** the closed list's activation has ended, so Created is late, routed to the root,
  and does not close the new list. That is Flow's owner test, which replaces ui-sdk's `session` counter
  (`combobox-api.ts:724-733`).
- **Focus loss:** React sends Close { reason: "focus-out" }. A cancelled close keeps the list open; in Flow that
  becomes a guard on Close (a NEW (proposed) host port if the combobox becomes a fragment).
- **Unmount while loading:** releasing the actor releases the read (@plan.Operations.O7). A remount with the same
  text finds a fresh entry and does not fetch again (staleTime).

**Upstream tests to replicate** (`combobox*.test.ts`, 24 tests; `listbox.test.ts` async options, 3;
`autocomplete.test.ts`, 14; `tests/specs/combobox.*`, 88):

Machine:

1. Waits for typing to pause and lands only the latest answer. With 200 ms debounce: type "a", wait 250 ms, type
   "ab", wait 100 ms, type "abc", wait 400 ms. Only "a" and "abc" are requested, and the items are "abc"'s.
2. Reports loading from the first key press, before the load starts. A cancel sets the status back to idle.
3. Keeps the last items while loading, keeps them and reports an error on failure, and appends a second page.
4. Clearing empties the value and the text. A read-only combobox ignores Clear.
5. Escape after deleting the text brings the value back, with reason `escape-key`.
6. Escape after Clear keeps the value cleared. Escape brings back the value deleted last, not an earlier one.
7. A value set before its items load shows their label once they arrive.
8. A multiple combobox keeps its text when new items arrive.
9. (Ours, from the paging edge above) More after a new query never appends to the old query's items.
10. Create resolving after the list closed and reopened leaves it open.
11. With multiple, text typed while Create was pending stays.
12. Results arriving while open take the auto-placed highlight. A highlight the user moved survives appended items.
13. Focus moved elsewhere closes the list with reason `focus-out`. A cancelled focus-out close keeps it open.

View: the listbox name, chips as named groups, chip keyboard (arrows, Backspace removes and focuses the neighbour),
Load More fired by scrolling within 40 px of the end, results announced 500 ms after a query, virtualised rows and
hydration.

**Sketch.**

```ts
// contracts.ts
// user-defined: Fruit, FruitsApi, SearchDown, search, createFruit
export const Fruit = Schema.Struct({ key: Schema.String, label: Schema.String });

export const search = resource({                 // existing (built): resource
  id: "Fruits/search",
  input: { q: Schema.String, page: Schema.Number },
  output: Schema.Struct({ items: Schema.Array(Fruit), hasMore: Schema.Boolean }),
  key: ["q", "page"],
  services: [FruitsApi],
  staleTime: "30 seconds",
  gcTime: "1 minute",
  lookup: (input) => Effect.flatMap(Effect.service(FruitsApi), (api) => api.search(input)),
});

export const createFruit = transaction({
  id: "Fruits/create",
  input: { label: Schema.String },
  key: [],
  concurrency: "reject",
  services: [FruitsApi],
  commit: (input) => Effect.flatMap(Effect.service(FruitsApi), (api) => api.create(input)),
});

// machine.ts
const Combo = definition({
  id: "Fruits/Combo",
  states: ["CLOSED", { OPEN: ["IDLE", "WAITING", "LOADING"] }],   // existing (Plan, T17): compound states
  events: {
    Open: {},
    Typed: { text: Schema.String },
    More: {},
    Highlight: { key: Schema.String },
    Choose: { key: Schema.String, label: Schema.String },
    Create: {},
    Escape: {},
    Close: { reason: Schema.Literal("focus-out", "outside-press", "tab") },
    Clear: {},
  },
  internalEvents: {
    Due: {},
    Found: { items: Schema.Array(Fruit), hasMore: Schema.Boolean, page: Schema.Number },
    FoundFailed: {},
    Created: { label: Schema.String },
    CreateFailed: { reason: Schema.String },
    CreateUnsure: Flow.uncertain({}),
  },
  memory: {
    readOnly: Flow.input(Schema.Boolean),        // existing (Plan, T17): Flow.input
    value: Flow.initial(Schema.NullOr(Schema.String), null),
    valueLabel: Flow.initial(Schema.String, ""),
    clearedValue: Flow.initial(Schema.NullOr(Schema.String), null),
    query: Flow.initial(Schema.String, ""),
    dirty: Flow.initial(Schema.Boolean, false),
    items: Flow.initial(Schema.Array(Fruit), []),
    page: Flow.initial(Schema.Number, 0),
    hasMore: Flow.initial(Schema.Boolean, false),
    failed: Flow.initial(Schema.Boolean, false),
    highlighted: Flow.initial(Schema.NullOr(Schema.String), null),
    highlightBy: Flow.initial(Schema.Literal("auto", "user"), "auto"),
    createError: Flow.initial(Schema.NullOr(Schema.String), null),
  },
  operations: ({ E }) => ({
    search: search.outcomes({
      success: E.Found.from((v: { readonly items: ReadonlyArray<typeof Fruit.Type>; readonly hasMore: boolean },
        { input }) => ({ items: v.items, hasMore: v.hasMore, page: input.page })),
      failure: { SearchDown: E.FoundFailed, Defect: E.FoundFailed, Interrupted: E.FoundFailed },
    }),
    create: createFruit.outcomes({
      success: E.Created.from((_v: void, { input }) => ({ label: input.label })),
      failure: E.CreateFailed.from((e: { readonly message: string }) => ({ reason: e.message })),
      unknown: E.CreateUnsure,
    }),
  }),
});

// user-defined: showsCreate, foundPatch
const showsCreate = (memory: { readonly query: string; readonly items: ReadonlyArray<typeof Fruit.Type> }) =>
  memory.query.trim() !== "" && !memory.items.some((i) => i.label === memory.query.trim());
const foundPatch = (
  memory: { readonly items: ReadonlyArray<typeof Fruit.Type> },
  event: { readonly items: ReadonlyArray<typeof Fruit.Type>; readonly hasMore: boolean; readonly page: number },
) => ({
  items: event.page === 0 ? event.items : [...memory.items, ...event.items],
  page: event.page,
  hasMore: event.hasMore,
  failed: false,
});

export const ComboMachine = machine(Combo, ({ S, E, O }) => ({
  default: S.CLOSED,
  on: {
    Found: { updateMemory: ({ memory, event }) => foundPatch(memory, event) },
    FoundFailed: { updateMemory: () => ({ failed: true }) },
    Created: {},                                 // a late ending: the list it belonged to has closed
    CreateFailed: { updateMemory: ({ event }) => ({ createError: event.reason }) },
    CreateUnsure: { updateMemory: () => ({ createError: "unknown" }) },
    Clear: {
      guard: [({ memory }) => !memory.readOnly || deny("ReadOnly")],
      updateMemory: () => ({ value: null, valueLabel: "", query: "", clearedValue: null, dirty: false }),
    },
    Typed: {
      target: S.OPEN.WAITING,                    // existing (Plan, T17): re-entry is a new activation
      updateMemory: ({ memory, event }) => ({
        query: event.text,
        dirty: true,
        page: 0,
        hasMore: false,
        highlightBy: "auto",
        clearedValue: event.text === "" && memory.value !== null ? memory.value : memory.clearedValue,
        value: event.text === "" ? null : memory.value,
      }),
      actions: [O.search.cancel],                // existing (built): read cancel
    },
  },
  states: {
    CLOSED: {
      on: { Open: { target: S.OPEN.IDLE, updateMemory: () => ({ highlightBy: "auto" }) } },
    },
    OPEN: {
      default: S.OPEN.IDLE,
      on: {
        Highlight: { updateMemory: ({ event }) => ({ highlighted: event.key, highlightBy: "user" }) },
        Choose: {
          target: S.CLOSED,
          updateMemory: ({ event }) => ({
            value: event.key, valueLabel: event.label, query: event.label, dirty: false, clearedValue: null,
          }),
        },
        Create: {
          guard: [({ memory }) => showsCreate(memory) || deny("NoCreate"), O.create.idle(() => ({}))],
          updateMemory: () => ({ createError: null }),
          actions: [O.create.commit(({ memory }) => ({ label: memory.query.trim() }))],
        },
        Created: { target: S.CLOSED, updateMemory: ({ event }) => ({ query: event.label, dirty: false }) },
        Escape: {
          target: S.CLOSED,
          updateMemory: ({ memory }) => ({
            value: memory.clearedValue ?? memory.value,
            query: memory.valueLabel,
            dirty: false,
            clearedValue: null,
          }),
        },
        Close: { target: S.CLOSED, updateMemory: () => ({ clearedValue: null, dirty: false }) },
      },
      states: {
        IDLE: {
          on: {
            More: {
              guard: [({ memory }) => memory.hasMore || deny("NoMore")],
              target: S.OPEN.LOADING,
              actions: [O.search.lookup(({ memory }) => ({ q: memory.query, page: memory.page + 1 }))],
            },
          },
        },
        WAITING: {
          schedules: { quiet: { schedule: "200 millis", send: E.Due } },   // existing (built): arms on entry
          on: {
            Due: {
              target: S.OPEN.LOADING,
              actions: [O.search.lookup(({ memory }) => ({ q: memory.query, page: 0 }))],  // existing (built)
            },
          },
        },
        LOADING: {
          on: {
            Found: { target: S.OPEN.IDLE, updateMemory: ({ memory, event }) => foundPatch(memory, event) },
            FoundFailed: { target: S.OPEN.IDLE, updateMemory: () => ({ failed: true }) },
          },
        },
      },
    },
  },
}));
```

The `multiple` mode adds a `values` list and Created's "clear the query only if unchanged" rule: a guard that
compares the event's label with `memory.query`. It is left out here to keep the sketch short, and the fixture
carries it.

**Flow features exercised:** compound states, re-entry as a new activation (debounce without `restartOn`),
supersession of one-off reads, read `cancel`, late endings with the owner test, `deny` codes, `Unhandled` for keys
the view must leave alone, and staleness across remounts.

**What Flow lacks:**

- compound states and `Flow.input` in production (@task.V3.T17);
- mapper context `{ input }` (@plan.Operations.O2, built by @task.V3.T21);
- a cancellable close for a reusable fragment needs a host guard port. Ports exist in @plan.Machines.O1
  (`Flow.Guard`) and are built by @task.V3.T57.

**Catalogue overlap:** S02 search as you type is this primitive's read half; this fixture supersedes it with paging,
create and Escape restore. S18 inbox has the paging (`pagedBy`), entity repair and optimism that this one leaves out.

**Stories.**

- **Usual:** type "ba" quickly, pause, see "banana", type "n", Load More, choose. Reopen, empty the text, press
  Escape and see the value back. Create "kiwi" while the fake holds the answer, close and reopen, release, and the
  list stays open.
- **Stress:** 300 steps. Gaps of 0 to 400 ms around the 200 ms debounce, answers reordered and late, More pressed
  during every phase, Close and Open at random. Check that the items always belong to the current query and that
  the fake saw one request per pause.

### 4.3 Toaster

**What it is.** A shared notification queue with one visible region.

- Toasts show newest first, at most 3 at a time (`maxVisible`).
- Each shown toast counts down its own duration (5,000 ms by default; loading toasts never expire).
- Countdowns pause while the pointer is over the region, focus is inside it, the window is blurred, the page is
  hidden, a swipe is in progress or the region is detached. Each reason holds on its own, and a pause keeps the time
  left.
- An update restarts a toast's countdown. A toast with a pending action button is held until the action settles.
- A promise toast is loading, then turns into success or error with a fresh duration. A promise toast dismissed
  while loading stays closed.
- Closing a focused toast moves focus to the next toast, else the one before, else back where F6 came from.

**Behaviour.** One state, SHOWING, holding all the data, and a keyed countdown per counting toast. Memory: `toasts`
(newest first: `id`, `title`, `type`, `duration` with `null` for never, `version`, `remaining`, `countingSince`),
`paused` (a list of reasons) and `focusAfterClose`. Visible means the first `maxVisible` toasts. A toast is counting
when it is visible, `duration` is not null, `paused` is empty and its `press` lane is idle.

| Event                         | Effect                                                                     |
| ----------------------------- | -------------------------------------------------------------------------- |
| Show { id, title, type, ms? } | an id already showing updates it; else insert first; settle the clocks     |
| Update { id, patch }          | denied with `Gone` if absent (the caller learns it was closed); bump       |
|                               | version; a type change resets duration and remaining                       |
| Dismiss { id?, reason }       | remove one or all; focusAfterClose = next, else previous, else "return"    |
| Expired { id } (countdown)    | Dismiss with reason `timeout`                                              |
| Pause { reason }              | add the reason; settle the clocks (subtract time spent)                    |
| Resume { reason }             | remove that reason only; settle the clocks (start the rest again)          |
| Press { id, action }          | guard `O.press.idle({ id })`; commit; the toast is held while pending      |
| Pressed { id, dismiss }       | dismiss with reason `action` if asked; settle the clocks                   |
| PressFailed { id }            | keep the toast; settle the clocks                                          |

"Settle the clocks" is one pure function. Before the turn's change, every toast that was counting moves its time
into `remaining`: `remaining -= now - countingSince`. After the change, every toast that is counting gets
`countingSince = now`. The countdown schedule's key set is exactly the counting toasts. A toast whose key leaves
stops; one that comes back arms again with its own `remaining`.

Edge cases:

- **Pushed out of view:** a fourth toast pushes the oldest out of the visible three. It leaves the key set and keeps
  its time; one never shown never starts.
- **Two reasons at once:** getting the window back does not resume while focus is in the region.
- **Update during a pause:** the version bumps and the duration restarts, but nothing counts until resumed.
- **Infinity to a number:** a loading toast turned into success starts counting.
- **Region unmount** (StrictMode included): React sends Pause { reason: "detached" }. Flow's "schedules wait while
  the actor is unused" is not enough here. A waiting deadline fires once on return (@plan.Machines.O5), which would
  expire the toast at once instead of keeping its time.
- **Reload:** not persisted. Notifications are per page by design.

**Upstream tests to replicate** (`toast.test.ts` and `toast-swipe.test.ts`, 33 tests; `tests/specs/toast.*`, 81):

Machine:

1. A message or options make a toast, newest first, with an id.
2. A toast with an id that is already showing is updated, not added again.
3. Update changes a showing toast and never brings back a closed one, and says whether the toast was still there.
4. Dismiss closes one toast by id, or all of them, and reports why.
5. A promise toast loads, then shows the result with a fresh duration. A rejected promise becomes an error.
6. A promise toast dismissed while loading stays closed.
7. A shown toast expires after its duration; a toast that never expires never does.
8. Pausing keeps the time left, and resuming continues from it.
9. Pause reasons hold separately: clearing one never resumes while another holds.
10. A toast pushed out of view waits with its time, and one never shown never starts.
11. An update restarts the countdown, and a held toast waits.
12. A duration changed from never to a number starts counting.
13. A pending action holds the toast open until it settles. A press that succeeds leaves no entry, and a failed
    one goes with its toast.
14. Focus goes to the next toast, else the one before, else back.

View: swipe direction from side and alignment, slop 8 px, threshold 40 px or flick 0.3 px/ms, resistance against the
direction, a second finger ignored, F6 from a text field, Tab past the last toast returns, Escape closes the toast
and not the dialog beneath, and announcements batched within 400 ms with errors read assertively.

Not replicated: `onDismiss` vetoing a close (a toaster fragment would take a `Flow.Guard` port), and the overlay
host's alert-dialog queue (rank 16).

**Sketch.**

```ts
// contracts.ts
// user-defined: ToastAction, NotificationsApi, pressAction
export const pressAction = transaction({
  id: "Toasts/press",
  input: { id: Schema.String, action: Schema.String },
  key: ["id"],                                   // existing (built): one lane per toast
  concurrency: "reject",
  services: [NotificationsApi],
  commit: (input) => Effect.flatMap(Effect.service(NotificationsApi), (api) => api.act(input)),
});

// machine.ts
// user-defined: Toast, ToastType, PauseReason, settle, counting, visible
const ToastType = Schema.Literal("info", "success", "error", "loading");
const Toast = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  type: ToastType,
  duration: Schema.NullOr(Schema.Number),
  version: Schema.Number,
  remaining: Schema.NullOr(Schema.Number),
  countingSince: Schema.NullOr(Schema.Number),
});
const PauseReason = Schema.Literal("item-hover", "focus-in", "window-blur", "page-hide", "swipe", "detached");

const Toaster = definition({
  id: "Toasts/Toaster",
  states: ["SHOWING"],
  events: {
    Show: { id: Schema.String, title: Schema.String, type: ToastType, ms: Schema.optional(Schema.Number) },
    Update: { id: Schema.String, title: Schema.String, type: ToastType },
    Dismiss: { id: Schema.NullOr(Schema.String), reason: Schema.Literal("close-press", "escape-key", "swipe") },
    Pause: { reason: PauseReason },
    Resume: { reason: PauseReason },
    Press: { id: Schema.String, action: Schema.String },
  },
  internalEvents: {
    Expired: { id: Schema.String },
    Pressed: { id: Schema.String },
    PressFailed: { id: Schema.String },
    PressUnsure: Flow.uncertain({ id: Schema.String }),
  },
  memory: {
    maxVisible: Flow.initial(Schema.Number, 3),
    toasts: Flow.initial(Schema.Array(Toast), []),
    paused: Flow.initial(Schema.Array(PauseReason), []),
    focusAfterClose: Flow.initial(Schema.NullOr(Schema.String), null),
  },
  operations: ({ E }) => ({
    press: pressAction.outcomes({
      success: E.Pressed.from((_v: void, { input }) => ({ id: input.id })),
      failure: E.PressFailed.from((_e: unknown, { input }) => ({ id: input.id })),
      unknown: E.PressUnsure.from((_u, { input }) => ({ id: input.id })),
    }),
  }),
});
```

```ts
type ToastRow = typeof Toast.Type;
type ToasterMemory = {
  readonly maxVisible: number;
  readonly toasts: ReadonlyArray<ToastRow>;
  readonly paused: ReadonlyArray<string>;
};

const visible = (m: ToasterMemory) => m.toasts.slice(0, m.maxVisible);
const counting = (m: ToasterMemory, held: (id: string) => boolean) =>
  m.paused.length > 0 ? [] : visible(m).filter((t) => t.duration !== null && !held(t.id));

// Moves time spent into `remaining` for toasts that stop, and stamps those that start.
const settle = (before: ToasterMemory, after: ToasterMemory, now: number, held: (id: string) => boolean) => {
  const was = new Set(counting(before, held).map((t) => t.id));
  const is = new Set(counting(after, held).map((t) => t.id));
  return after.toasts.map((t) => {
    const spent = was.has(t.id) && t.countingSince !== null ? now - t.countingSince : 0;
    const remaining = t.remaining === null ? null : t.remaining - spent;
    return { ...t, remaining, countingSince: is.has(t.id) ? now : null };
  });
};

export const ToasterMachine = machine(Toaster, ({ S, E, O }) => {
  const held = (operations: Operations) => (id: string) =>
    Option.match(O.press.get(operations, { id }), { onNone: () => false, onSome: (row) => row.pending });
  const fresh = (e: { readonly id: string; readonly title: string; readonly type: string; readonly ms?: number }) => {
    const duration = e.type === "loading" ? null : (e.ms ?? 5000);
    return { id: e.id, title: e.title, type: e.type, duration, version: 0, remaining: duration, countingSince: null };
  };
  return {
    default: S.SHOWING,
    states: {
      SHOWING: {
        schedules: {
          expire: {
            keys: ({ memory, operations }) =>                         // existing (Plan, T57): keyed schedule
              counting(memory, held(operations)).map((t) => ({ id: t.id })),
            schedule: ({ key, memory }) =>                            // NEW (proposed): `key` in the function
              memory.toasts.find((t) => t.id === key.id)?.remaining ?? 0,
            restartOn: ({ key, memory }) =>                           // existing (Plan, T57): per-key restartOn
              memory.toasts.find((t) => t.id === key.id)?.version,
            send: E.Expired.from((m) => ({ id: m.key.id })),          // existing (Plan, T57): metadata key
          },
        },
        on: {
          Show: {
            updateMemory: ({ memory, event, now, operations }) => {
              const exists = memory.toasts.some((t) => t.id === event.id);
              const toasts = exists
                ? memory.toasts.map((t) => (t.id === event.id ? { ...fresh(event), version: t.version + 1 } : t))
                : [fresh(event), ...memory.toasts];
              return { toasts: settle(memory, { ...memory, toasts }, now, held(operations)) };
            },
          },
          Update: {
            guard: [({ memory, event }) => memory.toasts.some((t) => t.id === event.id) || deny("Gone")],
            updateMemory: ({ memory, event, now, operations }) => {
              const toasts = memory.toasts.map((t) =>
                t.id !== event.id
                  ? t
                  : t.type === event.type
                    ? { ...t, title: event.title, version: t.version + 1, remaining: t.duration }
                    : { ...fresh(event), version: t.version + 1 },
              );
              return { toasts: settle(memory, { ...memory, toasts }, now, held(operations)) };
            },
          },
          Dismiss: {
            updateMemory: ({ memory, event, now, operations }) => close(memory, event.id, now, held(operations)),
          },
          Expired: {
            updateMemory: ({ memory, event, now, operations }) => close(memory, event.id, now, held(operations)),
          },
          Pause: {
            updateMemory: ({ memory, event, now, operations }) => {
              const after = { ...memory, paused: [...new Set([...memory.paused, event.reason])] };
              return { paused: after.paused, toasts: settle(memory, after, now, held(operations)) };
            },
          },
          Resume: {
            updateMemory: ({ memory, event, now, operations }) => {
              const after = { ...memory, paused: memory.paused.filter((r) => r !== event.reason) };
              return { paused: after.paused, toasts: settle(memory, after, now, held(operations)) };
            },
          },
          Press: {
            guard: [O.press.idle(({ event }) => ({ id: event.id }))],
            updateMemory: ({ memory, event, now, operations }) => ({
              toasts: settle(memory, memory, now, (id) => id === event.id || held(operations)(id)),
            }),
            actions: [O.press.commit(({ event }) => event)],
          },
          Pressed: {
            updateMemory: ({ memory, event, now, operations }) => close(memory, event.id, now, held(operations)),
          },
          PressFailed: {
            updateMemory: ({ memory, now, operations }) => ({ toasts: settle(memory, memory, now, held(operations)) }),
          },
          PressUnsure: {
            updateMemory: ({ memory, now, operations }) => ({ toasts: settle(memory, memory, now, held(operations)) }),
          },
        },
      },
    },
  };
});

// user-defined: close (one toast, or all when id is null), with the focus rule
function close(memory: ToasterMemory, id: string | null, now: number, held: (id: string) => boolean) {
  const at = memory.toasts.findIndex((t) => t.id === id);
  const toasts = id === null ? [] : memory.toasts.filter((t) => t.id !== id);
  const focusAfterClose = memory.toasts[at + 1]?.id ?? memory.toasts[at - 1]?.id ?? "return";
  return { toasts: settle(memory, { ...memory, toasts }, now, held), focusAfterClose };
}
```

Two notes on the sketch. `operations` in `updateMemory` holds the pre-turn lanes (@plan.Machines.O4). So Press
passes its own `held` predicate, which counts the press it is starting, and Pressed and PressFailed rely on their own
admitted ending (@plan.Machines.O3, "lane reads ... see the pre-turn lanes with the turn's own ending admitted").
The view selects `visible`, `counting` and each toast's due time from `s.schedules.expire`, and reads
`focusAfterClose`.

**Flow features exercised:** keyed schedules with per-key `restartOn` (an update restarts its countdown), lane rows
read in a schedule's `keys`, keyed `reject` lanes, one fixed `now` per turn for the time arithmetic, `deny` as
`update()`'s answer, and other actors sending to a shared toaster (@plan.Runtime.O4).

**What Flow lacks:**

- keyed schedules and per-key `restartOn` in production (@task.V3.T57);
- **NEW (proposed): the keyed schedule's function receives `key`.** @plan.Machines.O5 gives `restartOn` the key but
  not `schedule`. Without it, per-key durations need a `.each` trait per toast instead (@plan.Machines.O1). That
  works and costs a fragment and a host port to forward Pause.
- **A schedule that pauses and keeps its time left.** The sketch keeps the time in memory with `settle`. The carousel
  (rank 11), hover cards and video-like timers need the same thing. If they repeat it, a **NEW (proposed)**
  `pauseOn`/`resumeOn` pair on a schedule would remove `settle`. See decision 2.
- actor-to-actor `send` in production (@plan.Runtime.O4, built by @task.V3.T9).

**Catalogue overlap:** S29 ticket panels and S23 thermostat use keyed schedules, but neither pauses. S24 timed exam
has a deadline from memory that survives reload. The toaster is the first shape with time left kept across pauses.

**Stories.**

- **Usual:** show three toasts 1 s apart, hover at 2 s, leave at 6 s, and the first expires at 8 s. A promise toast
  goes loading, then success. Press an action held by the fake, see the toast stay, release, and see it close.
- **Stress:** 300 steps. Pause and Resume of all six reasons interleaved at random, Show bursts past `maxVisible`,
  updates during pauses, dismiss-all mid-press. After each step check that each toast's spent time plus `remaining`
  equals its duration since the last restart (a property over checkpoints), and that no paused or held toast expires.

### 4.4 Menu with submenus and pending items

**What it is.** A popup menu opened from a trigger or a context area (right-click or a 500 ms touch long-press).

- Hovering a submenu trigger opens its submenu after 100 ms.
- While a submenu is open, the pointer moving diagonally toward it keeps it open (the "safe area"). Resting in the
  safe area for 300 ms lets the item under the pointer take over.
- Typing letters jumps to a matching item; the buffer resets after 500 ms.
- An item whose action returns a Promise keeps the menu open and the item pending until it settles. A rejection keeps
  the menu open with the reason on the item. A resolution after the menu closed and reopened leaves the new menu
  open.
- Escape in a submenu closes only the submenu; ArrowLeft closes it and returns focus to its trigger.

**Behaviour.** States:

- CLOSED, with children IDLE and PRESSING (the long-press wait);
- OPEN, with children ROOT (no submenu), SUB_WAIT (hover delay), SUB_SHOWN and SUB_CROSSING (the pointer is in the
  safe area, heading to the submenu).

Memory: `highlighted`, `pendingSub` (the submenu a hovered trigger would open), `sub` (the open submenu's id),
`restingOn` (the item under the pointer while crossing), `typed` (the typeahead buffer), `closesOnActed` (items whose
current ending closes the menu), `errors` (keyed) and `focus` (where focus goes on close: `trigger` or `none`).
Pending is derived from the `act` rows.

| From            | Event                     | Guard                  | To / effect                                  |
| --------------- | ------------------------- | ---------------------- | -------------------------------------------- |
| CLOSED.IDLE     | Open { by }               | none                   | OPEN.ROOT; keyboard highlights first         |
| CLOSED.IDLE     | TouchDown                 | none                   | CLOSED.PRESSING (500 ms schedule)            |
| CLOSED.PRESSING | LongPressDue              | none                   | OPEN.ROOT, by touch                          |
| CLOSED.PRESSING | TouchMoved, TouchUp       | none                   | CLOSED.IDLE: scrolling or a tap cancels      |
| OPEN.ROOT       | HoverItem { key, sub }    | none                   | highlight; a submenu trigger goes SUB_WAIT   |
| OPEN.SUB_WAIT   | SubDue (100 ms)           | none                   | SUB_SHOWN; sub = trigger                     |
| OPEN.SUB_WAIT   | LeftTrigger               | none                   | ROOT: left before it opened, stays closed    |
| OPEN.SUB_SHOWN  | Heading                   | none                   | SUB_CROSSING (React computed the triangle)   |
| SUB_CROSSING    | HoverItem { key }         | none                   | restingOn = key; highlight unchanged         |
| SUB_CROSSING    | EnteredSub                | none                   | SUB_SHOWN                                    |
| SUB_CROSSING    | SafeAreaDue (300 ms)      | none                   | ROOT; highlight restingOn; close the sub     |
| OPEN.ROOT       | ArrowRight on a sub       | none                   | SUB_SHOWN                                    |
| OPEN.SUB_*      | ArrowLeft, Escape         | none                   | ROOT; highlighted = the sub's trigger        |
| OPEN.ROOT       | Escape, Tab, OutsidePress | none                   | CLOSED; focus = trigger on Escape only       |
| OPEN            | TypeChar { ch }           | none                   | typed += ch; highlight match; 500 ms reset   |
| OPEN            | TypeaheadDue              | none                   | typed = ""                                   |
| OPEN            | Pick { key }              | local item             | CLOSED; focus = trigger                      |
| OPEN            | Act { key, closes }       | `O.act.idle({ item })` | commit (owned by this OPEN activation)       |
| OPEN            | Acted { item }            | current, item closes   | CLOSED; focus = trigger                      |
| root            | Acted                     | late ending            | stays: the menu was closed or reopened       |
| any             | ActFailed { item }        | none                   | errors[item] = reason; stays open            |

Edge cases:

- **Hover then leave before 100 ms:** leaving goes from SUB_WAIT to ROOT. Exiting the state stops its schedule, so
  nothing opens.
- **Pointer rests on a sibling while crossing:** that is SUB_CROSSING plus SafeAreaDue, which upstream implements as
  a rest timer inside the geometry module.
- **A pointermove with no movement** (a WebKit scroll quirk): React filters it and sends nothing.
- **Unmount with the hover timer running:** exiting stops every schedule (@plan.Machines.O5). Upstream's
  `hoverTimer` and safe-area rest timer are not cleared by any cleanup the behaviours sidecar found; read by hand
  and not executed.
- **Prevented onSelect:** in Flow, Act with `closes: false` keeps the menu open after it resolves.
- **onSelect and onAction both pending:** one commit per item, and its Promise is the app's single action, so the
  "late rejection" case becomes ActFailed arriving after Acted. That cannot happen on one lane, so this test
  changes form.

**Upstream tests to replicate** (`menu-*.test.ts`, 36 tests; `tests/specs/menu.*`, 137):

Machine:

1. A pending item stays pending, and the menu open, until it resolves.
2. A rejection keeps the menu open and puts the reason in the item's error.
3. Resolving after the menu closed and reopened leaves it open.
4. A prevented select keeps the menu open after it resolves.
5. A pending action is not run again before it settles.
6. An item that opens a popup closes the menu at once.
7. Hovering a submenu trigger opens it after the delay. Leaving before the delay keeps it closed.
8. Moving toward an open submenu keeps it open. Resting on a sibling on the way moves to it once the safe area
   expires.
9. Moving to a sibling item closes the submenu.
10. Escape in a submenu closes only the submenu. ArrowLeft closes it and highlights its trigger.
11. A submenu keeps its parent open and keeps siblings from opening beside it.
12. A long press on a context area opens the menu by touch. A finger that moves off to scroll does not.
13. Typeahead matches labels, extends with Space while a buffer is active, and resets after 500 ms.
14. Focus returns to the trigger on Escape and after an item runs; Tab closes without returning it.

View: diagonal safe-area geometry (8 px padding), RTL flips the arrow keys and the side, a mouse press held on the
context area is left to right-click, submenus flip when there is no room, and announcements.

**Sketch.**

```ts
// contracts.ts
// user-defined: MenuApi, ActFailed, runItem
export const runItem = transaction({
  id: "Menu/act",
  input: { item: Schema.String },
  key: ["item"],
  concurrency: "reject",
  services: [MenuApi],
  commit: (input) => Effect.flatMap(Effect.service(MenuApi), (api) => api.act(input)),
});

// machine.ts
const Menu = definition({
  id: "Menu/Menu",
  states: [
    { CLOSED: ["IDLE", "PRESSING"] },                                  // existing (Plan, T17)
    { OPEN: ["ROOT", "SUB_WAIT", "SUB_SHOWN", "SUB_CROSSING"] },
  ],
  events: {
    Open: { by: Schema.Literal("pointer", "keyboard", "touch") },
    TouchDown: {},
    TouchMoved: {},
    TouchUp: {},
    HoverItem: { key: Schema.String, sub: Schema.NullOr(Schema.String) },
    LeftTrigger: {},
    Heading: {},
    EnteredSub: {},
    ArrowRight: {},
    ArrowLeft: {},
    Escape: {},
    Tab: {},
    OutsidePress: {},
    TypeChar: { ch: Schema.String, labels: Schema.Array(Schema.Struct({ key: Schema.String, label: Schema.String })) },
    Pick: { key: Schema.String },
    Act: { key: Schema.String, closes: Schema.Boolean },
  },
  internalEvents: {
    LongPressDue: {},
    SubDue: {},
    SafeAreaDue: {},
    TypeaheadDue: {},
    Acted: { item: Schema.String },
    ActFailed: { item: Schema.String, reason: Schema.String },
    ActUnsure: Flow.uncertain({ item: Schema.String }),
  },
  memory: {
    highlighted: Flow.initial(Schema.NullOr(Schema.String), null),
    pendingSub: Flow.initial(Schema.NullOr(Schema.String), null),
    sub: Flow.initial(Schema.NullOr(Schema.String), null),
    restingOn: Flow.initial(Schema.NullOr(Schema.String), null),
    typed: Flow.initial(Schema.String, ""),
    closesOnActed: Flow.initial(Schema.Array(Schema.String), []),
    errors: Flow.initial(Schema.Record({ key: Schema.String, value: Schema.String }), {}),
    focus: Flow.initial(Schema.Literal("trigger", "none"), "none"),
  },
  operations: ({ E }) => ({
    act: runItem.outcomes({
      success: E.Acted.from((_v: void, { input }) => ({ item: input.item })),
      failure: E.ActFailed.from((e: { readonly message: string }, { input }) => ({
        item: input.item,
        reason: e.message,
      })),
      unknown: E.ActUnsure.from((_u, { input }) => ({ item: input.item })),
    }),
  }),
});

// user-defined: firstMatch
const firstMatch = (labels: ReadonlyArray<{ readonly key: string; readonly label: string }>, typed: string) =>
  labels.find((l) => l.label.toLowerCase().startsWith(typed.toLowerCase()))?.key ?? null;

export const MenuMachine = machine(Menu, ({ S, E, O }) => ({
  default: S.CLOSED,
  on: {
    Acted: {},                                                         // late: stays
    ActFailed: { updateMemory: ({ memory, event }) => ({ errors: { ...memory.errors, [event.item]: event.reason } }) },
    ActUnsure: { updateMemory: ({ memory, event }) => ({ errors: { ...memory.errors, [event.item]: "unknown" } }) },
  },
  states: {
    CLOSED: {
      default: S.CLOSED.IDLE,
      on: { Open: { target: S.OPEN.ROOT, updateMemory: () => ({ highlighted: null, sub: null, focus: "none" }) } },
      states: {
        IDLE: { on: { TouchDown: S.CLOSED.PRESSING } },
        PRESSING: {
          schedules: { longPress: { schedule: "500 millis", send: E.LongPressDue } },
          on: { LongPressDue: S.OPEN.ROOT, TouchMoved: S.CLOSED.IDLE, TouchUp: S.CLOSED.IDLE },
        },
      },
    },
    OPEN: {
      default: S.OPEN.ROOT,
      schedules: {
        typeahead: { schedule: "500 millis", send: E.TypeaheadDue, armOn: ["TypeChar"] },   // existing (built)
      },
      on: {
        TypeChar: {
          updateMemory: ({ memory, event }) => {
            const typed = memory.typed + event.ch;
            return { typed, highlighted: firstMatch(event.labels, typed) ?? memory.highlighted };
          },
        },
        TypeaheadDue: { updateMemory: () => ({ typed: "" }) },
        Pick: { target: S.CLOSED, updateMemory: () => ({ focus: "trigger" }) },
        Act: {
          guard: [O.act.idle(({ event }) => ({ item: event.key }))],
          updateMemory: ({ memory, event }) => {
            const { [event.key]: _cleared, ...errors } = memory.errors;
            const rest = memory.closesOnActed.filter((k) => k !== event.key);
            return { errors, closesOnActed: event.closes ? [...rest, event.key] : rest };
          },
          actions: [O.act.commit(({ event }) => ({ item: event.key }))],
        },
        Acted: [
          {
            guard: [({ memory, event }) => memory.closesOnActed.includes(event.item) || deny("KeepsOpen")],
            target: S.CLOSED,
            updateMemory: () => ({ focus: "trigger", closesOnActed: [] }),
          },
          {},
        ],
        Tab: { target: S.CLOSED, updateMemory: () => ({ focus: "none" }) },
        OutsidePress: { target: S.CLOSED, updateMemory: () => ({ focus: "none" }) },
      },
      states: {
        ROOT: {
          on: {
            HoverItem: [
              { guard: [({ event }) => event.sub !== null || deny("NotASub")], target: S.OPEN.SUB_WAIT,
                updateMemory: ({ event }) => ({ highlighted: event.key, pendingSub: event.sub }) },
              { updateMemory: ({ event }) => ({ highlighted: event.key }) },
            ],
            ArrowRight: {
              guard: [({ memory }) => memory.pendingSub !== null || deny("NotASub")],
              target: S.OPEN.SUB_SHOWN,
              updateMemory: ({ memory }) => ({ sub: memory.pendingSub }),
            },
            Escape: { target: S.CLOSED, updateMemory: () => ({ focus: "trigger" }) },
          },
        },
        SUB_WAIT: {
          schedules: { hoverDelay: { schedule: "100 millis", send: E.SubDue } },
          on: {
            SubDue: { target: S.OPEN.SUB_SHOWN, updateMemory: ({ memory }) => ({ sub: memory.pendingSub }) },
            LeftTrigger: { target: S.OPEN.ROOT, updateMemory: () => ({ pendingSub: null }) },
            HoverItem: {
              target: S.OPEN.ROOT,
              updateMemory: ({ event }) => ({ highlighted: event.key, pendingSub: null }),
            },
            Escape: { target: S.OPEN.ROOT, updateMemory: () => ({ pendingSub: null }) },
          },
        },
        SUB_SHOWN: {
          on: {
            Heading: S.OPEN.SUB_CROSSING,
            HoverItem: [
              { guard: [({ memory, event }) => event.key !== memory.highlighted || deny("SameTrigger")],
                target: S.OPEN.ROOT,
                updateMemory: ({ event }) => ({ highlighted: event.key, sub: null, pendingSub: null }) },
              {},
            ],
            ArrowLeft: { target: S.OPEN.ROOT, updateMemory: () => ({ sub: null }) },
            Escape: { target: S.OPEN.ROOT, updateMemory: () => ({ sub: null }) },
          },
        },
        SUB_CROSSING: {
          schedules: { safeArea: { schedule: "300 millis", send: E.SafeAreaDue } },
          on: {
            HoverItem: { updateMemory: ({ event }) => ({ restingOn: event.key }) },
            EnteredSub: { target: S.OPEN.SUB_SHOWN, updateMemory: () => ({ restingOn: null }) },
            SafeAreaDue: {
              target: S.OPEN.ROOT,
              updateMemory: ({ memory }) => ({ sub: null, highlighted: memory.restingOn, restingOn: null }),
            },
            Escape: { target: S.OPEN.ROOT, updateMemory: () => ({ sub: null, restingOn: null }) },
          },
        },
      },
    },
  },
}));
```

Two things are simplified here. A resting pointer that lands on another submenu trigger should go to SUB_WAIT, not
ROOT; the fixture adds that alternative. Item activation inside the submenu reuses OPEN's `Act`, because handlers
fall through to ancestors.

**Flow features exercised:** two levels of compound states, schedules that stop on exit (hover intent, safe area,
long press), `armOn` restarting the typeahead reset, handler fall-through to ancestors, keyed `reject` lanes, late
endings at the root, and `deny` codes.

**What Flow lacks:**

- compound states in production (@task.V3.T17);
- **menus of any depth:** states are static, so a fixed nesting is all a machine can declare. A menu of arbitrary
  depth needs the open path in memory, with keyed schedules for each level's hover delay (@task.V3.T57), or a
  recursive fragment. Flow has no recursive fragment, and this proposal does not suggest one; the fixture stays at
  one submenu level.
- **`closesOnActed`** is the single wart. It records per item whether a current Acted should close the menu, because
  the commit's mapping cannot carry the triggering event's `closes`. A **NEW (proposed)** way to read the starting
  event in a success mapper would remove it. Small, see decision 5.

**Catalogue overlap:** none direct. Its owner test is the same mechanism as S02's late results (lr). Its compound
states and Escape back one level echo S06 quote wizard's back and forward.

**Stories.**

- **Usual:** open by click, hover "Share" for 150 ms (the submenu opens), move diagonally across "Copy" (stays),
  enter the submenu, run "Email" (held), close, reopen, release, and the menu stays open. Long-press a context area
  by touch.
- **Stress:** 400 steps of hover, leave, heading and rest events at gaps of 0 to 400 ms around the 100 and 300 ms
  timers, with Act bursts on five items whose answers are held, failed or lost. Check that a submenu is open only
  after its trigger was rested on for 100 ms or opened by key, and that no current Acted with `closes: false`
  closes the menu.

### 4.5 Number input with hold-to-repeat

**What it is.** A numeric field with − and + buttons.

- A press steps once. Holding repeats after 400 ms, then every 60 ms, and stops at a bound.
- The mouse wheel steps when turned on and commits 300 ms after the last turn, because a wheel has no release.
- Typing follows the value only while it is a number within the bounds. The value commits on blur or release.
- A commit reports a change only when the value differs from where the interaction started.
- Escape, blur, a second finger or a pointer moving past the tolerance cancels a press.

**Behaviour.** States: IDLE, HOLDING with children DELAY and REPEAT, and WHEELING. Memory: `value`, `text`,
`startValue` (the value at the start of this interaction, or null), `committed` (the last committed value, which the
app reads), `direction` and `size` (step, large or small). Inputs: `min`, `max`, `step`.

| From           | Event                     | Guard              | To / effect                                   |
| -------------- | ------------------------- | ------------------ | --------------------------------------------- |
| IDLE           | Press { direction, size } | can step that way  | HOLDING.DELAY; step once; startValue ??= v    |
| HOLDING.DELAY  | RepeatDue (400 ms)        | none               | HOLDING.REPEAT                                |
| HOLDING.REPEAT | Tick (every 60 ms)        | can step           | step                                          |
| HOLDING.REPEAT | Tick                      | at bound           | IDLE; commit                                  |
| HOLDING        | Release, Cancel           | none               | IDLE; commit                                  |
| IDLE, WHEELING | Wheel { direction }       | wheel on, can step | re-enter WHEELING (300 ms); step              |
| WHEELING       | WheelDue                  | none               | IDLE; commit                                  |
| WHEELING       | Blur                      | none               | IDLE; commit (the timer stops on exit)        |
| IDLE           | Typed { text }            | none               | text = text; value = parse if valid in bounds |
| IDLE           | Blur, Enter               | none               | commit; text = format(value)                  |
| any            | Set { value }             | none               | value; text; startValue = null; committed = v |
| IDLE           | Home, End                 | none               | value = min, or the highest grid value <= max |

Commit sets `committed = value` only when `startValue !== null` and the value differs from `startValue`. It always
clears `startValue`. A press at a bound is Denied, so React draws the button disabled from `check(s, Press)`.

Edge cases:

- **Hold reaches the bound mid-repeat:** it stops and commits once.
- **Release during DELAY:** one step, committed on release.
- **Wheel then blur within 300 ms:** commits now; the wheel timer dies with WHEELING.
- **Set from outside, then a user change back to the earlier value:** reported, because `startValue` resets on Set.
- **A controller step:** leaves nothing for the next blur to commit, because Set clears `startValue`.
- **Element disabled mid-hold:** React sends Cancel; upstream `hold.ts:127` returns without clearing `press`, which
  the adversary sidecar flagged as minor.

**Upstream tests to replicate** (`number-input.test.ts`, 12 tests; `hold.test.ts`, 26; `tests/specs/number-input.*`,
64):

Machine:

1. Holding a button repeats the step: one step at once, the next at 400 ms, then every 60 ms.
2. Repeating stops at the bound. End and the increment button stop at the highest value on the step grid.
3. A press commits when the button is released, once.
4. Typing sends change only once the text is committed. The value commits when focus leaves.
5. Typing follows the value only while it is a number within the bounds.
6. Steps from empty start at 0, within the bounds.
7. A commit after a value set from outside reports the user's change back to an earlier value.
8. A controller step leaves nothing for the next blur to commit.
9. The mouse wheel does nothing unless turned on, steps a focused field when on, and commits after a 300 ms pause.
10. A short press is not held. Escape cancels a press, held or not, without a click.
11. A button at its bound reports why it is disabled (Denied with `AtBound`).

Pure functions: formatting, percent handling, snapping to the step grid, large and small steps.

View: scrub areas with pointer lock, the keyboard each platform needs, `aria-valuenow`, RTL and hydration.

**Sketch.**

```ts
// machine.ts (no operations: the app reads `committed`)
const Stepper = definition({
  id: "Number/Stepper",
  states: ["IDLE", { HOLDING: ["DELAY", "REPEAT"] }, "WHEELING"],     // existing (Plan, T17)
  events: {
    Press: { direction: Schema.Literal(-1, 1), size: Schema.Literal("step", "large", "small") },
    Release: {},
    Cancel: {},
    Wheel: { direction: Schema.Literal(-1, 1) },
    Typed: { text: Schema.String },
    Blur: {},
    Set: { value: Schema.NullOr(Schema.Number) },
  },
  internalEvents: { RepeatDue: {}, Tick: {}, WheelDue: {} },
  memory: {
    min: Flow.input(Schema.Number),
    max: Flow.input(Schema.Number),
    step: Flow.input(Schema.Number),
    wheel: Flow.input(Schema.Boolean),
    value: Flow.initial(Schema.NullOr(Schema.Number), null),
    text: Flow.initial(Schema.String, ""),
    startValue: Flow.initial(Schema.NullOr(Schema.Number), null),
    committed: Flow.initial(Schema.NullOr(Schema.Number), null),
    direction: Flow.initial(Schema.Literal(-1, 1), 1),
    size: Flow.initial(Schema.Literal("step", "large", "small"), "step"),
  },
});

// user-defined: StepperMemory, sizeOf, next, canStep, stepped, commit, parse
type StepperMemory = typeof Stepper.Memory.Type;
const sizeOf = (m: StepperMemory) => (m.size === "large" ? m.step * 10 : m.size === "small" ? m.step / 10 : m.step);
const next = (m: StepperMemory) => {
  const raw = (m.value ?? 0) + m.direction * sizeOf(m);
  const snapped = Math.round(raw / sizeOf(m)) * sizeOf(m);
  return Math.min(m.max, Math.max(m.min, snapped));
};
const canStep = (m: StepperMemory) => m.value === null || next(m) !== m.value || deny("AtBound");
const stepped = (m: StepperMemory) => ({ value: next(m), text: String(next(m)), startValue: m.startValue ?? m.value });
const commit = (m: StepperMemory) => ({
  committed: m.startValue !== null && m.value !== m.startValue ? m.value : m.committed,
  startValue: null,
});
const parse = (m: StepperMemory, text: string) => {
  const n = Number(text);
  return text.trim() !== "" && Number.isFinite(n) && n >= m.min && n <= m.max ? n : null;
};

export const StepperMachine = machine(Stepper, ({ S, E }) => ({
  default: S.IDLE,
  on: {
    Set: {
      updateMemory: ({ event }) => ({
        value: event.value, text: event.value === null ? "" : String(event.value), startValue: null,
        committed: event.value,
      }),
    },
  },
  states: {
    IDLE: {
      on: {
        Press: {
          guard: [({ memory, event }) => canStep({ ...memory, direction: event.direction, size: event.size })],
          target: S.HOLDING.DELAY,
          updateMemory: ({ memory, event }) =>
            stepped({ ...memory, direction: event.direction, size: event.size }),
        },
        Wheel: {
          guard: [({ memory }) => memory.wheel || deny("WheelOff"),
            ({ memory, event }) => canStep({ ...memory, direction: event.direction, size: "step" })],
          target: S.WHEELING,
          updateMemory: ({ memory, event }) => ({ ...stepped({ ...memory, direction: event.direction }),
            direction: event.direction }),
        },
        Typed: {
          updateMemory: ({ memory, event }) => {
            const parsed = parse(memory, event.text);
            return parsed === null
              ? { text: event.text }
              : { text: event.text, value: parsed, startValue: memory.startValue ?? memory.value };
          },
        },
        Blur: {
          updateMemory: ({ memory }) => ({
            ...commit(memory),
            text: memory.value === null ? "" : String(memory.value),
          }),
        },
      },
    },
    HOLDING: {
      default: S.HOLDING.DELAY,
      on: {
        Release: { target: S.IDLE, updateMemory: ({ memory }) => commit(memory) },
        Cancel: { target: S.IDLE, updateMemory: ({ memory }) => commit(memory) },
      },
      states: {
        DELAY: {
          schedules: { delay: { schedule: "400 millis", send: E.RepeatDue } },
          on: { RepeatDue: S.HOLDING.REPEAT },
        },
        REPEAT: {
          schedules: {
            repeat: { schedule: Schedule.spaced("60 millis"), send: E.Tick },  // existing (Plan, T57): Effect Schedule
          },
          on: {
            Tick: [
              { guard: [({ memory }) => canStep(memory)], updateMemory: ({ memory }) => stepped(memory) },
              { target: S.IDLE, updateMemory: ({ memory }) => commit(memory) },
            ],
          },
        },
      },
    },
    WHEELING: {
      schedules: { settle: { schedule: "300 millis", send: E.WheelDue } },
      on: {
        Wheel: {
          guard: [({ memory, event }) => canStep({ ...memory, direction: event.direction })],
          target: S.WHEELING,                                                 // re-entry restarts the 300 ms
          updateMemory: ({ memory, event }) => ({ ...stepped({ ...memory, direction: event.direction }),
            direction: event.direction }),
        },
        WheelDue: { target: S.IDLE, updateMemory: ({ memory }) => commit(memory) },
        Blur: { target: S.IDLE, updateMemory: ({ memory }) => commit(memory) },
      },
    },
  },
}));
```

`Stepper.Memory` is the definition's Memory Schema (@plan.Machines.O1). Today's production can run a flat variant:
the states HOLD_DELAY and HOLD_REPEAT, with REPEAT's schedule as `"60 millis"` and `armOn: [Flow.entry, "Tick"]`, so
each tick re-arms the next.

**Flow features exercised:** compound states with a schedule per phase, a multi-step Effect `Schedule`, re-entry as
debounce, `Flow.input` bounds, and `check` driving a disabled state. It is the smallest fixture with three
interacting timers.

**What Flow lacks:** compound states and `Flow.input` (@task.V3.T17), and multi-step `Schedule`s (@task.V3.T57).
Nothing new.

**Catalogue overlap:** S23 thermostat. Its setpoint stepper is this primitive with a `cancel` write behind it.
Pairing them (the stepper commits into S23's write) would make one strong fixture; see decision 1.

**Stories.**

- **Usual:** press + and hold for 1 s (1 step + 1 at 400 ms + 10 more), release, and one commit. Wheel three times
  100 ms apart, then one commit 300 ms after the last. Type "12", blur, commit. Set from outside, then step back.
- **Stress:** 500 steps of Press, Release, Cancel, Wheel and Blur at gaps of 0 to 500 ms near the bounds. Check that
  the value is always on the grid and within the bounds, that every interaction commits at most once, and that a
  commit never equals its start value.

### 4.6 Lazy tree

**What it is.** An outline of nested items.

- A branch with no children yet loads them when expanded, with a per-branch abortable load, and expands when they
  arrive.
- Expanding again while loading cancels. A failed load marks the branch, and the next expand tries again.
- With automatic selection, a key that steps into a loading branch selects its first child once it shows. The key
  is forgotten if focus moved on, left the tree, or the branch was collapsed.
- Branches show checked or mixed from their leaves. A branch whose children have not loaded checks like a leaf.
- Items reorder by keyboard (Up, Down, Left and Right move a grabbed item with its children; Space drops in one
  change; Escape puts everything back) or by drag. A row the owner deletes ends the move.

**Behaviour.** States: BROWSING and MOVING. Memory:

- `nodes`: the outline as rows, each `{ key, parent, label, branch }`;
- `expanded` and `wanted` (branches asked to open whose children are not loaded);
- `failed`;
- `focused` and `selected`;
- `stepInto` (a branch a key stepped into while it loads);
- `checked`;
- `moveStart` (the rows when a move began).

Loading is derived: a key is loading while it is in `wanted` and its placement row is Pending. It is never stored.

| From     | Event                    | Guard                  | To / effect                                         |
| -------- | ------------------------ | ---------------------- | --------------------------------------------------- |
| BROWSING | Expand { key }           | children loaded        | expanded += key                                     |
| BROWSING | Expand { key }           | not loaded, not wanted | wanted += key; failed -= key (places a load)        |
| BROWSING | Expand { key }           | wanted (loading)       | wanted -= key: cancels the load                     |
| BROWSING | Collapse { key }         | none                   | expanded -= key; wanted -= key; drop its stepInto   |
| BROWSING | StepRight { key }        | not loaded             | stepInto = key; wanted += key if absent             |
| BROWSING | Focus { key }, FocusLeft | none                   | focused; stepInto = null                            |
| any      | Loaded { parent, kids }  | none                   | nodes += kids; wanted -= parent; expanded += parent |
| any      | LoadFailed { parent }    | none                   | wanted -= parent; failed += parent                  |
| BROWSING | Check { key }            | not disabled           | checked = toggled(nodes, checked, key)              |
| BROWSING | Grab { key }             | none                   | MOVING; moveStart = nodes                           |
| MOVING   | Move { dir }             | within maxDepth        | nodes = moved(nodes, key, dir)                      |
| MOVING   | Drop                     | none                   | BROWSING; one change reported                       |
| MOVING   | Escape                   | none                   | BROWSING; nodes = moveStart                         |
| MOVING   | Removed { key }          | key is the moving item | BROWSING; nodes = moveStart without key             |

Loaded also moves focus and selection to the first child when `stepInto` names its parent, then clears `stepInto`.

Edge cases:

- **Collapse while loading:** removing the key from `wanted` releases its placement, which interrupts the request
  once (@plan.Machines.O6). No loading mark can stay behind. Upstream leaves one: `tree-api.ts:643-659` aborts the
  load on collapse but never clears `store.loading`. Read by hand, this matches the adversary sidecar's reading; it
  was not executed. Our test 6 pins the correct behaviour.
- **Expand, collapse, expand quickly:** the second placement starts a fresh request; the first ended once.
- **Reload mid-load:** the tree is persisted. On restore, `wanted` places the load again and the fake sees one new
  request. `expanded` and focus come back.
- **A move in progress at reload:** MOVING would be restored with its `moveStart`. That is wrong for a gesture; see
  the gap below.

**Upstream tests to replicate** (`tree*.test.ts`, 69 tests; `tests/specs/tree.*`, 51):

Machine:

1. A branch with no children loads them, then expands.
2. A failed load marks the branch, and the next expand tries again.
3. Expanding again while loading cancels.
4. Right into a loading branch selects its first child once it shows. The child keeps the key press that stepped
   into it.
5. That selection is dropped once focus moved on, once focus left the tree, or once the branch was collapsed.
6. (Ours) A collapsed loading branch shows no loading mark.
7. Right expands, then steps in; Left steps out, then collapses. Up and Down skip collapsed branches.
8. `*` expands every sibling branch.
9. A branch is checked when all its leaves are, and mixed when some are. Independent checks never cascade.
10. A branch whose children have not loaded checks like a leaf.
11. Refused items keep their state and shield what is under them.
12. Up and Down move an item with its children, and Space drops it in one change.
13. Left and Right take an item out a level and in one, as far as the rows around allow. maxDepth caps it.
14. Escape during a move puts the rows back. A row the owner deletes ends the move.
15. (Ours) Reload mid-load requests the children once and restores what was expanded.

Pure functions: outline levels, positions among siblings, subtree moves and depth ranges, and checked derivation.

View: typeahead on labels, RTL arrow swap, roving focus across rendered rows, virtualised rows ("focus lands once it
renders"), announcements and link items.

**Sketch.**

```ts
// contracts.ts
// user-defined: Node, FilesApi, children
export const Node = Schema.Struct({
  key: Schema.String, parent: Schema.NullOr(Schema.String), label: Schema.String, branch: Schema.Boolean,
});

export const children = resource({
  id: "Files/children",
  input: { parent: Schema.String },
  output: Schema.Array(Node),
  key: ["parent"],
  services: [FilesApi],
  staleTime: "5 minutes",
  gcTime: "0 millis",
  lookup: (input) => Effect.flatMap(Effect.service(FilesApi), (api) => api.children(input)),
});

// machine.ts
const Files = definition({
  id: "Files/Tree",
  persist: true,                                                        // existing (built)
  states: ["BROWSING", "MOVING"],
  events: {
    Expand: { key: Schema.String },
    Collapse: { key: Schema.String },
    StepRight: { key: Schema.String },
    Focus: { key: Schema.String },
    FocusLeft: {},
    Check: { key: Schema.String },
    Grab: { key: Schema.String },
    Move: { dir: Schema.Literal("up", "down", "in", "out") },
    Drop: {},
    Escape: {},
    Removed: { key: Schema.String },
  },
  internalEvents: {
    Loaded: { parent: Schema.String, kids: Schema.Array(Node) },
    LoadFailed: { parent: Schema.String },
  },
  memory: {
    tree: Flow.input(Schema.String),
    maxDepth: Flow.initial(Schema.Number, 8),
    nodes: Flow.initial(Schema.Array(Node), []),
    expanded: Flow.initial(Schema.Array(Schema.String), []),
    wanted: Flow.initial(Schema.Array(Schema.String), []),
    failed: Flow.initial(Schema.Array(Schema.String), []),
    focused: Flow.initial(Schema.NullOr(Schema.String), null),
    selected: Flow.initial(Schema.NullOr(Schema.String), null),
    stepInto: Flow.initial(Schema.NullOr(Schema.String), null),
    checked: Flow.initial(Schema.Array(Schema.String), []),
    moving: Flow.initial(Schema.NullOr(Schema.String), null),
    moveStart: Flow.initial(Schema.NullOr(Schema.Array(Node)), null),
  },
  operations: ({ E }) => ({
    children: children.outcomes({
      value: E.Loaded.from((kids: ReadonlyArray<typeof Node.Type>, { key }) => ({ parent: key.parent, kids })),
      failure: { FilesDown: E.LoadFailed.from((_e, { key }) => ({ parent: key.parent })),
        Defect: E.LoadFailed.from((_e, { key }) => ({ parent: key.parent })),
        Interrupted: Flow.ignore },                                     // existing (Plan, T21): Flow.ignore
    }),
  }),
});

// user-defined: without, loaded, toggled, moved (pure outline functions, tested on their own)
const without = (list: ReadonlyArray<string>, key: string) => list.filter((k) => k !== key);
const loaded = (nodes: ReadonlyArray<typeof Node.Type>, key: string) => nodes.some((n) => n.parent === key);

export const FilesMachine = machine(Files, ({ S, O }) => ({
  default: S.BROWSING,
  activities: [
    O.children.subscribe.each(({ memory }) => memory.wanted.map((parent) => ({ parent }))),  // existing (Plan, T21)
  ],
  on: {
    Loaded: {
      updateMemory: ({ memory, event }) => {
        const first = event.kids[0]?.key ?? null;
        const stepped = memory.stepInto === event.parent && first !== null;
        return {
          nodes: [...memory.nodes.filter((n) => n.parent !== event.parent), ...event.kids],
          wanted: without(memory.wanted, event.parent),
          expanded: [...new Set([...memory.expanded, event.parent])],
          stepInto: stepped ? null : memory.stepInto,
          focused: stepped ? first : memory.focused,
          selected: stepped ? first : memory.selected,
        };
      },
    },
    LoadFailed: {
      updateMemory: ({ memory, event }) => ({
        wanted: without(memory.wanted, event.parent),
        failed: [...new Set([...memory.failed, event.parent])],
        stepInto: memory.stepInto === event.parent ? null : memory.stepInto,
      }),
    },
  },
  states: {
    BROWSING: {
      on: {
        Expand: [
          { guard: [({ memory, event }) => loaded(memory.nodes, event.key) || deny("NotLoaded")],
            updateMemory: ({ memory, event }) => ({ expanded: [...new Set([...memory.expanded, event.key])] }) },
          { guard: [({ memory, event }) => !memory.wanted.includes(event.key) || deny("Loading")],
            updateMemory: ({ memory, event }) => ({
              wanted: [...memory.wanted, event.key], failed: without(memory.failed, event.key),
            }) },
          { updateMemory: ({ memory, event }) => ({
              wanted: without(memory.wanted, event.key),
              stepInto: memory.stepInto === event.key ? null : memory.stepInto,
            }) },
        ],
        Collapse: {
          updateMemory: ({ memory, event }) => ({
            expanded: without(memory.expanded, event.key),
            wanted: without(memory.wanted, event.key),
            stepInto: memory.stepInto === event.key ? null : memory.stepInto,
          }),
        },
        StepRight: {
          guard: [({ memory, event }) => !loaded(memory.nodes, event.key) || deny("Loaded")],
          updateMemory: ({ memory, event }) => ({
            stepInto: event.key,
            wanted: memory.wanted.includes(event.key) ? memory.wanted : [...memory.wanted, event.key],
          }),
        },
        Focus: { updateMemory: ({ event }) => ({ focused: event.key, stepInto: null }) },
        FocusLeft: { updateMemory: () => ({ stepInto: null }) },
        Check: { updateMemory: ({ memory, event }) => ({ checked: toggled(memory.nodes, memory.checked, event.key) }) },
        Grab: {
          target: S.MOVING,
          updateMemory: ({ memory, event }) => ({ moving: event.key, moveStart: memory.nodes }),
        },
      },
    },
    MOVING: {
      on: {
        Move: {
          updateMemory: ({ memory, event }) => ({
            nodes: moved(memory.nodes, memory.moving ?? "", event.dir, memory.maxDepth),
          }),
        },
        Drop: { target: S.BROWSING, updateMemory: () => ({ moving: null, moveStart: null }) },
        Escape: {
          target: S.BROWSING,
          updateMemory: ({ memory }) => ({ nodes: memory.moveStart ?? memory.nodes, moving: null, moveStart: null }),
        },
        Removed: {
          guard: [({ memory, event }) => memory.moving === event.key || deny("NotMoving")],
          target: S.BROWSING,
          updateMemory: ({ memory, event }) => ({
            nodes: (memory.moveStart ?? memory.nodes).filter((n) => n.key !== event.key),
            moving: null, moveStart: null,
          }),
        },
      },
    },
  },
}));
```

`toggled` and `moved` are the pure outline functions; they are named here and written in the fixture. A root-level
`activities` list is @plan.Machines.O6 ("declared in a state ... or a trait body"). If the root does not count as a
state for activities, the fixture places it in a parent compound wrapping BROWSING and MOVING.

**Flow features exercised:** `subscribe.each` (one session per wanted branch, released on removal), `value`
outcomes, `Flow.ignore` for interruptions the machine caused, persistence with placements re-established on restore,
a stored focus target (`focused`) that React applies, and derived loading.

**What Flow lacks:**

- `subscribe.each` and `value` mapping in production (@task.V3.T21). Today one actor has one lane per one-off read
  operation (@plan.Operations.O2), so concurrent branch loads cannot be written with `lookup`.
- **NEW (proposed): a state that is not restored.** A persisted actor saves its whole state (@plan.Persistence.O2),
  so a reload mid-move restores MOVING with no pointer or key held. Options: split the move into a local actor (no
  new API), or mark a state as returning to its parent's default on restore. See decision 4.

**Catalogue overlap:** S22 Kanban (reorder with Escape, but serialised server writes). S15 rows edited in place
(keyed reads). S19 lazy settings panel is lazy code, not lazy data, so there is no real overlap.

**Stories.**

- **Usual:** expand "src" (held), StepRight into it, release, and the first child is focused and selected. Collapse
  "docs" while it loads. Fail "tests" once, then retry. Grab a file, move it in and up, press Escape. Reload with
  "lib" loading.
- **Stress:** 400 steps over a generated outline 6 deep. Expand, Collapse and StepRight at random on loading
  branches, with answers reordered, failed and late, and a reload every 50 steps. Check that the fake saw no request
  for a branch that was not wanted at the time, that each wanted branch has at most one request in flight, and that
  `expanded` only holds loaded branches.

### 4.7 Token input: undo groups and late-settling tokens

**What it is.** A text field that holds text and tokens (file mentions, skills, a model), as in an AI prompt box.

- A token can be inserted while it loads, with a pending Promise. It settles to its label or, on failure, is removed
  with an announcement.
- Undo and redo cover text and tokens. Edits of one kind (insert or delete) within 500 ms join one undo step. A caret
  jump seals the step. The history keeps 100 entries.
- A token removed while it loads comes back settled on undo, because settling rewrites every history entry.
- IME composition is never cut and seals its step when it ends.

**Behaviour.** States: EDITING and COMPOSING. Memory: `value` (a list of text and tokens), `history` (`entries`,
`index`, `open` as `{ group, at }` or null) and `loading` (token ids whose load is still wanted, independent of
whether the token is in the value).

| From      | Event                       | Guard         | Effect                                                   |
| --------- | --------------------------- | ------------- | -------------------------------------------------------- |
| EDITING   | Edit { value, group }       | not read-only | value; record (joins if same group, now - at < 500)      |
| EDITING   | InsertToken { token, load } | not read-only | value with the token; record; if load, loading += token  |
| EDITING   | RemoveToken { id }          | not read-only | value without it; record (loading keeps the token)       |
| EDITING   | Undo                        | index > 0     | index - 1; value = entries[index - 1]; open = null       |
| EDITING   | Redo                        | index < last  | index + 1; value = entries[index + 1]; open = null       |
| EDITING   | Seal (caret jump)           | none          | open = null                                              |
| EDITING   | CompositionStart            | none          | COMPOSING                                                |
| COMPOSING | Edit                        | none          | value only; not recorded                                 |
| COMPOSING | CompositionEnd { value }    | none          | EDITING; value; record; open = null                      |
| any       | Resolved { id, label }      | none          | loading -= id; settle the token in value and every entry |
| any       | ResolveFailed { id }        | none          | loading -= id; drop the token from value and entries     |

Record: drop the redo tail; join the last entry when the group matches within 500 ms; otherwise push; shift past 100.

Edge cases:

- **Removed while loading, then undo:** the load continues because `loading` still holds the id. Resolved rewrites
  the entries, so undo brings back a settled token.
- **A refused undo** (read-only, or a host guard): the whole turn is denied, so `index` and `value` move together or
  not at all. Upstream's `token-input-api.ts:391-398` moves the stack before `commit` can refuse, so a refused undo
  appears to skip a step on the next undo. That was read by hand and not executed. Our test 6 pins atomicity.
- **A repeated id:** names one token, so updating or removing it touches only that one.
- **Reload with a draft and a loading token:** the draft and history are restored, and the load is placed again.

**Upstream tests to replicate** (`token-input*.test.ts`, 29 tests; `tests/specs/token-input.*`, 33;
`history.test.ts`, 5):

Machine:

1. A token removed while it loads comes back settled on undo.
2. A repeated id names one token, so updating or removing it touches only that one.
3. A token that fails to load is removed, with an announcement.
4. A loading token settles itself, even when the value was replaced while it was inserted.
5. Edits of one group within 500 ms are one undo step. A caret jump or 500 ms of quiet starts a new one.
6. An undo the owner refuses is reported, and its entry stays applied. The next undo goes one step back from there.
7. Undo then a new edit drops the redo tail. The history keeps 100 entries.
8. Composition never records partial text and seals its step at the end.
9. (Ours) Reload restores the draft and history and settles a token that was loading.

Pure functions: value normalising (adjacent text merges, empty text drops), range edits that never split a token,
word and line deletion, and the clipboard codec round trip (malformed links stay text).

View: armed token deletion (the first Backspace selects, the second removes), caret moved to a token's edge, paste
and drop, `contenteditable` hosts and hydration.

**Sketch.**

```ts
// contracts.ts
// user-defined: Mention, MentionsApi, resolveMention
export const resolveMention = resource({
  id: "Prompt/mention",
  input: { id: Schema.String, ref: Schema.String },
  output: Schema.Struct({ label: Schema.String }),
  key: ["id"],
  services: [MentionsApi],
  staleTime: "Infinity",
  gcTime: "0 millis",
  lookup: (input) => Effect.flatMap(Effect.service(MentionsApi), (api) => api.resolve(input)),
});

// machine.ts
// user-defined: Token, Piece, Entry
const Token = Schema.Struct({
  id: Schema.String, ref: Schema.String, label: Schema.String, status: Schema.Literal("ready", "pending"),
});
const Piece = Schema.Union(Schema.String, Token);
const Entry = Schema.Array(Piece);

const Prompt = definition({
  id: "Prompt/Input",
  persist: true,
  states: ["EDITING", "COMPOSING"],
  events: {
    Edit: { value: Entry, group: Schema.Literal("insert", "delete") },
    InsertToken: { value: Entry, token: Token, load: Schema.Boolean },
    RemoveToken: { id: Schema.String },
    Undo: {},
    Redo: {},
    Seal: {},
    CompositionStart: {},
    CompositionEnd: { value: Entry },
  },
  internalEvents: {
    Resolved: { id: Schema.String, label: Schema.String },
    ResolveFailed: { id: Schema.String },
  },
  memory: {
    draft: Flow.input(Schema.String),
    readOnly: Flow.initial(Schema.Boolean, false),
    value: Flow.initial(Entry, []),
    entries: Flow.initial(Schema.Array(Entry), [[]]),
    index: Flow.initial(Schema.Number, 0),
    open: Flow.initial(Schema.NullOr(Schema.Struct({ group: Schema.String, at: Schema.Number })), null),
    loading: Flow.initial(Schema.Array(Token), []),
  },
  operations: ({ E }) => ({
    mention: resolveMention.outcomes({
      value: E.Resolved.from((v: { readonly label: string }, { key }) => ({ id: key.id, label: v.label })),
      failure: { MentionMissing: E.ResolveFailed.from((_e, { key }) => ({ id: key.id })),
        Defect: E.ResolveFailed.from((_e, { key }) => ({ id: key.id })), Interrupted: Flow.ignore },
    }),
  }),
});

// user-defined: record, mapTokens, writable
type Hist = { readonly entries: ReadonlyArray<typeof Entry.Type>; readonly index: number;
  readonly open: { readonly group: string; readonly at: number } | null };
const record = (h: Hist, value: typeof Entry.Type, group: string | null, now: number): Hist => {
  const kept = h.entries.slice(0, h.index + 1);
  const joins = group !== null && h.open?.group === group && now - h.open.at < 500;
  const entries = joins ? [...kept.slice(0, -1), value] : [...kept, value].slice(-101);
  return { entries, index: entries.length - 1, open: group === null ? null : { group, at: now } };
};
const mapTokens = (value: typeof Entry.Type, f: (t: typeof Token.Type) => typeof Token.Type | null) =>
  value.flatMap((p) => (typeof p === "string" ? [p] : (f(p) ?? [])) as ReadonlyArray<typeof Piece.Type>);
const writable = ({ memory }: { readonly memory: { readonly readOnly: boolean } }) =>
  !memory.readOnly || deny("ReadOnly");

export const PromptMachine = machine(Prompt, ({ S, O }) => ({
  default: S.EDITING,
  activities: [O.mention.subscribe.each(({ memory }) => memory.loading.map((t) => ({ id: t.id, ref: t.ref })))],
  on: {
    Resolved: {
      updateMemory: ({ memory, event }) => {
        const settle = (t: typeof Token.Type) =>
          t.id === event.id ? { ...t, label: event.label, status: "ready" as const } : t;
        return {
          loading: memory.loading.filter((t) => t.id !== event.id),
          value: mapTokens(memory.value, settle),
          entries: memory.entries.map((e) => mapTokens(e, settle)),
        };
      },
    },
    ResolveFailed: {
      updateMemory: ({ memory, event }) => {
        const drop = (t: typeof Token.Type) => (t.id === event.id ? null : t);
        return {
          loading: memory.loading.filter((t) => t.id !== event.id),
          value: mapTokens(memory.value, drop),
          entries: memory.entries.map((e) => mapTokens(e, drop)),
        };
      },
    },
  },
  states: {
    EDITING: {
      on: {
        Edit: {
          guard: [writable],
          updateMemory: ({ memory, event, now }) => ({
            value: event.value,
            ...record(memory, event.value, event.group, now),
          }),
        },
        InsertToken: {
          guard: [writable],
          updateMemory: ({ memory, event, now }) => ({
            value: event.value,
            ...record(memory, event.value, null, now),
            loading: event.load ? [...memory.loading, event.token] : memory.loading,
          }),
        },
        RemoveToken: {
          guard: [writable],
          updateMemory: ({ memory, event, now }) => {
            const value = mapTokens(memory.value, (t) => (t.id === event.id ? null : t));
            return { value, ...record(memory, value, null, now) };
          },
        },
        Undo: {
          guard: [writable, ({ memory }) => memory.index > 0 || deny("NothingToUndo")],
          updateMemory: ({ memory }) => ({
            index: memory.index - 1,
            value: memory.entries[memory.index - 1],
            open: null,
          }),
        },
        Redo: {
          guard: [writable, ({ memory }) => memory.index < memory.entries.length - 1 || deny("NothingToRedo")],
          updateMemory: ({ memory }) => ({
            index: memory.index + 1,
            value: memory.entries[memory.index + 1],
            open: null,
          }),
        },
        Seal: { updateMemory: () => ({ open: null }) },
        CompositionStart: S.COMPOSING,
      },
    },
    COMPOSING: {
      on: {
        Edit: { updateMemory: ({ event }) => ({ value: event.value }) },
        CompositionEnd: {
          target: S.EDITING,
          updateMemory: ({ memory, event, now }) => ({ value: event.value, ...record(memory, event.value, null, now) }),
        },
      },
    },
  },
}));
```

`loading` holds whole tokens rather than ids, so the placement's input (`ref`) comes from memory even after the token
left the value. React computes the edited `value` from the DOM edit with the pure range functions and sends it, so
caret and IME logic stay in the view.

**Flow features exercised:** time-grouped undo using the turn's `now`, atomic multi-field updates (undo can never
half-apply), `subscribe.each` placements that outlive the item they serve, history rewriting, persistence of a draft
with placements re-established on restore, and `deny` for read-only.

**What Flow lacks:** `subscribe.each` and `value` mapping in production (@task.V3.T21). A host-supplied refusal of
an edit (upstream `onValueChange` cancel) needs a `Flow.Guard` port on a fragment (@task.V3.T57). Nothing new.

**Catalogue overlap:** S01 autosave draft (a persisted draft, no undo or tokens) and S04 chat thread (the composer
is this primitive). Pairing with S01 (decision 1) gives a draft that undoes, resolves mentions and autosaves.

**Stories.**

- **Usual:** type "fix ", insert @file (held), type " now", remove @file, release (resolved), Undo twice, and @file
  is back settled. Compose "日本" via IME. Reload with a loading token.
- **Stress:** 500 steps of Edit bursts 0 to 800 ms apart around the 500 ms group window, token inserts with answers
  held, failed and reordered, Undo and Redo at random, and a reload every 100 steps. Check that `index` is always
  in range, that `value` equals `entries[index]` after every Undo or Redo, that no entry holds a pending token whose
  load has ended, and that there are at most 101 entries.

## 5. Not chosen, with the reason

- **Resizable with a saved layout** (later). Its behaviour is layout maths (`resizable-layout.ts` is pure, 58 tests
  of it). The Flow-relevant parts are persistence, three of which Flow lacks:
  - ui-sdk saves only when a drag ends. A Flow persisted actor saves whatever its memory holds at each capture, so a
    mid-drag reload would restore the drag (decision 4).
  - ui-sdk can read a cookie to render saved sizes on the first paint. Flow's persistence is client-side, so the
    first server render shows defaults (@plan.ServerRendering.O5 merges after hydration).
  - The second tab saves nothing (@plan.Persistence.O7).

  Worth a fixture once decision 4 is settled.
- **Preferences and colour scheme** (later). They need cross-tab sync through storage events and a server-readable
  cookie. Flow has neither: a second tab runs without persistence by design (@plan.Persistence.O7). The adversary also
  found an unexecuted upstream hazard in `preference.ts:226-232`: a cancelled storage-sync leaves memory and storage
  apart.
- **Trigger menu** (later). It is the combobox's async options per nested level (`@` then a sub-level), with a
  150 ms debounce. Add it after 4.2 as a stress variant.
- **Tooltip warm group** (later). After one tooltip closes, the next opens instantly for 300 ms. That is a context
  provider shared by many small machines, a good small probe of `onContext` (@task.V3.T9).
- **Carousel autoplay** (later). The same pause-with-time-left need as the toaster; build it if decision 2 adds
  `pauseOn`.
- **Dialog, drawer, popover, OTP, date picker, file input and the rest** (no). Their state is one value or a pure
  function. Their hard parts (focus trap, sheet physics, locale parsing, drop rules) are DOM or pure code, which Flow
  does not own.

## 6. Gaps found, by where they would be supplied

| Gap                                                    | Primitive         | Supplied by                            |
| ------------------------------------------------------ | ----------------- | -------------------------------------- |
| compound states, history, `Flow.input`                 | 4.2 to 4.6        | @task.V3.T17 (@plan.Machines.O1, O2)   |
| `restartOn`, keyed schedules, multi-step `Schedule`s   | 4.3, 4.5          | @task.V3.T57 (@plan.Machines.O5)       |
| fragments with `Flow.Guard` ports (host veto)          | 4.2, 4.3, 4.7     | @task.V3.T57 (@plan.Machines.O1)       |
| `subscribe.each`, `value` outcomes, mapper `{ input }` | 4.2, 4.6, 4.7     | @task.V3.T21 (@plan.Operations.O2, O6) |
| actor-to-actor `send` (other machines show toasts)     | 4.3               | @task.V3.T9 (@plan.Runtime.O4)         |
| a keyed schedule's function receives `key`             | 4.3               | NEW (proposed), small; with T57        |
| pause a schedule and keep its time left                | 4.3, carousel     | NEW (proposed) or memory, decision 2   |
| the starting event visible to an ending's mapper       | 4.4               | NEW (proposed), decision 5             |
| a state that is not restored after reload              | 4.6, resizable    | NEW (proposed) or local actor, dec. 4  |
| operation ports on fragments (reusable primitives)     | all, for the demo | NEW (proposed), decision 6             |
| one-shot view commands (focus this now)                | 4.2 to 4.6        | memory fact today, decision 3          |
| cross-tab sync of a saved value; SSR-readable cookie   | preferences       | none planned (@plan.Persistence.O7)    |

## 7. Decisions for the user

1. **Build order.**
   - A: 4.1 first (it runs today), then 4.5 and 4.4 after T17, 4.3 after T57, and 4.2, 4.6 and 4.7 after T21.
   - B: fold 4.5 into S23 and 4.7 into S01 as combined fixtures.
   - **Recommended: A,** with B noted for the stress profiles. Standalone fixtures keep each pattern readable.
2. **Pausable timers.**
   - A: keep the time left in memory with a `settle` function, as in 4.3.
   - B: add NEW (proposed) `pauseOn`/`resumeOn` to schedules.
   - **Recommended: A now.** Revisit B in `revisit.md` if the carousel or a second fixture repeats `settle`.
3. **Focus and other one-shot view commands.**
   - A: the machine stores the target as a fact (`focused`, `focusAfterClose`, `focus: "trigger"`) and React applies
     it in an effect.
   - B: a NEW (proposed) view-effect channel.
   - **Recommended: A.** It keeps Flow out of the DOM and keeps Stories able to check focus as data.
4. **Gesture state across reload** (tree move, resizable drag).
   - A: put the gesture in a separate local actor (no new API).
   - B: a NEW (proposed) state option that restores to its parent's default.
   - **Recommended: A** for the fixtures, with B logged in `revisit.md`. A gesture that survives reload is
     meaningless, so B may be worth it later.
5. **Small API additions** for 4.3 and 4.4: give a keyed schedule's function `key`, and give a success mapper the
   starting event's payload.
   - **Recommended:** add the first as a small amendment under T57 and drop the second. `closesOnActed` is
     acceptable fixture code.
6. **Reusable primitives** (the later demo, not the fixtures): a fragment cannot take an operation from its host, so
   a palette or menu fragment cannot run the app's action.
   - **Recommended:** defer. Fixtures use concrete contracts; log NEW (proposed) operation ports in `revisit.md` for
     the demo phase.
7. **Upstream tests.**
   - A: rewrite each as a behaviour statement in our words, cited by our own Spec or Story ids, never by upstream
     paths in the package.
   - B: copy the upstream test text with the Apache notice.
   - **Recommended: A.** It keeps the package self-contained and needs no licence handling.

## 8. Sidecar log

Four read-only Haiku sidecars (effort medium): catalogue, repo and tests, behaviours, adversary. Each claim used
above was checked against the clone at `98ba9fd0`.

| Sidecar    | Claim                                                  | Log      | Why                                |
| ---------- | ------------------------------------------------------ | -------- | ---------------------------------- |
| catalogue  | 48 components and 50+ behaviours, with their files     | accepted | matches `packages/core/src`        |
| catalogue  | toast 5000, hover 100, safe area 300, hold 500, 400/60 | accepted | read at each named line            |
| catalogue  | combobox and command import `createAsyncOptions`       | changed  | doc comments only; app gives items |
| repo       | Apache-2.0, Copyright 2026 Vercel, no NOTICE, beta     | accepted | `LICENSE:190`, `README.md:195-198` |
| repo       | test counts per component                              | accepted | recounted; menu 36 without menubar |
| behaviours | combobox create closes only if `started === session`   | accepted | `combobox-api.ts:715-748`, :155    |
| behaviours | command ignores a pending key; keys pend independently | accepted | `command.test.ts:316`, `:335`      |
| behaviours | toasts have no Escape handler                          | rejected | `toast-parts.ts:85-97` handles it  |
| behaviours | async options keep `hasMore` across a new query        | accepted | `async-options.ts:144-178`; unrun  |
| adversary  | a collapse while loading leaves the loading mark       | accepted | `tree-api.ts:596-659`; unrun       |
| adversary  | a refused token undo still moves the stack             | accepted | `token-input-api.ts:391`; unrun    |
| adversary  | a cancelled storage-sync splits memory and storage     | changed  | plausible; kept to §5 only         |
| adversary  | trigger-menu writes stale items on a level change      | rejected | not verified; not needed           |
| adversary  | resizable, cropper, colour, waterfall maths are pure   | accepted | file headers; no store or timer    |
| adversary  | the EyeDropper result can land after unmount           | rejected | out of scope (no fit)              |
