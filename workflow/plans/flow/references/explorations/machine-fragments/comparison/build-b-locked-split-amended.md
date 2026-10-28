# Build B, amended: the three apps in the locked-island split, with the amendments

This is [build-b-locked-split.md](build-b-locked-split.md) (the fixed build) with every amendment in
[amendments.md](amendments.md) that applies to B. The original stays unchanged for comparison.

Applied: plan-level **P1–P8**, apps.md fixes **S1–S3**, and the system-level amendments for B,
**F1–F5**. F6 is for A only. Every use carries a `// AMENDMENT <id>:` comment. A `// FAKED:` comment
marks a workaround that survives the amendments.

Readings I had to pick, marked `// ASSUMED:` where they are used:

- **A3** (from the fixed build): a `raise` mapper reads the same pre-turn
  `{ event, memory, activities }` as `updateMemory` and action parameters on that transition.
- **A4** (from the fixed build): a trait placed with `.at("X")` has typed memory only where `S.X.is(s)`
  narrows the snapshot.
- **A5** (from the fixed build): the host never maps outcomes onto fragment events; it maps them onto
  its own events and raises into fragments.
- **N1 (P6).** A trait's schedules sit in the snapshot under the trait's name:
  `s.schedules.<trait>.<schedule>?.dueAt`. The amendment shows only a machine's own schedule,
  `s.schedules.lockout?.dueAt`.
- **N2 (P7).** `armOn` arms only when a transition on that event is **accepted**. A refused `Start`
  arms nothing.
- **N3 (P2).** A commit is fenced to the activation of the state its starting transition **enters**:
  `verify`, started by Submit into VERIFYING, is fenced to that VERIFYING.
- **N4 (P3).** `descriptor.pending(…)` accepts a guard's input (`{ state, memory, activities, … }`)
  as well as a snapshot, since guards read the pre-turn snapshot.
- **N5 (P4).** `retrying` fires when a retry is scheduled. `attempt` is the retry number (1, 2, 3).
  Once the retries are used up, the last failure is delivered as the ordinary `failure` outcome.

The operation descriptors (`Auth`, `Accounts`, `Issues`) and the Story fixture Layers are imported,
not shown, as in the fixed build. Two descriptor facts matter, and are stated where they are used:
`Accounts.create` declares the P4 retry policy, and P2 replaces the old "serialize verifyCode"
requirement.

**Line counts** are non-blank, non-comment lines per code block, the same method as the fixed build.

---

## Shared fragments

```ts
// fragments.ts
import { deny, subroutine, trait } from "flow-state";
import { Duration, Schema } from "effect";

// ── Field (trait): the user edits it; the host may reset it ──────────────────
// The validation error is always computed; `touched` says whether a view may show it yet.
export const Field = <V, I>(value: Schema.Codec<V, I>, p: { validate: (v: V) => string | null }) =>
  trait(
    {
      id: "Field",
      input: { start: value },
      events: { Changed: { value } },
      hostEvents: { Reset: {} }, // AMENDMENT F1: only the host can clear the field
      memory: {
        value,
        start: value,
        error: Schema.NullOr(Schema.String),
        touched: Schema.Boolean,
      },
      initial: ({ input }) => ({
        value: input.start,
        start: input.start,
        error: p.validate(input.start),
        touched: false,
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
            error: p.validate(event.value),
            touched: true,
          }),
          notify: [callbacks.onChanged.from(({ event }) => ({ value: event.value }))],
        },
        Reset: {
          target: "self",
          updateMemory: ({ memory }) => ({
            value: memory.start,
            error: p.validate(memory.start),
            touched: false,
          }),
        },
      },
    }),
  );

// What a view shows under a field: the error, but only after the first edit.
export const shownError = (f: { error: string | null; touched: boolean }) =>
  f.touched ? f.error : null;

// ── FieldList (trait): 0..max text entries ───────────────────────────────────
// FAKED: logic duplicated. Each entry is a Field in all but name, but fragments are placed by a
// static name, so there is no list of Field instances ("dynamic instances" was not amended).
export const FieldList = (p: { max: number; validate: (v: string) => string | null }) =>
  trait(
    {
      id: "FieldList",
      events: {
        Add: {},
        Remove: { index: Schema.Int },
        Changed: { index: Schema.Int, value: Schema.String },
      },
      hostEvents: { Compact: {} }, // AMENDMENT F1: the host drops empty entries on Next
      memory: { items: Schema.Array(Schema.String) },
      initial: () => ({ items: [] }),
    },
    () => ({
      on: {
        Add: {
          target: "self",
          guard: ({ memory }) =>
            memory.items.length < p.max || deny("ListFull", { max: p.max }),
          updateMemory: ({ memory }) => ({ items: [...memory.items, ""] }),
        },
        Remove: {
          target: "self",
          updateMemory: ({ event, memory }) => ({
            items: memory.items.filter((_, i) => i !== event.index),
          }),
        },
        Changed: {
          target: "self",
          updateMemory: ({ event, memory }) => ({
            items: memory.items.map((v, i) => (i === event.index ? event.value : v)),
          }),
        },
        Compact: {
          target: "self",
          updateMemory: ({ memory }) => ({ items: memory.items.filter((v) => v.trim() !== "") }),
        },
      },
    }),
  );

// Per-entry errors, for guards and views alike; empty entries are allowed (dropped on Next).
export const listErrors = (items: ReadonlyArray<string>, validate: (v: string) => string | null) =>
  items.map((v) => (v.trim() === "" ? null : validate(v)));

// ── Debounce (trait): tells its host once, `wait` after the last Input ───────
export const Debounce = (p: { wait: Duration.Input }) =>
  trait(
    {
      id: "Debounce",
      hostEvents: { Input: {} }, // AMENDMENT F1: host-only, no longer public
      internalEvents: { Due: {} },
      callbacks: { onSettled: {} },
    },
    ({ E, callbacks }) => ({
      // AMENDMENT P7: every Input re-arms the timer; the seq counter and restartOn are gone.
      schedules: { settle: { schedule: p.wait, send: E.Due, armOn: [E.Input] } },
      on: {
        Input: { target: "self" },
        Due: { target: "self", notify: [callbacks.onSettled] },
      },
    }),
  );

// ── Countdown (trait): runs once per Start, refuses a restart while running ──
// One piece for every countdown in the apps: the resend cooldown and the lockout. The time left
// is not kept in memory; views read the schedule's deadline.
export const Countdown = (p: { length: Duration.Input }) =>
  trait(
    {
      id: "Countdown",
      hostEvents: { Start: {} }, // AMENDMENT F1: only the host starts it
      internalEvents: { Done: {} },
      memory: { running: Schema.Boolean },
      initial: () => ({ running: false }),
      callbacks: { onDone: {} },
    },
    ({ E, callbacks }) => ({
      schedules: {
        // AMENDMENT P7: armed by Start. ASSUMED (N2): a refused Start arms nothing.
        // AMENDMENT P6: its dueAt is the countdown a view shows; no ticking, no stray tick.
        done: { schedule: p.length, send: E.Done, armOn: [E.Start] },
      },
      on: {
        // Refusing Start refuses the whole host turn that raised it, and check() agrees.
        Start: {
          target: "self",
          guard: ({ memory }) => !memory.running || deny("Running"),
          updateMemory: () => ({ running: true }),
        },
        Done: {
          target: "self",
          updateMemory: () => ({ running: false }),
          notify: [callbacks.onDone],
        },
      },
    }),
  );

// Seconds left on a Countdown, for views: the schedule's deadline against useNow().
export const secondsLeft = (dueAt: number | undefined, now: number) =>
  dueAt === undefined ? 0 : Math.max(0, Math.ceil((dueAt - now) / 1000));

// ── Confirm (subroutine): two ways out ───────────────────────────────────────
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

// ── Hold (subroutine): confirmed by holding for `for`; releasing early cancels ─
export const Hold = (p: { for: Duration.Input }) =>
  subroutine(
    {
      id: "Hold",
      events: { Release: {} },
      internalEvents: { Held: {} },
      exits: { Confirmed: {}, Cancelled: {} },
    },
    ({ E, exits }) => ({
      schedules: { held: { schedule: p.for, send: E.Held } }, // leaving cancels it
      on: { Held: exits.Confirmed, Release: exits.Cancelled },
    }),
  );

// ── Pager (trait): a page number the host bounds ─────────────────────────────
export const Pager = trait(
  {
    id: "Pager",
    events: { Next: {}, Previous: {} },
    hostEvents: { First: {} }, // AMENDMENT F1: the host resets the page on a query change
    memory: { page: Schema.Int },
    initial: () => ({ page: 1 }),
    guards: ["hasNext"],
    callbacks: { onTurned: { page: Schema.Int } },
  },
  ({ guards, callbacks }) => ({
    on: {
      Next: {
        target: "self",
        guard: guards.hasNext,
        updateMemory: ({ memory }) => ({ page: memory.page + 1 }),
        notify: [callbacks.onTurned.from(({ memory }) => ({ page: memory.page + 1 }))],
      },
      Previous: {
        target: "self",
        guard: ({ memory }) => memory.page > 1 || deny("FirstPage"),
        updateMemory: ({ memory }) => ({ page: memory.page - 1 }),
        notify: [callbacks.onTurned.from(({ memory }) => ({ page: memory.page - 1 }))],
      },
      // Notifies nothing, so the host clears the selection itself in that same turn.
      First: { target: "self", updateMemory: () => ({ page: 1 }) },
    },
  }),
);

// ── Selection (trait): a set of ids ──────────────────────────────────────────
export const Selection = trait(
  {
    id: "Selection",
    events: { Toggle: { id: Schema.String }, Clear: {} },
    // AMENDMENT F1 + S2: only the host selects a whole page, with ids it reads from the lane.
    hostEvents: { SelectAll: { ids: Schema.Array(Schema.String) } },
    memory: { ids: Schema.Array(Schema.String) },
    initial: () => ({ ids: [] }),
  },
  () => ({
    on: {
      Toggle: {
        target: "self",
        updateMemory: ({ event, memory }) => ({
          ids: memory.ids.includes(event.id)
            ? memory.ids.filter((id) => id !== event.id)
            : [...memory.ids, event.id],
        }),
      },
      SelectAll: { target: "self", updateMemory: ({ event }) => ({ ids: event.ids }) },
      Clear: { target: "self", updateMemory: () => ({ ids: [] }) },
    },
  }),
);

// ── Flash (trait): one message, cleared `for` after it was last shown ───────
export const Flash = (p: { for: Duration.Input }) =>
  trait(
    {
      id: "Flash",
      hostEvents: { Show: { message: Schema.String } }, // AMENDMENT F1: host-only
      internalEvents: { Expire: {} },
      memory: { message: Schema.NullOr(Schema.String) },
      initial: () => ({ message: null }),
    },
    ({ E }) => ({
      // AMENDMENT P7: every Show re-arms the expiry; the seq counter is gone.
      schedules: { expire: { schedule: p.for, send: E.Expire, armOn: [E.Show] } },
      on: {
        Show: { target: "self", updateMemory: ({ event }) => ({ message: event.message }) },
        Expire: { target: "self", updateMemory: () => ({ message: null }) },
      },
    }),
  );
```

