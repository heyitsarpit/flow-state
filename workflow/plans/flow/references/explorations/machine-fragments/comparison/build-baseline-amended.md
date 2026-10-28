# Baseline build, amended: plain machines plus P1–P8 and S1–S3

This is [build-baseline.md](build-baseline.md) (after its fix pass) with every amendment from
[amendments.md](amendments.md) that applies to a system without fragments: the plan-level
amendments P1–P8 and the apps.md spec fixes S1–S3. The F-items are for fragment systems and are not
used. The original file is unchanged, so the two can be compared.

Markers:

- `// AMENDMENT <id>:` marks each use of an amendment.
- `// ASSUMED:` marks where the draft syntax was ambiguous and I picked the obvious reading.
- `// FAKED:` marks workarounds that are still needed.
- `// HELPER:` marks shared plain TypeScript. It is ordinary code, not a fake.

The same conventions hold as in the original:

- **Operation names are flat** (`O.verifyCode`): Machines.plan O1 makes `operations` a flat record.
- **Every actor is local (`useActor`).** Each is one screen that nothing else sends to.

The amendments in short:

| Id | Used in | What it removed |
| --- | --- | --- |
| P1 | Issues (pins) | the descriptor re-labelling errors with the row id; "forget every pin on interrupt" |
| P2 | SignIn (verify) | the challenge fence, the verify descriptor re-labelling, the unfenceable interrupt |
| P3 | Issues (pins) | the hand-kept `pinning` map |
| P4 | Signup (Busy retry) | the `BACKING_OFF` state, the backoff schedule, the retry counter guard and `backoffMs` |
| P5 | Signup (Keep) | `returnTo`, the four-way `Keep` chain, Cancel declared per page |
| P6 | SignIn (countdowns) | the resend deadline copied into memory; the lockout deadline is still in memory, but for S1 now |
| P7 | SignIn (resend), Issues (flash) | the `resends` and `flashes` counters with `restartOn` |
| P8 | none | nothing: no `restartOn` here starts from a value the entering turn changes |
| S1 | SignIn | new behaviour: attempts and the lockout survive Back for the same challenge |
| S2 | Issues | already done by the fix pass (select-all reads the lane) |
| S3 | Issues | the refetch is there; the immediate revert cannot be done (FAKED) |

---

## Shared helpers (not fragments)

```ts
// shared/flow-helpers.ts
// Plain TypeScript shared by the apps. None of this is a Flow construct: it carries no states,
// no events, no schedules, no handlers and no namespacing.
import { useNow } from "flow-state/react";

// HELPER: "We don't know whether it happened" maps three outcomes to one event. It carries only
// the mapping. Used by SignIn (one error message) and Signup (the UNSURE state) again, now that
// P2 fences the verify and its outcomes no longer need a challenge id.
export const notSure = <Ev>(event: Ev) => ({ unknown: event, interrupt: event, defect: event });

// HELPER: a deadline from the turn's `now`. SignIn uses it once, to remember when a lockout ends
// across leaving the step (S1).
export const deadlineAfter = (now: number, ms: number) => now + ms;

// HELPER: whole seconds left before a deadline, for countdown text.
export const secondsLeft = (deadline: number | null, now: number) =>
  deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000));

// HELPER: the countdown hook. It reads Runtime Clock time through useNow, so Stories and
// StoryFrame control it (React.plan O4).
// AMENDMENT P6: the deadline it receives is now read from the schedule itself
// (`s.schedules.<name>?.dueAt`), so it can no longer drift from the timer that enforces it.
export function useSecondsLeft(deadline: number | null) {
  const now = useNow("1 second");

  return secondsLeft(deadline, now);
}

// HELPER: apps.md's whole email rule ("must contain @"), used by Signup's account page and its
// invite list.
export const looksLikeEmail = (value: string) => value.includes("@");

// AMENDMENT P4: `backoffMs` is gone; the retry schedule lives on the commit descriptor.
```

---

## 1. Two-factor sign-in

### Operations and service

*Outside the comparison: the other builds treat adapters as out of scope and omit this code. It
is written out here only because the baseline's machines reference it directly.*

```ts
// auth/auth.api.ts
import { Context, Data, Effect } from "effect";

export class WrongCode extends Data.TaggedError("WrongCode")<{}> {}
export class Expired extends Data.TaggedError("Expired")<{}> {}

export class AuthApi extends Context.Service<
  AuthApi,
  {
    verifyCode: (
      input: { challengeId: string; code: string; idempotencyKey: string },
      signal: AbortSignal,
    ) => Effect.Effect<void, WrongCode | Expired>;
    resendCode: (
      input: { challengeId: string; idempotencyKey: string },
      signal: AbortSignal,
    ) => Effect.Effect<void>;
  }
>()("Compare/AuthApi") {}
```

```ts
// auth/auth.operations.ts
import { transaction } from "flow-state";
import { AuthApi } from "./auth.api.js";

// AMENDMENT P2: a plain descriptor again. The fix pass re-labelled every outcome with the
// challenge id so the machine could ignore late answers; the fence now does that.
export const verifyCode = transaction({
  id: "Auth/verifyCode",
  key: ({ challengeId }: { challengeId: string; code: string }) => ({ challengeId }),
  commit: (input, { signal, attempt }) =>
    AuthApi.use((api) => api.verifyCode({ ...input, idempotencyKey: attempt.id }, signal)),
  concurrency: "reject", // the machine already refuses a second Submit while VERIFYING
});

export const resendCode = transaction({
  id: "Auth/resendCode",
  key: ({ challengeId }: { challengeId: string }) => ({ challengeId }),
  commit: (input, { signal, attempt }) =>
    AuthApi.use((api) => api.resendCode({ ...input, idempotencyKey: attempt.id }, signal)),
  concurrency: "allow",
});
```

### Definition

```ts
// auth/signin.definition.ts
import { Schema } from "effect";
import { definition } from "flow-state";
import { resendCode, verifyCode } from "./auth.operations.js";

export const SignIn = definition({
  id: "Compare/SignIn",
  // The resend cooldown still cannot be a state (it spans all three sub-states), but it is no
  // longer memory either: it is a schedule on TWO_FACTOR armed by the event (P7) whose deadline
  // the view and the guard read directly (P6).
  states: ["PASSWORD", { TWO_FACTOR: ["ENTERING", "VERIFYING", "LOCKED_OUT"] }, "SIGNED_IN"],
  events: {
    PasswordAccepted: { challengeId: Schema.String }, // the stubbed password step
    CodeChanged: { code: Schema.String },
    SubmitCode: {},
    ResendCode: {},
    BackToPassword: {},
  },
  internalEvents: {
    // AMENDMENT P2: outcomes carry no challenge id; fenced results cannot reach a later step.
    CodeAccepted: {},
    CodeWrong: {},
    CodeExpired: {},
    CheckFailed: {},
    LockoutEnded: {},
    ResendReady: {}, // the cooldown's firing; nothing needs to handle it (see the machine)
  },
  memory: {
    challengeId: Schema.String, // AMENDMENT S1: kept across Back, to recognise the same challenge
    code: Schema.String,
    edited: Schema.Boolean, // the format error shows only after the first edit
    wrongAttempts: Schema.Int, // AMENDMENT S1: kept across Back for the same challenge
    error: Schema.String,
    // FAKED: a deadline kept in memory. S1 says the lockout survives leaving the step, but the
    // LOCKED_OUT schedule is cancelled on exit (Machines.plan O5). The end time is written here so
    // re-entry can re-arm the schedule for the time that is left. Views read the schedule's own
    // dueAt (P6), not this copy.
    lockedUntil: Schema.NullOr(Schema.Number),
    // AMENDMENT P6, P7: resendUntil and the resends counter are gone.
  },
  initial: () => ({
    challengeId: "",
    code: "",
    edited: false,
    wrongAttempts: 0,
    error: "",
    lockedUntil: null,
  }),
  operations: { verifyCode, resendCode },
});
```

### Machine

