# React instrumentation with bippy (proposed, 2026-11-20)

**Status:** proposed; saved for the user to explore later. Nothing here is decided. It blocks @task.V3.T108 (`StoryPlayer`
and `definePresentation`, split from @task.V3.T30) until accepted or rejected.

**Library: bippy** (`github.com/aidenybai/bippy`, MIT). It is the layer under react-scan; integrate bippy directly,
not react-scan.

**What it offers Flow:**

1. **Element → component → source.** `getFiber(el)`, walk up to the nearest component, then `getSource`,
   `getOwnerStack` and `getDisplayName`. When a click sends an event, we can record which control sent it, in which
   component, at which `file:line`.
2. **Every React commit.** `instrument({ onCommitFiberRoot })` plus `traverseRenderedFibers` lists which components
   mounted, updated or unmounted. We can match each commit to the Flow turn that caused it.
3. **Re-render checks.** `didFiberRender`, compared against the publication that notified each `useView`. Flow can
   prove a publication that changed no selected value re-rendered nothing, and measure render cost per turn in the
   bench.
4. **Which components use which actor.** `useFiber` inside Flow's hooks, plus `getFiberId`, gives a stable id. That
   builds a development-only map of components to the actors they hold, which the player can outline per frame.
5. **The owning component's tree.** `traverseFiber` up and down gives the component path for any control, so traces
   and `explain` can say where an event came from in the UI tree.
6. **React Compiler awareness.** `hasMemoCache` tells us whether a component is memoized by the compiler, which matters
   when judging re-renders.
7. **React version differences absorbed.** It handles React 19's switch of source info to `_debugStack` and
   differences between renderers, so we don't track React internals ourselves.

**Limits:**

- development and test only;
- it must load before `react-dom`;
- production builds may drop source info;
- its README warns it may break production apps.

## Presentation mode features (proposed)

With bippy, presentation mode can tie each frame of a Story to the exact components on screen it touched; today the
player only knows events and state. In rough order of value:

1. **Exact next-control spotlight.** Highlight the button whose click sends the next event, from recorded send
   attribution rather than text matching. A ghost cursor can move to it and "click" before the frame advances.
   (`getFiber`, walk up to the component, send attribution)
2. **Change outlines per frame.** Flash only the components that re-rendered *because of this frame's turn*, coloured
   by actor. Unrelated renders stay quiet, so the viewer sees exactly what the event changed. (`instrument`,
   `traverseRenderedFibers`, matched to the `useView` publication)
3. **Actor badges.** A small label on each component, such as `Pay · CHARGING`, from the map of components to actors.
   Toggle it on to see which machine drives which part of the screen. (`useFiber`, `getFiberId`)
4. **Captions that point at the component.** A scene's caption anchors to the component whose selected value changed
   at that checkpoint, with no CSS selector or fixed position in `definePresentation`. Scenes stay checkpoint-only, as
   today.