`Timeout` is gone. Under S1 the lockout must outlive the state it locks, so it became a root
`Countdown`. Under P4 the signup backoff is the descriptor's own retry schedule. Nothing else needed
`Timeout`. The fragment-alone Story now tests `Countdown`:

```ts
// countdown.test.ts
import { check } from "flow-state";
import { story } from "flow-state/testing";
import { Countdown } from "./fragments";

const Cooldown = Countdown({ length: "30 seconds" });

const runsOnce = story
  .machine(Cooldown, { id: "Countdown/runs-once" })
  .send(Cooldown.E.Start()) // the harness may send host events
  .process()
  .checkpoint("running")
  .advance("30 seconds")
  .process()
  .checkpoint("end");

test("runs once, refuses a restart while running, and reports when done", async () => {
  const run = await runsOnce.run();
  const running = run.checkpoints.running;
  expect(running.snapshot.schedules.done?.dueAt).toBe(running.now + 30_000); // ASSUMED (N1)
  expect(check(running.snapshot, Cooldown.E.Start())._tag).toBe("Denied"); // Running
  expect(run.calls.onDone).toHaveLength(1);
  expect(run.checkpoints.end.snapshot.memory.running).toBe(false);
});
```

---

## 1. Two-factor sign-in

Shape: `TWO_FACTOR` is a plain host compound, because it runs `verifyCode` and `resendCode`. The code
field and the resend cooldown are traits on `TWO_FACTOR`, fresh on every entry. **The lockout is now
a root `Countdown`** (S1): it keeps running through Back to password and re-entry. `LOCKED_OUT` is a
plain host state that the lockout's `onDone` callback leaves. A root trait's callback may move the
host anywhere.

```ts
// signin.definition.ts
import { definition } from "flow-state";
import { Schema } from "effect";
import { Auth } from "./auth.operations";
import { Countdown, Field } from "../fragments";

export const SixDigitCode = Field(Schema.String, {
  validate: (v) => (/^\d{6}$/.test(v) ? null : "Enter the 6-digit code"),
});

export const SignIn = definition({
  id: "Auth/SignIn",
  states: ["PASSWORD", { TWO_FACTOR: ["ENTERING", "VERIFYING", "LOCKED_OUT"] }, "SIGNED_IN"],
  traits: {
    // Fresh on every entry to TWO_FACTOR: Back drops the typed code and the resend cooldown.
    code: SixDigitCode.at("TWO_FACTOR"),
    resendCooldown: Countdown({ length: "30 seconds" }).at("TWO_FACTOR"),
    // AMENDMENT S1: at the root, so the lockout survives Back to password and re-entry.
    lockout: Countdown({ length: "5 minutes" }),
  },
  events: {
    PasswordAccepted: { challengeId: Schema.String }, // the password step's stub
    Submit: {},
    Resend: {},
    BackToPassword: {},
  },
  internalEvents: {
    CodeAccepted: {},
    CodeWrong: {},
    CodeExpired: {},
    CodeUnchecked: {}, // unknown, interrupt, defect: not counted as a wrong attempt
  },
  memory: {
    challengeId: Schema.String,
    wrongAttempts: Schema.Int, // AMENDMENT S1: kept across Back for the same challenge
    error: Schema.NullOr(Schema.String),
  },
  initial: () => ({ challengeId: "", wrongAttempts: 0, error: null }),
  operations: { Auth },
});
```