```ts
// auth/signin.machine.ts
import { deny, machine } from "flow-state";
import { deadlineAfter, notSure } from "../shared/flow-helpers.js";
import { SignIn } from "./signin.definition.js";

type Memory = typeof SignIn.Memory.Type;

const MAX_WRONG = 3;
const LOCKOUT_MS = 5 * 60_000;
const RESEND_COOLDOWN_MS = 30_000;

// What leaving the step drops. AMENDMENT S1: the challenge, wrong attempts and lockout stay.
const leftStep = { code: "", edited: false, error: "" } satisfies Partial<Memory>;

const isSixDigits = (code: string) => /^\d{6}$/.test(code);

const challenge = ({ memory }: { memory: Memory }) => ({ challengeId: memory.challengeId });

const sameChallenge = ({ event, memory }: { event: { challengeId: string }; memory: Memory }) =>
  event.challengeId === memory.challengeId || deny("NewChallenge");

export const SignInMachine = machine(SignIn, ({ S, E, O }) => {
  // AMENDMENT P2: started by the transition into VERIFYING, so its result is fenced to that
  // activation. A late answer after Back (or after a new challenge) has no `abandoned` handler
  // and is dropped with evidence: it can never be applied to a newer attempt.
  // ASSUMED: "started in a state" means the state the starting transition enters (VERIFYING),
  // not the state whose handler declared the action (ENTERING). Under the other reading every
  // verify would be abandoned at once, since ENTERING is left in the same turn.
  const verify = O.verifyCode.commit(
    ({ memory }) => ({ challengeId: memory.challengeId, code: memory.code }),
    {
      outcomes: {
        success: E.CodeAccepted,
        failure: { WrongCode: E.CodeWrong, Expired: E.CodeExpired },
        ...notSure(E.CheckFailed), // not counted as a wrong attempt
      },
    },
  );

  // Allowed while entering and while locked out, so the same handler sits on both states.
  // FAKED: logic duplicated. The rule "resend is allowed in ENTERING and LOCKED_OUT" is kept by
  // placing one const in two `on` blocks; a third state that should allow resend has to remember.
  const resend = {
    target: "self",
    // AMENDMENT P6: the guard reads the cooldown's own deadline instead of a memory copy.
    // ASSUMED: guards receive `schedules` from the pre-turn snapshot, like `activities`; an idle
    // schedule (never armed, or fired) has no entry.
    guard: ({ schedules }: { schedules: { resendCooldown?: { dueAt: number } } }) =>
      schedules.resendCooldown === undefined || deny("ResendCoolingDown"),
    actions: [O.resendCode.commit(challenge)],
  } as const;

  return {
    default: S.PASSWORD,
    states: {
      PASSWORD: {
        on: {
          PasswordAccepted: [
            // AMENDMENT S1: the same challenge, still locked: back into the lockout for the time
            // that is left (LOCKED_OUT's schedule reads lockedUntil; if it has passed, it fires
            // at once and the step reopens with attempts reset).
            {
              target: S.TWO_FACTOR.LOCKED_OUT,
              guard: (input) =>
                sameChallenge(input) === true
                  ? input.memory.lockedUntil !== null || deny("NotLockedOut")
                  : deny("NewChallenge"),
            },
            // AMENDMENT S1: the same challenge, not locked: wrong attempts are kept.
            { target: S.TWO_FACTOR, guard: sameChallenge },
            // A new challenge starts from nothing.
            {
              target: S.TWO_FACTOR,
              updateMemory: ({ event }) => ({
                challengeId: event.challengeId,
                wrongAttempts: 0,
                lockedUntil: null,
              }),
            },
          ],
        },
      },

      TWO_FACTOR: {
        default: S.TWO_FACTOR.ENTERING,
        schedules: {
          // AMENDMENT P7: armed by an accepted ResendCode (and re-armed by the next one), so
          // the counter and restartOn are gone. Leaving the step cancels it.
          // ASSUMED: armOn on a node fires for an accepted event handled anywhere beneath it
          // (ResendCode is handled by ENTERING and LOCKED_OUT), and a refused event arms nothing.
          // AMENDMENT P6: its dueAt is the countdown and the resend guard's fact, so ResendReady
          // needs no handler: once it fires, the schedule is idle and the guard passes.
          resendCooldown: {
            schedule: RESEND_COOLDOWN_MS,
            send: E.ResendReady,
            armOn: [E.ResendCode],
          },
        },
        on: {
          // From anywhere in the step. AMENDMENT P2: a verify still in flight is simply left;
          // its fenced result is dropped.
          BackToPassword: { target: S.PASSWORD, updateMemory: () => leftStep },
        },
        states: {
          ENTERING: {
            on: {
              CodeChanged: {
                target: "self",
                updateMemory: ({ event }) => ({ code: event.code, edited: true }),
              },
              SubmitCode: {
                target: S.TWO_FACTOR.VERIFYING,
                guard: ({ memory }) => isSixDigits(memory.code) || deny("CodeIncomplete"),
                updateMemory: () => ({ error: "" }),
                actions: [verify],
              },
              ResendCode: resend,
            },
          },

          VERIFYING: {
            on: {
              CodeAccepted: S.SIGNED_IN,
              CodeWrong: [
                {
                  target: S.TWO_FACTOR.LOCKED_OUT,
                  guard: ({ memory }) =>
                    memory.wrongAttempts + 1 >= MAX_WRONG || deny("TriesLeft"),
                  updateMemory: ({ memory, now }) => ({
                    wrongAttempts: memory.wrongAttempts + 1,
                    code: "",
                    error: "",
                    lockedUntil: deadlineAfter(now, LOCKOUT_MS),
                  }),
                },
                {
                  target: S.TWO_FACTOR.ENTERING,
                  updateMemory: ({ memory }) => ({
                    wrongAttempts: memory.wrongAttempts + 1,
                    code: "",
                    error: `Wrong code, ${MAX_WRONG - (memory.wrongAttempts + 1)} tries left`,
                  }),
                },
              ],
              CodeExpired: {
                target: S.TWO_FACTOR.ENTERING,
                updateMemory: () => ({ error: "Code expired, send a new one" }),
              },
              CheckFailed: {
                target: S.TWO_FACTOR.ENTERING,
                updateMemory: () => ({ error: "Couldn't check the code, try again" }),
              },
            },
          },

          // Entry and Submit are refused simply by having no handler here.
          LOCKED_OUT: {
            schedules: {
              // The time left, from the deadline set when the lockout began. LOCKOUT_MS is used
              // once (above); the schedule derives from memory, so the two cannot drift.
              lockout: {
                schedule: ({ memory, now }) => Math.max(0, (memory.lockedUntil ?? now) - now),
                send: E.LockoutEnded,
              },
            },
            on: {
              LockoutEnded: {
                target: S.TWO_FACTOR.ENTERING,
                updateMemory: () => ({ wrongAttempts: 0, lockedUntil: null, error: "" }),
              },
              ResendCode: resend,
            },
          },
        },
      },

      SIGNED_IN: {},
    },
  };
});
```

### Components

