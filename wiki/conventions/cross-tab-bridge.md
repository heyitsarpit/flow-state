# Cross-tab bridge

**The rule:** Flow does not sync tabs in version 1; an app that needs it bridges in host code, sending user changes
out with an emit and taking another tab's changes in with a typed send, and only user events emit, so nothing
echoes.

## When it applies

Theme and preferences, a cart badge, unread counts, feature flags. Sign-out stays with the auth library's own tab
notification.

## Before and after

```ts
// BEFORE: a listener in the view, an untyped event, and an echo
window.addEventListener("storage", (e) => e.key === "theme" && prefs.send({ _tag: "Synced", theme: e.newValue }))
```

```ts
// AFTER: the machine
SetTheme: {
  updateMemory: ({ event }) => ({ theme: event.theme }),
  emit: [emits.Change.from(({ event }) => ({ theme: event.theme }))],      // only a user change emits
},
Synced: { updateMemory: ({ event }) => ({ theme: event.theme }) },         // no emit, so no echo

// app/host.ts
const prefs = runtime.ensureActor(PrefsRef)
const channel = new BroadcastChannel("prefs")
prefs.onEmit({ Change: (v) => channel.postMessage(v) })
channel.onmessage = (e) => prefs.send(Prefs.E.Synced(decodeTheme(e.data)))   // decoded with Schema at the boundary
```

## Why

A second tab saves nothing (Persistence O7); its change reaches the owner tab as `Synced`, and the owner saves it.
A `stream` contract is the wrong tool: streams carry server-session semantics a `BroadcastChannel` lacks.

## Prior art

TanStack Query's experimental `broadcastQueryClient`; Zustand and Redux use the `storage` event in app code.

## Status

Deferred: cross-tab sync is out of version 1 (FlowState C2) and listed in
[revisit.md](../plans/flow/references/proposals/revisit.md). Emits are accepted, not built.
