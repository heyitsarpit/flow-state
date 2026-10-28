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
| Many of them | `Field(…).list({ max?, key? })`: keyed instances (rule 9) | no |
| Instance name | the `traits` key (`code`) | the state's name (`CANCELLING`) |
| States of its own | none | optional, under its state (`HOLDING.WAITING`). Without `states` it is a leaf (`Confirm`) |
| Lives | while its node is active (the root: the actor's life); fresh on every activation | while its state is active; fresh on every entry |
| Re-activated | when its `resetOn` value changes | on every entry |
| Ends | when its node is left | by taking an exit, or abandoned by a transition that exits its state |
| Contains | traits | traits and subroutines |

One question picks the kind: **does the actor have it, or go into it?** A countdown that runs beside
other states is a trait. A dialog that blocks what is under it is a subroutine.

**Reading.** Memory and schedules sit under the instance name:

- a trait: `s.memory.code` (absent without memory) and `s.schedules.code.<name>`;
- a subroutine: `s.memory.CANCELLING` and `s.schedules.HOLDING.<name>`;
- the host's own schedules: `s.schedules.<name>`.

These names, state names and memory keys share one namespace, and a collision rejects. A slice is
`undefined` while its fragment is inactive.

### 2.2 The contract

```ts
trait({
  id: "Pager",
  input: { start: Schema.Int },              // filled by the host, read once at activation
  events: { Next: {}, Previous: {} },        // sent by anyone, at the instance path
  hostEvents: { Jump: { page: Schema.Int } },// sent only by the direct host, with `raise`
  internalEvents: { Due: {} },               // produced only by this fragment's own schedules
  memory: { page: Schema.Int },
  initial: ({ input }) => ({ page: input.start }),
  guards: { hasNext: {}, canTurn: optional() },                   // {} required; optional() allows
  callbacks: { onTurned: { page: Schema.Int }, onIdle: optional({}) }, // a payload record is required
  traits: { settle: Debounce({ wait: "300 millis" }) },          // children it places and fills
  // subroutines also: states?, default?, exits: { Confirmed: {}, Declined: {} }
}, ({ S, E, guards, callbacks, exits }) => ({
  on: {
    Next: { target: "self", guard: [guards.canTurn, guards.hasNext], updateMemory: … },
    Previous: { target: "self", guard: ({ memory }) => memory.page > 1 || deny("FirstPage"), … },
  },
  traits: { settle: { callbacks: { onSettled: { target: "self", notify: [callbacks.onIdle] } } } },
}))
```

A fragment's transitions may also carry ordinary guards over its own memory (`Previous` above). A
guard slot, in a contract or a transition, may hold an array; all must pass.

| Port | The fragment uses it as | The host fills it with |
| --- | --- | --- |
| `input` | `initial({ input })` | `input: ({ memory, event }) => …`, evaluated after the activating turn's updates |
| `events` | handled in `on` | nothing; views and other senders send `E.pager.Next()` |
| `hostEvents` | handled in `on` | `raise: [E.pager.Jump.from(f)]` on any host transition |
| `internalEvents` | sent by its own `schedules` | nothing |
| `guards` | `guard: guards.hasNext` | `guards: { hasNext: (g) => … \|\| deny("LastPage") }` |
| `callbacks` | `notify: [callbacks.onTurned.from(f)]` on a transition | an `on`-style handler (`target?`, `updateMemory?`, `actions?`, `raise?`), possibly ordered alternatives ending in an unguarded one; its data is `payload` |
| `exits` | `target: exits.Done`, or `exits.Done.from(f)` | an `on`-style handler that must leave the subroutine's state |

The host fills each instance in **one block**, in the machine:

- traits under `traits.<name>`, wherever they are placed;
- subroutines on their state, `states.<NAME>`.

A port is **required** unless wrapped in `optional(…)`, and leaving a required port unfilled is a
type error. Guards carry no payload, so a guard is declared `{}` (required) or `optional()`. A
callback or exit is declared by its payload record (`{}` means no payload), or as `optional(record)`
for a callback. An optional port may be left out:

- an optional guard **allows**;
- an optional callback **ignores**.

Because an allowing default grants permission silently, `flow check` lists every unfilled optional
guard as an info finding. The fragment author chooses which guards may default, and should leave
any guard that protects data required.

A bare token is shorthand for `{ target: token }`, in a filling (`Confirmed: S.CANCELLED`) and in a
fragment (`Yes: exits.Confirmed`).

Fragments may not declare `operations`, `activities`, `context`, `onContext`, `send` or persistence.

### 2.3 Where things go

| What | Where |
| --- | --- |
| Placing a trait, a list of traits, a subroutine | host **definition**: `traits`, `states`; inside a fragment, its contract's `traits` / `states` |
| Filling ports, `resetOn` | host **machine**: `traits.<name>` or `states.<NAME>`; inside a fragment, its body |
| Feeding a fact into a fragment | host **machine**: `raise` on any host transition |
| Running I/O and mapping outcomes | host **machine**: actions and outcomes onto the host's own events |
| A handler or guard shared by several nodes | the definition's `handler(path, h)` / `guard(path?, g)`, e.g. `Signup.guard(g)`: typed as if written at `path` (the root when omitted) |

Placement is structure (it produces `S`, `E` and the view types), so it lives in the definition.
Filling refers to `S`, `E` and `O`, so it lives in the machine.

### 2.4 The rules

1. **Lifetime comes from placement.**
   - A trait is fresh each time its node activates. A subroutine is fresh on every entry. Leaving
     the node or state cancels its schedules and drops its memory.
   - **Typing.** A trait slice placed at X is typed as present in every handler, guard and select
     written at or below X. Code written elsewhere is typed where it is used:
     - a commit (`O.x.commit(select, …)`) is checked at each transition whose `actions` list it,
       so `verify` in 3.1 may read `memory.code`;
     - a shared handler or guard is wrapped in the definition's `handler(path, h)` /
       `guard(path?, g)`;
     - any other helper sees the root view, where `.at` slices are optional.
   - **`resetOn`** re-activates a trait inside the turn.
     - It returns a **reset value**, compared with `Equal.equals` as `restartOn` is, against a
       baseline taken from the activating turn's committed memory.
     - It runs after the turn's updates and raises, before the turn validates and publishes
       (Machines O3), and repeats until no value changes, so one reset can trigger another.
     - Each trait resets at most once per turn. A raise into it applies first, so the reset wins.
     - On a list, a reset removes every instance.
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
5. **Every port is filled, or optional** (section 2.2).
6. **Callbacks ask; exits leave.**
   - A callback never moves the host out of the fragment's placement node. So a root trait's
     callback may target anything, and a subroutine's callback targets nothing.
   - An exit filling must leave the subroutine's state, and every exit is filled.
   - Inside a subroutine's state, host events fall through to the host's ancestors and root as
     usual (Machines O2). Only a transition that **exits** the subroutine's state abandons it; an
     ancestor's `"self"` does not. So the host can always leave, and its root handlers keep
     working.
   - **A late result never preempts live work.** Consider a turn sourced from `abandoned`
     (directly, or through its raises and the callbacks they notify). In that turn, any alternative
     whose target would exit a state that holds an outstanding fenced commit or an active
     subroutine counts as denied. The last alternative of each such handler must not move the
     actor. A late result may move an idle user (the late-strike lock in 3.1), never a busy one.
7. **One turn.** A transition, the callbacks it notifies, the exits it takes, the events it raises
   and the resets it causes compile into one transition.
   - Every guard reads the pre-turn snapshot.
   - Payload mappers (`raise`, `notify` and `exits` `.from`) also read the pre-turn snapshot and
     the event, like action parameters.
   - Raises apply in the order written.
   - A raised event accepted in the turn counts as accepted. In particular, it arms the `armOn`
     schedules that list it (P7).
   - If any part refuses, the whole turn refuses, and `check()` agrees, evaluating raise payloads
     to supply child guards.
   - Parts write disjoint memory keys, and at most one part changes state.
   - The raise/notify graph is acyclic.
8. **Deliveries are never lost.** This applies to every event a server or a clock produces:
   - every outcome event of a fenced commit (section 5, P2);
   - every `abandoned` handler;
   - every exit filling;
   - every timer-fired handler.

   Each must be handled, ending in an unguarded alternative, in every state where it can arrive.
   The same holds, transitively, for everything those handlers raise or notify: each raise must
   target an event the child handles unguarded at its root or in every leaf. `flow check` follows
   the fused chain and rejects any other. A user's event may be refused; a server's answer may not.
9. **Lists are keyed.** `T.list({ max?, key? })` places keyed instances.
   - **Keys.** Without `key`, the runtime mints one on each `Add`. In Stories, minted keys are
     deterministic: `invites#1`, `invites#2`, and so on. With `key: Schema.String`, the author
     chooses the key: `Add { key }`, and adding an existing key is a no-op.
   - **Owner.** With `owner: "host"`, `Add` and `Remove` are `hostEvents`: only the host changes
     which instances exist (the sign-in's `lockouts`). Otherwise they are public events.
   - **Events.** `Add` is refused at `max`, or by the optional `canAdd` guard. `Remove { keys }` is
     refused only by the optional `canRemove`, never when the host raises it, and ignores keys that
     are absent. An instance
     event carries its key: views send `E.invites.key(k).Changed(…)`, and the host raises
     `E.lockouts.Start.from(() => ({ key }))`.
   - **Filling.** One block serves every instance. It fills `input` (read per added instance), the
     instance ports, and `guards: { canAdd, canRemove }`. Callback payloads carry `key`.
   - **Reading.** `s.memory.invites` is the instances in order, each `{ key, …slice }`. Schedules
     are read at `s.schedules.lockouts.key(k)?.<name>`.
   - **Removal.** A removed instance's schedules are cancelled and its memory dropped, after the
     turn's other parts. An event addressed to an absent key is `Unhandled` (in `check()` too). A
     raised `Add` reachable from a delivery needs a list with no `max` and no `canAdd`.
10. **Nesting hides the level below.** A fragment places children in its contract and fills them
    in its body (section 2.2). It raises only into its direct children. The host sees only the
    outer contract. Nested names stay readable: `s.memory.flash.timer`.
11. **Tested alone.** `story.machine(fragment, { id })` fills every port with a recording harness
    and may send `hostEvents`. `run.calls.<callback>` records notifications; `checkpoint.exit`
    records exits. `.enter(input)` enters a subroutine; `.leave()` abandons it, as a host
    transition would. Section 3.1 tests a trait alone, and 3.2 a subroutine.
12. **Construction errors and runtime defects.**
    - **Construction errors** (types or `flow check`): unfilled required ports; rules 6 and 8;
      outcome handlers outside the fenced state; a raise into a child that is not active; two state
      changers or overlapping keys in one turn.
    - **Guards on state tokens are structural.** `flow check` reads guards on `S.X.is(state)`
      tokens, and prunes the alternatives they exclude. So two alternatives that are mutually
      exclusive by state are not flagged (`CodeWrong` and `onStart` in 3.1).
    - **Runtime defects.** An overlap hidden behind any other guard is a runtime pre-commit defect
      (Machines O3), and `flow check` warns about it. So are a reset value that changes twice, and
      a key overlap in `abandoned`'s pending run.

## 3. Example

### 3.1 Two-factor sign-in, in full

The apps are those of [comparison/apps.md](comparison/apps.md). The flow is `PASSWORD → TWO_FACTOR →
SIGNED_IN`. In the two-factor step:

- a 6-digit code;
- three wrong codes lock **that challenge** for 5 minutes;
- resend is refused for 30 seconds after each resend;
- Back to password keeps the wrong attempts and the lockout for the same challenge;
- a wrong code that settles after Back still counts, and a late third one locks at once;
- only one guess is in flight per challenge, even across Back and return;
- a late wrong code for a challenge the user has since left is ignored: attempts live in one host
  slot, for the current challenge (section 6, node memory).

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
// It has no memory: "running" is the armed schedule, s.schedules.<name>.done !== undefined.
export const Countdown = (p: { length: Duration.Input }) =>
  trait(
    {
      id: "Countdown",
      hostEvents: { Start: {} },
      internalEvents: { Done: {} },
      callbacks: { onStart: optional({}), onDone: optional({}) },
    },
    ({ E, callbacks }) => ({
      schedules: { done: { schedule: p.length, send: E.Done, armOn: [E.Start] } },
      on: {
        Start: { target: "self", notify: [callbacks.onStart] },
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
    // At the root, one per challenge: a lockout survives Back and belongs to its challenge.
    // Host-owned: only the host adds or removes a lockout (rule 9).
    lockouts: Countdown({ length: "5 minutes" }).list({ key: Schema.String, owner: "host" }),
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
    wrongAttempts: Schema.Int, // for the current challenge
    error: Schema.NullOr(Schema.String),
  },
  initial: () => ({ challengeId: "", wrongAttempts: 0, error: null }),
  operations: { Auth }, // a group of operation handles (section 5, Machines O1)
});
```

```ts
// signin.machine.ts
import { deny, machine } from "flow-state";
import { SignIn } from "./signin.definition";

const MAX_WRONG = 3;

const wrongHere = (p: { tag?: string; input: { challengeId: string } }, m: { challengeId: string }) =>
  p.tag === "WrongCode" && p.input.challengeId === m.challengeId;

export const SignInMachine = machine(SignIn, ({ S, E, O }) => {
  // Lock the current challenge: add its lockout (a no-op if present) and start it, in that order.
  const lock = [
    E.lockouts.Add.from(({ memory }) => ({ key: memory.challengeId })),
    E.lockouts.Start.from(({ memory }) => ({ key: memory.challengeId })),
  ];
  const forget = E.lockouts.Remove.from(({ payload }) => ({ keys: [payload.key] }));

  // Fenced to the VERIFYING activation it starts in (P2): its outcomes are handled only there. A
  // result after Back goes to `abandoned` (P10), which counts a late wrong code and, on the third,
  // raises the lock into the root list. `lockouts.onStart` then moves the user if they are back.
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
      abandoned: [
        {
          guard: ({ payload, memory }) =>
            (wrongHere(payload, memory) && memory.wrongAttempts + 1 >= MAX_WRONG) || deny("NotLast"),
          updateMemory: () => ({ wrongAttempts: MAX_WRONG }),
          raise: lock,
        },
        {
          guard: ({ payload, memory }) => wrongHere(payload, memory) || deny("NotWrong"),
          updateMemory: ({ memory }) => ({ wrongAttempts: memory.wrongAttempts + 1 }),
        },
        {}, // "pending", a late code for another challenge, or anything else: nothing to do
      ],
      // It runs twice per abandoned call ("pending" when leaving, then the result), so each run
      // must be safe on its own: only the settled WrongCode writes.
    },
  );


  const toEntering = (error: string) => ({ target: S.TWO_FACTOR.ENTERING, updateMemory: () => ({ error }) });

  return {
    default: S.PASSWORD,

    traits: {
      code: {
        input: () => ({ start: "" }),
        guards: { canEdit: ({ state }) => !S.TWO_FACTOR.LOCKED_OUT.is(state) || deny("LockedOut") },
      },
      resendCooldown: {},
      lockouts: {
        // Root-trait callbacks may move the host anywhere.
        callbacks: {
          onStart: [
            // A late third strike while the user is entering this challenge's code.
            {
              target: S.TWO_FACTOR.LOCKED_OUT,
              guard: ({ state, payload, memory }) =>
                (S.TWO_FACTOR.ENTERING.is(state) && payload.key === memory.challengeId) || deny("NotHere"),
              updateMemory: () => ({ error: null }),
              raise: [E.code.Reset],
            },
            { target: "self" },
          ],
          onDone: [
            {
              target: S.TWO_FACTOR.ENTERING,
              guard: ({ state, payload, memory }) =>
                (S.TWO_FACTOR.LOCKED_OUT.is(state) && payload.key === memory.challengeId) || deny("NotHere"),
              updateMemory: () => ({ wrongAttempts: 0, error: null }),
              raise: [forget],
            },
            {
              target: "self",
              updateMemory: ({ payload, memory }) => (payload.key === memory.challengeId ? { wrongAttempts: 0 } : {}),
              raise: [forget],
            },
          ],
        },
      },
    },

    states: {
      PASSWORD: {
        on: {
          PasswordAccepted: [
            // This challenge is still locked: straight back to its countdown.
            {
              target: S.TWO_FACTOR.LOCKED_OUT,
              guard: ({ event, schedules }) =>
                schedules.lockouts.key(event.challengeId)?.done !== undefined || deny("NotLocked"),
              updateMemory: ({ event }) => ({ challengeId: event.challengeId, wrongAttempts: MAX_WRONG, error: null }),
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
        on: {
          BackToPassword: S.PASSWORD,
          // On TWO_FACTOR, so the resend is fenced there: a lock that moves ENTERING to LOCKED_OUT
          // does not exit the resend's state (rule 6). Refused while a code is being checked.
          Resend: {
            target: "self",
            guard: [
              ({ state }) => !S.TWO_FACTOR.VERIFYING.is(state) || deny("Checking"),
              ({ schedules }) => schedules.resendCooldown.done === undefined || deny("CoolingDown"),
            ],
            actions: [O.Auth.resendCode.commit(({ memory }) => ({ challengeId: memory.challengeId }))],
            raise: [E.resendCooldown.Start],
          },
        },
        states: {
          ENTERING: {
            on: {
              Submit: {
                target: S.TWO_FACTOR.VERIFYING,
                guard: [
                  ({ memory }) => memory.code.error === null || deny("InvalidCode"),
                  ({ memory }) => memory.wrongAttempts < MAX_WRONG || deny("NoTriesLeft"),
                  // One guess in flight per challenge (verifyCode is keyed by challengeId).
                  (g) => !O.Auth.verifyCode.pending(g, { challengeId: g.memory.challengeId }) || deny("StillChecking"),
                ],
                updateMemory: () => ({ error: null }),
                actions: [verify],
              },
            },
          },
          VERIFYING: {
            on: {
              CodeAccepted: S.SIGNED_IN,
              CodeWrong: [
                {
                  target: S.TWO_FACTOR.LOCKED_OUT,
                  guard: ({ memory }) => memory.wrongAttempts + 1 >= MAX_WRONG || deny("TriesLeft"),
                  updateMemory: () => ({ wrongAttempts: MAX_WRONG, error: null }),
                  raise: [E.code.Reset, ...lock], // unguarded: safe from an outcome (rule 8)
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
          LOCKED_OUT: {}, // Submit is Unhandled; typing is refused by canEdit; Resend falls through
        },
      },

      SIGNED_IN: {},
    },
  };
});
```

In the third-strike turn, `CodeWrong` targets LOCKED_OUT itself. The raised `Start` notifies
`onStart`, whose first alternative is excluded by its state-token guard (the pre-turn state is
VERIFYING), so only one part changes state, and `flow check` sees that structurally (rule 12). In
the late-strike turn, `abandoned` raises the lock and `onStart` moves the user from an idle ENTERING.
ENTERING holds no outstanding fenced commit, because the resend is fenced to TWO_FACTOR, so rule 6
allows the move.

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
    S.TWO_FACTOR.LOCKED_OUT.is(s) ? s.schedules.lockouts.key(s.memory.challengeId)?.done?.dueAt : undefined,
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
// countdown.test.ts: a fragment alone (rule 11)
const Cooldown = Countdown({ length: "30 seconds" });
const runsOnce = story
  .machine(Cooldown, { id: "Countdown/runs-once" })
  .send(Cooldown.E.Start()) // the harness may send hostEvents; send runs its turn
  .checkpoint("running")
  .advance("30 seconds")
  .process() // drains the due timer
  .checkpoint("end");
// run.checkpoints.running.snapshot.schedules.done.dueAt === running.now + 30_000
// run.calls.onStart.length === 1; run.calls.onDone.length === 1
// run.checkpoints.end.snapshot.schedules.done === undefined
```

### 3.2 A subroutine with exits, history and a commit retry

The signup wizard's discard dialog is `Confirm`, a subroutine without states. Keep returns to
whichever page Cancel came from. Submitting retries `Busy` three times at 1 s, 2 s and 4 s, and
never retries an uncertain outcome.

```ts
// imports: subroutine, uncertain from "flow-state"; Schedule, Schema from "effect"
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
    retrying: E.Retrying.from(({ retry }) => ({ n: retry })), // value { retry, error }
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

```tsx
// SignupWizard.tsx (excerpt): the dialog over the page Cancel came from
const page = useView(signup, (s) => S.WIZARD.child(s) ?? S.WIZARD.history.child(s));
const asking = useView(signup, (s) => S.CANCELLING.is(s));
// render <Page name={page} inert={asking} /> and, while asking, the dialog sending E.CANCELLING.Yes()
```

```ts
// confirm.test.ts: a subroutine alone (rule 11)
const yes = story.machine(Confirm, { id: "Confirm/yes" }).enter({}).send(Confirm.E.Yes()).checkpoint("end");
// run.checkpoints.end.exit → { exit: "Confirmed", payload: {} }; .leave() instead would abandon it
```

Nothing outside the subroutine can take `Confirmed`. Every retry resends the input `create` was
admitted with, so a field edited during the backoff never reaches the server.

### 3.3 A list of Field instances

The invite page holds up to five email fields. An empty entry is valid and is dropped on Next. Rows
can be added and removed only on the Invite page.

```ts
// signup.definition.ts (excerpt)
traits: {
  invites: Field(Schema.String, {
    validate: (v) => (v === "" || v.includes("@") ? null : "Enter an email address"),
  }).list({ max: 5 }),
},

// signup.machine.ts (excerpt)
const onInvitePage = Signup.guard(({ state }) => S.WIZARD.INVITE.is(state) || deny("NotOnInvitePage"));
traits: {
  invites: { input: () => ({ start: "" }), guards: { canAdd: onInvitePage, canRemove: onInvitePage } },
},
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

// signup.story.ts (excerpt): minted keys are deterministic in Stories
.send(E.invites.Add()).send(E.invites.key("invites#1").Changed({ value: "grace@example.com" }))
```

A keystroke sent for a row removed a moment earlier is `Unhandled`. It never lands on a neighbour.

### 3.4 Resetting with `resetOn`, and the pin commit

On the issue list, the page goes back to 1 when the search, sort or status changes. The checked
rows (the `checked` trait, a `Selection`) clear whenever any of them changes, the page included. Neither needs a raise in every handler.

```ts
// issuelist.machine.ts (excerpt)
const listQuery = ({ memory }: { memory: Memory }) => ({
  search: memory.appliedSearch,
  sort: memory.sort,
  status: memory.status,
  page: memory.pager.page,
});

const pin = O.Issues.setPinned.commit(({ event }) => ({ id: event.id, pinned: event.pinned }), {
  optimistic: [O.Issues.list.setData(({ memory, event }) => ({ key: listQuery({ memory }), data: pinRow(event) }))],
  revertOnUnknown: true, // the row reverts at once; the entry is still invalidated and refetched
  outcomes: {
    failure: E.PinFailed.from((_, { input }) => ({ id: input.id })), // (value, { input, attempt })
    notSent: E.PinFailed.from((_, { input }) => ({ id: input.id })),
    unknown: E.PinUnsure.from((_, { input }) => ({ id: input.id })),
    interrupt: E.PinUnsure.from((_, { input }) => ({ id: input.id })),
    defect: E.PinUnsure.from((_, { input }) => ({ id: input.id })),
  },
});

traits: {
  pager: {
    resetOn: ({ memory }) => [memory.appliedSearch, memory.sort, memory.status],
    guards: {
      hasNext: ({ memory, activities }) =>
        memory.pager.page * 20 < (activities.issues?.data?.total ?? 0) || deny("LastPage"),
    },
  },
  checked: { resetOn: listQuery }, // also sees a page reset, in the same turn (rule 1)
},
on: {
  SortChanged: { target: "self", updateMemory: ({ event }) => ({ sort: event.sort }) },
  Pin: { target: "self", guard: (g) => !O.Issues.setPinned.pending(g, { id: g.event.id }) || deny("PinInFlight"), actions: [pin] },
  // Select all on this page: the ids come from the pre-turn snapshot, never from the click.
  SelectPage: {
    target: "self",
    raise: [E.checked.SelectAll.from(({ activities }) => ({
      ids: activities.issues?.data?.items.map((i) => i.id) ?? [],
    }))],
  },
},
```

The pin commit starts on a root `"self"` transition, so it is fenced to the root and lives as long as
the actor. Its outcomes arrive at the root handlers even while the actor is inside the `HOLDING`
subroutine (rule 6).

### 3.5 Nesting

`Flash` reuses `Countdown` instead of keeping its own timer.

```ts
export const Flash = (p: { for: Duration.Input }) =>
  trait(
    {
      id: "Flash",
      hostEvents: { Show: { message: Schema.String } },
      memory: { message: Schema.NullOr(Schema.String) },
      initial: () => ({ message: null }),
      traits: { timer: Countdown({ length: p.for }) },
    },
    ({ E }) => ({
      traits: { timer: { callbacks: { onDone: { target: "self", updateMemory: () => ({ message: null }) } } } },
      on: { Show: { target: "self", updateMemory: ({ event }) => ({ message: event.message }), raise: [E.timer.Start] } },
    }),
  );
// The host sees only Flash's contract. Views read s.memory.flash.message and s.schedules.flash.timer.done.
```

### 3.6 Keywords

| Kind | Words |
| --- | --- |
| **New, fragments (19)** | `trait`, `subroutine`, `traits` (host and fragment), `.at`, `.list` (`max`, `key`, `owner`), `.key(k)`, `Add` / `Remove` / `canAdd` / `canRemove` (list events and guards), `hostEvents`, `guards` (declaration and filling), `callbacks`, `optional`, `notify`, `exits`, `raise`, `resetOn`, the definition's `handler` / `guard`, `story.machine(fragment)` with `.enter` / `.leave` / `run.calls` / `checkpoint.exit` |
| **New, plans (14)** | `abandoned` (payload `outcome`, `tag`, `value`, `input`, `attempt`), `notSent`, `uncertain`, `.pending`, `retry` (`on`, `schedule`), `retrying`, the mapper's `{ input, attempt }`, `revertOnUnknown`, `.history` (and `.history.child`), `armOn`, `s.schedules`, `dueAt` |
| **Existing** | `definition`, `machine`, `states`, `default`, `events`, `internalEvents`, `input`, `memory`, `initial`, `on`, `target`, `guard`, `updateMemory`, `actions`, `schedules`, `restartOn`, `outcomes`, `optimistic`, `setData`, `deny`, `check`, `S`, `E`, `O`, `.from`, `payload` |
| **Author-chosen** | every other name (`Field`, `Countdown`, `code`, `LOCKED_OUT`, `canEdit`, `onDone`, `Confirmed`, …) |

Gone since proposal-v2: `requests`, `kind`, `operation`, `results`, `start`; `abandoned` and `notSent` moved to Operations.

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
| **E3** hidden endings | Prevented. Only exits leave a subroutine. Callbacks never leave their node. |
| **E5** preempting observers | Prevented. `abandoned` never targets. In a turn it sources, an alternative that would exit a state holding an outstanding fenced commit or an active subroutine counts as denied, and each handler's last alternative must not move (rule 6). A late result may move an idle user, never a busy one. |
| **H1** bypassed policy | Allowed, by design. Public fragment events are part of the contract; host policy enters through guards; host-owned facts are `hostEvents`. |
| **H2** unforeseen checks | Allowed, by choice: declare the guard in the fragment. Lists declare `canAdd` / `canRemove`. |
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
sections 2 and 3.

### For fragments

| Plan | Rule | Replaces or adds |
| --- | --- | --- |
| **Machines O1** | Definitions gain `traits` (bare, `.at`, `.list`) and fragment states. `trait` and `subroutine` build contracts with `input`, `events`, `hostEvents`, `internalEvents`, `guards`, `callbacks`, `exits` and child `traits` / `states`. Machines gain one filling block per instance. Instance names, host schedule names, states and memory keys share one namespace; a collision rejects | Adds to "A definition requires id, states and events." Keeps "The machine cannot add states, events or operations." |
| **Machines O1** | An internal event may be marked `uncertain(fields)` | Adds to "events and optional internalEvents are records…" |
| **Machines O1** | `operations` may group operation handles one level deep (`{ Auth }` gives `O.Auth.verifyCode`) | Replaces "a flat record of operation or entity-domain handles" with "a record of operation handles, entity-domain handles, or one-level groups of operation handles" |
| **Machines O1** | A definition's `handler(path, h)` and `guard(path?, g)` type a shared handler or guard as if written at `path`; a commit is typed at each transition that runs it | Adds |
| **Machines O2** | A subroutine state is entered at its default, or is a leaf without `states`. It is left by an exit, or abandoned by any transition that exits its state; host events inside it fall through to ancestors as usual. Exits are targets only fragments take | Adds to "target is required and is this machine's token or "self"" |
| **Machines O2** | `token.is` accepts a snapshot or a state path, so guards write `S.X.is(state)`. Guards test position with tokens, never path strings | Replaces "token.is(snapshot) includes descendants" with "token.is(snapshot or state) includes descendants" |
| **Machines O3** | Notifies, exits, raises and `resetOn` re-activations fuse into the transition: pre-turn guards and payload mappers, ordered raises, whole-turn refusal, disjoint keys, one state change, an acyclic graph, one publication. Rule 8 totality | Adds to "An accepted transition computes updateMemory before action parameters…" |
| **Machines O4** | Guards also receive `schedules` and may call `.pending`. `check()` evaluates through raises | Replaces "A guard receives { event, state, memory, context, activities }" with the same list plus `schedules` |
| **Machines O8** | The snapshot exposes fragment slices under instance names (`undefined` while inactive), keyed list instances, and `schedules` (host, trait, subroutine) | Replaces "It has no input, methods, timers or public revision" with "…no input, methods or public revision; armed schedules appear under `schedules`" |
| **Testing O1** | `story.machine` also accepts a fragment: a recording harness with `.enter`, `.leave`, `run.calls`, `checkpoint.exit`, and `hostEvents` sends. `send` runs its turn before the next command; `process()` drains operation work and due timers. Minted list keys are deterministic (`invites#1`) | Adds to "story.machine(machine, { … }) tests one fresh actor" |
| **Inspection O1** | Fragments, list instances and fused transitions appear under their instance names | Adds |
| **CommandLine O5** | `flow check` errors: unfilled required ports, rules 6 and 8, outcome handlers outside the fenced state, raises into inactive children, two state changers or overlapping keys, `resetOn` cycles, a raised `Add` into a bounded or guarded list from a delivery. It reads `S.X.is(state)` guards structurally and prunes the alternatives they exclude; other overlaps are warnings (rule 12). Info: unfilled optional guards | Adds to the error and warning lists |

### For every machine

| # | Plan | Rule | Replaces or adds |
| --- | --- | --- | --- |
| P1 | Operations O2 | Every outcome mapper has one form, `(value, { input, attempt })`. For `retrying`, the value is `{ retry, error }` | Replaces "Mappers receive values only." |
| P2 | Operations O2, Machines O6 | A host commit is **fenced** to the activation of the state its starting transition enters. For a `"self"` transition, that is the state where the handler is written, so a root `"self"` commit lives as long as the actor. Its outcome events must be handled inside that state (`flow check` error otherwise). A late result goes to `abandoned`, or is dropped with evidence | Replaces "State exit does not cancel finite work; its event reaches the actor's later state." **Breaking:** the reference editor's root `Saved` handler, which catches a save that settles after Close, fails the check. Its update moves to the save's `abandoned` (`payload.value`), and the toast is lost after Close |
| P3 | Operations O3, Machines O4 | `O.x.pending(snapshotOrGuardInput, key)` reads whether a call is outstanding, from the pre-turn snapshot | Adds |
| P4 | Operations O3 | A commit call may declare `retry: { on: [tags], schedule }`. It retries only the named failure tags, resending the admitted input; it never retries `unknown`, `interrupt`, `defect` or `notSent`. Each scheduled retry reports `retrying` before the wait; when retries run out, the last failure is the ordinary `failure`. Leaving the fenced state cancels a retry not yet invoked, and `abandoned` receives `notSent` | Replaces "Flow promises no remote rollback and never retries automatically" with "…never retries automatically unless the commit declares `retry`." This **reverses** that sentence |
| P5 | Machines O2, Persistence O2 | `S.X.history` targets X's last active child, or its default on first entry. `S.X.history.child(s)` reads that child from a view. The last child persists with the actor | Adds to O2 targets and `child`, and to "Actor state, memory … survive reload" |
| P6 | Machines O5, O8 | Armed schedules expose `dueAt` at the paths in section 2.1 | See Machines O8 above |
| P7 | Machines O5 | `armOn: [events]` arms a schedule when an event on it is accepted, raised ones included, and re-arming restarts it. A schedule with `armOn` is idle on entry | Replaces "Entry arms a schedule; exit cancels it" with "Entry arms a schedule without `armOn`; exit cancels any" |
| P8 | Machines O5 | The `restartOn` baseline is the activating turn's committed memory | Clarifies "restartOn … establishes a silent baseline and leaves the schedule idle on entry" |
| P9 | Operations O3, Machines O6, Persistence O6 | `unknown`, `interrupt` and `defect` may only target `uncertain` events. A call never invoked (`reject`, a cancel before invocation, a failed acknowledgment, a never-invoked restore) answers `notSent` | Replaces "declines a second unsettled commit without work or outcome", "ends it silently … ends it as interrupt", "Restored work with no acknowledged Attempt … ends interrupt". Adds `notSent` to "Finite actions declare optional success, failure, defect, interrupt and unknown outcomes" |
| P10 | Operations O3, Machines O3 | `abandoned` receives `{ outcome, tag?, value?, input, attempt }`. `outcome` is `"pending"` or a terminal outcome; `tag` names a failure; `value` is present on success. It is an `on`-style handler without `target`, possibly ordered alternatives ending unguarded. It writes host memory and may raise into **root** traits; in any turn it sources, rule 6's "late result never preempts live work" applies. It runs twice: with `"pending"` fused into the leaving turn (a key also written by the leaving transition is a pre-commit defect), and again on settlement as its own turn. Each run must be correct on its own | Adds a turn source |
| P11 | Machines O5 | Each arming has an id; a firing from an earlier arming is never delivered | Extends "if its declaring activation ended before handling, it is discarded" |
| P12 | Persistence O6 | A fenced commit restores with its activation, in the shape of P10. An acknowledged in-flight commit is `unknown` with its Attempt; a never-invoked one is `notSent`. If its activation was not restored, the result goes to `abandoned` | Extends "A crash after acknowledgment restores unknown carrying the same Attempt…" |
| P13 | Operations O3, O5 | `optimistic` is a list of `setData` writes keyed by params. With `revertOnUnknown: true`, an `unknown` commit removes its optimistic writes at once; the entry is still invalidated and refetched | Adds the shape to "optimistic applies on start". Adds an exception to "unknown retains them and invalidates the entry" |

### The five ambiguous sentences, decided

1. **Which state P2 fences to:** the state the starting transition enters, or, for `"self"`, the
   state where the handler is written (P2 above).
2. **Guards read `schedules` and call `.pending`:** yes, from the pre-turn snapshot. Guards still
   receive no `now`: they may test whether a schedule is armed, not how long is left.
3. **Does `armOn` also arm on entry:** no. A schedule is armed either by entry (no `armOn`) or by its
   events, raised or sent. Never both.
4. **Where timers sit:** section 2.1 (host, trait, subroutine) and rule 9 (list instances).
5. **When `retrying` fires:** when a retry is scheduled, before the wait, with `retry` counting from
   1. A view can show "retrying (n/3)" during the backoff.

## 6. Deliberately left out

- **Fragment I/O** (`requests`, `CommitWithRetry`). With P1–P4, P9 and P10, retry policy, fencing
  and uncertainty belong to the commit, for every machine; v2's own amended build deleted its I/O
  fragment. The cost: an unmapped outcome only publishes an issue (D4), and a host handler can still
  resend from an `uncertain` event (H5). If a policy appears that commit options cannot express,
  v2's request semantics are the ready design.
- **Nested request relays.** These follow from the above: no fragment has requests to relay.
- **Parallel-region traits** (real states for an always-there hold-to-confirm). Today such a piece
  is either a subroutine placed as a host state, or a trait whose modes are memory. Regions change
  Machines O2 and need their own proposal.
- **Node memory** (host memory scoped to a compound). Fragment state can already be scoped with
  `.at`. The cost that remains is resetting a few host keys by hand (`wrongAttempts`). It is
  wanted, but it is a Machines change of its own.
- **Narrowing selects by guards.** A select cannot see what a guard proved (signup's
  `role.value!`). This is TypeScript, not fragments.

## 7. Open

1. **Attempts per challenge.** A keyed `Strikes` trait would keep each challenge's count, so a late
   strike for a challenge the user left is not lost. Is that worth a second list in the sign-in?
2. **Names.** `trait`, `subroutine`, `hostEvents`, `resetOn`, `optional`, `.key`, `owner`.

## Changes after review

- **After [reviews/v3-correctness.md](reviews/v3-correctness.md) and
  [v3-principles.md](reviews/v3-principles.md):** P2 is checked and its O2 break stated;
  `abandoned` carries `attempt` and `value`; lists are keyed; `resetOn` reaches a fixed point; rule 8
  is transitive; one `optional(…)`; `retry` on the commit; verdicts and section 5 rows fixed.
- **After the build** ([comparison/build-v3.md](comparison/build-v3.md)): the four gaps are closed
  (rules 6, 7, 9); one mapper form; optional subroutine states; `abandoned` raises into root traits;
  author-chosen list keys; the plan clashes decided; P13 back as an opt-in.
- **After the readback and the amended-build check** ([comparison/v3-readback.md](comparison/v3-readback.md),
  [v3-amended-correctness.md](comparison/reviews/v3-amended-correctness.md)): typing outside a node;
  one meaning for `{}`; bare-token shorthand; `resetOn` equality and lists; a subroutine test;
  rule 12; host-owned lists; Submit refused at the limit and while a guess is pending; late results
  never preempt live work (rule 6), which closes the old open question 1.

**Where each UNCLEAR item is now answered:**

| # | Item | Answered in |
| --- | --- | --- |
| 1 | `operations` shape | §5 Machines O1 (groups); 3.1 definition |
| 2 | Required port syntax | §2.2 contract block and the paragraph below the port table |
| 3 | Typing shared handlers and helpers | rule 1 "Typing"; §2.3 last row; `Signup.guard` in 3.3; Machines O1 row |
| 4 | `is(state)` vs `is(snapshot)` | §5 Machines O2 row |
| 5 | P1 mapper shape | P1 row; 3.4 pin outcomes; 3.2 `retrying` |
| 6 | Story list-key seeding | rule 9 keys; 3.3 Story excerpt; Testing O1 row |
| 7 | Subroutine schedules | §2.1 "Reading" |
| 8 | Host schedules and the namespace | §2.1 "Reading"; Machines O1 row |
| 9 | Nesting syntax | §2.2 contract block; rule 10; 3.5 `Flash` |
| 10 | A trait without memory | §2.1 "Reading"; `Countdown` in 3.1 |
| 11 | A raised hostEvent arms `armOn` | rule 7; P7; decided sentence 3 |
| 12 | A subroutine with no states | §2.1 table; `Confirm` in 3.2; Machines O2 row |
| 13 | Inline guards inside fragments | §2.2, below the contract block (`Previous`) |
| 14 | Guarding a list's `Add` / `Remove` | rule 9; 3.3 `canAdd` / `canRemove` |
| 15 | What a raise mapper reads | rule 7 (pre-turn snapshot and event) |
| 16 | Root handlers inside a subroutine state | rule 6; Machines O2 row; note after 3.4 |
| 17 | The `optimistic` shape | P13 row; 3.4 pin commit |
| 18 | Whether a Story `send` runs its turn | Testing O1 row; 3.1 `countdown.test.ts` |
| 19 | History visible while CANCELLING | P5 (`S.X.history.child(s)`); 3.2 `SignupWizard` excerpt |