```ts
// signin.machine.ts
import { deny, machine } from "flow-state";
import { SignIn } from "./signin.definition";

const MAX_WRONG = 3;

export const SignInMachine = machine(SignIn, ({ S, E, O }) => {
  // AMENDMENT P2: the result is fenced to the VERIFYING activation that started it (ASSUMED N3).
  // Back to password mid-verify drops the late result; it can no longer land on a newer attempt.
  // The fixed build's abandonedVerifies counter and the "serialize" requirement are gone.
  const verify = O.Auth.verifyCode.commit(
    ({ memory }) => ({ challengeId: memory.challengeId, code: memory.code.value }),
    {
      outcomes: {
        success: E.CodeAccepted,
        failure: { WrongCode: E.CodeWrong, Expired: E.CodeExpired },
        unknown: E.CodeUnchecked,
        interrupt: E.CodeUnchecked,
        defect: E.CodeUnchecked,
      },
    },
  );

  // No outcomes mapped: apps.md gives resend no visible result.
  const resendCode = O.Auth.resendCode.commit(({ memory }) => ({
    challengeId: memory.challengeId,
  }));

  // Refused while the cooldown runs: the raised Start is refused, which refuses this whole turn.
  const resend = {
    target: "self",
    actions: [resendCode],
    raise: [E.resendCooldown.Start], // AMENDMENT F2: ordinary transitions may raise
  } as const;

  const toEntering = (error: string) => ({
    target: S.TWO_FACTOR.ENTERING,
    updateMemory: () => ({ error }),
  });

  const lockedOut = ({ state }: { state: typeof SignIn.State.Type }) =>
    S.TWO_FACTOR.LOCKED_OUT.is(state); // AMENDMENT F3: a token, not a path string

  return {
    default: S.PASSWORD,

    traits: {
      code: {
        input: () => ({ start: "" }),
        guards: { canEdit: (g) => !lockedOut(g) || deny("LockedOut") },
        callbacks: { onChanged: {} },
      },
      resendCooldown: { callbacks: { onDone: {} } },
      lockout: {
        callbacks: {
          // AMENDMENT S1: the lockout ends wherever the actor is. In LOCKED_OUT it returns to
          // entering; elsewhere (Back to password) it only resets the attempts.
          onDone: [
            {
              target: S.TWO_FACTOR.ENTERING,
              guard: (g) => lockedOut(g) || deny("NotLockedOut"),
              updateMemory: () => ({ wrongAttempts: 0, error: null }),
            },
            { target: "self", updateMemory: () => ({ wrongAttempts: 0 }) },
          ],
        },
      },
    },

    states: {
      PASSWORD: {
        on: {
          PasswordAccepted: [
            // AMENDMENT S1: back into a running lockout. ASSUMED: a new challenge does not
            // lift a running lockout either (apps.md only says it survives for the same one).
            {
              target: S.TWO_FACTOR.LOCKED_OUT,
              guard: ({ memory }) => memory.lockout.running || deny("NotLockedOut"),
              updateMemory: ({ event }) => ({ challengeId: event.challengeId, error: null }),
            },
            // AMENDMENT S1: wrong attempts survive re-entry for the same challenge only.
            {
              target: S.TWO_FACTOR,
              updateMemory: ({ event, memory }) => ({
                challengeId: event.challengeId,
                wrongAttempts:
                  event.challengeId === memory.challengeId ? memory.wrongAttempts : 0,
                error: null,
              }),
            },
          ],
        },
      },

      TWO_FACTOR: {
        default: S.TWO_FACTOR.ENTERING,
        on: { BackToPassword: S.PASSWORD },
        states: {
          ENTERING: {
            on: {
              Submit: {
                target: S.TWO_FACTOR.VERIFYING,
                guard: ({ memory }) => memory.code.error === null || deny("InvalidCode"),
                updateMemory: () => ({ error: null }),
                actions: [verify],
              },
              Resend: resend,
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
                  updateMemory: () => ({ wrongAttempts: MAX_WRONG, error: null }),
                  raise: [E.code.Reset, E.lockout.Start], // AMENDMENT F1/F2: host events
                },
                {
                  target: S.TWO_FACTOR.ENTERING,
                  updateMemory: ({ memory }) => ({
                    wrongAttempts: memory.wrongAttempts + 1,
                    error: `Wrong code, ${MAX_WRONG - memory.wrongAttempts - 1} tries left`,
                  }),
                  raise: [E.code.Reset],
                },
              ],
              CodeExpired: toEntering("Code expired, send a new one"),
              CodeUnchecked: toEntering("Couldn't check the code, try again"),
            },
          },

          // Submit has no handler here (Unhandled); typing is refused by canEdit.
          LOCKED_OUT: { on: { Resend: resend } },
        },
      },

      SIGNED_IN: {},
    },
  };
});
```

```tsx
// SignInScreen.tsx
import { check, type Actor } from "flow-state";
import { useActor, useNow, useView } from "flow-state/react";
import { secondsLeft, shownError } from "../fragments";
import { SignIn } from "./signin.definition";
import { SignInMachine } from "./signin.machine";

const { S, E } = SignIn;

type SignInActor = Actor<typeof SignInMachine>;

export function SignInScreen() {
  const signIn = useActor(SignInMachine);
  const step = useView(signIn, (s) => S.root.child(s));

  const body = {
    PASSWORD: (
      <button onClick={() => signIn.send(E.PasswordAccepted({ challengeId: "demo-challenge" }))}>
        Continue
      </button>
    ),
    TWO_FACTOR: <TwoFactorStep signIn={signIn} />,
    SIGNED_IN: <p role="status">Signed in</p>,
  } satisfies Record<typeof step, React.ReactNode>;

  return body[step];
}

function TwoFactorStep({ signIn }: { signIn: SignInActor }) {
  const now = useNow("1 second");
  // ASSUMED (A4): trait memory is typed only under the token that places it.
  const code = useView(signIn, (s) => (S.TWO_FACTOR.is(s) ? s.memory.code.value : ""));
  const codeError = useView(signIn, (s) => (S.TWO_FACTOR.is(s) ? shownError(s.memory.code) : null));
  // AMENDMENT P6: countdowns read the schedule deadlines (ASSUMED N1 for the path).
  const resendDue = useView(signIn, (s) =>
    S.TWO_FACTOR.is(s) ? s.schedules.resendCooldown.done?.dueAt : undefined,
  );
  const lockoutDue = useView(signIn, (s) =>
    S.TWO_FACTOR.LOCKED_OUT.is(s) ? s.schedules.lockout.done?.dueAt : undefined,
  );
  const error = useView(signIn, (s) => s.memory.error);
  const verifying = useView(signIn, (s) => S.TWO_FACTOR.VERIFYING.is(s));

  const canType = useView(
    signIn,
    (s) => check(s, E.code.Changed({ value: "" }))._tag === "Allowed",
  );
  const canSubmit = useView(signIn, (s) => check(s, E.Submit())._tag === "Allowed");
  const canResend = useView(signIn, (s) => check(s, E.Resend())._tag === "Allowed");

  const resendIn = secondsLeft(resendDue, now);
  const lockedFor = lockoutDue === undefined ? null : secondsLeft(lockoutDue, now);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        signIn.send(E.Submit());
      }}
    >
      <label>
        Code
        <input
          inputMode="numeric"
          maxLength={6}
          value={code}
          disabled={!canType}
          onChange={(event) => signIn.send(E.code.Changed({ value: event.target.value }))}
        />
      </label>
      {codeError && <p className="hint">{codeError}</p>}
      {error && <p role="alert">{error}</p>}
      {lockedFor !== null && (
        <p role="status">Too many wrong codes. Try again in {lockedFor} s.</p>
      )}

      <button type="submit" disabled={!canSubmit}>
        {verifying ? "Checking…" : "Submit"}
      </button>
      <button type="button" disabled={!canResend} onClick={() => signIn.send(E.Resend())}>
        {resendIn > 0 ? `Resend code (${resendIn} s)` : "Resend code"}
      </button>
      <button type="button" onClick={() => signIn.send(E.BackToPassword())}>
        Back to password
      </button>
      {/* signIn.send(E.code.Reset())   ← type error now: a host event (AMENDMENT F1) */}
      {/* signIn.send(E.lockout.Start()) ← type error: a host event                    */}
    </form>
  );
}
```

