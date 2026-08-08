# Phase 7 — Readable and writable application authoring

[Back to the roadmap](../TASK.md)

Goal 7 makes a substantial Flow application easy to read, modify, and extend
without weakening runtime ownership, Effect channels, or deterministic proof. The
`incident-console` flagship is the ceremony test: every concept should have one
obvious owner, inferable information should be written once, and impossible states
should not be represented by plausible runtime values.

Phase 7 waits for Phase 6 to close. Execution order is `P7A` followed by `P7B`:
first remove application-owned ambiguity using the current public API, then change
the library only where the cleaned-up client still exposes irreducible ceremony.
The target snippets below specify desired semantics and readability; `P7B.0` must
settle their exact public spelling against the type and API contracts before
implementation.

## Fixed scope and rules

- Optimize for local comprehension and safe authoring, not minimum line count. A
  reader should find the states, events, accepted actions, Effect policy, and owner
  of each fact without searching unrelated files.
- Keep `Effect<A, E, R>`, `Stream<A, E, R>`, Layer requirements, interruption,
  finalization, generation ownership, optimistic rollback, and inspection facts
  exact. Readability work may not erase a channel or create a Promise-owned shadow
  lifecycle.
- Give every identifier, literal vocabulary, event constructor, state name,
  resource reference, child reference, transaction reference, duration, retry
  policy, and configuration value one semantic owner.
- Prefer Effect-native `Option`, tagged errors, `Match`, `Config`,
  `Duration.DurationInput`, and `Schedule.Schedule` at the seams they model. Keep
  `undefined` and `null` at React, JSON, and external API boundaries.
- Prove every library ergonomic change with positive and hostile negative type
  tests, source and packed declarations, deterministic runtime tests, and a real
  `incident-console` migration. Attractive snippets are not evidence.
- Preserve unrelated worktree changes. Record confirmed behavioral defects in
  `tasks/BUGS.md` before product-code correction.

## P7A — Client-only readability and correctness

This section may change only `examples/incident-console` and its package-owned
tests, scripts, and documentation. It establishes the best client possible through
the Phase 6 public library before any new Flow API is designed.

### [ ] P7A.1 Centralize the feature vocabulary

Own public event constructors, event types, state names, and reusable transition
updates together. UI code and machine configuration must consume those owners
instead of repeating discriminant and target strings.

Before:

```ts
export type IncidentConsoleEvent =
  | Readonly<{ readonly type: "OPEN_INCIDENT"; readonly incidentId: string }>
  | Readonly<{ readonly type: "BACK_TO_QUEUE" }>
  | Readonly<{ readonly type: "REFRESH_DETAIL" }>;

actor.send({ type: "OPEN_INCIDENT", incidentId });
target: "refreshing-detail";
```

After:

```ts
export const IncidentEvents = {
  open: (incidentId: string) => ({ type: "OPEN_INCIDENT", incidentId }) as const,
  back: () => ({ type: "BACK_TO_QUEUE" }) as const,
  refreshDetail: () => ({ type: "REFRESH_DETAIL" }) as const,
};

export const IncidentStates = {
  queue: "queue",
  detail: "detail",
  refreshingDetail: "refreshing-detail",
} as const;

export type IncidentConsoleEvent = ReturnType<(typeof IncidentEvents)[keyof typeof IncidentEvents]>;

actor.send(IncidentEvents.open(incidentId));
target: IncidentStates.refreshingDetail;
```

Acceptance:

- One feature-owned module exposes the public event constructors and state names.
- Components do not construct public machine events from raw discriminant strings.
- Shared navigation and selection updates have one named implementation.

### [ ] P7A.2 Make visible actions agree with accepted transitions

Correct the current intermediate-state gaps for navigation, refresh, mutation,
timeline failure, runbook start, replacement, and cancellation. Derive explicit
client-side capabilities from the current state and use them in every control.

Before:

```ts
const disabled = selection.mutationPending || selection.runbookActive

<Button onClick={() => send({ type: "BACK_TO_QUEUE" })}>Queue</Button>
<Button onClick={() => send({ type: "REPLACE_RUNBOOK" })}>Replace</Button>
```

