# Build A, amended: proposal v2 with the amendments from the builds

A copy of [build-a-v2.md](build-a-v2.md), with every amendment from [amendments.md](amendments.md)
that applies to system A. The unamended build stays as it is, for comparison.

## What applies to A

| # | Applies? | Where it is used |
| --- | --- | --- |
| P1 | yes | issue list: pin outcomes name their row from `input` |
| P2 | yes | issue list: the delete becomes a fenced host commit |
| P3 | yes | issue list: "pin in flight" is read, not kept |
| P4 | yes | signup: the `create` descriptor carries the Busy retry policy |
| P5 | yes | signup: "Keep" targets `S.FILLING.history` |
| P6 | yes | sign-in: the resend countdown reads the schedule's `dueAt` |
| P7 | yes | every timer fragment: `armOn` replaces the counter-plus-`restartOn` idiom |
| P8 | already in v2 | nothing to change |
| S1 | yes | sign-in: the wrong attempts and the lockout survive Back and re-entry |
| S2 | already met | select-all already took its ids from the lane |
| S3 | partly | issue list: an `unknown` pin refetches; it cannot revert at once (see FAKED) |
| F1, F2, F4 | already in v2 | — |
| F3 | yes | all guards test states with tokens |
| F5 | not used | v2 already allows guard arrays; this build needs none |
| F6 | yes | sign-in: a second Resend while one is outstanding is denied, so the `resending` flag goes |

**Consequences for A's own pieces:**

- With P4 retrying on the descriptor and P2 fencing host commits, `CommitWithRetry` has no users
  left. Signup uses a plain host commit, and the delete no longer needs a retry subroutine with
  `maxRetries: 0`. The fragment is removed from the shared file.
- Both `RELIES ON REVIEW FIX` markers disappear with `DELETING`'s subroutine. Rule 8 and the M2
  case (a callback entering a step) no longer arise.
- Only `TwoFactorStep` still uses v2's `requests`. A fragment cannot hold host operations, and
  the step still needs its lifetime.

**Readings the draft syntax leaves open, marked `// ASSUMED:` in the code:**

