# Build A: proposal v2 (traits and subroutines, I/O through `requests`)

The three apps from [apps.md](apps.md), built in system **A** as
[proposal-v2.md](../proposal-v2.md) writes it. Where a known review finding
([v2-correctness.md](../reviews/v2-correctness.md), [v2-principles.md](../reviews/v2-principles.md))
makes a written rule unusable, the build uses the obvious fix and marks it
`// RELIES ON REVIEW FIX:`. Those markers are not workarounds and are not counted as fakes. Every
workaround is marked `// FAKED:` with what it stands in for.

Three fixes from the reviews are used:

- **Rule 8** (principles blocker 1): only a host transition that **exits** a subroutine's state
  abandons it. A `"self"` handler above it does not. The issue list needs this, because its root
  handles search, sort, pins and refresh while `DELETING` is active.
- **Rule 3** (correctness M2): when a callback filling enters a step, the callback's payload counts
  as `event`. The issue list's `onHeld` enters `DELETING`.
- **Example names** (principles major 6): the commit request is named `submit`, not `send`, and
  Field's input is `initialValue`, not `start`.

The build avoids two areas the reviews call undefined rather than inventing a meaning for them. It
uses no guard arrays (principles major 3). Its nested trait `input` fillings read nothing
(principles major 2).

The operation handles, fixtures and seeded data (`AuthDomain`, `AccountsDomain`, `IssuesDomain`,
`AuthFixture`, `AccountsFixture`, `IssuesFixture`) are declared elsewhere, as in the proposal's own
examples. apps.md puts adapters out of scope. The block below records only the shapes and
concurrency the code relies on.

```ts
// shared/operations.ts — the handles the three apps use. Adapters are out of scope (apps.md);
// each domain is declared elsewhere. This records only what the machines rely on.
//
//   O.Auth.verifyCode    transaction  input { challengeId, code }   errors WrongCode | Expired  "reject"
//   O.Auth.resendCode    transaction  input { challengeId }         no typed errors             "reject"
//   O.Accounts.create    transaction  input { email, password, name, role, invites }
//                                     errors EmailTaken | Busy                                 "reject"
//   O.Issues.list        resource     key: the whole query          result { items, total }
//   O.Issues.setPinned   transaction  key ({ id }), input { id, pinned }, returns Issue,
//                                     error PinRejected { id }                                 "reject"
//   O.Issues.deleteMany  transaction  input { ids }                 error DeleteRejected        "reject"
//
// verifyCode, resendCode, create and deleteMany are bound to fragment requests, so they may not
// use "allow" (v2 rule 9). setPinned is a plain host commit; "reject" is per key, so pins on
// different rows run at once.
// FAKED: PinRejected carries { id }. Outcome mappers receive values only (Machines O6), and the
// host runs one commit per row, so the failed row is only recoverable from the error itself.
export { AccountsDomain, AuthDomain, IssuesDomain } from "./domains.js";
```

---

## Shared fragments

Six fragments. `Field`, `Debounce`, `HoldToConfirm`, `Confirm` and `CommitWithRetry` are the
proposal's own, adjusted for the review renames. `HoldToConfirm` drops the guard array. `Field`
tracks `edited` (apps.md: "the error shows after the first edit") instead of `touched`-on-blur.
`Cooldown` and `Flash` are new.

```ts
// shared/fragments.ts — reusable traits and subroutines for the three apps. None of them reads
// context, sends to other actors or runs activities (v2 rule 14). Only CommitWithRetry does I/O,
// through its `submit` request.
import { Duration, Schema } from "effect";
import { Attempt, deny, subroutine, trait } from "flow-state";

// ── Field (trait): a validated value; the user edits it, the host may set it ───────────────
// `edited` turns true on the first user edit, so the view can hold the error back until then.
// A host Set is not an edit: it clears `edited` (the 2FA field is cleared after a wrong code).
export const Field = <V, I>(value: Schema.Codec<V, I>, p: { validate: (v: V) => string | null }) =>
  trait(
    {
      id: "Field",
      input: { initialValue: value },
      events: { Changed: { value } }, // anyone; only canEdit can refuse it
      hostEvents: { Set: { value } },
      memory: { value, edited: Schema.Boolean, error: Schema.NullOr(Schema.String) },
      initial: ({ input }) => ({
        value: input.initialValue,
        edited: false,
        error: p.validate(input.initialValue),
      }),
      guards: ["canEdit"],
      callbacks: { onChanged: { value } },
    },
    ({ guards, callbacks }) => ({
      on: {
        Changed: {
          target: "self",
          guard: guards.canEdit,
          updateMemory: ({ event }) => ({
            value: event.value,
            edited: true,
            error: p.validate(event.value),
          }),
          notify: [callbacks.onChanged.from(({ event }) => ({ value: event.value }))],
        },
        Set: {
          target: "self", // unguarded and silent: total, so a result handler may raise it
          updateMemory: ({ event }) => ({
            value: event.value,
            edited: false,
            error: p.validate(event.value),
          }),
        },
      },
    }),
  );

export const isValid = (f: { error: string | null }) => f.error === null;

export const visibleError = (f: { edited: boolean; error: string | null }) =>
  f.edited ? f.error : null;

export const isEmail = (v: string) => v.includes("@");

// ── Debounce (trait): tells its host once, `wait` after the last Input ─────────────────────
export const Debounce = (p: { wait: Duration.Input }) =>
  trait(
    {
      id: "Debounce",
      hostEvents: { Input: {} },
      internalEvents: { Due: {} },
      // FAKED: no "arm this schedule now" action exists. A counter that only Input changes,
      // read by restartOn, stands in for one. Cooldown, Flash and HoldToConfirm repeat the idiom.
      memory: { seq: Schema.Int },
      initial: () => ({ seq: 0 }),
      callbacks: { onSettled: {} },
    },
    ({ E, callbacks }) => ({
      schedules: {
        settle: { schedule: p.wait, send: E.Due, restartOn: ({ memory }) => memory.seq },
      },
      on: {
        Input: { target: "self", updateMemory: ({ memory }) => ({ seq: memory.seq + 1 }) },
        Due: { target: "self", notify: [callbacks.onSettled] },
      },
    }),
  );

// ── Cooldown (trait): after Start, `until` holds when it ends; views count down to it ───────
// The host refuses its own action while `until` is set; the trait refuses nothing.
export const Cooldown = (p: { length: Duration.Input }) =>
  trait(
    {
      id: "Cooldown",
      hostEvents: { Start: {} },
      internalEvents: { Over: {} },
      // FAKED: the schedule's deadline is not readable from a snapshot (dueAt exists only in a
      // firing's metadata), so `until` copies it from `now`. The 2FA lockout repeats this by hand.
      memory: { until: Schema.NullOr(Schema.Number), starts: Schema.Int },
      initial: () => ({ until: null, starts: 0 }),
    },
    ({ E }) => ({
      schedules: {
        over: { schedule: p.length, send: E.Over, restartOn: ({ memory }) => memory.starts },
      },
      on: {
        Start: {
          target: "self",
          updateMemory: ({ memory, now }) => ({
            until: now + Duration.toMillis(p.length),
            starts: memory.starts + 1,
          }),
        },
        Over: { target: "self", updateMemory: () => ({ until: null }) },
      },
    }),
  );

export const secondsLeft = (until: number, now: number) =>
  Math.max(0, Math.ceil((until - now) / 1000));

// ── Flash (trait): shows a message for `length`; a newer message replaces it ───────────────
export const Flash = (p: { length: Duration.Input }) =>
  trait(
    {
      id: "Flash",
      hostEvents: { Show: { text: Schema.String } },
      internalEvents: { Hide: {} },
      memory: { text: Schema.NullOr(Schema.String), shows: Schema.Int }, // FAKED: counter idiom
      initial: () => ({ text: null, shows: 0 }),
    },
    ({ E }) => ({
      schedules: {
        hide: { schedule: p.length, send: E.Hide, restartOn: ({ memory }) => memory.shows },
      },
      on: {
        Show: {
          target: "self",
          updateMemory: ({ event, memory }) => ({ text: event.text, shows: memory.shows + 1 }),
        },
        Hide: { target: "self", updateMemory: () => ({ text: null }) },
      },
    }),
  );

// ── HoldToConfirm (trait): tells its host after a continuous hold ──────────────────────────
// Release is public and unguarded, so no host can refuse it. A re-press bumps `presses`, which
// re-arms the schedule; the arming id discards a firing queued before it (v2 rule 12).
export const HoldToConfirm = (p: { hold: Duration.Input }) =>
  trait(
    {
      id: "HoldToConfirm",
      events: { Press: {}, Release: {} },
      internalEvents: { Held: {} },
      memory: { pressing: Schema.Boolean, presses: Schema.Int }, // FAKED: counter idiom
      initial: () => ({ pressing: false, presses: 0 }),
      guards: ["canPress"], // only Press may be refused
      callbacks: { onHeld: {} },
    },
    ({ E, guards, callbacks }) => ({
      schedules: {
        held: { schedule: p.hold, send: E.Held, restartOn: ({ memory }) => memory.presses },
      },
      on: {
        // One guard, not the proposal's guard array (principles review major 3: arrays are an
        // unledgered form). A second Press while pressing restarts the hold, which is harmless.
        Press: {
          target: "self",
          guard: guards.canPress,
          updateMemory: ({ memory }) => ({ pressing: true, presses: memory.presses + 1 }),
        },
        Release: { target: "self", updateMemory: () => ({ pressing: false }) },
        Held: [
          {
            target: "self",
            guard: ({ memory }) => memory.pressing || deny("Released"),
            updateMemory: () => ({ pressing: false }),
            notify: [callbacks.onHeld],
          },
          { target: "self" }, // an early release: the firing is consumed
        ],
      },
    }),
  );

// ── Confirm (subroutine): one state, two exits ─────────────────────────────────────────────
export const Confirm = subroutine(
  {
    id: "Confirm",
    events: { Yes: {}, No: {} },
    exits: { Confirmed: {}, Declined: {} },
  },
  ({ exits }) => ({
    on: { Yes: exits.Confirmed, No: exits.Declined },
  }),
);

// ── CommitWithRetry (subroutine): sends the request captured at entry; retries only on Busy
//    or notSent, never on unknown, interrupt or defect ──────────────────────────────────────
// The backoff doubles: `backoff`, 2 × `backoff`, 4 × `backoff`, …
export const CommitWithRetry = <Req extends Schema.Struct.Fields, Res extends Schema.Struct.Fields>(
  shape: { request: Req; result: Res },
  p: { maxRetries: number; backoff: Duration.Input },
) =>
  subroutine(
    {
      id: "CommitWithRetry",
      input: { request: Schema.Struct(shape.request) },
      states: ["SENDING", "BACKOFF"],
      internalEvents: {
        Sent: shape.result,
        Busy: { reason: Schema.String },
        Refused: { reason: Schema.String },
        NotSent: {}, // the fixed shape for notSent
        Unsure: { attempt: Attempt }, // the fixed shape for unknown, interrupt and defect
        Retry: {},
      },
      memory: {
        request: Schema.Struct(shape.request), // frozen for every retry
        attempts: Schema.Int, // retries so far
        lastBusy: Schema.NullOr(Schema.String),
      },
      initial: ({ input }) => ({ request: input.request, attempts: 0, lastBusy: null }),
      requests: {
        // Named `submit`, not the proposal's `send` (principles review major 6: `send` is a keyword).
        submit: {
          kind: "commit",
          input: shape.request,
          success: { Done: shape.result },
          failure: { Busy: { reason: Schema.String }, Rejected: { reason: Schema.String } },
        },
      },
      exits: {
        Done: shape.result,
        GaveUp: { reason: Schema.String, attempts: Schema.Int },
        Rejected: { reason: Schema.String },
        Uncertain: { attempt: Attempt },
      },
    },
    ({ S, E, requests, exits }) => ({
      default: S.SENDING,
      start: [requests.submit], // the first send rides the entering transition
      requests: {
        submit: {
          input: ({ memory }) => memory.request,
          outcomes: {
            Done: E.Sent.from((result) => result),
            Busy: E.Busy.from(({ reason }) => ({ reason })),
            Rejected: E.Refused.from(({ reason }) => ({ reason })),
            notSent: E.NotSent,
            unknown: E.Unsure,
            interrupt: E.Unsure,
            defect: E.Unsure, // a commit defect is uncertainty, never a retry
          },
        },
      },
      states: {
        SENDING: {
          on: {
            Sent: exits.Done.from(({ event }) => event),
            Refused: exits.Rejected.from(({ event }) => ({ reason: event.reason })),
            Unsure: exits.Uncertain.from(({ event }) => ({ attempt: event.attempt })),
            Busy: [
              {
                target: S.BACKOFF,
                guard: ({ memory }) => memory.attempts < p.maxRetries || deny("NoRetriesLeft"),
                updateMemory: ({ memory, event }) => ({
                  attempts: memory.attempts + 1,
                  lastBusy: event.reason,
                }),
              },
              exits.GaveUp.from(({ memory, event }) => ({
                reason: event.reason,
                attempts: memory.attempts,
              })),
            ],
            NotSent: [
              {
                target: S.BACKOFF,
                guard: ({ memory }) => memory.attempts < p.maxRetries || deny("NoRetriesLeft"),
                updateMemory: ({ memory }) => ({
                  attempts: memory.attempts + 1,
                  lastBusy: "An earlier request is still running",
                }),
              },
              exits.GaveUp.from(({ memory }) => ({
                reason: "An earlier request is still running",
                attempts: memory.attempts,
              })),
            ],
          },
        },
        BACKOFF: {
          schedules: {
            retry: {
              schedule: ({ memory }) => Duration.times(p.backoff, 2 ** (memory.attempts - 1)),
              send: E.Retry,
            },
          },
          on: { Retry: { target: S.SENDING, actions: [requests.submit] } },
        },
      },
    }),
  );
```