After:

```ts
const capabilities = capabilitiesFor(selection.state)

<Button disabled={!capabilities.back} onClick={() => send(IncidentEvents.back())}>
  Queue
</Button>
<Button
  disabled={!capabilities.replaceRunbook}
  onClick={() => send(IncidentEvents.replaceRunbook())}
>
  Replace
</Button>
```

Acceptance:

- Every rendered control is enabled exactly when its event is accepted.
- `BACK_TO_QUEUE` performs the same selection, runbook, timeline, and conflict
  cleanup from every detail-related state.
- Every timeline-owning state handles connected, reconnecting, event, and failure.
- A deterministic state/action matrix proves that no enabled control is ignored.

### [ ] P7A.3 Give domain commands one policy owner

Define assignment and status changes as domain commands whose decision function
owns admissibility, the accepted patch, and the typed rejection reason. The
machine decides when commands may run, but machine guards, optimistic previews,
React controls, and server validation must consume the same domain policy rather
than restating it.

Before:

```ts
const canChangeStatus = (incident: Incident, status: IncidentStatus) =>
  (status === "acknowledged" && incident.status === "open") ||
  (status === "resolved" && incident.status !== "resolved") ||
  (status === "open" && incident.status === "resolved")

const patch = event.type === "ASSIGN"
  ? { expectedVersion: incident.version, assignee: event.assignee }
  : { expectedVersion: incident.version, status: event.status }

<Button disabled={incident.status !== "open"}>Acknowledge</Button>
```

After:

```ts
export const IncidentCommand = {
  assign: (assignee: string | null) => ({ _tag: "Assign", assignee }) as const,
  changeStatus: (status: IncidentStatus) => ({ _tag: "ChangeStatus", status }) as const,
};

export const decideIncidentCommand = (
  incident: Incident,
  command: IncidentCommand,
): Either.Either<IncidentPatch, IncidentCommandRejection> => {
  // One exhaustive owner returns either the accepted patch or the exact reason.
};

const decision = decideIncidentCommand(incident, command);
```

Acceptance:

- One pure domain function owns command validity, the accepted patch, and the
  operator-facing rejection reason.
- Machine guards, transaction params and preview, React capability text, and the
  development server consume that decision instead of duplicating status rules.
- Domain-command tests cover every incident status and command combination without
  starting a runtime, while runtime and browser tests prove the accepted decision
  still drives optimistic preview, HTTP commit, rollback, and reconciliation.
- Keep this client-only. Do not add `flow.command` unless a later independent app
  proves that Flow-specific integration cannot remain explicit and readable.

### [ ] P7A.4 Reuse shared state ownership and handlers

Extract the repeated detail owners, timeline handlers, open/leave updates, and
runbook terminal handlers into feature-owned constants and functions. Keep the
machine declarative enough that each state shows only its distinct behavior.

Before:

```ts
"starting-runbook": {
  invoke: [...detailOwners, flow.run(startRunbook)],
  on: {
    TIMELINE_CONNECTED: { update: () => ({ timelineConnection: "live" }) },
    TIMELINE_RECONNECTING: {
      update: () => ({ timelineConnection: "reconnecting" }),
    },
    TIMELINE_EVENT: { update: appendTimelineEvent },
  },
}
```

After:

```ts
const timelineHandlers = {
  TIMELINE_CONNECTED: timelineConnected,
  TIMELINE_RECONNECTING: timelineReconnecting,
  TIMELINE_EVENT: timelineEvent,
  TIMELINE_FAILED: timelineFailed,
} satisfies IncidentHandlers

const detailOwners = [listOwner, detailOwner, incidentTimeline] as const

"starting-runbook": {
  invoke: [...detailOwners, flow.run(startRunbook)],
  on: { ...timelineHandlers, ...navigationHandlers, ...runbookStartHandlers },
}
```

Acceptance:

- No detail-related state reimplements common timeline or navigation behavior.
- Shared fragments remain statically checked against the event union; they do not
  use casts or broad index signatures to satisfy the machine.

### [ ] P7A.5 Split projections by consumer

Replace the single twenty-field selection passed through the whole component tree
with focused header, queue, detail, timeline, and runbook projections. Keep domain
decisions in views rather than recreating them in React.

Before:

```ts
const selection = useView(actor, incidentConsoleView)

<ConsoleHeader selection={selection} />
<IncidentQueue selection={selection} send={actor.send} />
<IncidentDetail selection={selection} send={actor.send} />
```

After:

```ts
const header = useView(actor, incidentHeaderView)
const queue = useView(actor, incidentQueueView)
const detail = useView(actor, incidentDetailView)

<ConsoleHeader model={header} />
<IncidentQueue model={queue} send={actor.send} />
<IncidentDetail model={detail} send={actor.send} />
```

Acceptance:

- Each component receives only the facts and capabilities it renders.
- Status derivation, action eligibility, and failure interpretation have one view
  owner and are not duplicated in components.
- Focused React tests prove unrelated view changes do not republish unaffected
  selections.

### [ ] P7A.6 Model notifications as notifications

Replace the permanent optional feedback string with an explicit notification value
and deterministic dismissal policy. Persistent errors that require operator action
must remain in their owning panel rather than masquerading as transient toasts.

Before:

```ts
readonly feedback: Option.Option<string>

update: () => ({ feedback: Option.some("Incident refreshed") })
```

After:

```ts
type Notification = Readonly<{
  readonly id: number
  readonly kind: "success" | "warning" | "failure"
  readonly message: string
}>

readonly notification: Option.Option<Notification>

update: ({ context }) => ({
  notification: Option.some(successNotification(context, "Incident refreshed")),
})
```

Acceptance:

- Success notifications dismiss through a deterministic event/timer path.
- Conflicts, not-found states, and retryable failures remain visible at the action
  surface until resolved.
- Notification identity prevents an old dismissal from clearing a newer message.

### [ ] P7A.7 Remove plausible sentinel identifiers

Keep optional identifiers as `Option` until a state-specific invariant or child
input proves they exist. Do not turn absence into `"missing"`, `"unselected"`, or
`"unstarted"`, because those values can cross the HTTP boundary as real IDs.

Before:

```ts
params: ({ context }) => Option.getOrElse(context.selectedIncidentId, () => "missing");

context: () => ({ incidentId: "unselected", runId: "unstarted" });
```

After:

```ts
const selectedIncidentId = (context: IncidentConsoleContext): string =>
  Option.getOrThrowWith(
    context.selectedIncidentId,
    () => new Error("detail ownership requires a selected incident"),
  );

params: ({ context }) => selectedIncidentId(context);

input: ({ context }) => ({
  incidentId: selectedIncidentId(context),
  runId: activeRunId(context),
});
```

Acceptance:

- No resource, stream, transaction, child, or service call receives a fabricated
  identifier.
- State invariants are localized, named, and covered by transition tests.
- A missing invariant becomes an immediate defect before external work starts.

### [ ] P7A.8 Use Effect tagged errors and exhaustive matching

Replace the secondary `kind` field inside one `IncidentApiFailure` class with
separate tagged failures whose fields are valid by construction. Interpret them
through exhaustive `Match` functions shared by views and retry policies.

Before:

```ts
class IncidentApiFailure extends Data.TaggedError("IncidentApiFailure")<{
  readonly kind: "transport" | "http" | "decode";
  readonly status?: number;
  readonly error?: ApiError;
}> {}

failure.kind === "http" && failure.status === 409;
```

After:

```ts
class TransportFailure extends Data.TaggedError("TransportFailure")<{
  readonly cause: unknown;
}> {}

class HttpFailure extends Data.TaggedError("HttpFailure")<{
  readonly status: number;
  readonly error: ApiError;
}> {}

class DecodeFailure extends Data.TaggedError("DecodeFailure")<{
  readonly cause: unknown;
}> {}

const conflictFrom = Match.type<IncidentApiFailure>().pipe(
  Match.tag("HttpFailure", ({ status, error }) =>
    status === 409 ? Option.fromNullishOr(error.current) : Option.none(),
  ),
  Match.orElse(() => Option.none()),
);
```