```tsx
// auth/SignInScreen.tsx
import type { ReactNode } from "react";
import { check } from "flow-state";
import { useActor, useView } from "flow-state/react";
import { useSecondsLeft } from "../shared/flow-helpers.js";
import { SignIn } from "./signin.definition.js";
import { SignInMachine } from "./signin.machine.js";

const { S, E } = SignIn;

type SignInActor = ReturnType<typeof useSignIn>;

// Local actor: one screen, nothing else sends to it, and leaving the screen should end it.
function useSignIn() {
  return useActor(SignInMachine);
}

export function SignInScreen() {
  const signIn = useSignIn();
  const top = useView(signIn, (s) => S.root.child(s));

  const body = {
    PASSWORD: <PasswordStub signIn={signIn} />,
    TWO_FACTOR: <TwoFactorStep signIn={signIn} />,
    SIGNED_IN: <p role="status">Signed in.</p>,
  } satisfies Record<typeof top, ReactNode>;

  return <section aria-label="Sign in">{body[top]}</section>;
}

function PasswordStub({ signIn }: { signIn: SignInActor }) {
  return (
    <button onClick={() => signIn.send(E.PasswordAccepted({ challengeId: "challenge-1" }))}>
      Continue
    </button>
  );
}

function TwoFactorStep({ signIn }: { signIn: SignInActor }) {
  const step = useView(signIn, (s) => S.TWO_FACTOR.child(s));

  const status = {
    ENTERING: null,
    VERIFYING: <p role="status">Checking…</p>,
    LOCKED_OUT: <LockoutNotice signIn={signIn} />,
  } satisfies Record<NonNullable<typeof step>, ReactNode>;

  return (
    <>
      <CodeField signIn={signIn} />
      <SubmitButton signIn={signIn} />
      {step && status[step]}
      <ResendButton signIn={signIn} />
      <button onClick={() => signIn.send(E.BackToPassword())}>Back to password</button>
    </>
  );
}

function CodeField({ signIn }: { signIn: SignInActor }) {
  const code = useView(signIn, (s) => s.memory.code);
  const edited = useView(signIn, (s) => s.memory.edited);
  const error = useView(signIn, (s) => s.memory.error);
  // Whether typing is accepted comes from check, so LOCKED_OUT and VERIFYING disable the field.
  const canType = useView(signIn, (s) => check(s, E.CodeChanged({ code: "" }))._tag === "Allowed");
  // The format rule is the Submit guard's deny code, not a second copy of the regex.
  const incomplete = useView(signIn, (s) => {
    const verdict = check(s, E.SubmitCode());
    return verdict._tag === "Denied" && verdict.reasons.some((r) => r.code === "CodeIncomplete");
  });

  return (
    <label>
      Code
      <input
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        disabled={!canType}
        onChange={(event) => signIn.send(E.CodeChanged({ code: event.target.value }))}
      />
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        edited && incomplete && <p className="hint">Enter the 6-digit code.</p>
      )}
    </label>
  );
}

function SubmitButton({ signIn }: { signIn: SignInActor }) {
  const submit = useView(signIn, (s) => check(s, E.SubmitCode()));

  return (
    <button disabled={submit._tag !== "Allowed"} onClick={() => signIn.send(E.SubmitCode())}>
      Submit
    </button>
  );
}

function LockoutNotice({ signIn }: { signIn: SignInActor }) {
  // AMENDMENT P6: the countdown reads the lockout schedule's own deadline.
  const dueAt = useView(signIn, (s) => s.schedules.lockout?.dueAt ?? null);
  const seconds = useSecondsLeft(dueAt);

  return <p role="alert">Too many wrong codes. Try again in {seconds} s.</p>;
}

function ResendButton({ signIn }: { signIn: SignInActor }) {
  const resend = useView(signIn, (s) => check(s, E.ResendCode()));
  // AMENDMENT P6: the cooldown's deadline, read from the schedule.
  const dueAt = useView(signIn, (s) => s.schedules.resendCooldown?.dueAt ?? null);
  const seconds = useSecondsLeft(dueAt);

  return (
    <button disabled={resend._tag !== "Allowed"} onClick={() => signIn.send(E.ResendCode())}>
      {dueAt === null ? "Resend code" : `Resend code (${seconds} s)`}
    </button>
  );
}
```

### Story

```ts
// auth/signin.story.ts
import { Effect, Layer } from "effect";
import { story } from "flow-state/testing";
import { AuthApi, Expired, WrongCode } from "./auth.api.js";
import { SignIn } from "./signin.definition.js";
import { SignInMachine } from "./signin.machine.js";

const { E } = SignIn;

// The fake server: "123456" is right, "000000" has expired, anything else is wrong.
const AuthServer = Layer.succeed(
  AuthApi,
  AuthApi.of({
    verifyCode: ({ code }) =>
      code === "123456"
        ? Effect.void
        : code === "000000"
          ? Effect.fail(new Expired())
          : Effect.fail(new WrongCode()),
    resendCode: () => Effect.void,
  }),
);

const wrong = E.CodeChanged({ code: "111111" });

// Three wrong codes lock the step for five minutes; resend still works while locked and then
// cools down for thirty seconds; Back and the same challenge return to the lockout (S1); the
// lockout ends with attempts reset and the right code signs in.
export const lockedOut = story
  .machine(SignInMachine, { id: "signin-lockout", services: AuthServer })
  .send(E.PasswordAccepted({ challengeId: "c-1" }))
  .send(E.CodeChanged({ code: "12" }))
  .send(E.SubmitCode()) // denied: CodeIncomplete
  .process()
  .checkpoint("incomplete")
  .send(wrong)
  .send(E.SubmitCode())
  .process()
  .checkpoint("two-tries-left")
  .send(wrong)
  .send(E.SubmitCode())
  .process()
  .send(wrong)
  .send(E.SubmitCode())
  .process()
  .checkpoint("locked-out") // LOCKED_OUT; schedules.lockout.dueAt = now + 300 000
  .send(E.CodeChanged({ code: "123456" })) // refused: no handler in LOCKED_OUT
  .send(E.ResendCode()) // allowed while locked out; arms the cooldown
  .process()
  .advance("29 seconds")
  .send(E.ResendCode()) // refused: ResendCoolingDown
  .process()
  .checkpoint("resend-cooling") // schedules.resendCooldown.dueAt 1 s away
  .advance("1 second")
  .process()
  .checkpoint("resend-ready") // no resendCooldown entry
  .send(E.BackToPassword())
  .send(E.PasswordAccepted({ challengeId: "c-1" })) // S1: the same challenge is still locked
  .process()
  .checkpoint("still-locked-after-back") // LOCKED_OUT, 270 s left, wrongAttempts 3
  .advance("270 seconds")
  .process()
  .checkpoint("lockout-over") // ENTERING, wrongAttempts 0
  .send(E.CodeChanged({ code: "123456" }))
  .send(E.SubmitCode())
  .process()
  .checkpoint("signed-in");
```

---

## 2. Signup wizard

### Operations and service

*Outside the comparison: the other builds treat adapters as out of scope and omit this code. It
is written out here only because the baseline's machines reference it directly.*

```ts
// signup/accounts.api.ts
import { Context, Data, Effect, Schema } from "effect";

export const Role = Schema.Literals(["engineer", "designer", "manager"]);
export type Role = typeof Role.Type;

export class EmailTaken extends Data.TaggedError("EmailTaken")<{}> {}
export class Busy extends Data.TaggedError("Busy")<{}> {}

export type CreateAccount = {
  email: string;
  password: string;
  name: string;
  role: Role;
  invites: ReadonlyArray<string>;
};

export class AccountsApi extends Context.Service<
  AccountsApi,
  {
    create: (
      input: CreateAccount & { idempotencyKey: string },
      signal: AbortSignal,
    ) => Effect.Effect<{ userId: string }, EmailTaken | Busy>;
  }
>()("Compare/AccountsApi") {}
```

```ts
// signup/accounts.operations.ts
import { Schedule } from "effect";
import { transaction } from "flow-state";
import { AccountsApi, type CreateAccount } from "./accounts.api.js";

export const createAccount = transaction({
  id: "Accounts/create",
  key: ({ email }: CreateAccount) => ({ email }),
  commit: (input, { signal, attempt }) =>
    AccountsApi.use((api) => api.create({ ...input, idempotencyKey: attempt.id }, signal)),
  concurrency: "reject",
  // AMENDMENT P4: Busy is retried after 1 s, 2 s and 4 s with the same input. unknown,
  // interrupt and defect are never retried. When the third retry is also Busy, the commit's
  // outcome is the Busy failure.
  // ASSUMED: every retry reuses this commit's Attempt (and so its idempotency key); it is one
  // admitted commit that delivers one final outcome.
  retry: {
    on: ["Busy"],
    schedule: Schedule.exponential("1 second").pipe(Schedule.recurs(3)),
  },
});
```

### Definition

```ts
// signup/signup.definition.ts
import { Schema } from "effect";
import { definition } from "flow-state";
import { Role } from "./accounts.api.js";
import { createAccount } from "./accounts.operations.js";

export const Signup = definition({
  id: "Compare/Signup",
  states: [
    { WIZARD: ["ACCOUNT", "PROFILE", "INVITE", "REVIEW"] },
    "CONFIRM_DISCARD", // outside WIZARD, so Next and Back are refused while the dialog is open
    "SUBMITTING", // AMENDMENT P4: a leaf; the backoff lives in the descriptor's retry policy
    "DONE",
    "CANCELLED",
    "UNSURE",
  ],
  events: {
    EmailChanged: { email: Schema.String },
    PasswordChanged: { password: Schema.String },
    NameChanged: { name: Schema.String },
    RoleChanged: { role: Role },
    InviteAdded: {},
    InviteRemoved: { index: Schema.Int },
    InviteChanged: { index: Schema.Int, email: Schema.String },
    Next: {},
    Back: {},
    Cancel: {},
    Discard: {},
    Keep: {},
    Submit: {},
  },
  internalEvents: {
    Created: {},
    EmailWasTaken: {},
    TryLater: {}, // Busy after the last retry
    Retrying: { n: Schema.Int }, // AMENDMENT P4: reported before each automatic retry
    MaybeCreated: {},
  },
  memory: {
    email: Schema.String,
    password: Schema.String,
    name: Schema.String,
    role: Schema.NullOr(Role),
    invites: Schema.Array(Schema.String),
    error: Schema.String,
    retry: Schema.Int, // the "n" in "Server busy, retrying (n/3)"; 0 while not retrying
    // AMENDMENT P5: returnTo is gone; Keep targets WIZARD's history.
  },
  initial: () => ({
    email: "",
    password: "",
    name: "",
    role: null,
    invites: [],
    error: "",
    retry: 0,
  }),
  operations: { createAccount },
});
```

