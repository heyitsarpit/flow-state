/**
 * Timers as Effect Schedules: five scenarios in two forms. Proposed syntax only; not compiled.
 * Schedule APIs used are checked against installed Effect 4.0.5 (duration, spaced, exponential,
 * jittered, upTo, min, cron, concat, map). 4.0.5 has no Schedule.take / andThen / while.
 *
 * Shared semantics (both forms):
 *  - Record keys (debounce, warn, poll …) are names the author chooses, like activity names.
 *  - A schedule starts when its state is entered and stops when the state is left; it restarts
 *    only on re-entry (`reenter`). Today's timer lifetime rules are unchanged.
 *  - Each recurrence sends one event after its delay elapses. The event is an ordinary FIFO turn;
 *    the receiving transition's guard decides whether anything happens (no timer `when`).
 *  - The schedule's input is void; its metadata ({ attempt, elapsed, … }) is available to build
 *    the event.
 *
 * PURE form   schedules: { name: Schedule<Event> }
 *             The schedule's output IS the event. Flow adds no fields.
 *             Memory-dependent timing needs a function computed at state entry:
 *             schedules: { name: ({ memory, now }) => Schedule<Event> }  ← the one Flow addition.
 *
 * MIDDLE form schedules: { name: { schedule, send } }
 *             schedule: Duration.Input | Schedule | ({ memory, now }) => either
 *             send:     Event | ({ attempt, … }) => Event
 */

import { Schedule } from "effect";
declare const S: any, E: any, O: any, deny: any;

// ─── Scenario 1: debounced autosave — save 2 seconds after the last keystroke ───────────────
// Each edit re-enters EDITING, which restarts its schedule. Pure statechart, no counters.

const autosavePure = {
  EDITING: {
    schedules: {
      debounce: Schedule.duration("2 seconds").pipe(Schedule.map(() => E.AutosaveDue())),
    },
    on: {
      TitleChanged: { target: S.EDITING, reenter: S.EDITING, updateMemory: ({ event }: any) => ({ draft: event.title }) },
      AutosaveDue: { target: S.SAVING, actions: [/* O.saveTitle.commit(…) */] },
    },
  },
};

const autosaveMiddle = {
  EDITING: {
    schedules: {
      debounce: { schedule: "2 seconds", send: E.AutosaveDue() },
    },
    on: { /* identical */ },
  },
};

// ─── Scenario 2: idle session — warn at 14 minutes, sign out at 15 ──────────────────────────
// Any activity re-enters ACTIVE, restarting the countdown.

const idlePure = {
  ACTIVE: {
    schedules: {
      // One schedule, two events in sequence: concat runs the second after the first completes.
      idle: Schedule.concat(
        Schedule.duration("14 minutes").pipe(Schedule.map(() => E.IdleWarning())),
        Schedule.duration("1 minute").pipe(Schedule.map(() => E.IdleTimeout())),
      ),
    },
    on: {
      UserActive: { target: S.ACTIVE, reenter: S.ACTIVE, updateMemory: () => ({ warned: false }) },
      IdleWarning: { target: S.ACTIVE, updateMemory: () => ({ warned: true }) },   // no reenter: countdown continues
      IdleTimeout: { target: S.SIGNED_OUT },
    },
  },
};

const idleMiddle = {
  ACTIVE: {
    schedules: {
      // Two independent entries; both restart on re-entry.
      warn: { schedule: "14 minutes", send: E.IdleWarning() },
      timeout: { schedule: "15 minutes", send: E.IdleTimeout() },
    },
    on: { /* identical */ },
  },
};

// ─── Scenario 3: health polling — every 30s when healthy; backoff when degraded ─────────────
// Degraded backoff starts at 5s, doubles, never waits longer than 5 minutes (Schedule.min picks
// the shorter delay), with jitter so many clients do not poll in lockstep.

const pollingPure = {
  HEALTHY: {
    schedules: { poll: Schedule.spaced("30 seconds").pipe(Schedule.map(() => E.PollDue())) },
    on: { PollDue: { target: S.HEALTHY, actions: [/* O.health.refetch(…) → HealthFailed */] }, HealthFailed: { target: S.DEGRADED } },
  },
  DEGRADED: {
    schedules: {
      poll: Schedule.min([Schedule.exponential("5 seconds"), Schedule.spaced("5 minutes")]).pipe(
        Schedule.jittered,
        Schedule.map(() => E.PollDue()),
      ),
    },
    on: { PollDue: { target: S.DEGRADED, actions: [/* refetch → HealthOk */] }, HealthOk: { target: S.HEALTHY } },
  },
};