```ts
// signin.story.ts
import { check } from "flow-state";
import { story } from "flow-state/testing";
import { AuthAlwaysWrongCode } from "./auth.fixtures"; // verifyCode fails WrongCode; resend succeeds
import { SignIn } from "./signin.definition";
import { SignInMachine } from "./signin.machine";

const { E } = SignIn;

// Stories accept no callbacks, so the three wrong attempts are spelled out.
export const lockedOut = story
  .machine(SignInMachine, { id: "sign-in/locked-out", services: AuthAlwaysWrongCode })
  .send(E.PasswordAccepted({ challengeId: "ch-1" }))
  .send(E.code.Changed({ value: "111111" }))
  .send(E.Submit())
  .process()
  .checkpoint("one-wrong")
  .send(E.code.Changed({ value: "222222" }))
  .send(E.Submit())
  .process()
  .send(E.code.Changed({ value: "333333" }))
  .send(E.Submit())
  .process()
  .checkpoint("locked")
  .send(E.BackToPassword()) // AMENDMENT S1: Back and re-entry do not lift the lockout
  .send(E.PasswordAccepted({ challengeId: "ch-1" }))
  .process()
  .checkpoint("re-entered")
  .send(E.Resend()) // allowed while locked out
  .process()
  .advance("5 minutes")
  .process()
  .checkpoint("unlocked");

test("three wrong codes lock the step for five minutes, through Back and re-entry", async () => {
  const run = await lockedOut.run();

  const one = run.checkpoints["one-wrong"].snapshot;
  expect(one.state).toBe("TWO_FACTOR.ENTERING");
  expect(one.memory.error).toBe("Wrong code, 2 tries left");
  expect(one.memory.code.value).toBe("");

  const locked = run.checkpoints.locked;
  expect(locked.snapshot.state).toBe("TWO_FACTOR.LOCKED_OUT");
  expect(locked.snapshot.schedules.lockout.done?.dueAt).toBe(locked.now + 300_000); // N1
  expect(check(locked.snapshot, E.Submit())).toEqual({ _tag: "Unhandled" });
  expect(check(locked.snapshot, E.code.Changed({ value: "1" }))._tag).toBe("Denied");

  const back = run.checkpoints["re-entered"].snapshot;
  expect(back.state).toBe("TWO_FACTOR.LOCKED_OUT");
  expect(back.schedules.lockout.done?.dueAt).toBe(locked.snapshot.schedules.lockout.done?.dueAt);

  const unlocked = run.checkpoints.unlocked.snapshot;
  expect(unlocked.state).toBe("TWO_FACTOR.ENTERING");
  expect(unlocked.memory.wrongAttempts).toBe(0);
  expect(check(unlocked, E.code.Changed({ value: "1" }))).toEqual({ _tag: "Allowed" });
});
```

### Metrics: sign-in

| Piece | Fixed build | Amended |
| --- | --- | --- |
| Fragments used | `Field`, `Countdown`, `Timeout`: 103 | `Field`, `Countdown`: 47 + 30 = 77 |
| Definition + machine + component | 39 + 128 + 72 = **239** | 35 + 119 + 75 = **229** |
| Story test | 47 | 48 |
| FAKED | 4 | 0 |

- **Keywords:** `trait`, `traits`, `.at`, `guards`, `callbacks`, `raise`, `hostEvents`, `armOn`,
  `input` on fragments. `subroutine` and `exits` are no longer needed in this app.
- **Gone:** the leaf-path string guard (F3), the late-verify counter (P2), public `Reset`/`Start`
  (F1), the `Timeout` subroutine and its duplicated ticking (S1, P6, P7).
- **Still a gap:** a wrong code whose result is dropped by Back is not counted. P2 offers an
  `abandoned` handler for this, but its shape is not drafted, so I did not use it.

---

## 2. Signup wizard

Shape: the four pages are now children of a `WIZARD` compound, so Cancel is one handler and Keep is
`S.WIZARD.history` (P5). Submitting is one state. The descriptor retries Busy by itself (P4), resends
the same input, and reports each retry. `BUSY`, `Timeout`, the captured `request` and the host retry
counter are all gone.

```ts
// signup.definition.ts
import { definition } from "flow-state";
import { Schema } from "effect";
import { Accounts } from "./accounts.operations";
import { Confirm, Field, FieldList } from "../fragments";

// AMENDMENT P4: Accounts.create is declared in accounts.operations.ts (not shown) with
//   retry: { on: ["Busy"], schedule: Schedule.exponential("1 second").pipe(Schedule.recurs(3)) }
// so it waits 1 s, 2 s, 4 s, resends the same input, and never retries unknown.

export const Role = Schema.Literals(["engineer", "designer", "manager"]);

export const emailRule = (v: string) => (v.includes("@") ? null : "Enter an email address");

const required = (v: string) => (v.trim() ? null : "Required");

export const MAX_INVITES = 5;

export const MAX_BUSY_RETRIES = 3; // must match the descriptor's Schedule.recurs(3); shown in the UI

export const Signup = definition({
  id: "Accounts/Signup",
  states: [
    { WIZARD: ["ACCOUNT", "PROFILE", "INVITE", "REVIEW"] },
    { CANCELLING: Confirm },
    "SUBMITTING",
    "UNSURE",
    "DONE",
    "CANCELLED",
  ],
  traits: {
    email: Field(Schema.String, { validate: emailRule }),
    password: Field(Schema.String, {
      validate: (v) => (v.length >= 12 ? null : "At least 12 characters"),
    }),
    name: Field(Schema.String, { validate: required }),
    role: Field(Schema.NullOr(Role), { validate: (v) => (v === null ? "Choose a role" : null) }),
    invites: FieldList({ max: MAX_INVITES, validate: emailRule }),
  },
  events: { Next: {}, Back: {}, Cancel: {}, Submit: {} },
  internalEvents: {
    Created: {},
    EmailTaken: {},
    Busy: {}, // only after the descriptor's retries are used up
    Retrying: { n: Schema.Int }, // AMENDMENT P4: one per scheduled retry
    Unsure: {},
  },
  memory: {
    busyRetries: Schema.Int, // for "Server busy, retrying (n/3)" only; the descriptor counts
    error: Schema.NullOr(Schema.String),
  },
  initial: () => ({ busyRetries: 0, error: null }),
  operations: { Accounts },
});
```

```ts
// signup.machine.ts
import { deny, machine } from "flow-state";
import { listErrors } from "../fragments";
import { emailRule, Signup } from "./signup.definition";

type Memory = typeof Signup.Memory.Type;

const accountValid = ({ memory }: { memory: Memory }) =>
  (memory.email.error === null && memory.password.error === null) || deny("AccountInvalid");

const profileValid = ({ memory }: { memory: Memory }) =>
  (memory.name.error === null && memory.role.error === null) || deny("ProfileInvalid");

const invitesValid = ({ memory }: { memory: Memory }) =>
  listErrors(memory.invites.items, emailRule).every((e) => e === null) || deny("InvitesInvalid");

export const SignupMachine = machine(Signup, ({ S, E, O }) => {
  // AMENDMENT P4: one commit. Its retries resend this same input, so fields edited while
  // submitting can no longer reach the server.
  const create = O.Accounts.create.commit(
    ({ memory }) => ({
      email: memory.email.value,
      password: memory.password.value,
      name: memory.name.value,
      role: memory.role.value!, // profileValid guarantees it; the type cannot see the guard
      invites: memory.invites.items, // compacted on Next from INVITE
    }),
    {
      outcomes: {
        success: E.Created,
        failure: { EmailTaken: E.EmailTaken, Busy: E.Busy },
        retrying: E.Retrying.from(({ attempt }) => ({ n: attempt })), // ASSUMED (N5)
        unknown: E.Unsure,
        interrupt: E.Unsure,
        defect: E.Unsure,
      },
    },
  );

  // Every Field port must be filled, even where the host has nothing to say.
  const editable = { canEdit: () => true as const };

  return {
    default: S.WIZARD,

    traits: {
      email: {
        input: () => ({ start: "" }),
        guards: editable,
        // Editing the email clears "That email is registered".
        callbacks: { onChanged: { target: "self", updateMemory: () => ({ error: null }) } },
      },
      password: { input: () => ({ start: "" }), guards: editable, callbacks: { onChanged: {} } },
      name: { input: () => ({ start: "" }), guards: editable, callbacks: { onChanged: {} } },
      role: { input: () => ({ start: null }), guards: editable, callbacks: { onChanged: {} } },
      invites: {},
    },

    states: {
      WIZARD: {
        default: S.WIZARD.ACCOUNT,
        // AMENDMENT P5: one Cancel for every page; the page is remembered by history.
        on: { Cancel: S.CANCELLING },
        states: {
          ACCOUNT: {
            on: {
              Next: {
                target: S.WIZARD.PROFILE,
                guard: accountValid,
                updateMemory: () => ({ error: null }),
              },
            },
          },
          PROFILE: {
            on: {
              Next: { target: S.WIZARD.INVITE, guard: profileValid },
              Back: S.WIZARD.ACCOUNT,
            },
          },
          INVITE: {
            on: {
              // Empty entries are dropped on Next, by the list itself, in this same turn.
              Next: { target: S.WIZARD.REVIEW, guard: invitesValid, raise: [E.invites.Compact] },
              Back: S.WIZARD.PROFILE,
            },
          },
          REVIEW: {
            on: {
              Submit: {
                target: S.SUBMITTING,
                updateMemory: () => ({ busyRetries: 0, error: null }),
                actions: [create],
              },
              Back: S.WIZARD.INVITE,
            },
          },
        },
      },

      CANCELLING: {
        // AMENDMENT P5: Keep returns to the page Cancel came from; cancelledFrom is gone.
        exits: { Confirmed: S.CANCELLED, Declined: S.WIZARD.history },
      },

      // Cancel is refused here: SUBMITTING is outside WIZARD.
      SUBMITTING: {
        on: {
          Created: S.DONE,
          EmailTaken: {
            target: S.WIZARD.ACCOUNT,
            updateMemory: () => ({ error: "That email is registered" }),
          },
          Retrying: { target: "self", updateMemory: ({ event }) => ({ busyRetries: event.n }) },
          Busy: { target: S.WIZARD.REVIEW, updateMemory: () => ({ error: "Try again later" }) },
          Unsure: S.UNSURE,
        },
      },

      UNSURE: {},
      DONE: {},
      CANCELLED: {},
    },
  };
});
```

