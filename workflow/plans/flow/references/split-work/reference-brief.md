# Reference app completion brief

You edit only files under workflow/plans/flow/references/dispatch-desk/. Other agents are writing
plans under workflow/plans/flow/ at the same time; do not touch them.

Read first: workflow/plans/flow/references/split-work/decisions.md (binding rulings 1-37), the
dispatch-desk README.md, and the design references in workflow/plans/flow/references/design/
(server-rendering.md section 1.4 and section 4, lazy-features.md section 4, multi-tab.md sections
3.2 and 3.3). The library does not exist; the reference is illustrative TypeScript that must read
as correct use of the adopted surface. Several files were already fixed (ticket-api.ts, types.ts,
ticket.operations.ts, ticket.domain.ts, demo-api.ts, fixtures.ts, persistence.ts, the editor
definition/machine/ref/panel/story/test, the queue machine/list/story/test, Session, Toasts).
Keep those changes; finish the rest so every file is consistent with them:

1. Session now takes input { userId } and has a SIGNED_OUT state and SignedOut event. Update every
   ensure of SessionRef (app/host.ts, tools/inspection.ts, stories) to pass input; host.ts gets a
   signOut example: send SignedOut, then runtime.dispose({ forget: true }) (multi-tab.md 3.2).
2. ToastStack and Toasts now have EMPTY/SHOWING; check ToastStack still reads correctly.
3. app/app.ts: make the editor a lazy entry ({ id: "DispatchDesk/Editor", load: () => import(...)
   .then((m) => m.EditorMachine), context: { canEdit: SessionRef } }) per lazy-features.md 4, and
   remove the eager editor import. app/view.tsx: load the TicketPanel chunk on open with plain
   React state (no Suspense), and key FlowProvider by user.
4. app/host.ts: actorRef ids are now parts arrays where composite (decision 35); createActor
   example unchanged; inspect(app) now returns a Promise (decision 31).
5. tools/inspection.ts: `await inspect(DeskApp)`; add an `inspect(runtime)` live example (domains,
   frontiers, predictions, queues; decision 5); attachInspector returns { drain, dispose } and
   the example awaits drain before dispose; redaction note per decision 4 (keyed digests only when
   data leaves the process).
6. Add a Next.js App Router host under dispatch-desk/next/ following server-rendering.md 1.4:
   next/server-setup.ts (deskServerSetup(token), no persistence), next/http-api.ts (a small
   fetch-based TicketApi Layer taking a token; Streams via Stream.unwrap), next/auth.ts (a stub
   currentUser()), next/providers.tsx ("use client", useState-constructed runtime per mount),
   next/app/layout.tsx (dehydrate the session, Hydrate), next/app/desk/[workspace]/page.tsx (a
   streamed queue segment with dehydrate + Hydrate; a client wrapper for onOpen).
7. Add features/Tickets/queue/queue.ssr.story.ts and queue.ssr.test.ts per server-rendering.md
   section 4 (a server Story with .dehydrate, a browser Story starting with .hydrate, a counting
   fixture added to testing/fixtures.ts proving no list or openCount refetch after hydration, and
   the renderToString + hydrateRoot no-mismatch test).
8. Add features/Tickets/editor/editor.tabs.story.ts and a test per multi-tab.md 3.3 (two tabs: a
   save from the mirror tab, the leader closed mid-save, the follower restores and the editor is
   in UNCERTAIN with the attempt kept; plus a reload Story).
9. README.md: update the structure table, the decision map (cite capability plans by name, e.g.
   "Machines plan O2", plus FlowState decisions that remain), the scenarios table (add SSR,
   lazy editor, two tabs, sign-out, paging, list availability rather than "feed down"), and
   replace "What writing it found" items 1-9 with the current list, adding: ordered alternatives,
   guard input includes lanes, ref ids as parts, no list total, unknown outcome carries an
   Attempt with retry, re-entry vs "self", fixtures built on setup services.
10. Run from the repo root: node node_modules/typescript/bin/tsc --ignoreConfig --noEmit
    --incremental false --skipLibCheck --strict --module nodenext --target esnext on each file
    that imports only effect (types.ts, ticket-api.ts, demo-api.ts, fixtures.ts, next/http-api.ts)
    and fix errors. Then run `nubx vp fmt workflow/plans/flow/references/dispatch-desk` and
    `nubx vp lint workflow/plans/flow/references/dispatch-desk`; fix lint findings that are real
    (unresolved "flow-state" imports are expected: the library does not exist).

Final message, under 400 words: files changed or added, typecheck/fmt/lint results, and any
surface you had to assume that no plan or ruling states.
