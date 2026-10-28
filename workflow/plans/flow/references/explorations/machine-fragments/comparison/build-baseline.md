# Baseline build: plain machines, no fragments

The three apps of [apps.md](apps.md), written with only what [Machines.plan](../../../../Machines.plan),
[Operations.plan](../../../../Operations.plan), [Testing.plan](../../../../Testing.plan) and
[React.plan](../../../../React.plan) describe today. There are no fragments, traits or
subroutines. Reuse between apps is plain TypeScript (functions, constants, a React hook), each
piece marked `// HELPER:` with what it cannot carry. Helpers are ordinary shared code, not
workarounds, so they are not counted as fakes; `// FAKED:` marks only workarounds.

Two conventions hold throughout, because the plans force them:

- **Operation names are flat.** Machines.plan O1 makes `operations` "a flat record of operation or
  entity-domain handles". `O.Auth.verifyCode` would need `Auth` to be an entity domain, and these
  are plain transactions and a plain resource, so the machines declare
  `operations: { verifyCode, resendCode }` and call `O.verifyCode`. The descriptors keep the ids
  `Auth/verifyCode`, `Accounts/create`, `Issues/list` and so on, so the wire names match apps.md.
- **Every app's actor is local (`useActor`).** Each is one screen that nothing else sends to, holds
  nothing that must survive leaving the screen, and should be disposed with it (React.plan O2/O3).
  No app needs a second actor. The one place a second actor was tempting (one per issue row, to
  attribute pin outcomes) is discussed in app 3 and rejected.

---

## Shared helpers (not fragments)

```ts
// shared/flow-helpers.ts
// Plain TypeScript shared by the three apps. None of this is a Flow construct: it carries no
// states, no events, no schedules, no handlers and no namespacing. Each machine still declares
// its own events, its own schedule and its own handler for every one of these ideas.
import { useNow } from "flow-state/react";

// HELPER: "We don't know whether it happened" maps three outcomes to one event.
// It carries only the outcome mapping: the event, its handler and the message stay per machine.
// Used by Signup (the UNSURE state). SignIn stopped using it once its outcomes had to carry the
// challenge id (see the sign-in operations), and the issue list's delete gives unknown and
// defect different messages.
export const notSure = <Ev>(event: Ev) => ({ unknown: event, interrupt: event, defect: event });

// HELPER: A deadline in memory, set from the turn's `now`. Snapshots expose no
// timers (Machines.plan O8), so a view that shows a countdown needs the due time copied into
// memory next to the schedule that really enforces it. This helper cannot keep the copy and the
// schedule in agreement: each machine passes the same constant to both, by convention.
export const deadlineAfter = (now: number, ms: number) => now + ms;

// HELPER: Whole seconds left before a deadline, for countdown text.
export const secondsLeft = (deadline: number | null, now: number) =>
  deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000));

// HELPER: The countdown hook. It reads Runtime Clock time through useNow, so Stories
// and StoryFrame control it (React.plan O4). It knows nothing about which schedule the deadline
// mirrors; if a machine forgets to clear the deadline, the countdown just sits at 0.
export function useSecondsLeft(deadline: number | null) {
  const now = useNow("1 second");

  return secondsLeft(deadline, now);
}

// HELPER: Doubling backoff: attempt 1 waits base, 2 waits 2×base, 3 waits 4×base.
// A number, not a schedule: the retry state, its guard and its counter live in the machine.
export const backoffMs = (attempt: number, baseMs = 1_000) => baseMs * 2 ** (attempt - 1);

// HELPER: apps.md's whole email rule ("must contain @"), used by Signup's
// account page and its invite list.
export const looksLikeEmail = (value: string) => value.includes("@");
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
import { Data, Effect } from "effect";
import { transaction } from "flow-state";
import { AuthApi } from "./auth.api.js";

// FAKED: host wiring standing in for the machine. A late verify from a step the user left (Back,
// then a new challenge) "reaches the actor's later state" (Operations.plan O2), and nothing
// fences it to the step that started it. Outcome mappers receive values only, so the machine
// cannot tell whose answer arrived. The descriptor therefore returns the challenge id on success
// and re-labels every typed failure and defect with it, keeping apps.md's tags (WrongCode,
// Expired); the machine's handlers then ignore answers for another challenge. Interrupt carries
// no value and stays unattributable (see CheckInterrupted in the machine).
export class WrongCodeFor extends Data.TaggedError("WrongCode")<{ challengeId: string }> {}
export class ExpiredFor extends Data.TaggedError("Expired")<{ challengeId: string }> {}
export class UncheckedFor extends Data.TaggedError("Unchecked")<{ challengeId: string }> {}

export const verifyCode = transaction({
  id: "Auth/verifyCode",
  key: ({ challengeId }: { challengeId: string; code: string }) => ({ challengeId }),
  commit: (input, { signal, attempt }) => {
    const { challengeId } = input;
    return AuthApi.use((api) =>
      api.verifyCode({ ...input, idempotencyKey: attempt.id }, signal),
    ).pipe(
      Effect.as({ challengeId }),
      Effect.mapError((error) =>
        error._tag === "WrongCode"
          ? new WrongCodeFor({ challengeId })
          : new ExpiredFor({ challengeId }),
      ),
      Effect.catchDefect(() => Effect.fail(new UncheckedFor({ challengeId }))),
    );
  },
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
  // The lockout is a state. The resend cooldown cannot also be one: it runs across ENTERING,
  // VERIFYING and LOCKED_OUT, and exactly one leaf is active (Machines.plan O2). It lives in
  // memory plus a schedule on TWO_FACTOR.
  states: ["PASSWORD", { TWO_FACTOR: ["ENTERING", "VERIFYING", "LOCKED_OUT"] }, "SIGNED_IN"],
  events: {
    PasswordAccepted: { challengeId: Schema.String }, // the stubbed password step
    CodeChanged: { code: Schema.String },
    SubmitCode: {},
    ResendCode: {},
    BackToPassword: {},
  },
  internalEvents: {
    // Every verify outcome names its challenge, so a late answer from a step the user left is
    // ignored instead of being applied to the next attempt.
    CodeAccepted: { challengeId: Schema.String },
    CodeWrong: { challengeId: Schema.String },
    CodeExpired: { challengeId: Schema.String },
    CheckFailed: { challengeId: Schema.String },
    CheckInterrupted: {},
    LockoutEnded: {},
    ResendReady: {},
  },
  memory: {
    challengeId: Schema.String,
    code: Schema.String,
    edited: Schema.Boolean, // the format error shows only after the first edit
    wrongAttempts: Schema.Int,
    error: Schema.String,
    // FAKED: modes kept in memory. lockedUntil copies the LOCKED_OUT schedule's deadline, and
    // resendUntil both copies the cooldown's deadline and *is* the cooldown mode (non-null means
    // cooling down), because a snapshot has no timers and the cooldown cannot be a state.
    lockedUntil: Schema.NullOr(Schema.Number),
    resendUntil: Schema.NullOr(Schema.Number),
    resends: Schema.Int, // restartOn input: each accepted resend restarts the cooldown schedule
  },
  initial: () => ({
    challengeId: "",
    code: "",
    edited: false,
    wrongAttempts: 0,
    error: "",
    lockedUntil: null,
    resendUntil: null,
    resends: 0,
  }),
  operations: { verifyCode, resendCode },
});
```

