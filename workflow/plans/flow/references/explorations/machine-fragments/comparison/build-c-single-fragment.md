# Build C: single stateless fragment

The three apps of [apps.md](apps.md), built in System C
([spec-c-single-fragment.md](spec-c-single-fragment.md)): one kind, `fragment(contract, body)`,
placed bare at the root or with `.at("PATH")`, no I/O, no states, callbacks that may move the host
anywhere. Everything else is Machines.plan and Operations.plan as written.

Every workaround carries a `// FAKED:` comment. Operation descriptors (`Auth`, `Accounts`,
`Issues`), their adapters and the demo services and fixtures are out of scope and imported.

**Reading assumptions** (taken from proposal-v2 and the collapsed sketch, which System C inherits;
the spec itself is silent):

- A fragment instance's memory is a slice of the host's memory under its name:
  `s.memory.code.value`. A nested fragment's slice sits inside its parent's:
  `s.memory.strikes.lock.until`.
- A slice of an `.at` placement exists only while its node is active, so it is typed optional
  (`s.memory.code?.value`). Memory is not narrowed by state tokens.
- Fragment bodies receive `{ E, guards, callbacks }`; fragment `updateMemory` receives `now`, as
  machine updates do (Machines O3).
- A fragment's own `on` handlers may carry ordinary guards; `guards: [...]` are the extra, host-filled
  ones.

---

## Shared fragments