---

## App 1: Two-factor sign-in

**`TwoFactorStep` is single-use.** It exists for its lifetime, not for reuse: as a subroutine, its
memory, timers and calls end when the user goes back to the password, so "keeping nothing" and
"a late verify never reaches a newer attempt" hold by construction. v2 defers node memory, so a
subroutine is the only way to scope memory to a step.

**Shape.** The two-factor step is a subroutine, `TwoFactorStep`, on `TWO_FACTOR`. It holds the
challenge id, the wrong-attempt counter, the lockout and two requests (`verify` and `resend`).
"Back to password … keeping nothing" is a host transition that abandons the step, so all of that
memory goes by construction. The code field is a `Field` trait. The resend cooldown is a
`Cooldown` trait at the step's root, because it must outlive ENTERING ↔ LOCKED changes. The lockout
is a state (`LOCKED`) with its own schedule.

`TwoFactorStep` is app-specific, so `flow check` reports info 17 ("used by only one machine"). It is
a subroutine anyway because its memory must disappear on Back, and because its two commits need
fenced results.

```ts
// sign-in/two-factor.step.ts
import { Duration, Schema } from "effect";
import { Attempt, deny, subroutine } from "flow-state";
import { Cooldown, Field, isValid } from "../shared/fragments.js";

const MAX_WRONG = 3;
const LOCKOUT: Duration.Input = "5 minutes";
const COULDNT_CHECK = "Couldn't check the code, try again";

const sixDigits = (v: string) => (/^\d{6}$/.test(v) ? null : "Enter the 6-digit code");

export const TwoFactorStep = subroutine(
  {
    id: "TwoFactorStep",
    input: { challengeId: Schema.String },
    states: ["ENTERING", "VERIFYING", "LOCKED"],
    traits: {
      code: Field(Schema.String, { validate: sixDigits }),
      resendWait: Cooldown({ length: "30 seconds" }), // root of the step: lives through LOCKED
    },
    events: { Submit: {}, Resend: {} },
    internalEvents: {
      Accepted: {},
      Wrong: {},
      Expired: {},
      NotChecked: {}, // the fixed shape for notSent
      Unchecked: { attempt: Attempt }, // the fixed shape for unknown, interrupt and defect
      ResendSettled: {},
      ResendUnsure: { attempt: Attempt },
      Unlock: {},
    },
    memory: {
      challengeId: Schema.String,
      wrong: Schema.Int,
      error: Schema.NullOr(Schema.String),
      lockedUntil: Schema.NullOr(Schema.Number),
      // FAKED: a fragment cannot read whether its own call is outstanding, and a second call
      // rejects the whole turn (v2 rule 9). A hand-kept flag lets the Resend guard refuse first.
      resending: Schema.Boolean,
    },
    initial: ({ input }) => ({
      challengeId: input.challengeId,
      wrong: 0,
      error: null,
      lockedUntil: null,
      resending: false,
    }),
    requests: {
      verify: {
        kind: "commit",
        input: { challengeId: Schema.String, code: Schema.String },
        success: { Verified: {} },
        failure: { WrongCode: {}, Expired: {} },
      },
      resend: {
        kind: "commit",
        input: { challengeId: Schema.String },
        success: { Sent: {} },
        failure: {},
      },
    },
    exits: { SignedIn: {} },
  },
  ({ S, E, requests, exits }) => ({
    default: S.ENTERING,

    traits: {
      code: {
        input: () => ({ initialValue: "" }), // reads nothing: nested trait input is undefined in v2
        guards: {
          canEdit: ({ state }) =>
            state === "ENTERING" || deny(state === "LOCKED" ? "LockedOut" : "Checking"),
        },
        callbacks: { onChanged: { target: "self", updateMemory: () => ({ error: null }) } },
      },
      resendWait: {}, // Cooldown has no ports to fill
    },

    requests: {
      verify: {
        input: ({ memory }) => ({ challengeId: memory.challengeId, code: memory.code.value }),
        outcomes: {
          Verified: E.Accepted,
          WrongCode: E.Wrong,
          Expired: E.Expired,
          notSent: E.NotChecked,
          unknown: E.Unchecked,
          interrupt: E.Unchecked,
          defect: E.Unchecked,
        },
      },
      resend: {
        input: ({ memory }) => ({ challengeId: memory.challengeId }),
        outcomes: {
          Sent: E.ResendSettled,
          notSent: E.ResendSettled,
          unknown: E.ResendUnsure,
          interrupt: E.ResendUnsure,
          defect: E.ResendUnsure,
        },
      },
    },

    // At the step's root: Resend works while ENTERING and while LOCKED. The cooldown starts on
    // the click, so it also covers the time the request is in flight.
    on: {
      Resend: {
        target: "self",
        guard: ({ state, memory }) =>
          state === "VERIFYING"
            ? deny("Checking")
            : memory.resending
              ? deny("Sending")
              : memory.resendWait.until === null || deny("ResendCoolingDown"),
        updateMemory: () => ({ resending: true }),
        actions: [requests.resend],
        raise: [E.resendWait.Start],
      },
      ResendSettled: { target: "self", updateMemory: () => ({ resending: false }) },
      ResendUnsure: { target: "self", updateMemory: () => ({ resending: false }) },
    },

    states: {
      ENTERING: {
        on: {
          Submit: {
            target: S.VERIFYING,
            guard: ({ memory }) => isValid(memory.code) || deny("CodeIncomplete"),
            updateMemory: () => ({ error: null }),
            actions: [requests.verify],
          },
        },
      },
      VERIFYING: {
        on: {
          Accepted: exits.SignedIn,
          // Every result handler ends unguarded (terminal totality, rule 13); Set is unguarded too.
          Wrong: [
            {
              target: S.LOCKED,
              guard: ({ memory }) => memory.wrong + 1 >= MAX_WRONG || deny("TriesLeft"),
              updateMemory: ({ memory, now }) => ({
                wrong: memory.wrong + 1,
                error: null,
                // FAKED: the lockout deadline is copied into memory for the countdown, as
                // Cooldown does; the LOCKED schedule below holds the same duration.
                lockedUntil: now + Duration.toMillis(LOCKOUT),
              }),
              raise: [E.code.Set.from(() => ({ value: "" }))],
            },
            {
              target: S.ENTERING,
              updateMemory: ({ memory }) => ({
                wrong: memory.wrong + 1,
                error: `Wrong code, ${MAX_WRONG - memory.wrong - 1} tries left`,
              }),
              raise: [E.code.Set.from(() => ({ value: "" }))],
            },
          ],
          Expired: {
            target: S.ENTERING,
            updateMemory: () => ({ error: "Code expired, send a new one" }),
          },
          // Not counted as a wrong attempt.
          NotChecked: { target: S.ENTERING, updateMemory: () => ({ error: COULDNT_CHECK }) },
          Unchecked: { target: S.ENTERING, updateMemory: () => ({ error: COULDNT_CHECK }) },
        },
      },
      // Submit is unhandled here and the field's canEdit denies, so entry and Submit are refused.
      LOCKED: {
        schedules: { unlock: { schedule: LOCKOUT, send: E.Unlock } },
        on: {
          Unlock: { target: S.ENTERING, updateMemory: () => ({ wrong: 0, lockedUntil: null }) },
        },
      },
    },
  }),
);
```

