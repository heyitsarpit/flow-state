# Build C, amended: single stateless fragment

This is [build-c-single-fragment.md](build-c-single-fragment.md) (after its fix pass) rebuilt with
every amendment from [amendments.md](amendments.md) that applies to System C:

- **Plan-level:** P1–P8.
- **Spec fixes:** S1–S3.
- **System-level:** F1 (`hostEvents`), F2 (ordinary transitions may `raise`), F3 (token guards),
  F5 (guard arrays).

F4 and F6 apply to other systems. The system itself is unchanged apart from these: one stateless
`fragment`, placed bare or with `.at`, no I/O, no fragment states, and callbacks that may move the
host anywhere.

Each use is marked `// AMENDMENT <id>:`. Where the draft syntax leaves a choice, the code says
`// ASSUMED:`. Every workaround that remains keeps its `// FAKED:`.

**Readings kept from the first build:**

- A fragment's memory is a slice of the host's memory under its instance name.
- A slice of an `.at` placement is `undefined` while its node is inactive, and typed optional.

**Readings this pass adds:**

- **ASSUMED (P6):** fragment schedules appear in the snapshot under their instance path, nested
  like memory: `s.schedules.resend?.timer?.end?.dueAt`. Guards still receive Machines O4's
  `{ event, state, memory, context, activities }`, without schedules, so a guard that needs "is a
  timer running?" still reads a memory flag.
- **ASSUMED (P7):** `armOn` arms when one of the listed events' transitions is **accepted**. A
  refused event does not arm. The firing's `armedAt` metadata (Machines O5) is the arming turn's
  `now`.
- **ASSUMED (P2):** a commit "started in a state" is fenced to the activation of the starting
  transition's **target**. For `target: "self"`, it is the handler's own node. So Submit's verify,
  which targets VERIFYING, is fenced to VERIFYING, and a Pin handled on OPEN with `"self"` is
  fenced to OPEN.
- **ASSUMED (F1):** the `story.machine` harness plays the host, so it may send a fragment's
  `hostEvents` as well as its `events`.

---

## Shared fragments

Three fragments of the first build are gone:

- `Confirm`: the dialog is a host state again, made cheap by P5.
- `Backoff`: retry is a descriptor policy (P4).
- `InFlight`: replaced by `pending` (P3).

`Timeout` is new: P7 makes "a timer started by an event" a one-line schedule, so `Cooldown` and
`Strikes` now share one timer piece instead of each carrying a counter.

```ts
// fragments.ts
// Locked islands: no operations, no states, no context. Timers are armed by events (P7).
import { Duration, Schema } from "effect";
import { deny, fragment } from "flow-state";

// ── Field: a value the user edits; the host may set it ─────────────────────────────────────────
// error is always computed; touched says whether the view may show it ("after the first edit").
export const Field = <V, I>(
  value: Schema.Codec<V, I>,
  p: { validate: (v: V) => string | null },
) =>
  fragment(
    {
      id: "Field",
      input: { start: value },
      events: { Changed: { value } }, // the user types
      // AMENDMENT F1: Set is host-only; no component can send it.
      hostEvents: { Set: { value } },
      memory: { value, error: Schema.NullOr(Schema.String), touched: Schema.Boolean },
      initial: ({ input }) => ({
        value: input.start,
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
        Set: {
          target: "self",
          updateMemory: ({ event }) => ({
            value: event.value,
            error: p.validate(event.value),
            touched: false,
          }),
        },
      },
    }),
  );

// ── Timeout: started by its host, ends once after a while ──────────────────────────────────────
export const Timeout = (p: { for: Duration.Input }) =>
  fragment(
    {
      id: "Timeout",
      hostEvents: { Start: {} }, // AMENDMENT F1: only the direct parent starts it
      internalEvents: { Ended: {} },
      // FAKED: modes kept in memory. running mirrors the armed schedule because guards cannot read
      // schedules (ASSUMED above); views read the deadline from the snapshot instead (P6).
      memory: { running: Schema.Boolean },
      initial: () => ({ running: false }),
      callbacks: { onEnded: {} },
    },
    ({ E, callbacks }) => ({
      schedules: {
        // AMENDMENT P7: armed by Start (re-arming restarts it); no counter, no restartOn.
        // AMENDMENT P6: its deadline is s.schedules.<instance path>.end.dueAt; no copy in memory.
        end: { schedule: p.for, send: E.Ended, armOn: [E.Start] },
      },
      on: {
        Start: { target: "self", updateMemory: () => ({ running: true }) },
        Ended: {
          target: "self",
          updateMemory: () => ({ running: false }),
          notify: [callbacks.onEnded],
        },
      },
    }),
  );

// ── Cooldown: Use is refused for a while after each use ─────────────────────────────────────────
// A public gate over a host-only Timeout, so the user can Use it but cannot start the timer alone.
export const Cooldown = (p: { for: Duration.Input }) =>
  fragment(
    {
      id: "Cooldown",
      events: { Use: {} },
      fragments: { timer: Timeout({ for: p.for }) },
      callbacks: { onUse: {} },
    },
    ({ E, callbacks }) => ({
      fragments: { timer: { callbacks: { onEnded: {} } } },
      on: {
        Use: {
          target: "self",
          guard: ({ memory }) => !memory.timer.running || deny("CoolingDown"),
          raise: [E.timer.Start], // AMENDMENT F2: an ordinary transition raising a child's hostEvent
          notify: [callbacks.onUse],
        },
      },
    }),
  );

// ── Strikes: counts failures; the max-th one locks for a while, then the count resets ───────────
export const Strikes = (p: { max: number; lockFor: Duration.Input }) =>
  fragment(
    {
      id: "Strikes",
      hostEvents: { Strike: {} }, // AMENDMENT F1: only the host reports a failure
      memory: { count: Schema.Int },
      initial: () => ({ count: 0 }),
      fragments: { lock: Timeout({ for: p.lockFor }) },
      callbacks: { onStruck: { left: Schema.Int }, onLocked: {} },
    },
    ({ E, callbacks }) => ({
      fragments: {
        lock: {
          callbacks: { onEnded: { target: "self", updateMemory: () => ({ count: 0 }) } },
        },
      },
      on: {
        Strike: [
          {
            target: "self",
            guard: ({ memory }) => memory.count + 1 < p.max || deny("LastStrike"),
            updateMemory: ({ memory }) => ({ count: memory.count + 1 }),
            notify: [
              callbacks.onStruck.from(({ memory }) => ({ left: p.max - memory.count - 1 })),
            ],
          },
          {
            target: "self",
            updateMemory: () => ({ count: p.max }),
            // FAKED: modes kept in memory. "Locked" is lock.running, not a mode of Strikes; every
            // host guard that must refuse while locked reads it.
            raise: [E.lock.Start], // AMENDMENT F1: host-only, so no UI can lock itself out
            notify: [callbacks.onLocked],
          },
        ],
      },
    }),
  );

// ── Debounce: tells its host once, `wait` after the last Input ─────────────────────────────────
export const Debounce = (p: { wait: Duration.Input }) =>
  fragment(
    {
      id: "Debounce",
      hostEvents: { Input: {} }, // AMENDMENT F1
      internalEvents: { Due: {} },
      callbacks: { onSettled: {} },
    },
    ({ E, callbacks }) => ({
      schedules: {
        // AMENDMENT P7: every Input re-arms (restarts) the wait; no memory at all.
        settle: { schedule: p.wait, send: E.Due, armOn: [E.Input] },
      },
      on: {
        Input: { target: "self" },
        Due: { target: "self", notify: [callbacks.onSettled] },
      },
    }),
  );

// ── Flash: shows a message for a while ──────────────────────────────────────────────────────────
export const Flash = (p: { for: Duration.Input }) =>
  fragment(
    {
      id: "Flash",
      hostEvents: { Show: { text: Schema.String } }, // AMENDMENT F1
      internalEvents: { Expired: {} },
      memory: { text: Schema.NullOr(Schema.String) },
      initial: () => ({ text: null }),
    },
    ({ E }) => ({
      schedules: {
        // AMENDMENT P7: each Show re-arms, so a newer message gets its full 3 seconds.
        expire: { schedule: p.for, send: E.Expired, armOn: [E.Show] },
      },
      on: {
        Show: { target: "self", updateMemory: ({ event }) => ({ text: event.text }) },
        Expired: { target: "self", updateMemory: () => ({ text: null }) },
      },
    }),
  );

// ── TextList: 0..max text entries with per-entry validation ────────────────────────────────────
export const TextList = (p: { max: number; validate: (v: string) => string | null }) => {
  const withErrors = (items: readonly string[]) => ({ items, errors: items.map(p.validate) });
  type Input = { event: { index: number }; memory: { items: readonly string[] } };
  const inRange = ({ event, memory }: Input) =>
    (event.index >= 0 && event.index < memory.items.length) || deny("NoSuchEntry");

  return fragment(
    {
      id: "TextList",
      input: { start: Schema.Array(Schema.String) },
      events: {
        Add: {},
        Remove: { index: Schema.Int },
        Changed: { index: Schema.Int, value: Schema.String },
      },
      hostEvents: { DropEmpty: {} }, // AMENDMENT F1: only the host drops empties (on Next)
      memory: {
        items: Schema.Array(Schema.String),
        errors: Schema.Array(Schema.NullOr(Schema.String)),
      },
      initial: ({ input }) => withErrors(input.start),
      guards: ["canEdit"],
    },
    ({ guards }) => ({
      on: {
        // AMENDMENT F5: guard arrays; the host's canEdit and the fragment's own rule both apply.
        Add: {
          target: "self",
          guard: [
            guards.canEdit,
            ({ memory }) => memory.items.length < p.max || deny("Full", { max: p.max }),
          ],
          updateMemory: ({ memory }) => withErrors([...memory.items, ""]),
        },
        Remove: {
          target: "self",
          guard: [guards.canEdit, inRange],
          updateMemory: ({ event, memory }) =>
            withErrors(memory.items.filter((_, i) => i !== event.index)),
        },
        Changed: {
          target: "self",
          guard: [guards.canEdit, inRange],
          updateMemory: ({ event, memory }) =>
            withErrors(memory.items.map((v, i) => (i === event.index ? event.value : v))),
        },
        DropEmpty: {
          target: "self",
          updateMemory: ({ memory }) => withErrors(memory.items.filter((v) => v.trim() !== "")),
        },
      },
    }),
  );
};

// ── Selection: a set of selected ids ───────────────────────────────────────────────────────────
export const Selection = fragment(
  {
    id: "Selection",
    events: {
      Toggle: { id: Schema.String },
      Clear: {}, // the user may clear; the host also raises it when the query changes
    },
    // AMENDMENT F1, S2: SelectAll is host-only. The host fills it from the current snapshot's
    // rows, so no click (stale or forged) can select ids that are not on screen.
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
      SelectAll: {
        target: "self",
        updateMemory: ({ event, memory }) => ({
          ids: [...memory.ids, ...event.ids.filter((id) => !memory.ids.includes(id))],
        }),
      },
      Clear: { target: "self", updateMemory: () => ({ ids: [] }) },
    },
  }),
);

// ── Hold: press and keep pressing for a while ──────────────────────────────────────────────────
export const Hold = (p: { for: Duration.Input }) =>
  fragment(
    {
      id: "Hold",
      events: { Press: {}, Release: {} },
      internalEvents: { Held: { armedAt: Schema.Number } },
      // FAKED: modes kept in memory (pressing), and still no way to disarm a schedule: P7 arms and
      // re-arms but cannot cancel. After an early release a stale Held still fires; the Held guard
      // refuses it by the pressing flag, and a firing queued before a quick re-press by comparing
      // its armedAt with the latest press time.
      memory: { pressing: Schema.Boolean, since: Schema.NullOr(Schema.Number) },
      initial: () => ({ pressing: false, since: null }),
      guards: ["canStart"],
      callbacks: { onHeld: {} },
    },
    ({ E, guards, callbacks }) => ({
      schedules: {
        // AMENDMENT P7: armed by an accepted Press; no presses counter.
        held: {
          schedule: p.for,
          send: E.Held.from(({ armedAt }) => ({ armedAt })),
          armOn: [E.Press],
        },
      },
      on: {
        Press: {
          target: "self",
          guard: guards.canStart,
          updateMemory: ({ now }) => ({ pressing: true, since: now }),
        },
        Release: { target: "self", updateMemory: () => ({ pressing: false, since: null }) },
        Held: {
          target: "self",
          // ASSUMED (P7): armedAt is the arming Press turn's now, so the live arming equals since.
          guard: ({ event, memory }) => {
            if (!memory.pressing || memory.since === null) return deny("Released");
            if (event.armedAt < memory.since) return deny("StaleArming");
            return true;
          },
          updateMemory: () => ({ pressing: false, since: null }),
          notify: [callbacks.onHeld],
        },
      },
    }),
  );
```