```tsx
// SignupWizard.tsx
import { check, type Actor } from "flow-state";
import { useActor, useView } from "flow-state/react";
import { listErrors, shownError } from "../fragments";
import { emailRule, MAX_BUSY_RETRIES, MAX_INVITES, Role, Signup } from "./signup.definition";
import { SignupMachine } from "./signup.machine";

const { S, E } = Signup;

type SignupActor = Actor<typeof SignupMachine>;

export function SignupWizard() {
  const signup = useActor(SignupMachine);
  const step = useView(signup, (s) => S.root.child(s));

  const body = {
    WIZARD: <WizardPage signup={signup} />,
    CANCELLING: <DiscardDialog signup={signup} />,
    SUBMITTING: <ReviewPage signup={signup} />,
    UNSURE: <p role="status">Your account may have been created; check your email.</p>,
    DONE: <p role="status">Welcome aboard.</p>,
    CANCELLED: <p>Signup discarded.</p>,
  } satisfies Record<typeof step, React.ReactNode>;

  return body[step];
}

function WizardPage({ signup }: { signup: SignupActor }) {
  const page = useView(signup, (s) => S.WIZARD.child(s) ?? "ACCOUNT");

  const body = {
    ACCOUNT: <AccountPage signup={signup} />,
    PROFILE: <ProfilePage signup={signup} />,
    INVITE: <InvitePage signup={signup} />,
    REVIEW: <ReviewPage signup={signup} />,
  } satisfies Record<typeof page, React.ReactNode>;

  return body[page];
}

function TextField(props: {
  label: string;
  type?: string;
  field: { value: string; error: string | null; touched: boolean };
  onChange: (value: string) => void;
}) {
  const error = shownError(props.field);
  return (
    <label>
      {props.label}
      <input
        type={props.type ?? "text"}
        value={props.field.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
      {error && <span className="hint">{error}</span>}
    </label>
  );
}

function Footer({ signup, next }: { signup: SignupActor; next: string }) {
  const error = useView(signup, (s) => s.memory.error);
  const canNext = useView(signup, (s) => check(s, E.Next())._tag === "Allowed");
  const canBack = useView(signup, (s) => check(s, E.Back())._tag === "Allowed");
  return (
    <footer>
      {error && <p role="alert">{error}</p>}
      {canBack && <button onClick={() => signup.send(E.Back())}>Back</button>}
      <button disabled={!canNext} onClick={() => signup.send(E.Next())}>
        {next}
      </button>
      <button onClick={() => signup.send(E.Cancel())}>Cancel</button>
    </footer>
  );
}

function AccountPage({ signup }: { signup: SignupActor }) {
  const email = useView(signup, (s) => s.memory.email);
  const password = useView(signup, (s) => s.memory.password);
  return (
    <section>
      <h2>Account</h2>
      <TextField
        label="Email"
        type="email"
        field={email}
        onChange={(value) => signup.send(E.email.Changed({ value }))}
      />
      <TextField
        label="Password"
        type="password"
        field={password}
        onChange={(value) => signup.send(E.password.Changed({ value }))}
      />
      <Footer signup={signup} next="Next" />
    </section>
  );
}

function ProfilePage({ signup }: { signup: SignupActor }) {
  const name = useView(signup, (s) => s.memory.name);
  const role = useView(signup, (s) => s.memory.role);
  const roleError = shownError(role);
  return (
    <section>
      <h2>Profile</h2>
      <TextField
        label="Name"
        field={name}
        onChange={(value) => signup.send(E.name.Changed({ value }))}
      />
      <label>
        Role
        <select
          value={role.value ?? ""}
          onChange={(event) =>
            signup.send(E.role.Changed({ value: (event.target.value || null) as typeof role.value }))
          }
        >
          <option value="">Choose…</option>
          {Role.literals.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      {roleError && <span className="hint">{roleError}</span>}
      <Footer signup={signup} next="Next" />
    </section>
  );
}

function InvitePage({ signup }: { signup: SignupActor }) {
  const items = useView(signup, (s) => s.memory.invites.items);
  const canAdd = useView(signup, (s) => check(s, E.invites.Add())._tag === "Allowed");
  const errors = listErrors(items, emailRule);
  return (
    <section>
      <h2>Invite teammates</h2>
      {items.map((value, index) => (
        <div key={index}>
          <input
            type="email"
            value={value}
            onChange={(event) =>
              signup.send(E.invites.Changed({ index, value: event.target.value }))
            }
          />
          <button onClick={() => signup.send(E.invites.Remove({ index }))}>Remove</button>
          {errors[index] && <span className="hint">{errors[index]}</span>}
        </div>
      ))}
      <button disabled={!canAdd} onClick={() => signup.send(E.invites.Add())}>
        Add ({items.length}/{MAX_INVITES})
      </button>
      <Footer signup={signup} next="Next" />
    </section>
  );
}

function ReviewPage({ signup }: { signup: SignupActor }) {
  const values = useView(signup, (s) => ({
    email: s.memory.email.value,
    name: s.memory.name.value,
    role: s.memory.role.value,
    invites: s.memory.invites.items,
  }));
  const error = useView(signup, (s) => s.memory.error);
  const submitting = useView(signup, (s) => S.SUBMITTING.is(s));
  const retrying = useView(signup, (s) => (S.SUBMITTING.is(s) ? s.memory.busyRetries : 0));
  const canSubmit = useView(signup, (s) => check(s, E.Submit())._tag === "Allowed");
  const canCancel = useView(signup, (s) => check(s, E.Cancel())._tag === "Allowed");
  return (
    <section>
      <h2>Review</h2>
      <dl>
        <dt>Email</dt>
        <dd>{values.email}</dd>
        <dt>Name</dt>
        <dd>{values.name}</dd>
        <dt>Role</dt>
        <dd>{values.role}</dd>
        <dt>Invites</dt>
        <dd>{values.invites.join(", ") || "None"}</dd>
      </dl>
      {retrying > 0 && (
        <p role="status">
          Server busy, retrying ({retrying}/{MAX_BUSY_RETRIES})
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <button disabled={submitting} onClick={() => signup.send(E.Back())}>
        Back
      </button>
      <button disabled={!canSubmit} onClick={() => signup.send(E.Submit())}>
        {submitting ? "Creating…" : "Create account"}
      </button>
      <button disabled={!canCancel} onClick={() => signup.send(E.Cancel())}>
        Cancel
      </button>
    </section>
  );
}

function DiscardDialog({ signup }: { signup: SignupActor }) {
  return (
    <dialog open>
      <p>Discard your signup?</p>
      <button onClick={() => signup.send(E.CANCELLING.Yes())}>Discard</button>
      <button onClick={() => signup.send(E.CANCELLING.No())}>Keep</button>
    </dialog>
  );
}
```