### Machine

```ts
// auth/signin.machine.ts
import { deny, machine } from "flow-state";
import { deadlineAfter } from "../shared/flow-helpers.js";
import { SignIn } from "./signin.definition.js";

type Memory = typeof SignIn.Memory.Type;

const MAX_WRONG = 3;
const LOCKOUT_MS = 5 * 60_000;
const RESEND_COOLDOWN_MS = 30_000;

// "Keeping nothing": what leaving the step resets. Also the shape a fresh step starts from.
const freshStep = {
  code: "",
  edited: false,
  wrongAttempts: 0,
  error: "",
  lockedUntil: null,
  resendUntil: null,
  resends: 0,
} satisfies Partial<Memory>;

const isSixDigits = (code: string) => /^\d{6}$/.test(code);

const challenge = ({ memory }: { memory: Memory }) => ({ challengeId: memory.challengeId });

// The fence: an outcome counts only for the challenge this step is verifying. A declined
// alternative falls through to ancestors, which do not handle these events, so the stale answer
// is dropped and the step keeps waiting for its own.
const thisChallenge = ({ event, memory }: { event: { challengeId: string }; memory: Memory }) =>
  event.challengeId === memory.challengeId || deny("StaleChallenge");

export const SignInMachine = machine(SignIn, ({ S, E, O }) => {
  const forChallenge = ({ challengeId }: { challengeId: string }) => ({ challengeId });

  const verify = O.verifyCode.commit(
    ({ memory }) => ({ challengeId: memory.challengeId, code: memory.code }),
    {
      outcomes: {
        success: E.CodeAccepted.from(forChallenge),
        failure: {
          WrongCode: E.CodeWrong.from(forChallenge),
          Expired: E.CodeExpired.from(forChallenge),
          Unchecked: E.CheckFailed.from(forChallenge), // a defect, re-labelled by the descriptor
        },
        // The Attempt's key names the challenge.
        unknown: E.CheckFailed.from((attempt) => ({
          challengeId: (attempt.key as { challengeId: string }).challengeId,
        })),
        interrupt: E.CheckInterrupted,
      },
    },
  );

  // "Couldn't check the code": not counted as a wrong attempt.
  const checkFailed = {
    target: S.TWO_FACTOR.ENTERING,
    updateMemory: () => ({ error: "Couldn't check the code, try again" }),
  } as const;

  // Allowed while entering and while locked out, so the same handler sits on both states.
  // FAKED: logic duplicated. The rule "resend is allowed in ENTERING and LOCKED_OUT" is kept by
  // placing one const in two `on` blocks; a third state that should allow resend has to remember.
  const resend = {
    target: "self",
    guard: ({ memory }: { memory: Memory }) =>
      memory.resendUntil === null || deny("ResendCoolingDown"),
    updateMemory: ({ memory, now }: { memory: Memory; now: number }) => ({
      resends: memory.resends + 1,
      resendUntil: deadlineAfter(now, RESEND_COOLDOWN_MS),
    }),
    actions: [O.resendCode.commit(challenge)],
  } as const;

  return {
    default: S.PASSWORD,
    states: {
      PASSWORD: {
        on: {
          PasswordAccepted: {
            target: S.TWO_FACTOR,
            updateMemory: ({ event }) => ({ ...freshStep, challengeId: event.challengeId }),
          },
        },
      },

      TWO_FACTOR: {
        default: S.TWO_FACTOR.ENTERING,
        schedules: {
          // FAKED: a mode kept in memory. The cooldown is a debounce-shaped schedule on the parent:
          // idle on entry, restarted by every accepted resend, cancelled by leaving the step. The
          // guard cannot ask the schedule whether it is armed (guards get no time and snapshots no
          // timers), so ResendReady clears resendUntil and the guard reads that.
          resendCooldown: {
            schedule: RESEND_COOLDOWN_MS,
            send: E.ResendReady,
            restartOn: ({ memory }) => memory.resends,
          },
        },
        on: {
          // From anywhere in the step. A verify still in flight is not cancelled: once the adapter
          // has been called a cancel only turns its answer into unknown (Operations.plan O7), and
          // the challenge fence already drops whatever arrives after the user has moved on.
          BackToPassword: {
            target: S.PASSWORD,
            updateMemory: () => ({ ...freshStep, challengeId: "" }),
          },
          ResendReady: { target: "self", updateMemory: () => ({ resendUntil: null }) },
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
              CodeAccepted: { target: S.SIGNED_IN, guard: thisChallenge },
              CodeWrong: [
                {
                  target: S.TWO_FACTOR.LOCKED_OUT,
                  guard: (input) =>
                    thisChallenge(input) === true
                      ? input.memory.wrongAttempts + 1 >= MAX_WRONG || deny("TriesLeft")
                      : deny("StaleChallenge"),
                  updateMemory: ({ memory, now }) => ({
                    wrongAttempts: memory.wrongAttempts + 1,
                    code: "",
                    error: "",
                    // FAKED: the deadline is copied from LOCKOUT_MS; the LOCKED_OUT schedule below
                    // uses the same constant. Nothing ties the two together but the name.
                    lockedUntil: deadlineAfter(now, LOCKOUT_MS),
                  }),
                },
                {
                  target: S.TWO_FACTOR.ENTERING,
                  guard: thisChallenge,
                  updateMemory: ({ memory }) => ({
                    wrongAttempts: memory.wrongAttempts + 1,
                    code: "",
                    error: `Wrong code, ${MAX_WRONG - (memory.wrongAttempts + 1)} tries left`,
                  }),
                },
              ],
              CodeExpired: {
                target: S.TWO_FACTOR.ENTERING,
                guard: thisChallenge,
                updateMemory: () => ({ error: "Code expired, send a new one" }),
              },
              CheckFailed: { ...checkFailed, guard: thisChallenge },
              // FAKED: cannot fix in this system. An interrupt carries no value, so it cannot be
              // fenced: an interrupt of an abandoned verify that lands while a newer verify is in
              // flight still ends the newer wait with "Couldn't check the code", and the newer
              // answer then arrives in ENTERING and is dropped. Fixing it needs outcome mappers
              // that receive the commit's Attempt or input for every outcome, or a per-state fence
              // for host commits (neither is in Operations.plan today).
              CheckInterrupted: checkFailed,
            },
          },

          // Entry and Submit are refused simply by having no handler here.
          LOCKED_OUT: {
            schedules: { lockout: { schedule: LOCKOUT_MS, send: E.LockoutEnded } },
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
  const lockedUntil = useView(signIn, (s) => s.memory.lockedUntil);
  const seconds = useSecondsLeft(lockedUntil);

  return <p role="alert">Too many wrong codes. Try again in {seconds} s.</p>;
}

function ResendButton({ signIn }: { signIn: SignInActor }) {
  const resend = useView(signIn, (s) => check(s, E.ResendCode()));
  const resendUntil = useView(signIn, (s) => s.memory.resendUntil);
  const seconds = useSecondsLeft(resendUntil);

  return (
    <button disabled={resend._tag !== "Allowed"} onClick={() => signIn.send(E.ResendCode())}>
      {resendUntil === null ? "Resend code" : `Resend code (${seconds} s)`}
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
// cools down for thirty seconds; the lockout ends with attempts reset and the right code signs in.
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
  .checkpoint("locked-out") // TWO_FACTOR.LOCKED_OUT, lockedUntil = now + 300 000
  .send(E.CodeChanged({ code: "123456" })) // refused: no handler in LOCKED_OUT
  .send(E.ResendCode()) // allowed while locked out
  .process()
  .advance("29 seconds")
  .send(E.ResendCode()) // refused: ResendCoolingDown
  .process()
  .checkpoint("resend-cooling")
  .advance("1 second")
  .process()
  .checkpoint("resend-ready")
  .advance("270 seconds")
  .process()
  .checkpoint("lockout-over") // ENTERING, wrongAttempts 0
  .send(E.CodeChanged({ code: "123456" }))
  .send(E.SubmitCode())
  .process()
  .checkpoint("signed-in");
```