### Testing a fragment alone

```ts
// strikes.test.ts
import { story } from "flow-state/testing";
import { expect, test } from "vitest";
import { Strikes } from "./fragments.js";

const ThreeStrikes = Strikes({ max: 3, lockFor: "5 minutes" });
const { E } = ThreeStrikes;

// The harness plays the host: it fills every port, records callback calls, and may send the
// fragment's events and hostEvents (ASSUMED, F1). E.lock.Start is not on E at the harness level:
// only Strikes, the lock's direct parent, may raise it.
const struckOut = story
  .machine(ThreeStrikes, { id: "strikes-lockout" })
  .send(E.Strike())
  .send(E.Strike())
  .send(E.Strike())
  .process()
  .checkpoint("locked")
  .advance("5 minutes")
  .process()
  .checkpoint("reset");

test("the third strike locks, and the lock's end resets the count", async () => {
  const run = await struckOut.run();
  const { locked, reset } = run.checkpoints;
  expect(run.calls.onStruck).toEqual([{ left: 2 }, { left: 1 }]);
  expect(run.calls.onLocked).toHaveLength(1);
  expect(locked.snapshot.memory.lock.running).toBe(true);
  // AMENDMENT P6: the deadline comes from the schedule, not a memory copy.
  expect(locked.snapshot.schedules.lock?.end?.dueAt).toBe(locked.now + 300_000);
  expect(reset.snapshot.memory.count).toBe(0);
  expect(reset.snapshot.memory.lock.running).toBe(false);
});
```

---

## App 1: Two-factor sign-in

```ts
// sign-in.definition.ts
import { Schema } from "effect";
import { definition } from "flow-state";
import { Auth } from "../auth.operations.js"; // verifyCode, resendCode (commits)
import { Cooldown, Field, Strikes } from "../fragments.js";

export const MAX_WRONG = 3;

const sixDigits = (v: string) => (/^\d{6}$/.test(v) ? null : "Enter the 6-digit code");

export const SignIn = definition({
  id: "Auth/SignIn",
  // AMENDMENT S1: SIGNING_IN spans PASSWORD and TWO_FACTOR, so strikes (attached to it) survive
  // Back and re-entry. A new challenge re-enters SIGNING_IN, which makes strikes fresh.
  // The lockout is still not in this list: it is memory.strikes.lock.running (fragments have no
  // states), and ENTERING covers both entering and locked out.
  states: [
    { SIGNING_IN: ["PASSWORD", { TWO_FACTOR: ["ENTERING", "VERIFYING"] }] },
    "SIGNED_IN",
  ],
  fragments: {
    strikes: Strikes({ max: MAX_WRONG, lockFor: "5 minutes" }).at("SIGNING_IN"),
    // Fresh on every entry to TWO_FACTOR, removed on Back: the code and resend cooldown keep nothing.
    code: Field(Schema.String, { validate: sixDigits }).at("SIGNING_IN.TWO_FACTOR"),
    resend: Cooldown({ for: "30 seconds" }).at("SIGNING_IN.TWO_FACTOR"),
  },
  events: {
    PasswordAccepted: { challengeId: Schema.String }, // the password step's stub
    Submit: {},
    BackToPassword: {},
  },
  internalEvents: { Verified: {}, WrongCode: {}, CodeExpired: {}, CheckFailed: {} },
  memory: { challengeId: Schema.String, error: Schema.NullOr(Schema.String) },
  initial: () => ({ challengeId: "", error: null }),
  operations: { Auth },
});
```

