/**
 * Exploration for SurfaceSimplification Q15: how a consumer reacts to provider context changes.
 * Proposed syntax only; not compiled, not part of the reference app.
 *
 * Goal of the change: every "provider change → my event" edge is static data, so tools can list
 * "Session.canEdit change can send PermissionRevoked" without running a callback (D2). Callbacks
 * may still compute values (selected value, predicate, payload); they may not pick the event.
 *
 * Two candidate shapes are compared against today's onContext.select:
 *   S1  slot-keyed record:   onContext: { canEdit: { event, when? } }
 *   S2  reaction list:       onContext: [{ select?, when?, event }]
 * In both, the Runtime calls the event constructor with (current, previous) of the selection, so
 * payloads stay computable. The initial selection stays silent; emitted events are ordinary
 * mailbox turns whose handlers own legality — unchanged from today.
 */

// ─── Shared providers ────────────────────────────────────────────────────────────────────────

const Session = definition({
  id: "Desk/Session",
  states: ["AUTHENTICATED", "REFRESHING", "SIGNED_OUT"],
  events: { /* … */ },
  memory: () => ({ userId: "u1", canEdit: true, role: "agent" as "agent" | "admin" }),
});

const Connectivity = definition({
  id: "Desk/Connectivity",
  states: ["ONLINE", "OFFLINE"],
  events: { /* … */ },
});

const Locks = definition({
  id: "Desk/Locks",
  states: ["READY"],
  events: { /* … */ },
  memory: () => ({ holders: {} as Record<string, string> }), // ticketId → userId
});

// ─── Consumer: ticket editor ─────────────────────────────────────────────────────────────────
// Requirements that make this complex:
//  R1 Editing is allowed only while canEdit && online && (no lock || lock is mine).
//     Losing it while EDITING moves to READONLY and keeps the draft; regaining it returns.
//     Losing it while SAVING must cancel the save; regaining it while SAVING does nothing.
//  R2 Session AUTHENTICATED → SIGNED_OUT closes the editor; REFRESHING → AUTHENTICATED (a token
//     refresh) must NOT be treated as a new sign-in, but SIGNED_OUT → AUTHENTICATED reopens.
//  R3 Someone else taking the lock records who took it, for the banner "locked by X".
//  R4 Only a role change (not any session memory change) re-evaluates admin-only tools.

const Editor = definition({
  id: "Desk/Editor",
  states: [{ OPEN: ["EDITING", "READONLY", "SAVING"] }, "CLOSED"],
  events: {
    EditBlocked: "bare",
    EditUnblocked: "bare",
    SessionEnded: "bare",
    SessionStarted: "bare",
    LockTaken: (holder: string) => ({ holder }),
    RoleChanged: (role: "agent" | "admin") => ({ role }),
    /* … */
  },
  context: {
    canEdit: Session.select(({ memory }) => memory.canEdit),
    userId: Session.select(({ memory }) => memory.userId),
    role: Session.select(({ memory }) => memory.role),           // narrow slot for R4
    sessionState: Session.select(({ state }) => state),
    online: Connectivity.select(({ state }) => state === Connectivity.S.ONLINE),
    lockHolders: Locks.select(({ memory }) => memory.holders),
  },
  memory: ({ input }: { input: { ticketId: string } }) => ({ ticketId: input.ticketId, draft: "" }),
});

// ─── BEFORE: today's onContext.select ────────────────────────────────────────────────────────

machine(Editor, ({ S, E, onContext }) => {
  // R1: one selector combines three providers and the consumer's own memory.
  onContext.select(
    ({ context, memory }) => {
      const holder = context.lockHolders[memory.ticketId];
      return context.canEdit && context.online && (holder === undefined || holder === context.userId);
    },
    // The handler picks between two events. Tools cannot see which events this can send.
    (editable, previous) => (previous === undefined ? null : editable ? E.EditUnblocked() : E.EditBlocked()),
  );

  // R2: transition-sensitive logic using previous; picks between two events or none.
  onContext.select(
    ({ context }) => context.sessionState,
    (current, previous) => {
      if (current === Session.S.SIGNED_OUT) return E.SessionEnded();
      if (current === Session.S.AUTHENTICATED && previous === Session.S.SIGNED_OUT) return E.SessionStarted();
      return null; // REFRESHING → AUTHENTICATED ignored
    },
  );

  // R3: payload computed from the selection.
  onContext.select(
    ({ context, memory }) => context.lockHolders[memory.ticketId] ?? null,
    (holder, previous) => (holder !== null && holder !== previous ? E.LockTaken(holder) : null),
  );

  // R4: sub-field reaction.
  onContext.select(({ context }) => context.role, (role) => E.RoleChanged(role));

  return {
    default: S.OPEN,
    states: {
      OPEN: {
        default: S.OPEN.S.EDITING,
        on: { SessionEnded: S.CLOSED },
        states: {
          EDITING: { on: { EditBlocked: S.OPEN.S.READONLY } },
          READONLY: { on: { EditUnblocked: S.OPEN.S.EDITING } },
          SAVING: { on: { EditBlocked: { target: S.OPEN.S.READONLY, actions: ({ memory }) => [/* cancel save */] } } },
        },
      },
      CLOSED: { on: { SessionStarted: S.OPEN } },
    },
  };
});

