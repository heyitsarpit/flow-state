# Machine fragments: traits and subroutines (version 3)

**Status:** proposal, not accepted. It **supersedes [proposal-v2.md](proposal-v2.md)**. It is
evaluated against [principles.md](principles.md). It is the "locked-island split" that came out of
the four-system comparison ([comparison/README.md](comparison/README.md)), written as one design.
Where this file and a plan differ, the plan wins; section 5 lists every plan amendment it assumes,
with the sentence each one replaces. All syntax is a working draft.

## 1. The idea

Three layers, each owning one thing.

- **Operations own every I/O rule:** commits, reads, retries, fencing of late results, uncertainty,
  restore.
- **Machines own states, turns, timers and history.**
- **Fragments are locked islands of logic with no I/O.** A fragment is behaviour written once and
  placed into a machine at construction: a validated field, a countdown, a confirmation, a
  selection. The actor stays one actor, with one mailbox, one turn and one plain snapshot.

There are two kinds:

- A **trait** is something the actor _has_: no states, alive while its node is active.
- A **subroutine** is something the actor _goes into_: placed as a state, fresh on every entry, and
  left through a declared **exit**.

A fragment declares a contract: what it reads, which events it takes from whom, where the host may
refuse, what it tells the host, and how it ends. The host fills that contract and cannot reach
inside. Because fragments do no I/O, the machine reads like today's machines: the host runs every
operation and feeds the answers into its fragments by raising their events.

The comparison showed why the layers are split this way. The rules that made the apps correct
(fenced late results, retry policy, outcome attribution, outstanding-call reads, history, readable
deadlines) help plain machines as much as fragments, so they belong in the plans. The trade is
explicit: v3 reuses **pieces** (fields, timers, dialogs, selections), not I/O **policy**. Policy is
written once per machine, using commit options such as `retry`.

## 2. Fragments

### 2.1 The two kinds