```ts
// sign-in.machine.ts
import { deny, machine } from "flow-state";
import { SignIn } from "./sign-in.definition.js";

type Memory = typeof SignIn.Memory.Type;

// Fragment slices are read with ?. because all three are .at placements: a slice exists only
// while its node is active, and memory types are not narrowed by state.

// FAKED: modes kept in memory. "Locked out" is a mode of the step, but no fragment can own a
// state, so it is the nested lock Timeout's running flag, read by every guard that must refuse.
const lockedOut = (memory: Memory) => memory.strikes?.lock.running ?? false;

const notLocked = ({ memory }: { memory: Memory }) => !lockedOut(memory) || deny("LockedOut");

const canSubmit = ({ memory }: { memory: Memory }) => {
  if (lockedOut(memory)) return deny("LockedOut");
  if ((memory.code?.error ?? "absent") !== null) return deny("InvalidCode");
  return true;
};

export const SignInMachine = machine(SignIn, ({ S, E, O }) => {
  // AMENDMENT P2: started by Submit into VERIFYING, so the result is fenced to that activation.
  // After Back, a late result is dropped with evidence (no abandoned handler), so it can never be
  // taken as a newer attempt's answer.
  const verify = O.Auth.verifyCode.commit(
    ({ memory }) => ({ challengeId: memory.challengeId, code: memory.code?.value ?? "" }),
    {
      outcomes: {
        success: E.Verified,
        failure: { WrongCode: E.WrongCode, Expired: E.CodeExpired },
        unknown: E.CheckFailed,
        interrupt: E.CheckFailed,
        defect: E.CheckFailed,
      },
    },
  );

  const resendCode = O.Auth.resendCode.commit(({ memory }) => ({
    challengeId: memory.challengeId,
  }));

  return {
    default: S.SIGNING_IN,

    fragments: {
      strikes: {
        callbacks: {
          onStruck: {
            target: "self",
            updateMemory: ({ payload }) => ({ error: `Wrong code, ${payload.left} tries left` }),
          },
          onLocked: { target: "self", updateMemory: () => ({ error: null }) }, // the countdown shows
        },
      },
      code: {
        input: () => ({ start: "" }),
        guards: { canEdit: notLocked }, // entry refused while locked out
        callbacks: { onChanged: {} },
      },
      resend: {
        // The fragment refuses during the cooldown; the host only runs the I/O it asks for.
        callbacks: { onUse: { target: "self", actions: [resendCode] } },
      },
    },

    on: {
      // A new challenge. A root handler's boundary is the root (Machines O2), so SIGNING_IN is
      // exited and re-entered and strikes starts fresh: lifetime by placement, no reset event.
      PasswordAccepted: {
        target: S.SIGNING_IN.TWO_FACTOR,
        // AMENDMENT F3: position tested with a token, not a path string.
        guard: ({ state }) => S.SIGNING_IN.PASSWORD.is(state) || deny("NotAtPassword"),
        updateMemory: ({ event }) => ({ challengeId: event.challengeId, error: null }),
      },
    },

    states: {
      SIGNING_IN: {
        default: S.SIGNING_IN.PASSWORD,
        states: {
          PASSWORD: {
            on: {
              // AMENDMENT S1: the same challenge returns to its strikes and lockout. The boundary
              // is SIGNING_IN, which stays active. A new challenge declines here and falls
              // through to the root handler above.
              PasswordAccepted: {
                target: S.SIGNING_IN.TWO_FACTOR,
                guard: ({ event, memory }) =>
                  event.challengeId === memory.challengeId || deny("NewChallenge"),
                updateMemory: () => ({ error: null }),
              },
            },
          },
          TWO_FACTOR: {
            default: S.SIGNING_IN.TWO_FACTOR.ENTERING,
            on: {
              // From ENTERING or VERIFYING. Removes code and resend; strikes stays (S1).
              BackToPassword: { target: S.SIGNING_IN.PASSWORD, updateMemory: () => ({ error: null }) },
            },
            states: {
              ENTERING: {
                on: {
                  Submit: {
                    target: S.SIGNING_IN.TWO_FACTOR.VERIFYING,
                    guard: canSubmit,
                    updateMemory: () => ({ error: null }),
                    actions: [verify],
                  },
                },
              },
              VERIFYING: {
                on: {
                  Verified: S.SIGNED_IN,
                  // One turn: back to ENTERING, a strike (whose callback writes the error, or
                  // locks), and the code field cleared.
                  // AMENDMENT F1, F2: Strike and Set are hostEvents raised by an ordinary transition.
                  WrongCode: {
                    target: S.SIGNING_IN.TWO_FACTOR.ENTERING,
                    raise: [E.strikes.Strike, E.code.Set.from(() => ({ value: "" }))],
                  },
                  CodeExpired: {
                    target: S.SIGNING_IN.TWO_FACTOR.ENTERING,
                    updateMemory: () => ({ error: "Code expired, send a new one" }),
                  },
                  CheckFailed: {
                    target: S.SIGNING_IN.TWO_FACTOR.ENTERING,
                    updateMemory: () => ({ error: "Couldn't check the code, try again" }),
                  },
                },
              },
            },
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
import type { ReactNode } from "react";
import { check, type Actor } from "flow-state";
import { useActor, useNow, useView } from "flow-state/react";
import { SignIn } from "./sign-in.definition.js";
import { SignInMachine } from "./sign-in.machine.js";

const { S, E } = SignIn;
type SignInActor = Actor<typeof SignInMachine>;

const secondsUntil = (dueAt: number | null, now: number) =>
  dueAt === null ? 0 : Math.max(0, Math.ceil((dueAt - now) / 1000));

export function SignInScreen({ challengeId }: { challengeId: string }) {
  const signIn = useActor(SignInMachine);
  const top = useView(signIn, (s) => S.root.child(s));
  const step = useView(signIn, (s) => S.SIGNING_IN.child(s));

  if (top === "SIGNED_IN") return <p role="status">Signed in</p>;

  const body = {
    PASSWORD: (
      <button onClick={() => signIn.send(E.PasswordAccepted({ challengeId }))}>Continue</button>
    ),
    TWO_FACTOR: <TwoFactorStep signIn={signIn} />,
  } satisfies Record<NonNullable<typeof step>, ReactNode>;

  return <section>{step && body[step]}</section>;
}

function TwoFactorStep({ signIn }: { signIn: SignInActor }) {
  const now = useNow("1 second");
  const code = useView(signIn, (s) => s.memory.code?.value ?? "");
  const fieldError = useView(signIn, (s) => (s.memory.code?.touched ? s.memory.code.error : null));
  const error = useView(signIn, (s) => s.memory.error);
  // FAKED: modes kept in memory. "Locked out" is still a flag in a nested slice.
  const locked = useView(signIn, (s) => s.memory.strikes?.lock.running ?? false);
  // AMENDMENT P6: countdowns read the schedules' own deadlines.
  // ASSUMED: fragment schedules sit at their instance path, nested like memory.
  const lockDue = useView(signIn, (s) => s.schedules.strikes?.lock?.end?.dueAt ?? null);
  const resendDue = useView(signIn, (s) => s.schedules.resend?.timer?.end?.dueAt ?? null);
  const canEdit = useView(signIn, (s) => check(s, E.code.Changed({ value: "" }))._tag === "Allowed");
  const canSubmit = useView(signIn, (s) => check(s, E.Submit())._tag === "Allowed");
  const canResend = useView(signIn, (s) => check(s, E.resend.Use())._tag === "Allowed");
  const verifying = useView(signIn, (s) => S.SIGNING_IN.TWO_FACTOR.VERIFYING.is(s));

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
          disabled={!canEdit}
          onChange={(event) => signIn.send(E.code.Changed({ value: event.target.value }))}
        />
      </label>
      {fieldError && <p className="hint">{fieldError}</p>}
      {error && <p role="alert">{error}</p>}
      {locked && (
        <p role="status">Too many wrong codes. Try again in {secondsUntil(lockDue, now)} s.</p>
      )}
      <button type="submit" disabled={!canSubmit}>
        {verifying ? "Checking…" : "Submit"}
      </button>
      <button type="button" disabled={!canResend} onClick={() => signIn.send(E.resend.Use())}>
        {resendDue === null ? "Resend code" : `Resend code (${secondsUntil(resendDue, now)} s)`}
      </button>
      <button type="button" onClick={() => signIn.send(E.BackToPassword())}>
        Back to password
      </button>
    </form>
  );
}
```