```ts
// fragments.ts
// Locked islands: no operations, no states, no context. Every timer below is a Duration schedule
// with restartOn a counter, because a stateless fragment has no state to enter that would arm it.
import { Duration, Schema } from "effect";
import { deny, fragment } from "flow-state";

const millis = (d: Duration.Input) => Duration.toMillis(Duration.decode(d));

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
      events: {
        Changed: { value }, // the user types
        // FAKED: Set is meant for the host only, but in C internalEvents may come only from the
        // fragment's own schedules, so the host can feed it only through a public event. Any UI
        // can send E.<name>.Set too.
        Set: { value },
      },
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

// ── Cooldown: Use is refused for a while after each use ─────────────────────────────────────────
export const Cooldown = (p: { for: Duration.Input }) =>
  fragment(
    {
      id: "Cooldown",
      events: { Use: {} },
      internalEvents: { Ended: {} },
      // FAKED: modes kept in memory. "Ready" and "cooling down" are states in spirit; here they are
      // until === null and until !== null, and every reader (guards, views, hosts) must know that.
      memory: { until: Schema.NullOr(Schema.Number), uses: Schema.Int },
      initial: () => ({ until: null, uses: 0 }),
      callbacks: { onUse: {}, onEnded: {} },
    },
    ({ E, callbacks }) => ({
      schedules: {
        // FAKED: a timer armed by an event. With no state to enter, the schedule sits idle on
        // activation (restartOn's silent baseline) and restarts whenever uses changes.
        end: { schedule: p.for, send: E.Ended, restartOn: ({ memory }) => memory.uses },
      },
      on: {
        Use: {
          target: "self",
          guard: ({ memory }) =>
            memory.until === null || deny("CoolingDown", { until: memory.until }),
          updateMemory: ({ memory, now }) => ({ until: now + millis(p.for), uses: memory.uses + 1 }),
          notify: [callbacks.onUse],
        },
        Ended: { target: "self", updateMemory: () => ({ until: null }), notify: [callbacks.onEnded] },
      },
    }),
  );

// ── Strikes: counts failures; the max-th one locks for a while, then the count resets ───────────
export const Strikes = (p: { max: number; lockFor: Duration.Input }) =>
  fragment(
    {
      id: "Strikes",
      // FAKED: host-only in intent (the host reports a failure), public because internalEvents
      // are schedule-only. A UI could strike itself out.
      events: { Strike: {} },
      memory: { count: Schema.Int },
      initial: () => ({ count: 0 }),
      fragments: { lock: Cooldown({ for: p.lockFor }) }, // contained, at this fragment's root
      callbacks: { onStruck: { left: Schema.Int }, onLocked: {} },
    },
    ({ E, callbacks }) => ({
      // This fragment fills the fragment it contains, exactly as a host would.
      fragments: {
        lock: {
          callbacks: {
            onUse: {},
            onEnded: { target: "self", updateMemory: () => ({ count: 0 }) }, // attempts reset
          },
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
            // FAKED: "locked" is not a mode of Strikes; it is the lock Cooldown's until !== null,
            // reached by raising the Cooldown's public Use event (which a UI could also send at
            // E.<name>.lock.Use).
            raise: [E.lock.Use],
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
      events: { Input: {} }, // FAKED: host-only in intent; public because internalEvents are schedule-only
      internalEvents: { Due: {} },
      memory: { inputs: Schema.Int },
      initial: () => ({ inputs: 0 }),
      callbacks: { onSettled: {} },
    },
    ({ E, callbacks }) => ({
      schedules: {
        settle: { schedule: p.wait, send: E.Due, restartOn: ({ memory }) => memory.inputs },
      },
      on: {
        Input: { target: "self", updateMemory: ({ memory }) => ({ inputs: memory.inputs + 1 }) },
        Due: { target: "self", notify: [callbacks.onSettled] },
      },
    }),
  );

// ── Flash: shows a message for a while ──────────────────────────────────────────────────────────
// FAKED: logic duplicated. Flash, Cooldown, Debounce, Backoff and Hold each re-implement "a timer
// started by an event" as a counter plus restartOn; there is no shared timed-mode piece because
// the piece would need a state to arm on entry.
export const Flash = (p: { for: Duration.Input }) =>
  fragment(
    {
      id: "Flash",
      events: { Show: { text: Schema.String } }, // FAKED: host-only in intent; public
      internalEvents: { Expired: {} },
      memory: { text: Schema.NullOr(Schema.String), shown: Schema.Int },
      initial: () => ({ text: null, shown: 0 }),
    },
    ({ E }) => ({
      schedules: {
        expire: { schedule: p.for, send: E.Expired, restartOn: ({ memory }) => memory.shown },
      },
      on: {
        Show: {
          target: "self",
          updateMemory: ({ event, memory }) => ({ text: event.text, shown: memory.shown + 1 }),
        },
        Expired: { target: "self", updateMemory: () => ({ text: null }) },
      },
    }),
  );

// ── Confirm: an open/closed question with two answers ──────────────────────────────────────────
type ConfirmMemory = { memory: { open: boolean } };
const whileOpen = ({ memory }: ConfirmMemory) => memory.open || deny("NotOpen");

export const Confirm = fragment(
  {
    id: "Confirm",
    events: { Open: {}, Yes: {}, No: {} },
    // FAKED: modes kept in memory. The dialog is a boolean, not a state, so the host's own events
    // stay enabled underneath it unless every host guard also reads this flag.
    memory: { open: Schema.Boolean },
    initial: () => ({ open: false }),
    callbacks: { onYes: {}, onNo: {} },
  },
  ({ callbacks }) => ({
    on: {
      Open: {
        target: "self",
        guard: ({ memory }) => !memory.open || deny("AlreadyOpen"),
        updateMemory: () => ({ open: true }),
      },
      Yes: {
        target: "self",
        guard: whileOpen,
        updateMemory: () => ({ open: false }),
        notify: [callbacks.onYes],
      },
      No: {
        target: "self",
        guard: whileOpen,
        updateMemory: () => ({ open: false }),
        notify: [callbacks.onNo],
      },
    },
  }),
);

// ── Backoff: after each reported failure, waits the next delay and asks the host to retry ──────
export const Backoff = (p: { delays: readonly Duration.Input[] }) =>
  fragment(
    {
      id: "Backoff",
      events: { Failed: {} }, // FAKED: host-only in intent (a mapped outcome); public
      internalEvents: { Due: {} },
      // FAKED: modes kept in memory. "Waiting" and "sending" are a boolean; the host's I/O state
      // (is a commit in flight?) and this fragment's mode can disagree, and nothing checks them.
      memory: { retries: Schema.Int, waiting: Schema.Boolean },
      initial: () => ({ retries: 0, waiting: false }),
      callbacks: { onRetry: { attempt: Schema.Int }, onGaveUp: {} },
    },
    ({ E, callbacks }) => ({
      schedules: {
        retry: {
          schedule: ({ memory }) => p.delays[Math.max(0, memory.retries - 1)]!,
          send: E.Due,
          restartOn: ({ memory }) => memory.retries,
        },
      },
      on: {
        Failed: [
          {
            target: "self",
            guard: ({ memory }) => memory.retries < p.delays.length || deny("OutOfRetries"),
            updateMemory: ({ memory }) => ({ retries: memory.retries + 1, waiting: true }),
          },
          { target: "self", notify: [callbacks.onGaveUp] },
        ],
        Due: {
          target: "self",
          updateMemory: () => ({ waiting: false }),
          notify: [callbacks.onRetry.from(({ memory }) => ({ attempt: memory.retries }))],
        },
      },
    }),
  );

// ── TextList: 0..max text entries with per-entry validation ────────────────────────────────────
export const TextList = (p: { max: number; validate: (v: string) => string | null }) => {
  const withErrors = (items: readonly string[]) => ({ items, errors: items.map(p.validate) });

  return fragment(
    {
      id: "TextList",
      input: { start: Schema.Array(Schema.String) },
      events: {
        Add: {},
        Remove: { index: Schema.Int },
        Changed: { index: Schema.Int, value: Schema.String },
        DropEmpty: {}, // FAKED: host-only in intent (Next drops empty entries); public
      },
      memory: {
        items: Schema.Array(Schema.String),
        errors: Schema.Array(Schema.NullOr(Schema.String)),
      },
      initial: ({ input }) => withErrors(input.start),
      guards: ["canEdit"],
    },
    ({ guards }) => ({
      on: {
        Add: {
          target: "self",
          guard: ({ memory }) => memory.items.length < p.max || deny("Full", { max: p.max }),
          updateMemory: ({ memory }) => withErrors([...memory.items, ""]),
        },
        Remove: {
          target: "self",
          guard: guards.canEdit,
          updateMemory: ({ event, memory }) =>
            withErrors(memory.items.filter((_, i) => i !== event.index)),
        },
        Changed: {
          target: "self",
          guard: guards.canEdit,
          // FAKED: a guard slot takes one function, and a fragment cannot call a host-filled
          // guard from its own. Add keeps its own Full check, so the host's canEdit cannot also
          // apply: Add stays allowed while the host is busy. The signup host makes this harmless
          // by capturing its request on Submit. Remove and Changed take canEdit, so an
          // out-of-range index is ignored rather than refused. The system would need guard
          // composition (own rule AND host port) or one port per event.
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
      // FAKED: host-only in intent (the host raises it with the lane's ids on PageSelected);
      // public, so any sender can still select ids that are not on screen.
      SelectAll: { ids: Schema.Array(Schema.String) },
      Clear: {}, // the user may clear; the host also raises it when the query changes
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

// ── InFlight: keys with work in flight; a second Begin for the same key is refused ─────────────
export const InFlight = fragment(
  {
    id: "InFlight",
    // FAKED: host-only in intent (the host begins and ends work); public. It also duplicates what
    // the transaction already knows (per-key unsettled commits), because transactions have no lane
    // a guard could read.
    events: {
      Begin: { key: Schema.String, label: Schema.String },
      End: { key: Schema.String },
      EndAll: {},
    },
    memory: { items: Schema.Record(Schema.String, Schema.String) }, // key → label
    initial: () => ({ items: {} }),
  },
  () => ({
    on: {
      Begin: {
        target: "self",
        guard: ({ event, memory }) =>
          !(event.key in memory.items) || deny("InFlight", { key: event.key }),
        updateMemory: ({ event, memory }) => ({
          items: { ...memory.items, [event.key]: event.label },
        }),
      },
      End: {
        target: "self",
        updateMemory: ({ event, memory }) => {
          const { [event.key]: _, ...rest } = memory.items;
          return { items: rest };
        },
      },
      EndAll: { target: "self", updateMemory: () => ({ items: {} }) },
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
      // FAKED: modes kept in memory (pressing), and no way to disarm a schedule. Release cannot
      // cancel the timer, so after an early release a stale Held still fires. The Held guard
      // refuses it: by the pressing flag, and, for a firing queued before a quick re-press, by
      // comparing the schedule's armedAt metadata (Machines O5) with the latest press time.
      memory: {
        pressing: Schema.Boolean,
        presses: Schema.Int,
        since: Schema.NullOr(Schema.Number),
      },
      initial: () => ({ pressing: false, presses: 0, since: null }),
      guards: ["canStart"],
      callbacks: { onHeld: {} },
    },
    ({ E, guards, callbacks }) => ({
      schedules: {
        held: {
          schedule: p.for,
          send: E.Held.from(({ armedAt }) => ({ armedAt })),
          restartOn: ({ memory }) => memory.presses, // Press re-arms; nothing disarms
        },
      },
      on: {
        Press: {
          target: "self",
          guard: guards.canStart,
          updateMemory: ({ memory, now }) => ({
            pressing: true,
            presses: memory.presses + 1,
            since: now,
          }),
        },
        Release: { target: "self", updateMemory: () => ({ pressing: false, since: null }) },
        Held: {
          target: "self",
          // Refused after a release, and refused when armed before the latest Press (a firing
          // already queued when the user released and pressed again). Assumes restartOn arms at
          // the Press turn's commit, so the live arming has armedAt equal to since.
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
import { check } from "flow-state";
import { story } from "flow-state/testing";
import { expect, test } from "vitest";
import { Strikes } from "./fragments.js";

const ThreeStrikes = Strikes({ max: 3, lockFor: "5 minutes" });
const { E } = ThreeStrikes;

// The harness fills every port and records callback calls; it may send the fragment's events.
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
  expect(run.calls.onStruck).toEqual([{ left: 2 }, { left: 1 }]);
  expect(run.calls.onLocked).toHaveLength(1);
  expect(run.checkpoints.locked.snapshot.memory.lock.until).not.toBeNull();
  // FAKED: the harness sees a UI-sendable Use on the nested lock, because Use is public.
  expect(check(run.checkpoints.locked.snapshot, E.lock.Use())._tag).toBe("Denied");
  expect(run.checkpoints.reset.snapshot.memory.count).toBe(0);
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
  // The lockout is NOT in this list. "Locked out" is the strikes fragment's nested lock
  // cooldown with until !== null (memory.strikes.lock.until); ENTERING covers both entering and
  // locked out. Fragments have no states, so the mode cannot appear here.
  states: ["PASSWORD", { TWO_FACTOR: ["ENTERING", "VERIFYING"] }, "SIGNED_IN"],
  // Attached to TWO_FACTOR: fresh on every entry, removed on Back. "Keeping nothing" is free.
  fragments: {
    code: Field(Schema.String, { validate: sixDigits }).at("TWO_FACTOR"),
    strikes: Strikes({ max: MAX_WRONG, lockFor: "5 minutes" }).at("TWO_FACTOR"),
    resend: Cooldown({ for: "30 seconds" }).at("TWO_FACTOR"),
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

// Every fragment slice here is read with ?. because the three fragments are attached with
// .at("TWO_FACTOR"): their slices exist only while TWO_FACTOR is active, and memory types are
// not narrowed by state, so even a guard on ENTERING sees memory.code as possibly undefined.

// FAKED: modes kept in memory. "Locked out" is a mode of the step, but no fragment can own a
// state, so it is the nested lock cooldown's until, read through two slices by every guard and
// view that cares.
const lockedOut = (memory: Memory) => (memory.strikes?.lock.until ?? null) !== null;

const notLocked = ({ memory }: { memory: Memory }) => !lockedOut(memory) || deny("LockedOut");

const canSubmit = ({ memory }: { memory: Memory }) => {
  if (lockedOut(memory)) return deny("LockedOut");
  if ((memory.code?.error ?? "absent") !== null) return deny("InvalidCode");
  return true;
};

export const SignInMachine = machine(SignIn, ({ S, E, O }) => {
  // FAKED: cannot fix in this system — a late verify crosses entries. Submit X, Back, accept a
  // new password, Submit Y: X's outcome still arrives (Operations O2: finite work outlives state
  // exit) and the new VERIFYING handles it as Y's (a late success signs in; a late WrongCode
  // costs a try). Fragments do no I/O, so .at cannot fence the host's commit; mappers receive
  // values only, so the outcome cannot carry the challengeId to compare; cancelling on Back turns
  // X into unknown, which lands in the new VERIFYING as CheckFailed. The system would need a
  // per-state fence for host commits, or mappers that receive the commit's input.
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
    default: S.PASSWORD,

    // One filling block per instance, at the machine root, although all three live on TWO_FACTOR.
    fragments: {
      code: {
        input: () => ({ start: "" }),
        guards: { canEdit: notLocked }, // entry refused while locked out
        callbacks: { onChanged: {} },
      },
      strikes: {
        callbacks: {
          onStruck: {
            target: "self",
            updateMemory: ({ payload }) => ({ error: `Wrong code, ${payload.left} tries left` }),
          },
          onLocked: { target: "self", updateMemory: () => ({ error: null }) }, // the countdown shows
        },
      },
      resend: {
        // The fragment refuses during the cooldown; the host only runs the I/O it asks for.
        callbacks: { onUse: { target: "self", actions: [resendCode] }, onEnded: {} },
      },
    },

    states: {
      PASSWORD: {
        on: {
          PasswordAccepted: {
            target: S.TWO_FACTOR,
            updateMemory: ({ event }) => ({ challengeId: event.challengeId, error: null }),
          },
        },
      },
      TWO_FACTOR: {
        default: S.TWO_FACTOR.ENTERING,
        on: {
          // From ENTERING or VERIFYING. Leaving removes code, strikes and resend.
          BackToPassword: { target: S.PASSWORD, updateMemory: () => ({ error: null }) },
        },
        states: {
          ENTERING: {
            on: {
              Submit: {
                target: S.TWO_FACTOR.VERIFYING,
                guard: canSubmit,
                updateMemory: () => ({ error: null }),
                actions: [verify],
              },
            },
          },
          VERIFYING: {
            on: {
              Verified: S.SIGNED_IN,
              // One turn: back to ENTERING, a strike (whose callback writes the error, or locks),
              // and the code field cleared. The parts write disjoint keys; one changes state.
              WrongCode: {
                target: S.TWO_FACTOR.ENTERING,
                raise: [E.strikes.Strike, E.code.Set.from(() => ({ value: "" }))],
              },
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

const secondsUntil = (until: number | null, now: number) =>
  until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000));

export function SignInScreen({ challengeId }: { challengeId: string }) {
  const signIn = useActor(SignInMachine);
  const step = useView(signIn, (s) => S.root.child(s));

  const body = {
    PASSWORD: (
      <button onClick={() => signIn.send(E.PasswordAccepted({ challengeId }))}>Continue</button>
    ),
    TWO_FACTOR: <TwoFactorStep signIn={signIn} />,
    SIGNED_IN: <p role="status">Signed in</p>,
  } satisfies Record<typeof step, ReactNode>;

  return <section>{body[step]}</section>;
}

function TwoFactorStep({ signIn }: { signIn: SignInActor }) {
  const now = useNow("1 second");
  const code = useView(signIn, (s) => s.memory.code?.value ?? "");
  const fieldError = useView(signIn, (s) => (s.memory.code?.touched ? s.memory.code.error : null));
  const error = useView(signIn, (s) => s.memory.error);
  // FAKED: modes kept in memory. The view reconstructs "locked out" and "resend cooling down"
  // from timestamps in two fragment slices instead of reading a state token.
  const lockedUntil = useView(signIn, (s) => s.memory.strikes?.lock.until ?? null);
  const resendUntil = useView(signIn, (s) => s.memory.resend?.until ?? null);
  const canEdit = useView(signIn, (s) => check(s, E.code.Changed({ value: "" }))._tag === "Allowed");
  const canSubmit = useView(signIn, (s) => check(s, E.Submit())._tag === "Allowed");
  const canResend = useView(signIn, (s) => check(s, E.resend.Use())._tag === "Allowed");
  const verifying = useView(signIn, (s) => S.TWO_FACTOR.VERIFYING.is(s));

  const lockSeconds = secondsUntil(lockedUntil, now);
  const resendSeconds = secondsUntil(resendUntil, now);

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
      {lockedUntil !== null && (
        <p role="status">Too many wrong codes. Try again in {lockSeconds} s.</p>
      )}
      <button type="submit" disabled={!canSubmit}>
        {verifying ? "Checking…" : "Submit"}
      </button>
      <button type="button" disabled={!canResend} onClick={() => signIn.send(E.resend.Use())}>
        {resendUntil === null ? "Resend code" : `Resend code (${resendSeconds} s)`}
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
  .advance("269 seconds") // 299 s after the lock
  .process()
  .checkpoint("still-locked")
  .advance("1 second")
  .process()
  .checkpoint("unlocked");

test("three wrong codes lock entry for five minutes, then attempts reset", async () => {
  const run = await lockout.run();
  const c = run.checkpoints;
  const { "first-wrong": first, locked, "still-locked": still, unlocked } = c;

  expect(S.TWO_FACTOR.ENTERING.is(first.snapshot)).toBe(true);
  expect(first.snapshot.memory.error).toBe("Wrong code, 2 tries left");
  expect(first.snapshot.memory.code?.value).toBe(""); // cleared
  expect(first.snapshot.memory.code?.touched).toBe(false); // so no field error yet

  expect(check(locked.snapshot, E.Submit())).toMatchObject({
    _tag: "Denied",
    reasons: [{ code: "LockedOut" }],
  });
  expect(check(locked.snapshot, E.code.Changed({ value: "4" }))._tag).toBe("Denied");
  expect(locked.snapshot.memory.strikes?.lock.until).toBe(locked.now + 300_000);

  expect(check(c["resend-cooling"].snapshot, E.resend.Use())._tag).toBe("Denied"); // 29 s in
  expect(check(c["resend-ready"].snapshot, E.resend.Use())._tag).toBe("Allowed"); // 30 s
  expect(check(still.snapshot, E.Submit())._tag).toBe("Denied"); // still locked at 299 s

  expect(unlocked.snapshot.memory.strikes?.count).toBe(0);
  expect(unlocked.snapshot.memory.strikes?.lock.until).toBeNull();
  expect(check(unlocked.snapshot, E.code.Changed({ value: "4" }))._tag).toBe("Allowed");
});
```