1. **A1:** a guard receives `schedules` (the pre-turn snapshot's armed schedules) beside `state`,
   `memory` and `activities`, so it can test a cooldown through P6.
2. **A2:** fragment schedules appear in the snapshot nested like fragment memory:
   `s.schedules.TWO_FACTOR.resendWait.over`. An idle schedule is `undefined`; an armed one has
   `dueAt`.
3. **A3:** a schedule with `armOn` does not arm on entry. It arms (or re-arms) when a transition
   handling one of the listed events is accepted.
4. **A4:** in P4's `retrying` mapper, `attempt` is the retry ordinal, starting at 1.
5. **A5:** P3's `pending(s, key)` accepts a guard's input as `s`.
6. **A6:** P2 fences a commit started by a transition to the activation of that transition's
   target state. A commit started by a root `"self"` handler belongs to the actor's life.
7. **A7:** F3's `token.is(state)` accepts a guard's `state` path. Inside a fragment, the
   fragment's own `S` tokens test its fragment-relative `state`.
8. **A8:** a `notify` payload mapper receives `now`, like the other turn mappers (Machines O3).

```ts
// shared/operations.ts — the handles the three apps use. Adapters are out of scope (apps.md);
// each domain is declared elsewhere. This records only what the machines rely on.
//
//   O.Auth.verifyCode    transaction  input { challengeId, code }   errors WrongCode | Expired  "reject"
//   O.Auth.resendCode    transaction  input { challengeId }         no typed errors             "reject"
//   O.Accounts.create    transaction  input { email, password, name, role, invites }
//                                     errors EmailTaken | Busy                                 "reject"
//                                     AMENDMENT P4: retry: { on: ["Busy"],
//                                       schedule: Schedule.exponential("1 second").pipe(Schedule.recurs(3)) }
//   O.Issues.list        resource     key: the whole query          result { items, total }
//   O.Issues.setPinned   transaction  key ({ id }), input { id, pinned }, returns Issue,
//                                     error PinRejected                                        "reject"
//   O.Issues.deleteMany  transaction  input { ids }                 error DeleteRejected        "reject"
//
// verifyCode and resendCode are bound to fragment requests, so they may not use "allow" (v2
// rule 9). AMENDMENT P1: PinRejected no longer has to carry the row id; mappers receive the input.
export { AccountsDomain, AuthDomain, IssuesDomain } from "./domains.js";
```

---

## Shared fragments

Six fragments now: `Field`, `Debounce`, `Cooldown`, `Flash`, `HoldToConfirm` and `Confirm`. Every
timer fragment loses its counter (P7), and `Cooldown` loses its memory entirely (P6).

```ts
// shared/fragments.ts — reusable traits and subroutines for the three apps. None of them reads
// context, sends to other actors, runs activities or does I/O (v2 rule 14).
import { Duration, Schema } from "effect";
import { deny, subroutine, trait } from "flow-state";

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
      callbacks: { onSettled: {} },
    },
    ({ E, callbacks }) => ({
      schedules: {
        // AMENDMENT P7: every Input re-arms the timer; the `seq` counter and restartOn are gone.
        settle: { schedule: p.wait, send: E.Due, armOn: [E.Input] },
      },
      on: {
        Input: { target: "self" }, // handled, so it is accepted and arms `settle`
        Due: { target: "self", notify: [callbacks.onSettled] },
      },
    }),
  );

// ── Cooldown (trait): after Start, its `over` schedule is armed for `length` ───────────────
// The host refuses its own action while `over` is armed; the trait refuses nothing. It has no
// memory: whether it is cooling, and until when, is the schedule itself.
export const Cooldown = (p: { length: Duration.Input }) =>
  trait(
    {
      id: "Cooldown",
      hostEvents: { Start: {} },
      internalEvents: { Over: {} },
    },
    ({ E }) => ({
      schedules: {
        // AMENDMENT P7: armed by Start, not by a counter.
        // ASSUMED: A3, an armOn schedule does not arm on entry.
        over: { schedule: p.length, send: E.Over, armOn: [E.Start] },
      },
      on: {
        Start: { target: "self" },
        Over: { target: "self" },
      },
    }),
  );

// AMENDMENT P6: the deadline is the armed schedule's dueAt; nothing is copied into memory.
// ASSUMED: A2, an idle schedule reads as undefined and an armed one as { dueAt }.
export const coolingUntil = (schedules: { over?: { dueAt: number } } | undefined) =>
  schedules?.over?.dueAt ?? null;

export const secondsLeft = (until: number, now: number) =>
  Math.max(0, Math.ceil((until - now) / 1000));

// ── Flash (trait): shows a message for `length`; a newer message replaces it ───────────────
export const Flash = (p: { length: Duration.Input }) =>
  trait(
    {
      id: "Flash",
      hostEvents: { Show: { text: Schema.String } },
      internalEvents: { Hide: {} },
      memory: { text: Schema.NullOr(Schema.String) },
      initial: () => ({ text: null }),
    },
    ({ E }) => ({
      schedules: {
        hide: { schedule: p.length, send: E.Hide, armOn: [E.Show] }, // AMENDMENT P7: no `shows` counter
      },
      on: {
        Show: { target: "self", updateMemory: ({ event }) => ({ text: event.text }) },
        Hide: { target: "self", updateMemory: () => ({ text: null }) },
      },
    }),
  );

// ── HoldToConfirm (trait): tells its host after a continuous hold ──────────────────────────
// Release is public and unguarded, so no host can refuse it. A re-press re-arms the schedule;
// the arming id discards a firing queued before it (v2 rule 12).
export const HoldToConfirm = (p: { hold: Duration.Input }) =>
  trait(
    {
      id: "HoldToConfirm",
      events: { Press: {}, Release: {} },
      internalEvents: { Held: {} },
      memory: { pressing: Schema.Boolean },
      initial: () => ({ pressing: false }),
      guards: ["canPress"], // only Press may be refused
      callbacks: { onHeld: {} },
    },
    ({ E, guards, callbacks }) => ({
      schedules: {
        held: { schedule: p.hold, send: E.Held, armOn: [E.Press] }, // AMENDMENT P7: no `presses` counter
      },
      on: {
        Press: {
          target: "self",
          guard: guards.canPress,
          updateMemory: () => ({ pressing: true }),
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
```

---

## App 1: Two-factor sign-in

**`TwoFactorStep` is single-use.** It exists for its lifetime, not for reuse: as a subroutine, its
memory, timers and calls end when the user goes back to the password, and a late verify never
reaches a newer attempt.

**What the amendments change:**

- **S1** asks the opposite of "keeping nothing" for two facts: the wrong attempts and the lockout
  must survive Back and re-entry for the same challenge. The step reports them to the host through a
  callback, `onStrikes`. The host keeps them as `strikes` and passes them back in as the step's
  input.
- A subroutine's default is static, so a step re-entered while locked must hop from `ARRIVING` to
  `LOCKED` (FAKED below).
- **F6** removes the `resending` flag.
- **P6/P7** shrink `Cooldown` to two schedules' worth of lines.

```ts
// sign-in/two-factor.step.ts
import { Duration, Schema } from "effect";
import { Attempt, deny, subroutine } from "flow-state";
import { Cooldown, Field, coolingUntil, isValid } from "../shared/fragments.js";

const MAX_WRONG = 3;
const LOCKOUT: Duration.Input = "5 minutes";
const COULDNT_CHECK = "Couldn't check the code, try again";

const sixDigits = (v: string) => (/^\d{6}$/.test(v) ? null : "Enter the 6-digit code");

const lockoutEnd = (now: number) => now + Duration.toMillis(LOCKOUT);

const Strikes = {
  challengeId: Schema.String,
  wrong: Schema.Int,
  // FAKED: kept in memory although P6 makes deadlines readable. A schedule's dueAt ends with
  // the step, and S1 needs the lockout to outlive it.
  lockedUntil: Schema.NullOr(Schema.Number),
};

export const TwoFactorStep = subroutine(
  {
    id: "TwoFactorStep",
    input: Strikes, // AMENDMENT S1: the host hands back what the last visit left
    states: ["ARRIVING", "ENTERING", "VERIFYING", "LOCKED"],
    traits: {
      code: Field(Schema.String, { validate: sixDigits }),
      resendWait: Cooldown({ length: "30 seconds" }), // root of the step: lives through LOCKED
    },
    events: { Submit: {}, Resend: {} },
    internalEvents: {
      Arrived: {},
      Accepted: {},
      Wrong: {},
      Expired: {},
      NotChecked: {}, // the fixed shape for notSent
      Unchecked: { attempt: Attempt }, // the fixed shape for unknown, interrupt and defect
      ResendDone: {},
      ResendUnsure: { attempt: Attempt },
      Unlock: {},
    },
    memory: { ...Strikes, error: Schema.NullOr(Schema.String) },
    initial: ({ input }) => ({ ...input, error: null }),
    // AMENDMENT S1: every change to the strikes is reported, so Back cannot lose it.
    callbacks: { onStrikes: Strikes },
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
  ({ S, E, requests, callbacks, exits }) => ({
    // FAKED: a default cannot depend on memory, so every entry passes through ARRIVING for one
    // zero-delay tick, which picks LOCKED or ENTERING from the strikes carried in.
    default: S.ARRIVING,

    traits: {
      code: {
        input: () => ({ initialValue: "" }), // reads nothing: nested trait input is undefined in v2
        guards: {
          // AMENDMENT F3: states tested with tokens. ASSUMED: A7.
          canEdit: ({ state }) =>
            S.ENTERING.is(state) || deny(S.LOCKED.is(state) ? "LockedOut" : "Checking"),
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
          Sent: E.ResendDone,
          notSent: E.ResendDone,
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
        // AMENDMENT F6: a Resend while the last one is outstanding is denied ("Busy") by the
        // request itself, so the hand-kept `resending` flag is gone.
        // ASSUMED: A1 (guards read `schedules`) and A2 (fragment-relative schedule paths).
        guard: ({ state, schedules }) =>
          S.VERIFYING.is(state)
            ? deny("Checking")
            : coolingUntil(schedules.resendWait) === null || deny("ResendCoolingDown"),
        actions: [requests.resend],
        raise: [E.resendWait.Start],
      },
      ResendDone: { target: "self" },
      ResendUnsure: { target: "self" },
    },

    states: {
      ARRIVING: {
        schedules: { arrive: { schedule: 0, send: E.Arrived } },
        on: {
          Arrived: [
            {
              target: S.LOCKED,
              guard: ({ memory }) => memory.lockedUntil !== null || deny("NotLocked"),
            },
            { target: S.ENTERING },
          ],
        },
      },
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
          // Every result handler ends unguarded (terminal totality, rule 13); Set is unguarded,
          // and the host's onStrikes filling is total.
          Wrong: [
            {
              target: S.LOCKED,
              guard: ({ memory }) => memory.wrong + 1 >= MAX_WRONG || deny("TriesLeft"),
              updateMemory: ({ memory, now }) => ({
                wrong: memory.wrong + 1,
                error: null,
                lockedUntil: lockoutEnd(now),
              }),
              raise: [E.code.Set.from(() => ({ value: "" }))],
              // ASSUMED: A8, notify mappers receive `now`.
              notify: [
                callbacks.onStrikes.from(({ memory, now }) => ({
                  challengeId: memory.challengeId,
                  wrong: memory.wrong + 1,
                  lockedUntil: lockoutEnd(now),
                })),
              ],
            },
            {
              target: S.ENTERING,
              updateMemory: ({ memory }) => ({
                wrong: memory.wrong + 1,
                error: `Wrong code, ${MAX_WRONG - memory.wrong - 1} tries left`,
              }),
              raise: [E.code.Set.from(() => ({ value: "" }))],
              notify: [
                callbacks.onStrikes.from(({ memory }) => ({
                  challengeId: memory.challengeId,
                  wrong: memory.wrong + 1,
                  lockedUntil: null,
                })),
              ],
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
        schedules: {
          // What is left of the lockout: all of it on a fresh lockout, less after a re-entry.
          unlock: {
            schedule: ({ memory, now }) => Math.max(0, (memory.lockedUntil ?? now) - now),
            send: E.Unlock,
          },
        },
        on: {
          Unlock: {
            target: S.ENTERING,
            updateMemory: () => ({ wrong: 0, lockedUntil: null }),
            notify: [
              callbacks.onStrikes.from(({ memory }) => ({
                challengeId: memory.challengeId,
                wrong: 0,
                lockedUntil: null,
              })),
            ],
          },
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
  memory: {
    // AMENDMENT S1: the step's wrong attempts and lockout, per challenge, outliving the step.
    strikes: Schema.NullOr(
      Schema.Struct({
        challengeId: Schema.String,
        wrong: Schema.Int,
        lockedUntil: Schema.NullOr(Schema.Number),
      }),
    ),
  },
  initial: () => ({ strikes: null }),
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
      // AMENDMENT S1: the same challenge resumes its strikes; a new challenge starts clean.
      input: ({ event, memory }) =>
        memory.strikes?.challengeId === event.challengeId
          ? memory.strikes
          : { challengeId: event.challengeId, wrong: 0, lockedUntil: null },
      callbacks: {
        onStrikes: { target: "self", updateMemory: ({ payload }) => ({ strikes: payload }) },
      },
      requests: {
        verify: {
          operation: ({ results }) =>
            O.Auth.verifyCode.commit(({ payload }) => payload, {
              outcomes: {
                success: results.Verified,
                failure: { WrongCode: results.WrongCode, Expired: results.Expired },
              },
            }),
          // `{}` accepts losing a late result after Back. A late success is dropped and the
          // user enters a new code.
          // FAKED: cannot fix in this system. A wrong code that settles after Back is not
          // counted toward S1's strikes, because `abandoned` reports only "failure", without its
          // tag. Submitting and going straight Back escapes one strike. v2 would need the failure
          // tag (or the mapped result) in the abandoned payload.
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
import { coolingUntil, secondsLeft, visibleError } from "../shared/fragments.js";
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
  // AMENDMENT P6: the resend countdown reads the armed schedule. ASSUMED: A2.
  const resendUntil = useView(signIn, (s) => coolingUntil(s.schedules.TWO_FACTOR?.resendWait));

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
  .send(E.BackToPassword()) // S1: Back must not reset the lockout
  .process()
  .send(E.PasswordAccepted({ challengeId: "c-1" }))
  .process()
  .checkpoint("re-entered")
  .advance("270 seconds") // five minutes after the lockout began
  .process()
  .checkpoint("unlocked")
  .send(enter("123456"))
  .send(E.TWO_FACTOR.Submit())
  .process()
  .checkpoint("signed-in");

test("three wrong codes lock the step for five minutes, across Back; resend has its own cooldown", async () => {
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
  expect(at("first-wrong").memory.strikes?.wrong).toBe(1); // reported to the host

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

  const reEntered = at("re-entered");
  expect(S.TWO_FACTOR.LOCKED.is(reEntered)).toBe(true); // through ARRIVING
  expect(reEntered.memory.TWO_FACTOR?.wrong).toBe(3);

  expect(S.TWO_FACTOR.ENTERING.is(at("unlocked"))).toBe(true);
  expect(at("unlocked").memory.TWO_FACTOR?.wrong).toBe(0);
  expect(at("unlocked").memory.strikes?.lockedUntil).toBeNull();

  expect(S.SIGNED_IN.is(at("signed-in"))).toBe(true);
  expect(at("signed-in").memory.TWO_FACTOR).toBeUndefined(); // the step's memory is gone
});
```

### Metrics: two-factor sign-in

| Part | Non-blank | Non-blank, non-comment |
| --- | --- | --- |
| Fragments used (shared file) | `Field`, `Cooldown` | |
| App fragment `TwoFactorStep` | 213 | 195 |
| Definition | 25 | 23 |
| Machine | 48 | 39 |
| Components | 96 | 92 |
| Story | 78 | 77 |

---

## App 2: Signup wizard

**What the amendments change:**

- **P4** puts the Busy retry policy on the `create` descriptor. It resends the same input, never
  retries `unknown`, `interrupt` or `defect`, and reports each retry. So `SUBMITTING` is a plain
  state with a plain host commit, and `CommitWithRetry` is no longer needed.
- **P2** fences that commit to `SUBMITTING`'s activation.
- **P5** replaces `returnTo` and the four `Declined` alternatives with `S.FILLING.history`.
- **F3** makes the page guards token tests.
- The invite list stays a host array: dynamic instances were not applied.

```ts
// signup/signup.definition.ts
import { Schema } from "effect";
import { definition } from "flow-state";
import { Confirm, Field, isEmail } from "../shared/fragments.js";
import { AccountsDomain } from "../shared/operations.js";

export const Role = Schema.Literal("engineer", "designer", "manager");

export const MAX_INVITES = 5;

export const Signup = definition({
  id: "Auth/Signup",
  states: [
    { FILLING: ["ACCOUNT", "PROFILE", "INVITE", "REVIEW"] },
    { DISCARD: Confirm },
    "SUBMITTING", // AMENDMENT P4: a plain state; the descriptor retries
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
  internalEvents: {
    Created: {},
    EmailTaken: {},
    GaveUp: {},
    Unsure: {},
    Retrying: { n: Schema.Int },
  },
  memory: {
    // FAKED: a list of 0–5 fields cannot be Field traits (instances are fixed at construction),
    // so the invites are host memory. Their per-entry validation is hand-rolled in the machine
    // and the view, and they have no `edited` flag.
    invites: Schema.Array(Schema.String),
    accountError: Schema.NullOr(Schema.String),
    reviewError: Schema.NullOr(Schema.String),
    retries: Schema.Int, // for "Server busy, retrying (n/3)"
  },
  initial: () => ({ invites: [], accountError: null, reviewError: null, retries: 0 }),
  operations: { Accounts: AccountsDomain },
});
```

```ts
// signup/signup.machine.ts
import { deny, machine } from "flow-state";
import { isEmail, isValid } from "../shared/fragments.js";
import { MAX_INVITES, Signup } from "./signup.definition.js";

export const inviteError = (v: string) =>
  v === "" || isEmail(v) ? null : "Enter an email address"; // FAKED: Field's job, done by hand

export const SignupMachine = machine(Signup, ({ S, E, O }) => {
  // AMENDMENT F3: a page is tested with its token, not a path string. ASSUMED: A7.
  const onPage = (page: { is: (state: string) => boolean }) => ({ state }: { state: string }) =>
    page.is(state) || deny("OtherPage");

  // AMENDMENT P4: `create` retries Busy at 1 s, 2 s and 4 s, resending this same input, and never
  // retries unknown, interrupt or defect. Busy reaches `failure` only after the third retry fails.
  // AMENDMENT P2: started by the transition into SUBMITTING, so its results are fenced to that
  // activation (ASSUMED: A6). Nothing leaves SUBMITTING but these outcomes, so no `abandoned`.
  const create = O.Accounts.create.commit(
    ({ memory }) => ({
      email: memory.email.value,
      password: memory.password.value,
      name: memory.name.value.trim(),
      role: memory.role.value!, // PROFILE's Next guard guarantees it; the type still allows null
      invites: memory.invites,
    }),
    {
      outcomes: {
        success: E.Created,
        failure: { EmailTaken: E.EmailTaken, Busy: E.GaveUp },
        retrying: E.Retrying.from(({ attempt }) => ({ n: attempt })), // ASSUMED: A4
        unknown: E.Unsure,
        interrupt: E.Unsure,
        defect: E.Unsure,
      },
    },
  );

  return {
    default: S.FILLING,

    traits: {
      email: {
        input: () => ({ initialValue: "" }),
        guards: { canEdit: onPage(S.FILLING.ACCOUNT) },
        // A new email clears "That email is registered".
        callbacks: { onChanged: { target: "self", updateMemory: () => ({ accountError: null }) } },
      },
      password: {
        input: () => ({ initialValue: "" }),
        guards: { canEdit: onPage(S.FILLING.ACCOUNT) },
        callbacks: { onChanged: {} },
      },
      name: {
        input: () => ({ initialValue: "" }),
        guards: { canEdit: onPage(S.FILLING.PROFILE) },
        callbacks: { onChanged: {} },
      },
      role: {
        input: () => ({ initialValue: null }),
        guards: { canEdit: onPage(S.FILLING.PROFILE) },
        callbacks: { onChanged: {} },
      },
    },

    states: {
      FILLING: {
        default: S.FILLING.ACCOUNT,
        // Cancel from any page; SUBMITTING is not under FILLING, so Cancel is refused there.
        on: { Cancel: S.DISCARD },
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
              Submit: {
                target: S.SUBMITTING,
                updateMemory: () => ({ reviewError: null, retries: 0 }),
                actions: [create],
              },
              Back: S.FILLING.INVITE,
            },
          },
        },
      },

      DISCARD: {
        exits: {
          Confirmed: S.CANCELLED,
          Declined: S.FILLING.history, // AMENDMENT P5: shallow history replaces returnTo
        },
      },

      SUBMITTING: {
        on: {
          Retrying: { target: "self", updateMemory: ({ event }) => ({ retries: event.n }) },
          Created: S.DONE,
          EmailTaken: {
            target: S.FILLING.ACCOUNT,
            updateMemory: () => ({ accountError: "That email is registered" }),
          },
          GaveUp: { target: S.FILLING.REVIEW, updateMemory: () => ({ reviewError: "Try again later" }) },
          Unsure: S.UNSURE,
        },
      },

      DONE: {},
      CANCELLED: {},
      UNSURE: {}, // never retried automatically; the user checks their email
    },
  };
});
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
  const retries = useView(signup, (s) => s.memory.retries);
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
  expect(S.FILLING.REVIEW.is(at("kept"))).toBe(true); // history: back to the page Cancel left
  expect(at("kept").memory.email.value).toBe("ada@example.com");

  const busy = at("first-busy");
  expect(S.SUBMITTING.is(busy)).toBe(true);
  expect(busy.memory.retries).toBe(1);
  expect(check(busy, E.Cancel())._tag).toBe("Unhandled"); // Cancel is refused while submitting

  expect(at("second-busy").memory.retries).toBe(2);
  expect(S.DONE.is(at("created"))).toBe(true);
});
```

### Metrics: signup wizard

| Part | Non-blank | Non-blank, non-comment |
| --- | --- | --- |
| Fragments used (shared file) | `Field` ×4, `Confirm` | |
| Definition | 56 | 51 |
| Machine | 149 | 141 |
| Components | 192 | 190 |
| Story | 59 | 58 |

---

## App 3: Issue list screen

**What the amendments change:**

- **P1** lets every pin outcome name its row from the call's `input`. The `PinRejected { id }`
  adapter convention, the `attempt.key.id` cast and the "forget every in-flight pin" `PinsLost`
  all go. That fixes the one open bug from the correctness review.
- **P3** answers "is this row's pin in flight?" from the runtime, so the hand-kept `pinning` list
  goes.
- **P2** fences the delete to `DELETING`, so `DELETING` is a plain state with a plain host commit.
  `CommitWithRetry` with `maxRetries: 0` and both review-fix markers go.
- **P7** removes the timer counters inside the traits.
- **S3** is only partly met (FAKED below). **S2** was already met.

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
import { Debounce, Flash, HoldToConfirm } from "../shared/fragments.js";
import { IssuesDomain } from "../shared/operations.js";
import { IssueFilter, IssueSort } from "./issue.types.js";

export const IssueList = definition({
  id: "Issues/IssueList",
  states: ["BROWSING", "DELETING"], // AMENDMENT P2: DELETING is a plain state with a fenced commit
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
    PinFailed: { id: Schema.String },
    PinUnsure: { id: Schema.String },
    Deleted: {},
    DeleteFailed: {},
    DeleteUnsure: {},
  },
  memory: {
    searchText: Schema.String, // what the box shows
    search: Schema.String, // what the query uses, 300 ms later
    sort: IssueSort,
    status: IssueFilter,
    page: Schema.Int,
    selected: Schema.Array(Schema.String),
  },
  initial: () => ({
    searchText: "",
    search: "",
    sort: { field: "updated", dir: "desc" },
    status: "open",
    page: 1,
    selected: [],
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

// The row's title from the current page. If the query changed while the pin was in flight, the
// row may no longer be listed; the flash then names "an issue".
const pinFlash = ({ activities, event }: { activities: Lanes; event: { id: string } }) => ({
  text: `Couldn't pin ${rowOf(activities, event.id)?.title ?? "an issue"}`,
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
      // AMENDMENT P1: every outcome names its row from the input. Success needs no event: the
      // runtime forgets the call (P3), and the next lookup confirms the optimistic value.
      outcomes: {
        failure: { PinRejected: E.PinFailed.from((_error, { input }) => ({ id: input.id })) },
        unknown: E.PinUnsure.from((_attempt, { input }) => ({ id: input.id })),
        interrupt: E.PinFailed.from((_cause, { input }) => ({ id: input.id })),
        defect: E.PinFailed.from((_cause, { input }) => ({ id: input.id })),
      },
    },
  );

  // AMENDMENT P2: started by the onHeld transition into DELETING and fenced to that activation
  // (ASSUMED: A6). DELETING is left only by these outcomes, so no `abandoned` is needed.
  // A commit's interrupt and defect may follow a real delete, so they count as uncertainty.
  const deleteSelected = O.Issues.deleteMany.commit(({ memory }) => ({ ids: memory.selected }), {
    outcomes: {
      success: E.Deleted,
      failure: { DeleteRejected: E.DeleteFailed },
      unknown: E.DeleteUnsure,
      interrupt: E.DeleteUnsure,
      defect: E.DeleteUnsure,
    },
  });

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
          // AMENDMENT F3: tested with a token. ASSUMED: A7.
          canPress: ({ state, memory }) =>
            !S.BROWSING.is(state)
              ? deny("Deleting")
              : memory.selected.length > 0 || deny("NothingSelected"),
        },
        callbacks: {
          onHeld: [
            {
              target: S.DELETING,
              guard: ({ state, memory }) =>
                (S.BROWSING.is(state) && memory.selected.length > 0) || deny("NothingSelected"),
              actions: [deleteSelected],
            },
            { target: "self" }, // the selection emptied during the hold: nothing to delete
          ],
        },
      },
      flash: {},
    },

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
      // S2: the ids come from the current lane, never from the click.
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
        // AMENDMENT P3: the runtime says whether this row's commit is outstanding.
        // ASSUMED: A5, the guard's input serves as `s`.
        guard: (input) =>
          rowOf(input.activities, input.event.id) === undefined
            ? deny("NotOnPage")
            : !O.Issues.setPinned.pending(input, { id: input.event.id }) || deny("PinInFlight"),
        actions: [setPinned],
      },
      PinFailed: {
        target: "self", // the optimistic layer is already gone: the row has reverted
        raise: [E.flash.Show.from(pinFlash)],
      },
      // AMENDMENT S3, only partly: the list refetches. FAKED: cannot fix in this system —
      // Operations O5 keeps an unknown commit's optimistic value until a confirming lookup
      // lands, and no amendment changes that, so the row cannot revert at once. It shows the
      // server's answer when the refetch lands. A fix would need an action that drops one
      // commit's optimistic layer.
      PinUnsure: {
        target: "self",
        actions: [refetchList],
        raise: [E.flash.Show.from(pinFlash)],
      },
      RefreshDue: { target: "self", actions: [refetchList] },
    },

    states: {
      BROWSING: {},
      DELETING: {
        on: {
          Deleted: { target: S.BROWSING, updateMemory: () => ({ selected: [] }), actions: [refetchList] },
          DeleteFailed: {
            target: S.BROWSING,
            raise: [E.flash.Show.from(() => ({ text: "Delete failed" }))],
          },
          DeleteUnsure: {
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
    reasons: [{ code: "PinInFlight" }], // read from the runtime (P3)
  });
  expect(check(at("pinning"), E.PinClicked({ id: "I-7" }))._tag).toBe("Allowed");

  expect(row("pin-failed", "I-3")?.pinned).toBe(false); // reverted
  expect(at("pin-failed").memory.flash.text).toBe("Couldn't pin Crash on save");
  expect(check(at("pin-failed"), E.PinClicked({ id: "I-3" }))._tag).toBe("Allowed");
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
| Fragments used (shared file) | `Debounce`, `HoldToConfirm`, `Flash` | |
| Types | 14 | 13 |
| Definition | 50 | 49 |
| Machine | 198 | 177 |
| Components | 170 | 168 |
| Story | 82 | 79 |

---

## What the amendments changed

**Counting method:** the same as [build-a-v2.md](build-a-v2.md). Lines are non-blank; the "non-comment"
column also drops comment-only lines (`// AMENDMENT`, `// ASSUMED` and `// FAKED` lines included).
Per-app code is the app fragment, types, definition, machine and components; Stories are separate.

| | Before (build-a-v2.md) | After (this file) |
| --- | --- | --- |
| Shared fragments, non-comment | 261 | 147 |
| Sign-in: step + definition + machine + components | 161 + 13 + 33 + 92 = **299** | 195 + 23 + 39 + 92 = **349** |
| Signup: definition + machine + components | 65 + 160 + 190 = **415** | 51 + 141 + 190 = **382** |
| Issues: types + definition + machine + components | 13 + 54 + 207 + 168 = **442** | 13 + 49 + 177 + 168 = **407** |
| **Total with shared** | **1,417** | **1,285** |
| Stories, non-comment | 204 | 214 |
| `// FAKED:` markers in code | 19 (+2 "relies on review fix") | 7 (+0) |
| Bugs from reviews/correctness.md still open | 1 (`PinsLost` forgets every in-flight pin) | 0 |
| New bugs or gaps the amendments expose | — | 1 (a wrong code settling after Back is not counted toward S1's strikes; FAKED) |

**Where the FAKED markers went (19 → 7).** 15 went; 4 remain from before; 3 are new.

| Gone | Count | Removed by |
| --- | --- | --- |
| Timer counters (Debounce, Flash, HoldToConfirm) | 3 | P7 |
| Cooldown's copied deadline (and its `starts` counter) | 1 | P6, P7 |
| 2FA `resending` flag | 1 | F6 |
| `returnTo`, its update and the `Declined` chain | 3 | P5 |
| Row id on the error, `attempt.key.id`, `PinsLost` | 4 | P1 |
| `pinning` list | 1 | P3 |
| `CommitWithRetry` with `maxRetries: 0` | 1 | P2 |
| 2FA lockout deadline copy | 1 | replaced by the S1 marker below; it now has a different reason |

| Remaining or new | Why |
| --- | --- |
| Invites as host memory, invite error in machine and view (3) | dynamic instances were not applied |
| Unknown pin cannot revert at once (1) | Operations O5 is unamended; S3 is only half reachable |
| 2FA `lockedUntil` kept in memory (1, new) | S1 needs it beyond the step's life, where P6's `dueAt` cannot reach |
| `ARRIVING` hop (1, new) | S1: a subroutine's default cannot depend on carried-in memory |
| A late wrong code after Back is not a strike (1, new) | S1: `abandoned` reports `failure` without its tag |

**Helped most:**

1. **P1 + P3.** The pin code lost its in-flight list, three FAKED attributions and the one open
   bug. A per-row concurrent commit is now ordinary host code.
2. **P2 + P4.** Together they make A's own I/O fragment unnecessary in apps 2 and 3.
   - **P4** gives the descriptor the "retry Busy, resend the same input, never retry unknown"
     guarantee that `CommitWithRetry` existed to provide.
   - **P2** gives host commits the call-id fencing that justified the `maxRetries: 0` misuse.

   `CommitWithRetry` is deleted. The review-fix reliance (rules 3 and 8) disappears with it.
3. **P5 and P7.** Small and local, but they delete the most repeated workarounds: history in one
   line, and four timer counters.

**Did nothing for A:**

- **P8:** already in v2.
- **F1, F2, F4:** already in v2.
- **F5:** guard arrays exist in v2; no guard here needed two parts.
- **S2:** already met; select-all read the lane.
- **P6:** helped only the resend countdown. The lockout countdown still copies its deadline,
  because S1 needs that value after the step ends.

**Still strains:**

- **S1 against subroutine lifetime.** S1 cuts against what made A's 2FA correct: a subroutine
  forgets everything on Back. Keeping two facts across Back costs:
  - a callback;
  - host memory;
  - an input that branches on the challenge;
  - a zero-delay `ARRIVING` hop, because defaults are static;
  - a new hole: `abandoned` does not say which failure it was.

  Sign-in grew from 299 to 349 lines. Node memory, or a way to enter a subroutine at a
  chosen child, would remove the hop.
- **The case for A's request ports narrows to one.** With P2 and P4 in the plans, requests remain
  only where a host operation must be used from inside a fragment (`TwoFactorStep`'s verify and
  resend). Every other place uses plain host commits, which is what the baseline does.
- **Dynamic collections.** Invites and rows are still host arrays (3 FAKED). That is the largest
  gap left, and it is the one deliberately not amended.
- **New `// ASSUMED:` readings (8).** Several have no anchor in the plans yet:
  - guards reading `schedules` (A1);
  - fragment schedule paths (A2);
  - `armOn` not arming on entry (A3);
  - the `retrying` ordinal (A4);
  - `pending(s, …)` taking a guard input (A5);
  - which state fences a commit started on entry (A6).

  Each needs a plan sentence before the amendments are real.