### Metrics: sign-in

| Part | Non-blank, non-comment lines |
| --- | --- |
| Fragments | 0 (none in the baseline); shared helpers file 11, of which this app uses `deadlineAfter`, `useSecondsLeft` |
| Definition | 44 |
| Machine | 148 |
| Components | 96 |
| **App code** | **288** |
| Story | 54 |
| Operations + service (outside the comparison) | 48 |

- **New keywords:** none. Uses `definition`, `machine`, `deny`, `check`, compound states, ordered
  alternatives, `schedules` with `restartOn`, `commit`, `useActor`, `useView`, `useNow`.
- **Duplicated within the app:** the `resend` handler placed on two states; the 5-minute and
  30-second durations each stated once for the schedule and once for the memory deadline (shared
  constant, two uses); the challenge fence on four outcome handlers.
- **Duplicated across apps:** the "deadline in memory beside a schedule" pattern (also the issue
  list's flash, as a counter instead of a deadline); the descriptor re-labelling outcomes with an
  id so the machine can attribute them (also the issue list's pins).

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
import { transaction } from "flow-state";
import { AccountsApi, type CreateAccount } from "./accounts.api.js";

export const createAccount = transaction({
  id: "Accounts/create",
  key: ({ email }: CreateAccount) => ({ email }),
  commit: (input, { signal, attempt }) =>
    AccountsApi.use((api) => api.create({ ...input, idempotencyKey: attempt.id }, signal)),
  concurrency: "reject",
});
```

### Definition

```ts
// signup/signup.definition.ts
import { Schema } from "effect";
import { definition } from "flow-state";
import { Role } from "./accounts.api.js";
import { createAccount } from "./accounts.operations.js";

const Page = Schema.Literals(["ACCOUNT", "PROFILE", "INVITE", "REVIEW"]);

export const Signup = definition({
  id: "Compare/Signup",
  states: [
    { WIZARD: ["ACCOUNT", "PROFILE", "INVITE", "REVIEW"] },
    "CONFIRM_DISCARD", // outside WIZARD, so Next and Back are refused while the dialog is open
    { SUBMITTING: ["SENDING", "BACKING_OFF"] }, // outside WIZARD, so Cancel is refused
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
    ServerBusy: {},
    RetryDue: {},
    MaybeCreated: {},
  },
  memory: {
    email: Schema.String,
    password: Schema.String,
    name: Schema.String,
    role: Schema.NullOr(Role),
    invites: Schema.Array(Schema.String),
    error: Schema.String,
    busyRetries: Schema.Int,
    // FAKED: a history state kept in memory. "Keep" must return to the page Cancel came from;
    // there is no history target, so the page is written down and Keep picks a target by guard.
    returnTo: Page,
  },
  initial: () => ({
    email: "",
    password: "",
    name: "",
    role: null,
    invites: [],
    error: "",
    busyRetries: 0,
    returnTo: "ACCOUNT" as const,
  }),
  operations: { createAccount },
});
```

### Machine

```ts
// signup/signup.machine.ts
import { deny, machine } from "flow-state";
import { backoffMs, looksLikeEmail, notSure } from "../shared/flow-helpers.js";
import { Signup } from "./signup.definition.js";

type Memory = typeof Signup.Memory.Type;
type Page = Memory["returnTo"];

const MIN_PASSWORD = 12;
const MAX_INVITES = 5;
const MAX_BUSY_RETRIES = 3;

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
  // One commit, started from REVIEW's Submit and from every automatic retry.
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
        failure: { EmailTaken: E.EmailWasTaken, Busy: E.ServerBusy },
        ...notSure(E.MaybeCreated), // never retried automatically
      },
    },
  );

  // FAKED: logic duplicated. Each page declares its own Cancel with its own page name, because
  // the handler cannot read which child of WIZARD is active as a typed value to remember. This is
  // half of one workaround for the missing history target: Cancel writes the page into
  // `returnTo` here, and the `Keep` chain in CONFIRM_DISCARD reads it back. Adding a page means
  // editing both.
  const cancelFrom = (page: Page) => ({
    target: S.CONFIRM_DISCARD,
    updateMemory: () => ({ returnTo: page }),
  });

  const returnIf = (page: Page) => ({ memory }: { memory: Memory }) =>
    memory.returnTo === page || deny("NotFrom", { page });

  return {
    default: S.WIZARD,
    states: {
      WIZARD: {
        default: S.WIZARD.ACCOUNT,
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
              Cancel: cancelFrom("ACCOUNT"),
            },
          },

          PROFILE: {
            on: {
              NameChanged: { target: "self", updateMemory: ({ event }) => ({ name: event.name }) },
              RoleChanged: { target: "self", updateMemory: ({ event }) => ({ role: event.role }) },
              Next: { target: S.WIZARD.INVITE, guard: profileValid },
              Back: S.WIZARD.ACCOUNT,
              Cancel: cancelFrom("PROFILE"),
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
              Cancel: cancelFrom("INVITE"),
            },
          },

          REVIEW: {
            on: {
              Submit: {
                target: S.SUBMITTING,
                updateMemory: () => ({ error: "", busyRetries: 0 }),
                actions: [create],
              },
              Back: S.WIZARD.INVITE,
              Cancel: cancelFrom("REVIEW"),
            },
          },
        },
      },

      CONFIRM_DISCARD: {
        on: {
          Discard: S.CANCELLED,
          // FAKED: history by guard chain. Four alternatives, one per page; a fifth page needs a
          // fifth alternative here as well as its own Cancel above.
          Keep: [
            { target: S.WIZARD.ACCOUNT, guard: returnIf("ACCOUNT") },
            { target: S.WIZARD.PROFILE, guard: returnIf("PROFILE") },
            { target: S.WIZARD.INVITE, guard: returnIf("INVITE") },
            { target: S.WIZARD.REVIEW },
          ],
        },
      },

      SUBMITTING: {
        default: S.SUBMITTING.SENDING,
        states: {
          SENDING: {
            on: {
              Created: S.DONE,
              EmailWasTaken: {
                target: S.WIZARD.ACCOUNT,
                updateMemory: () => ({ error: "That email is registered", busyRetries: 0 }),
              },
              ServerBusy: [
                {
                  target: S.SUBMITTING.BACKING_OFF,
                  guard: ({ memory }) =>
                    memory.busyRetries < MAX_BUSY_RETRIES || deny("RetriesExhausted"),
                  updateMemory: ({ memory }) => ({ busyRetries: memory.busyRetries + 1 }),
                },
                {
                  target: S.WIZARD.REVIEW,
                  updateMemory: () => ({ error: "Try again later", busyRetries: 0 }),
                },
              ],
              MaybeCreated: S.UNSURE,
            },
          },

          // Re-entered for every retry, so the schedule re-arms with the next delay from memory
          // (the same pattern as the editor's lock retries).
          BACKING_OFF: {
            schedules: {
              retry: {
                schedule: ({ memory }) => backoffMs(memory.busyRetries),
                send: E.RetryDue,
              },
            },
            on: { RetryDue: { target: S.SUBMITTING.SENDING, actions: [create] } },
          },
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
  const retries = useView(signup, (s) => s.memory.busyRetries);

  return (
    <p role="status">
      {retries === 0 ? "Creating your account…" : `Server busy, retrying (${retries}/3)`}
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
// submit, back off 1 s then 2 s through two Busy answers, and land in DONE.
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
  .send(E.Keep())
  .process()
  .checkpoint("kept-invite") // WIZARD.INVITE with both invite fields still there
  .send(E.Next())
  .send(E.Submit())
  .process()
  .checkpoint("busy-1") // BACKING_OFF, busyRetries 1: "Server busy, retrying (1/3)"
  .send(E.Cancel()) // refused while submitting
  .advance("1 second")
  .process()
  .checkpoint("busy-2") // second Busy: BACKING_OFF, busyRetries 2, 2 s delay
  .advance("2 seconds")
  .process()
  .checkpoint("done"); // DONE, invites ["bob@example.com"]
```

### Metrics: signup

| Part | Non-blank, non-comment lines |
| --- | --- |
| Fragments | 0; this app uses `notSure`, `backoffMs`, `looksLikeEmail` from the shared helpers |
| Definition | 59 |
| Machine | 170 |
| Components | 177 |
| **App code** | **406** |
| Story | 48 |
| Operations + service (outside the comparison) | 30 |

- **New keywords:** none.
- **Duplicated within the app:** Cancel declared four times (`cancelFrom`), and the page list
  written three times (states, the `Page` literal, the `Keep` alternatives).
- **Duplicated across apps:** backoff from
  memory re-entering a state (the editor's lock retry is the same shape, re-written); "field
  draft plus error string cleared on edit" (SignIn's error, Signup's error).

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
import { Data, Effect } from "effect";
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

// FAKED: host wiring standing in for the machine. Outcome mappers receive values only
// (Operations.plan O2), so a failure, a defect or an interrupt cannot say which row it was for,
// and pins on different rows run at once. The descriptor re-labels every failure and defect as
// a PinFailed carrying the row id so the machine can revert and name the right row. Interrupt
// cannot be re-labelled this way; see PinsInterrupted in the machine.
export class PinFailed extends Data.TaggedError("PinFailed")<{ id: string }> {}

export const setPinned = transaction({
  id: "Issues/setPinned",
  key: ({ id }: { id: string; pinned: boolean }) => ({ id }),
  commit: (input, { signal, attempt }) =>
    IssuesApi.use((api) => api.setPinned({ ...input, idempotencyKey: attempt.id }, signal)).pipe(
      Effect.as({ id: input.id }),
      Effect.mapError(() => new PinFailed({ id: input.id })),
      Effect.catchDefect(() => Effect.fail(new PinFailed({ id: input.id }))),
    ),
  concurrency: "reject", // per row; the machine's guard refuses first so check() can see it
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
  // Five concerns overlap it and each other, and exactly one leaf is active, so each lives in
  // memory, most with a root schedule:
  //   search debounce  searchDraft + search, root schedule `search` (restartOn searchDraft)
  //   selection        selected, cleared by the queryChanged patch in every query handler
  //   pins in flight   pinning (row id -> title), one entry per row
  //   flash            flash + flashes, root schedule `flashExpiry` (restartOn flashes)
  //   polling          no memory, root schedule `poll`
  states: ["IDLE", "HOLDING", "DELETING"],
  events: {
    SearchTyped: { text: Schema.String },
    SortChanged: { field: SortField, dir: SortDir },
    StatusChanged: { status: StatusFilter },
    NextPage: {},
    PreviousPage: {},
    RowToggled: { id: Schema.String },
    PageSelected: {}, // the ids come from the list the actor holds, never from the sender
    SelectionCleared: {},
    PinClicked: { id: Schema.String, title: Schema.String, pinned: Schema.Boolean },
    HoldStarted: {},
    HoldReleased: {},
  },
  internalEvents: {
    SearchSettled: {},
    PollDue: {},
    FlashExpired: {},
    PinSucceeded: { id: Schema.String },
    PinFailedFor: { id: Schema.String },
    PinsInterrupted: {},
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
    // FAKED: modes kept in memory. Pins in flight, by row id, with the title the flash needs:
    // one "PINNING" mode per row, which no single state tree can hold.
    pinning: Schema.Record(Schema.String, Schema.String),
    // FAKED: a mode kept in memory. The flash is "showing" while non-empty; flashes is a counter
    // whose only job is to restart the expiry schedule (restartOn) for every new message.
    flash: Schema.String,
    flashes: Schema.Int,
  },
  initial: () => ({
    searchDraft: "",
    search: "",
    sortField: "updated" as const,
    sortDir: "desc" as const,
    status: "open" as const,
    page: 1,
    selected: [],
    pinning: {},
    flash: "",
    flashes: 0,
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
// patch, and a new query-changing handler that forgets it keeps a stale selection. There is no
// reaction to memory changes (onContext watches context only, Machines.plan O7).
const queryChanged = { selected: [] as ReadonlyArray<string> };
const backToFirstPage = { ...queryChanged, page: 1 };

const flash = (memory: Memory, text: string) => ({ flash: text, flashes: memory.flashes + 1 });

const withoutPin = (memory: Memory, id: string) => {
  const { [id]: _, ...rest } = memory.pinning;
  return rest;
};

const hasNextPage = ({ memory, activities }: { memory: Memory; activities: Lanes }) => {
  const total = activities.issues?.data?.total;
  return (total !== undefined && memory.page * PAGE_SIZE < total) || deny("LastPage");
};

const hasSelection = ({ memory }: { memory: Memory }) =>
  memory.selected.length > 0 || deny("NothingSelected");

// The rows the actor itself is showing. Selection is built from these, so a stale click from an
// earlier page or query can never select (and then delete) a row that is not on screen.
const rowIds = ({ activities }: { activities: Lanes }) =>
  (activities.issues?.data?.items ?? []).map((issue) => issue.id);

const onThisPage = ({ event, activities }: { event: { id: string }; activities: Lanes }) =>
  rowIds({ activities }).includes(event.id) || deny("NotOnPage");

export const IssueListMachine = machine(IssueList, ({ S, E, O }) => {
  const refetch = O.listIssues.refetch(query);

  return {
    default: S.IDLE,

    activities: { issues: O.listIssues.subscribe(query) },

    schedules: {
      // Debounce: idle until the draft changes, restarted by every keystroke.
      search: {
        schedule: "300 millis",
        send: E.SearchSettled,
        restartOn: ({ memory }) => memory.searchDraft,
      },
      poll: { schedule: Schedule.spaced("30 seconds"), send: E.PollDue },
      // FAKED: a mode kept in memory. A 3-second message is a timed state in a statechart; here it
      // is a root schedule restarted by a counter, because HOLDING/DELETING already own the leaf.
      flashExpiry: {
        schedule: FLASH_MS,
        send: E.FlashExpired,
        restartOn: ({ memory }) => memory.flashes,
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
      // optimistic layer itself on failure, so the row reverts without a handler writing data.
      PinClicked: {
        target: "self",
        guard: ({ event, memory }) => !(event.id in memory.pinning) || deny("PinInFlight"),
        updateMemory: ({ event, memory }) => ({
          pinning: { ...memory.pinning, [event.id]: event.title },
        }),
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
              success: E.PinSucceeded.from(({ id }) => ({ id })),
              failure: { PinFailed: E.PinFailedFor.from(({ id }) => ({ id })) },
              // FAKED: unknown keeps the optimistic value until a refetch confirms it (Operations
              // O5), so the row "reverts" only if the server did not apply the pin. apps.md says
              // revert; the plans do not allow forcing it. The Attempt's key names the row.
              unknown: E.PinFailedFor.from((attempt) => ({ id: (attempt.key as { id: string }).id })),
              // FAKED: an interrupt carries no value, so it cannot name its row. All pins in
              // flight are forgotten and a generic flash shows; see PinsInterrupted.
              interrupt: E.PinsInterrupted,
            },
          }),
        ],
      },
      PinSucceeded: {
        target: "self",
        updateMemory: ({ event, memory }) => ({ pinning: withoutPin(memory, event.id) }),
        actions: [refetch], // a lookup started after settlement confirms the optimistic value
      },
      PinFailedFor: {
        target: "self",
        updateMemory: ({ event, memory }) => ({
          pinning: withoutPin(memory, event.id),
          ...flash(memory, `Couldn't pin ${memory.pinning[event.id] ?? "the issue"}`),
        }),
        actions: [refetch],
      },
      PinsInterrupted: {
        target: "self",
        updateMemory: ({ memory }) => ({ pinning: {}, ...flash(memory, "Couldn't pin the issue") }),
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
          DeleteFailed: {
            target: S.IDLE,
            updateMemory: ({ memory }) => flash(memory, "Delete failed"),
          },
          DeleteMaybe: {
            target: S.IDLE,
            updateMemory: ({ memory }) => flash(memory, "Delete may have happened"),
            actions: [refetch],
          },
        },
      },
    },
  };
});
```

Why not one actor per row for pins: a per-row `useActor(PinMachine)` would give each pin its own
`IDLE/PINNING` states and its own outcomes, which removes the attribution problem above. It was
rejected because the plans then strand the flash: a local actor has no ref
(React.plan O2), so a row actor cannot `send` "Couldn't pin X" to the screen, and making the
screen a shared `actorRef` only to receive that message would outlive the screen for no reason.
It would also split one optimistic rule across two machines. The descriptor re-labelling is the
smaller workaround.

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
  const pin = E.PinClicked({ id: row.id, title: row.title, pinned: !row.pinned });
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

// Debounced search, a refused pin with its flash, an early release, and a completed hold that
// deletes two issues and refetches.
export const screen = story
  .machine(IssueListMachine, { id: "issue-list-screen", services: IssuesServer })
  .process()
  .checkpoint("loaded") // page 1 of 3
  .send(E.PageSelected())
  .send(E.NextPage()) // clears the selection
  .send(E.RowToggled({ id: "issue-1" })) // refused: NotOnPage (page 2 shows issue-21 to issue-40)
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
  .send(E.PinClicked({ id: "issue-3", title: "Issue 3", pinned: true }))
  .send(E.PinClicked({ id: "issue-3", title: "Issue 3", pinned: true })) // refused: PinInFlight
  .send(E.PinClicked({ id: "issue-4", title: "Issue 4", pinned: true })) // another row: allowed
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

### Metrics: issue list

| Part | Non-blank, non-comment lines |
| --- | --- |
| Fragments | 0; this app uses no shared helper |
| Definition | 58 |
| Machine | 186 |
| Components | 161 |
| **App code** | **405** |
| Story | 85 |
| Operations + service (outside the comparison) | 65 |

- **New keywords:** none.
- **Duplicated within the app:** the "query changed" patch spread into five handlers by
  convention; `refetch` in five handlers; `flash(...)` in four.
- **Duplicated across apps:** the timed message (memory + `restartOn` counter) is the same idea as
  SignIn's resend cooldown (memory + `restartOn` counter), written twice with different names and
  no shared code; the outcome-to-message tables are written per app.

---

## Totals

| | SignIn | Signup | IssueList | Total |
| --- | --- | --- | --- | --- |
| Fragments | 0 | 0 | 0 | 0 (shared helpers: 11) |
| Definition | 44 | 59 | 58 | 161 |
| Machine | 148 | 170 | 186 | 504 |
| Components | 96 | 177 | 161 | 434 |
| **App code** | **288** | **406** | **405** | **1,099** (1,110 with helpers) |
| Story | 54 | 48 | 85 | 187 |
| Operations + service (outside the comparison) | 48 | 30 | 65 | 143 |

**Counting method:** non-blank, non-comment lines inside each code block, the same method as
[reviews/principles.md](reviews/principles.md). Operation and service code is listed but sits
outside the comparison, because the other builds omit it. The first version of this file counted
blank and comment lines too, so its numbers are not comparable with these.

## How this system felt

**Easy.** Anything that is one sequence fits the state tree and reads as the spec: the
two-factor step (`ENTERING → VERIFYING → LOCKED_OUT`), the wizard pages, hold-then-delete. Refusal
is free and honest: no handler means refused, and `check()` gives the views their disabled
buttons and hints with no second copy of a rule (the code-format hint, Next's reasons, the
in-flight pin). Timers attached to states (lockout, hold, backoff) cost one line and clean up on
exit. Root handlers in the issue list make "works in every state" a single declaration. Typed
`satisfies Record<…>` maps over `S.x.child` keep components exhaustive.

**Strained.** Every concern that overlaps another concern had to leave the state tree, because one
leaf is active at a time:

- SignIn's resend cooldown runs across all three sub-states, so it became memory
  (`resendUntil`) plus a `restartOn` counter on the parent, with the clear done by a handler.
- The issue list has five overlapping concerns (search debounce, selection, per-row pins, flash,
  polling) beside bulk delete; only bulk delete got states. Per-row "pinning" can never be a
  state in one actor.
- Signup's Cancel dialog needs "return to where you were": no history target, so the page goes
  into memory and `Keep` is a four-way guard chain, with Cancel declared once per page.

Two strains came from the operation layer rather than the state tree. Outcome mappers receive
values only, so an outcome cannot say which call it answers. Twice this needed the same
workaround: concurrent pins could not tell which row failed, and a late verify from a step the
user had left was applied to the next attempt (the review's cross-entry bug). Both descriptors now
re-label success, failures and defects with an id (row id, challenge id) and the handlers guard on
it. An interrupt carries no value, so it still cannot be attributed in either app; that is the one
bug left that this system cannot fix. And `unknown` keeps the optimistic value until a refetch,
which is more honest than apps.md's "revert" but not the same.

Views cannot read schedule deadlines (snapshots have no timers), so every countdown needs its
deadline copied into memory beside a schedule using the same constant. That copy happened three
times (lockout, resend, and, as a counter, the flash).

**Faked most.** 17 `// FAKED:` marks in code. Modes kept in memory (cooldown, lockout deadline,
history page, pins in flight, flash): 6. Rules kept by convention or duplicated (clear selection
on query change, role non-null by page order, resend on two states, lockout deadline copied beside
its schedule, Cancel per page, Keep alternatives): 6. Host wiring standing in for the machine (the
verify and pin descriptors re-labelling outcomes): 2. Operation semantics this system cannot match
(pin `unknown`, pin interrupt, verify interrupt): 3. The six shared helpers are marked `// HELPER:`
and are not counted as fakes.