```ts
// sign-in.story.ts
import { check } from "flow-state";
import { story } from "flow-state/testing";
import { expect, test } from "vitest";
import { DemoAuthApi } from "../../app/demo-api.js";
import { AlwaysWrongCode } from "../../testing/fixtures.js";
import { SignIn } from "./sign-in.definition.js";
import { SignInMachine } from "./sign-in.machine.js";

const { E, S } = SignIn;

export const lockout = story
  .machine(SignInMachine, { id: "sign-in-lockout", services: DemoAuthApi, fixtures: [AlwaysWrongCode] })
  .send(E.PasswordAccepted({ challengeId: "ch-1" }))
  .send(E.code.Changed({ value: "111111" }))
  .send(E.Submit())
  .process()
  .checkpoint("first-wrong")
  .send(E.code.Changed({ value: "222222" }))
  .send(E.Submit())
  .process()
  .send(E.code.Changed({ value: "333333" }))
  .send(E.Submit())
  .process()
  .checkpoint("locked")
  .send(E.resend.Use()) // resend is allowed while locked out
  .process()
  .advance("29 seconds")
  .process()
  .checkpoint("resend-cooling")
  .advance("1 second")
  .process()
  .checkpoint("resend-ready")
  .send(E.BackToPassword())
  .send(E.PasswordAccepted({ challengeId: "ch-1" })) // the same challenge (S1)
  .process()
  .checkpoint("back-again")
  .advance("269 seconds") // 299 s after the lock
  .process()
  .checkpoint("still-locked")
  .advance("1 second")
  .process()
  .checkpoint("unlocked");

test("three wrong codes lock for five minutes, through Back, then attempts reset", async () => {
  const run = await lockout.run();
  const c = run.checkpoints;
  const { "first-wrong": first, locked, "still-locked": still, unlocked } = c;

  expect(S.SIGNING_IN.TWO_FACTOR.ENTERING.is(first.snapshot)).toBe(true);
  expect(first.snapshot.memory.error).toBe("Wrong code, 2 tries left");
  expect(first.snapshot.memory.code?.value).toBe(""); // cleared
  expect(first.snapshot.memory.code?.touched).toBe(false); // so no field error yet

  expect(check(locked.snapshot, E.Submit())).toMatchObject({
    _tag: "Denied",
    reasons: [{ code: "LockedOut" }],
  });
  expect(check(locked.snapshot, E.code.Changed({ value: "4" }))._tag).toBe("Denied");
  expect(locked.snapshot.schedules.strikes?.lock?.end?.dueAt).toBe(locked.now + 300_000);

  expect(check(c["resend-cooling"].snapshot, E.resend.Use())._tag).toBe("Denied"); // 29 s in
  expect(check(c["resend-ready"].snapshot, E.resend.Use())._tag).toBe("Allowed"); // 30 s

  // S1: Back and the same challenge keep the strikes and the lockout; the code field is fresh.
  expect(S.SIGNING_IN.TWO_FACTOR.ENTERING.is(c["back-again"].snapshot)).toBe(true);
  expect(c["back-again"].snapshot.memory.strikes?.lock.running).toBe(true);
  expect(check(c["back-again"].snapshot, E.Submit())._tag).toBe("Denied");

  expect(check(still.snapshot, E.Submit())._tag).toBe("Denied"); // still locked at 299 s

  expect(unlocked.snapshot.memory.strikes?.count).toBe(0);
  expect(unlocked.snapshot.memory.strikes?.lock.running).toBe(false);
  expect(check(unlocked.snapshot, E.code.Changed({ value: "4" }))._tag).toBe("Allowed");
});
```

**Metrics (app 1):** non-comment code lines.

| Piece | Lines |
| --- | --- |
| Fragments used (Field, Timeout, Cooldown, Strikes) | 122 of the shared file |
| Definition | 27 |
| Machine | 109 |
| Component | 68 |
| Story | 64 |

- **New keywords in this pass:** `hostEvents`, `armOn`, `s.schedules.….dueAt`, and the commit
  fence (no keyword; P2 is a rule).
- **Duplicated across apps:** none in the host. `Timeout` is shared by `Cooldown` and `Strikes`,
  so the timer idiom is written once.

---

## App 2: Signup wizard

```ts
// accounts.operations.ts (excerpt: the descriptor's retry policy; adapter out of scope)
import { Schedule } from "effect";
import { transaction } from "flow-state";
import { AccountsApi } from "./accounts.api.js";
import { AccountRequest } from "./signup/signup.definition.js";

export const create = transaction({
  id: "Accounts/create",
  input: AccountRequest,
  concurrency: "reject",
  // AMENDMENT P4: Busy is retried 3 times at 1 s, 2 s and 4 s with the same input. unknown,
  // interrupt and defect are never retried. The final Busy reaches the outcome mapping.
  retry: { on: ["Busy"], schedule: Schedule.exponential("1 second").pipe(Schedule.recurs(3)) },
  commit: (input, { signal, attempt }) => AccountsApi.create(input, { signal, attempt }),
});

export const Accounts = { create };
```

```ts
// signup.definition.ts
import { Schema } from "effect";
import { definition } from "flow-state";
import { Accounts } from "../accounts.operations.js";
import { Field, TextList } from "../fragments.js";

export const ROLES = ["engineer", "designer", "manager"] as const;

const RoleDraft = Schema.Literals(["", ...ROLES]); // "" until chosen

export const AccountRequest = Schema.Struct({
  email: Schema.String,
  password: Schema.String,
  name: Schema.String,
  role: Schema.Literals(ROLES),
  invites: Schema.Array(Schema.String),
});

const isEmail = (v: string) => (v.includes("@") ? null : "Enter an email address");

export const Signup = definition({
  id: "Accounts/Signup",
  states: [
    { PAGES: ["ACCOUNT", "PROFILE", "INVITE", "REVIEW"] },
    "DISCARD", // AMENDMENT P5: the dialog is a host state; Keep returns through shallow history
    "SUBMITTING",
    "DONE",
    "CANCELLED",
    "UNSURE",
  ],
  // Which page owns which fragment (a convention: see the FAKED note below):
  //   ACCOUNT → email, password      PROFILE → name, role      INVITE → invites
  //   REVIEW  → reads all five
  fragments: {
    // FAKED: host wiring standing in for "a step is a state with a fragment attached". .at on a
    // page is fresh on every entry, so drafts would be lost on Back/Next, the dialog and
    // EmailTaken. The fields sit at the root, and page ownership is the list above.
    email: Field(Schema.String, { validate: isEmail }),
    password: Field(Schema.String, {
      validate: (v) => (v.length >= 12 ? null : "Use at least 12 characters"),
    }),
    name: Field(Schema.String, { validate: (v) => (v.trim() !== "" ? null : "Enter your name") }),
    role: Field(RoleDraft, { validate: (v) => (v !== "" ? null : "Choose a role") }),
    invites: TextList({ max: 5, validate: (v) => (v.trim() === "" ? null : isEmail(v)) }),
  },
  events: { Next: {}, Back: {}, Submit: {}, Cancel: {}, Discard: {}, Keep: {} },
  internalEvents: {
    Created: {},
    EmailTaken: {},
    Busy: {}, // only after the descriptor's retries are spent (P4)
    Retrying: { attempt: Schema.Int },
    Unsure: {},
  },
  memory: { error: Schema.NullOr(Schema.String), retrying: Schema.Int },
  initial: () => ({ error: null, retrying: 0 }),
  operations: { Accounts },
});
```

