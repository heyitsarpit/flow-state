**Fix the service boundary, completion states, and fixture server before using this reference as an implementation oracle.**

Read in full: both adopted design documents and every Dispatch Desk file, starting with its README. Runtime conclusions below are **inferred from verified source and adopted rules**, unless identified as directly probed. The future library’s Stories cannot currently execute.

Application citations are relative to `workflow/plans/flow/references/dispatch-desk/`. Design citations refer to `workflow/plans/flow/references/design/`.

## Highest-priority findings

1. **Blocker — the service boundary cannot supply the declared activities.**

   **Evidence:** `features/Tickets/ticket-api.ts:23`, `:30`, and `:31` use Schema values as types: `TicketPage["Type"]`, `TechnicianUpdate["Type"]`, and `TicketEvent["Type"]`. A focused typecheck directly confirmed three TS2749 errors.

   Separately, `ticket.operations.ts:64` and `:71` return `TicketApi.use(...)` from stream adapters. Effect 4.0.5’s `Service.use` requires an Effect-producing callback and returns an Effect; it does not lift a Stream. A direct probe confirmed the adapter expression is an Effect and is not a Stream. This contradicts O5/D35.

   **Change:** use the Schemas’ derived types, and construct actual Streams—for example, unwrap `TicketApi.useSync(api => api.events(input))` with `Stream.unwrap`. Verify both adapters independently.

2. **Blocker — the list’s declared order omits part of its primary key.**

   **Evidence:** `ticket.domain.ts:29` declares `["workspaceId", "ticketId"]`, but `:56` ends the order with only `ticketId`. Entity-domain §4.4 and §9 require the entity’s key fields as the suffix; no exemption for a workspace-constrained list is stated.

   **Change:** end the declaration with `workspaceId, ticketId`, and keep the fixture comparator consistent. Within one workspace, this preserves the existing visible order. This is a verified declaration mismatch; rejection by the future implementation is inferred.

3. **Should-fix — edits made during saving survive in memory but become unsaveable through the current controls.**

   **Evidence:** `editor.machine.ts:120` preserves further typing, but `:121` always transitions on Saved to `OPEN.SAVED`. That state has neither SaveRequested nor autosave handlers (`:131`). `TicketPanel.tsx:34` nevertheless displays Saved.

   **Trace:** save title A → type B during SlowSave → response confirms A → memory contains draft B/saved A → state becomes SAVED → Save is Unhandled and disabled. `editor.test.tsx:47` passes because it checks only the two strings.

   **Change:** use ordered Saved transitions: enter EDITING when the pre-turn draft differs from the confirmed title; otherwise enter SAVED. Explicitly arrange autosave for the retained dirty draft—re-entering an idle `restartOn` schedule alone does not arm it.

   Also reuse the success-toast action in the root Saved handler (`editor.machine.ts:58`): Close → successful completion currently updates memory without sending the toast.

4. **Should-fix — an unknown save can leave the editor permanently in SAVING.**

   **Evidence:** `editor.machine.ts:62` handles SaveUncertain with `"self"` and changes only `maybeSaved`. O5 permits unknown after invocation, and O8 restores pending commits as unknown.

   **Trace:** enter SAVING → receive unknown without a preceding transition out → remain SAVING → no SaveRequested handler, no autosave, continued typing stays in SAVING. Domain forced repair updates records; it does not choose a workflow state.

   The revocation Story avoids this problem because PermissionRevoked first closes the editor.

   **Change:** add a SAVING-specific unknown transition to an actionable uncertainty state. Preserve attempt identity if reconciliation is offered. A refresh can report current server data but cannot establish the lost attempt’s final outcome (entity-domain §5.5).

5. **Should-fix — the push fixture and idempotency claims disagree with the server oracle.**

   **Evidence:** `testing/fixtures.ts:39–41` constructs a renamed ticket without mutating server state. Direct execution produced pushed revision 2/new title, followed by a server read returning revision 1/old title.

   **Trace:** push updates the base → list repairs → fixture returns older records → §5.2 rejects the older fields and marks the answer stale. Another machine request still cannot recover agreement with the server.

   Separately, `app/demo-api.ts:53` and `:60` ignore idempotency keys despite `ticket.operations.ts:41` claiming deduplication. A direct repeated request with one key advanced revisions from 2 to 3.

   **Change:** perform external mutations against the same scoped server state before emitting pushes. Store settled idempotency results and return the original result for repeated keys.

## Further findings