**Metrics (app 1)**

| Piece | Lines |
| --- | --- |
| Fragments used (Field, Cooldown, Strikes) | 109 of the shared file |
| Definition | 24 |
| Machine | 95 |
| Component | 68 |
| Story | 57 |

- New keywords: `fragment`, `fragments` (definition, machine, and inside a fragment), `.at`,
  `guards`, `callbacks`, `notify`, `raise`, `payload`, fragment `input`, nested event paths
  (`E.code.Changed`, `E.strikes.lock.Use`), `run.calls`.
- Duplicated across apps: nothing in the host. The "timer started by an event" counter idiom is
  duplicated inside the fragments file (Cooldown here; Debounce, Flash, Backoff, Hold elsewhere).

---

## App 2: Signup wizard

```ts
// signup.definition.ts
import { Schema } from "effect";
import { definition } from "flow-state";
import { Accounts } from "../accounts.operations.js"; // create (commit)
import { Backoff, Confirm, Field, TextList } from "../fragments.js";

export const ROLES = ["engineer", "designer", "manager"] as const;

const RoleDraft = Schema.Literals(["", ...ROLES]); // "" until chosen

// What O.Accounts.create receives; captured on Submit so retries resend the reviewed request.
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
    { FORM: ["ACCOUNT", "PROFILE", "INVITE", "REVIEW"] },
    "SUBMITTING",
    "DONE",
    "CANCELLED",
    "UNSURE",
  ],
  // Which page owns which fragment (a convention: see the FAKED note below):
  //   ACCOUNT → email, password      PROFILE → name, role      INVITE → invites
  //   REVIEW  → reads all five       FORM (every page) → cancel     SUBMITTING → retry
  fragments: {
    // FAKED: host wiring standing in for "a step is a state with a fragment attached". .at on a
    // page is fresh on every entry, so drafts would be lost on Back/Next and on EmailTaken. The
    // fields sit at the root for the actor's whole life instead, and which page owns which field
    // is a convention kept only by the list above, the components and the Next guards.
    email: Field(Schema.String, { validate: isEmail }),
    password: Field(Schema.String, {
      validate: (v) => (v.length >= 12 ? null : "Use at least 12 characters"),
    }),
    name: Field(Schema.String, { validate: (v) => (v.trim() !== "" ? null : "Enter your name") }),
    role: Field(RoleDraft, { validate: (v) => (v !== "" ? null : "Choose a role") }),
    invites: TextList({ max: 5, validate: (v) => (v.trim() === "" ? null : isEmail(v)) }),
    // The discard dialog is a flag in this slice (memory.cancel.open), not a state. Unlike a modal
    // state, it refuses nothing by itself; the machine's page guards read it.
    cancel: Confirm.at("FORM"), // absent while SUBMITTING, so Cancel is unhandled there
    retry: Backoff({ delays: ["1 second", "2 seconds", "4 seconds"] }).at("SUBMITTING"),
  },
  events: { Next: {}, Back: {}, Submit: {} },
  internalEvents: { Created: {}, EmailTaken: {}, Busy: {}, Unsure: {} },
  memory: { error: Schema.NullOr(Schema.String), request: Schema.NullOr(AccountRequest) },
  initial: () => ({ error: null, request: null }),
  operations: { Accounts },
});
```