```ts
// signup.machine.ts
import { deny, machine } from "flow-state";
import { Signup, type ROLES } from "./signup.definition.js";

type Memory = typeof Signup.Memory.Type;
type Guarded = { memory: Memory };

const accountValid = ({ memory }: Guarded) =>
  (memory.email.error === null && memory.password.error === null) || deny("AccountInvalid");

const profileValid = ({ memory }: Guarded) =>
  (memory.name.error === null && memory.role.error === null) || deny("ProfileInvalid");

const invitesValid = ({ memory }: Guarded) =>
  memory.invites.errors.every((e) => e === null) || deny("InvitesInvalid");

// AMENDMENT P4: retries resend the commit's own input, so drafts no longer need freezing while
// SUBMITTING. The editable guard filled per field, and the captured request copy, are gone.
const always = () => true as const;

const field = { input: () => ({ start: "" as const }), guards: { canEdit: always } };

export const SignupMachine = machine(Signup, ({ S, E, O }) => {
  // AMENDMENT P2: started by Submit into SUBMITTING, so its results (retries included) are
  // fenced to that activation.
  const create = O.Accounts.create.commit(
    ({ memory }) => ({
      email: memory.email.value,
      password: memory.password.value,
      name: memory.name.value,
      // FAKED: validity is a memory fact the type cannot see; profileValid guaranteed "" is gone.
      role: memory.role.value as (typeof ROLES)[number],
      invites: memory.invites.items,
    }),
    {
      outcomes: {
        success: E.Created,
        failure: { EmailTaken: E.EmailTaken, Busy: E.Busy },
        // AMENDMENT P4: reported before each automatic retry.
        // ASSUMED: attempt counts retries from 1, so the view shows (1/3), (2/3), (3/3).
        retrying: E.Retrying.from(({ attempt }) => ({ attempt })),
        unknown: E.Unsure,
        interrupt: E.Unsure,
        defect: E.Unsure,
      },
    },
  );

  return {
    default: S.PAGES,

    fragments: {
      email: {
        ...field,
        // "That email is registered" goes away once the email is edited.
        callbacks: { onChanged: { target: "self", updateMemory: () => ({ error: null }) } },
      },
      password: { ...field, callbacks: { onChanged: {} } },
      name: { ...field, callbacks: { onChanged: {} } },
      role: { ...field, callbacks: { onChanged: {} } },
      invites: { input: () => ({ start: [] }), guards: { canEdit: always } },
    },

    states: {
      PAGES: {
        default: S.PAGES.ACCOUNT,
        on: { Cancel: S.DISCARD }, // only on pages: Cancel is unhandled while SUBMITTING
        states: {
          ACCOUNT: { on: { Next: { target: S.PAGES.PROFILE, guard: accountValid } } },
          PROFILE: {
            on: { Next: { target: S.PAGES.INVITE, guard: profileValid }, Back: S.PAGES.ACCOUNT },
          },
          INVITE: {
            on: {
              // AMENDMENT F1, F2: DropEmpty is a hostEvent raised by an ordinary transition.
              Next: { target: S.PAGES.REVIEW, guard: invitesValid, raise: [E.invites.DropEmpty] },
              Back: S.PAGES.PROFILE,
            },
          },
          REVIEW: {
            on: {
              Submit: {
                target: S.SUBMITTING,
                updateMemory: () => ({ error: null, retrying: 0 }),
                actions: [create],
              },
              Back: S.PAGES.INVITE,
            },
          },
        },
      },
      // AMENDMENT P5: Keep returns to the page Cancel came from. The dialog has no Next, Back or
      // Submit, so it refuses them by construction (no dialogClosed convention).
      DISCARD: { on: { Discard: S.CANCELLED, Keep: S.PAGES.history } },
      SUBMITTING: {
        on: {
          Retrying: { target: "self", updateMemory: ({ event }) => ({ retrying: event.attempt }) },
          Created: S.DONE,
          EmailTaken: {
            target: S.PAGES.ACCOUNT,
            updateMemory: () => ({ error: "That email is registered" }),
          },
          Busy: { target: S.PAGES.REVIEW, updateMemory: () => ({ error: "Try again later" }) },
          Unsure: S.UNSURE, // never retried: the descriptor's policy excludes unknown (P4)
        },
      },
      DONE: {},
      CANCELLED: {},
      UNSURE: {},
    },
  };
});
```

```tsx
// SignupWizard.tsx
import type { ReactNode } from "react";
import { check, type Actor } from "flow-state";
import { useActor, useView } from "flow-state/react";
import { ROLES, Signup } from "./signup.definition.js";
import { SignupMachine } from "./signup.machine.js";

const { S, E } = Signup;
type SignupActor = Actor<typeof SignupMachine>;

export function SignupWizard() {
  const signup = useActor(SignupMachine);
  const top = useView(signup, (s) => S.root.child(s));

  const body = {
    PAGES: <Pages signup={signup} />,
    DISCARD: <DiscardDialog signup={signup} />,
    SUBMITTING: <Submitting signup={signup} />,
    DONE: <p role="status">Welcome aboard.</p>,
    CANCELLED: <p role="status">Signup discarded.</p>,
    UNSURE: <p role="alert">Your account may have been created; check your email.</p>,
  } satisfies Record<typeof top, ReactNode>;

  return <section>{body[top]}</section>;
}

function Pages({ signup }: { signup: SignupActor }) {
  const page = useView(signup, (s) => S.PAGES.child(s));
  const error = useView(signup, (s) => s.memory.error);
  const canNext = useView(signup, (s) => check(s, E.Next())._tag === "Allowed");
  const canBack = useView(signup, (s) => check(s, E.Back())._tag === "Allowed");

  if (page === undefined) return null;

  const pages = {
    ACCOUNT: (
      <>
        <TextField signup={signup} field="email" label="Email" type="email" />
        <TextField signup={signup} field="password" label="Password" type="password" />
      </>
    ),
    PROFILE: (
      <>
        <TextField signup={signup} field="name" label="Name" />
        <RoleField signup={signup} />
      </>
    ),
    INVITE: <Invites signup={signup} />,
    REVIEW: <Review signup={signup} />,
  } satisfies Record<typeof page, ReactNode>;

  return (
    <>
      {pages[page]}
      {error && <p role="alert">{error}</p>}
      <footer>
        {canBack && <button onClick={() => signup.send(E.Back())}>Back</button>}
        {page !== "REVIEW" && (
          <button disabled={!canNext} onClick={() => signup.send(E.Next())}>
            Next
          </button>
        )}
        <button onClick={() => signup.send(E.Cancel())}>Cancel</button>
      </footer>
    </>
  );
}

const textFields = { email: E.email, password: E.password, name: E.name } as const;

function TextField(props: {
  signup: SignupActor;
  field: keyof typeof textFields;
  label: string;
  type?: string;
}) {
  const { signup, field } = props;
  const value = useView(signup, (s) => s.memory[field].value);
  const error = useView(signup, (s) => (s.memory[field].touched ? s.memory[field].error : null));

  return (
    <label>
      {props.label}
      <input
        type={props.type ?? "text"}
        value={value}
        onChange={(event) => signup.send(textFields[field].Changed({ value: event.target.value }))}
      />
      {error && <span className="hint">{error}</span>}
    </label>
  );
}

function RoleField({ signup }: { signup: SignupActor }) {
  const role = useView(signup, (s) => s.memory.role.value);
  const error = useView(signup, (s) => (s.memory.role.touched ? s.memory.role.error : null));

  return (
    <label>
      Role
      <select
        value={role}
        onChange={(event) =>
          signup.send(E.role.Changed({ value: event.target.value as typeof role }))
        }
      >
        <option value="">Choose…</option>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      {error && <span className="hint">{error}</span>}
    </label>
  );
}

function Invites({ signup }: { signup: SignupActor }) {
  const items = useView(signup, (s) => s.memory.invites.items);
  const errors = useView(signup, (s) => s.memory.invites.errors);
  const canAdd = useView(signup, (s) => check(s, E.invites.Add())._tag === "Allowed");

  return (
    <>
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
        Add teammate
      </button>
    </>
  );
}

function Review({ signup }: { signup: SignupActor }) {
  const summary = useView(signup, (s) => ({
    email: s.memory.email.value,
    name: s.memory.name.value,
    role: s.memory.role.value,
    invites: s.memory.invites.items,
  }));

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
        <dd>{summary.invites.length === 0 ? "None" : summary.invites.join(", ")}</dd>
      </dl>
      <button onClick={() => signup.send(E.Submit())}>Create account</button>
    </>
  );
}

function DiscardDialog({ signup }: { signup: SignupActor }) {
  // A state now (P5); the page under it is not rendered because history is not readable.
  return (
    <dialog open>
      <p>Discard your signup?</p>
      <button onClick={() => signup.send(E.Discard())}>Discard</button>
      <button onClick={() => signup.send(E.Keep())}>Keep</button>
    </dialog>
  );
}

function Submitting({ signup }: { signup: SignupActor }) {
  const retrying = useView(signup, (s) => s.memory.retrying);
  return (
    <p role="status">
      {retrying === 0 ? "Creating your account…" : `Server busy, retrying (${retrying}/3)`}
    </p>
  );
}
```