// ─── AFTER S1: slot-keyed record ─────────────────────────────────────────────────────────────
// One entry per context slot; the selected value is the slot itself.

machine(Editor, ({ S, E, O }) => ({
  onContext: {
    // R1 does not fit: "editable" spans canEdit, online, lockHolders, userId and memory.ticketId.
    // Workaround: one bare event per slot, then recompute editability in guards, e.g.
    //   canEdit: { event: E.EditabilityChanged }, online: { event: E.EditabilityChanged }, …
    // and in every state: EditabilityChanged: [{ guard: editable, target: … }, { target: … }].
    // That duplicates the editability rule in guards and fires on changes that do not alter it.
    canEdit: { event: E.EditabilityChanged },
    online: { event: E.EditabilityChanged },
    lockHolders: { event: E.EditabilityChanged },

    // R2 does not fit with one event per slot. Either a list per slot (a second form) or one
    // event carrying (current, previous) with guards in the handler:
    sessionState: { event: E.SessionChanged }, // SessionChanged: (current, previous) => ({ current, previous })

    // R4 fits once the slot is narrow.
    role: { event: E.RoleChanged },
  },
  // … states with guards that re-derive editability and decode SessionChanged transitions.
}));

// Verdict on S1: R1 and R2 lose clarity. The rule "what counts as editable" ends up spread over
// several guards, and transition-sensitive session logic moves into handler guards. This is the
// "major loss" — S1 is too restrictive.

// ─── AFTER S2: reaction list with static events ──────────────────────────────────────────────
// Each reaction: optional select (pure value over context + memory), optional when predicate over
// (current, previous), and one static event. Several reactions may share a selection to send
// different events. Tools see every edge: [select source slots] → event.

const editable = ({ context, memory }) => {
  const holder = context.lockHolders[memory.ticketId];
  return context.canEdit && context.online && (holder === undefined || holder === context.userId);
};

machine(Editor, ({ S, E, O }) => ({
  onContext: [
    // R1: same single rule as today; two reactions instead of a handler choosing the event.
    { select: editable, when: (now) => !now, event: E.EditBlocked },
    { select: editable, when: (now) => now, event: E.EditUnblocked },

    // R2: previous is still available; each outcome is its own visible edge.
    { select: ({ context }) => context.sessionState, when: (now) => now === Session.S.SIGNED_OUT, event: E.SessionEnded },
    {
      select: ({ context }) => context.sessionState,
      when: (now, before) => now === Session.S.AUTHENTICATED && before === Session.S.SIGNED_OUT,
      event: E.SessionStarted, // REFRESHING → AUTHENTICATED matches neither reaction: ignored
    },

    // R3: payload from the selection — the constructor receives (current, previous).
    {
      select: ({ context, memory }) => context.lockHolders[memory.ticketId] ?? null,
      when: (holder, before) => holder !== null && holder !== before,
      event: E.LockTaken, // LockTaken: (holder: string) => ({ holder })
    },

    // R4: select is always written (one form), even when it reads a single slot.
    { select: ({ context }) => context.role, event: E.RoleChanged },
  ],
  default: S.OPEN,
  states: {
    OPEN: {
      default: S.OPEN.EDITING,
      on: { SessionEnded: S.CLOSED },
      states: {
        EDITING: { on: { EditBlocked: S.OPEN.READONLY } },
        READONLY: { on: { EditUnblocked: S.OPEN.EDITING } },
        // "Regaining while SAVING does nothing" needs no code: SAVING has no EditUnblocked handler,
        // so the event is a silent no-op. Reading own state stays in the statechart, visible.
        SAVING: {
          on: {
            EditBlocked: {
              target: S.OPEN.READONLY,
              actions: [O.saveTitle.cancel(({ memory }) => ({ ticketId: memory.ticketId }))],
            },
          },
        },
      },
    },
    CLOSED: { on: { SessionStarted: S.OPEN } },
  },
}));

/**
 * What S2 keeps from today:
 *  - Arbitrary selections across several providers and the consumer's memory (R1).
 *  - previous, for transition-sensitive reactions (R2).
 *  - Computed payloads, via the constructor receiving (current, previous) (R3).
 *  - Sub-field reactions without new slots (R4 could select context.role or a sub-field).
 *
 * What S2 changes:
 *  - The event is static. A handler choosing among events becomes several reactions sharing a
 *    selection. Tools now list every possible context-driven event.
 *  - Reading the consumer's own STATE in the selection is not allowed (memory is). Today a
 *    selector over state is re-evaluated only on context changes, which is misleading; state
 *    conditions belong in the statechart (see SAVING above).
 *  - The machine callback no longer receives onContext; reactions live in the machine config.
 *
 * Open details:
 *  - Should select be allowed to read memory? Today it can. Memory changes do not trigger
 *    re-selection, only context waves do, which can surprise authors. Option: select reads
 *    context only, and memory-dependent parts (memory.ticketId above) move into a selector
 *    parameter or a guard.
 *  - Equality stays Object.is / fieldwise for records, as today.
 */
