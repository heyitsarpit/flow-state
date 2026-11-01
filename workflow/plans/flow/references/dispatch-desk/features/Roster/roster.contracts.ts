// The roster contracts: plain requests with no entity or domain imports (roster.domain.ts says what they mean for
// shared records). Every contract states `input`, `output` and `key` (rule 39).
//
// Where the data comes from: roster-api.ts, an adapter on Effect's `HttpClient` (and, under it, `fetch`), with
// invitations batched by `RequestResolver` below the commit (MD 2.7.11), and a change log polled after a cursor.
import { Duration, Effect, Option, Schedule, Schema, Stream } from "effect";
import { Feed, resource, stream, transaction } from "flow-state"; // pending merge 6: Feed, stream
import { unknownWhenLost } from "../shared/outcomes.js";
import {
  ChangeBatch,
  CustomerRow,
  PollFailed,
  RosterApi,
  RosterChange,
  RosterPage,
  TeamRow,
  TeamSizes,
  TechnicianRow,
} from "./roster-api.js";

const workspace = { workspaceId: Schema.String };

const technician = { workspaceId: Schema.String, technicianId: Schema.String };

// --- reads ----------------------------------------------------------------------------------------------

// "My team, and everyone not placed yet", a page at a time. `locale` changes how the page renders "last seen" and
// never which technicians come back or their order, so it is in the key (the answer's text differs) and the
// domain `.ignoring`s it for repair.
export const rosterOf = resource({
  id: "DispatchDesk/roster",
  input: {
    ...workspace,
    teamId: Schema.String,
    locale: Schema.String,
    page: Schema.optionalKey(Schema.Int),
  },
  output: RosterPage,
  key: ["workspaceId", "teamId", "locale", "page"],
  lookup: (input, { signal }) => RosterApi.use((api) => api.technicians(input, { signal })),
  staleTime: "30 seconds",
  gcTime: "5 minutes",
});

export const technicianById = resource({
  id: "DispatchDesk/technician-by-id",
  input: technician,
  output: TechnicianRow,
  key: ["workspaceId", "technicianId"],
  lookup: (key, { signal }) => RosterApi.use((api) => api.technician(key, { signal })),
  staleTime: "30 seconds",
  gcTime: "5 minutes",
});

export const teamsOf = resource({
  id: "DispatchDesk/teams",
  input: workspace,
  output: Schema.Array(TeamRow),
  key: ["workspaceId"],
  lookup: (input, { signal }) => RosterApi.use((api) => api.teams(input, { signal })),
  staleTime: "1 minute",
  gcTime: "5 minutes",
});

export const teamSizesOf = resource({
  id: "DispatchDesk/team-sizes",
  input: workspace,
  output: TeamSizes,
  key: ["workspaceId"],
  lookup: (input, { signal }) => RosterApi.use((api) => api.teamSizes(input, { signal })),
  staleTime: "1 minute",
  gcTime: "5 minutes",
});

export const customersOf = resource({
  id: "DispatchDesk/customers",
  input: workspace,
  output: Schema.Array(CustomerRow),
  key: ["workspaceId"],
  lookup: (input, { signal }) => RosterApi.use((api) => api.customers(input, { signal })),
  staleTime: "1 minute",
  gcTime: "5 minutes",
});

// --- writes ---------------------------------------------------------------------------------------------

export const moveTechnician = transaction({
  id: "DispatchDesk/move-technician",
  input: { ...technician, from: Schema.String, to: Schema.String },
  output: TechnicianRow,
  key: ["workspaceId", "technicianId"],
  concurrency: "reject",
  commit: (input, { attempt, signal }) =>
    RosterApi.use((api) => api.move(input, { idempotencyKey: attempt.id, signal })).pipe(
      unknownWhenLost,
    ),
});

export const renameTechnician = transaction({
  id: "DispatchDesk/rename-technician",
  input: { ...technician, name: Schema.String },
  output: TechnicianRow,
  key: ["workspaceId", "technicianId"],
  concurrency: "reject",
  commit: (input, { attempt, signal }) =>
    RosterApi.use((api) => api.rename(input, { idempotencyKey: attempt.id, signal })).pipe(
      unknownWhenLost,
    ),
});

export const setSkills = transaction({
  id: "DispatchDesk/set-skills",
  input: { ...technician, skills: Schema.Array(Schema.String) },
  output: TechnicianRow,
  key: ["workspaceId", "technicianId"],
  concurrency: "reject",
  commit: (input, { attempt, signal }) =>
    RosterApi.use((api) => api.setSkills(input, { idempotencyKey: attempt.id, signal })).pipe(
      unknownWhenLost,
    ),
});

// HasOpenTickets (409) and TechnicianGone (404) are definite: the record the remove hid comes back.
export const removeTechnician = transaction({
  id: "DispatchDesk/remove-technician",
  input: technician,
  key: ["workspaceId", "technicianId"], // no output: void
  concurrency: "reject",
  commit: (input, { attempt, signal }) =>
    RosterApi.use((api) => api.remove(input, { idempotencyKey: attempt.id, signal })).pipe(
      unknownWhenLost,
    ),
});