```ts
// signup.story.ts
import { check } from "flow-state";
import { story } from "flow-state/testing";
import { expect, test } from "vitest";
import { DemoAccountsApi } from "../../app/demo-api.js";
import { AlwaysBusy } from "../../testing/fixtures.js";
import { Signup } from "./signup.definition.js";
import { SignupMachine } from "./signup.machine.js";

const { E, S } = Signup;

export const busyThenGiveUp = story
  .machine(SignupMachine, { id: "signup-busy", services: DemoAccountsApi, fixtures: [AlwaysBusy] })
  .send(E.email.Changed({ value: "ada@example.com" }))
  .send(E.password.Changed({ value: "correct horse battery" }))
  .send(E.Next())
  .send(E.name.Changed({ value: "Ada" }))
  .send(E.role.Changed({ value: "engineer" }))
  .send(E.Next())
  .send(E.invites.Add())
  .send(E.invites.Add())
  .send(E.invites.Changed({ index: 1, value: "grace@example.com" }))
  .send(E.Next()) // drops the empty first entry
  .process()
  .checkpoint("review")
  .send(E.Submit())
  .process()
  .checkpoint("busy-1") // the first retry waits 1 s
  .send(E.invites.Add()) // a draft only: retries resend the commit's own input (P4)
  .process()
  .advance("1 second")
  .process()
  .advance("2 seconds")
  .process()
  .checkpoint("busy-3") // the third retry waits 4 s
  .advance("4 seconds")
  .process()
  .checkpoint("gave-up")
  .send(E.Cancel())
  .process()
  .checkpoint("dialog")
  .send(E.Keep())
  .process()
  .checkpoint("kept");

test("Busy retries three times with backoff, then returns to Review with drafts intact", async () => {
  const run = await busyThenGiveUp.run();
  const c = run.checkpoints;
  const { review, "busy-1": busy1, "busy-3": busy3, "gave-up": gaveUp, dialog, kept } = c;

  expect(review.snapshot.memory.invites.items).toEqual(["grace@example.com"]);

  expect(S.SUBMITTING.is(busy1.snapshot)).toBe(true);
  expect(busy1.snapshot.memory.retrying).toBe(1);
  expect(check(busy1.snapshot, E.Cancel())._tag).toBe("Unhandled"); // Cancel refused
  expect(busy3.snapshot.memory.retrying).toBe(3);

  expect(S.PAGES.REVIEW.is(gaveUp.snapshot)).toBe(true);
  expect(gaveUp.snapshot.memory.error).toBe("Try again later");
  expect(gaveUp.snapshot.memory.email.value).toBe("ada@example.com");

  expect(S.DISCARD.is(dialog.snapshot)).toBe(true);
  expect(check(dialog.snapshot, E.Submit())._tag).toBe("Unhandled"); // blocked by the state
  expect(check(dialog.snapshot, E.Next())._tag).toBe("Unhandled");

  expect(S.PAGES.REVIEW.is(kept.snapshot)).toBe(true); // history: back to the same page
});
```

**Metrics (app 2):** non-comment code lines; the operations excerpt is not counted.

| Piece | Lines |
| --- | --- |
| Fragments used (Field, TextList) | 94 of the shared file |
| Definition | 45 |
| Machine | 90 |
| Components | 168 |
| Story | 58 |

- **New keywords in this pass:** `hostEvents`, `.history`, `retry` on the descriptor, the
  `retrying` outcome, and guard arrays.
- **Duplicated across apps:** `Field` (reused from app 1).
- **Within the app:** `{ ...field, callbacks: { onChanged: {} } }` per field, and `canEdit: always`
  filled five times. The port must be filled even though nothing is refused now.

---

## App 3: Issue list screen

```ts
// issue-list.definition.ts
import { Schema } from "effect";
import { definition } from "flow-state";
import { Issues } from "../issues.operations.js"; // list (resource), setPinned, deleteMany (commits)
import { Debounce, Field, Flash, Hold, Selection } from "../fragments.js";

export const PAGE_SIZE = 20;

export const Sort = Schema.Struct({
  field: Schema.Literals(["updated", "title"]),
  dir: Schema.Literals(["asc", "desc"]),
});

export const Status = Schema.Literals(["open", "closed", "all"]);

export const IssueList = definition({
  id: "Issues/IssueList",
  states: [{ OPEN: ["BROWSING", "DELETING"] }],
  fragments: {
    searchBox: Field(Schema.String, { validate: () => null }),
    searchSettle: Debounce({ wait: "300 millis" }),
    selection: Selection,
    flash: Flash({ for: "3 seconds" }),
    hold: Hold({ for: "1500 millis" }).at("OPEN.BROWSING"), // gone while DELETING
    // AMENDMENT P3: no InFlight fragment; setPinned.pending answers "is this row's pin running?"
  },
  events: {
    SortChanged: { sort: Sort },
    StatusChanged: { status: Status },
    NextPage: {},
    PreviousPage: {},
    PageSelected: {}, // "select all on this page"
    Pin: { id: Schema.String, pinned: Schema.Boolean },
  },
  internalEvents: {
    RefreshDue: {},
    PinFailed: { id: Schema.String },
    PinUnsure: { id: Schema.String },
    Deleted: {},
    DeleteFailed: {},
    DeleteUnsure: {},
  },
  // The committed query; the search box's draft lives in the searchBox slice.
  memory: { search: Schema.String, sort: Sort, status: Status, page: Schema.Int },
  initial: () => ({
    search: "",
    sort: { field: "updated" as const, dir: "desc" as const },
    status: "open" as const,
    page: 1,
  }),
  operations: { Issues },
});
```