```ts
// signup.machine.ts
import { deny, machine } from "flow-state";
import { Signup, type ROLES } from "./signup.definition.js";

type Memory = typeof Signup.Memory.Type;
type Guarded = { memory: Memory };
type Verdict = true | ReturnType<typeof deny>;

// FAKED: a rule kept by convention. Drafts should not change while SUBMITTING, but the fields
// live at the root, so every field instance is filled with this guard and nothing checks that one
// was forgotten. (The request itself is safe either way: it is captured on Submit.)
const editable = ({ state }: { state: string }) => state.startsWith("FORM.") || deny("Submitting");

// FAKED: modes kept in memory. The discard dialog is a flag, not a state, so it blocks nothing
// by itself. A modal state would refuse Next, Back and Submit by construction; here every page
// handler must wrap its guard in dialogClosed, and a new page handler that forgets is enabled
// under the open dialog.
const dialogClosed = ({ memory }: Guarded): Verdict =>
  !(memory.cancel?.open ?? false) || deny("DialogOpen");

const closedAnd =
  (rule: (input: Guarded) => Verdict) =>
  (input: Guarded): Verdict => {
    const closed = dialogClosed(input);
    return closed === true ? rule(input) : closed;
  };

const accountValid = closedAnd(
  ({ memory }) =>
    (memory.email.error === null && memory.password.error === null) || deny("AccountInvalid"),
);

const profileValid = closedAnd(
  ({ memory }) =>
    (memory.name.error === null && memory.role.error === null) || deny("ProfileInvalid"),
);

const invitesValid = closedAnd(
  ({ memory }) => memory.invites.errors.every((e) => e === null) || deny("InvitesInvalid"),
);

const field = { input: () => ({ start: "" as const }), guards: { canEdit: editable } };

// The request as reviewed. Read once, on Submit; retries resend the captured copy.
const requestOf = (memory: Memory) => ({
  email: memory.email.value,
  password: memory.password.value,
  name: memory.name.value,
  // FAKED: validity is a memory fact the type cannot see; profileValid guaranteed "" is gone.
  role: memory.role.value as (typeof ROLES)[number],
  // Next on INVITE dropped empty entries; dropping again keeps the request clean regardless.
  invites: memory.invites.items.filter((v) => v.trim() !== ""),
});

export const SignupMachine = machine(Signup, ({ S, E, O }) => {
  const outcomes = {
    success: E.Created,
    failure: { EmailTaken: E.EmailTaken, Busy: E.Busy },
    unknown: E.Unsure,
    interrupt: E.Unsure,
    defect: E.Unsure,
  };

  // Action parameters read the pre-turn snapshot, so Submit's own commit cannot read the request
  // that Submit's updateMemory captures. The first send builds it from the drafts; retries send
  // the captured copy, so nothing edited during SUBMITTING (e.g. invites.Add, see TextList) is
  // ever sent.
  const createFromDrafts = O.Accounts.create.commit(({ memory }) => requestOf(memory), {
    outcomes,
  });

  // FAKED: request is null only outside SUBMITTING; the type cannot see that onRetry only fires
  // inside it.
  const createCaptured = O.Accounts.create.commit(({ memory }) => memory.request!, { outcomes });

  return {
    default: S.FORM,

    fragments: {
      email: {
        ...field,
        // "That email is registered" goes away once the email is edited.
        callbacks: { onChanged: { target: "self", updateMemory: () => ({ error: null }) } },
      },
      password: { ...field, callbacks: { onChanged: {} } },
      name: { ...field, callbacks: { onChanged: {} } },
      role: { ...field, callbacks: { onChanged: {} } },
      invites: { input: () => ({ start: [] }), guards: { canEdit: editable } },
      cancel: {
        callbacks: {
          onYes: { target: S.CANCELLED }, // a callback moving the host out of the fragment's node
          // Keep: Next, Back and Submit were refused while the dialog was open, so the page
          // never changed and there is nothing to restore.
          onNo: {},
        },
      },
      retry: {
        callbacks: {
          onRetry: { target: "self", actions: [createCaptured] },
          onGaveUp: {
            target: S.FORM.REVIEW,
            updateMemory: () => ({ error: "Try again later", request: null }),
          },
        },
      },
    },

    states: {
      FORM: {
        default: S.FORM.ACCOUNT,
        states: {
          ACCOUNT: { on: { Next: { target: S.FORM.PROFILE, guard: accountValid } } },
          PROFILE: {
            on: {
              Next: { target: S.FORM.INVITE, guard: profileValid },
              Back: { target: S.FORM.ACCOUNT, guard: dialogClosed },
            },
          },
          INVITE: {
            on: {
              Next: { target: S.FORM.REVIEW, guard: invitesValid, raise: [E.invites.DropEmpty] },
              Back: { target: S.FORM.PROFILE, guard: dialogClosed },
            },
          },
          REVIEW: {
            on: {
              Submit: {
                target: S.SUBMITTING,
                guard: dialogClosed,
                updateMemory: ({ memory }) => ({ error: null, request: requestOf(memory) }),
                actions: [createFromDrafts],
              },
              Back: { target: S.FORM.INVITE, guard: dialogClosed },
            },
          },
        },
      },
      SUBMITTING: {
        on: {
          Created: S.DONE,
          EmailTaken: {
            target: S.FORM.ACCOUNT,
            updateMemory: () => ({ error: "That email is registered", request: null }),
          },
          // The fragment decides wait-or-give-up; its callbacks retry or move the host to REVIEW.
          Busy: { target: "self", raise: [E.retry.Failed] },
          Unsure: S.UNSURE, // never retried: the fragment is not told
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
    FORM: <Form signup={signup} />,
    SUBMITTING: <Submitting signup={signup} />,
    DONE: <p role="status">Welcome aboard.</p>,
    CANCELLED: <p role="status">Signup discarded.</p>,
    UNSURE: <p role="alert">Your account may have been created; check your email.</p>,
  } satisfies Record<typeof top, ReactNode>;

  return <section>{body[top]}</section>;
}

function Form({ signup }: { signup: SignupActor }) {
  const page = useView(signup, (s) => S.FORM.child(s));
  const error = useView(signup, (s) => s.memory.error);
  const canNext = useView(signup, (s) => check(s, E.Next())._tag === "Allowed");
  const canBack = useView(signup, (s) => check(s, E.Back())._tag === "Allowed");

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
        <button onClick={() => signup.send(E.cancel.Open())}>Cancel</button>
      </footer>
      <DiscardDialog signup={signup} />
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
  // FAKED: modes kept in memory; the dialog is a flag in the cancel slice, not a state. The
  // machine's page guards read the same flag, so Next, Back and Submit are refused while open.
  const open = useView(signup, (s) => s.memory.cancel?.open ?? false);
  if (!open) return null;

  return (
    <dialog open>
      <p>Discard your signup?</p>
      <button onClick={() => signup.send(E.cancel.Yes())}>Discard</button>
      <button onClick={() => signup.send(E.cancel.No())}>Keep</button>
    </dialog>
  );
}

function Submitting({ signup }: { signup: SignupActor }) {
  const retries = useView(signup, (s) => s.memory.retry?.retries ?? 0);
  return (
    <p role="status">
      {retries === 0 ? "Creating your account…" : `Server busy, retrying (${retries}/3)`}
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
  .checkpoint("busy-1") // waiting 1 s
  .send(E.invites.Add()) // still allowed (see TextList), but cannot reach the request
  .process()
  .advance("1 second")
  .process()
  .advance("2 seconds")
  .process()
  .checkpoint("busy-3") // waiting 4 s
  .advance("4 seconds")
  .process()
  .checkpoint("gave-up")
  .send(E.cancel.Open())
  .process()
  .checkpoint("dialog-open")
  .send(E.cancel.No())
  .process()
  .checkpoint("kept");

test("Busy retries three times with backoff, then returns to Review with drafts intact", async () => {
  const run = await busyThenGiveUp.run();
  const c = run.checkpoints;
  const { review, "busy-1": busy1, "busy-3": busy3, "gave-up": gaveUp, kept } = c;

  expect(review.snapshot.memory.invites.items).toEqual(["grace@example.com"]);

  expect(S.SUBMITTING.is(busy1.snapshot)).toBe(true);
  expect(busy1.snapshot.memory.retry?.retries).toBe(1);
  expect(check(busy1.snapshot, E.cancel.Open())._tag).toBe("Unhandled"); // Cancel refused
  expect(check(busy1.snapshot, E.email.Changed({ value: "x" }))._tag).toBe("Denied");
  expect(busy3.snapshot.memory.retry?.retries).toBe(3);
  // The empty invite added during the backoff is a draft only; the captured request is unchanged.
  expect(busy3.snapshot.memory.invites.items).toEqual(["grace@example.com", ""]);
  expect(busy3.snapshot.memory.request?.invites).toEqual(["grace@example.com"]);

  expect(S.FORM.REVIEW.is(gaveUp.snapshot)).toBe(true);
  expect(gaveUp.snapshot.memory.error).toBe("Try again later");
  expect(gaveUp.snapshot.memory.retry).toBeUndefined(); // removed with SUBMITTING
  expect(gaveUp.snapshot.memory.email.value).toBe("ada@example.com");

  expect(check(c["dialog-open"].snapshot, E.Submit())).toMatchObject({
    _tag: "Denied",
    reasons: [{ code: "DialogOpen" }],
  });
  expect(check(c["dialog-open"].snapshot, E.Back())._tag).toBe("Denied");

  expect(S.FORM.REVIEW.is(kept.snapshot)).toBe(true);
  expect(kept.snapshot.memory.cancel?.open).toBe(false);
});
```