### Machine

```ts
// signup/signup.machine.ts
import { deny, machine } from "flow-state";
import { looksLikeEmail, notSure } from "../shared/flow-helpers.js";
import { Signup } from "./signup.definition.js";

type Memory = typeof Signup.Memory.Type;

const MIN_PASSWORD = 12;
const MAX_INVITES = 5;

// Page validity, as guards: Next is refused with a code the view can explain.
const accountValid = ({ memory }: { memory: Memory }) => {
  if (!looksLikeEmail(memory.email)) return deny("EmailInvalid");

  if (memory.password.length < MIN_PASSWORD)
    return deny("PasswordTooShort", { min: MIN_PASSWORD });

  return true;
};

const profileValid = ({ memory }: { memory: Memory }) => {
  if (memory.name.trim() === "") return deny("NameRequired");

  if (memory.role === null) return deny("RoleRequired");

  return true;
};

const invitesValid = ({ memory }: { memory: Memory }) => {
  const bad = memory.invites.findIndex((e) => e !== "" && !looksLikeEmail(e));
  return bad === -1 || deny("InviteInvalid", { index: bad });
};

export const SignupMachine = machine(Signup, ({ S, E, O }) => {
  // One commit, started once from REVIEW's Submit. AMENDMENT P4: its retries resend this same
  // input, so nothing typed later can leak into a retry.
  const create = O.createAccount.commit(
    ({ memory }) => ({
      email: memory.email,
      password: memory.password,
      name: memory.name,
      // Review's Submit is only reachable through PROFILE's guard, so role is set here.
      // FAKED: a rule kept by convention. Memory cannot narrow by state, so the non-null
      // assertion relies on the page order rather than on a type.
      role: memory.role!,
      invites: memory.invites,
    }),
    {
      outcomes: {
        success: E.Created,
        failure: { EmailTaken: E.EmailWasTaken, Busy: E.TryLater },
        // AMENDMENT P4: one report per retry. ASSUMED: `attempt` is the 1-based retry number.
        retrying: E.Retrying.from(({ attempt }) => ({ n: attempt })),
        ...notSure(E.MaybeCreated), // AMENDMENT P4: the policy never retries these
      },
    },
  );

  return {
    default: S.WIZARD,
    states: {
      WIZARD: {
        default: S.WIZARD.ACCOUNT,
        // AMENDMENT P5: Cancel is declared once, for every page; the page is remembered by the
        // history target below, not by memory.
        on: { Cancel: S.CONFIRM_DISCARD },
        states: {
          ACCOUNT: {
            on: {
              EmailChanged: {
                target: "self",
                updateMemory: ({ event }) => ({ email: event.email, error: "" }),
              },
              PasswordChanged: {
                target: "self",
                updateMemory: ({ event }) => ({ password: event.password }),
              },
              Next: { target: S.WIZARD.PROFILE, guard: accountValid },
            },
          },

          PROFILE: {
            on: {
              NameChanged: { target: "self", updateMemory: ({ event }) => ({ name: event.name }) },
              RoleChanged: { target: "self", updateMemory: ({ event }) => ({ role: event.role }) },
              Next: { target: S.WIZARD.INVITE, guard: profileValid },
              Back: S.WIZARD.ACCOUNT,
            },
          },

          INVITE: {
            on: {
              InviteAdded: {
                target: "self",
                guard: ({ memory }) =>
                  memory.invites.length < MAX_INVITES || deny("TooManyInvites"),
                updateMemory: ({ memory }) => ({ invites: [...memory.invites, ""] }),
              },
              InviteRemoved: {
                target: "self",
                updateMemory: ({ event, memory }) => ({
                  invites: memory.invites.filter((_, i) => i !== event.index),
                }),
              },
              InviteChanged: {
                target: "self",
                updateMemory: ({ event, memory }) => ({
                  invites: memory.invites.map((e, i) => (i === event.index ? event.email : e)),
                }),
              },
              Next: {
                target: S.WIZARD.REVIEW,
                guard: invitesValid,
                updateMemory: ({ memory }) => ({ invites: memory.invites.filter((e) => e !== "") }),
              },
              Back: S.WIZARD.PROFILE,
            },
          },

          REVIEW: {
            on: {
              Submit: {
                target: S.SUBMITTING,
                updateMemory: () => ({ error: "", retry: 0 }),
                actions: [create],
              },
              Back: S.WIZARD.INVITE,
            },
          },
        },
      },

      CONFIRM_DISCARD: {
        on: {
          Discard: S.CANCELLED,
          // AMENDMENT P5: back to the page Cancel was pressed on, drafts intact.
          // ASSUMED: WIZARD.history with no recorded child enters WIZARD's default; it cannot
          // happen here, since CONFIRM_DISCARD is only entered from inside WIZARD.
          Keep: S.WIZARD.history,
        },
      },

      // Cancel is refused here by having no handler. AMENDMENT P2: the commit is fenced to this
      // activation, which only its own outcomes end.
      SUBMITTING: {
        on: {
          Retrying: { target: "self", updateMemory: ({ event }) => ({ retry: event.n }) },
          Created: S.DONE,
          EmailWasTaken: {
            target: S.WIZARD.ACCOUNT,
            updateMemory: () => ({ error: "That email is registered", retry: 0 }),
          },
          TryLater: {
            target: S.WIZARD.REVIEW,
            updateMemory: () => ({ error: "Try again later", retry: 0 }),
          },
          MaybeCreated: S.UNSURE,
        },
      },

      DONE: {},
      CANCELLED: {},
      UNSURE: {},
    },
  };
});
```

### Components

