/**
 * Vision v2: an executable Spec. Proposed syntax only; not compiled.
 *
 * A Flow module has the same four parts as a to-spec Spec, and each part is executable:
 *
 *   Spec section        Flow value                     What makes it executable
 *   ─────────────────   ────────────────────────────   ─────────────────────────────────────────
 *   model               definition(...)                 states own their data; types are the facts
 *   invariants          invariants(definition, ...)     checked before every publication
 *   implementation      machine(definition, ...)        the only code that changes truth
 *   tests               story(...)                      production runtime, real public boundary
 *
 * Core semantic changes over today (each removes concepts rather than adding them):
 *
 *  1. STATES OWN DATA. The definition stays the single cohesive vocabulary (your design), but a
 *     state may declare data that exists only while it is active. Entering requires it, leaving
 *     drops it. "Signed in" cannot exist without a session; the password cannot outlive the form.
 *
 *  2. EVENTS ARE THE OUTSIDE WORLD; RESULTS ARE HANDLED WHERE THEY ARE AWAITED. Today every
 *     operation outcome is routed into a made-up event (SaveSucceeded, SaveDefected …) and handled
 *     again in a state. Instead, a state declares `results` for the operations it waits on, keyed
 *     by operation and result tag. The vocabulary shrinks to what users and other actors can do.
 *     Auth goes from 12 events to 5.
 *
 *  3. ONE TRANSITION PIPELINE FOR EVERY TRIGGER: guard → target → set → actions.
 *     Triggers are a closed set: an event, an operation result, a timer, a stream value.
 *     All are ordinary FIFO turns; all transitions have the same four fields in evaluation order.
 *
 *  4. GUARDS ADMIT FACTS ("parse, don't validate"). A guard returns deny(code, context?) or the
 *     value it established. That value (`admitted`) flows into set and actions, so the transition
 *     never re-checks or re-derives what the guard already proved.
 *
 *  5. INVARIANTS RUN AT PUBLICATION. See the end of this file.
 */

import { Data, Duration, Effect, Schema, Stream } from "effect";
import { app, can, definition, deny, invariants, machine, resource, stream, story, transaction } from "flow-state";

// ─── Domain protocols ───────────────────────────────────────────────────────────────────────

export const Session = Schema.Struct({ userId: Schema.String, token: Schema.String, expiresAt: Schema.Number });
export const Credentials = Schema.Struct({ email: Schema.String, password: Schema.String });

export type SignInResult = Data.TaggedEnum<{
  Authenticated: { session: typeof Session.Type };
  MfaChallenged: { challengeId: string };
}>;
export class InvalidCredentials extends Data.TaggedError("InvalidCredentials")<{}> {}
export class AccountLocked extends Data.TaggedError("AccountLocked")<{}> {}
export class InvalidCode extends Data.TaggedError("InvalidCode")<{}> {}
export class SessionExpired extends Data.TaggedError("SessionExpired")<{}> {}

// Operations are unchanged from the settled design (AuthApi is a Context.Service; see v1).
declare const signIn: ReturnType<typeof transaction>;          // Credentials → SignInResult | InvalidCredentials | AccountLocked
declare const verifyMfa: ReturnType<typeof transaction>;       // { challengeId, code } → Authenticated | InvalidCode
declare const refresh: ReturnType<typeof transaction>;         // { token } → Authenticated | SessionExpired
declare const currentUser: ReturnType<typeof resource>;        // { userId } → User
declare const sessionRevocations: ReturnType<typeof stream>;   // { userId } → Stream<{ reason }>

// ─── Model: the definition (one cohesive vocabulary) ────────────────────────────────────────

export const Auth = definition({
  id: "Auth",
  data: {                                       // lives for the actor's lifetime
    email: Schema.String,
    failedAttempts: Schema.Int,
  },
  states: {
    SignedOut: { data: { password: Schema.String } },
    SigningIn: { data: { credentials: Credentials } },        // carries the admitted fact
    MfaRequired: { data: { challengeId: Schema.String } },
    SignedIn: { data: { session: Session }, states: { Active: {}, Refreshing: {} } },
    Locked: {},
  },
  events: {                                     // only what the outside world can do
    EmailChanged: { email: Schema.String },
    PasswordChanged: { password: Schema.String },
    SubmitCredentials: {},
    MfaCodeSubmitted: { code: Schema.String },
    SignOut: {},
  },
  operations: { signIn, verifyMfa, refresh, currentUser, sessionRevocations },
});
// Auth gives: S (state tokens), E (event constructors), Auth.match(snapshot, {...}) narrowing data,
// and Schemas for Event, Snapshot, Data — one source for UI, tests, CLI decoding and persistence.

// ─── Implementation: the machine ────────────────────────────────────────────────────────────