```ts
// signup.story.ts
import { check } from "flow-state";
import { story } from "flow-state/testing";
import { AccountsAlwaysBusy } from "./accounts.fixtures"; // create always fails Busy, at once
import { Signup } from "./signup.definition";
import { SignupMachine } from "./signup.machine";

const { E } = Signup;

const atReview = story
  .machine(SignupMachine, { id: "signup/busy-gives-up", services: AccountsAlwaysBusy })
  .send(E.email.Changed({ value: "ada@example.com" }))
  .send(E.password.Changed({ value: "correct horse battery" }))
  .send(E.Next())
  .send(E.name.Changed({ value: "Ada" }))
  .send(E.role.Changed({ value: "engineer" }))
  .send(E.Next())
  .send(E.invites.Add())
  .send(E.invites.Add())
  .send(E.invites.Changed({ index: 0, value: "grace@example.com" }))
  .send(E.Next()) // the empty second entry is dropped
  .process()
  .checkpoint("review");

export const busyGivesUp = atReview
  .send(E.Submit())
  .process()
  .checkpoint("busy-1")
  .send(E.email.Changed({ value: "someone-else@example.com" })) // must not reach the retries
  .advance("1 second")
  .process()
  .checkpoint("busy-2")
  .advance("2 seconds")
  .process()
  .checkpoint("busy-3")
  .advance("4 seconds")
  .process()
  .checkpoint("gave-up");

test("Busy retries three times with growing backoff, then returns to Review", async () => {
  const run = await busyGivesUp.run();

  expect(run.checkpoints.review.snapshot.memory.invites.items).toEqual(["grace@example.com"]);

  for (const [name, n] of [["busy-1", 1], ["busy-2", 2], ["busy-3", 3]] as const) {
    const s = run.checkpoints[name].snapshot;
    expect(s.state).toBe("SUBMITTING");
    expect(s.memory.busyRetries).toBe(n);
    expect(check(s, E.Cancel())).toEqual({ _tag: "Unhandled" }); // refused while submitting
  }

  const end = run.checkpoints["gave-up"].snapshot;
  expect(end.state).toBe("WIZARD.REVIEW");
  expect(end.memory.error).toBe("Try again later");
  // The fixture records every call: all four sent the reviewed email (AMENDMENT P4).
  expect(AccountsAlwaysBusy.calls(run).map((c) => c.input.email)).toEqual(
    Array(4).fill("ada@example.com"),
  );
});
```

The last assertion reads the fixture's call record (`AccountsAlwaysBusy.calls(run)`), a fixture-side
helper written alongside the fixture. Testing.plan's stateful fixtures "remember writes", but the
reader for that record is not part of the plan.

### Metrics: signup

| Piece | Fixed build | Amended |
| --- | --- | --- |
| Fragments used | `Field`, `FieldList`, `Timeout`, `Confirm`: 127 | `Field`, `FieldList`, `Confirm`: 47 + 42 + 10 = 99 |
| Definition + machine + components | 50 + 122 + 192 = **364** | 43 + 103 + 198 = **344** |
| Story test | 48 | 50 |
| FAKED | 4 | 1 |

- **Keywords:** `trait`, `subroutine`, `traits`, `guards`, `callbacks`, `exits`, `raise`,
  `hostEvents`, `.history`, `retrying` (P4), `input` on fragments.
- **Gone:** `cancelledFrom` and the four exit alternatives (P5); the per-page Cancel handlers
  (P5, via the `WIZARD` compound); `BUSY`, `Timeout`, the host retry policy and the captured
  `request` (P4).
- **FAKED left (1):** `FieldList` duplicating `Field` (dynamic instances).

---

## 3. Issue list screen

Shape: as before, root traits for everything that runs side by side, and `BROWSING → HOLDING →
DELETING` for bulk delete. The in-flight `pinning` list is gone: P3 lets the guard ask the runtime,
and P1 lets every pin outcome name its row.

```ts
// issuelist.definition.ts
import { definition } from "flow-state";
import { Schema } from "effect";
import { Issues } from "./issues.operations";
import { Debounce, Field, Flash, Hold, Pager, Selection } from "../fragments";

export const Sort = Schema.Struct({
  field: Schema.Literals(["updated", "title"]),
  dir: Schema.Literals(["asc", "desc"]),
});

export const Status = Schema.Literals(["open", "closed", "all"]);

export const PAGE_SIZE = 20;

export const IssueList = definition({
  id: "Issues/IssueList",
  states: ["BROWSING", { HOLDING: Hold({ for: "1.5 seconds" }) }, "DELETING"],
  traits: {
    search: Field(Schema.String, { validate: () => null }),
    searchSettle: Debounce({ wait: "300 millis" }),
    pager: Pager,
    selection: Selection,
    flash: Flash({ for: "3 seconds" }),
  },
  events: {
    SortChanged: { sort: Sort },
    StatusChanged: { status: Status },
    Pin: { id: Schema.String, pinned: Schema.Boolean },
    SelectPage: {}, // AMENDMENT S2: "select all on this page"; ids come from the snapshot
    HoldDelete: {}, // pointer down; the release is E.HOLDING.Release
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
    appliedSearch: Schema.String, // what the query uses; search.value is what is typed
    sort: Sort,
    status: Status,
  },
  initial: () => ({
    appliedSearch: "",
    sort: { field: "updated", dir: "desc" },
    status: "open",
  }),
  operations: { Issues },
});
```