```ts
// sign-in/sign-in.definition.ts
import { Schema } from "effect";
import { definition } from "flow-state";
import { AuthDomain } from "../shared/operations.js";
import { TwoFactorStep } from "./two-factor.step.js";

export const SignIn = definition({
  id: "Auth/SignIn",
  states: ["PASSWORD", { TWO_FACTOR: TwoFactorStep }, "SIGNED_IN"],
  events: {
    PasswordAccepted: { challengeId: Schema.String }, // the password step is a stub
    BackToPassword: {},
  },
  operations: { Auth: AuthDomain },
});
```

```ts
// sign-in/sign-in.machine.ts
import { machine } from "flow-state";
import { SignIn } from "./sign-in.definition.js";

export const SignInMachine = machine(SignIn, ({ S, O }) => ({
  default: S.PASSWORD,
  states: {
    PASSWORD: { on: { PasswordAccepted: S.TWO_FACTOR } },
    TWO_FACTOR: {
      // The only edge in is PasswordAccepted, so `event` is that event.
      input: ({ event }) => ({ challengeId: event.challengeId }),
      requests: {
        verify: {
          operation: ({ results }) =>
            O.Auth.verifyCode.commit(({ payload }) => payload, {
              outcomes: {
                success: results.Verified,
                failure: { WrongCode: results.WrongCode, Expired: results.Expired },
              },
            }),
          // `{}` accepts losing a late result after Back: apps.md says Back keeps nothing, so a
          // verify that settles after Back is dropped, and the user enters a new code.
          abandoned: {},
        },
        resend: {
          operation: ({ results }) =>
            O.Auth.resendCode.commit(({ payload }) => payload, {
              outcomes: { success: results.Sent },
            }),
          abandoned: {}, // likewise: a resend that settles after Back changes nothing here
        },
      },
      exits: { SignedIn: S.SIGNED_IN },
      on: { BackToPassword: S.PASSWORD }, // from anywhere in the step: abandons it
    },
    SIGNED_IN: {},
  },
}));
```

```tsx
// sign-in/SignInScreen.tsx
import type { ReactNode } from "react";
import { check } from "flow-state";
import { useActor, useNow, useView } from "flow-state/react";
import { secondsLeft, visibleError } from "../shared/fragments.js";
import { SignIn } from "./sign-in.definition.js";
import { SignInMachine } from "./sign-in.machine.js";

const { S, E } = SignIn;

function useSignIn() {
  return useActor(SignInMachine);
}

type SignInActor = ReturnType<typeof useSignIn>;

export function SignInScreen() {
  const signIn = useSignIn();
  const top = useView(signIn, (s) => S.root.child(s));

  const body = {
    PASSWORD: <PasswordStub signIn={signIn} />,
    TWO_FACTOR: <TwoFactor signIn={signIn} />,
    SIGNED_IN: <p role="status">You're signed in.</p>,
  } satisfies Record<typeof top, ReactNode>;

  return <section aria-label="Sign in">{body[top]}</section>;
}

function PasswordStub({ signIn }: { signIn: SignInActor }) {
  // The stub: a real password form would send this from its own commit's success.
  return (
    <button onClick={() => signIn.send(E.PasswordAccepted({ challengeId: "challenge-1" }))}>
      Continue
    </button>
  );
}

function TwoFactor({ signIn }: { signIn: SignInActor }) {
  const step = useView(signIn, (s) => S.TWO_FACTOR.child(s));
  const code = useView(signIn, (s) => s.memory.TWO_FACTOR?.code.value ?? "");
  const codeError = useView(signIn, (s) =>
    s.memory.TWO_FACTOR ? visibleError(s.memory.TWO_FACTOR.code) : null,
  );
  const error = useView(signIn, (s) => s.memory.TWO_FACTOR?.error ?? null);
  const lockedUntil = useView(signIn, (s) => s.memory.TWO_FACTOR?.lockedUntil ?? null);
  const resendUntil = useView(signIn, (s) => s.memory.TWO_FACTOR?.resendWait.until ?? null);

  const canEdit = useView(
    signIn,
    (s) => check(s, E.TWO_FACTOR.code.Changed({ value: "" }))._tag === "Allowed",
  );
  const canSubmit = useView(signIn, (s) => check(s, E.TWO_FACTOR.Submit())._tag === "Allowed");
  const canResend = useView(signIn, (s) => check(s, E.TWO_FACTOR.Resend())._tag === "Allowed");

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        signIn.send(E.TWO_FACTOR.Submit());
      }}
    >
      <label>
        Code
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          disabled={!canEdit}
          onChange={(event) => signIn.send(E.TWO_FACTOR.code.Changed({ value: event.target.value }))}
        />
      </label>
      {codeError && <p className="hint">{codeError}</p>}
      {error && <p role="alert">{error}</p>}
      {step === "LOCKED" && lockedUntil !== null && (
        <p role="status">
          Too many wrong codes. Try again in <SecondsLeft until={lockedUntil} /> seconds.
        </p>
      )}
      <button disabled={!canSubmit}>{step === "VERIFYING" ? "Checking…" : "Submit"}</button>
      <button
        type="button"
        disabled={!canResend}
        onClick={() => signIn.send(E.TWO_FACTOR.Resend())}
      >
        Resend code
        {resendUntil !== null && (
          <>
            {" "}
            (<SecondsLeft until={resendUntil} />)
          </>
        )}
      </button>
      <button type="button" onClick={() => signIn.send(E.BackToPassword())}>
        Back to password
      </button>
    </form>
  );
}

// Only mounted while counting, so only it re-renders every second.
function SecondsLeft({ until }: { until: number }) {
  const now = useNow("1 second");
  return <>{secondsLeft(until, now)}</>;
}
```

```ts
// sign-in/sign-in.story.ts
import { expect, test } from "vite-plus/test";
import { check } from "flow-state";
import { story } from "flow-state/testing";
import { AuthFixture } from "../testing/fixtures.js"; // accepts "123456" for every challenge
import { SignIn } from "./sign-in.definition.js";
import { SignInMachine } from "./sign-in.machine.js";

const { S, E } = SignIn;

const enter = (value: string) => E.TWO_FACTOR.code.Changed({ value });

export const lockedOut = story
  .machine(SignInMachine, { id: "SignIn/locked-out", fixtures: [AuthFixture.accepts("123456")] })
  .send(E.PasswordAccepted({ challengeId: "c-1" }))
  .process()
  .send(enter("12345"))
  .process()
  .checkpoint("five-digits")
  .send(enter("111111"))
  .send(E.TWO_FACTOR.Submit())
  .process()
  .checkpoint("first-wrong")
  .send(enter("222222"))
  .send(E.TWO_FACTOR.Submit())
  .process()
  .send(enter("333333"))
  .send(E.TWO_FACTOR.Submit())
  .process()
  .checkpoint("locked")
  .send(E.TWO_FACTOR.Resend()) // allowed while locked out
  .process()
  .checkpoint("resent")
  .advance("30 seconds")
  .process()
  .checkpoint("resend-ready")
  .advance("270 seconds") // five minutes after the lockout began
  .process()
  .checkpoint("unlocked")
  .send(enter("123456"))
  .send(E.TWO_FACTOR.Submit())
  .process()
  .checkpoint("signed-in");

test("three wrong codes lock the step for five minutes; resend has its own cooldown", async () => {
  const run = await lockedOut.run();
  const at = (name: keyof typeof run.checkpoints) => run.checkpoints[name].snapshot;

  expect(check(at("five-digits"), E.TWO_FACTOR.Submit())).toMatchObject({
    _tag: "Denied",
    reasons: [{ code: "CodeIncomplete" }],
  });
  expect(at("five-digits").memory.TWO_FACTOR?.code.edited).toBe(true);

  const firstWrong = at("first-wrong").memory.TWO_FACTOR;
  expect(firstWrong?.error).toBe("Wrong code, 2 tries left");
  expect(firstWrong?.code.value).toBe(""); // cleared by the raised Set

  const locked = at("locked");
  expect(S.TWO_FACTOR.LOCKED.is(locked)).toBe(true);
  expect(check(locked, E.TWO_FACTOR.Submit())._tag).toBe("Unhandled");
  expect(check(locked, enter("1"))).toMatchObject({
    _tag: "Denied",
    reasons: [{ code: "LockedOut" }],
  });

  expect(check(at("resent"), E.TWO_FACTOR.Resend())).toMatchObject({
    _tag: "Denied",
    reasons: [{ code: "ResendCoolingDown" }],
  });
  expect(check(at("resend-ready"), E.TWO_FACTOR.Resend())._tag).toBe("Allowed");
  expect(S.TWO_FACTOR.LOCKED.is(at("resend-ready"))).toBe(true);

  expect(S.TWO_FACTOR.ENTERING.is(at("unlocked"))).toBe(true);
  expect(at("unlocked").memory.TWO_FACTOR?.wrong).toBe(0);

  expect(S.SIGNED_IN.is(at("signed-in"))).toBe(true);
  expect(at("signed-in").memory.TWO_FACTOR).toBeUndefined(); // the step's memory is gone
});
```

### Metrics: two-factor sign-in

| Part | Non-blank | Non-blank, non-comment |
| --- | --- | --- |
| Fragments used (shared file, counted once under the summary) | `Field`, `Cooldown` | |
| App fragment `TwoFactorStep` | 171 | 161 |
| Definition | 14 | 13 |
| Machine | 37 | 33 |
| Components | 95 | 92 |
| Story | 69 | 68 |