export const AuthMachine = machine(Auth, ({ S, E, O }) => ({
  initial: { target: S.SignedOut, set: { email: "", failedAttempts: 0, password: "" } },

  states: {
    SignedOut: {
      on: {
        EmailChanged: { target: S.SignedOut, set: { email: ({ event }) => event.email } },
        PasswordChanged: { target: S.SignedOut, set: { password: ({ event }) => event.password } },
        SubmitCredentials: {
          guard: ({ data }) =>
            data.failedAttempts >= 5 ? deny("TooManyAttempts", { failedAttempts: data.failedAttempts })
            : !/^\S+@\S+$/.test(data.email) ? deny("EmailInvalid")
            : data.password === "" ? deny("PasswordMissing")
            : { email: data.email, password: data.password },          // admitted Credentials
          target: S.SigningIn,                                         // password dropped on exit
          set: { credentials: ({ admitted }) => admitted },
          actions: [O.signIn.commit(({ admitted }) => admitted)],
        },
      },
    },

    SigningIn: {
      results: {                                                       // handled where awaited
        signIn: {
          Authenticated: { target: S.SignedIn.Active, set: { session: ({ value }) => value.session, failedAttempts: 0 } },
          MfaChallenged: { target: S.MfaRequired, set: { challengeId: ({ value }) => value.challengeId } },
          InvalidCredentials: {
            target: S.SignedOut,
            set: { password: "", failedAttempts: ({ data }) => data.failedAttempts + 1 },
          },
          AccountLocked: { target: S.Locked },
        },
      },
    },

    MfaRequired: {
      on: {
        MfaCodeSubmitted: {
          target: S.MfaRequired,
          actions: [O.verifyMfa.commit(({ data, event }) => ({ challengeId: data.challengeId, code: event.code }))],
        },
      },
      results: {
        verifyMfa: {
          Authenticated: { target: S.SignedIn.Active, set: { session: ({ value }) => value.session } },
          InvalidCode: { target: S.MfaRequired },
        },
      },
    },

    SignedIn: {
      activities: {
        user: O.currentUser.subscribe(({ data }) => ({ userId: data.session.userId })),   // never null here
        revocations: O.sessionRevocations.subscribe(({ data }) => ({ userId: data.session.userId })),
      },
      on: { SignOut: { target: S.SignedOut, set: { password: "" } } },
      results: { sessionRevocations: { value: { target: S.SignedOut, set: { password: "" } } } },  // stream value
      states: {
        Active: {
          timers: {
            refresh: {                                                 // a timer is a trigger, like an event
              delay: ({ data, now }) => Duration.millis(data.session.expiresAt - 60_000 - now),
              target: S.SignedIn.Refreshing,
              actions: [O.refresh.commit(({ data }) => ({ token: data.session.token }))],
            },
          },
        },
        Refreshing: {
          results: {
            refresh: {
              Authenticated: { target: S.SignedIn.Active, set: { session: ({ value }) => value.session } },
              SessionExpired: { target: S.SignedOut, set: { password: "" } },
            },
          },
        },
      },
    },

    Locked: {},
  },
}));

// ─── Invariants: claims over the model, not inside it ───────────────────────────────────────
// Facts the types already guarantee need no invariant (no session while signed out; no password
// after submit). What remains are relationships the types cannot express:

export const authInvariants = invariants(Auth, {
  "failed attempts never exceed five": ({ data }) => data.failedAttempts <= 5,
  "an admitted email is never empty": { in: [Auth.S.SigningIn, Auth.S.MfaRequired, Auth.S.SignedIn], holds: ({ data }) => data.email !== "" },
});

export const AuthApp = app({ id: "auth", machines: { auth: AuthMachine }, invariants: [authInvariants] });

// ─── Tests: a Story (unchanged shape) ───────────────────────────────────────────────────────
// story.app(AuthSetup, { id: "lockout", fixtures: [WrongPassword] })
//   .send(auth, Auth.E.EmailChanged({ email: "a@b.co" })) … ×5 … .process().checkpoint("locked")

/**
 * HOW INVARIANTS RUN
 *
 * Where: inside the turn, at the validation step that already exists (Statecharts O3 step 4),
 * after guard/target/set have produced the candidate cut and BEFORE it is published. Initial
 * entry and restored (hydrated) actors are checked the same way before activation.
 *
 * Which: every invariant whose `in` scope covers the candidate state (an unscoped one always
 * applies). Predicates are pure and synchronous over the candidate { state, data, context }.
 *
 * Mode (RuntimeSetup option; Stories and model traversal always use "enforce"):
 *   enforce  A violation rejects the turn exactly like a pre-commit callback defect: prior truth
 *            is kept, one issue-only snapshot is published, no actions start, and the diagnostic
 *            names the invariant, the trigger (event / result / timer) and the before/after data.
 *            A Story fails at that step; model traversal returns the path as a replayable Story.
 *   report   The turn publishes; the violation becomes an actor issue and a diagnostic.
 *            Suggested production default, so a wrong invariant cannot take an app down.
 *   off      Not evaluated.
 *
 * Cost: one pure predicate per in-scope invariant per turn; nothing allocated when none apply.
 * A predicate that throws is itself reported as a violation (defect), never swallowed.
 * Static: names and scopes are in the internal representation; graph/diff/coverage list them.
 * Not covered yet: transition properties (before/after) and cross-actor invariants — both can be
 * added later on the same evaluation point.
 */