```tsx
// signup/SignupScreen.tsx
import type { ReactNode } from "react";
import { check } from "flow-state";
import { useActor, useView } from "flow-state/react";
import { Role } from "./accounts.api.js";
import { Signup } from "./signup.definition.js";
import { SignupMachine } from "./signup.machine.js";

const { S, E } = Signup;

type SignupActor = ReturnType<typeof useSignup>;

// Local actor: the wizard belongs to this screen; leaving it should discard the drafts.
function useSignup() {
  return useActor(SignupMachine);
}

export function SignupScreen() {
  const signup = useSignup();
  const top = useView(signup, (s) => S.root.child(s));

  const body = {
    WIZARD: <Wizard signup={signup} />,
    CONFIRM_DISCARD: <DiscardDialog signup={signup} />,
    SUBMITTING: <Submitting signup={signup} />,
    DONE: <p role="status">Welcome aboard. Check your email.</p>,
    CANCELLED: <p role="status">Signup discarded.</p>,
    UNSURE: <p role="status">Your account may have been created; check your email.</p>,
  } satisfies Record<typeof top, ReactNode>;

  return <section aria-label="Sign up">{body[top]}</section>;
}

function Wizard({ signup }: { signup: SignupActor }) {
  const page = useView(signup, (s) => S.WIZARD.child(s));

  const body = {
    ACCOUNT: <AccountPage signup={signup} />,
    PROFILE: <ProfilePage signup={signup} />,
    INVITE: <InvitePage signup={signup} />,
    REVIEW: <ReviewPage signup={signup} />,
  } satisfies Record<NonNullable<typeof page>, ReactNode>;

  return (
    <>
      {page && body[page]}
      <Nav signup={signup} />
    </>
  );
}

const nextHints = new Map([
  ["EmailInvalid", "Enter an email address."],
  ["PasswordTooShort", "Passwords need at least 12 characters."],
  ["NameRequired", "Enter your name."],
  ["RoleRequired", "Choose a role."],
  ["InviteInvalid", "Every teammate email needs an @."],
]);

function Nav({ signup }: { signup: SignupActor }) {
  const next = useView(signup, (s) => check(s, E.Next()));
  const back = useView(signup, (s) => check(s, E.Back())._tag === "Allowed");
  const error = useView(signup, (s) => s.memory.error);
  const hint =
    next._tag === "Denied"
      ? next.reasons.map((r) => nextHints.get(r.code)).find(Boolean)
      : undefined;

  return (
    <footer>
      {error && <p role="alert">{error}</p>}
      {hint && <p className="hint">{hint}</p>}
      {back && <button onClick={() => signup.send(E.Back())}>Back</button>}
      {next._tag !== "Unhandled" && (
        <button disabled={next._tag !== "Allowed"} onClick={() => signup.send(E.Next())}>
          Next
        </button>
      )}
      <button onClick={() => signup.send(E.Cancel())}>Cancel</button>
    </footer>
  );
}

function AccountPage({ signup }: { signup: SignupActor }) {
  const email = useView(signup, (s) => s.memory.email);
  const password = useView(signup, (s) => s.memory.password);

  return (
    <>
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => signup.send(E.EmailChanged({ email: e.target.value }))}
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => signup.send(E.PasswordChanged({ password: e.target.value }))}
        />
      </label>
    </>
  );
}

function ProfilePage({ signup }: { signup: SignupActor }) {
  const name = useView(signup, (s) => s.memory.name);
  const role = useView(signup, (s) => s.memory.role);

  return (
    <>
      <label>
        Name
        <input value={name} onChange={(e) => signup.send(E.NameChanged({ name: e.target.value }))} />
      </label>
      <label>
        Role
        <select
          value={role ?? ""}
          onChange={(e) => {
            const value = e.target.value;
            if (Role.is(value)) signup.send(E.RoleChanged({ role: value }));
          }}
        >
          <option value="" disabled>
            Choose…
          </option>
          <option value="engineer">Engineer</option>
          <option value="designer">Designer</option>
          <option value="manager">Manager</option>
        </select>
      </label>
    </>
  );
}

function InvitePage({ signup }: { signup: SignupActor }) {
  const invites = useView(signup, (s) => s.memory.invites);
  const canAdd = useView(signup, (s) => check(s, E.InviteAdded())._tag === "Allowed");

  return (
    <>
      {invites.map((email, index) => (
        <div key={index}>
          <input
            type="email"
            value={email}
            onChange={(e) => signup.send(E.InviteChanged({ index, email: e.target.value }))}
          />
          <button onClick={() => signup.send(E.InviteRemoved({ index }))}>Remove</button>
        </div>
      ))}
      <button disabled={!canAdd} onClick={() => signup.send(E.InviteAdded())}>
        Add teammate
      </button>
    </>
  );
}

function ReviewPage({ signup }: { signup: SignupActor }) {
  const memory = useView(signup, (s) => s.memory);

  return (
    <>
      <dl>
        <dt>Email</dt>
        <dd>{memory.email}</dd>
        <dt>Name</dt>
        <dd>{memory.name}</dd>
        <dt>Role</dt>
        <dd>{memory.role}</dd>
        <dt>Teammates</dt>
        <dd>{memory.invites.length === 0 ? "None" : memory.invites.join(", ")}</dd>
      </dl>
      <button onClick={() => signup.send(E.Submit())}>Submit</button>
    </>
  );
}

function DiscardDialog({ signup }: { signup: SignupActor }) {
  return (
    <div role="alertdialog" aria-label="Discard your signup?">
      <p>Discard your signup?</p>
      <button onClick={() => signup.send(E.Discard())}>Discard</button>
      <button onClick={() => signup.send(E.Keep())}>Keep</button>
    </div>
  );
}

function Submitting({ signup }: { signup: SignupActor }) {
  const retry = useView(signup, (s) => s.memory.retry);

  return (
    <p role="status">
      {retry === 0 ? "Creating your account…" : `Server busy, retrying (${retry}/3)`}
    </p>
  );
}
```

### Story

```ts
// signup/signup.story.ts
import { Effect, Layer, Ref } from "effect";
import { story } from "flow-state/testing";
import { AccountsApi, Busy } from "./accounts.api.js";
import { Signup } from "./signup.definition.js";
import { SignupMachine } from "./signup.machine.js";

const { E } = Signup;

// Busy for the first two calls, then created: the third call is the second retry.
const BusyTwice = Layer.effect(
  AccountsApi,
  Effect.gen(function* () {
    const calls = yield* Ref.make(0);
    return AccountsApi.of({
      create: () =>
        Ref.updateAndGet(calls, (n) => n + 1).pipe(
          Effect.flatMap((n) => (n <= 2 ? Effect.fail(new Busy()) : Effect.succeed({ userId: "u-1" }))),
        ),
    });
  }),
);

// Fill every page, cancel and keep on Invite (drafts intact), drop the empty invite on Next,
// submit, retry after 1 s then 2 s through two Busy answers, and land in DONE.
export const signedUp = story
  .machine(SignupMachine, { id: "signup-busy-twice", services: BusyTwice })
  .send(E.EmailChanged({ email: "ada@example.com" }))
  .send(E.PasswordChanged({ password: "short" }))
  .send(E.Next()) // denied: PasswordTooShort
  .send(E.PasswordChanged({ password: "correct horse battery" }))
  .send(E.Next())
  .send(E.NameChanged({ name: "Ada" }))
  .send(E.RoleChanged({ role: "engineer" }))
  .send(E.Next())
  .send(E.InviteAdded())
  .send(E.InviteChanged({ index: 0, email: "bob@example.com" }))
  .send(E.InviteAdded()) // left empty; dropped on Next
  .send(E.Cancel())
  .process()
  .checkpoint("confirm-discard")
  .send(E.Keep()) // WIZARD.history: back to INVITE
  .process()
  .checkpoint("kept-invite") // WIZARD.INVITE with both invite fields still there
  .send(E.Next())
  .send(E.Submit())
  .process()
  .checkpoint("busy-1") // SUBMITTING, retry 1: "Server busy, retrying (1/3)"; 1 s pending
  .send(E.Cancel()) // refused while submitting
  .advance("1 second")
  .process()
  .checkpoint("busy-2") // second Busy: retry 2, 2 s pending
  .advance("2 seconds")
  .process()
  .checkpoint("done"); // DONE, invites ["bob@example.com"]
```

---

## 3. Issue list screen

### Operations and service

*Outside the comparison: the other builds treat adapters as out of scope and omit this code. It
is written out here only because the baseline's machines reference it directly.*

```ts
// issues/issues.api.ts
import { Context, Data, Effect, Schema } from "effect";

export const Issue = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  status: Schema.Literals(["open", "closed"]),
  pinned: Schema.Boolean,
});
export type Issue = typeof Issue.Type;

export const IssuePage = Schema.Struct({ items: Schema.Array(Issue), total: Schema.Int });
export type IssuePage = typeof IssuePage.Type;

export const SortField = Schema.Literals(["updated", "title"]);
export const SortDir = Schema.Literals(["asc", "desc"]);
export const StatusFilter = Schema.Literals(["open", "closed", "all"]);

export type IssueQuery = {
  search: string;
  sort: { field: typeof SortField.Type; dir: typeof SortDir.Type };
  status: typeof StatusFilter.Type;
  page: number;
};

export const PAGE_SIZE = 20;

export class PinRefused extends Data.TaggedError("PinRefused")<{}> {}
export class DeleteRefused extends Data.TaggedError("DeleteRefused")<{}> {}

export class IssuesApi extends Context.Service<
  IssuesApi,
  {
    list: (query: IssueQuery, signal: AbortSignal) => Effect.Effect<IssuePage>;
    setPinned: (
      input: { id: string; pinned: boolean; idempotencyKey: string },
      signal: AbortSignal,
    ) => Effect.Effect<void, PinRefused>;
    deleteMany: (
      input: { ids: ReadonlyArray<string>; idempotencyKey: string },
      signal: AbortSignal,
    ) => Effect.Effect<void, DeleteRefused>;
  }
>()("Compare/IssuesApi") {}
```

```ts
// issues/issues.operations.ts
import { resource, transaction } from "flow-state";
import { IssuePage, IssuesApi, type IssueQuery } from "./issues.api.js";

export const listIssues = resource({
  id: "Issues/list",
  key: ({ search, sort, status, page }: IssueQuery) => ({ search, sort, status, page }),
  lookup: (query, { signal }) => IssuesApi.use((api) => api.list(query, signal)),
  result: IssuePage,
  staleTime: "30 seconds",
  gcTime: "2 minutes",
});

// AMENDMENT P1: a plain descriptor again. The fix pass re-labelled every failure and defect with
// the row id; outcome mappers now receive the call's input.
export const setPinned = transaction({
  id: "Issues/setPinned",
  key: ({ id }: { id: string; pinned: boolean }) => ({ id }),
  commit: (input, { signal, attempt }) =>
    IssuesApi.use((api) => api.setPinned({ ...input, idempotencyKey: attempt.id }, signal)),
  concurrency: "reject", // per row; the machine's guard (P3) refuses first so check() sees it
});

export const deleteMany = transaction({
  id: "Issues/deleteMany",
  commit: (input: { ids: ReadonlyArray<string> }, { signal, attempt }) =>
    IssuesApi.use((api) => api.deleteMany({ ...input, idempotencyKey: attempt.id }, signal)),
  concurrency: "reject",
});
```