```ts
// issue-list.machine.ts
import { Schedule } from "effect";
import { deny, machine } from "flow-state";
import { IssueList, PAGE_SIZE } from "./issue-list.definition.js";

type Memory = typeof IssueList.Memory.Type;

const query = ({ memory }: { memory: Memory }) => ({
  search: memory.search,
  sort: memory.sort,
  status: memory.status,
  page: memory.page,
});

export const IssueListMachine = machine(IssueList, ({ S, E, O }) => {
  // FAKED: a rule kept by convention. "Selection clears whenever the query changes" is this raise,
  // repeated on every handler that changes search, sort, status or page. No amendment covers it:
  // the Selection fragment cannot watch the query (no context, no input after activation).
  const clearSelection = E.selection.Clear;

  const refetch = O.Issues.list.refetch(query);

  // AMENDMENT P1: every outcome names its row from the call's input.
  const rowOf = (_: unknown, { input }: { input: { id: string } }) => ({ id: input.id });

  // AMENDMENT P2: started by Pin with target "self" on OPEN, so fenced to OPEN's activation
  // (ASSUMED reading); leaving BROWSING for DELETING does not drop pin results.
  const pin = O.Issues.setPinned.commit(
    ({ event }) => ({ id: event.id, pinned: event.pinned }),
    {
      // The row shows the new value at once; failure, defect and interrupt remove this layer.
      optimistic: O.Issues.list.setData(({ memory, event }) => ({
        key: query({ memory }),
        data: (current) =>
          current && {
            ...current,
            items: current.items.map((issue) =>
              issue.id === event.id ? { ...issue, pinned: event.pinned } : issue,
            ),
          },
      })),
      outcomes: {
        // success needs no event: the optimistic value stays until a read confirms it (Ops O5).
        failure: E.PinFailed.from(rowOf),
        defect: E.PinFailed.from(rowOf),
        interrupt: E.PinFailed.from(rowOf),
        unknown: E.PinUnsure.from(rowOf),
      },
    },
  );

  // AMENDMENT P2: started by onHeld into DELETING, so fenced to DELETING.
  const deleteSelected = O.Issues.deleteMany.commit(({ memory }) => ({ ids: memory.selection.ids }), {
    outcomes: {
      success: E.Deleted,
      failure: E.DeleteFailed,
      defect: E.DeleteFailed,
      interrupt: E.DeleteFailed,
      unknown: E.DeleteUnsure,
    },
  });

  // FAKED: the title is looked up on the page now on screen, because the commit's input is
  // { id, pinned }. If the user paged away during the pin, the flash says "the issue".
  const flashPinFailed = E.flash.Show.from(({ activities, event }) => ({
    text: `Couldn't pin ${
      activities.list?.data?.items.find((issue) => issue.id === event.id)?.title ?? "the issue"
    }`,
  }));

  const hasNext = ({ memory, activities }: { memory: Memory; activities: any }) => {
    const total: number | undefined = activities.list?.data?.total;
    return (total !== undefined && memory.page * PAGE_SIZE < total) || deny("LastPage");
  };

  return {
    default: S.OPEN,

    fragments: {
      searchBox: {
        input: () => ({ start: "" }),
        guards: { canEdit: () => true },
        // Field → Debounce: the host wires one fragment's report into the other's hostEvent.
        callbacks: { onChanged: { target: "self", raise: [E.searchSettle.Input] } },
      },
      searchSettle: {
        callbacks: {
          onSettled: [
            {
              target: "self",
              guard: ({ memory }) => memory.searchBox.value !== memory.search || deny("Unchanged"),
              updateMemory: ({ memory }) => ({ search: memory.searchBox.value, page: 1 }),
              raise: [clearSelection],
            },
            { target: "self" }, // typed back to the same query: nothing changes
          ],
        },
      },
      selection: {},
      flash: {},
      hold: {
        guards: {
          canStart: ({ memory }) => memory.selection.ids.length > 0 || deny("NothingSelected"),
        },
        // Leaves BROWSING, which removes the Hold fragment that called it. canStart is checked
        // only at Press; the selection can be cleared mid-hold, so the filling checks again.
        callbacks: {
          onHeld: [
            {
              target: S.OPEN.DELETING,
              guard: ({ memory }) => memory.selection.ids.length > 0 || deny("NothingSelected"),
              actions: [deleteSelected],
            },
            { target: "self" },
          ],
        },
      },
    },

    states: {
      OPEN: {
        default: S.OPEN.BROWSING,
        activities: { list: O.Issues.list.subscribe(query) },
        schedules: {
          refresh: { schedule: Schedule.spaced("30 seconds"), send: E.RefreshDue },
        },
        on: {
          RefreshDue: { target: "self", actions: [refetch] },
          SortChanged: {
            target: "self",
            updateMemory: ({ event }) => ({ sort: event.sort, page: 1 }),
            raise: [clearSelection],
          },
          StatusChanged: {
            target: "self",
            updateMemory: ({ event }) => ({ status: event.status, page: 1 }),
            raise: [clearSelection],
          },
          NextPage: {
            target: "self",
            guard: hasNext,
            updateMemory: ({ memory }) => ({ page: memory.page + 1 }),
            raise: [clearSelection],
          },
          PreviousPage: {
            target: "self",
            guard: ({ memory }) => memory.page > 1 || deny("FirstPage"),
            updateMemory: ({ memory }) => ({ page: memory.page - 1 }),
            raise: [clearSelection],
          },
          // AMENDMENT S2, F1: ids from the current snapshot's rows, raised into a hostEvent.
          PageSelected: {
            target: "self",
            raise: [
              E.selection.SelectAll.from(({ activities }) => ({
                ids: (activities.list?.data?.items ?? []).map((issue) => issue.id),
              })),
            ],
          },
          Pin: {
            target: "self",
            // AMENDMENT P3: refused while this row's pin is outstanding, and check() agrees.
            // ASSUMED: pending accepts the guard's snapshot parts; { id } is setPinned's key.
            guard: ({ event, ...snapshot }) =>
              !O.Issues.setPinned.pending(snapshot, { id: event.id }) ||
              deny("InFlight", { id: event.id }),
            actions: [pin],
          },
          PinFailed: { target: "self", raise: [flashPinFailed] },
          // AMENDMENT S3: an unknown pin refetches. The confirming read ends the optimistic layer,
          // so the row reverts to whatever the server holds.
          // FAKED: until that read lands, the row still shows the optimistic value; Operations O5
          // keeps it on unknown, and no amendment removes it at once.
          PinUnsure: { target: "self", raise: [flashPinFailed], actions: [refetch] },
        },
        states: {
          BROWSING: {},
          DELETING: {
            on: {
              Deleted: { target: S.OPEN.BROWSING, raise: [clearSelection], actions: [refetch] },
              DeleteFailed: {
                target: S.OPEN.BROWSING,
                raise: [E.flash.Show.from(() => ({ text: "Delete failed" }))],
              },
              DeleteUnsure: {
                target: S.OPEN.BROWSING,
                raise: [E.flash.Show.from(() => ({ text: "Delete may have happened" }))],
                actions: [refetch],
              },
            },
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
import { IssueList } from "./issue-list.definition.js";
import { IssueListMachine } from "./issue-list.machine.js";

const { S, E } = IssueList;
type ListActor = Actor<typeof IssueListMachine>;

export function IssueListScreen() {
  const list = useActor(IssueListMachine);
  return (
    <section>
      <Toolbar list={list} />
      <Rows list={list} />
      <Pager list={list} />
      <BulkDelete list={list} />
      <FlashMessage list={list} />
    </section>
  );
}

function Toolbar({ list }: { list: ListActor }) {
  const search = useView(list, (s) => s.memory.searchBox.value);
  const sort = useView(list, (s) => s.memory.sort);
  const status = useView(list, (s) => s.memory.status);

  return (
    <header>
      <input
        type="search"
        value={search}
        onChange={(event) => list.send(E.searchBox.Changed({ value: event.target.value }))}
      />
      <select
        value={`${sort.field}:${sort.dir}`}
        onChange={(event) => {
          const [field, dir] = event.target.value.split(":") as ["updated" | "title", "asc" | "desc"];
          list.send(E.SortChanged({ sort: { field, dir } }));
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
          list.send(E.StatusChanged({ status: event.target.value as typeof status }))
        }
      >
        <option value="open">Open</option>
        <option value="closed">Closed</option>
        <option value="all">All</option>
      </select>
    </header>
  );
}

function Rows({ list }: { list: ListActor }) {
  const items = useView(list, (s) => s.activities.list?.data?.items ?? []); // optimistic included
  const loading = useView(list, (s) => s.activities.list?._tag === "Pending");
  const selected = useView(list, (s) => s.memory.selection.ids);
  const allSelected = items.length > 0 && items.every((i) => selected.includes(i.id));

  if (loading) return <p>Loading…</p>;

  return (
    <table>
      <thead>
        <tr>
          <th>
            <input
              type="checkbox"
              aria-label="Select all on this page"
              checked={allSelected}
              onChange={() => list.send(allSelected ? E.selection.Clear() : E.PageSelected())}
            />
          </th>
          <th>Title</th>
          <th>Pinned</th>
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
            <td>
              <PinButton list={list} id={issue.id} pinned={issue.pinned} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PinButton(props: { list: ListActor; id: string; pinned: boolean }) {
  const { list, id, pinned } = props;
  const pin = E.Pin({ id, pinned: !pinned });
  const allowed = useView(list, (s) => check(s, pin)._tag === "Allowed");

  return (
    <button aria-pressed={pinned} disabled={!allowed} onClick={() => list.send(pin)}>
      {pinned ? "Unpin" : "Pin"}
    </button>
  );
}

function Pager({ list }: { list: ListActor }) {
  const page = useView(list, (s) => s.memory.page);
  const canNext = useView(list, (s) => check(s, E.NextPage())._tag === "Allowed");
  const canPrevious = useView(list, (s) => check(s, E.PreviousPage())._tag === "Allowed");

  return (
    <nav>
      <button disabled={!canPrevious} onClick={() => list.send(E.PreviousPage())}>
        Previous
      </button>
      <span>Page {page}</span>
      <button disabled={!canNext} onClick={() => list.send(E.NextPage())}>
        Next
      </button>
    </nav>
  );
}

function BulkDelete({ list }: { list: ListActor }) {
  const count = useView(list, (s) => s.memory.selection.ids.length);
  const deleting = useView(list, (s) => S.OPEN.DELETING.is(s));
  // FAKED: modes kept in memory; "being held" is a flag in the hold slice.
  const pressing = useView(list, (s) => s.memory.hold?.pressing ?? false);
  const canPress = useView(list, (s) => check(s, E.hold.Press())._tag === "Allowed");
  const release = () => list.send(E.hold.Release()); // never refused

  return (
    <button
      disabled={!canPress && !pressing}
      onPointerDown={() => list.send(E.hold.Press())}
      onPointerUp={release}
      onPointerLeave={release}
    >
      {deleting ? "Deleting…" : pressing ? "Keep holding…" : `Hold to delete ${count}`}
    </button>
  );
}

function FlashMessage({ list }: { list: ListActor }) {
  const text = useView(list, (s) => s.memory.flash.text);
  return text ? <p role="status">{text}</p> : null;
}
```