**New keywords used:** `subroutine`, `traits`, `hostEvents` (through `Field`, `Cooldown`),
`guards`, `callbacks`, `requests`, `kind`, `operation`, `results`, `notSent`, `abandoned`, `exits`,
`raise`, `payload`. That is 14 of the 19.

**Duplicated logic:**

- The "deadline in memory" pattern (`until = now + length`, next to a schedule of the same length)
  appears twice: in `Cooldown` and in `LOCKED`. It is copied because a raise cannot arm a trait
  that the same transition enters (v2 rule 11).
- The `resending` flag is the same "outstanding call" bookkeeping the issue list does for pins.

---

## App 2: Signup wizard

**Shape.** All five inputs are root `Field` traits. A trait lives with the actor, so drafts survive
Back, Next and the discard dialog with no copying. The pages are plain states under `FILLING`. The
discard dialog is the `Confirm` subroutine on `DISCARD`. Submission is `CommitWithRetry` on
`SUBMITTING`, with `maxRetries: 3` and a 1-second backoff, which gives the required 1 s, 2 s and
4 s. Its exits map directly onto the four required endings.

Two things don't fit a fragment:

- **The invite list.** Its length varies from 0 to 5, and fragment instances are static.
- **"Keep" returning to the same page.** There is no history state.

```ts
// signup/signup.definition.ts
import { Schema } from "effect";
import { Attempt, definition } from "flow-state";
import { CommitWithRetry, Confirm, Field, isEmail } from "../shared/fragments.js";
import { AccountsDomain } from "../shared/operations.js";

export const Role = Schema.Literal("engineer", "designer", "manager");

export const Page = Schema.Literal("ACCOUNT", "PROFILE", "INVITE", "REVIEW");

export const MAX_INVITES = 5;

export const CreateAccount = CommitWithRetry(
  {
    request: {
      email: Schema.String,
      password: Schema.String,
      name: Schema.String,
      role: Role,
      invites: Schema.Array(Schema.String),
    },
    result: {},
  },
  { maxRetries: 3, backoff: "1 second" }, // retries after 1 s, 2 s and 4 s
);

export const Signup = definition({
  id: "Auth/Signup",
  states: [
    { FILLING: ["ACCOUNT", "PROFILE", "INVITE", "REVIEW"] },
    { DISCARD: Confirm },
    { SUBMITTING: CreateAccount },
    "DONE",
    "CANCELLED",
    "UNSURE",
  ],
  // Root traits: alive for the actor's whole life, so every page keeps its drafts.
  traits: {
    email: Field(Schema.String, {
      validate: (v) => (isEmail(v) ? null : "Enter an email address"),
    }),
    password: Field(Schema.String, {
      validate: (v) => (v.length >= 12 ? null : "Use at least 12 characters"),
    }),
    name: Field(Schema.String, { validate: (v) => (v.trim() ? null : "Enter your name") }),
    role: Field(Schema.NullOr(Role), { validate: (v) => (v === null ? "Pick a role" : null) }),
  },
  events: {
    Next: {},
    Back: {},
    Cancel: {},
    Submit: {},
    InviteAdded: {},
    InviteRemoved: { index: Schema.Int },
    InviteChanged: { index: Schema.Int, value: Schema.String },
  },
  memory: {
    // FAKED: a list of 0–5 fields cannot be Field traits (instances are fixed at construction),
    // so the invites are host memory. Their per-entry validation is hand-rolled in the machine
    // and the view, and they have no `edited` flag.
    invites: Schema.Array(Schema.String),
    // FAKED: no history state. "Keep" must return to the page Cancel came from, so the page is
    // recorded on the way into DISCARD and the Declined exit branches on it.
    returnTo: Page,
    accountError: Schema.NullOr(Schema.String),
    reviewError: Schema.NullOr(Schema.String),
    unsure: Schema.NullOr(Attempt),
  },
  initial: () => ({
    invites: [],
    returnTo: "ACCOUNT",
    accountError: null,
    reviewError: null,
    unsure: null,
  }),
  operations: { Accounts: AccountsDomain },
});
```

```ts
// signup/signup.machine.ts
import { deny, machine } from "flow-state";
import { isEmail, isValid } from "../shared/fragments.js";
import { MAX_INVITES, Page, Signup } from "./signup.definition.js";

export const inviteError = (v: string) =>
  v === "" || isEmail(v) ? null : "Enter an email address"; // FAKED: Field's job, done by hand

const onPage = (page: typeof Page.Type) => ({ state }: { state: string }) =>
  state === `FILLING.${page}` || deny("OtherPage");

export const SignupMachine = machine(Signup, ({ S, E, O }) => ({
  default: S.FILLING,

  traits: {
    email: {
      input: () => ({ initialValue: "" }),
      guards: { canEdit: onPage("ACCOUNT") },
      // A new email clears "That email is registered".
      callbacks: { onChanged: { target: "self", updateMemory: () => ({ accountError: null }) } },
    },
    password: {
      input: () => ({ initialValue: "" }),
      guards: { canEdit: onPage("ACCOUNT") },
      callbacks: { onChanged: {} },
    },
    name: {
      input: () => ({ initialValue: "" }),
      guards: { canEdit: onPage("PROFILE") },
      callbacks: { onChanged: {} },
    },
    role: {
      input: () => ({ initialValue: null }),
      guards: { canEdit: onPage("PROFILE") },
      callbacks: { onChanged: {} },
    },
  },

  states: {
    FILLING: {
      default: S.FILLING.ACCOUNT,
      on: {
        // Cancel from any page; SUBMITTING is not under FILLING, so Cancel is refused there.
        Cancel: {
          target: S.DISCARD,
          updateMemory: ({ state }) => ({
            returnTo: state.slice("FILLING.".length) as typeof Page.Type, // FAKED: history
          }),
        },
      },
      states: {
        ACCOUNT: {
          on: {
            Next: {
              target: S.FILLING.PROFILE,
              guard: ({ memory }) =>
                (isValid(memory.email) && isValid(memory.password)) || deny("AccountIncomplete"),
            },
          },
        },
        PROFILE: {
          on: {
            Next: {
              target: S.FILLING.INVITE,
              guard: ({ memory }) =>
                (isValid(memory.name) && isValid(memory.role)) || deny("ProfileIncomplete"),
            },
            Back: S.FILLING.ACCOUNT,
          },
        },
        INVITE: {
          on: {
            InviteAdded: {
              target: "self",
              guard: ({ memory }) => memory.invites.length < MAX_INVITES || deny("TooManyInvites"),
              updateMemory: ({ memory }) => ({ invites: [...memory.invites, ""] }),
            },
            InviteRemoved: {
              target: "self",
              guard: ({ memory, event }) => event.index < memory.invites.length || deny("NoSuchInvite"),
              updateMemory: ({ memory, event }) => ({
                invites: memory.invites.filter((_, i) => i !== event.index),
              }),
            },
            InviteChanged: {
              target: "self",
              guard: ({ memory, event }) => event.index < memory.invites.length || deny("NoSuchInvite"),
              updateMemory: ({ memory, event }) => ({
                invites: memory.invites.map((v, i) => (i === event.index ? event.value : v)),
              }),
            },
            Next: {
              target: S.FILLING.REVIEW,
              guard: ({ memory }) =>
                memory.invites.every((v) => inviteError(v) === null) || deny("InvalidInvite"),
              updateMemory: ({ memory }) => ({ invites: memory.invites.filter((v) => v !== "") }),
            },
            Back: S.FILLING.PROFILE,
          },
        },
        REVIEW: {
          on: {
            Submit: { target: S.SUBMITTING, updateMemory: () => ({ reviewError: null }) },
            Back: S.FILLING.INVITE,
          },
        },
      },
    },

    DISCARD: {
      exits: {
        Confirmed: S.CANCELLED,
        // FAKED: four alternatives stand in for a history state. Fields are traits, so the
        // drafts themselves need nothing.
        Declined: [
          {
            target: S.FILLING.ACCOUNT,
            guard: ({ memory }) => memory.returnTo === "ACCOUNT" || deny("NotFromHere"),
          },
          {
            target: S.FILLING.PROFILE,
            guard: ({ memory }) => memory.returnTo === "PROFILE" || deny("NotFromHere"),
          },
          {
            target: S.FILLING.INVITE,
            guard: ({ memory }) => memory.returnTo === "INVITE" || deny("NotFromHere"),
          },
          { target: S.FILLING.REVIEW },
        ],
      },
    },

    SUBMITTING: {
      // Read after Submit's update: the request every retry resends. PROFILE's Next guard
      // guarantees the role, but the type still says `Role | null`.
      input: ({ memory }) => ({
        request: {
          email: memory.email.value,
          password: memory.password.value,
          name: memory.name.value.trim(),
          role: memory.role.value!,
          invites: memory.invites,
        },
      }),
      requests: {
        submit: {
          operation: ({ results }) =>
            O.Accounts.create.commit(({ payload }) => payload, {
              outcomes: {
                success: results.Done,
                failure: {
                  EmailTaken: results.Rejected.from(() => ({ reason: "That email is registered" })),
                  Busy: results.Busy.from(() => ({ reason: "Server busy" })),
                },
              },
            }),
          abandoned: {}, // nothing leaves SUBMITTING but its exits: Cancel is refused there
        },
      },
      exits: {
        Done: S.DONE,
        // Rejected only ever means EmailTaken here; a second rejection tag with a different
        // destination would have to branch on the reason string.
        Rejected: {
          target: S.FILLING.ACCOUNT,
          updateMemory: ({ payload }) => ({ accountError: payload.reason }),
        },
        GaveUp: { target: S.FILLING.REVIEW, updateMemory: () => ({ reviewError: "Try again later" }) },
        Uncertain: { target: S.UNSURE, updateMemory: ({ payload }) => ({ unsure: payload.attempt }) },
      },
    },

    DONE: {},
    CANCELLED: {},
    UNSURE: {}, // never retried automatically; the user checks their email
  },
}));
```