### Definition

```ts
// issues/issueList.definition.ts
import { Schema } from "effect";
import { definition } from "flow-state";
import { SortDir, SortField, StatusFilter } from "./issues.api.js";
import { deleteMany, listIssues, setPinned } from "./issues.operations.js";

export const IssueList = definition({
  id: "Compare/IssueList",
  // The one state tree goes to bulk delete, the only concern with a sequence (hold, then delete).
  // Five concerns overlap it and each other, and exactly one leaf is active, so none can be a
  // state:
  //   search debounce  searchDraft + search, root schedule `search` (restartOn searchDraft)
  //   selection        selected, cleared by the queryChanged patch in every query handler
  //   pins in flight   AMENDMENT P3: no memory; guards ask setPinned.pending
  //   flash            flash, root schedule `flashExpiry` armed by the flashing events (P7)
  //   polling          no memory, root schedule `poll`
  states: ["IDLE", "HOLDING", "DELETING"],
  events: {
    SearchTyped: { text: Schema.String },
    SortChanged: { field: SortField, dir: SortDir },
    StatusChanged: { status: StatusFilter },
    NextPage: {},
    PreviousPage: {},
    RowToggled: { id: Schema.String },
    PageSelected: {}, // AMENDMENT S2: the ids come from the list the actor holds
    SelectionCleared: {},
    PinClicked: { id: Schema.String, pinned: Schema.Boolean },
    HoldStarted: {},
    HoldReleased: {},
  },
  internalEvents: {
    SearchSettled: {},
    PollDue: {},
    FlashExpired: {},
    PinSucceeded: { id: Schema.String },
    PinFailed: { id: Schema.String }, // AMENDMENT P1: every non-success outcome names its row
    HoldCompleted: {},
    Deleted: {},
    DeleteFailed: {},
    DeleteMaybe: {},
  },
  memory: {
    searchDraft: Schema.String, // what the box shows
    search: Schema.String, // what the query uses, 300 ms later
    sortField: SortField,
    sortDir: SortDir,
    status: StatusFilter,
    page: Schema.Int,
    selected: Schema.Array(Schema.String),
    // FAKED: a mode kept in memory. The flash is "showing" while non-empty. P7 removed its
    // restart counter, but a 3-second message is still not a state, because HOLDING/DELETING
    // own the leaf.
    flash: Schema.String,
    // AMENDMENT P3: `pinning` is gone. AMENDMENT P7: `flashes` is gone.
  },
  initial: () => ({
    searchDraft: "",
    search: "",
    sortField: "updated" as const,
    sortDir: "desc" as const,
    status: "open" as const,
    page: 1,
    selected: [],
    flash: "",
  }),
  operations: { listIssues, setPinned, deleteMany },
});
```

### Machine

```ts
// issues/issueList.machine.ts
import { Schedule } from "effect";
import { deny, machine } from "flow-state";
import { PAGE_SIZE, type IssuePage, type IssueQuery } from "./issues.api.js";
import { IssueList } from "./issueList.definition.js";

type Memory = typeof IssueList.Memory.Type;
type Lanes = { issues?: { data?: IssuePage } };

const HOLD_MS = 1_500;
const FLASH_MS = 3_000;

const query = ({ memory }: { memory: Memory }): IssueQuery => ({
  search: memory.search,
  sort: { field: memory.sortField, dir: memory.sortDir },
  status: memory.status,
  page: memory.page,
});

// FAKED: a rule kept by convention. "Selection is cleared whenever the query changes" is not a
// rule the machine states; every handler that changes search, sort, status or page spreads this
// patch, and a new query-changing handler that forgets it keeps a stale selection. No amendment
// adds a reaction to memory changes.
const queryChanged = { selected: [] as ReadonlyArray<string> };
const backToFirstPage = { ...queryChanged, page: 1 };

const hasNextPage = ({ memory, activities }: { memory: Memory; activities: Lanes }) => {
  const total = activities.issues?.data?.total;
  return (total !== undefined && memory.page * PAGE_SIZE < total) || deny("LastPage");
};

const hasSelection = ({ memory }: { memory: Memory }) =>
  memory.selected.length > 0 || deny("NothingSelected");

const rows = ({ activities }: { activities: Lanes }) => activities.issues?.data?.items ?? [];

// AMENDMENT S2: selection is built from the rows the actor itself shows, so a stale click from an
// earlier page or query can never select (and then delete) a row that is not on screen.
const rowIds = (input: { activities: Lanes }) => rows(input).map((issue) => issue.id);

const onThisPage = ({ event, activities }: { event: { id: string }; activities: Lanes }) =>
  rowIds({ activities }).includes(event.id) || deny("NotOnPage");

// FAKED: the flash names the row from the list lane, because the commit's input is { id, pinned }
// and has no title. If the row has left the page (paged, searched) by the time the pin fails, the
// message falls back to "the issue".
const titleOf = (input: { activities: Lanes }, id: string) =>
  rows(input).find((issue) => issue.id === id)?.title ?? "the issue";

export const IssueListMachine = machine(IssueList, ({ S, E, O }) => {
  const refetch = O.listIssues.refetch(query);

  // AMENDMENT P1: every outcome mapper reads the call's input, so each names its own row.
  const pinOutcome = E.PinFailed.from((_: unknown, { input }: { input: { id: string } }) => ({
    id: input.id,
  }));

  return {
    default: S.IDLE,

    activities: { issues: O.listIssues.subscribe(query) },

    schedules: {
      // Debounce: idle until the draft changes, restarted by every keystroke. P8 changes nothing
      // here: the entry baseline is the initial draft either way.
      search: {
        schedule: "300 millis",
        send: E.SearchSettled,
        restartOn: ({ memory }) => memory.searchDraft,
      },
      poll: { schedule: Schedule.spaced("30 seconds"), send: E.PollDue },
      // AMENDMENT P7: armed (and re-armed) by each event that shows a flash; no counter.
      // ASSUMED: armOn accepts internal events, and arms only when the event's transition is
      // accepted.
      flashExpiry: {
        schedule: FLASH_MS,
        send: E.FlashExpired,
        armOn: [E.PinFailed, E.DeleteFailed, E.DeleteMaybe],
      },
    },

    // Everything that is not bulk delete is declared once, at the root, and works in every state.
    on: {
      SearchTyped: { target: "self", updateMemory: ({ event }) => ({ searchDraft: event.text }) },
      SearchSettled: {
        target: "self",
        guard: ({ memory }) => memory.searchDraft !== memory.search || deny("SearchUnchanged"),
        updateMemory: ({ memory }) => ({ search: memory.searchDraft, ...backToFirstPage }),
      },
      SortChanged: {
        target: "self",
        updateMemory: ({ event }) => ({
          sortField: event.field,
          sortDir: event.dir,
          ...backToFirstPage,
        }),
      },
      StatusChanged: {
        target: "self",
        updateMemory: ({ event }) => ({ status: event.status, ...backToFirstPage }),
      },
      NextPage: {
        target: "self",
        guard: hasNextPage,
        updateMemory: ({ memory }) => ({ page: memory.page + 1, ...queryChanged }),
      },
      PreviousPage: {
        target: "self",
        guard: ({ memory }) => memory.page > 1 || deny("FirstPage"),
        updateMemory: ({ memory }) => ({ page: memory.page - 1, ...queryChanged }),
      },
      PollDue: { target: "self", actions: [refetch] },

      RowToggled: {
        target: "self",
        guard: onThisPage,
        updateMemory: ({ event, memory }) => ({
          selected: memory.selected.includes(event.id)
            ? memory.selected.filter((id) => id !== event.id)
            : [...memory.selected, event.id],
        }),
      },
      // updateMemory reads the pre-turn snapshot (Machines.plan O3), lanes included.
      PageSelected: {
        target: "self",
        guard: (input) => rowIds(input).length > 0 || deny("EmptyPage"),
        updateMemory: (input) => ({ selected: rowIds(input) }),
      },
      SelectionCleared: { target: "self", updateMemory: () => ({ selected: [] }) },

      // Optimistic per row: the list entry shows the new value at once and Flow removes the
      // optimistic layer itself on failure, defect and interrupt, so the row reverts.
      PinClicked: {
        target: "self",
        // AMENDMENT P3: refused while this row's pin is outstanding; check() sees it, and pins on
        // other rows are unaffected.
        // ASSUMED: a guard's input can be passed where `pending` expects a snapshot; it is the
        // pre-turn snapshot plus the event.
        guard: (s) => !O.setPinned.pending(s, { id: s.event.id }) || deny("PinInFlight"),
        actions: [
          O.setPinned.commit(({ event }) => ({ id: event.id, pinned: event.pinned }), {
            optimistic: O.listIssues.setData(({ event, memory }) => ({
              key: query({ memory }),
              data: (page) =>
                page && {
                  ...page,
                  items: page.items.map((issue) =>
                    issue.id === event.id ? { ...issue, pinned: event.pinned } : issue,
                  ),
                },
            })),
            outcomes: {
              success: E.PinSucceeded.from((_, { input }) => ({ id: input.id })),
              failure: { PinRefused: pinOutcome },
              defect: pinOutcome,
              interrupt: pinOutcome, // AMENDMENT P1: attributable now
              // AMENDMENT S3: an unknown pin flashes and refetches like any failure.
              // FAKED: cannot fix in this system. S3 also says the row reverts at once, but
              // Operations.plan O5 keeps an unknown commit's optimistic value until a confirming
              // lookup lands, and no amendment lets a handler drop it. The row shows the pin until
              // the refetch below answers. It needs an action that removes one commit's
              // optimistic layer.
              unknown: pinOutcome,
            },
          }),
        ],
      },
      PinSucceeded: { target: "self", actions: [refetch] }, // a lookup confirms the pin
      PinFailed: {
        target: "self",
        updateMemory: (input) => ({ flash: `Couldn't pin ${titleOf(input, input.event.id)}` }),
        actions: [refetch],
      },
      FlashExpired: { target: "self", updateMemory: () => ({ flash: "" }) },
    },

    states: {
      IDLE: {
        on: { HoldStarted: { target: S.HOLDING, guard: hasSelection } },
      },

      // Releasing early leaves HOLDING, which cancels the schedule: nothing to clean up.
      HOLDING: {
        schedules: { hold: { schedule: HOLD_MS, send: E.HoldCompleted } },
        on: {
          HoldReleased: S.IDLE,
          HoldCompleted: [
            {
              target: S.DELETING,
              // The query may have changed during the hold and cleared the selection.
              guard: hasSelection,
              actions: [
                O.deleteMany.commit(({ memory }) => ({ ids: memory.selected }), {
                  outcomes: {
                    success: E.Deleted,
                    failure: { DeleteRefused: E.DeleteFailed },
                    defect: E.DeleteFailed,
                    interrupt: E.DeleteFailed,
                    unknown: E.DeleteMaybe,
                  },
                }),
              ],
            },
            { target: S.IDLE },
          ],
        },
      },

      // HoldStarted has no handler here, so a second delete is refused while one runs.
      DELETING: {
        on: {
          Deleted: { target: S.IDLE, updateMemory: () => ({ selected: [] }), actions: [refetch] },
          DeleteFailed: { target: S.IDLE, updateMemory: () => ({ flash: "Delete failed" }) },
          DeleteMaybe: {
            target: S.IDLE,
            updateMemory: () => ({ flash: "Delete may have happened" }),
            actions: [refetch],
          },
        },
      },
    },
  };
});
```

### Components

```tsx
// issues/IssueListScreen.tsx
import { check } from "flow-state";
import { useActor, useView } from "flow-state/react";
import type { Issue } from "./issues.api.js";
import { IssueList } from "./issueList.definition.js";
import { IssueListMachine } from "./issueList.machine.js";