```ts
// issue-list.story.ts
import { check } from "flow-state";
import { story } from "flow-state/testing";
import { expect, test } from "vitest";
import { DemoIssuesApi } from "../../app/demo-api.js";
import { SlowFailingPin } from "../../testing/fixtures.js"; // setPinned waits 1 s, then fails
import { IssueList } from "./issue-list.definition.js";
import { IssueListMachine } from "./issue-list.machine.js";

const { E, S } = IssueList;

// Seeded server truth: I-1 "Login broken" (unpinned) and I-2 "Slow search" on page 1.
const pinI1 = E.Pin({ id: "I-1", pinned: true });

export const pinFailsAndHoldCancels = story
  .machine(IssueListMachine, {
    id: "issue-list-pin-and-hold",
    services: DemoIssuesApi,
    fixtures: [SlowFailingPin],
  })
  .process()
  .send(E.selection.Toggle({ id: "I-2" }))
  .send(pinI1)
  .process()
  .checkpoint("pinning")
  .advance("1 second")
  .process()
  .checkpoint("pin-failed")
  .advance("3 seconds")
  .process()
  .checkpoint("flash-gone")
  .send(E.hold.Press())
  .advance("1 second")
  .send(E.hold.Release())
  .advance("1 second")
  .process()
  .checkpoint("released-early")
  .send(E.hold.Press()) // I-2 is still selected, so Press is allowed
  .send(E.searchBox.Changed({ value: "log" }))
  .advance("300 millis")
  .process() // the search settles mid-hold and clears the selection
  .advance("1200 millis")
  .process() // Held fires at 1.5 s with nothing selected
  .checkpoint("searched");

const row = (snapshot: any, id: string) =>
  snapshot.activities.list?.data?.items.find((i: { id: string }) => i.id === id);

test("a pin reverts with a flash; early release or an emptied selection deletes nothing", async () => {
  const run = await pinFailsAndHoldCancels.run();
  const c = run.checkpoints;

  expect(row(c.pinning.snapshot, "I-1")?.pinned).toBe(true); // optimistic
  expect(check(c.pinning.snapshot, pinI1)).toMatchObject({
    _tag: "Denied",
    reasons: [{ code: "InFlight" }], // from setPinned.pending (P3)
  });

  expect(row(c["pin-failed"].snapshot, "I-1")?.pinned).toBe(false); // reverted
  expect(c["pin-failed"].snapshot.memory.flash.text).toBe("Couldn't pin Login broken");
  expect(check(c["pin-failed"].snapshot, pinI1)._tag).toBe("Allowed");
  expect(c["flash-gone"].snapshot.memory.flash.text).toBeNull();

  expect(S.OPEN.BROWSING.is(c["released-early"].snapshot)).toBe(true); // the stale Held was refused
  expect(c["released-early"].snapshot.memory.selection.ids).toEqual(["I-2"]);

  expect(c.searched.snapshot.memory.search).toBe("log");
  expect(c.searched.snapshot.memory.page).toBe(1);
  expect(c.searched.snapshot.memory.selection.ids).toEqual([]); // cleared by the query change
  expect(S.OPEN.BROWSING.is(c.searched.snapshot)).toBe(true); // onHeld re-checked the selection
});
```

**Metrics (app 3):** non-comment code lines.

| Piece | Lines |
| --- | --- |
| Fragments used (Field, Debounce, Selection, Flash, Hold) | 149 of the shared file |
| Definition | 45 |
| Machine | 162 |
| Components | 143 |
| Story | 60 |

- **New keywords in this pass:** `hostEvents`, `armOn`, `.pending`, and the second mapper
  argument `{ input }`.
- **Duplicated across apps:** `Field` (search box).
- **Within the app:** `raise: [clearSelection]` five times, and the flash wiring three times.

---

## What the amendments changed

All counts are non-blank, non-comment code lines, measured the same way in both files. "Before"
is [build-c-single-fragment.md](build-c-single-fragment.md) after its fix pass. App totals
include the shared fragments each app uses, plus its definition, machine and components. Stories
and the operations excerpt are excluded.

| | Before | After | Change |
| --- | --- | --- | --- |
| Shared fragments file | 377 (11 fragments) | 283 (9 fragments) | −94 |
| App 1, sign-in (fragments used + def + machine + components) | 109 + 24 + 95 + 68 = **296** | 122 + 27 + 109 + 68 = **326** | +30 |
| App 2, signup | 157 + 40 + 119 + 169 = **485** | 94 + 45 + 90 + 168 = **397** | −88 |
| App 3, issue list | 196 + 48 + 165 + 143 = **552** | 149 + 45 + 162 + 143 = **499** | −53 |
| Hosts (definitions + machines, all apps) | 491 | 478 | −13 |
| Stories | 182 | 182 | 0 |
| `// FAKED:` lines in code (all blocks, tests included) | 31 | 11 | −20 |
| Bugs from reviews/correctness.md still open | 2 (late verify crosses entries; interrupt/defect forgets every pin) | **0** | −2 |

How the open bugs closed:

- **Late verify:** P2 fences the verify to VERIFYING.
- **Pins forgotten on interrupt/defect:** P1 gives every outcome its row, and P3 removes the hand
  list that could drift.

The fix pass had already closed the other six of C's eight bugs. Three of those fixes are now
done by construction instead of by convention:

- **The dialog** is a state (P5).
- **D2** holds because P4 resends the commit's own input.
- **Select-all** takes ids from the lane through a hostEvent (S2, F1).

The bug fixes that now rest on an amendment's ASSUMED reading are P2's fence target, P3's
`pending` call shape, and P7's `armedAt` for the Hold fence.

App 1 grew by 30 lines:

- **S1** made the state tree deeper (`SIGNING_IN`) and added a same-challenge alternative plus a
  root handler.
- **`Timeout`** is a new shared piece, and `Cooldown` now nests it.
- **P6** made the countdowns shorter, but not by enough to make up for these.

**Helped most:**

1. **F1 `hostEvents`:** removed seven fragments' FAKED marks in one move. `Set`, `Strike`, `Input`,
   `Show`, `SelectAll` and `DropEmpty` are no longer UI-sendable, and the lock can no longer be
   started by a click.
2. **P4 retry policy:** deleted `Backoff`, its host wiring, the captured request, `createCaptured`,
   the `request!` cast and the per-field `editable` convention. Signup lost 88 lines and the D2
   hole closed by construction.
3. **P7 `armOn`:** every counter-plus-`restartOn` idiom is gone. That made `Timeout` small enough to
   share, so `Cooldown` and `Strikes` no longer duplicate the timer.
4. **P5 history:** made a host-state dialog cheap again. `Confirm` and the `dialogClosed`
   convention on six guards are gone, and the dialog blocks by construction.
5. **P1 + P3:** deleted `InFlight` and `PinLost`, and closed the last pin bug.

**Did nothing, or little, for C:**

- **P8:** nothing. No `restartOn` is left after P7.
- **F3:** one guard. C's only path-string guard (`editable`) was already removed by P4.
- **P6:** half. Countdowns read `dueAt`, but guards cannot read schedules, so `Timeout.running`
  stays as a memory flag mirroring the armed timer.
- **S3:** half. Refetch was already there. The row still shows the optimistic value until the
  confirming read lands.

**Still strains:**

- **Modes in memory.**
  - `lock.running` and `Hold.pressing` are still modes in memory, and the lockout is still
    absent from the state list.
  - Every guard that must refuse while locked has to call `lockedOut`.
  - The amendments fixed the dialog only by moving it **out** of the fragment into a host state.
    C's fragments themselves still cannot hold a mode.
- **No disarm.** P7 arms but cannot cancel, so Hold still needs `since` and the `armedAt` fence for
  an early release.
- **Placement vs. drafts.** Signup fields still live at the root because `.at` resets per entry;
  page ownership is a comment.
- **Conventions.**
  - Selection-clears-on-query-change is still five repeated raises.
  - Five `canEdit: always` fillings exist only because every port must be filled.
- **Data the commit doesn't carry.** The pin flash finds the title on the page now on screen,
  because P1 gives the input (`{ id, pinned }`), not the title.

C after the amendments is smaller than before in two of three apps and has no open bugs. The
remaining FAKED marks are almost all "no states in fragments" and "no disarm".
