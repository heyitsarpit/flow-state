# Build B: the three apps in the locked-island split

System: [spec-b-locked-split.md](spec-b-locked-split.md). Apps: [apps.md](apps.md). Starting style:
[collapsed-sketch.md](../collapsed-sketch.md), minus `start` and minus the I/O-shaped fragments
(`CommitWithRetry`, `Poll`), which B does not allow: a fragment never owns or waits on I/O.

Every workaround carries a `// FAKED:` comment. Where the spec is silent and I had to pick a reading,
the code carries an `// ASSUMED:` comment instead. Each is explained again where it is first used;
the list is here for reference:

- **A1.** A subroutine's memory is read at `s.memory.<STATE NAME>` (for example
  `s.memory.LOCKED_OUT.remaining`), the way a trait's is read at `s.memory.<trait name>`.
- **A2.** Ordinary host transitions may carry `raise`, not only callback and exit fillings ("A
  transition plus … the events it raises is one transition").
- **A3.** A `raise` mapper (`E.flash.Show.from(f)`) receives the same `{ event, memory }` as
  `updateMemory` on that transition, read from the pre-turn snapshot.
- **A4.** A trait placed with `.at("X")` has typed memory only where `S.X.is(s)` narrows the
  snapshot, so views read it behind that check.
- **A5.** "Outcome mappings into the fragment" are forbidden in fragments *and* aimed at fragments:
  the host maps outcomes onto its own internal events and then raises fragment events ("The host
  feeds facts to a fragment … by raising one of its events"). In these three apps nothing needs a
  server answer fed into a fragment, so this reading costs nothing here.

Operation descriptors (`Auth`, `Accounts`, `Issues`) and Story fixture Layers are imported, not
shown: adapters are out of scope in apps.md and are identical in every build. One descriptor fact
matters to the code and is stated where it is relied on: `Auth.verifyCode` is declared with a
constant key and `concurrency: "serialize"` (sign-in's late-result fence needs it).

**Line counts** in the metrics blocks are non-blank, non-comment lines per code block (the method
the principles review used), so they compare across builds.

---

## Shared fragments

One file serves all three apps.

```ts
// fragments.ts
import { deny, subroutine, trait } from "flow-state";
import { Duration, Schedule, Schema } from "effect";

// ── Field (trait): the user edits it; the host may reset it ──────────────────
// The validation error is always computed; `touched` says whether a view may show it yet
// ("the error shows after the first edit").
export const Field = <V, I>(value: Schema.Codec<V, I>, p: { validate: (v: V) => string | null }) =>
  trait(
    {
      id: "Field",
      input: { start: value }, // frozen when the field activates
      // FAKED: Reset is meant for the host only (clear the code after a wrong attempt). In B,
      // internalEvents may come only from the fragment's own schedules, so anything the host
      // raises must be a public event, and the UI could send Reset too. Host-only by convention.
      events: { Changed: { value }, Reset: {} },
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
// FAKED: logic duplicated. Each entry is a Field in all but name, but B places fragments by a
// static name (`traits: { invites: … }`), so there is no way to hold a dynamic list of Field
// instances. The list re-implements value/validation per entry and keeps no `touched` per entry.
export const FieldList = (p: { max: number; validate: (v: string) => string | null }) =>
  trait(
    {
      id: "FieldList",
      // Compact is raised by the host on Next; it is harmless for the UI to send it too.
      events: {
        Add: {},
        Remove: { index: Schema.Int },
        Changed: { index: Schema.Int, value: Schema.String },
        Compact: {},
      },
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
      // FAKED: Input comes from the host, never the UI, but B allows host-raised events only in
      // the public list. Host-only by convention.
      events: { Input: {} },
      internalEvents: { Due: {} }, // only this trait's schedule produces it
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

// ── Countdown (trait): refuses a restart until `seconds` have passed ─────────
// Lives alongside whatever states its node has (resend cooldown runs in ENTERING and in
// LOCKED_OUT), so it cannot be a subroutine. A trait has no states, so the running/idle mode is
// `remaining > 0` in memory, and the tick timer is re-armed by restartOn.
export const Countdown = (p: { seconds: number }) =>
  trait(
    {
      id: "Countdown",
      // FAKED: Start is host-only (raised when the host's own Resend is accepted). Public by
      // necessity in B; host-only by convention.
      events: { Start: {} },
      internalEvents: { Tick: {} },
      memory: { remaining: Schema.Int },
      initial: () => ({ remaining: 0 }),
    },
    ({ E }) => ({
      schedules: {
        // Every change of `remaining` re-arms a one-second tick. The change to 0 re-arms one
        // last tick, which the guard below declines: a trait cannot stop its own schedule, only
        // restart it.
        tick: { schedule: "1 second", send: E.Tick, restartOn: ({ memory }) => memory.remaining },
      },
      on: {
        // Refusing Start refuses the whole host turn that raised it, and check() agrees, so the
        // host's Resend button is disabled by this guard alone.
        Start: {
          target: "self",
          guard: ({ memory }) =>
            memory.remaining === 0 || deny("CoolingDown", { remaining: memory.remaining }),
          updateMemory: () => ({ remaining: p.seconds }),
        },
        Tick: {
          target: "self",
          guard: ({ memory }) => memory.remaining > 0 || deny("Idle"),
          updateMemory: ({ memory }) => ({ remaining: memory.remaining - 1 }),
        },
      },
    }),
  );

// ── Timeout (subroutine): counts down visibly, then exits ────────────────────
// FAKED: logic duplicated with Countdown. A subroutine can leave its host (exit) and a trait
// cannot (a callback never leaves its placement node), so a countdown that ends a state must be
// a subroutine, and a countdown that runs beside states must be a trait. Same ticking, twice.
export const Timeout = subroutine(
  {
    id: "Timeout",
    input: { seconds: Schema.Int },
    states: ["RUNNING"],
    internalEvents: { Tick: {} },
    memory: { remaining: Schema.Int },
    initial: ({ input }) => ({ remaining: input.seconds }),
    exits: { Elapsed: {} },
  },
  ({ S, E, exits }) => ({
    default: S.RUNNING,
    states: {
      RUNNING: {
        // A Schedule fires every second while RUNNING is active; leaving cancels it.
        schedules: { tick: { schedule: Schedule.spaced("1 second"), send: E.Tick } },
        on: {
          Tick: [
            {
              target: "self",
              guard: ({ memory }) => memory.remaining > 1 || deny("LastSecond"),
              updateMemory: ({ memory }) => ({ remaining: memory.remaining - 1 }),
            },
            exits.Elapsed,
          ],
        },
      },
    },
  }),
);

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
    events: { Next: {}, Previous: {}, First: {} },
    memory: { page: Schema.Int },
    initial: () => ({ page: 1 }),
    guards: ["hasNext"], // only the host knows the total
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
      // The host raises First when the rest of the query changes; it notifies nothing, so the
      // host can clear the selection itself in that same turn without two writers.
      First: { target: "self", updateMemory: () => ({ page: 1 }) },
    },
  }),
);

// ── Selection (trait): a set of ids ──────────────────────────────────────────
export const Selection = trait(
  {
    id: "Selection",
    events: {
      Toggle: { id: Schema.String },
      // FAKED: SelectAll is meant for the host only. The trait cannot read the host's list lane
      // (its input is frozen at activation), so the host derives the ids from the lane and
      // raises SelectAll; in B a raised event must be public, so any sender could still pass
      // arbitrary ids. Host-only by convention.
      SelectAll: { ids: Schema.Array(Schema.String) },
      Clear: {},
    },
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
      // FAKED: Show is host-only (the host knows what failed). Public by necessity in B.
      events: { Show: { message: Schema.String } },
      internalEvents: { Expire: {} },
      memory: { message: Schema.NullOr(Schema.String), seq: Schema.Int },
      initial: () => ({ message: null, seq: 0 }),
    },
    ({ E }) => ({
      schedules: {
        expire: { schedule: p.for, send: E.Expire, restartOn: ({ memory }) => memory.seq },
      },
      on: {
        Show: {
          target: "self",
          updateMemory: ({ event, memory }) => ({ message: event.message, seq: memory.seq + 1 }),
        },
        Expire: { target: "self", updateMemory: () => ({ message: null }) },
      },
    }),
  );
```

A fragment-alone Story (not one of the three required tests; it shows how B tests a piece):

```ts
// timeout.test.ts
import { story } from "flow-state/testing";
import { Timeout } from "./fragments";

const elapses = story
  .machine(Timeout, { id: "Timeout/elapses" })
  .enter({ seconds: 3 })
  .advance("2 seconds")
  .process()
  .checkpoint("one-left")
  .advance("1 second")
  .process()
  .checkpoint("end");

test("counts down visibly and exits on the last second", async () => {
  const run = await elapses.run();
  expect(run.checkpoints["one-left"].snapshot.memory.remaining).toBe(1);
  expect(run.checkpoints.end.exit).toEqual({ exit: "Elapsed", payload: {} });
});
```

---

## 1. Two-factor sign-in

Shape: `TWO_FACTOR` is a plain host compound, not a fragment, because it runs `verifyCode` and
`resendCode` and fragments never do I/O. Inside it: the code field (`Field` trait), the resend
cooldown (`Countdown` trait, beside every child state), and the lockout (`Timeout` subroutine as the
`LOCKED_OUT` state). The wrong-attempt counter and the error text are host memory.

```ts
// signin.definition.ts
import { definition } from "flow-state";
import { Schema } from "effect";
import { Auth } from "./auth.operations";
import { Countdown, Field, Timeout } from "../fragments";

export const SixDigitCode = Field(Schema.String, {
  validate: (v) => (/^\d{6}$/.test(v) ? null : "Enter the 6-digit code"),
});

export const SignIn = definition({
  id: "Auth/SignIn",
  states: [
    "PASSWORD",
    // LOCKED_OUT uses Timeout (a subroutine: it ends the state through its exit); the resend
    // cooldown below uses Countdown (a trait: it runs beside all three child states). Same
    // ticking, two kinds, because only a subroutine can leave and only a trait can run alongside.
    { TWO_FACTOR: ["ENTERING", "VERIFYING", { LOCKED_OUT: Timeout }] },
    "SIGNED_IN",
  ],
  // Both live while TWO_FACTOR is active and are fresh on every entry, so "Back to password"
  // drops the code and the cooldown with no host code.
  traits: {
    code: SixDigitCode.at("TWO_FACTOR"),
    resendCooldown: Countdown({ seconds: 30 }).at("TWO_FACTOR"),
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
    wrongAttempts: Schema.Int,
    error: Schema.NullOr(Schema.String),
    // Verifies left running by Back to password whose results have not landed yet. Deliberately
    // NOT reset on PasswordAccepted: it outlives the step it fences (see the machine).
    abandonedVerifies: Schema.Int,
  },
  initial: () => ({ challengeId: "", wrongAttempts: 0, error: null, abandonedVerifies: 0 }),
  operations: { Auth },
});
```

```ts
// signin.machine.ts
import { deny, machine } from "flow-state";
import { SignIn } from "./signin.definition";

const MAX_WRONG = 3;
const LOCKOUT_SECONDS = 5 * 60;

export const SignInMachine = machine(SignIn, ({ S, E, O }) => {
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

  // No outcomes mapped: apps.md gives resend no visible result. An unmapped failure or defect
  // publishes an actor issue (Machines.plan O6).
  const resendCode = O.Auth.resendCode.commit(({ memory }) => ({
    challengeId: memory.challengeId,
  }));

  // Resend is refused while the cooldown runs because the raised Start is refused, which refuses
  // this whole turn (B, "One turn"); check(s, E.Resend()) reports Denied("CoolingDown").
  const resend = {
    target: "self",
    actions: [resendCode],
    // ASSUMED (A2): an ordinary host transition may `raise`; the spec shows raise only in
    // callback and exit fillings, but says a transition plus the events it raises is one turn.
    raise: [E.resendCooldown.Start],
  } as const;

  const toEntering = (error: string) => ({
    target: S.TWO_FACTOR.ENTERING,
    updateMemory: () => ({ error }),
  });

  // FAKED: a hand-made fence for late verify results. Back to password during VERIFYING leaves
  // the verify running, and its outcome "reaches the actor's later state" (Operations.plan O2): it
  // would land on the next challenge's attempt (sign in, or cost a try). The verify is host I/O,
  // so no fragment can own or abandon it, and the outcome carries no challenge id (mappers get
  // values only). So the host counts abandoned verifies and swallows that many outcomes, first in
  // VERIFYING and at the root for ones that land elsewhere. This is correct only because the
  // verifyCode descriptor (auth.operations.ts, not shown) is declared with a constant key and
  // `concurrency: "serialize"`, so outcomes settle in submission order. What B would need: a
  // fence for host commits (correctness review §4.8) or attributable outcomes (§4.1).
  const dropAbandoned = {
    target: "self",
    guard: ({ memory }) => memory.abandonedVerifies > 0 || deny("NoneAbandoned"),
    updateMemory: ({ memory }) => ({ abandonedVerifies: memory.abandonedVerifies - 1 }),
  } as const;

  return {
    default: S.PASSWORD,

    // Abandoned verify results that land outside VERIFYING.
    on: {
      CodeAccepted: dropAbandoned,
      CodeWrong: dropAbandoned,
      CodeExpired: dropAbandoned,
      CodeUnchecked: dropAbandoned,
    },

    traits: {
      code: {
        input: () => ({ start: "" }),
        guards: {
          // FAKED: a guard receives `state` as the complete leaf path string (Machines.plan O4),
          // and token.is() takes a snapshot, so "while locked out" cannot be asked as
          // S.TWO_FACTOR.LOCKED_OUT.is(…) here. It is a prefix test on the leaf path, which
          // includes the Timeout subroutine's own inner state (TWO_FACTOR.LOCKED_OUT.RUNNING).
          // A rename of LOCKED_OUT that misses this string silently re-enables typing.
          canEdit: ({ state }) =>
            !state.startsWith("TWO_FACTOR.LOCKED_OUT") || deny("LockedOut"),
        },
        callbacks: { onChanged: {} },
      },
      resendCooldown: {},
    },

    states: {
      PASSWORD: {
        on: {
          PasswordAccepted: {
            target: S.TWO_FACTOR,
            // FAKED: "keeping nothing" holds for the fragments (fresh on entry) but the host's
            // own step memory is reset by hand here. A convention, not a rule: forget a key and
            // it leaks into the next attempt.
            updateMemory: ({ event }) => ({
              challengeId: event.challengeId,
              wrongAttempts: 0,
              error: null,
            }),
          },
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
              // Leaving mid-verify abandons it: count it so its result is swallowed later.
              BackToPassword: {
                target: S.PASSWORD,
                updateMemory: ({ memory }) => ({
                  abandonedVerifies: memory.abandonedVerifies + 1,
                }),
              },
              // Each outcome first swallows an abandoned verify's result, if one is due.
              CodeAccepted: [dropAbandoned, { target: S.SIGNED_IN }],
              CodeWrong: [
                dropAbandoned,
                {
                  target: S.TWO_FACTOR.LOCKED_OUT,
                  guard: ({ memory }) =>
                    memory.wrongAttempts + 1 >= MAX_WRONG || deny("TriesLeft"),
                  updateMemory: () => ({ wrongAttempts: MAX_WRONG, error: null }),
                  raise: [E.code.Reset],
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
              CodeExpired: [dropAbandoned, toEntering("Code expired, send a new one")],
              CodeUnchecked: [dropAbandoned, toEntering("Couldn't check the code, try again")],
            },
          },

          // One filling block for the subroutine, on its state. Submit has no handler here, so
          // it is Unhandled; typing is refused by the code field's canEdit guard.
          LOCKED_OUT: {
            input: () => ({ seconds: LOCKOUT_SECONDS }),
            exits: {
              Elapsed: {
                target: S.TWO_FACTOR.ENTERING,
                updateMemory: () => ({ wrongAttempts: 0, error: null }),
              },
            },
            on: { Resend: resend },
          },
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
import { useActor, useView } from "flow-state/react";
import { shownError } from "../fragments";
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
  // ASSUMED (A4): trait memory is typed only under the token that places it.
  const code = useView(signIn, (s) => (S.TWO_FACTOR.is(s) ? s.memory.code.value : ""));
  const codeError = useView(signIn, (s) => (S.TWO_FACTOR.is(s) ? shownError(s.memory.code) : null));
  const resendIn = useView(signIn, (s) =>
    S.TWO_FACTOR.is(s) ? s.memory.resendCooldown.remaining : 0,
  );
  // ASSUMED (A1): the spec does not say where a subroutine's memory sits in the snapshot. Read
  // here as s.memory.<STATE NAME>, the way a trait's sits at s.memory.<trait name>.
  const lockedFor = useView(signIn, (s) =>
    S.TWO_FACTOR.LOCKED_OUT.is(s) ? s.memory.LOCKED_OUT.remaining : null,
  );
  const error = useView(signIn, (s) => s.memory.error);
  const verifying = useView(signIn, (s) => S.TWO_FACTOR.VERIFYING.is(s));

  // Enablement comes only from check; the fragment guards (canEdit, CoolingDown) answer through it.
  const canType = useView(
    signIn,
    (s) => check(s, E.code.Changed({ value: "" }))._tag === "Allowed",
  );
  const canSubmit = useView(signIn, (s) => check(s, E.Submit())._tag === "Allowed");
  const canResend = useView(signIn, (s) => check(s, E.Resend())._tag === "Allowed");

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
      {/* signIn.send(E.CodeWrong())        ← type error: internal, host only          */}
      {/* signIn.send(E.code.Reset())       ← compiles: B has no host-only public event */}
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
  .send(E.Resend()) // allowed while locked out
  .process()
  .advance("4 minutes")
  .process()
  .checkpoint("one-minute-left")
  .advance("1 minute")
  .process()
  .checkpoint("unlocked");

test("three wrong codes lock the step for five minutes, then reset attempts", async () => {
  const run = await lockedOut.run();

  const one = run.checkpoints["one-wrong"].snapshot;
  expect(one.state).toBe("TWO_FACTOR.ENTERING");
  expect(one.memory.error).toBe("Wrong code, 2 tries left");
  expect(one.memory.code.value).toBe("");

  const locked = run.checkpoints.locked.snapshot;
  expect(locked.state).toBe("TWO_FACTOR.LOCKED_OUT.RUNNING");
  expect(locked.memory.LOCKED_OUT.remaining).toBe(300); // ASSUMED (A1)
  expect(check(locked, E.Submit())).toEqual({ _tag: "Unhandled" });
  expect(check(locked, E.code.Changed({ value: "1" }))._tag).toBe("Denied"); // LockedOut

  const later = run.checkpoints["one-minute-left"].snapshot;
  expect(later.memory.LOCKED_OUT.remaining).toBe(60);
  expect(later.memory.resendCooldown.remaining).toBe(0); // the 30 s cooldown ran out meanwhile

  const unlocked = run.checkpoints.unlocked.snapshot;
  expect(unlocked.state).toBe("TWO_FACTOR.ENTERING");
  expect(unlocked.memory.wrongAttempts).toBe(0);
  expect(check(unlocked, E.code.Changed({ value: "1" }))).toEqual({ _tag: "Allowed" });
});
```

Stories accept no callbacks, so the three wrong attempts are spelled out.

### Metrics: sign-in

| Piece | Lines |
| --- | --- |
| Fragments used (`Field`, `Countdown`, `Timeout`, from the shared file) | 46 + 28 + 29 = 103 of 265 |
| Definition | 39 |
| Machine | 128 |
| Component | 72 |
| **App total** (definition + machine + component) | **239** |
| Story test | 47 |

- **New keywords used (9):** `trait`, `subroutine`, `traits`, `.at`, `guards`, `callbacks`,
  `exits`, `raise`, plus `input` on fragments (the host does not call `notify`; the fragments do).
- **FAKED here (4):** host-only `Reset`/`Start` as public events (fragment file); lockout tested
  by a leaf-path string prefix; host step memory reset by hand on entry; the hand-made
  `abandonedVerifies` fence against late verify results (correct only with a serialized
  descriptor).
- **Duplicated across apps:** the countdown ticking (`Countdown` vs `Timeout`, fragment file);
  the "operation outcome → host internal event → host handler" pattern, which every app repeats
  because no fragment may hold it.

---

## 2. Signup wizard

Shape: five root traits (four `Field`s and one `FieldList`) hold the drafts for the actor's whole
life, so Back and Next keep them with no code. Pages are plain host states. Cancel enters a
`Confirm` subroutine; the Busy backoff enters a `Timeout` subroutine. Submitting is host-owned
(`SUBMITTING`): the retry policy that `CommitWithRetry` held in the sketch is host code in B.

```ts
// signup.definition.ts
import { definition } from "flow-state";
import { Schema } from "effect";
import { Accounts } from "./accounts.operations";
import { Confirm, Field, FieldList, Timeout } from "../fragments";

export const Role = Schema.Literals(["engineer", "designer", "manager"]);

export const Page = Schema.Literals(["ACCOUNT", "PROFILE", "INVITE", "REVIEW"]);

export const emailRule = (v: string) => (v.includes("@") ? null : "Enter an email address");

const required = (v: string) => (v.trim() ? null : "Required");

export const MAX_INVITES = 5;

// What Review shows and Submit sends, captured once so retries resend exactly this.
export const CreateRequest = Schema.Struct({
  email: Schema.String,
  password: Schema.String,
  name: Schema.String,
  role: Role,
  invites: Schema.Array(Schema.String),
});

export const Signup = definition({
  id: "Accounts/Signup",
  states: [
    "ACCOUNT",
    "PROFILE",
    "INVITE",
    "REVIEW",
    { CANCELLING: Confirm },
    "SUBMITTING",
    { BUSY: Timeout },
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
  internalEvents: { Created: {}, EmailTaken: {}, Busy: {}, Unsure: {} },
  memory: {
    // FAKED: modes kept in memory. Confirm is one state shared by four pages, and B has no
    // history, so the page to return to on Keep is a memory value read by ordered alternatives.
    cancelledFrom: Page,
    busyRetries: Schema.Int,
    error: Schema.NullOr(Schema.String),
    request: Schema.NullOr(CreateRequest), // set on Submit; the retries send it unchanged
  },
  initial: () => ({ cancelledFrom: "ACCOUNT", busyRetries: 0, error: null, request: null }),
  operations: { Accounts },
});
```

```ts
// signup.machine.ts
import { deny, machine } from "flow-state";
import { listErrors } from "../fragments";
import { emailRule, Signup } from "./signup.definition";

const MAX_BUSY_RETRIES = 3;

type Memory = typeof Signup.Memory.Type;

const accountValid = ({ memory }: { memory: Memory }) =>
  (memory.email.error === null && memory.password.error === null) || deny("AccountInvalid");

const profileValid = ({ memory }: { memory: Memory }) =>
  (memory.name.error === null && memory.role.error === null) || deny("ProfileInvalid");

const invitesValid = ({ memory }: { memory: Memory }) =>
  listErrors(memory.invites.items, emailRule).every((e) => e === null) || deny("InvitesInvalid");

const reviewed = (memory: Memory) => ({
  email: memory.email.value,
  password: memory.password.value,
  name: memory.name.value,
  role: memory.role.value!, // profileValid guarantees it; the type cannot see the guard
  invites: memory.invites.items, // compacted on Next from INVITE
});

export const SignupMachine = machine(Signup, ({ S, E, O }) => {
  const outcomes = {
    success: E.Created,
    failure: { EmailTaken: E.EmailTaken, Busy: E.Busy },
    unknown: E.Unsure,
    interrupt: E.Unsure,
    defect: E.Unsure,
  };

  // The fields stay editable by any sender during SUBMITTING and BUSY (their canEdit is
  // `() => true`, and the events are public), so a retry must not re-read them. Submit sends the
  // reviewed fields and captures them; each retry sends the captured request. Action parameters
  // read the pre-turn snapshot, so Submit cannot send `memory.request` it writes in that turn;
  // hence two commits.
  const createReviewed = O.Accounts.create.commit(({ memory }) => reviewed(memory), { outcomes });
  const createAgain = O.Accounts.create.commit(({ memory }) => memory.request!, { outcomes }); // set by Submit before BUSY can be entered

  const cancelFrom = (page: typeof Signup.Memory.Type.cancelledFrom) => ({
    target: S.CANCELLING,
    updateMemory: () => ({ cancelledFrom: page }),
  });

  // Every Field port must be filled, even where the host has nothing to say.
  const editable = { canEdit: () => true as const };

  return {
    default: S.ACCOUNT,

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
      ACCOUNT: {
        on: {
          Next: { target: S.PROFILE, guard: accountValid, updateMemory: () => ({ error: null }) },
          Cancel: cancelFrom("ACCOUNT"),
        },
      },
      PROFILE: {
        on: {
          Next: { target: S.INVITE, guard: profileValid },
          Back: S.ACCOUNT,
          Cancel: cancelFrom("PROFILE"),
        },
      },
      INVITE: {
        on: {
          // Empty entries are dropped on Next, by the list itself, in this same turn.
          Next: { target: S.REVIEW, guard: invitesValid, raise: [E.invites.Compact] },
          Back: S.PROFILE,
          Cancel: cancelFrom("INVITE"),
        },
      },
      REVIEW: {
        on: {
          Submit: {
            target: S.SUBMITTING,
            updateMemory: ({ memory }) => ({
              busyRetries: 0,
              error: null,
              request: reviewed(memory),
            }),
            actions: [createReviewed],
          },
          Back: S.INVITE,
          Cancel: cancelFrom("REVIEW"),
        },
      },

      CANCELLING: {
        exits: {
          Confirmed: S.CANCELLED,
          // FAKED: the "history" of the cancelled page, as ordered alternatives over memory.
          Declined: [
            { target: S.ACCOUNT, guard: ({ memory }) => memory.cancelledFrom === "ACCOUNT" || deny("Not") },
            { target: S.PROFILE, guard: ({ memory }) => memory.cancelledFrom === "PROFILE" || deny("Not") },
            { target: S.INVITE, guard: ({ memory }) => memory.cancelledFrom === "INVITE" || deny("Not") },
            S.REVIEW,
          ],
        },
      },

      // FAKED: host wiring standing in for a reusable piece. "Retry on Busy with backoff, never
      // retry unknown" is the sketch's CommitWithRetry, which B forbids because it waits on I/O.
      // Only the wait (Timeout) is a fragment; the counting and the decision are host code that
      // the next app needing retries will copy.
      SUBMITTING: {
        on: {
          Created: S.DONE,
          EmailTaken: {
            target: S.ACCOUNT,
            updateMemory: () => ({ error: "That email is registered" }),
          },
          Busy: [
            {
              target: S.BUSY,
              guard: ({ memory }) =>
                memory.busyRetries < MAX_BUSY_RETRIES || deny("NoRetriesLeft"),
              updateMemory: ({ memory }) => ({ busyRetries: memory.busyRetries + 1 }),
            },
            { target: S.REVIEW, updateMemory: () => ({ error: "Try again later" }) },
          ],
          Unsure: S.UNSURE,
        },
      },

      // The filler reads memory after the entering transition's update: 1 s, 2 s, 4 s.
      BUSY: {
        input: ({ memory }) => ({ seconds: 2 ** (memory.busyRetries - 1) }),
        exits: { Elapsed: { target: S.SUBMITTING, actions: [createAgain] } },
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
import { emailRule, MAX_INVITES, Role, Signup } from "./signup.definition";
import { SignupMachine } from "./signup.machine";

const { S, E } = Signup;

type SignupActor = Actor<typeof SignupMachine>;

export function SignupWizard() {
  const signup = useActor(SignupMachine);
  const step = useView(signup, (s) => S.root.child(s));

  const body = {
    ACCOUNT: <AccountPage signup={signup} />,
    PROFILE: <ProfilePage signup={signup} />,
    INVITE: <InvitePage signup={signup} />,
    REVIEW: <ReviewPage signup={signup} />,
    CANCELLING: <DiscardDialog signup={signup} />,
    SUBMITTING: <ReviewPage signup={signup} />,
    BUSY: <ReviewPage signup={signup} />,
    UNSURE: <p role="status">Your account may have been created; check your email.</p>,
    DONE: <p role="status">Welcome aboard.</p>,
    CANCELLED: <p>Signup discarded.</p>,
  } satisfies Record<typeof step, React.ReactNode>;

  return body[step];
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
  const retrying = useView(signup, (s) =>
    S.BUSY.is(s) || (S.SUBMITTING.is(s) && s.memory.busyRetries > 0)
      ? s.memory.busyRetries
      : 0,
  );
  const submitting = useView(signup, (s) => S.SUBMITTING.is(s) || S.BUSY.is(s));
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
      {retrying > 0 && <p role="status">Server busy, retrying ({retrying}/3)</p>}
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
    expect(s.state).toBe("BUSY.RUNNING");
    expect(s.memory.busyRetries).toBe(n);
    expect(check(s, E.Cancel())).toEqual({ _tag: "Unhandled" }); // refused while submitting
  }

  const end = run.checkpoints["gave-up"].snapshot;
  expect(end.state).toBe("REVIEW");
  expect(end.memory.error).toBe("Try again later");
  expect(end.memory.email.value).toBe("ada@example.com"); // drafts intact
  expect(end.memory.request?.invites).toEqual(["grace@example.com"]); // what every retry sent
});
```

### Metrics: signup

| Piece | Lines |
| --- | --- |
| Fragments used (`Field`, `FieldList`, `Timeout`, `Confirm`) | 46 + 42 + 29 + 10 = 127 of 265 |
| Definition | 50 |
| Machine | 122 |
| Components | 192 |
| **App total** (definition + machine + components) | **364** |
| Story test | 48 |

- **New keywords used (8):** `trait`, `subroutine`, `traits`, `guards`, `callbacks`, `exits`,
  `raise`, `input` on fragments. (`.at` not needed: every trait lives at the root.)
- **FAKED here (3):** `cancelledFrom` as a memory mode plus four ordered exit alternatives (no
  history); the Busy retry policy as host wiring, including the captured `request` that keeps
  retries sending what was reviewed; `FieldList` duplicating `Field` per entry.
- **Duplicated across apps:** the retry/backoff policy would be copied into any later app that
  retries a commit; the `{ input: () => ({ start: "" }), guards: { canEdit: () => true },
  callbacks: { onChanged: {} } }` filling block appears six times across apps 1–3.

---

## 3. Issue list screen

Shape: everything that runs side by side (search field, debounce, pager, selection, flash) is a root
trait. The one sequential flow, bulk delete, is the host's state tree: `BROWSING`, a `Hold`
subroutine, then `DELETING`. The list read, the 30 s refresh and the pins are host work.

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
    Pin: { id: Schema.String, title: Schema.String, pinned: Schema.Boolean },
    SelectPage: {}, // "select all on this page"; the host takes the ids from the lane
    HoldDelete: {}, // pointer down; the release is E.HOLDING.Release
  },
  internalEvents: {
    RefreshDue: {},
    PinSettled: { id: Schema.String },
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
    // FAKED: per-row modes kept in memory. Each in-flight pin is its own little state machine
    // (idle → pinning → idle/failed), but a fragment cannot be instantiated per row and a pin does
    // I/O, so the in-flight rows are a list the host maintains by hand.
    pinning: Schema.Array(Schema.Struct({ id: Schema.String, title: Schema.String })),
  },
  initial: () => ({
    appliedSearch: "",
    sort: { field: "updated", dir: "desc" },
    status: "open",
    pinning: [],
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
  // Pager.First notifies nothing, so selection has exactly one writer.
  // ASSUMED (A2): ordinary host transitions may `raise` (the spec shows it in fillings only).
  const queryReset = [E.pager.First, E.selection.Clear];

  const pin = O.Issues.setPinned.commit(
    ({ event }) => ({ id: event.id, pinned: event.pinned }),
    {
      // The row shows the new value at once; failure removes this update (Operations.plan O5).
      optimistic: O.Issues.list.setData(({ memory, event }) => ({
        key: listQuery({ memory }),
        data: (page) => ({
          ...page,
          items: page.items.map((i) => (i.id === event.id ? { ...i, pinned: event.pinned } : i)),
        }),
      })),
      // FAKED (plan gap, every build): outcome mappers receive values only, so a failure cannot
      // say which row it was for. Assumed here: the mapper's second argument is the Attempt,
      // whose input carries the id.
      outcomes: {
        success: E.PinSettled.from((_, attempt) => ({ id: attempt.input.id })),
        failure: E.PinFailed.from((_, attempt) => ({ id: attempt.input.id })),
        // unknown keeps the optimistic value until a confirming read lands (Operations.plan O5),
        // so PinUnsure also refetches: the row then shows whatever the server has.
        unknown: E.PinUnsure.from((attempt) => ({ id: attempt.input.id })),
        interrupt: E.PinFailed.from((_, attempt) => ({ id: attempt.input.id })),
        defect: E.PinFailed.from((_, attempt) => ({ id: attempt.input.id })),
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

  const done = (id: string, pinning: Memory["pinning"]) => pinning.filter((p) => p.id !== id);

  // A failed or unsure pin: unlock the row and flash its title. The optimistic value is already
  // gone on failure; on unknown the caller adds a refetch.
  const pinNotDone = {
    target: "self",
    updateMemory: ({ event, memory }) => ({ pinning: done(event.id, memory.pinning) }),
    raise: [
      // ASSUMED (A3): a raise mapper reads the same pre-turn { event, memory, activities } as
      // updateMemory and action parameters on that transition.
      E.flash.Show.from(({ event, memory }) => ({
        message: `Couldn't pin ${memory.pinning.find((p) => p.id === event.id)?.title ?? "issue"}`,
      })),
    ],
  } as const;

  const hasSelection = ({ memory }: { memory: Memory }) =>
    memory.selection.ids.length > 0 || deny("NothingSelected");

  return {
    default: S.BROWSING,

    activities: {
      issues: O.Issues.list.subscribe(listQuery),
    },

    // Replaces the sketch's Poll subroutine, which B forbids (it waits on I/O). One host line.
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
        guard: ({ event, memory }) =>
          !memory.pinning.some((p) => p.id === event.id) || deny("PinInFlight"),
        updateMemory: ({ event, memory }) => ({
          pinning: [...memory.pinning, { id: event.id, title: event.title }],
        }),
        actions: [pin],
      },
      PinSettled: {
        target: "self",
        updateMemory: ({ event, memory }) => ({ pinning: done(event.id, memory.pinning) }),
      },
      PinFailed: pinNotDone,
      PinUnsure: { ...pinNotDone, actions: [refetch] },
      // The ids come from the lane the guard and the query agree on, never from the sender, so
      // a stale click from the previous page cannot select rows that are no longer shown.
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
          // The selection can be cleared mid-hold (a refresh does not, a query change does).
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
  const pinning = useView(list, (s) => s.memory.pinning.map((p) => p.id));
  const items = lane?.data?.items ?? [];
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
              onChange={() =>
                // Select-all sends no ids: the host reads them from the lane. Sending
                // E.selection.SelectAll({ ids }) directly would also compile (B has no
                // host-only public events) and would trust whatever ids it carried.
                list.send(allSelected ? E.selection.Clear() : E.SelectPage())
              }
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
              {/* the optimistic value is already in the lane; the guard refuses a second click */}
              <button
                aria-pressed={issue.pinned}
                disabled={pinning.includes(issue.id)}
                onClick={() =>
                  list.send(E.Pin({ id: issue.id, title: issue.title, pinned: !issue.pinned }))
                }
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

const pin = E.Pin({ id: "I-1", title: "Crash on save", pinned: true });

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

  expect(row("pinning")?.pinned).toBe(true); // optimistic
  expect(check(run.checkpoints.pinning.snapshot, pin)._tag).toBe("Denied"); // PinInFlight

  expect(row("reverted")?.pinned).toBe(false);
  expect(run.checkpoints.reverted.snapshot.memory.flash.message).toBe("Couldn't pin Crash on save");

  expect(run.checkpoints["flash-gone"].snapshot.memory.flash.message).toBeNull();
  expect(check(run.checkpoints["flash-gone"].snapshot, pin)).toEqual({ _tag: "Allowed" });
});
```

### Metrics: issue list

| Piece | Lines |
| --- | --- |
| Fragments used (`Field`, `Debounce`, `Pager`, `Selection`, `Flash`, `Hold`) | 46 + 20 + 27 + 26 + 22 + 13 = 154 of 265 |
| Definition | 50 |
| Machine | 156 |
| Components | 145 |
| **App total** (definition + machine + components) | **351** |
| Story test | 39 |

- **New keywords used (8):** `trait`, `subroutine`, `traits`, `guards`, `callbacks`, `exits`,
  `raise`, `input` on fragments.
- **FAKED here (4):** per-row pin modes in memory; the outcome-mapper id gap (shared with every
  build); `Selection.SelectAll` host-only by convention (the host now derives the ids from the
  lane, but the event stays public); `Debounce.Input` and `Flash.Show` public by convention
  (fragment file).
- **Duplicated across apps:** the outcome → host event → `raise` into a fragment pattern; the
  "flash an error" idea also appears as `memory.error` in apps 1 and 2, which do not reuse `Flash`
  because their errors persist until the next action.

---

## Totals

Non-blank, non-comment lines.

| | Sign-in | Signup | Issue list | All |
| --- | --- | --- | --- | --- |
| Definition | 39 | 50 | 50 | 139 |
| Machine | 128 | 122 | 156 | 406 |
| Components | 72 | 192 | 145 | 409 |
| **App code** | **239** | **364** | **351** | **954** |
| Fragments it uses (of the shared 265) | 103 | 127 | 154 | 265 shared |
| Story test | 47 | 48 | 39 | 134 (+16 for the Timeout story) |

**Total with the shared fragments: 1,219.**

Fragment reuse across apps: `Field` (all three, 6 instances), `Timeout` (apps 1 and 2), `Countdown`
(1), `Confirm` (2), `FieldList` (2), `Debounce` / `Pager` / `Selection` / `Flash` / `Hold` (3).

---

## How this system felt

**Easy.** Anything that is pure state on the screen dropped in cleanly and stayed small: `Field`,
`Pager`, `Selection`, `Flash`, `Confirm`, `Hold`. The two-kind split matched the apps well: side-by-
side concerns (search, pager, selection, flash, the resend cooldown) were traits, and sequential
interruptions (lockout, discard dialog, busy backoff, hold-to-confirm) were subroutines. Root traits
made "drafts survive Back/Next" free, and `.at("TWO_FACTOR")` made "keep nothing on Back to
password" free for fragment state. The "one turn" rule was the nicest surprise: a fragment's own
guard (`Countdown.Start` refused while cooling down) refuses the host transition that raises into
it, and `check()` reports it, so the Resend button needed no host guard at all. Machines read
exactly like today's machines, because every operation is still an ordinary host action with
ordinary outcomes.

**What strained.**

1. **Host-only events don't exist.** B lets `internalEvents` come only from a fragment's own
   schedules, so everything a host feeds in (`Field.Reset`, `Debounce.Input`, `Countdown.Start`,
   `Flash.Show`) must be public, and the UI can send them. This was the most frequent FAKED mark
   (4 of the 10 fragments). The collapsed sketch's H3 has flipped: the UI can now forge host
   facts instead of the host forging timer ticks.
2. **The trait/subroutine wall splits one idea in two.** A countdown that ends a state must be a
   subroutine (only exits leave); a countdown that runs beside states must be a trait (subroutines
   are states, and there are no parallel states). Same ticking logic, written twice (`Timeout`,
   `Countdown`). A trait also cannot stop its own schedule, only re-arm it, so `Countdown` leaves
   one declined stray tick per run.
3. **No I/O in fragments means every I/O rule is host code, with host-code bugs.** The sketch's `CommitWithRetry` was the
   most valuable reusable piece in the apps (signup's "retry Busy 1/2/4 s, never retry unknown"),
   and B forbids it. Only the wait became a fragment; the counting, the cap, and the
   unknown-is-never-retried rule are host code the next feature will copy. Same for per-row pins:
   per-row in-flight modes became a host-maintained list. The review found the cost of this:
   because the host re-read live fields on retry, signup could send a different account than the
   one reviewed (now fixed with a captured `request`), and because the verify is a plain host
   commit, a late result from an abandoned two-factor step could land on the next attempt. B has
   nothing to fence that; the fix is a hand-kept `abandonedVerifies` counter that is correct only
   while the descriptor serializes. Both are exactly the problems the I/O-shaped fragments it
   bans were meant to solve.
4. **No history.** Returning from the shared Cancel dialog to the right page took a memory mode and
   four ordered exit alternatives.
5. **Dynamic instances.** A list of invite fields cannot be a list of `Field`s; `FieldList`
   duplicates field logic.
6. **Small spec gaps** that every reader will trip on: where a subroutine's memory lives in the
   snapshot (A1), whether ordinary transitions may `raise` (A2), how a guard asks "am I inside
   that subroutine" (the leaf-path string prefix in sign-in).

**Faked most:** host-only events forced public (5, counting `Selection.SelectAll`), then duplicated
logic (Countdown/Timeout, Field/FieldList), modes in memory (`cancelledFrom`, `pinning`), and
hand-made fencing of host I/O (`abandonedVerifies`, the captured signup `request`).

**Reused across apps:** `Field` (all three), `Timeout` (lockout and busy backoff, the best reuse:
one subroutine, two very different meanings), and the overall host pattern "commit → outcome to
host event → raise into fragment". Ceremony that repeated: the six identical `Field` filling
blocks (`input`, `canEdit: () => true`, `onChanged: {}`), since every port must be filled.

---

## Fix log

Findings from [reviews/correctness.md](reviews/correctness.md) (bugs) and
[reviews/principles.md](reviews/principles.md) (clarity), B's fix lists.

**Bugs**

1. **App 1: a late verify from an abandoned step reaches the next attempt.** Fixed within B, as a
   FAKED workaround. Back during VERIFYING now counts an abandoned verify (`abandonedVerifies`,
   never reset by `PasswordAccepted`). Every verify outcome first tries a `dropAbandoned`
   alternative, in VERIFYING and at the root, so that many late results are swallowed wherever
   they land. This is only correct because `verifyCode` is serialized under a constant key, so
   results arrive in submission order. B has no fence for host commits. A real fix needs either
   per-state fencing of host commits (§4.8) or outcomes that carry the attempt (§4.1).
2. **App 2: retries re-read fields that stay editable during SUBMITTING and BUSY (D2).** Fixed.
   Submit captures `request` in memory and sends the reviewed fields (`createReviewed`). Each retry
   sends the captured request (`createAgain`). There are two commits because action parameters read
   the pre-turn snapshot. The fields stay editable by any sender, but that no longer reaches the
   server. The Story asserts the captured request.
3. **App 3: an `unknown` pin never refetched.** Fixed. A new `PinUnsure` event does what
   `PinFailed` does and also refetches, so the row shows the server's value instead of the
   optimistic one.
4. **App 3: `SelectAll` trusted the sender's ids.** Fixed in the host. The view sends `SelectPage`
   with no ids, and the host raises `selection.SelectAll` with ids taken from the lane. A stale
   click after a page turn now selects only rows the lane has. `Selection.SelectAll` itself must
   stay public in B, so a direct sender can still pass any ids. That is now marked FAKED
   (host-only by convention), not fixed.

**Clarity**

1. **ASSUMED A1/A2 only in the preamble.** Each is now explained in full where it is first used
   (A1 at the lockout countdown read, A2 at the first `raise`, A3 at the pin flash). The preamble
   list stays, for reference.
2. **Why both `Countdown` and `Timeout`.** There is now a comment at the sign-in state list.
3. **The leaf-path string-prefix guard.** It stays, because B's guards get the leaf path as a
   string and `token.is` takes a snapshot. The comment where `canEdit` is filled now explains this
   and names the rename hazard.
4. **Select-all trust in the component.** The component comment now says the view sends no ids,
   and that a direct `SelectAll` would still compile.
5. **Per-app totals.** The totals table is now per app. All counts use the review's method
   (non-blank, non-comment lines), and the method is stated in the preamble.

**Not changed.** The pin attribution gap (§4.1) stays FAKED: the mapper is assumed to receive the
Attempt. `interrupt` and `defect` have no attribution in today's plans, so they are not
attributable in B either. The 2FA lockout bypass through Back (§4.9) is what apps.md specifies.