const { S, E } = IssueList;

type IssueListActor = ReturnType<typeof useIssueList>;

// Local actor: "an IssueList actor for one screen". Its polling and debounce should stop when the
// screen unmounts, which is exactly local disposal after grace (React.plan O3).
function useIssueList() {
  return useActor(IssueListMachine);
}

export function IssueListScreen() {
  const issues = useIssueList();
  const flash = useView(issues, (s) => s.memory.flash);

  return (
    <section aria-label="Issues">
      <Toolbar issues={issues} />
      {flash && <p role="status">{flash}</p>}
      <IssueTable issues={issues} />
      <Pager issues={issues} />
      <HoldToDelete issues={issues} />
    </section>
  );
}

function Toolbar({ issues }: { issues: IssueListActor }) {
  const searchDraft = useView(issues, (s) => s.memory.searchDraft);
  const sort = useView(issues, (s) => `${s.memory.sortField}:${s.memory.sortDir}`);
  const status = useView(issues, (s) => s.memory.status);

  return (
    <div className="toolbar">
      <input
        type="search"
        placeholder="Search issues"
        value={searchDraft}
        onChange={(e) => issues.send(E.SearchTyped({ text: e.target.value }))}
      />
      <select
        value={sort}
        onChange={(e) => {
          const [field, dir] = e.target.value.split(":") as ["updated" | "title", "asc" | "desc"];
          issues.send(E.SortChanged({ field, dir }));
        }}
      >
        <option value="updated:desc">Recently updated</option>
        <option value="updated:asc">Least recently updated</option>
        <option value="title:asc">Title A–Z</option>
        <option value="title:desc">Title Z–A</option>
      </select>
      <select
        value={status}
        onChange={(e) => {
          const value = e.target.value as "open" | "closed" | "all";
          issues.send(E.StatusChanged({ status: value }));
        }}
      >
        <option value="open">Open</option>
        <option value="closed">Closed</option>
        <option value="all">All</option>
      </select>
    </div>
  );
}

function IssueTable({ issues }: { issues: IssueListActor }) {
  const lane = useView(issues, (s) => s.activities.issues);
  const selected = useView(issues, (s) => s.memory.selected);
  const rows = lane?.data?.items ?? [];
  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row.id));

  if (lane === undefined || (lane._tag === "Pending" && lane.data === undefined)) {
    return <p role="status">Loading…</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>
            <input
              type="checkbox"
              aria-label="Select all on this page"
              checked={allSelected}
              onChange={() =>
                issues.send(allSelected ? E.SelectionCleared() : E.PageSelected())
              }
            />
          </th>
          <th>Title</th>
          <th>Status</th>
          <th>Pin</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <IssueRow key={row.id} issues={issues} row={row} checked={selected.includes(row.id)} />
        ))}
      </tbody>
    </table>
  );
}

function IssueRow({
  issues,
  row,
  checked,
}: {
  issues: IssueListActor;
  row: Issue;
  checked: boolean;
}) {
  // row.pinned already includes the optimistic value; check() refuses a second click in flight.
  const pin = E.PinClicked({ id: row.id, pinned: !row.pinned });
  const canPin = useView(issues, (s) => check(s, pin)._tag === "Allowed");

  return (
    <tr>
      <td>
        <input
          type="checkbox"
          aria-label={`Select ${row.title}`}
          checked={checked}
          onChange={() => issues.send(E.RowToggled({ id: row.id }))}
        />
      </td>
      <td>{row.title}</td>
      <td>{row.status}</td>
      <td>
        <button aria-pressed={row.pinned} disabled={!canPin} onClick={() => issues.send(pin)}>
          {row.pinned ? "Unpin" : "Pin"}
        </button>
      </td>
    </tr>
  );
}

function Pager({ issues }: { issues: IssueListActor }) {
  const page = useView(issues, (s) => s.memory.page);
  const canPrev = useView(issues, (s) => check(s, E.PreviousPage())._tag === "Allowed");
  const canNext = useView(issues, (s) => check(s, E.NextPage())._tag === "Allowed");

  return (
    <nav aria-label="Pages">
      <button disabled={!canPrev} onClick={() => issues.send(E.PreviousPage())}>
        Previous
      </button>
      <span>Page {page}</span>
      <button disabled={!canNext} onClick={() => issues.send(E.NextPage())}>
        Next
      </button>
    </nav>
  );
}

function HoldToDelete({ issues }: { issues: IssueListActor }) {
  const count = useView(issues, (s) => s.memory.selected.length);
  const canStart = useView(issues, (s) => check(s, E.HoldStarted())._tag === "Allowed");
  const holding = useView(issues, (s) => S.HOLDING.is(s));
  const deleting = useView(issues, (s) => S.DELETING.is(s));
  const release = () => issues.send(E.HoldReleased());

  return (
    <button
      disabled={!canStart && !holding}
      onPointerDown={() => issues.send(E.HoldStarted())}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
    >
      {deleting ? "Deleting…" : holding ? "Keep holding…" : `Hold to delete ${count}`}
    </button>
  );
}
```

### Story

```ts
// issues/issueList.story.ts
import { Effect, Layer, Ref } from "effect";
import { story } from "flow-state/testing";
import { IssuesApi, PAGE_SIZE, PinRefused, type Issue } from "./issues.api.js";
import { IssueList } from "./issueList.definition.js";
import { IssueListMachine } from "./issueList.machine.js";