```tsx
// signup/SignupWizard.tsx
import type { ReactNode } from "react";
import { Schema } from "effect";
import { check } from "flow-state";
import { useActor, useView } from "flow-state/react";
import { visibleError } from "../shared/fragments.js";
import { MAX_INVITES, Role, Signup } from "./signup.definition.js";
import { SignupMachine, inviteError } from "./signup.machine.js";

const { S, E } = Signup;

function useSignup() {
  return useActor(SignupMachine);
}

type SignupActor = ReturnType<typeof useSignup>;

const allowed = (verdict: { _tag: string }) => verdict._tag === "Allowed";

export function SignupWizard() {
  const signup = useSignup();
  const top = useView(signup, (s) => S.root.child(s));

  const body = {
    FILLING: <Pages signup={signup} />,
    DISCARD: <DiscardDialog signup={signup} />,
    SUBMITTING: <Submitting signup={signup} />,
    DONE: <p role="status">Your account is ready.</p>,
    CANCELLED: <p role="status">Signup discarded.</p>,
    UNSURE: <p role="status">Your account may have been created; check your email.</p>,
  } satisfies Record<typeof top, ReactNode>;

  return <section aria-label="Sign up">{body[top]}</section>;
}

function Pages({ signup }: { signup: SignupActor }) {
  const page = useView(signup, (s) => S.FILLING.child(s));
  if (page === undefined) return null;

  const body = {
    ACCOUNT: (
      <>
        <TextField signup={signup} field="email" label="Email" type="email" />
        <TextField signup={signup} field="password" label="Password" type="password" />
        <AccountError signup={signup} />
      </>
    ),
    PROFILE: (
      <>
        <TextField signup={signup} field="name" label="Name" type="text" />
        <RoleField signup={signup} />
      </>
    ),
    INVITE: <Invites signup={signup} />,
    REVIEW: <Review signup={signup} />,
  } satisfies Record<typeof page, ReactNode>;

  return (
    <>
      {body[page]}
      <Nav signup={signup} page={page} />
    </>
  );
}

function TextField({
  signup,
  field,
  label,
  type,
}: {
  signup: SignupActor;
  field: "email" | "password" | "name";
  label: string;
  type: "email" | "password" | "text";
}) {
  const value = useView(signup, (s) => s.memory[field].value);
  const error = useView(signup, (s) => visibleError(s.memory[field]));
  return (
    <label>
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => signup.send(E[field].Changed({ value: event.target.value }))}
      />
      {error && <span className="hint">{error}</span>}
    </label>
  );
}

function RoleField({ signup }: { signup: SignupActor }) {
  const role = useView(signup, (s) => s.memory.role.value);
  const error = useView(signup, (s) => visibleError(s.memory.role));
  return (
    <label>
      Role
      <select
        value={role ?? ""}
        onChange={(event) => {
          const value = event.target.value;
          signup.send(E.role.Changed({ value: Schema.is(Role)(value) ? value : null }));
        }}
      >
        <option value="">Choose…</option>
        <option value="engineer">Engineer</option>
        <option value="designer">Designer</option>
        <option value="manager">Manager</option>
      </select>
      {error && <span className="hint">{error}</span>}
    </label>
  );
}

function AccountError({ signup }: { signup: SignupActor }) {
  const error = useView(signup, (s) => s.memory.accountError);
  return error ? <p role="alert">{error}</p> : null;
}

function Invites({ signup }: { signup: SignupActor }) {
  const invites = useView(signup, (s) => s.memory.invites);
  const canAdd = useView(signup, (s) => allowed(check(s, E.InviteAdded())));
  return (
    <fieldset>
      <legend>Invite teammates (up to {MAX_INVITES})</legend>
      {invites.map((value, index) => (
        <div key={index}>
          <input
            type="email"
            value={value}
            onChange={(event) =>
              signup.send(E.InviteChanged({ index, value: event.target.value }))
            }
          />
          {/* FAKED: shown at once, not after a first edit; invites have no Field `edited` */}
          {inviteError(value) && <span className="hint">{inviteError(value)}</span>}
          <button type="button" onClick={() => signup.send(E.InviteRemoved({ index }))}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" disabled={!canAdd} onClick={() => signup.send(E.InviteAdded())}>
        Add teammate
      </button>
    </fieldset>
  );
}

function Review({ signup }: { signup: SignupActor }) {
  const summary = useView(signup, (s) => ({
    email: s.memory.email.value,
    name: s.memory.name.value,
    role: s.memory.role.value,
    invites: s.memory.invites,
  }));
  const error = useView(signup, (s) => s.memory.reviewError);
  return (
    <>
      <dl>
        <dt>Email</dt>
        <dd>{summary.email}</dd>
        <dt>Name</dt>
        <dd>{summary.name}</dd>
        <dt>Role</dt>
        <dd>{summary.role}</dd>
        <dt>Invites</dt>
        <dd>{summary.invites.length ? summary.invites.join(", ") : "None"}</dd>
      </dl>
      {error && <p role="alert">{error}</p>}
      <button onClick={() => signup.send(E.Submit())}>Create account</button>
    </>
  );
}

function Nav({ signup, page }: { signup: SignupActor; page: string }) {
  const canBack = useView(signup, (s) => allowed(check(s, E.Back())));
  const canNext = useView(signup, (s) => allowed(check(s, E.Next())));
  return (
    <footer>
      <button type="button" onClick={() => signup.send(E.Cancel())}>
        Cancel
      </button>
      {canBack && <button onClick={() => signup.send(E.Back())}>Back</button>}
      {page !== "REVIEW" && (
        <button disabled={!canNext} onClick={() => signup.send(E.Next())}>
          Next
        </button>
      )}
    </footer>
  );
}

function DiscardDialog({ signup }: { signup: SignupActor }) {
  return (
    <dialog open>
      <p>Discard your signup?</p>
      <button onClick={() => signup.send(E.DISCARD.Yes())}>Discard</button>
      <button onClick={() => signup.send(E.DISCARD.No())}>Keep</button>
    </dialog>
  );
}

function Submitting({ signup }: { signup: SignupActor }) {
  const retries = useView(signup, (s) => s.memory.SUBMITTING?.attempts ?? 0);
  return (
    <p role="status">
      {retries > 0 ? `Server busy, retrying (${retries}/3)` : "Creating your account…"}
    </p>
  );
}
```

```ts
// signup/signup.story.ts
import { expect, test } from "vite-plus/test";
import { check } from "flow-state";
import { story } from "flow-state/testing";
import { AccountsFixture } from "../testing/fixtures.js"; // answers Busy n times, then creates
import { Signup } from "./signup.definition.js";
import { SignupMachine } from "./signup.machine.js";

const { S, E } = Signup;

export const busyThenCreated = story
  .machine(SignupMachine, {
    id: "Signup/busy-then-created",
    fixtures: [AccountsFixture.busyTimes(2)],
  })
  .send(E.email.Changed({ value: "ada@example.com" }))
  .send(E.password.Changed({ value: "correct horse battery" }))
  .send(E.Next())
  .send(E.name.Changed({ value: "Ada" }))
  .send(E.role.Changed({ value: "engineer" }))
  .send(E.Next())
  .send(E.InviteAdded())
  .send(E.InviteAdded())
  .send(E.InviteChanged({ index: 0, value: "grace@example.com" }))
  .send(E.Back()) // drafts survive Back and Next
  .send(E.Next())
  .send(E.Next())
  .process()
  .checkpoint("review")
  .send(E.Cancel())
  .process()
  .checkpoint("asking")
  .send(E.DISCARD.No())
  .process()
  .checkpoint("kept")
  .send(E.Submit())
  .process()
  .checkpoint("first-busy")
  .advance("1 second")
  .process()
  .checkpoint("second-busy")
  .advance("2 seconds")
  .process()
  .checkpoint("created");

test("drafts survive navigation and the discard dialog; Busy retries, then succeeds", async () => {
  const run = await busyThenCreated.run();
  const at = (name: keyof typeof run.checkpoints) => run.checkpoints[name].snapshot;

  const review = at("review");
  expect(S.FILLING.REVIEW.is(review)).toBe(true);
  expect(review.memory.invites).toEqual(["grace@example.com"]); // the empty entry was dropped
  expect(review.memory.name.value).toBe("Ada");

  expect(S.DISCARD.is(at("asking"))).toBe(true);
  expect(S.FILLING.REVIEW.is(at("kept"))).toBe(true);
  expect(at("kept").memory.email.value).toBe("ada@example.com");

  const busy = at("first-busy");
  expect(S.SUBMITTING.BACKOFF.is(busy)).toBe(true);
  expect(busy.memory.SUBMITTING?.attempts).toBe(1);
  expect(check(busy, E.Cancel())._tag).toBe("Unhandled"); // Cancel is refused while submitting

  expect(at("second-busy").memory.SUBMITTING?.attempts).toBe(2);
  expect(S.DONE.is(at("created"))).toBe(true);
});
```

### Metrics: signup wizard

| Part | Non-blank | Non-blank, non-comment |
| --- | --- | --- |
| Fragments used (shared file) | `Field` ×4, `Confirm`, `CommitWithRetry` | |
| Definition | 72 | 65 |
| Machine | 169 | 160 |
| Components | 192 | 190 |
| Story | 59 | 58 |

**New keywords used:** `traits`, `hostEvents` (through `Field`), `guards`, `callbacks`,
`requests`, `operation`, `results`, `abandoned`, `exits`, `payload`, plus `start` and `notSent`
inside `CommitWithRetry`. That is 12 of the 19.

**Duplicated logic:**

- Email validation is shared (`isEmail`), but the invite list re-implements Field's per-entry
  error, without `edited`.
- `onPage(...)` is filled four times. A per-page group of fields cannot be one fragment, because
  a subroutine would drop the drafts on Back.
- The four `Declined` alternatives are a hand-built history state.

---

## App 3: Issue list screen

**Shape.** One plain state, `BROWSING`, plus `DELETING` (a `CommitWithRetry` with `maxRetries: 0`,
reused only for its fenced, exhaustive outcome handling). Three root traits:

- `Debounce` for search;
- `HoldToConfirm` for bulk delete;
- `Flash` for the messages.