5. **Auto-scroll to the action.** If the changed component or the next control is off screen, scroll to it before
   playing the step. (the fiber's host DOM node)
6. **Before → after chips.** Beside a changed component, show its selected value before and after, such as
   `total 42 → 37.80`. Flow supplies the values; bippy supplies where to draw them.
7. **Click-to-explain in inspect mode.** Click any element to see:
   - the component and its source `file:line` (with jump to editor);
   - the actor and its state;
   - the event that last changed what it shows, and the Story step it came from.

   (`getSource`, `getOwnerStack`, `traverseFiber`)
8. **Jump to the sender.** For any frame, open the `file:line` of the handler that sent its event.
9. **Gap reports with a location.** When the next event's control isn't on screen (wrong route, closed tab,
   conditional render), name the missing control and the component path where it was last seen, instead of failing
   silently.
10. **Render-cost strip under the scrubber.** Commits and wasted renders per frame, so a scene like "Five taps, two
    requests" can also show "and 3 renders". (`didFiberRender`, `hasMemoCache`)
11. **Coverage summary at the end.** Story events no control sent, controls the presentation never used, and
    components no frame touched. The same data feeds the CLI for agents.
12. **Export with UI anchors.** A played presentation can export each frame's control (role and name), component path
    and source, so an agent can write docs, a narration or a video script from it without devtools.

**What stays the same:**

- presentations still hold no event callbacks;
- Stories stay the only source of events;
- playback still starts no Flow work.

bippy only adds *where on screen* each frame happened, and it runs in development builds only.

## How it plugs into Story and presentation (proposed)

Stories, frames and `StoryPlayer` stay as @plan.Testing defines them. bippy works at playback: when the player
renders a frame through `StoryFrame` (Testing O4, O9), it learns where on screen that frame happened. App code gets
one new import; `definePresentation` gets two optional fields; the rest is internal.

The gap that shapes the design: Stories are recorded headlessly, so `send(E.PayPressed)` never touches a button and
nothing records which control sends an event. The player has to learn it (see "Two learning sources").

**Development entry: one new import**

```tsx
// app/dev.tsx (development entry only)
import "flow-state/react/instrument"            // NEW: installs bippy's hook; must load before react-dom
import { createRoot } from "react-dom/client"   // existing
import { CheckoutDemo } from "./demo.js"        // user-defined

createRoot(document.getElementById("root")!).render(<CheckoutDemo />)
```

**What the player computes per frame (NEW type)**

```ts
// flow-state/testing (NEW): computed by rendering one frame; never stored in the run
type FrameView = {
  readonly frame: number                              // index into run.frames (existing)
  readonly changed: ReadonlyArray<ComponentAt>        // components whose useView selection changed at this frame
  readonly next: NextControl | NoControl              // where the Story's next event comes from
  readonly renders: { readonly commits: number; readonly wasted: number }
}
type ComponentAt = {
  readonly name: string                     // bippy: getDisplayName
  readonly source: string | undefined       // bippy: getSource → "features/Pay/Pay.tsx:42"
  readonly path: ReadonlyArray<string>      // bippy: getOwnerStack
  readonly actor: Address                   // existing: Testing O1's address
  readonly before: unknown                  // the selection at the previous frame
  readonly after: unknown                   // the selection at this frame
}
type NextControl = { readonly _tag: "Control"; readonly role: string; readonly name: string; readonly at: ComponentAt }
// external: a fake's reply or a timer; notRendered: the control is not on screen
type NoControl = { readonly _tag: "NoControl"; readonly reason: "external" | "notRendered" }
```

**How it is built (internal, development builds only)**

```ts
// inside flow-state/react: Flow's own hooks register who reads what
export function useView<D, A>(actor: Actor<D>, select: (s: Snapshot<D>) => A): A {
  const value = useSelected(actor, select)                            // existing subscription (React O4)
  if (import.meta.env.DEV) registerReader(useFiber(), actor, value)   // bippy: useFiber + getFiberId
  return value
}

// inside StoryPlayer: which control sends the Story's next event in this frame?
// StoryFrame already makes sends inert (Testing O4), so a click only reports what it would have sent.
function findNextControl(probeRoot: HTMLElement, next: AddressedEvent): NextControl | NoControl {
  for (const el of probeRoot.querySelectorAll<HTMLElement>(INTERACTIVE)) {
    const sent = captureInertSends(() => el.click())
    if (sent.some((e) => sameAddressedEvent(e, next))) return controlAt(el)   // getFiber(el) → nearest component
  }
  return { _tag: "NoControl", reason: isExternal(next) ? "external" : "notRendered" }
}
```

`changed` comes from `registerReader` (a reader whose value differs from the previous frame); `renders` from
`instrument({ onCommitFiberRoot })` and `traverseRenderedFibers` while the frame mounts.

**Two learning sources for "which control sends this event"**

- **Probe** (above): click each control in a hidden copy of the frame. No extra test, but handlers still run host
  code (router pushes, analytics, `setState`), so the hidden copy needs a memory router. The main risk.
- **UI-driven Story runs** (NEW): real clicks record the control directly, with no guessing; the recorded map feeds
  the spotlight, gap reports and coverage.

  ```ts
  // existing: paidFirstTime   // NEW: playThroughUI
  test("paid first time, through the UI", () =>
    playThroughUI(paidFirstTime, { render: () => <ShopPages /> }))   // clicks the control for each sent event
  ```

Open: probe, UI-driven runs, or both (recorded results preferred when they exist).

**Added:** `flow-state/react/instrument`; `anchor` and `overlay` on `definePresentation`; `overlay` and `openSource`
on `StoryPlayer`; `FrameView`, `recordViews`, `playThroughUI`; `--ui` on `story`; internal reader registration in
hooks. **Dropped:** nothing. **Unchanged:** `Story`, its steps and `run()`; frames; `StoryFrame`'s inert clicks; the
rule that presentations hold no callbacks.

## Controlling the features (proposed)

Three layers, each overriding the one before:

1. **The author, in `definePresentation`:** what this presentation shows by default.
2. **The host, on `<StoryPlayer>`:** overrides for one page (a docs site turns everything off except the spotlight).
3. **The viewer, in the player's toolbar:** toggles for that browser, saved in `localStorage`.

Anything not set falls back to Flow's defaults. `overlay.captions` is `"anchored" | "fixed"`; `overlay.spotlight`
is `boolean | { cursor: boolean }`. Features that only report (gaps, coverage, export) are not overlays: they have
no on/off switch; you open them or ask the CLI.

| # | Feature | Data it reads | Control | Default |
|---|---|---|---|---|
| 1 | Next-control spotlight, ghost cursor | `FrameView.next` | `overlay.spotlight` | on, no cursor |
| 2 | Change outlines | `FrameView.changed` | `overlay.outlines` | on |
| 3 | Actor badges | reader registry | `overlay.badges` | off |
| 4 | Captions anchored to the component | `changed`, a scene's `anchor` | `overlay.captions`, `anchor` | anchored |
| 5 | Auto-scroll | host node of `next`, `changed` | `overlay.scroll` | on |
| 6 | Before → after chips | `ComponentAt` before, after | `overlay.chips` | off |
| 7 | Click-to-explain | `getFiber(el)` → `ComponentAt`, evidence | the existing inspect control (Testing O9) | — |
| 8 | Jump to the sender | `next.at.source` | button in inspect; `openSource` on the player | — |
| 9 | Gap reports with a location | `NoControl` + last `path` | always on (O9 reports gaps; this adds where) | always |
| 10 | Render-cost strip | `FrameView.renders` | `overlay.renderCost` | off |
| 11 | Coverage summary | all `FrameView`s plus the Story's events | panel at the end of playback; `--ui` output | — |
| 12 | Export with UI anchors | all `FrameView`s | `recordViews(...)`; CLI `story <id> --ui` | — |

**Author: per presentation and per scene**

```ts
// existing: definePresentation, scenes, at, caption, route, pacing   // NEW: overlay, anchor
export const paidShown = definePresentation(paidFirstTime, {
  scenes: [
    { at: "card", caption: "Signed in: straight to the card", route: "/checkout" },
    { at: "paid", caption: "Paid", anchor: Pay },            // NEW: pin this caption to Pay's components (#4)
  ],
  pacing,
  overlay: {                                                 // NEW: every field optional
    spotlight: { cursor: true },                             // #1: highlight plus ghost cursor
    outlines: true,                                          // #2
    badges: false,                                           // #3
    captions: "anchored",                                    // #4
    scroll: true,                                            // #5
    chips: true,                                             // #6: "total 42 → 37.80"
    renderCost: false,                                       // #10
    theme: "auto",                                           // see "Overlay themes"
  },
})
```

**Host: per page**

```tsx
// existing: StoryPlayer, presentation   // NEW: overlay (override), openSource
<StoryPlayer
  presentation={paidShown}
  overlay={{ outlines: false, chips: false }}                // NEW: a marketing page shows only the spotlight
  openSource={(source) =>                                    // NEW: #8, Vite's open-in-editor endpoint
    fetch(`/__open-in-editor?file=${encodeURIComponent(source)}`)}
>
  <ShopPages />
</StoryPlayer>
```

**Viewer: the toolbar.** One toggle per overlay field (spotlight, outlines, badges, chips, render cost) and a theme
switch, beside the existing play, scrub, speed and inspect controls; per browser, last word. All off is plain
playback, as Testing O9 has it today.

**Agents: no player**

```ts
// NEW
const views = await recordViews(paidShown, { render: () => <ShopPages /> })   // #12; coverage (#11) derives from views
```

CLI: `flow story pay/paid --ui` prints each frame's `FrameView` and the coverage summary; overlays do not apply,
since nothing is drawn.

**Safe-off rules**

- **No `flow-state/react/instrument` import:** the bippy features (#1–#8, #10–#12) go quiet; the toolbar shows "UI
  instrumentation not loaded"; playback works as today and gap reports fall back to O9's plain form.
- **Production builds:** the instrument entry is a no-op and tree-shaken out, so `overlay` has no effect.
- **No learned map for #1 and #11:** the spotlight shows nothing, and coverage marks that event "unknown" rather
  than "no control".

## Overlay themes (proposed)

Built-in themes only, no custom tokens: the overlay must read clearly over any app without the app styling it.

```ts
// NEW: overlay.theme, also switchable in the toolbar
type OverlayTheme = "auto" | "light" | "dark" | "contrast"   // auto follows prefers-color-scheme; default auto
```

- **Isolated:** the overlay renders in a Shadow DOM root on top of the page, so the app's CSS never reaches it and
  its CSS never reaches the app. Each theme is a set of internal CSS custom properties on that root.
- **Readable on any background:** outlines and the spotlight are two strokes, a light ring inside a dark one, so they
  show on white, black, photos and gradients alike. Captions, chips and badges sit on a solid surface with a shadow,
  never on transparency.
- **Actor colours:** one fixed categorical palette checked for contrast and colour-blind safety, assigned by actor in
  first-seen order within a run, so the same actor keeps its colour across frames. `contrast` swaps to a palette
  with dashed and dotted strokes, so meaning never depends on colour alone.
- **Motion:** honours `prefers-reduced-motion`. Flashes become a static outline and the ghost cursor jumps instead of
  gliding.
- **Stacking:** one top layer above the app (the popover top layer where supported, else a maximum z-index), so app
  modals and sticky headers do not cover it.
- **Open:** whether to expose the custom properties later as a documented escape hatch; not now.

## Prior art: react-scan (read before building)

react-scan (`github.com/aidenybai/react-scan`, MIT) is the reference for how to use bippy and how to draw overlays
over any app. Paths are under `packages/scan/src/` on `main`:

| What to learn | Where | Feeds |
|---|---|---|
| Installing the hook before `react-dom` | `install-hook.ts`, `auto.ts` | `flow-state/react/instrument` |
| Commit handling with bippy | `core/instrumentation.ts`, `core/index.ts` | `changed`, `renders` (#2, #10) |
| Walking fibers, change descriptions | `lite/walk-fiber.ts`, `lite/change-description.ts` | #2, #6, #10 |
| Source locations across React versions | `lite/fiber-source.ts` | `ComponentAt.source` (#7, #8) |
| Outlines: canvas, rAF, viewport checks | `new-outlines/index.ts`, `new-outlines/canvas.ts` | #1, #2, #5 |
| Off-main-thread drawing | `new-outlines/offscreen-canvas.worker.ts` | outlines that never slow the app |
| Shadow DOM root for the overlay | `core/index.ts`, `new-outlines/index.ts` (`attachShadow`) | themes, isolation |
| Inspect overlay, click-to-select | `web/views/inspector/overlay/index.tsx`, `flash-overlay.ts` | #7 |
| Before → after values | `web/views/inspector/what-changed.tsx`, `diff-value.tsx` | #6 |
| Toolbar and toggles | `web/toolbar.tsx`, `web/components/toggle/` | the viewer's toolbar |
| Component names in builds | `react-component-name/` (bundler plugins) | names when builds strip them |

What react-scan does that we take as given: outlines drawn on one canvas in a Shadow DOM root, positioned with
`IntersectionObserver` and `requestAnimationFrame`, optionally in an `OffscreenCanvas` worker; never per-element DOM
boxes. What we do not take: its `lite` entry, which hard-replaces React's profiling hooks
(`lite/create-profiling-hooks.ts`) and breaks the DevTools timeline; its Tailwind and Preact toolbar stack, unless
building ours shows it is the cheapest route.