```ts
// issuelist.machine.ts
import { deny, machine } from "flow-state";
import { Schedule } from "effect";
import { IssueList, PAGE_SIZE } from "./issuelist.definition";

type Memory = typeof IssueList.Memory.Type;

export const listQuery = ({ memory }: { memory: Memory }) => ({
  search: memory.appliedSearch,
  sort: memory.sort,
  status: memory.status,
  page: memory.pager.page,
});

export const IssueListMachine = machine(IssueList, ({ S, E, O }) => {
  const refetch = O.Issues.list.refetch(listQuery);

  // Every query change except a page turn: back to page 1 and an empty selection, in this turn.
  const queryReset = [E.pager.First, E.selection.Clear]; // AMENDMENT F2: raise from transitions

  const pin = O.Issues.setPinned.commit(
    ({ event }) => ({ id: event.id, pinned: event.pinned }),
    {
      optimistic: O.Issues.list.setData(({ memory, event }) => ({
        key: listQuery({ memory }),
        data: (page) => ({
          ...page,
          items: page.items.map((i) => (i.id === event.id ? { ...i, pinned: event.pinned } : i)),
        }),
      })),
      // AMENDMENT P1: every mapper gets the call's input, so each outcome names its row,
      // interrupt and defect included. Success needs no event: nothing is tracked by hand.
      outcomes: {
        failure: E.PinFailed.from((_, { input }) => ({ id: input.id })),
        interrupt: E.PinFailed.from((_, { input }) => ({ id: input.id })),
        defect: E.PinFailed.from((_, { input }) => ({ id: input.id })),
        unknown: E.PinUnsure.from((_, { input }) => ({ id: input.id })),
      },
    },
  );

  const deleteSelected = O.Issues.deleteMany.commit(({ memory }) => ({ ids: memory.selection.ids }), {
    outcomes: {
      success: E.Deleted,
      failure: E.DeleteFailed,
      interrupt: E.DeleteFailed,
      defect: E.DeleteFailed,
      unknown: E.DeleteUnsure,
    },
  });

  const flash = (message: string) => E.flash.Show.from(() => ({ message }));

  const hasSelection = ({ memory }: { memory: Memory }) =>
    memory.selection.ids.length > 0 || deny("NothingSelected");

  // The row's title for the flash, read from the lane. ASSUMED (A3): raise mappers read
  // activities. A row that left the lane meanwhile is named "issue".
  const pinFlash = E.flash.Show.from(({ event, activities }) => ({
    message: `Couldn't pin ${
      activities.issues?.data?.items.find((i) => i.id === event.id)?.title ?? "issue"
    }`,
  }));

  return {
    default: S.BROWSING,

    activities: {
      issues: O.Issues.list.subscribe(listQuery),
    },

    schedules: {
      refresh: { schedule: Schedule.spaced("30 seconds"), send: E.RefreshDue },
    },

    traits: {
      search: {
        input: () => ({ start: "" }),
        guards: { canEdit: () => true as const },
        callbacks: { onChanged: { target: "self", raise: [E.searchSettle.Input] } },
      },
      searchSettle: {
        callbacks: {
          onSettled: [
            {
              target: "self",
              guard: ({ memory }) =>
                memory.search.value !== memory.appliedSearch || deny("SearchUnchanged"),
              updateMemory: ({ memory }) => ({ appliedSearch: memory.search.value }),
              raise: queryReset,
            },
            { target: "self" },
          ],
        },
      },
      pager: {
        guards: {
          hasNext: ({ memory, activities }) =>
            memory.pager.page * PAGE_SIZE < (activities.issues?.data?.total ?? 0) ||
            deny("LastPage"),
        },
        callbacks: { onTurned: { target: "self", raise: [E.selection.Clear] } },
      },
      selection: {},
      flash: {},
    },

    on: {
      RefreshDue: { target: "self", actions: [refetch] },
      SortChanged: {
        target: "self",
        updateMemory: ({ event }) => ({ sort: event.sort }),
        raise: queryReset,
      },
      StatusChanged: {
        target: "self",
        updateMemory: ({ event }) => ({ status: event.status }),
        raise: queryReset,
      },
      Pin: {
        target: "self",
        // AMENDMENT P3: the runtime knows whether this row's pin is in flight (ASSUMED N4).
        guard: (g) =>
          !O.Issues.setPinned.pending(g, { id: g.event.id }) || deny("PinInFlight"),
        actions: [pin],
      },
      // On failure the optimistic value is already gone (Operations O5).
      PinFailed: { target: "self", raise: [pinFlash] },
      // AMENDMENT S3: unknown keeps the optimistic value until a confirming read, so refetch.
      PinUnsure: { target: "self", actions: [refetch], raise: [pinFlash] },
      // AMENDMENT S2 + F1: the ids come from the snapshot's lane, and SelectAll is a host event.
      SelectPage: {
        target: "self",
        raise: [
          E.selection.SelectAll.from(({ activities }) => ({
            ids: activities.issues?.data?.items.map((i) => i.id) ?? [],
          })),
        ],
      },
    },

    states: {
      BROWSING: {
        on: { HoldDelete: { target: S.HOLDING, guard: hasSelection } },
      },
      HOLDING: {
        exits: {
          // The selection can be cleared mid-hold by a query change: re-check on completion.
          Confirmed: [
            { target: S.DELETING, guard: hasSelection, actions: [deleteSelected] },
            S.BROWSING,
          ],
          Cancelled: S.BROWSING,
        },
      },
      DELETING: {
        on: {
          Deleted: { target: S.BROWSING, actions: [refetch], raise: [E.selection.Clear] },
          DeleteFailed: { target: S.BROWSING, raise: [flash("Delete failed")] },
          DeleteUnsure: {
            target: S.BROWSING,
            actions: [refetch],
            raise: [flash("Delete may have happened")],
          },
        },
      },
    },
  };
});
```

```tsx
// IssueListScreen.tsx
import { check, type Actor } from "flow-state";
import { useActor, useView } from "flow-state/react";
import { Issues } from "./issues.operations";
import { IssueList, Sort, Status } from "./issuelist.definition";
import { IssueListMachine } from "./issuelist.machine";

const { S, E } = IssueList;

type ListActor = Actor<typeof IssueListMachine>;

export function IssueListScreen() {
  const list = useActor(IssueListMachine);
  return (
    <section>
      <Toolbar list={list} />
      <Rows list={list} />
      <Pagination list={list} />
      <BulkDelete list={list} />
      <FlashMessage list={list} />
    </section>
  );
}

function Toolbar({ list }: { list: ListActor }) {
  const search = useView(list, (s) => s.memory.search.value);
  const sort = useView(list, (s) => s.memory.sort);
  const status = useView(list, (s) => s.memory.status);
  return (
    <div role="toolbar">
      <input
        type="search"
        value={search}
        onChange={(event) => list.send(E.search.Changed({ value: event.target.value }))}
      />
      <select
        value={`${sort.field}:${sort.dir}`}
        onChange={(event) => {
          const [field, dir] = event.target.value.split(":");
          list.send(E.SortChanged({ sort: { field, dir } as typeof Sort.Type }));
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
          list.send(E.StatusChanged({ status: event.target.value as typeof Status.Type }))
        }
      >
        <option value="open">Open</option>
        <option value="closed">Closed</option>
        <option value="all">All</option>
      </select>
    </div>
  );
}

function Rows({ list }: { list: ListActor }) {
  const lane = useView(list, (s) => s.activities.issues);
  const selected = useView(list, (s) => s.memory.selection.ids);
  const items = lane?.data?.items ?? [];
  // AMENDMENT P3: in-flight rows come from the runtime, not from memory.
  const pinning = useView(list, (s) =>
    items.filter((i) => Issues.setPinned.pending(s, { id: i.id })).map((i) => i.id),
  );
  const allSelected = items.length > 0 && items.every((i) => selected.includes(i.id));

  if (lane === undefined || lane._tag === "Pending") return <p>Loading…</p>;

  return (
    <table>
      <thead>
        <tr>
          <th>
            <input
              type="checkbox"
              checked={allSelected}
              // AMENDMENT S2: no ids in the click; the host reads them from the snapshot, and
              // E.selection.SelectAll is a host event the view cannot send (F1).
              onChange={() => list.send(allSelected ? E.selection.Clear() : E.SelectPage())}
            />
          </th>
          <th>Title</th>
          <th>Status</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {items.map((issue) => (
          <tr key={issue.id}>
            <td>
              <input
                type="checkbox"
                checked={selected.includes(issue.id)}
                onChange={() => list.send(E.selection.Toggle({ id: issue.id }))}
              />
            </td>
            <td>{issue.title}</td>
            <td>{issue.status}</td>
            <td>
              <button
                aria-pressed={issue.pinned}
                disabled={pinning.includes(issue.id)}
                onClick={() => list.send(E.Pin({ id: issue.id, pinned: !issue.pinned }))}
              >
                {issue.pinned ? "Unpin" : "Pin"}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Pagination({ list }: { list: ListActor }) {
  const page = useView(list, (s) => s.memory.pager.page);
  const canPrev = useView(list, (s) => check(s, E.pager.Previous())._tag === "Allowed");
  const canNext = useView(list, (s) => check(s, E.pager.Next())._tag === "Allowed");
  return (
    <nav>
      <button disabled={!canPrev} onClick={() => list.send(E.pager.Previous())}>
        Previous
      </button>
      <span>Page {page}</span>
      <button disabled={!canNext} onClick={() => list.send(E.pager.Next())}>
        Next
      </button>
    </nav>
  );
}

function BulkDelete({ list }: { list: ListActor }) {
  const count = useView(list, (s) => s.memory.selection.ids.length);
  const canHold = useView(list, (s) => check(s, E.HoldDelete())._tag === "Allowed");
  const holding = useView(list, (s) => S.HOLDING.is(s));
  const deleting = useView(list, (s) => S.DELETING.is(s));
  const release = () => list.send(E.HOLDING.Release()); // unhandled outside HOLDING: harmless
  return (
    <button
      disabled={!canHold && !holding}
      onPointerDown={() => list.send(E.HoldDelete())}
      onPointerUp={release}
      onPointerLeave={release}
    >
      {deleting ? "Deleting…" : holding ? "Keep holding…" : `Hold to delete ${count}`}
    </button>
  );
}

function FlashMessage({ list }: { list: ListActor }) {
  const message = useView(list, (s) => s.memory.flash.message);
  return message ? <p role="status">{message}</p> : null;
}
```