The list read is an ordinary host activity, and the 30-second refresh is an ordinary host schedule.
Pins are plain host commits, because rows are dynamic and a fragment request allows one outstanding
call per activation.

```ts
// issues/issue.types.ts
import { Schema } from "effect";

export const Issue = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  status: Schema.Literal("open", "closed"),
  pinned: Schema.Boolean,
});

export const IssueSort = Schema.Struct({
  field: Schema.Literal("updated", "title"),
  dir: Schema.Literal("asc", "desc"),
});

export const IssueFilter = Schema.Literal("open", "closed", "all");

export const PAGE_SIZE = 20;
```

```ts
// issues/issue-list.definition.ts
import { Schema } from "effect";
import { definition } from "flow-state";
import { CommitWithRetry, Debounce, Flash, HoldToConfirm } from "../shared/fragments.js";
import { IssuesDomain } from "../shared/operations.js";
import { IssueFilter, IssueSort } from "./issue.types.js";

// Why maxRetries: 0 rather than a plain host commit: apps.md asks for no retries, but this is
// the only way in v2 to get a delete's result fenced by call id, `unknown`/`interrupt`/`defect`
// typed as uncertainty, and every ending forced by exhaustive exits. A plain host commit would
// be ~10 lines shorter and lose those. v2 has no single-shot commit fragment, and writing one for
// a single use would be extraction before the second use.
export const DeleteIssues = CommitWithRetry(
  { request: { ids: Schema.Array(Schema.String) }, result: {} },
  { maxRetries: 0, backoff: "1 second" }, // FAKED: a retry subroutine used as a single-shot commit
);

export const IssueList = definition({
  id: "Issues/IssueList",
  states: ["BROWSING", { DELETING: DeleteIssues }],
  traits: {
    searchSettle: Debounce({ wait: "300 millis" }),
    hold: HoldToConfirm({ hold: "1.5 seconds" }),
    flash: Flash({ length: "3 seconds" }),
  },
  events: {
    SearchTyped: { text: Schema.String },
    SortChanged: { sort: IssueSort },
    StatusChanged: { status: IssueFilter },
    NextPage: {},
    PreviousPage: {},
    RowToggled: { id: Schema.String },
    PageToggled: {},
    PinClicked: { id: Schema.String },
  },
  internalEvents: {
    RefreshDue: {},
    Pinned: { id: Schema.String },
    PinFailed: { id: Schema.String },
    PinUnsure: { id: Schema.String },
    PinsLost: {},
  },
  memory: {
    searchText: Schema.String, // what the box shows
    search: Schema.String, // what the query uses, 300 ms later
    sort: IssueSort,
    status: IssueFilter,
    page: Schema.Int,
    selected: Schema.Array(Schema.String),
    // FAKED: pins in flight, by row. Rows are dynamic and fragment instances are static, so a
    // per-row pin cannot be a trait with its own request; the host keeps the set by hand.
    pinning: Schema.Array(Schema.Struct({ id: Schema.String, title: Schema.String })),
  },
  initial: () => ({
    searchText: "",
    search: "",
    sort: { field: "updated", dir: "desc" },
    status: "open",
    page: 1,
    selected: [],
    pinning: [],
  }),
  operations: { Issues: IssuesDomain },
});
```

```ts
// issues/issue-list.machine.ts
import { Schedule } from "effect";
import { deny, machine } from "flow-state";
import { IssueList } from "./issue-list.definition.js";
import { PAGE_SIZE } from "./issue.types.js";

type Memory = typeof IssueList.Memory.Type;

type Row = { id: string; title: string; pinned: boolean };

// Activities are declared by the machine, so a shared helper types the lane by hand.
type Lanes = { list?: { data?: { items: ReadonlyArray<Row>; total: number } } };

export const listQuery = ({ memory }: { memory: Memory }) => ({
  search: memory.search,
  sort: memory.sort,
  status: memory.status,
  page: memory.page,
});

const rowsOf = (activities: Lanes) => activities.list?.data?.items ?? [];

const rowOf = (activities: Lanes, id: string) => rowsOf(activities).find((row) => row.id === id);

// Every query change resets the selection; a filter change also goes back to page 1.
const requery = (patch: Partial<Memory>): Partial<Memory> => ({ ...patch, selected: [] });

const titleOf = (memory: Memory, id: string) =>
  memory.pinning.find((pin) => pin.id === id)?.title ?? "the issue";

const unpin = (memory: Memory, id: string) => ({
  pinning: memory.pinning.filter((pin) => pin.id !== id),
});

export const IssueListMachine = machine(IssueList, ({ S, E, O }) => {
  const refetchList = O.Issues.list.refetch(listQuery);

  // One commit per row. setPinned is keyed by id with "reject", so rows are independent.
  // `optimistic` applies on start (Operations O3); failure, interrupt and defect remove it.
  const setPinned = O.Issues.setPinned.commit(
    ({ event, activities }) => ({ id: event.id, pinned: !rowOf(activities, event.id)!.pinned }),
    {
      optimistic: [
        O.Issues.list.setData(({ memory, event }) => ({
          key: listQuery({ memory }),
          data: (page) => ({
            ...page,
            items: page.items.map((row) =>
              row.id === event.id ? { ...row, pinned: !row.pinned } : row,
            ),
          }),
        })),
      ],
      outcomes: {
        success: E.Pinned.from((issue) => ({ id: issue.id })),
        failure: { PinRejected: E.PinFailed.from(({ id }) => ({ id })) }, // FAKED: id on the error
        // FAKED: the Attempt's key is the only route back to the row; its type is the
        // descriptor's key record, read here without the guarantee that the key is { id }.
        unknown: E.PinUnsure.from((attempt) => ({ id: String(attempt.key.id) })),
        // FAKED: cannot fix in this system — interrupt and defect carry no row id (mappers see
        // values only, Operations O2/O6), and a guard cannot read which setPinned keys are still
        // outstanding. PinsLost must choose: forget every in-flight pin, or keep them all. Keeping
        // them would leave the lost row refused for the screen's life. Forgetting them (below)
        // means a still-running row can be clicked again, and setPinned ("reject" per key)
        // declines that click silently until its first commit settles. The system would need the
        // Attempt or admitted input passed to every outcome mapper, or a readable per-key
        // outstanding-commit fact for guards.
        interrupt: E.PinsLost,
        defect: E.PinsLost,
      },
    },
  );

  return {
    default: S.BROWSING,

    activities: {
      list: O.Issues.list.subscribe(listQuery, {
        placeholder: ({ previous }) => previous?.data, // keep rows on screen while the query changes
      }),
    },

    schedules: {
      refresh: { schedule: Schedule.spaced("30 seconds"), send: E.RefreshDue },
    },

    traits: {
      searchSettle: {
        callbacks: {
          onSettled: [
            {
              target: "self",
              guard: ({ memory }) => memory.searchText !== memory.search || deny("Unchanged"),
              updateMemory: ({ memory }) => requery({ search: memory.searchText, page: 1 }),
            },
            { target: "self" },
          ],
        },
      },
      hold: {
        guards: {
          canPress: ({ state, memory }) =>
            state !== "BROWSING"
              ? deny("Deleting")
              : memory.selected.length > 0 || deny("NothingSelected"),
        },
        callbacks: {
          // RELIES ON REVIEW FIX (v2 rule 3). This callback enters DELETING; its payload ({}) counts as the
          // step input's `event` (correctness review M2). The input below reads only memory.
          onHeld: [
            {
              target: S.DELETING,
              guard: ({ state, memory }) =>
                (state === "BROWSING" && memory.selected.length > 0) || deny("NothingSelected"),
            },
            { target: "self" }, // the selection emptied during the hold: nothing to delete
          ],
        },
      },
      flash: {},
    },

    // RELIES ON REVIEW FIX (v2 rule 8). All of these are "self" handlers at the root, above DELETING. Rule 8
    // as written ("handled at or above … abandons") would abandon the delete on every keystroke
    // or refresh. With the review's fix, only a transition that exits DELETING abandons it.
    on: {
      SearchTyped: {
        target: "self",
        updateMemory: ({ event }) => ({ searchText: event.text }),
        raise: [E.searchSettle.Input],
      },
      SortChanged: {
        target: "self",
        updateMemory: ({ event }) => requery({ sort: event.sort, page: 1 }),
      },
      StatusChanged: {
        target: "self",
        updateMemory: ({ event }) => requery({ status: event.status, page: 1 }),
      },
      NextPage: {
        target: "self",
        guard: ({ memory, activities }) =>
          memory.page * PAGE_SIZE < (activities.list?.data?.total ?? 0) || deny("LastPage"),
        updateMemory: ({ memory }) => requery({ page: memory.page + 1 }),
      },
      PreviousPage: {
        target: "self",
        guard: ({ memory }) => memory.page > 1 || deny("FirstPage"),
        updateMemory: ({ memory }) => requery({ page: memory.page - 1 }),
      },
      RowToggled: {
        target: "self",
        guard: ({ activities, event }) => rowOf(activities, event.id) !== undefined || deny("NotOnPage"),
        updateMemory: ({ memory, event }) => ({
          selected: memory.selected.includes(event.id)
            ? memory.selected.filter((id) => id !== event.id)
            : [...memory.selected, event.id],
        }),
      },
      PageToggled: {
        target: "self",
        guard: ({ activities }) => rowsOf(activities).length > 0 || deny("EmptyPage"),
        updateMemory: ({ memory, activities }) => {
          const ids = rowsOf(activities).map((row) => row.id);
          const all = ids.every((id) => memory.selected.includes(id));
          return { selected: all ? [] : ids };
        },
      },
      PinClicked: {
        target: "self",
        guard: ({ activities, memory, event }) =>
          rowOf(activities, event.id) === undefined
            ? deny("NotOnPage")
            : memory.pinning.every((pin) => pin.id !== event.id) || deny("PinInFlight"),
        updateMemory: ({ memory, event, activities }) => ({
          pinning: [...memory.pinning, { id: event.id, title: rowOf(activities, event.id)!.title }],
        }),
        actions: [setPinned],
      },
      // The optimistic value stays until the next lookup confirms it (Operations O5).
      Pinned: { target: "self", updateMemory: ({ memory, event }) => unpin(memory, event.id) },
      PinFailed: {
        target: "self", // the optimistic layer is already gone: the row has reverted
        updateMemory: ({ memory, event }) => unpin(memory, event.id),
        raise: [
          E.flash.Show.from(({ memory, event }) => ({
            text: `Couldn't pin ${titleOf(memory, event.id)}`,
          })),
        ],
      },
      // FAKED: Operations O5 keeps an unknown commit's optimistic value until a confirming
      // lookup lands, so the row cannot revert at once. It refetches and shows the server's answer.
      PinUnsure: {
        target: "self",
        updateMemory: ({ memory, event }) => unpin(memory, event.id),
        actions: [refetchList],
        raise: [
          E.flash.Show.from(({ memory, event }) => ({
            text: `Couldn't pin ${titleOf(memory, event.id)}`,
          })),
        ],
      },
      // See the note at setPinned's interrupt mapping: forgetting all is the lesser harm.
      PinsLost: {
        target: "self",
        updateMemory: () => ({ pinning: [] }),
        actions: [refetchList],
        raise: [E.flash.Show.from(() => ({ text: "Couldn't pin an issue" }))],
      },
      RefreshDue: { target: "self", actions: [refetchList] },
    },

    states: {
      BROWSING: {},
      DELETING: {
        input: ({ memory }) => ({ request: { ids: memory.selected } }),
        requests: {
          submit: {
            operation: ({ results }) =>
              O.Issues.deleteMany.commit(({ payload }) => payload, {
                outcomes: {
                  success: results.Done,
                  failure: { DeleteRejected: results.Rejected.from(() => ({ reason: "Delete failed" })) },
                },
              }),
            abandoned: {}, // nothing exits DELETING except its own exits
          },
        },
        exits: {
          Done: { target: S.BROWSING, updateMemory: () => ({ selected: [] }), actions: [refetchList] },
          Rejected: {
            target: S.BROWSING,
            raise: [E.flash.Show.from(() => ({ text: "Delete failed" }))],
          },
          // maxRetries is 0, so a notSent (an earlier delete still running) gives up at once.
          GaveUp: {
            target: S.BROWSING,
            raise: [E.flash.Show.from(() => ({ text: "Delete failed" }))],
          },
          // unknown, and also interrupt and defect: a commit's defect is uncertainty in A.
          Uncertain: {
            target: S.BROWSING,
            actions: [refetchList],
            raise: [E.flash.Show.from(() => ({ text: "Delete may have happened" }))],
          },
        },
      },
    },
  };
});
```

```tsx
// issues/IssueListScreen.tsx
import { check } from "flow-state";
import { useActor, useView } from "flow-state/react";
import { IssueList } from "./issue-list.definition.js";
import { IssueListMachine } from "./issue-list.machine.js";
import { PAGE_SIZE } from "./issue.types.js";