**Reused across apps.** Little, and only as values. No helper is now used by more than one app:
`useSecondsLeft`/`deadlineAfter` (SignIn, twice), `notSure`, `backoffMs` and `looksLikeEmail`
(Signup). The one idea that did repeat across apps, re-labelling outcomes with an id in the
descriptor, is written twice by hand because it has to name each descriptor's own errors. The
ideas that recur across apps, "a timed mode that blocks something and shows a countdown" (lockout,
resend cooldown, flash, hold) and "a draft field with a validity rule and an error that shows
after the first edit" (code field, wizard fields), could not be shared at all: each needs its own
memory fields, schedule, internal event and handler declared in its own machine, and the plain
helpers carry none of those. What does reuse well is a guard or a patch function inside one
machine (`accountValid`, `queryChanged`, `resend`), the same way the dispatch-desk editor shares
`canSave` and `confirmSaved`.

---

## Fix log

Findings from [reviews/correctness.md](reviews/correctness.md) §6 (bugs) and
[reviews/principles.md](reviews/principles.md) §8 (clarity), in their order.

**Bugs**

1. **App 1: a late verify crosses entries.** After Back and a new challenge, Back's cancel turned
   the old verify into `unknown`, which landed in the new VERIFYING as CheckFailed, and the new
   answer was then dropped in ENTERING. *Changed:* Back no longer cancels. The `verifyCode`
   descriptor returns `{ challengeId }` on success and re-labels WrongCode, Expired and defects
   with the challenge id (tags unchanged); `unknown` takes it from the Attempt's key. All four
   outcome events carry `challengeId`, and every VERIFYING handler guards on
   `thisChallenge`, so a stale answer falls through unhandled. *Stays:* an `interrupt` carries no
   value and cannot be fenced; it is marked `// FAKED: cannot fix in this system`. It needs outcome
   mappers that receive the Attempt or input for every outcome, or a per-state fence for host
   commits (correctness §4.1 and §4.8). `notSure` is no longer used by SignIn.
2. **App 3: `PageSelected` trusts sender ids.** *Changed:* `PageSelected` is payload-free and
   selects the ids in the actor's own list lane; `RowToggled` is guarded by `onThisPage`. A stale
   select-all or row click from an earlier page is refused (`NotOnPage`, `EmptyPage`). The Story
   now exercises the refusal.

**Clarity**

1. **`// FAKED: informal reuse` inflated the fake count.** *Changed:* relabelled `// HELPER:`; the
   preamble says helpers are not workarounds.
2. **Operations and service blocks.** *Changed:* each is marked outside the comparison, and the
   metrics list them separately.
3. **Counting method.** *Changed:* metrics are recounted as non-blank, non-comment lines (the
   reviewers' method), with per-app totals and the method stated under the totals.
4. **The issue list's overlapping concerns.** *Changed:* the definition lists the five concerns
   and the memory fields and schedules each lives in.
5. **Cancel-per-page and `Keep` read as two things.** *Changed:* the `cancelFrom` comment now says
   it is half of one history workaround with the `Keep` chain, and that a new page edits both.