| | `trait(contract, body)` | `subroutine(contract, body)` |
| --- | --- | --- |
| The actor… | has it | goes into it |
| Examples | field, countdown, debounce, selection, pager, flash | confirm, hold-to-confirm, wizard step, picker |
| Placed (definition) | `traits: { code: Field(…) }` at the root, or `Field(…).at("TWO_FACTOR")` on a node | a state: `states: [{ CANCELLING: Confirm }]` |
| Many of them | `Field(…).list({ max: 5 })`: keyed instances | no |
| Instance name | the `traits` key (`code`) | the state's name (`CANCELLING`) |
| States of its own | none | yes, under its state (`HOLDING.WAITING`) |
| Lives | while its node is active (the root: the actor's life); fresh on every activation | while its state is active; fresh on every entry |
| Re-activated | when its `resetOn` selection changes | on every entry |
| Ends | when its node is left | by taking an exit, or abandoned when the host leaves its state |
| Contains | traits | traits and subroutines |
| Read as | `s.memory.code`, `s.schedules.code.…` | `s.memory.CANCELLING`, `undefined` while inactive |

One question picks the kind: **does the actor have it, or go into it?** A countdown that runs beside
other states is a trait. A dialog that blocks what is under it is a subroutine.

### 2.2 The contract

```ts
trait({
  id: "Field",
  input: { start: value },              // filled by the host, read once at activation
  events: { Changed: { value } },       // sent by anyone, at the instance path
  hostEvents: { Reset: {} },            // sent only by the direct host, with `raise`
  internalEvents: { Due: {} },          // produced only by this fragment's own schedules
  memory: { value, error: … },
  initial: ({ input }) => ({ … }),
  guards: { canEdit: optional() },      // where the host may refuse; optional() defaults to allow
  callbacks: { onChanged: optional({ value }) }, // what the host hears; optional() defaults to ignore
  // subroutines also: states, default, exits: { Confirmed: {}, Declined: {} }
}, ({ S, E, guards, callbacks, exits }) => ({ schedules, on, states }))
```

| Port | The fragment uses it as | The host fills it with |
| --- | --- | --- |
| `input` | `initial({ input })` | `input: ({ memory, event }) => …`, evaluated after the activating turn's updates |
| `events` | handled in `on` | nothing; views and other senders send `E.code.Changed(…)` |
| `hostEvents` | handled in `on` | `raise: [E.code.Reset]` on any host transition |
| `internalEvents` | sent by its own `schedules` | nothing |
| `guards` | `guard: guards.canEdit` | `guards: { canEdit: (g) => … \|\| deny("Locked") }`, or an array of guards that must all pass |
| `callbacks` | `notify: [callbacks.onChanged.from(f)]` on a transition | an `on`-style handler (`target?`, `updateMemory?`, `actions?`, `raise?`), possibly ordered alternatives ending in an unguarded one |
| `exits` | `target: exits.Done`, or `exits.Done.from(f)` | an `on`-style handler that must leave the subroutine's state |

The host fills each instance in **one block**, in the machine:

- traits under `traits.<name>`, wherever they are placed;
- subroutines on their state, `states.<NAME>`.

A port is **required** unless the fragment wraps it in `optional(…)`, and an unfilled required port
is a type error. Defaults:

- an optional guard **allows**;
- an optional callback **ignores**.

Because an allowing default grants permission silently, `flow check` lists every unfilled optional
guard as an info finding. The fragment author chooses which guards may default, and should leave
any guard that protects data required.

Fragments may not declare `operations`, `activities`, `context`, `onContext`, `send` or persistence.

### 2.3 Where things go

| What | Where |
| --- | --- |
| Placing a trait, a list of traits, a subroutine | host **definition**: `traits`, `states` |
| Filling ports, `resetOn` | host **machine**: `traits.<name>` or `states.<NAME>` |
| Feeding a fact into a fragment | host **machine**: `raise` on any host transition |
| Running I/O and mapping outcomes | host **machine**: actions and outcomes onto the host's own events |

Placement is structure (it produces `S`, `E` and the view types), so it lives in the definition.
Filling refers to `S`, `E` and `O`, so it lives in the machine.

### 2.4 The rules

1. **Lifetime comes from placement.**
   - A trait is fresh each time its node activates. A subroutine is fresh on every entry. Leaving
     the node or state cancels its schedules and drops its memory.
   - A trait slice placed at X is typed as present in every handler, guard and select declared at
     or below X.
   - **`resetOn`** re-activates a trait inside the turn: after the turn's updates and raises, and
     before validation. Selections are compared to their baselines repeatedly until none changes,
     so a reset that changes memory another selection reads is seen in the same turn. Each trait
     resets at most once per turn; a selection that changes again after its trait reset is a
     pre-commit defect (Machines O3). A raise into a trait applies before its reset, so the reset
     wins. Everything joins the turn's one publication. The baseline is set at activation, from
     the activating turn's committed memory.
2. **Three sender lists.**
   - `events` come from anyone: views, other actors, the host.
   - `hostEvents` come only from the direct host, by `raise`.
   - `internalEvents` come only from the fragment's own schedules.

   The host maps operation outcomes onto **its own** events and raises into fragments. Sending a
   host or internal event from outside is a type error, and `InvalidEvent` untyped.
3. **No I/O.** Fragments run no operations, read no context and send to no actor.
4. **The host cannot reach inside.** It cannot handle a fragment's events in its own `on`, write its
   memory, or change its transitions. It can read everything. Its policy enters only through the
   declared guards.
5. **Every port is filled, or optional.** A guard slot, in a contract or a transition, may hold an
   array of guards; all must pass.
6. **Callbacks ask; exits leave.** A callback never moves the host out of the fragment's placement
   node, so a root trait's callback may target anything, and a subroutine's callback targets
   nothing. An exit filling must leave the subroutine's state. Every exit is filled, and the host
   may always leave a subroutine's state with its own events, which abandons it.
7. **One turn.** A transition, the callbacks it notifies, the exits it takes, the events it raises
   and the resets it causes compile into one transition.
   - Every guard reads the pre-turn snapshot.
   - If any part refuses, the whole turn refuses, and `check()` agrees, evaluating raise payloads
     to supply child guards.
   - Parts write disjoint memory keys, and at most one part changes state.
   - The raise/notify graph is acyclic.
8. **Deliveries are never lost.** This applies to every event a server or a clock produces:
   - every outcome event of a fenced commit (section 5, P2);
   - every exit filling;
   - every timer-fired handler.

   Each must be handled, ending in an unguarded alternative, in every state where it can arrive.
   The same holds, transitively, for everything those handlers raise or notify: each raise must
   target an event the child handles unguarded at its root or in every leaf. `flow check` follows
   the fused chain and rejects any other. A user's event may be refused; a server's answer may not.
9. **Lists are keyed.** `T.list({ max })` places up to `max` instances. Each is identified by a key
   that the runtime mints when it is added; Stories seed these keys.
   - **Events.** The list has two public events. `Add` mints a key, fills the new instance's
     `input`, and is refused at `max`. `Remove { keys }` never refuses, so it may be raised from
     anywhere. Instances are addressed by key: `E.invites.key(k).Changed(…)`.
   - **Reading.** `s.memory.invites` is the instances in order, each with its `key`.
   - **Filling.** One filling block serves every instance, and callback payloads carry `key`.
   - **Removal.** A removed instance's schedules are cancelled and its memory dropped. An event
     addressed to an absent key is `Unhandled` (in `check()` too), and changes nothing.
10. **Nesting hides the level below.** A fragment fills its own children's ports and raises only
    into its direct children. The host sees only the outer contract. Nested names stay readable.
11. **Tested alone.** `story.machine(fragment, { id })` fills every port with a recording harness
    and may send `hostEvents`. `run.calls.<callback>` records notifications; `checkpoint.exit`
    records exits; `.enter(input)` and `.leave()` drive a subroutine.

## 3. Example

### 3.1 Two-factor sign-in, in full

The apps are those of [comparison/apps.md](comparison/apps.md). The flow is `PASSWORD → TWO_FACTOR →
SIGNED_IN`. In the two-factor step:

- a 6-digit code;
- three wrong codes lock **that challenge** for 5 minutes;
- resend is refused for 30 seconds after each resend;
- Back to password keeps the wrong attempts and the lockout for the same challenge, and a wrong
  code that settles after Back still counts.

```ts
// fragments.ts
import { deny, optional, trait } from "flow-state";
import { Duration, Schema } from "effect";

// A validated value. The error is always computed; `touched` says whether to show it yet.
export const Field = <V, I>(value: Schema.Codec<V, I>, p: { validate: (v: V) => string | null }) =>
  trait(
    {
      id: "Field",
      input: { start: value },
      events: { Changed: { value } },
      hostEvents: { Reset: {} },
      memory: { value, start: value, error: Schema.NullOr(Schema.String), touched: Schema.Boolean },
      initial: ({ input }) => ({
        value: input.start,
        start: input.start,
        error: p.validate(input.start),
        touched: false,
      }),
      guards: { canEdit: optional() },
      callbacks: { onChanged: optional({ value }) },
    },
    ({ guards, callbacks }) => ({
      on: {
        Changed: {
          target: "self",
          guard: guards.canEdit,
          updateMemory: ({ event }) => ({ value: event.value, error: p.validate(event.value), touched: true }),
          notify: [callbacks.onChanged.from(({ event }) => ({ value: event.value }))],
        },
        Reset: {
          target: "self",
          updateMemory: ({ memory }) => ({ value: memory.start, error: p.validate(memory.start), touched: false }),
        },
      },
    }),
  );

// Runs once per Start. Start never refuses (rule 8): raising it re-arms the timer.
// "Running" is the armed schedule itself: s.schedules.<name>.done !== undefined.
export const Countdown = (p: { length: Duration.Input }) =>
  trait(
    {
      id: "Countdown",
      hostEvents: { Start: {} },
      internalEvents: { Done: {} },
      callbacks: { onDone: optional({}) },
    },
    ({ E, callbacks }) => ({
      schedules: { done: { schedule: p.length, send: E.Done, armOn: [E.Start] } },
      on: {
        Start: { target: "self" },
        Done: { target: "self", notify: [callbacks.onDone] },
      },
    }),
  );
```

```ts
// signin.definition.ts
import { definition, uncertain } from "flow-state";
import { Schema } from "effect";
import { Auth } from "./auth.operations";
import { Countdown, Field } from "./fragments";

export const SignIn = definition({
  id: "Auth/SignIn",
  states: ["PASSWORD", { TWO_FACTOR: ["ENTERING", "VERIFYING", "LOCKED_OUT"] }, "SIGNED_IN"],
  traits: {
    // Fresh on every entry to TWO_FACTOR: Back drops the typed code and the resend cooldown.
    code: Field(Schema.String, {
      validate: (v) => (/^\d{6}$/.test(v) ? null : "Enter the 6-digit code"),
    }).at("TWO_FACTOR"),
    resendCooldown: Countdown({ length: "30 seconds" }).at("TWO_FACTOR"),
    // At the root: the lockout survives Back to password.
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
    CodeUnchecked: uncertain({}), // the only kind of event unknown / interrupt / defect may target
  },
  memory: {
    challengeId: Schema.String,
    wrongAttempts: Schema.Int,
    lockedChallenge: Schema.NullOr(Schema.String), // the challenge the running lockout belongs to
    error: Schema.NullOr(Schema.String),
  },
  initial: () => ({ challengeId: "", wrongAttempts: 0, lockedChallenge: null, error: null }),
  operations: { Auth },
});
```

```ts
// signin.machine.ts
import { deny, machine } from "flow-state";
import { SignIn } from "./signin.definition";

const MAX_WRONG = 3;

export const SignInMachine = machine(SignIn, ({ S, E, O }) => {
  const isLockedOut = ({ state }) => S.TWO_FACTOR.LOCKED_OUT.is(state);
  const lockMemory = ({ memory }) => ({
    wrongAttempts: MAX_WRONG,
    lockedChallenge: memory.challengeId,
    error: null,
  });
  const lockNow = {
    target: S.TWO_FACTOR.LOCKED_OUT,
    updateMemory: lockMemory,
    raise: [E.code.Reset, E.lockout.Start], // unguarded hostEvents: safe from an outcome (rule 8)
  } as const;

  // Fenced to the VERIFYING activation it starts in (P2): its outcomes are handled only there. A
  // result that settles after Back goes to `abandoned`, which still counts a wrong code.
  const verify = O.Auth.verifyCode.commit(
    ({ memory }) => ({ challengeId: memory.challengeId, code: memory.code.value }),
    {
      outcomes: {
        success: E.CodeAccepted,
        failure: { WrongCode: E.CodeWrong, Expired: E.CodeExpired },
        notSent: E.CodeUnchecked,
        unknown: E.CodeUnchecked,
        interrupt: E.CodeUnchecked,
        defect: E.CodeUnchecked,
      },
      abandoned: {
        updateMemory: ({ payload, memory }) =>
          payload.tag === "WrongCode" && payload.input.challengeId === memory.challengeId
            ? { wrongAttempts: memory.wrongAttempts + 1 }
            : {},
      },
    },
  );

  const resend = {
    target: "self",
    guard: ({ schedules }) => schedules.resendCooldown.done === undefined || deny("CoolingDown"),
    actions: [O.Auth.resendCode.commit(({ memory }) => ({ challengeId: memory.challengeId }))],
    raise: [E.resendCooldown.Start],
  } as const;

  const toEntering = (error: string) => ({ target: S.TWO_FACTOR.ENTERING, updateMemory: () => ({ error }) });

  return {
    default: S.PASSWORD,

    traits: {
      code: { input: () => ({ start: "" }), guards: { canEdit: (g) => !isLockedOut(g) || deny("LockedOut") } },
      resendCooldown: {},
      lockout: {
        // A root trait's callback may move the host anywhere.
        callbacks: {
          onDone: [
            {
              target: S.TWO_FACTOR.ENTERING,
              guard: (g) => isLockedOut(g) || deny("Elsewhere"),
              updateMemory: () => ({ wrongAttempts: 0, lockedChallenge: null, error: null }),
            },
            {
              target: "self", // away, or on another challenge: only the locked one is reset
              updateMemory: ({ memory }) => ({
                lockedChallenge: null,
                wrongAttempts:
                  memory.lockedChallenge === memory.challengeId ? 0 : memory.wrongAttempts,
              }),
            },
          ],
        },
      },
    },

    states: {
      PASSWORD: {
        on: {
          PasswordAccepted: [
            // This challenge is still locked: back to its countdown.
            {
              target: S.TWO_FACTOR.LOCKED_OUT,
              guard: ({ event, memory, schedules }) =>
                (schedules.lockout.done !== undefined && memory.lockedChallenge === event.challengeId) ||
                deny("NotLocked"),
              updateMemory: ({ event }) => ({ challengeId: event.challengeId, wrongAttempts: MAX_WRONG, error: null }),
            },
            // A wrong code that settled while away reached the limit: lock on entry.
            {
              target: S.TWO_FACTOR.LOCKED_OUT,
              guard: ({ event, memory }) =>
                (event.challengeId === memory.challengeId && memory.wrongAttempts >= MAX_WRONG) ||
                deny("TriesLeft"),
              updateMemory: lockMemory,
              raise: [E.lockout.Start], // `code` is not active yet; it starts fresh
            },
            {
              target: S.TWO_FACTOR,
              updateMemory: ({ event, memory }) => ({
                challengeId: event.challengeId,
                wrongAttempts: event.challengeId === memory.challengeId ? memory.wrongAttempts : 0,
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
              Submit: [
                // A late wrong code reached the limit while the user was already back here.
                { ...lockNow, guard: ({ memory }) => memory.wrongAttempts >= MAX_WRONG || deny("TriesLeft") },
                {
                  target: S.TWO_FACTOR.VERIFYING,
                  guard: ({ memory }) => memory.code.error === null || deny("InvalidCode"),
                  updateMemory: () => ({ error: null }),
                  actions: [verify],
                },
              ],
              Resend: resend,
            },
          },
          VERIFYING: {
            on: {
              CodeAccepted: S.SIGNED_IN,
              CodeWrong: [
                { ...lockNow, guard: ({ memory }) => memory.wrongAttempts + 1 >= MAX_WRONG || deny("TriesLeft") },
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
          LOCKED_OUT: { on: { Resend: resend } }, // Submit is Unhandled; typing is refused by canEdit
        },
      },

      SIGNED_IN: {},
    },
  };
});
```

```tsx
// TwoFactorStep.tsx
import { check, type Actor } from "flow-state";
import { useNow, useView } from "flow-state/react";
import { SignIn } from "./signin.definition";
import type { SignInMachine } from "./signin.machine";

const { S, E } = SignIn;
const secondsLeft = (dueAt: number | undefined, now: number) =>
  dueAt === undefined ? 0 : Math.max(0, Math.ceil((dueAt - now) / 1000));

export function TwoFactorStep({ signIn }: { signIn: Actor<typeof SignInMachine> }) {
  const now = useNow("1 second");
  const code = useView(signIn, (s) => (S.TWO_FACTOR.is(s) ? s.memory.code : null));
  const error = useView(signIn, (s) => s.memory.error);
  const resendDue = useView(signIn, (s) => s.schedules.resendCooldown?.done?.dueAt);
  const lockoutDue = useView(signIn, (s) =>
    S.TWO_FACTOR.LOCKED_OUT.is(s) ? s.schedules.lockout.done?.dueAt : undefined,
  );
  const canType = useView(signIn, (s) => check(s, E.code.Changed({ value: "" }))._tag === "Allowed");
  const canSubmit = useView(signIn, (s) => check(s, E.Submit())._tag === "Allowed");
  const canResend = useView(signIn, (s) => check(s, E.Resend())._tag === "Allowed");
  const resendIn = secondsLeft(resendDue, now);

  return (
    <form onSubmit={(e) => (e.preventDefault(), signIn.send(E.Submit()))}>
      <input
        inputMode="numeric"
        maxLength={6}
        value={code?.value ?? ""}
        disabled={!canType}
        onChange={(e) => signIn.send(E.code.Changed({ value: e.target.value }))}
      />
      {code?.touched && code.error && <p className="hint">{code.error}</p>}
      {error && <p role="alert">{error}</p>}
      {lockoutDue !== undefined && (
        <p role="status">Too many wrong codes. Try again in {secondsLeft(lockoutDue, now)} s.</p>
      )}
      <button type="submit" disabled={!canSubmit}>Submit</button>
      <button type="button" disabled={!canResend} onClick={() => signIn.send(E.Resend())}>
        {resendIn > 0 ? `Resend code (${resendIn} s)` : "Resend code"}
      </button>
      <button type="button" onClick={() => signIn.send(E.BackToPassword())}>Back to password</button>
      {/* signIn.send(E.code.Reset())   ← type error: a hostEvent  */}
      {/* signIn.send(E.CodeWrong())    ← type error: internal     */}
    </form>
  );
}
```

```ts
// countdown.test.ts: a fragment alone
const Cooldown = Countdown({ length: "30 seconds" });
const runsOnce = story
  .machine(Cooldown, { id: "Countdown/runs-once" })
  .send(Cooldown.E.Start()) // the harness may send hostEvents
  .process()
  .checkpoint("running")
  .advance("30 seconds")
  .process()
  .checkpoint("end");
// run.checkpoints.running.snapshot.schedules.done.dueAt === running.now + 30_000
// run.calls.onDone.length === 1; run.checkpoints.end.snapshot.schedules.done === undefined
```

### 3.2 A subroutine with exits, history and a commit retry

The signup wizard's discard dialog is `Confirm`. Keep returns to whichever page Cancel came from.
Submitting retries `Busy` three times at 1 s, 2 s and 4 s, and never retries an uncertain outcome.

```ts
export const Confirm = subroutine(
  { id: "Confirm", events: { Yes: {}, No: {} }, exits: { Confirmed: {}, Declined: {} } },
  ({ exits }) => ({ on: { Yes: exits.Confirmed, No: exits.Declined } }),
);

// signup.definition.ts (excerpt)
states: [
  { WIZARD: ["ACCOUNT", "PROFILE", "INVITE", "REVIEW"] },
  { CANCELLING: Confirm },
  "SUBMITTING", "UNSURE", "DONE", "CANCELLED",
],
internalEvents: { Created: {}, EmailTaken: {}, Busy: {}, Retrying: { n: Schema.Int }, Unsure: uncertain({}) },

// signup.machine.ts (excerpt)
const create = O.Accounts.create.commit(reviewedFields, {
  retry: { on: ["Busy"], schedule: Schedule.exponential("1 second").pipe(Schedule.recurs(3)) },
  outcomes: {
    success: E.Created,
    failure: { EmailTaken: E.EmailTaken, Busy: E.Busy }, // Busy arrives only after the last retry
    retrying: E.Retrying.from(({ retry }) => ({ n: retry })),
    notSent: E.Unsure, unknown: E.Unsure, interrupt: E.Unsure, defect: E.Unsure,
  },
});

WIZARD: { default: S.WIZARD.ACCOUNT, on: { Cancel: S.CANCELLING }, states: { /* pages; REVIEW's Submit runs create */ } },
CANCELLING: { exits: { Confirmed: S.CANCELLED, Declined: S.WIZARD.history } },
SUBMITTING: {
  // Cancel is Unhandled here. Every outcome is handled unguarded (rule 8).
  on: {
    Created: S.DONE,
    Retrying: { target: "self", updateMemory: ({ event }) => ({ busyRetries: event.n }) },
    Busy: { target: S.WIZARD.REVIEW, updateMemory: () => ({ error: "Try again later" }) },
    EmailTaken: { target: S.WIZARD.ACCOUNT, updateMemory: () => ({ error: "That email is registered" }) },
    Unsure: S.UNSURE,
  },
},
```

The view sends `E.CANCELLING.Yes()`. Nothing outside the subroutine can take `Confirmed`. Every
retry resends the input `create` was admitted with, so a field edited during the backoff never
reaches the server.

### 3.3 A list of Field instances

The invite page holds up to five email fields. An empty entry is valid and is dropped on Next.

```ts
// signup.definition.ts (excerpt)
traits: {
  invites: Field(Schema.String, {
    validate: (v) => (v === "" || v.includes("@") ? null : "Enter an email address"),
  }).list({ max: 5 }),
},

// signup.machine.ts (excerpt)
traits: { invites: { input: () => ({ start: "" }) } }, // read for each added instance
INVITE: {
  on: {
    Next: {
      target: S.WIZARD.REVIEW,
      guard: ({ memory }) => memory.invites.every((f) => f.error === null) || deny("InvitesInvalid"),
      raise: [
        E.invites.Remove.from(({ memory }) => ({
          keys: memory.invites.filter((f) => f.value === "").map((f) => f.key),
        })),
      ],
    },
    Back: S.WIZARD.PROFILE,
  },
},
```

```tsx
// InvitePage.tsx (excerpt)
{invites.map((f) => (
  <div key={f.key}>
    <input value={f.value} onChange={(e) => signup.send(E.invites.key(f.key).Changed({ value: e.target.value }))} />
    <button onClick={() => signup.send(E.invites.Remove({ keys: [f.key] }))}>Remove</button>
  </div>
))}
<button disabled={!canAdd} onClick={() => signup.send(E.invites.Add())}>Add</button>
```

A keystroke sent for a row removed a moment earlier is `Unhandled`. It never lands on a neighbour.

### 3.4 Resetting with `resetOn`

On the issue list, the page goes back to 1 when the search, sort or status changes. The selection
clears whenever any of them changes, the page included. Neither needs a raise in every handler.

```ts
// issuelist.machine.ts (excerpt)
const listQuery = ({ memory }: { memory: Memory }) => ({
  search: memory.appliedSearch,
  sort: memory.sort,
  status: memory.status,
  page: memory.pager.page,
});

traits: {
  pager: {
    resetOn: ({ memory }) => [memory.appliedSearch, memory.sort, memory.status],
    guards: {
      hasNext: ({ memory, activities }) =>
        memory.pager.page * 20 < (activities.issues?.data?.total ?? 0) || deny("LastPage"),
    },
  },
  selection: { resetOn: listQuery }, // also sees a page reset, in the same turn (rule 1)
},
on: {
  SortChanged: { target: "self", updateMemory: ({ event }) => ({ sort: event.sort }) },
  // Select all on this page: the ids come from the snapshot, never from the click.
  SelectPage: {
    target: "self",
    raise: [E.selection.SelectAll.from(({ activities }) => ({
      ids: activities.issues?.data?.items.map((i) => i.id) ?? [],
    }))],
  },
},
```

### 3.5 Keywords

| Kind | Words |
| --- | --- |
| **New, fragments (17)** | `trait`, `subroutine`, `traits`, `.at`, `.list`, `.key(k)`, `Add` / `Remove` (list events), `hostEvents`, `guards` (declaration and filling), `callbacks`, `optional`, `notify`, `exits`, `raise`, `resetOn`, `story.machine(fragment)` with `.enter` / `.leave` / `run.calls` / `checkpoint.exit` |
| **New, plans (12)** | `abandoned` (payload `outcome`, `tag`, `value`, `input`, `attempt`), `notSent`, `uncertain`, `.pending`, `retry` (`on`, `schedule`), `retrying`, the mapper's `{ input, attempt }`, `.history`, `armOn`, `s.schedules`, `dueAt` |
| **Existing** | `definition`, `machine`, `states`, `default`, `events`, `internalEvents`, `input`, `memory`, `initial`, `on`, `target`, `guard`, `updateMemory`, `actions`, `schedules`, `restartOn`, `outcomes`, `optimistic`, `deny`, `check`, `S`, `E`, `O`, `.from`, `payload` |
| **Author-chosen** | every other name (`Field`, `Countdown`, `code`, `LOCKED_OUT`, `canEdit`, `onDone`, `Confirmed`, …) |

Compared with proposal-v2, these are gone: `requests`, `kind`, `operation`, `results`, `start`, and
the fragment-side `abandoned`. `abandoned` and `notSent` move to Operations, for every machine.

## 4. Against the problems in principles.md

| Problem | Answer |
| --- | --- |
| **L1** stale timers, **T2** schedule traps | Prevented. Schedules stop with their node. Arming ids drop firings from before a re-arm (P11). `armOn` replaces counter idioms, and the `restartOn` baseline is the activating turn's memory (P8). |
| **L2** late results | Prevented. Host commits are fenced to the activation they start in (P2), and `flow check` rejects outcome handlers outside it. This breaks Operations O2 for existing code (section 5). |
| **L5** abandoned effects | Prevented. A late result goes to `abandoned` with its Attempt, so `unknown` can be reconciled with `O.x.retry(attempt)` (P10). |
| **L7** departure gap | Allowed. The `abandoned` record exists, but refusing a new submit while it is pending is host code. |
| **L3** leftover memory | Prevented by placement: fresh on activation, on entry, or on `resetOn`. Host memory scoped to a step is still reset by hand (section 6). |
| **L4** no way out | Prevented. The host may always leave a subroutine's state (rule 6). |
| **L6** silent admission, **L8** phantom replies | Prevented. A call that was never sent answers `notSent` (P9). An outstanding call is readable with `.pending` (P3). List events address keys, so an event for a removed instance is `Unhandled`. |
| **E1** broken invariants, **E4** refusal by forwarding | Prevented. Refusal happens only at declared guards, and server and timer deliveries cannot be refused (rule 8). |
| **E2** interfaces growing with depth | Prevented. Each level fills its own children (rule 10). |
| **E3** hidden endings, **E5** preempting observers | Prevented. Only exits leave a subroutine. Callbacks never leave their node. `abandoned` never moves the actor. |
| **H1** bypassed policy | Allowed, by design. Public fragment events are part of the contract; host policy enters through guards; host-owned facts are `hostEvents`. |
| **H2** unforeseen checks | Allowed, by choice: declare the guard in the fragment. |
| **H3** faked results | Prevented. Exits are never sendable. `internalEvents` come only from the fragment's own schedules, and `hostEvents` only from the host. |
| **H4** mislabelled results | Prevented. `unknown`, `interrupt` and `defect` reach only `uncertain` events (P9). |
| **H5** interrupt treated as not sent | Prevented for commit retries: `retry` never retries them (P4). For host code that resends from an `uncertain` handler, it is a convention. |
| **D1** drifting copies | Prevented. Fragment memory and schedule deadlines are readable (P6), so nothing is copied. |
| **D2** live values on retry | Prevented for commit retries, which resend the admitted input (P4). A host-written resend reads whatever its select reads. |
| **D3** feedback loops | Not applicable: fragments do no I/O. |
| **D4** unmapped outcomes | Allowed. An unmapped outcome publishes an issue, as in the plans; `uncertain` only types the right target. v2's fragment requests prevented this. |
| **D5** restore in flight | Prevented. Fenced commits restore with their activation, or go to `abandoned` with their Attempt (P12). Reconciling is host code. |
| **D6** same-turn seeding | Prevented. `input` fillers read the activating turn's updates and event. |
| **D7** drafts lost | By convention. Placing drafts in root traits keeps them; host keys are reset by hand. |
| **A1, A2** forwarding, scattered blocks | One filling block per instance. A view sends at the instance path, so nothing is forwarded. |
| **A3** conditional rules, **A4** overloaded words | Avoided. Each kind has its own rules, and every new word is listed. |
| **A5** I/O inside fragments | Prevented (rule 3). |
| **A6** silence discovered late | By the fragment author's choice. Required ports are type errors; optional guards default to allow, and `flow check` lists them as info. |
| **A7** forgotten first send | Not applicable: the host starts every operation on its own transition. |
| **T1** partial turns | Prevented (rule 7). |

## 5. Plan amendments

Each row names the plan outcome, the rule, and the sentence it replaces or adds. Draft syntax is in
section 3.

### For fragments

| Plan | Rule | Replaces or adds |
| --- | --- | --- |
| **Machines O1** | Definitions gain `traits` (bare, `.at`, `.list`) and fragment states. `trait` and `subroutine` build contracts with `input`, `events`, `hostEvents`, `internalEvents`, `guards`, `callbacks`, `exits`. Machines gain one filling block per instance. Instance names share the namespace of states and memory keys; a collision rejects | Adds to "A definition requires id, states and events." Keeps "The machine cannot add states, events or operations." |
| **Machines O1** | An internal event may be marked `uncertain(fields)` | Adds to "events and optional internalEvents are records…" |
| **Machines O2** | A subroutine state is entered at its default and left by an exit or by any host transition at or above it (abandoning it). Exits are targets only fragments take | Adds to "target is required and is this machine's token or "self"" |
| **Machines O3** | Notifies, exits, raises and `resetOn` re-activations fuse into the transition: pre-turn guards, whole-turn refusal, disjoint keys, one state change, an acyclic graph, one publication. Rule 8 totality | Adds to "An accepted transition computes updateMemory before action parameters…" |
| **Machines O4** | Guards also receive `schedules` and may call `.pending`. Guards test position with tokens (`S.X.is(state)`), never path strings; this applies to every guard. `check()` evaluates through raises | Replaces "A guard receives { event, state, memory, context, activities }" with the same list plus `schedules` |
| **Machines O8** | The snapshot exposes fragment slices under instance names (`undefined` while inactive), keyed list instances, and `schedules` | Replaces "It has no input, methods, timers or public revision" with "…no input, methods or public revision; armed schedules appear under `schedules`" |
| **Testing O1** | `story.machine` also accepts a fragment: a recording harness with `.enter`, `.leave`, `run.calls`, `checkpoint.exit`, and `hostEvents` sends | Adds to "story.machine(machine, { … }) tests one fresh actor" |
| **Inspection O1** | Fragments, list instances and fused transitions appear under their instance names | Adds |
| **CommandLine O5** | `flow check` errors: rule 8 totality, outcome handlers outside the fenced state, `resetOn` cycles. Info: unfilled optional guards | Adds to the error and warning lists |

### For every machine

| # | Plan | Rule | Replaces or adds |
| --- | --- | --- | --- |
| P1 | Operations O2 | Every outcome mapper also receives `{ input, attempt }` | Replaces "Mappers receive values only." |
| P2 | Operations O2, Machines O6 | A host commit is **fenced** to the activation of the state its starting transition enters. For a `"self"` transition, that is the state where the handler is written, so a root `"self"` commit lives as long as the actor. Its outcome events must be handled inside that state (`flow check` error otherwise). A late result goes to `abandoned`, or is dropped with evidence | Replaces "State exit does not cancel finite work; its event reaches the actor's later state." **Breaking:** the reference editor's root `Saved` handler, which catches a save that settles after Close, fails the check. Its update moves to the save's `abandoned` (`payload.value`), and the toast is lost after Close |
| P3 | Operations O3, Machines O4 | `O.x.pending(snapshotOrGuardInput, key)` reads whether a call is outstanding, from the pre-turn snapshot | Adds |
| P4 | Operations O3 | A commit call may declare `retry: { on: [tags], schedule }`. It retries only the named failure tags, resending the admitted input; it never retries `unknown`, `interrupt`, `defect` or `notSent`. Each scheduled retry reports `retrying` (`{ retry: n }`) before the wait; when retries run out, the last failure is the ordinary `failure`. Leaving the fenced state cancels a retry not yet invoked, and `abandoned` receives `notSent` | Replaces "Flow promises no remote rollback and never retries automatically" with "…never retries automatically unless the commit declares `retry`." This **reverses** that sentence |
| P5 | Machines O2, Persistence O2 | `S.X.history` targets X's last active child, or its default on first entry. The last child persists with the actor | Adds to O2 targets, and to "Actor state, memory … survive reload" |
| P6 | Machines O5, O8 | Armed schedules expose `dueAt`; a trait's sit at `s.schedules.<instance>.<name>` | See Machines O8 above |
| P7 | Machines O5 | `armOn: [events]` arms a schedule when a transition on one of them is accepted, and re-arming restarts it. A schedule with `armOn` is idle on entry | Replaces "Entry arms a schedule; exit cancels it" with "Entry arms a schedule without `armOn`; exit cancels any" |
| P8 | Machines O5 | The `restartOn` baseline is the activating turn's committed memory | Clarifies "restartOn … establishes a silent baseline and leaves the schedule idle on entry" |
| P9 | Operations O3, Machines O6, Persistence O6 | `unknown`, `interrupt` and `defect` may only target `uncertain` events. A call never invoked (`reject`, a cancel before invocation, a failed acknowledgment, a never-invoked restore) answers `notSent` | Replaces "declines a second unsettled commit without work or outcome", "ends it silently … ends it as interrupt", "Restored work with no acknowledged Attempt … ends interrupt". Adds `notSent` to "Finite actions declare optional success, failure, defect, interrupt and unknown outcomes" |
| P10 | Operations O3, Machines O3 | `abandoned` receives `{ outcome, tag?, value?, input, attempt }`. `outcome` is `"pending"` or a terminal outcome; `tag` names a failure; `value` is present on success. It runs with `"pending"` fused into the leaving turn, where a key also written by the leaving transition is a pre-commit defect. It runs again on settlement as its own turn. It writes host memory only and never moves the actor | Adds a turn source |
| P11 | Machines O5 | Each arming has an id; a firing from an earlier arming is never delivered | Extends "if its declaring activation ended before handling, it is discarded" |
| P12 | Persistence O6 | A fenced commit restores with its activation, in the shape of P10. An acknowledged in-flight commit is `unknown` with its Attempt; a never-invoked one is `notSent`. If its activation was not restored, the result goes to `abandoned` | Extends "A crash after acknowledgment restores unknown carrying the same Attempt…" |

### The five ambiguous sentences, decided

1. **Which state P2 fences to:** the state the starting transition enters, or, for `"self"`, the
   state where the handler is written (P2 above).
2. **Guards read `schedules` and call `.pending`:** yes, from the pre-turn snapshot. Guards still
   receive no `now`: they may test whether a schedule is armed, not how long is left.
3. **Does `armOn` also arm on entry:** no. A schedule is armed either by entry (no `armOn`) or by its
   events. Never both.
4. **Where trait timers sit:** `s.schedules.<instance>.<schedule>`, `undefined` while the trait is
   inactive. A list instance's sit under its key: `s.schedules.<instance>.key(k).<schedule>`.
5. **When `retrying` fires:** when a retry is scheduled, before the wait, with `retry` counting from
   1. A view can show "retrying (n/3)" during the backoff.

## 6. Deliberately left out

- **Fragment I/O** (`requests`, `CommitWithRetry`). With P1–P4, P9 and P10, retry policy, fencing
  and uncertainty belong to the commit, for every machine. In the comparison, v2's own amended build
  deleted its I/O fragment. The cost:
  - an unmapped outcome only publishes an issue (D4);
  - a host handler can still resend from an `uncertain` event (H5 for host code).

  If a second policy appears that the commit options cannot express, v2's request semantics are
  the ready design.
- **Nested request relays.** These follow from the above: no fragment has requests to relay.
- **Parallel-region traits** (real states for an always-there hold-to-confirm). Today such a piece
  is either a subroutine placed as a host state, or a trait whose modes are memory. Regions change
  Machines O2 and need their own proposal.
- **Node memory** (host memory scoped to a compound). Fragment state can already be scoped with
  `.at`. The cost that remains is resetting a few host keys by hand (`lockedChallenge`,
  `wrongAttempts`). It is wanted, but it is a Machines change of its own.

## 7. Open

1. **Reverting an `unknown` optimistic value at once.** Operations O5 keeps it until a confirming
   read. The pin example accepts "reverts when the refetch lands". An explicit option is wanted only
   if a second case needs it.
2. **Author-chosen list keys** (`.list({ key: (input) => … })`), for lists seeded from server data.
3. **`abandoned` and the actor's position.** A late strike is acted on at the next entry or Submit.
   Is a `raise` from `abandoned` worth its rule-8 cost?
4. **Names.** `trait`, `subroutine`, `hostEvents`, `resetOn`, `optional`, `.key`.

## Changes after review

From [reviews/v3-correctness.md](reviews/v3-correctness.md) and
[reviews/v3-principles.md](reviews/v3-principles.md):

- **P2:** stays the default. A `flow check` error now covers outcome handlers outside the fenced
  state. The O2 break is stated, including how the editor's after-Close save moves to `abandoned`.
  `"self"` is defined once.
- **P10 and P12:** the `abandoned` payload gains `attempt` and `value`. Restore uses the same shape,
  and the leaving-turn key overlap is a defect.
- **Lists:** instances are now keyed (`E.invites.key(k)`). Payloads carry the key. A removed
  instance's timers stop, and late events for it are `Unhandled`. `Add` and `Remove` are public,
  and `Remove` never refuses.
- **`resetOn`:** it runs inside the turn, after raises, repeating until nothing changes, in one
  publication. This is stated once, in rule 1.
- **Rule 8:** it now covers outcome, exit and timer handlers themselves, transitively (old open
  question 2).
- **Sign-in:** it locks on entry (and on Submit) when a late wrong code reaches the limit. The
  lockout is scoped to its challenge (`lockedChallenge`).
- **Defaults:** `"allow"` / `"required"` are merged into `optional(…)`. The guard default is stated,
  `flow check` lists unfilled optional guards, and A6 is marked "by the author's choice".
- **Retry:** `retry` moves to the commit call. It reverses "never retries automatically", and its
  behaviour after abandonment and restore is stated. The commit is shown in 3.2.
- **P13:** `revertOnUnknown` is cut to open question 1.
- **Verdicts:** corrected for D4, H5, D2, L5, L7, D5, D7 and A6. The I/O-cut regressions are listed
  in section 6.
- **Section 5:** adds the fragment layer's own rows (Machines O1/O2/O3/O4/O8, Testing, Inspection,
  CommandLine). Every row names its plan and the sentence it replaces or adds.
- **Clarity:**
  - `Countdown` lost its `running` flag (the armed schedule is the flag);
  - slices placed with `.at` are typed as present below their node;
  - token guards are a rule for every guard;
  - the keyword ledger is complete.