const { S, E } = IssueList;

function useIssueList() {
  return useActor(IssueListMachine);
}

type IssuesActor = ReturnType<typeof useIssueList>;

const allowed = (verdict: { _tag: string }) => verdict._tag === "Allowed";

export function IssueListScreen() {
  const issues = useIssueList();
  return (
    <section aria-label="Issues">
      <Toolbar issues={issues} />
      <FlashMessage issues={issues} />
      <Rows issues={issues} />
      <Pager issues={issues} />
      <DeleteButton issues={issues} />
    </section>
  );
}

function Toolbar({ issues }: { issues: IssuesActor }) {
  const text = useView(issues, (s) => s.memory.searchText);
  const sort = useView(issues, (s) => `${s.memory.sort.field}:${s.memory.sort.dir}`);
  const status = useView(issues, (s) => s.memory.status);
  return (
    <div className="toolbar">
      <input
        type="search"
        placeholder="Search issues"
        value={text}
        onChange={(event) => issues.send(E.SearchTyped({ text: event.target.value }))}
      />
      <select
        value={sort}
        onChange={(event) => {
          const [field, dir] = event.target.value.split(":") as ["updated" | "title", "asc" | "desc"];
          issues.send(E.SortChanged({ sort: { field, dir } }));
        }}
      >
        <option value="updated:desc">Recently updated</option>
        <option value="updated:asc">Least recently updated</option>
        <option value="title:asc">Title A–Z</option>
        <option value="title:desc">Title Z–A</option>
      </select>
      <select
        value={status}
        onChange={(event) =>
          issues.send(E.StatusChanged({ status: event.target.value as "open" | "closed" | "all" }))
        }
      >
        <option value="open">Open</option>
        <option value="closed">Closed</option>
        <option value="all">All</option>
      </select>
    </div>
  );
}

function FlashMessage({ issues }: { issues: IssuesActor }) {
  const text = useView(issues, (s) => s.memory.flash.text);
  return text ? <p role="status">{text}</p> : null;
}

function Rows({ issues }: { issues: IssuesActor }) {
  const lane = useView(issues, (s) => s.activities.list);
  const allSelected = useView(issues, (s) => {
    const items = s.activities.list?.data?.items ?? [];
    return items.length > 0 && items.every((row) => s.memory.selected.includes(row.id));
  });

  if (lane?.data === undefined) return <ul aria-busy="true" className="skeleton" />;
  if (lane.data.items.length === 0) return <p>No issues match.</p>;

  return (
    <table className={lane._tag === "Pending" ? "muted" : undefined}>
      <thead>
        <tr>
          <th>
            <input
              type="checkbox"
              aria-label="Select all on this page"
              checked={allSelected}
              onChange={() => issues.send(E.PageToggled())}
            />
          </th>
          <th>Title</th>
          <th>Status</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {lane.data.items.map((row) => (
          <IssueRow key={row.id} issues={issues} row={row} />
        ))}
      </tbody>
    </table>
  );
}

function IssueRow({
  issues,
  row,
}: {
  issues: IssuesActor;
  row: { id: string; title: string; status: string; pinned: boolean };
}) {
  const selected = useView(issues, (s) => s.memory.selected.includes(row.id));
  const canPin = useView(issues, (s) => allowed(check(s, E.PinClicked({ id: row.id }))));
  return (
    <tr>
      <td>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => issues.send(E.RowToggled({ id: row.id }))}
        />
      </td>
      <td>{row.title}</td>
      <td>{row.status}</td>
      <td>
        {/* row.pinned already includes the optimistic value */}
        <button
          aria-pressed={row.pinned}
          disabled={!canPin}
          onClick={() => issues.send(E.PinClicked({ id: row.id }))}
        >
          {row.pinned ? "Unpin" : "Pin"}
        </button>
      </td>
    </tr>
  );
}

function Pager({ issues }: { issues: IssuesActor }) {
  const page = useView(issues, (s) => s.memory.page);
  const total = useView(issues, (s) => s.activities.list?.data?.total ?? 0);
  const canPrevious = useView(issues, (s) => allowed(check(s, E.PreviousPage())));
  const canNext = useView(issues, (s) => allowed(check(s, E.NextPage())));
  return (
    <nav aria-label="Pages">
      <button disabled={!canPrevious} onClick={() => issues.send(E.PreviousPage())}>
        Previous
      </button>
      <span>
        Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
      </span>
      <button disabled={!canNext} onClick={() => issues.send(E.NextPage())}>
        Next
      </button>
    </nav>
  );
}

function DeleteButton({ issues }: { issues: IssuesActor }) {
  const count = useView(issues, (s) => s.memory.selected.length);
  const pressing = useView(issues, (s) => s.memory.hold.pressing);
  const deleting = useView(issues, (s) => S.DELETING.is(s));
  const canPress = useView(issues, (s) => allowed(check(s, E.hold.Press())));
  return (
    <button
      disabled={!canPress && !pressing}
      onPointerDown={() => issues.send(E.hold.Press())}
      onPointerUp={() => issues.send(E.hold.Release())} // never refusable
      onPointerLeave={() => issues.send(E.hold.Release())}
    >
      {deleting
        ? "Deleting…"
        : pressing
          ? "Keep holding…"
          : `Hold to delete ${count} selected`}
    </button>
  );
}
```

```ts
// issues/issue-list.story.ts
import { expect, test } from "vite-plus/test";
import { check } from "flow-state";
import { story } from "flow-state/testing";
// 45 seeded issues; I-3 "Crash on save" and I-7 "Crash on load" match "crash".
// Pins of I-3 fail after 1 second; deletes succeed.
import { IssuesFixture } from "../testing/fixtures.js";
import { IssueList } from "./issue-list.definition.js";
import { IssueListMachine } from "./issue-list.machine.js";

const { S, E } = IssueList;

export const screen = story
  .machine(IssueListMachine, {
    id: "IssueList/screen",
    fixtures: [IssuesFixture.seeded({ failPins: ["I-3"], pinDelay: "1 second" })],
  })
  .process()
  .send(E.NextPage())
  .process()
  .send(E.RowToggled({ id: "I-21" }))
  .process()
  .checkpoint("page-2-selected")
  .send(E.SearchTyped({ text: "cr" }))
  .process()
  .advance("100 millis")
  .send(E.SearchTyped({ text: "crash" }))
  .process()
  .advance("299 millis")
  .process()
  .checkpoint("still-typing")
  .advance("1 millis")
  .process()
  .checkpoint("searched")
  .send(E.PinClicked({ id: "I-3" }))
  .process()
  .checkpoint("pinning")
  .advance("1 second")
  .process()
  .checkpoint("pin-failed")
  .advance("3 seconds")
  .process()
  .checkpoint("flash-gone")
  .send(E.PageToggled())
  .send(E.hold.Press())
  .process()
  .advance("1 second")
  .send(E.hold.Release()) // early: cancels
  .process()
  .advance("1 second")
  .process()
  .checkpoint("released-early")
  .send(E.hold.Press())
  .process()
  .advance("1.5 seconds")
  .process()
  .checkpoint("deleted");