Acceptance:

- Transport, HTTP, and decode failures expose no irrelevant optional fields.
- Retry, conflict, not-found, and display decisions are exhaustive and shared.
- Fetch and EventSource defects are normalized at their boundary without casts.

### [ ] P7A.9 Reuse schema-owned domain vocabularies

Use the domain schemas and literal collections to decode filters, seed server data,
and render options. Remove handwritten predicates and duplicate service, severity,
status, assignee, runbook-status, and fault vocabularies.

Before:

```ts
const serviceFilter = (value: string): ServiceFilter =>
  value === "api" || value === "billing" || value === "identity" || value === "search"
    ? value
    : "all";

const services = ["api", "billing", "identity", "search"] as const;
```

After:

```ts
export const ServiceFilterSchema = Schema.Union([ServiceSchema, Schema.Literal("all")]);

const serviceFilter = Schema.decodeUnknownOption(ServiceFilterSchema);

import { serviceValues, severityValues, assigneeValues } from "../src/domain/incidents";
```

Acceptance:

- Adding a domain literal updates validation, filters, options, and server seed
  construction through one owner.
- Boundary decoding returns `Option` or a typed failure; it does not silently widen
  unknown strings into domain values.

### [ ] P7A.10 Move configuration to the Layer boundary

Keep the API service constructor deterministic and parameterized. Resolve browser
and server configuration once during application Layer assembly, using Effect
`Config` where values are runtime-owned.

Before:

```ts
export const createIncidentApiLayer = (
  baseUrl = process.env.NEXT_PUBLIC_INCIDENT_API_URL ?? "http://127.0.0.1:5190",
) =>
  Layer.succeed(
    IncidentApi,
    IncidentApi.of({
      /* ... */
    }),
  );
```

After:

```ts
export const IncidentApiLive = Layer.effect(
  IncidentApi,
  Effect.gen(function* () {
    const baseUrl = yield* Config.string("INCIDENT_API_URL");
    return makeIncidentApi({ baseUrl });
  }),
);

export const createIncidentApiLayer = (baseUrl: URL) =>
  Layer.succeed(IncidentApi, makeIncidentApi({ baseUrl }));
```

Acceptance:

- Service construction does not read ambient configuration.
- Next.js environment adaptation is isolated at app assembly and tests provide an
  explicit URL or ConfigProvider.
- Sensitive future configuration uses `Config.redacted` and is never serialized.

### [ ] P7A.11 Simplify caller-owned runtime lifecycle

Keep caller ownership under the Phase 6 API, but move Strict Mode generation,
idempotent disposal, startup failure, and explicit close behavior into one focused
hook or component. Prove that every generation disposes exactly once.

Before:

```ts
useEffect(() => {
  const generation = ++mountGeneration.current;
  return () =>
    queueMicrotask(() => {
      if (mountGeneration.current === generation) void runtime.dispose();
    });
}, [runtime]);

void runtime.dispose().then(onDisposed);
```

After:

```ts
const owned = useOwnedFlowRuntime(createIncidentRuntime)

if (owned.status === "failure") return <StartupFailure cause={owned.cause} />

return (
  <FlowProvider runtime={owned.runtime}>
    <IncidentConsole onClose={owned.close} />
  </FlowProvider>
)
```

Acceptance:

- Strict Mode mount/unmount, explicit close, failed startup, and remount each have a
  deterministic lifecycle test.
- The client has one disposal authority and no path relies on accidental runtime
  idempotence to avoid duplicate cleanup.

## P7B — Library and client readability

This section may change the public Flow API and then migrate `incident-console`.
Each slice must prove that the library removes client ceremony without hiding
ownership or weakening type inference.

### [ ] P7B.0 Lock the readable-authoring contract