**Metrics (app 2)**

| Piece | Lines |
| --- | --- |
| Fragments used (Field, Confirm, Backoff, TextList) | 157 of the shared file |
| Definition | 40 |
| Machine | 119 |
| Components | 169 |
| Story | 65 |

- New keywords beyond app 1: none. Uses `.at` on a compound (`FORM`) and a leaf (`SUBMITTING`).
- Duplicated across apps: `Field` is reused from app 1 unchanged (code field there, four fields
  here). Within the app, the `editable` guard is filled five times, `dialogClosed` wraps every
  Next, Back and Submit guard (six handlers), and `{ ...field, callbacks: { onChanged: {} } }`
  repeats per field because every port must be filled.

---

## App 3: Issue list screen

```ts
// issue-list.definition.ts
import { Schema } from "effect";
import { definition } from "flow-state";
import { Issues } from "../issues.operations.js"; // list (resource), setPinned, deleteMany (commits)
import { Debounce, Field, Flash, Hold, InFlight, Selection } from "../fragments.js";

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
    pins: InFlight,
    flash: Flash({ for: "3 seconds" }),
    hold: Hold({ for: "1500 millis" }).at("OPEN.BROWSING"), // gone while DELETING
  },
  events: {
    SortChanged: { sort: Sort },
    StatusChanged: { status: Status },
    NextPage: {},
    PreviousPage: {},
    PageSelected: {}, // "select all on this page": the host reads the ids from the lane
    Pin: { id: Schema.String, title: Schema.String, pinned: Schema.Boolean },
  },
  internalEvents: {
    RefreshDue: {},
    PinDone: { id: Schema.String },
    PinFailed: { id: Schema.String },
    PinUnsure: { id: Schema.String },
    PinLost: {},
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
  // repeated on every handler that changes search, sort, status or page. The Selection fragment
  // cannot watch the query (no context, no input after activation), and nothing checks that a
  // new query-changing handler remembers it.
  const clearSelection = E.selection.Clear;

  const refetch = O.Issues.list.refetch(query);

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
        success: E.PinDone.from((issue) => ({ id: issue.id })),
        // FAKED: outcome mappers receive values only, so the row is named by an id the adapter
        // puts in its PinRejected error. Not a fragment strain; every system has it.
        failure: { PinRejected: E.PinFailed.from(({ id }) => ({ id })) },
        // The optimistic layer survives unknown (Operations O5) until a confirming read; refetch.
        unknown: E.PinUnsure.from((attempt) => ({ id: attempt.input.id })),
        // FAKED: defect and interrupt carry no id at all, so they end every in-flight pin.
        defect: E.PinLost,
        interrupt: E.PinLost,
      },
    },
  );

  const deleteSelected = O.Issues.deleteMany.commit(({ memory }) => ({ ids: memory.selection.ids }), {
    outcomes: {
      success: E.Deleted,
      failure: E.DeleteFailed,
      defect: E.DeleteFailed,
      interrupt: E.DeleteFailed,
      unknown: E.DeleteUnsure,
    },
  });

  const endPin = E.pins.End.from(({ event }) => ({ key: event.id }));
  const flashPinFailed = E.flash.Show.from(({ memory, event }) => ({
    text: `Couldn't pin ${memory.pins.items[event.id] ?? "the issue"}`,
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
        // Field → Debounce: the host wires one fragment's report into the other.
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
      pins: {},
      flash: {},
      hold: {
        guards: {
          canStart: ({ memory }) => memory.selection.ids.length > 0 || deny("NothingSelected"),
        },
        // Leaves BROWSING, which removes the Hold fragment that called it. canStart is checked
        // only at Press; the selection can be cleared mid-hold (the search debounce settles,
        // say), so the filling checks again and otherwise does nothing.
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
          // The ids come from the list lane, never from the sender, so a stale click from a
          // previous page cannot select rows that are not on screen.
          PageSelected: {
            target: "self",
            raise: [
              E.selection.SelectAll.from(({ activities }) => ({
                ids: (activities.list?.data?.items ?? []).map((issue) => issue.id),
              })),
            ],
          },
          // If the row is in flight, the raised Begin is refused, so the whole Pin is refused and
          // check(s, E.Pin(…)) says Denied InFlight. No commit starts.
          Pin: {
            target: "self",
            raise: [E.pins.Begin.from(({ event }) => ({ key: event.id, label: event.title }))],
            actions: [pin],
          },
          PinDone: { target: "self", raise: [endPin] },
          PinFailed: { target: "self", raise: [flashPinFailed, endPin] },
          PinUnsure: { target: "self", raise: [flashPinFailed, endPin], actions: [refetch] },
          // FAKED: cannot fix in this system — defect and interrupt carry no row id (mappers
          // receive values only), so every in-flight marker is dropped. While another row's pin
          // is still running, a second click on it is then allowed and setPinned declines it
          // silently. Keeping the markers instead would leave the lost row unpinnable until the
          // screen reopens. The system would need mappers that receive the commit's input.
          PinLost: {
            target: "self",
            raise: [E.pins.EndAll, E.flash.Show.from(() => ({ text: "Couldn't pin an issue" }))],
          },
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
              <PinButton list={list} id={issue.id} title={issue.title} pinned={issue.pinned} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PinButton(props: { list: ListActor; id: string; title: string; pinned: boolean }) {
  const { list, id, title, pinned } = props;
  const pin = E.Pin({ id, title, pinned: !pinned });
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
import { SlowFailingPin } from "../../testing/fixtures.js"; // setPinned waits 1 s, then PinRejected
import { IssueList } from "./issue-list.definition.js";
import { IssueListMachine } from "./issue-list.machine.js";

const { E, S } = IssueList;

// Seeded server truth: I-1 "Login broken" (unpinned) and I-2 "Slow search" on page 1.
const pinI1 = E.Pin({ id: "I-1", title: "Login broken", pinned: true });

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
    reasons: [{ code: "InFlight" }],
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

**Metrics (app 3)**

| Piece | Lines |
| --- | --- |
| Fragments used (Field, Debounce, Selection, InFlight, Flash, Hold) | 196 of the shared file |
| Definition | 48 |
| Machine | 165 |
| Components | 143 |
| Story | 60 |

- New keywords beyond app 1: none. Exercises ordered alternatives in a callback filling
  (`onSettled`) and a raised event whose refusal refuses the host's transition (`Pin`).
- Duplicated across apps: `Field` again (search box, with a no-op validator and an always-true
  `canEdit`). Within the app, `raise: [clearSelection]` five times, and the flash wiring three
  times.

---

## Totals

| | Lines |
| --- | --- |
| Shared fragments file (11 fragments, with imports) | 377 |
| Fragment harness test | 24 |
| Hosts (definitions + machines) | 491 |
| Components | 380 |
| Stories | 182 |

All line counts in this file are non-blank, non-comment lines of each code block (the principles
review's method). The first draft counted comments too, so its numbers are higher.

Reused across apps: `Field` (3 apps, 7 instances). Reused within an app: `Cooldown` (app 1: once
directly for resend, once nested in `Strikes` for the lockout). Used once: `Strikes`, `Confirm`, `Backoff`, `TextList`,
`Debounce`, `Flash`, `Selection`, `InFlight`, `Hold`.

---

## How this system felt

**Easy.** One kind is easy to hold in your head: a fragment is memory plus handlers plus maybe a
timer, and the host does all I/O. `.at` gave the two-factor step "keep nothing on Back" for free:
leaving `TWO_FACTOR` throws away the code, the strikes, the lockout timer and the resend cooldown
in one move. Callbacks that may move the host anywhere made the endings simple: Confirm's
`onYes → CANCELLED`, Backoff's `onGaveUp → REVIEW`, Hold's `onHeld → DELETING` all read as one
line. The one-turn rule paid off twice: the `WrongCode` turn changes state, counts a strike,
writes the message through a callback and clears the field atomically; and `Pin` is refused
outright, with `check()` agreeing, because the `InFlight` fragment's `Begin` refuses. `Field`
carried over all three apps unchanged.

**Strained.** Three things, all from "no states, no I/O, internal events are schedule-only":

1. **Modes in memory.** Lockout, resend cooldown, the discard dialog, backoff waiting, and holding
   are all states in spirit and flags or timestamps here. Guards and views reconstruct them
   (`memory.strikes?.lock.until !== null`), and the state list no longer shows the flow: the
   lockout is nowhere in `states`. Two of the first draft's bugs came straight from this. The
   discard dialog refused nothing until every page guard was wrapped in `dialogClosed`, and Hold
   checked the selection only at Press. Both are fixed now, by convention: the next handler
   that forgets the flag is a bug again.
2. **Timers have to be faked.** A fragment can't enter a state, so every "timer started by an event"
   is a counter plus `restartOn`, written five times (Cooldown, Debounce, Flash, Backoff, Hold).
   Nothing can disarm a timer. Hold has to refuse a stale `Held` twice over: by its pressing
   flag, and by comparing the schedule's `armedAt` with the latest press, for a firing queued
   before a quick re-press.
3. **Host-to-fragment facts are public.** The host can only feed a fragment through its public
   `events`, so `Set`, `Strike`, `Input`, `Failed`, `Show`, `SelectAll`, `Begin/End` and
   `DropEmpty` can all be sent by any component. Eight fragments carry a FAKED mark for this alone.

Placement strained too. "A step is a host state with a fragment `.at` it" works for two-factor,
but the signup pages had to keep their fields at the root because `.at` resets on every entry, and
drafts must survive Back, Next and EmailTaken. Which page owns which field is now a convention,
written down only as a comment. Root fields can be edited while submitting, so the signup
host captures its request on Submit, and every retry sends that copy. That is the right fix, but
it is host code the next wizard will copy. A guard slot takes one function, so `TextList.Add`
cannot honour the host's `canEdit` at all. Fragment slices of `.at` placements are optional in the
types, so hosts write `?.` everywhere and cast where a guard has already proved something
(`role as Role`, `request!`).

Two bugs cannot be fixed in C, and the plans don't fix them for any system. A late verify can
cross into a new two-factor entry: host commits are not fenced, and mappers can't carry the
challenge. A defect or interrupt on a pin can't name its row. C makes the first worse than a
system with I/O fragments would: the step's fragments are fresh, but the commit that matters is
the host's.

**Faked most.** Public events standing in for host-only ones (8 fragments). Modes kept in memory
(4 fragments, plus the host guards and views that rebuild those modes: `lockedOut`,
`dialogClosed`, the hold re-check). Then conventions: selection-clears-on-query-change as five
repeated raises, freezing drafts while submitting as a guard filled once per field, and the
dialog flag wrapped into six page guards.

**Reused.** `Field` across all three apps, and `Cooldown` twice in app 1. Everything else was used
once. The pieces are small enough that reuse is cheap. But each is so thin (a counter, a flag, a
set) that much of each app's behaviour still sits in the host's handlers and fillings: the
machines are 95 to 165 lines. Mostly, the fragments move state out of the host's states and
into its memory.

---

## Fix log

Findings from [reviews/correctness.md](reviews/correctness.md) (fix list §6 C, plus C bugs in the
tables) and [reviews/principles.md](reviews/principles.md) (clarity list §8 C).

**Bugs**

| # | Finding | Change |
| --- | --- | --- |
| B1 | App 2: the discard dialog doesn't block Next, Back or Submit; Next moves pages under the open dialog, and Submit with it open starts the commit. | Fixed by convention. `dialogClosed` guard in the machine; `closedAnd` wraps each page's Next guard, and every Back and Submit carries it. Story asserts Submit and Back are Denied `DialogOpen`. Still FAKED (modes in memory): a new page handler that forgets the wrapper is enabled under the dialog. |
| B2 | App 2: `invites.Add` is allowed while SUBMITTING and the retry re-reads invites, sending an empty invite. | Fixed in the host. Submit captures `request` in host memory; retries send the captured copy (`createCaptured`). The first send builds from drafts, because actions read the pre-turn snapshot. `Add` itself stays allowed while submitting: C has no way to AND a fragment's own guard with a host port (FAKED at TextList, saying what the system would need). The story adds an invite during the backoff and asserts the request is unchanged. |
| B3 | App 3: `onHeld` deletes with an empty selection when the search settles mid-hold. | Fixed. `onHeld` is two ordered alternatives: DELETING guarded on a non-empty selection, then `{ target: "self" }`. The story presses, lets the search clear the selection, holds to 1.5 s, and asserts BROWSING. |
| B4 | App 1 story: asserts `resend.until` is not null at 299 s; the 30 s cooldown has ended. **The test fails.** | Fixed. New checkpoints at +29 s (`resend-cooling`, Resend Denied) and +30 s (`resend-ready`, Allowed). Then +269 s to `still-locked` (Submit Denied), then +1 s to `unlocked`. |
| B5 | App 1: a late verify crosses entries (Submit X, Back, new challenge, Submit Y; X's outcome is taken as Y's). | Cannot fix in this system. Marked `// FAKED: cannot fix in this system` at the verify commit. Fragments do no I/O, so `.at` cannot fence a host commit. Mappers receive values only, so the challenge cannot ride the outcome. Cancel on Back misroutes as `unknown`. The system would need a per-state fence for host commits, or mappers that receive the commit's input (correctness §4.1, §4.8). |
| B6 | App 3: press, release at 1.49 s, press again; a `Held` already queued is delivered while `pressing` is true, so the delete fires early. | Fixed inside the system. `Held` now carries the schedule's `armedAt` metadata (Machines O5: `E.X.from(metadata)`). Its guard refuses a firing armed before the latest Press (`event.armedAt < memory.since`). This assumes `restartOn` arms at the Press turn's commit time, and the assumption is noted at the guard. |
| B7 | App 3: select-all takes ids from the sender; a stale click after Next selects rows not on screen. | Fixed for the UI path. The new host event `PageSelected` raises `selection.SelectAll` with ids read from the list lane, and the component sends it. `SelectAll` is still public (FAKED: any sender can pass arbitrary ids). |
| B8 | App 3: interrupt or defect on one pin forgets every in-flight pin (shared gap §4.1). | Stays. `PinLost` still ends all markers: keeping them would leave the lost row unpinnable until the screen reopens, which is worse. Now marked `// FAKED: cannot fix in this system` with the needed change (mappers that receive the commit's input). |

**Clarity**

| # | Finding | Change |
| --- | --- | --- |
| C1 | Say where the lockout lives at the sign-in state list. | Comment above `states` in `sign-in.definition.ts`: the lockout is `memory.strikes.lock.until`, not a state. |
| C2 | List which fields belong to which page at the signup definition. | Page → fragment table as a comment above `fragments`. |
| C3 | Say plainly that the dialog does not block like a modal state. | Said at the `cancel` placement, at `dialogClosed` in the machine, and in the DiscardDialog component. The machine now blocks by convention (B1). |
| C4 | Explain `?.` on fragment slices once. | Explained at the top of `sign-in.machine.ts`: `.at` slices exist only while their node is active, and memory isn't narrowed by state. |
| C5 | Note at the Hold fragment that a stale `Held` is refused. | Hold's FAKED comment and the `Held` guard both explain the release refusal and the `armedAt` fence (B6). |
| — | The principles review counts non-blank, non-comment lines. | All metrics recounted the same way and the method is stated under Totals. |
| — | Reflection | "How this system felt" now covers the two bugs that came from modes in memory, the request capture, and the two bugs this system cannot fix. |