test("search debounces, pins revert with a flash, and only a full hold deletes", async () => {
  const run = await screen.run();
  const at = (name: keyof typeof run.checkpoints) => run.checkpoints[name].snapshot;
  const row = (name: keyof typeof run.checkpoints, id: string) =>
    at(name).activities.list?.data?.items.find((issue) => issue.id === id);

  expect(at("page-2-selected").memory.selected).toEqual(["I-21"]);

  expect(at("still-typing").memory.search).toBe("");
  expect(at("still-typing").memory.page).toBe(2);

  const searched = at("searched");
  expect(searched.memory).toMatchObject({ search: "crash", page: 1, selected: [] });

  expect(row("pinning", "I-3")?.pinned).toBe(true); // optimistic
  expect(check(at("pinning"), E.PinClicked({ id: "I-3" }))).toMatchObject({
    _tag: "Denied",
    reasons: [{ code: "PinInFlight" }],
  });
  expect(check(at("pinning"), E.PinClicked({ id: "I-7" }))._tag).toBe("Allowed");

  expect(row("pin-failed", "I-3")?.pinned).toBe(false); // reverted
  expect(at("pin-failed").memory.flash.text).toBe("Couldn't pin Crash on save");
  expect(at("flash-gone").memory.flash.text).toBeNull();

  expect(S.BROWSING.is(at("released-early"))).toBe(true);
  expect(at("released-early").memory.selected).toEqual(["I-3", "I-7"]);

  const deleted = at("deleted");
  expect(S.BROWSING.is(deleted)).toBe(true);
  expect(deleted.memory.selected).toEqual([]);
  expect(deleted.activities.list?.data?.items).toEqual([]); // refetched after the delete
});
```

### Metrics: issue list

| Part | Non-blank | Non-blank, non-comment |
| --- | --- | --- |
| Fragments used (shared file) | `Debounce`, `HoldToConfirm`, `Flash`, `CommitWithRetry` | |
| Types | 14 | 13 |
| Definition | 62 | 54 |
| Machine | 233 | 207 |
| Components | 170 | 168 |
| Story | 81 | 78 |

**New keywords used:** `traits`, `hostEvents` (through the traits), `guards`, `callbacks`,
`notify` (inside the traits), `raise`, `requests`, `operation`, `results`, `abandoned`, `exits`,
plus `start` and `notSent` inside `CommitWithRetry`. That is 13 of the 19.

**Duplicated logic:**

- The "outstanding call per key" set (`pinning`) is the same bookkeeping as 2FA's `resending`, done
  by hand both times.
- The query-change reset (`requery`) is a local helper used in five handlers. It is not duplicated
  across apps.
- The "flash" exits repeat `E.flash.Show.from(...)` four times. The text differs, but the shape is
  the same.

---

## Summary metrics

**Counting method.** A script reads the file name from each code block's first comment and counts
lines. "Non-blank" counts every line with text, comments included. "Non-blank, non-comment" also
drops lines that are only a comment, which is the principles review's method. Trailing comments on
code lines count in both. The operations note is almost all comment and sits outside the
comparison, because the other builds treat adapters as out of scope. The per-app tables above use
the same two columns.

| | Non-blank | Non-blank, non-comment |
| --- | --- | --- |
| Shared fragments file (6 fragments + 4 helpers) | 285 | 261 |
| Shared operations note (outside the comparison) | 18 | 1 |
| Two-factor: step + definition + machine | 222 | 207 |
| Signup: definition + machine | 241 | 225 |
| Issue list: types + definition + machine | 309 | 274 |
| All components | 457 | 450 |
| All Stories | 209 | 204 |

**Fragments reused across apps:**

| Fragment | Two-factor | Signup | Issue list |
| --- | --- | --- | --- |
| `Field` | code | email, password, name, role | — |
| `Cooldown` | resend | — | — |
| `Flash` | — | — | pin and delete messages |
| `Debounce` | — | — | search |
| `HoldToConfirm` | — | — | bulk delete |
| `Confirm` | — | discard | — |
| `CommitWithRetry` | — (cannot nest in `TwoFactorStep`) | create | delete (`maxRetries: 0`) |
| `TwoFactorStep` | the step | — | — |

**FAKED markers:** 19 in total. The two `// RELIES ON REVIEW FIX:` markers are not counted.

| Kind | Count | Where |
| --- | --- | --- |
| Timer idiom (counter + `restartOn`; deadline copied into memory) | 5 | Debounce, Cooldown, Flash, HoldToConfirm, 2FA `LOCKED` |
| Dynamic collections (no keyed or dynamic fragment instances) | 4 | invites list, invite error in machine, invite error in view, `pinning` |
| Hand-kept outstanding-call state | 1 | `resending` |
| No history state | 3 | `returnTo`, its update, the `Declined` alternatives |
| Outcome mappers see values only (host commits) | 4 | `PinRejected { id }` ×2, `attempt.key.id`, `PinsLost` (cannot fix in this system) |
| Operations semantics differ from apps.md | 1 | unknown pin cannot revert at once |
| Fragment used against its purpose | 1 | `CommitWithRetry` with `maxRetries: 0` |

---

## How this system felt

**Easy.**

- Anything with a lifetime that matches a node fit well.
  - The signup fields as root traits made "every page keeps its drafts across Back, Next and
    Keep" free; nothing is copied.
  - `TwoFactorStep` as a subroutine made "Back to password, keeping nothing" free: abandoning the
    step drops its counter, lockout, error, field and cooldown in one transition.
- `CommitWithRetry` matched the signup's Busy/backoff/UNSURE requirement almost word for word. Its
  four exits map onto the four required endings, and "never retry unknown" is already in the
  fragment.
- `Debounce`, `HoldToConfirm` and `Flash` dropped into the issue list with a few lines of filling
  each.
- `raise` into `Field.Set` cleared the 2FA code from a result handler in the same turn.
- `check()` drove every button with no view rules: Submit, Resend, Next, Back, Add, Pin, the
  pagers and the hold button.

**Strained.**

1. **Anything per-row or per-entry.** Fragment instances are fixed at construction, so the two
   dynamic collections (invites, pins in flight) fell back to host arrays with hand-written
   validation and bookkeeping.
   - The pin case also hits a baseline limit: outcome mappers see values only. Interrupt and
     defect cannot say which row they belong to, so the error type had to carry the id.
   - A fragment request would have given fixed outcome shapes, but it allows one outstanding call
     per activation, so it can't serve concurrent pins.
   - The one bug the correctness review found in this build is here. After an `interrupt` or
     `defect` on one pin, the host cannot tell which row it belongs to. It forgets every in-flight
     pin, so a still-running row's second click is declined silently. v2 cannot fix that without
     new API: outcome mappers would need the Attempt, or guards a readable outstanding-commit fact.
2. **Timers.** Every timer fragment needs a counter plus `restartOn` to arm from a host event, and
   a second copy of the deadline in memory so a view can count down.
   - The 2FA lockout repeats Cooldown's arithmetic because rule 11 forbids raising into a trait on
     the node being entered.
   - "Arm on entry, show the deadline" has no direct spelling.
3. **History.** "Keep returns to the same page" needs `returnTo` in memory and one exit alternative
   per page.
4. **No nesting.** Subroutines cannot contain subroutines (version 1). `TwoFactorStep` could not
   reuse `CommitWithRetry` (or a single-shot commit step) for `verify`. Its result handling is
   written inline.
5. **The written rules.**
   - **Rule 8**, read literally, would abandon the issue list's delete on every keystroke. The review
     fix is necessary, not cosmetic.
   - **Rule 9's one-outstanding-call** forced the hand-kept `resending` flag. Without it, a double
     click would reject a whole turn instead of being denied, because the view cannot see the
     outstanding call through `check()`.

**Faked most.** The timer idiom (5 markers) and dynamic collections (4, plus 4 for host-commit
outcome routing). Both are structural:

- fragments are static;
- schedules have no readable deadline and no "arm now".

**Reuse.**

- `Field` was reused in two apps (five instances).
- `CommitWithRetry` was reused in two apps, once in a role it wasn't designed for.
- `Debounce`, `HoldToConfirm`, `Flash`, `Cooldown` and `Confirm` were each used once. Their
  `flow check` info 17 ("used by one machine") fires under these three apps alone.
- `TwoFactorStep` is a single-use subroutine, justified by lifetime rather than reuse.

The fill blocks are small (2–10 lines per instance). The contract headers are the cost: the shared
file (285 lines) is longer than the largest app machine (225).

---

## Fix log

The fix pass follows [reviews/correctness.md](reviews/correctness.md) (bugs, §6 "A") and
[reviews/principles.md](reviews/principles.md) (clarity, §8 "A").

| # | Finding | Change |
| --- | --- | --- |
| C1 | Issue list: `PinsLost` clears every in-flight pin, so re-clicking a still-running row is declined silently. | **Stays, marked `// FAKED: cannot fix in this system`.** `interrupt` and `defect` carry no row id, and no guard can read which `setPinned` keys are outstanding. Keeping the pins instead would leave the lost row refused for the screen's life, which is worse than a click declined until the first commit settles. The marker names what v2 would need: the Attempt or admitted input in every outcome mapper (correctness §4.1), or a readable outstanding-commit fact (§4.2). "How this system felt" now names this bug. |
| P1 | Say that `TwoFactorStep` is single-use and exists for its lifetime. | Added a paragraph at the top of App 1: it scopes memory, timers and calls to the step, and v2 defers node memory. |
| P2 | The two "v2 review fix" markers are not workarounds. | Relabelled `// RELIES ON REVIEW FIX:` in the preamble and the code, and dropped from the FAKED tally (21 → 19). |
| P3 | Explain `abandoned: {}` in sign-in. | Both bindings now say that `{}` accepts losing a late verify or resend after Back, as apps.md's "keeping nothing" asks. |
| P4 | Explain `maxRetries: 0` at `DeleteIssues`. | A comment at the definition explains it: the subroutine buys call-id fencing, uncertainty-typed `unknown`/`interrupt`/`defect` and exhaustive exits, at about 10 lines over a plain host commit. v2 has no single-shot commit fragment, and writing one for one use would be early extraction. The `FAKED` marker stays. |
| P5 | State the counting method (285 vs 261). | The summary now states the method, and every metrics table gives both counts. Code is unchanged; the issue-list definition and machine grew only by the new comments (58 → 62 and 225 → 233 non-blank; 54 and 207 without comments). |

The correctness review found no bugs in apps 1 or 2, so they have no behavioural changes.