- Record the accepted source and packed before/after calls for every `P7B` slice in
  a Phase 7 API receipt before broad implementation.
- Use the cleaned `P7A` client as the baseline. Delete a client workaround only
  when the library replacement preserves its behavior and proof.
- Treat snippets below as semantic targets. Choose one canonical spelling, reject
  plausible ambiguous forms, and update `API_CONTRACT.md` and
  `TYPE_INFERENCE_CONTRACT.md` where the supported surface changes.

### [ ] P7B.1 Use Effect-native temporal policies

Type freshness and timer delays as `Duration.DurationInput`. Accept
`Schedule.Schedule` for retry and repetition policies so delay, recurrence, and
attempt limits remain one composable Effect value.

Before:

```ts
freshness: { staleAfter: "10 seconds", onInvalidate: "active" }

retrying: {
  after: flow.after({ id: "retry", delay: "300 millis", target: "polling" }),
}
```

After:

```ts
freshness: {
  staleAfter: "10 seconds" satisfies Duration.DurationInput,
  onInvalidate: "active",
}

retry: Schedule.spaced("300 millis").pipe(Schedule.intersect(Schedule.recurs(1)))
poll: Schedule.spaced("150 millis")
```

Acceptance:

- Editors offer valid Effect duration units and reject malformed duration strings
  in source and packed consumers.
- Schedule input preserves its output/error/context requirements where relevant.
- The runbook child no longer stores retry count or encodes retry timing as extra
  machine states unless product behavior genuinely renders those states.

### [ ] P7B.2 Add first-class event and state definitions with keyed narrowing

Provide canonical event and state definition objects that generate constructors,
unions, matchers, transition targets, and predicates. A handler keyed by an event
must receive that exact event variant in `guard`, `update`, `params`, and routing.

Before:

```ts
type Event =
  | { readonly type: "CHANGE_STATUS"; readonly status: IncidentStatus }
  | { readonly type: "BACK_TO_QUEUE" }

CHANGE_STATUS: {
  guard: ({ event }) =>
    event.type === "CHANGE_STATUS" && canChangeStatus(event.status),
}
```

After:

```ts
const events = flow.events({
  changeStatus: Schema.Struct({ status: IncidentStatusSchema }),
  backToQueue: Schema.Void,
})

const states = flow.states("queue", "detail", "refreshingDetail")

[events.changeStatus.type]: {
  guard: ({ event }) => canChangeStatus(event.status),
  target: states.detail,
}
```

Acceptance:

- Event unions and constructors are inferred from one definition.
- State targets autocomplete from one definition and reject unknown names.
- Keyed callbacks never require a redundant discriminant check or empty fallback.
- Behavior stories and React callers consume the same event/state objects.

### [ ] P7B.3 Support inherited machine ownership and transitions

Add the smallest hierarchical or compositional state facility that lets a parent
detail state own observers, timeline handlers, navigation, and cleanup while child
states declare only distinct work. Do not implement unrelated statechart features.

Before:

```ts
detail: { invoke: detailOwners, on: timelineAndNavigationHandlers },
"refreshing-detail": { invoke: [...detailOwners, refreshDetail], on: timelineHandlers },
"starting-runbook": { invoke: [...detailOwners, startRunbook], on: timelineHandlers },
runbook: { invoke: [...detailOwners, runbookChild], on: timelineHandlers },
```

After:

```ts
detail: flow.compound({
  invoke: detailOwners,
  on: { ...timelineHandlers, ...navigationHandlers },
  initial: "ready",
  states: {
    ready: { on: readyHandlers },
    refreshing: { invoke: refreshDetail, on: refreshHandlers },
    startingRunbook: { invoke: startRunbook, on: startHandlers },
    runningRunbook: { invoke: runbookChild, on: runbookHandlers },
  },
});
```

Acceptance:

- Parent owners attach once per effective generation and clean up exactly once.
- Child transitions inherit parent handlers without copy/paste or handler drift.
- Serialization, restoration, inspection, timers, streams, and stale-generation
  suppression retain exact hierarchical identity.