// One write over two entities and N tickets (roster.domain.ts predicts all of it). `tickets` is what the admin's
// screen shows of the merged customer: the client re-points exactly those, and the server re-points the same
// set or refuses (MergeConflict, 409). One merge per merged customer at a time.
export const mergeCustomers = transaction({
  id: "DispatchDesk/merge-customers",
  input: {
    ...workspace,
    survivorId: Schema.String,
    mergedId: Schema.String,
    tickets: Schema.Array(Schema.Struct({ workspaceId: Schema.String, ticketId: Schema.String })),
  },
  output: CustomerRow,
  key: ["workspaceId", "mergedId"],
  concurrency: "reject",
  commit: (input, { attempt, signal }) =>
    RosterApi.use((api) => api.merge(input, { idempotencyKey: attempt.id, signal })).pipe(
      unknownWhenLost,
    ),
});

// One invite per draft (its own key and Attempt), batched below the commit: the adapter's `RequestResolver` sends
// every invite of a turn in one request and completes each from its own item (MD 2.7.11). InviteRejected (422) is
// definite, per item.
export const inviteTechnician = transaction({
  id: "DispatchDesk/invite-technician",
  input: { ...workspace, draftId: Schema.String, name: Schema.String, email: Schema.String },
  output: TechnicianRow,
  key: ["draftId"],
  concurrency: "reject",
  commit: (input, { attempt, signal }) =>
    RosterApi.use((api) => api.invite(input, { idempotencyKey: attempt.id, signal })).pipe(
      unknownWhenLost,
    ),
});

// "Send the invite email again": safe to repeat, many at once, each answered on its own. `allow` gives every
// Attempt its own lane for its own ending's turn: nothing holds, so a key-less `retry` exists only in that ending's
// handler (rule N2), and the row is `{ pending, outstanding }`.
export const sendInviteEmail = transaction({
  id: "DispatchDesk/send-invite-email",
  input: technician,
  key: ["workspaceId", "technicianId"],
  concurrency: "allow",
  commit: (input, { attempt, signal }) =>
    RosterApi.use((api) => api.sendInviteEmail(input, { idempotencyKey: attempt.id, signal })).pipe(
      unknownWhenLost,
    ),
});

// One per workspace: the roster actor is per workspace, so `key: []` is "one lane for this actor". A plain write
// (no domain); its `writes` invalidates the roster after the server rebuilt the index it reads (2.8.9).
export const rebuildIndex = transaction({
  id: "DispatchDesk/rebuild-roster-index",
  input: workspace,
  key: [],
  concurrency: "reject",
  commit: (input, { attempt, signal }) =>
    RosterApi.use((api) => api.rebuildIndex(input, { idempotencyKey: attempt.id, signal })).pipe(
      unknownWhenLost,
    ),
});

// --- the change log, polled (pending merge 6) ------------------------------------------------------------

// Polling with a cursor (M6 4.7, recipe P): every connection is a loop of GETs from the cursor, one a second. A
// failed GET is a typed drop (`PollFailed`), not a defect, and the resume position survives it. The proof is the
// server's contract ("the poll returns every change after the cursor"), prepended before the first answer, so an
// offline device reads `Live` until that GET fails: polling has no registration to wait for (stated, RV3 L5).
const poll = (workspaceId: string) => (from: number | undefined) =>
  Stream.paginate(from ?? 0, (cursor: number) =>
    RosterApi.use((api) =>
      Effect.acquireUseRelease(
        Effect.sync(() => new AbortController()),
        (controller) => api.changes({ workspaceId, after: cursor }, { signal: controller.signal }),
        (controller) => Effect.sync(() => controller.abort()),
      ),
    ).pipe(
      Effect.map((batch: ChangeBatch) => [batch.changes, Option.some(batch.cursor)] as const),
      Effect.delay(Duration.seconds(1)),
    ),
  ).pipe(
    Stream.prepend([
      Feed.live({ proof: `the poll returns every change after ${String(from ?? 0)}` }),
    ]), // pending merge 6
  );

const pollSchedule = Schedule.spaced("5 seconds").pipe(Schedule.upTo({ times: 12 }));

// The roster's audit log: a fact feed into the admin screen's memory, resuming from the cursor it stored (S4). A
// first registration on an empty roster log is `fresh` (no `from`), and its `missed` carries `initial` (S10).
export const rosterEvents = stream({
  // pending merge 6
  id: "DispatchDesk/roster-events",
  input: { ...workspace, after: Schema.optional(Schema.Int) },
  output: RosterChange,
  key: ["workspaceId"],
  delivers: "facts",
  subscribe: ({ workspaceId, after }) =>
    Feed.reconnect(poll(workspaceId), {
      from: after,
      position: (change) => change.seq,
      while: (error) => error._tag === "PollFailed",
      schedule: pollSchedule,
    }),
});

// The same log, consumed by the store: technician records change in place for every screen, and the answers that
// hold technicians are lowered on every start (a `listen` session starts fresh and keeps no position, M6 2.7).
export const technicianChanges = stream({
  // pending merge 6
  id: "DispatchDesk/technician-changes",
  input: workspace,
  output: RosterChange,
  key: ["workspaceId"],
  delivers: "facts",
  subscribe: ({ workspaceId }) =>
    Feed.reconnect(poll(workspaceId), {
      while: (error: PollFailed) => error._tag === "PollFailed",
      schedule: pollSchedule,
    }),
});