const { E } = IssueList;

// An in-memory server with 45 open issues. Pinning issue-3 is refused; everything else works.
const IssuesServer = Layer.effect(
  IssuesApi,
  Effect.gen(function* () {
    const rows = yield* Ref.make<Issue[]>(
      Array.from({ length: 45 }, (_, i) => ({
        id: `issue-${i + 1}`,
        title: `Issue ${i + 1}`,
        status: "open" as const,
        pinned: false,
      })),
    );
    return IssuesApi.of({
      list: (q) =>
        Ref.get(rows).pipe(
          Effect.map((all) => {
            const matching = all.filter(
              (r) =>
                (q.status === "all" || r.status === q.status) &&
                r.title.toLowerCase().includes(q.search.toLowerCase()),
            );
            const start = (q.page - 1) * PAGE_SIZE;
            return { items: matching.slice(start, start + PAGE_SIZE), total: matching.length };
          }),
        ),
      setPinned: ({ id, pinned }) =>
        id === "issue-3"
          ? Effect.fail(new PinRefused()).pipe(Effect.delay("500 millis"))
          : Ref.update(rows, (all) => all.map((r) => (r.id === id ? { ...r, pinned } : r))),
      deleteMany: ({ ids }) => Ref.update(rows, (all) => all.filter((r) => !ids.includes(r.id))),
    });
  }),
);

// Select-all from the lane, debounced search, a refused pin with its flash, an early release, and
// a completed hold that deletes two issues and refetches.
export const screen = story
  .machine(IssueListMachine, { id: "issue-list-screen", services: IssuesServer })
  .process()
  .checkpoint("loaded") // page 1 of 3
  .send(E.PageSelected())
  .send(E.NextPage()) // clears the selection
  .send(E.RowToggled({ id: "issue-1" })) // refused: NotOnPage
  .process()
  .send(E.PageSelected()) // selects page 2's own rows
  .send(E.SearchTyped({ text: "Issue 1" }))
  .advance("200 millis")
  .send(E.SearchTyped({ text: "Issue 2" }))
  .advance("299 millis")
  .process()
  .checkpoint("still-typing") // page 2, search "", selection kept
  .advance("1 millis")
  .process()
  .checkpoint("searched") // search "Issue 2", page 1, selection cleared
  .send(E.SearchTyped({ text: "" }))
  .advance("300 millis")
  .process()
  .send(E.PinClicked({ id: "issue-3", pinned: true }))
  .send(E.PinClicked({ id: "issue-3", pinned: true })) // refused: PinInFlight (P3)
  .send(E.PinClicked({ id: "issue-4", pinned: true })) // another row: allowed
  .process()
  .checkpoint("pins-in-flight") // issue-3 shows pinned optimistically, still pending
  .advance("500 millis")
  .process()
  .checkpoint("pin-reverted") // issue-3 unpinned, flash "Couldn't pin Issue 3"; issue-4 pinned
  .advance("3 seconds")
  .process()
  .checkpoint("flash-gone")
  .send(E.HoldStarted()) // refused: NothingSelected
  .send(E.RowToggled({ id: "issue-1" }))
  .send(E.RowToggled({ id: "issue-2" }))
  .send(E.HoldStarted())
  .advance("1 second")
  .send(E.HoldReleased())
  .process()
  .checkpoint("released-early") // IDLE, nothing deleted
  .send(E.HoldStarted())
  .advance("1.5 seconds")
  .process()
  .checkpoint("deleted") // IDLE, selection empty, total 43
  .advance("30 seconds")
  .process()
  .checkpoint("polled");
```

---

## What the amendments changed

Lines are non-blank, non-comment lines in each code block (the method in
[reviews/principles.md](reviews/principles.md)). "Before" is [build-baseline.md](build-baseline.md)
after its fix pass. App code is definition + machine + components. Operations and services sit
outside the comparison and are listed only for completeness.

| | Before | After | Change |
| --- | --- | --- | --- |
| SignIn app code (def + machine + components) | 44 + 148 + 96 = **288** | 39 + 137 + 96 = **272** | −16, while also adding S1 |
| Signup app code | 59 + 170 + 177 = **406** | 56 + 134 + 177 = **367** | −39 |
| Issues app code | 58 + 186 + 161 = **405** | 53 + 169 + 161 = **383** | −22 |
| **App code, three apps** | **1,099** | **1,022** | **−77 (−7 %)** |
| Shared helpers | 11 | 10 | −1 (`backoffMs` gone) |
| Stories | 187 | 191 | +4 (S1 and S2 steps) |
| Operations + services (outside) | 143 | 126 | −17 (both re-labelling descriptors gone) |
| `// FAKED:` marks in code | **17** | **7** | −10 |
| Bugs from reviews/correctness.md still open | 0, plus 1 residual (verify interrupt unfenced) | **0** | residual closed by P2 |
| Spec items not fully met | S3 not applicable yet | S3's immediate revert (FAKED, cannot fix) | |

Marks in the new file: 34 `// AMENDMENT`, 8 `// ASSUMED`. (The original build, before its fix
pass, had 2 open bugs: the cross-entry verify and select-all from sender ids.)

**The seven FAKED marks left:**

| App | What stays faked | Why no amendment removes it |
| --- | --- | --- |
| SignIn | `lockedUntil` kept in memory | S1 makes the lockout survive leaving the step, and a state's schedule is cancelled on exit. P6 lets views read the deadline, but only while the schedule exists. |
| SignIn | the `resend` handler on two states | no amendment lets one handler cover "these two siblings, not the third" |
| Signup | `role!` by page order | memory still cannot narrow by state |
| Issues | the flash as a memory string | still an overlapping timed mode; only parallel regions (not applied) would make it a state |
| Issues | clear selection on query change | still a hand-spread patch; no amendment adds a reaction to memory |
| Issues | flash title from the lane, with a fallback | P1 gives the input `{ id, pinned }`, which has no title |
| Issues | `unknown` pin cannot revert at once (S3) | Operations O5 keeps the optimistic value until a confirming read; no amendment drops it |

**Helped most.**

- **P5 (shallow history)** for Signup. It removed `returnTo`, the `Page` literal, the four-way
  `Keep` chain and four per-page `Cancel`s. Two FAKED marks became one line each, and adding a
  page now edits only the page.
- **P4 (retry policy)** for Signup. It removed the `BACKING_OFF` state, its schedule, the retry
  guard with its exhausted alternative, and `backoffMs`. It also makes "retries resend the same
  input, never retry unknown" a property of the descriptor, not of the author.
- **P2 (fenced host commits)** for SignIn. It deleted the challenge fence, the descriptor
  re-labelling, four guarded handlers and the one bug this system could not fix (the interrupt).
- **P1 + P3** for Issues together. They deleted the `pinning` map, the re-labelling descriptor and
  "forget every pin on interrupt". The guard now asks the runtime instead of a hand list.
- **P6 + P7** in SignIn removed the cooldown-in-memory mode and its counter. In Issues they removed
  the flash counter. They are smaller wins, but each takes out an idiom a reader has to decode.

**Did nothing for this system.**

- **P8.** No `restartOn` here starts from a value the entering turn changes; the search debounce
  works the same either way.
- **S2.** The fix pass had already done it.
- **F1–F6** do not apply (they are for fragment systems).

**What still strains.**

- **One active leaf.** The issue list is still bulk delete in states and everything else beside it:
  the flash is still a memory mode, and the selection rule is still a convention.
- **Survival across exit.** S1 exposed a new form of the same gap: state-owned timers vanish on
  exit, so "the lockout survives Back" needs a deadline in memory again (now for survival, not
  display). Node memory or a "keep this schedule across exit" rule would remove it.
- **Nothing shareable across apps.** The amendments shrank each app but added no unit of reuse. The
  shared helpers are still values, and "timed mode with a countdown" and "draft field with an error
  after the first edit" are still re-declared per machine (P6/P7 just make each re-declaration
  shorter).
- **S3 cannot be met.** Reverting an `unknown` optimistic pin at once needs an Operations action to
  drop one commit's optimistic layer.
- **The draft syntax needed 8 assumptions.** Two of them change behaviour if read the other way:
  which state P2 fences to, and whether guards may read `schedules` and call `pending`.