const pollingMiddle = {
  HEALTHY: { schedules: { poll: { schedule: "30 seconds", send: E.PollDue() } }, on: { /* identical */ } },
  //                                  ^ in the middle form a bare duration means "once"; polling
  //                                    needs Schedule.spaced("30 seconds") — see the note below.
  DEGRADED: {
    schedules: {
      poll: {
        schedule: Schedule.min([Schedule.exponential("5 seconds"), Schedule.spaced("5 minutes")]).pipe(Schedule.jittered),
        send: E.PollDue(),
      },
    },
    on: { /* identical */ },
  },
};

// ─── Scenario 4: token refresh before expiry, retry with backoff, then give up ──────────────
// Timing depends on memory (session.expiresAt), so it is computed when ACTIVE is entered.
// "Give up" belongs to the refresh RESULT (third failure), not to the schedule running out,
// so it is a guard on the failure event — no `done` concept needed.

const refreshPure = {
  ACTIVE: {
    schedules: {
      refresh: ({ memory, now }: any) =>
        Schedule.duration(memory.session.expiresAt - 60_000 - now).pipe(Schedule.map(() => E.RefreshDue())),
    },
    on: { RefreshDue: { target: S.REFRESHING, actions: [/* O.refresh.commit(…) */] } },
  },
  REFRESHING: {
    on: {
      RefreshFailed: [
        { guard: ({ memory }: any) => memory.refreshFailures < 3 || deny("GaveUp"), target: S.RETRY_WAIT,
          updateMemory: ({ memory }: any) => ({ refreshFailures: memory.refreshFailures + 1 }) },
        { target: S.SIGNED_OUT },
      ],
    },
  },
  RETRY_WAIT: {
    schedules: {
      // One retry per entry; backoff grows with the failure count already in memory.
      retry: ({ memory }: any) =>
        Schedule.duration(2_000 * 2 ** memory.refreshFailures).pipe(Schedule.map(() => E.RefreshDue())),
    },
    on: { RefreshDue: { target: S.REFRESHING, actions: [/* O.refresh.commit(…) */] } },
  },
};

const refreshMiddle = {
  ACTIVE: {
    schedules: {
      refresh: { schedule: ({ memory, now }: any) => memory.session.expiresAt - 60_000 - now, send: E.RefreshDue() },
    },
  },
  RETRY_WAIT: {
    schedules: {
      retry: { schedule: ({ memory }: any) => 2_000 * 2 ** memory.refreshFailures, send: E.RefreshDue() },
    },
  },
  // REFRESHING identical.
};

// ─── Scenario 5: weekday 09:00 digest, spread over a few minutes ────────────────────────────

const digestPure = {
  OPEN: {
    schedules: { digest: Schedule.cron("0 9 * * 1-5").pipe(Schedule.map(() => E.DigestDue())) },
    on: { DigestDue: { target: S.OPEN, actions: [/* O.digest.lookup(…) */] } },
  },
};

const digestMiddle = {
  OPEN: { schedules: { digest: { schedule: Schedule.cron("0 9 * * 1-5"), send: E.DigestDue() } } },
};

/**
 * WHAT THE SCENARIOS SHOW
 *
 * Pure form
 *  + No Flow timer vocabulary at all: a schedule entry is an Effect Schedule whose output is the
 *    event. Anything Schedule can express (concat, min, jitter, cron) works unchanged.
 *  + Multi-step timelines (scenario 2) are one value.
 *  − Every entry ends in `.pipe(Schedule.map(() => E.X()))` — the common one-shot case is the
 *    noisiest line in the file.
 *  − Memory-dependent timing (scenario 4) still needs a Flow callback around the Schedule, so the
 *    pure form is not entirely pure.
 *
 * Middle form
 *  + Simple cases read as a sentence: { schedule: "2 seconds", send: E.AutosaveDue() }.
 *  + Event construction is separate from timing, so the same Schedule value can be reused.
 *  − Two invented fields, and an ambiguity: does a bare duration mean "once" or "every"? It
 *    must mean once (Schedule.duration); polling needs an explicit Schedule.spaced.
 *  − Multi-step timelines become several entries (scenario 2), which is fine but less exact.
 *
 * Neither form needs `when` (the receiving guard decides) or `done` (exhaustion was never the
 * right trigger in these scenarios; results and guards were).
 */
