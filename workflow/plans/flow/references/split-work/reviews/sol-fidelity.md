**Fix the blockers below before treating Dispatch Desk as the implementation contract.**

Read both adopted designs in full, FlowState.plan, and all 37 Dispatch Desk files, starting with its README. No repository files changed. Findings marked **verified** follow directly from those files or the focused compiler check; **inferred** consequences have not been executed against a Flow runtime.

The production feature import boundary passes: only Story modules import `app/` or `testing/`. D51–D54 are reflected correctly in input-free actor creation, Story `ensure`, Denied `reasons`, and paged lane reads. Operations import no entities, domain commits contain no call-site optimistic writes, all list/derived inputs are accounted for, and version fields stay outside conditions and orders.

## Blocking findings

1. **Blocker — the service port and stream adapters contain concrete type errors.**  
   **Verified:** [ticket-api.ts:23](/Users/arpit/Developer/flow-state/workflow/plans/flow/references/dispatch-desk/features/Tickets/ticket-api.ts:23) uses `TicketPage["Type"]`; lines 30–31 do the same with `TechnicianUpdate` and `TicketEvent`. These names are Schema values without corresponding type aliases. A focused no-emit check produced three TS2749 errors.

   Separately, [ticket.operations.ts:64](/Users/arpit/Developer/flow-state/workflow/plans/flow/references/dispatch-desk/features/Tickets/ticket.operations.ts:64) and line 71 pass Streams to `TicketApi.use`. Installed Effect 4.0.5 defines `use` for Effect-returning callbacks, whereas D35 requires stream adapters to return Streams.

   **Change:** export decoded type aliases or use `(typeof TicketPage)["Type"]`. Retrieve stream services with, for example, `Stream.unwrap(TicketApi.useSync(api => api.events(input)))`.

2. **Blocker — the list order does not end with the entity’s complete key.**  
   **Verified:** [ticket.domain.ts:29](/Users/arpit/Developer/flow-state/workflow/plans/flow/references/dispatch-desk/features/Tickets/ticket.domain.ts:29) declares `["workspaceId", "ticketId"]`, but line 56 ends the order with only `ticketId`. Entity-domain §2.4 and §4.4 require the key fields as the suffix; §9 makes omission a type error. A workspace equality condition does not declare an exception.

   **Change:** end the order with `asc(record.workspaceId), asc(record.ticketId)`. Update the demo comparator to express the same order, even though workspace is constant within each answer.

3. **Blocker — different ticket keys can name the same durable editor.**  
   **Verified:** [editor.ref.ts:8](/Users/arpit/Developer/flow-state/workflow/plans/flow/references/dispatch-desk/features/Tickets/editor/editor.ref.ts:8) joins two unrestricted strings with `/`. Keys `("a/b", "c")` and `("a", "b/c")` both produce `a/b/c`.

   **Inferred consequence:** O3’s first-input-wins rule then makes distinct tickets share an actor, draft and persistence identity. D9’s internal composite-identity encoding cannot recover components already collapsed into one authored string.

   **Change:** encode the pair unambiguously, using length prefixes or an escaped tuple representation. Add the collision pair as an identity example.

4. **Blocker — the predicted-assignment checkpoint assumes execution before the explicit drain.**  
   **Verified:** [queue.story.ts:53](/Users/arpit/Developer/flow-state/workflow/plans/flow/references/dispatch-desk/features/Tickets/queue/queue.story.ts:53) sends `AssignToMe` and immediately captures `predicted`, asserting that the commit has started. O3 defines `send` as mailbox admission; O9 makes `process()` the explicit drain. O11 specifically warns about send-then-checkpoint without processing.

   Adding `process()` alone would still fail to isolate prediction because the demo assignment completes immediately.

   **Change:** introduce a delayed assignment fixture, send, process, capture the pending prediction, advance its delay, process again, and capture settlement.

5. **Blocker — focused Stories have no service Layer, and two exported Stories share an ID.**  
   **Verified:** [editor.story.ts:100](/Users/arpit/Developer/flow-state/workflow/plans/flow/references/dispatch-desk/features/Tickets/editor/editor.story.ts:100) and line 109 construct focused editor Stories with `fixtures: []`. Unlike app Stories, they receive no `DeskSetup`; their activities nevertheless require `TicketApi`. Line 105 derives exported `readonly` from exported `focused`, preserving `editor-focused` as its ID.

   **Inferred consequence:** live focused/model execution lacks its required service; CLI discovery encounters duplicate Story identities.

   **Change:** supply a complete API fixture to focused Stories and the model base. Construct `readonly` through a factory with its own ID instead of extending the exported Story unchanged.

## Behavioral fidelity findings

1. **Should-fix — the pushed rename disagrees with the fixture’s server state.**  
   **Verified:** [fixtures.ts:39](/Users/arpit/Developer/flow-state/workflow/plans/flow/references/dispatch-desk/testing/fixtures.ts:39) loads a ticket, constructs a renamed copy and emits it, but never changes the backing server. Subsequent reads still return the old title and revision. This contradicts entity-domain §6.1’s stateful-fixture requirement and §8.3’s independent server oracle.

   Also, [queue.test.ts:39](/Users/arpit/Developer/flow-state/workflow/plans/flow/references/dispatch-desk/features/Tickets/queue/queue.test.ts:39) treats cumulative `repairs` as push-only evidence. Entity-domain §6.3 defines evidence from run start; §5.2 permits startup first-sighting repairs of derived answers.

   **Change:** mutate the same server state before emitting its push. Assert repairs attributable to that push, using causes or a sequence boundary after `loaded`.