### [ ] P7B.4 Infer descriptor signatures and service access

Infer resource and transaction Params, Value, Error, Requirements, Event, and ID
from their callbacks and literal properties. Let Effect service accessors replace
repeated `Effect.flatMap(Service, ...)` plumbing where no ambiguity exists.

Before:

```ts
const incidentListResource = flow.resource<
  [IncidentFilters],
  IncidentPage,
  IncidentApiFailure,
  Effect.Effect<IncidentPage, IncidentApiFailure, IncidentApi>,
  "incidents.list"
>({
  id: "incidents.list",
  lookup: (filters) => Effect.flatMap(IncidentApi, (api) => api.list(filters)),
});
```

After:

```ts
const incidentListResource = flow.resource({
  id: "incidents.list",
  lookup: IncidentApi.list,
  key: (filters: IncidentFilters) => createKey("incidents", "list", filters),
});
```

Acceptance:

- The common path has no duplicated generic arguments or repeated ID literal type.
- Explicit binders remain available only for genuinely ambiguous boundaries.
- Positive and negative tests prove exact A/E/R, tuple parameters, routed events,
  and literal IDs through packed declarations.

### [ ] P7B.5 Represent inactive descriptors explicitly

Give resources, streams, transactions, children, and timers one typed way to say
that parameters are unavailable and no owner should start. Preserve `Option` rather
than requiring `null` or fabricated values.

Before:

```ts
params: ({ context }) => Option.getOrElse(context.selectedIncidentId, () => "missing");

params: ({ context }) => Option.getOrUndefined(context.runId) ?? null;
```

After:

```ts
params: ({ context }) => context.selectedIncidentId,
when: Option.isSome,

// or one canonical equivalent
params: ({ context }) =>
  Option.match(context.runId, { onNone: flow.skip, onSome: flow.params }),
```

Acceptance:

- Inactive ownership starts no Effect, emits no issue, and needs no fake key.
- Activation, deactivation, reentry, serialization, restoration, and cleanup are
  deterministic and inspectable.
- All descriptor families share one absence model unless a semantic difference is
  explicitly proved.

### [ ] P7B.6 Preserve typed descriptor identity through registries

Make resource, transaction, child, timer, and stream snapshots accessible through
their descriptors or typed references. Remove string indexing, schema re-decoding,
and `Record<string, Snapshot>` annotations from normal client code.

Before:

```ts
const snapshot = resources[incidentDetailResource.id];
const incident = Schema.is(IncidentSchema)(snapshot?.value) ? snapshot.value : undefined;

const child = children["incidents.runbook"];
const pending = transactions["incidents.mutate"]?.status === "pending";
```

After:

```ts
const detail = resources.get(incidentDetailResource);
const incident = detail.value;

const child = children.get(runbookChild);
const pending = transactions.get(mutateIncident).status === "pending";
```

Acceptance:

- Descriptor lookup preserves Value, Error, Params, and identity types.
- Keyed resources require a typed ref when more than one key is in scope.
- Renaming an ID cannot leave compiling string-index consumers behind.
- Schema validation remains at unknown boundaries and is not repeated for already
  validated store values.

### [ ] P7B.7 Add typed child output and a remote-workflow primitive

Let a machine declare typed final output and typed terminal failure so a parent
does not inspect the child snapshot tree. Build a bounded remote-workflow primitive
only if it cleanly composes start, polling Schedule, replacement, cancellation,
lease finalization, and terminal output without hiding ownership.

Before:

```ts
success: ({ value: snapshot }) => ({
  type: "RUNBOOK_FINISHED",
  runbook: resourceValue(snapshot.resources, runbookResource.id, RunbookSchema),
});

// Start transaction + polling child + cached resource + never-ending lease stream.
```

After:

```ts
const runbookWorkflow = flow.workflow({
  id: "incidents.runbook",
  start: IncidentApi.startRunbook,
  poll: { resource: runbookResource, schedule: Schedule.spaced("150 millis") },
  cancel: IncidentApi.cancelRunbook,
  output: ({ resource }) => resource.value,
});

success: ({ value: runbook }) => IncidentEvents.runbookFinished(runbook);
```