| Severity | Concrete evidence and consequence | Specific proposed change |
|---|---|---|
| **Should-fix** | `queue.test.ts:39` examines cumulative repairs but expects only `tickets.list`. Initial list loading reveals previously unseen records, which already repairs derived `openCount` under §5.2. Section 6.3 explicitly makes checkpoint evidence cumulative. | Filter by the push cause, or compare evidence after the loaded checkpoint. Likewise, filter assignment repairs by their write cause so startup work cannot satisfy `queue.test.ts:29`. |
| **Should-fix** | `queue.story.ts:53–54` sends AssignToMe and checkpoints without `process()`, assuming prediction is installed but settlement has not occurred. O3 guarantees synchronous admission; O9 supplies an explicit drain. O11 expressly warns about this pattern. | Add a delayed-assignment fixture, call `process()`, checkpoint the installed prediction, then advance and drain before checking settlement. |
| **Should-fix** | `editor.machine.ts:144` declines the sixth RetrySave but remains LOCKED. `TicketPanel.tsx:96` keeps announcing automatic retries. Under intended clock progression, sends occur after 5, 15, 35, 75, and 155 seconds; the exhausted event occurs at 315 seconds. `editor.test.tsx:88` checks only the unchanged error text. | Transition exhaustion to FAILED or an explicit exhausted state; stop claiming automatic retry. Assert retry count, final state, and absence of further commits. |
| **Should-fix** | `queue.machine.ts:38` subscribes to feed events without health outcomes. Only list failure enters DEGRADED (`:66`); only list values restore HEALTHY (`:76`). `UnavailableQueue` overrides the list, not the feed. Thus README’s Feed down scenario is not demonstrated. Also, jitter after the five-minute minimum can exceed five minutes in Effect 4.0.5. | Model feed failure/completion and recovery explicitly, with a feed fixture. Either cap delay after jitter or revise the stated maximum. |
| **Should-fix** | The paged list carries `total` (`types.ts:34`), but declares only list membership/order dependencies. **Inferred edge case:** deleting an unheld record beyond loaded pages changes total, while §5.2 gives lists no unknown old side for unheld records. Loaded rows remain correct but the displayed total can remain stale. Two seed records cannot expose this. | Represent filtered totals as a derived read with the same conditions, or explicitly extend the adopted dependency contract for list metadata. Add more than 20 records and test an off-page deletion and chain rebuild. |

## Story and assertion trace

These assessments assume the construction blockers above are repaired.

| Stories/tests | Event sequence, governing rule, and assessment |
|---|---|
| **Save and checkpoint rendering** | Load T42 → TitleChanged → SaveRequested → prediction → two-second response. O2 computes commit input from the pre-turn draft; §5.1 publishes prediction everywhere; §5.5 confirms response fields atomically. The pending/title assertions, confirmed saved title, predicted heading, and Cancel button are consistent. The test does not assert the toast. |
| **Autosave, empty title, Escape** | Edits at t=0 and t=1 restart autosave; t=2 remains EDITING; t=3 saves. This matches O2/D23. Empty title makes canSave return EmptyTitle, so no commit starts and EDITING remains active. Dirty Escape restores `saved`; the second Escape declines locally and falls through to OPEN→CLOSED under D18. Assertions are consistent. |
| **During-save edits, revocation, locks** | The two-string during-save assertion holds but misses finding 3. PermissionChanged(false) produces a context wave, then PermissionRevoked→CLOSED and cancellation; after invocation, unknown sets `maybeSaved`, while §5.5 marks the record uncertain. Those assertions are consistent. The lock error/count assertions are consistent but do not prove that retry exhaustion is usable. |
| **Search, user switch, assignment** | `"Lobby "`→`"lobby"` has equal canonical identity, so O2 retains the subscription. Equal repair arrays can pass even if an unnecessary ordinary lookup occurs: they do not measure lookups. Mine-only selects T42 for dispatcher-7 and no tickets for dispatcher-2. Assignment predicts status/assignee without predicting membership; settlement repairs the open list/count, yielding `[]` and 0. The predicted checkpoint lacks the required synchronization. |
| **Push, focused context, model exploration** | A rename changes title/order fields, so its own repair should target the list, not the status count; the fixture and cumulative assertion prevent that conclusion here. Focused context revocation should close through the same reaction path, but focused/model Stories supply `fixtures: []` despite needing TicketApi (`editor.story.ts:100`, `:109`): provide DemoTicketApi. The model test checks no exception and `truncated === false`; it never compares replayed keys. Add key comparisons at corresponding cuts; the bound’s sufficiency remains unverified. |

One additional contract uncertainty affects editor correctness: `TicketLoaded` assigns `saved` (`editor.machine.ts:77`), but the adopted text does not clearly establish whether resource value outcomes include prediction-only publications. If they do, `saved` can become unconfirmed data. Define that outcome policy and prove that predictions cannot overwrite the confirmed baseline or discard a dirty draft.

The demo’s workspace/status/assignee filters, normalized substring search, descending timestamp order, and page slicing match the intended request semantics. Placeholder retention also matches its declaration: retained across search changes, cleared across status/assignee changes. No Story exercises multiple pages, failed rebuilds, omitted-field confirmation, or competing actors’ per-record queues.

Verification: focused service-port typecheck failed with the three reported errors. Read-only probes confirmed TestClock delay, adapter kind, push/server divergence, and missing deduplication. No repository files were changed; no full Story or workspace verification is claimed.

**Verdict: not ready. Top five changes, in order:**

1. Repair Schema types and Stream adapters.
2. Correct the composite-key order declaration.
3. Make successful completion preserve a usable dirty-draft workflow.
4. Give unknown saves an actionable exit from SAVING.
5. Make pushes, reads, and idempotency share one truthful fixture server.