2. **Should-fix — edits made during saving survive in memory but become unsaveable.**  
   **Verified:** [editor.machine.ts:121](/Users/arpit/Developer/flow-state/workflow/plans/flow/references/dispatch-desk/features/Tickets/editor/editor.machine.ts:121) always enters SAVED on success. SAVED has no SaveRequested handler or autosave schedule. Consequently, a newer draft remains different from `saved`, but Save is Unhandled until another title edit changes state. [TicketPanel.tsx:34](/Users/arpit/Developer/flow-state/workflow/plans/flow/references/dispatch-desk/features/Tickets/editor/TicketPanel.tsx:34) nevertheless displays Saved.

   **Change:** use ordered static transitions on Saved: enter SAVED when the current draft equals the confirmed title; otherwise return to EDITING. Extend the existing edit-during-save test to assert save eligibility and the displayed status.

3. **Should-fix — “user switch” conflicts with the Runtime-per-principal rule.**  
   **Verified:** [queue.story.ts:37](/Users/arpit/Developer/flow-state/workflow/plans/flow/references/dispatch-desk/features/Tickets/queue/queue.story.ts:37) changes the Session’s current user inside one Runtime. O8/D41 and entity-domain §5.5 require a different principal to receive a new Runtime. O4’s Reference line currently endorses this scenario.

   **Change:** resolve the meaning explicitly. If this is an authentication switch, rebuild the Runtime and adjust O4’s reference. If it is a dispatcher filter selection, rename the Session field/event and scenario so they do not represent the signed-in principal.

4. **Should-fix — queue health measures list availability, not feed health.**  
   **Verified:** [queue.machine.ts:38](/Users/arpit/Developer/flow-state/workflow/plans/flow/references/dispatch-desk/features/Tickets/queue/queue.machine.ts:38) subscribes to the feed without health outcomes. HEALTHY/DEGRADED transitions instead depend on ListUnavailable/ListLoaded. The “failing feed” scenario uses `UnavailableQueue`, which fails `list`, not `events`.

   **Change:** either rename the README, machine comments and scenario to describe list availability, or explicitly model feed failure/recovery and provide a failing-stream fixture. The current reference does not demonstrate its advertised feed-down behavior.

5. **Should-fix — views bypass the adopted eligibility and exhaustive-state conventions.**  
   **Verified:** [QueueList.tsx:122](/Users/arpit/Developer/flow-state/workflow/plans/flow/references/dispatch-desk/features/Tickets/queue/QueueList.tsx:122) disables assignment from `ticket.pending`, while AssignToMe is always accepted by the machine. Minimal-library decision 8 requires enablement to come from `check`. Load-more availability likewise exists only in the view.

   [TicketPanel.tsx:25](/Users/arpit/Developer/flow-state/workflow/plans/flow/references/dispatch-desk/features/Tickets/editor/TicketPanel.tsx:25) renders several child states through independent comparisons, so a newly added child receives no exhaustiveness error.

   **Change:** express command eligibility in guards and select `check` verdicts. Render OPEN’s child states through an exhaustive mapping or match.

## Contract and evidence gaps

1. **Should-fix — several exact API shapes remain reference assumptions.**  
   **Verified omission:** [QueueList.tsx:69](/Users/arpit/Developer/flow-state/workflow/plans/flow/references/dispatch-desk/features/Tickets/queue/QueueList.tsx:69) assumes six exact lane variants and their payload fields. O7 specifies a tagged union but does not enumerate it; minimal-library explicitly specifies only Pending in its placeholder example.

   Similarly, [editor.test.tsx:32](/Users/arpit/Developer/flow-state/workflow/plans/flow/references/dispatch-desk/features/Tickets/editor/editor.test.tsx:32) assumes `checkpoint.actor(ref).snapshot`; `Ticket.get` calls assume string-array shapes; and [tickets.property.test.ts:15](/Users/arpit/Developer/flow-state/workflow/plans/flow/references/dispatch-desk/testing/tickets.property.test.ts:15) supplies arrays where entity-domain §8 describes input generators without defining their representation.

   **Change:** specify these signatures and return unions in O7/O9 or the normative design. These are unsupported assumptions, not verified invalid APIs; archived definitions cannot silently supply the missing contract under C1.

2. **Should-fix — two tests do not establish their advertised claims.**  
   **Verified:** [queue.test.ts:8](/Users/arpit/Developer/flow-state/workflow/plans/flow/references/dispatch-desk/features/Tickets/queue/queue.test.ts:8) compares repair evidence to conclude that no lookup occurred. Repairs exclude ordinary machine-request lookups. [editor.test.tsx:80](/Users/arpit/Developer/flow-state/workflow/plans/flow/references/dispatch-desk/features/Tickets/editor/editor.test.tsx:80) claims retry exhaustion but asserts neither the final retry count nor cessation of adapter calls.

   **Change:** count list adapter invocations for normalization. For lock exhaustion, assert five retries, then advance further and prove no additional save starts.

3. **Nit — O4’s Reference path is incomplete.**  
   **Verified:** FlowState.plan O4 names `queue.story.ts` relative to Dispatch Desk, where that file does not exist.

   **Change:** use `features/Tickets/queue/queue.story.ts`, matching the other outcome references.

Verification was source-based, plus the pinned compiler command `node node_modules/typescript/bin/tsc --ignoreConfig --noEmit --incremental false --skipLibCheck --strict --module nodenext --target esnext workflow/plans/flow/references/dispatch-desk/features/Tickets/ticket-api.ts`. No application tests or library execution were claimed.

**Verdict: not ready. Top five changes, in order:**

1. Fix the Schema type references and Effect-to-Stream service access.
2. Complete the list’s composite-key order.
3. Make editor actor IDs collision-free.
4. Repair Story construction, unique IDs and prediction checkpoint timing.
5. Make push fixtures update server truth and scope repair assertions to their causes.