Acceptance:

- Child success routes receive typed domain output, not `FlowActorSnapshotTree`.
- Failure, defect, interruption, replacement, and cancellation remain distinct.
- Remote cancellation runs exactly once for each active generation, including
  parent exit, runtime disposal, restore, and replacement races.
- If the workflow abstraction is less clear than the composed primitives, ship
  typed child output alone and retain explicit client composition.

### [ ] P7B.8 Make transaction authoring event-aware and optimistic by reference

Let a transaction declare accepted event variants and receive them narrowed in its
parameter selector. Add typed preview helpers for replacing or updating resource
refs so clients do not manually reconstruct patch arrays and cached pages.

Before:

```ts
params: ({ context, event, resources }) => {
  if (event.type !== "ASSIGN" && event.type !== "CHANGE_STATUS") return null
  // construct detailRef, listRef, optimisticIncident, optimisticPage
},
preview: {
  apply: ({ params }) => [
    { ref: params.detailRef, replace: params.optimisticIncident },
    { ref: params.listRef, replace: updatedPage },
  ],
},
```

After:

```ts
const mutateIncident = flow.transaction({
  id: "incidents.mutate",
  accepts: events.anyOf(events.assign, events.changeStatus),
  params: ({ context, event, resources }) => ({
    incident: resources.value(incidentDetailResource),
    patch: patchFrom(event),
  }),
  preview: ({ params, patch }) =>
    patch
      .replace(incidentDetailResource.ref(params.incident.id), applyPatch(params))
      .update(incidentListResource.ref(queryFromContext(params)), updateIncident(params)),
});
```

Acceptance:

- `event` is exactly the accepted union in params, preview, commit, and routes.
- Preview operations are typed by their refs and cannot replace a resource with the
  wrong value.
- Rollback, invalidation, overlap policy, server authority, and queued/rejected
  publication retain existing semantics.

### [ ] P7B.9 Keep local outcomes local and infer routed outcomes

Let an invocation handle success, typed failure, defect, and interruption as local
typed transitions when the outcome does not cross an ownership boundary. When an
outcome must become a routed event, infer its payloads from the invoked descriptor
and let one event family own construction. Do not force private Effect lifecycle
plumbing into the public application event vocabulary.

Before:

```ts
routes: flow.outcomes<Incident, IncidentApiFailure, IncidentConsoleEvent>({
  success: ({ value }) => ({ type: "DETAIL_REFRESHED", incident: value }),
  failure: ({ error }) => ({ type: "DETAIL_REFRESH_FAILED", error }),
  defect: () => ({ type: "DETAIL_REFRESH_DEFECT" }),
  interrupt: () => ({ type: "DETAIL_REFRESH_INTERRUPTED" }),
});

on: {
  DETAIL_REFRESHED: { target: "detail", update: refreshedNotification },
  DETAIL_REFRESH_FAILED: { target: "detail", update: refreshFailure },
}
```

After:

```ts
invoke: flow.refresh(incidentDetailResource, {
  params: detailParams,
  on: {
    success: { target: states.detail, update: ({ value }) => refreshed(value) },
    failure: { target: states.detail, update: ({ error }) => refreshFailed(error) },
    defect: { target: states.detail, update: ({ cause }) => refreshDefect(cause) },
    interrupt: states.detail,
  },
});

// Crossing an owner boundary remains explicit and inferred.
routes: flow.outcomes(runbookChild, {
  success: events.runbookFinished,
  failure: events.runbookFailed,
});
```

Acceptance:

- Local outcome handlers receive inferred Value, typed failure, defect Cause, and
  interruption and may transition or update without manufacturing an event.
- Public event definitions contain operator commands and genuine external or
  cross-owner signals, not private refresh or transaction lifecycle plumbing.
- Routed outcomes remain available when ownership requires event delivery; their
  payloads are inferred from the resource, transaction, stream, or child.