```ts
// issuelist.story.ts
import { check } from "flow-state";
import { story } from "flow-state/testing";
import { IssuesWithFailingPins } from "./issues.fixtures"; // list serves 45 issues; setPinned fails after 500 ms
import { Issues } from "./issues.operations";
import { IssueList } from "./issuelist.definition";
import { IssueListMachine } from "./issuelist.machine";

const { E } = IssueList;

const firstPage = {
  search: "",
  sort: { field: "updated", dir: "desc" },
  status: "open",
  page: 1,
} as const;

const pin = E.Pin({ id: "I-1", pinned: true });

export const pinFails = story
  .machine(IssueListMachine, { id: "issues/pin-fails", services: IssuesWithFailingPins })
  .process()
  .checkpoint("loaded")
  .send(pin)
  .process()
  .checkpoint("pinning")
  .advance("500 millis")
  .process()
  .checkpoint("reverted")
  .advance("3 seconds")
  .process()
  .checkpoint("flash-gone");

test("a failed pin shows at once, reverts, flashes for 3 s and refuses a double click", async () => {
  const run = await pinFails.run();
  const row = (name: keyof typeof run.checkpoints) =>
    Issues.list.get(run.checkpoints[name], firstPage)?.data?.items.find((i) => i.id === "I-1");

  expect(row("loaded")?.pinned).toBe(false);

  const pinning = run.checkpoints.pinning.snapshot;
  expect(row("pinning")?.pinned).toBe(true); // optimistic
  expect(Issues.setPinned.pending(pinning, { id: "I-1" })).toBe(true); // AMENDMENT P3
  expect(check(pinning, pin)._tag).toBe("Denied"); // PinInFlight

  expect(row("reverted")?.pinned).toBe(false);
  expect(run.checkpoints.reverted.snapshot.memory.flash.message).toBe("Couldn't pin Crash on save");

  expect(run.checkpoints["flash-gone"].snapshot.memory.flash.message).toBeNull();
  expect(check(run.checkpoints["flash-gone"].snapshot, pin)).toEqual({ _tag: "Allowed" });
});
```

### Metrics: issue list

| Piece | Fixed build | Amended |
| --- | --- | --- |
| Fragments used | `Field`, `Debounce`, `Pager`, `Selection`, `Flash`, `Hold`: 154 | 47 + 16 + 28 + 23 + 17 + 13 = 144 |
| Definition + machine + components | 50 + 156 + 145 = **351** | 47 + 143 + 144 = **334** |
| Story test | 39 | 41 |
| FAKED | 6 (incl. 4 public host events in its fragments) | 0 |

- **Keywords:** `trait`, `subroutine`, `traits`, `guards`, `callbacks`, `exits`, `raise`,
  `hostEvents`, `armOn`, `.pending` (P3), the mapper's `{ input }` (P1), `input` on fragments.
- **Gone:** the `pinning` memory list and its upkeep (P3); `PinSettled` and the mapper id guess
  (P1); public `SelectAll`, `Input`, `Show`, `First` (F1); the counters in `Debounce` and `Flash`
  (P7).
- **FAKED left:** none in this app.

---

## What the amendments changed

Non-blank, non-comment code lines. "App" is definition + machine + components. Fragments are the
shared file. Bugs are those in [reviews/correctness.md](reviews/correctness.md) for B, still open in
behaviour (a hand-made workaround counts as closed but is listed).

| | Original build | Fixed build | **Amended** |
| --- | --- | --- | --- |
| Shared fragments | 265 (10 fragments) | 265 | **228** (9 fragments) |
| Sign-in app | 222 | 239 | **229** |
| Signup app | 354 | 364 | **344** |
| Issue list app | 344 | 351 | **334** |
| **Total with fragments** | 1,185 | 1,219 | **1,135** |
| `// FAKED` markers in code | 14 | 15 | **1** |
| Correctness-review bugs open | 4 | 0 (1 closed only by a FAKED counter that needs a serialized descriptor) | **0, all closed by construction** |

The original build's line figures are the principles review's recount, made with the same method.
Its FAKED count includes the one `// FAKED (plan gap …)` marker that the review's `// FAKED:` regex
missed (13 + 1).

Net: the amended build is 84 lines smaller than the fixed build (−7 %). The biggest cut is in
the fragments (−37, mostly `Timeout` and the counters). The amended build is also 50 lines smaller
than the original buggy build, while closing every bug.

**Helped most.**

1. **F1 (`hostEvents`)** removed the most FAKED marks (5): `Reset`, `Input`, `Start`, `Show`,
   `SelectAll`, plus `Compact` and `First`. It was B's most frequent workaround, and the UI can no
   longer forge host facts. It is a one-word change in each fragment.
2. **P4 (descriptor retry)** removed the most code from any one app. `BUSY`, `Timeout`, the retry
   counter and guard, the captured `request` and its second commit are all gone. It also closed the
   retry D2 bug by construction. The "never retry unknown" rule now belongs to the runtime, not to
   host code the next feature would copy. This was B's biggest strain: no I/O in fragments meant
   retry policy was host code. P4 removes the strain without letting fragments do I/O.
3. **P2 (fenced host commits)** closed the late-verify bug by construction. The `abandonedVerifies`
   counter and its dependence on a serialized descriptor are gone.
4. **P5 (history)** removed `cancelledFrom`, the four-way `Declined` chain and the per-page Cancel.
5. **P1 + P3** removed the hand-kept `pinning` list, the id guess in the mappers, and the bookkeeping
   on success.
6. **S1 + P6 + P7 together** removed `Timeout` and the duplicated countdown. With deadlines readable
   and timers armable by events, one `Countdown` trait serves both the resend cooldown and the
   lockout. S1 also *required* the lockout to outlive its state, which a subroutine cannot do and a
   root trait can.

**Did nothing for B.**

- **F4** (subroutine memory at `s.memory.<NAME>`): no remaining subroutine has memory.
- **F5** (guard arrays): no fragment guard slot needed two guards.
- **P8** (restartOn baseline): `restartOn` is no longer used anywhere; P7 replaced it.
- **S2** was already handled in the fixed build (`SelectPage`). F1 is what made it sound.

**Still strains.**

- **Dynamic instances.** `FieldList` still duplicates `Field`, and pins are per-row only because P3
  hides the per-row state in the runtime. This is the one FAKED left.
- **Every port must be filled.** The `{ input, guards: { canEdit: () => true }, callbacks: {
  onChanged: {} } }` block still appears six times.
- **Late results are dropped, not handled.** P2 fences them, but a wrong code abandoned by Back is
  not counted toward the lockout. That needs P2's `abandoned` handler, and its shape is not drafted.
- **Time in views** now goes through `useNow` plus a deadline, which is cleaner. But where a trait's
  schedules sit in the snapshot (N1) is a new spec question for B.
- **Fragments still cannot hold I/O rules.** P4 and P2 work because they moved those rules into the
  plans, where every system gets them. B's own contribution is unchanged: locked islands of pure
  logic.