- Exhaustiveness is checked for every outcome the invoked owner can produce, and a
  reusable local or routed handler object cannot widen payloads.
- Inspection, receipts, serialization, restoration, and deterministic tests retain
  exact outcome facts even when no synthetic application event is created.

### [ ] P7B.10 Expose transition capabilities to React

Expose whether an actor can accept a concrete event in its current state and make
the result observable through focused React selection. The machine remains the
authority; components must not reconstruct transition rules.

Before:

```ts
const canReplaceRunbook =
  selection.state === "runbook" && !selection.mutationPending

<Button disabled={!canReplaceRunbook} onClick={() => send(events.replaceRunbook())} />
```

After:

```ts
const replace = useCan(actor, events.replaceRunbook())

<Button disabled={!replace} onClick={() => actor.send(events.replaceRunbook())} />
```

Acceptance:

- Capability checks include guards and active hierarchical state.
- Capability selection republishes only when the answer changes.
- `can` is advisory UI state; `send` still validates against the current generation
  and cannot bypass concurrency or ownership rules.

### [ ] P7B.11 Let React own an explicitly requested runtime

Add a provider form that accepts a Layer or runtime factory and owns synchronous
creation, startup failure, Strict Mode generations, close, and idempotent disposal.
Keep the existing caller-owned provider for applications that need external
runtime authority.

Before:

```tsx
const [runtime] = useState(() => createIncidentRuntime());
useEffect(() => () => void runtime.dispose(), [runtime]);

return <FlowProvider runtime={runtime}>{children}</FlowProvider>;
```

After:

```tsx
return (
  <FlowRuntimeProvider
    makeRuntime={createIncidentRuntime}
    fallback={({ cause }) => <StartupFailure cause={cause} />}
  >
    <IncidentConsole />
  </FlowRuntimeProvider>
);
```

Acceptance:

- React 18 and 19 Strict Mode prove one effective runtime and one cleanup per
  generation across mount, remount, explicit close, and startup failure.
- Provider-owned and caller-owned forms have distinct names and ownership docs.
- The provider adds no global singleton, hidden cache, or Promise-owned runtime.

## Phase 7 verification and definition of done

- `P7A` first lands a behavior-preserving client cleanup, plus the confirmed
  interaction corrections, using only the Phase 6 library surface.
- `P7B.0` records one canonical API for every library slice before implementation;
  rejected alternatives and TypeScript inference limits are explicit.
- Every recommendation in this manifest is implemented, deliberately rejected with
  executable evidence, or narrowed with a recorded semantic reason. Nothing is
  silently dropped because a target spelling changes.
- `incident-console` contains no raw public event construction, duplicated state or
  descriptor identifiers, plausible missing-ID sentinels, redundant keyed-event
  checks, schema re-decoding of typed snapshots, or manually duplicated domain
  vocabularies.
- Freshness and timer delays use `Duration.DurationInput`; retry and polling policy
  use `Schedule.Schedule` where recurrence is the actual concept.
- The ordinary path infers descriptor IDs, Params, Value, Error, Requirements,
  routed Events, registry snapshot values, and child output through source and
  packed declarations.
- The parent incident machine reads as product behavior: shared ownership and
  transitions are visible once, and each nested state contains only its distinct
  work.
- Type tests reject unknown states/events, mismatched route payloads, wrong resource
  replacements, invalid duration strings, incompatible Schedule requirements,
  untyped registry lookup, and inactive-parameter widening.
- Deterministic runtime and React tests prove hierarchy, reentry, replacement,
  optimistic rollback, retry/poll Schedule, capability changes, restore, Strict
  Mode, explicit close, and exact cleanup.
- Run the thermo-nuclear review before design and against the final refactored diff,
  fix its presumptive blockers, and re-review materially changed seams.
- Exit only after focused source and packed type proofs, affected package and
  flagship tests, browser acceptance, `pnpm fmt`, `pnpm lint`, and `pnpm verify`
  pass without accepted failures.
