# Build: the three comparison apps in proposal v3

**Inputs, and nothing else:** [proposal-v3.md](../proposal-v3.md), [apps.md](apps.md) with three
spec fixes, and the plans v3 amends ([Machines](../../../../Machines.plan),
[Operations](../../../../Operations.plan), [Testing](../../../../Testing.plan),
[React](../../../../React.plan)). No other build, review or proposal was read.

**Spec fixes applied on top of apps.md:**

- **S1:** wrong attempts and the lockout survive Back to password and re-entry for the same
  challenge. This replaces apps.md's "keeping nothing" for those two facts only. The typed code and
  the resend cooldown are still dropped.
- **S2:** select-all takes its ids from the current snapshot, not from the click.
- **S3:** an `unknown` pin reverts the row and refetches. v3 **cannot** revert at once (see the
  issue list).

**Markers in the code:**

- `// FAKED:` marks a workaround.
- `// UNCLEAR:` marks a place where v3 left me guessing. It always states the reading I chose.
- `// V3 RULE n:` marks a rule that visibly shaped the code. Numbers are section 2.4 rules 1–11, or
  plan amendments P1–P12.

**Files:**

- `shared/fragments.ts`
- per app: `*.operations.ts`, `*.definition.ts`, `*.machine.ts`, the component file and
  `*.story.test.ts`

Operations files hold only the shapes apps.md fixes, plus a service tag for fixtures. They are not
counted as app code.

**Line counts** are non-blank, non-comment lines, measured with
`grep -vE '^\s*$|^\s*//|^\s*\{/\*.*\*/\}\s*$'`.

---

## 0. Shared fragments

Eight fragments in one file:

| Fragment | Kind | Lines | Used by |
| --- | --- | --- | --- |
| `Field` | trait | 33 | sign-in, signup |
| `Countdown` | trait | 20 | sign-in |
| `Confirm` | subroutine | 4 | signup |
| `HoldToConfirm` | subroutine | 15 | issue list |
| `Debounce` | trait | 20 | issue list |
| `Pager` | trait | 25 | issue list |
| `Selection` | trait | 24 | issue list |
| `Flash` | trait | 17 | issue list |

The file is 144 lines in total, including 2 import lines.

```ts
// fragments.ts — shared by all three apps. No I/O anywhere in this file (V3 RULE 3).
import { deny, optional, subroutine, trait } from "flow-state";
import { Duration, Schema } from "effect";

// ---------------------------------------------------------------------------------------------
// Field: a validated value. The error is always computed; `touched` says whether to show it yet.
// Used by: sign-in (code), signup (email, password, name, role, invites list).
// ---------------------------------------------------------------------------------------------
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
      // V3 RULE 5: optional() guard defaults to allow; `flow check` lists it as info when unfilled.
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

// ---------------------------------------------------------------------------------------------
// Countdown: runs once per Start. Start never refuses (V3 RULE 8), so raising it re-arms the timer.
// "Running" is the armed schedule itself: s.schedules.<instance>.done !== undefined.
// Used by: sign-in (resendCooldown, lockout).
// ---------------------------------------------------------------------------------------------
// UNCLEAR: a trait with no `memory` — does `s.memory.<instance>` exist (as {}), or is there no
// slice at all? Reading chosen: no memory slice; hosts and views read only `s.schedules.<instance>`.
export const Countdown = (p: { length: Duration.Input }) =>
  trait(
    {
      id: "Countdown",
      hostEvents: { Start: {} },
      internalEvents: { Done: {} },
      callbacks: { onDone: optional({}) },
    },
    ({ E, callbacks }) => ({
      // V3 RULE P7: armOn makes the schedule idle on entry; each accepted Start re-arms it and the
      // arming id drops any firing from an earlier arming (P11).
      // UNCLEAR: Start only ever arrives by a host `raise`. P7 says "when a transition on one of them
      // is accepted"; reading chosen: a raised transition fused into the host's turn counts.
      schedules: { done: { schedule: p.length, send: E.Done, armOn: [E.Start] } },
      on: {
        Start: { target: "self" },
        Done: { target: "self", notify: [callbacks.onDone] },
      },
    }),
  );

// ---------------------------------------------------------------------------------------------
// Confirm: a yes/no dialog the actor goes into. Used by: signup (CANCELLING).
// ---------------------------------------------------------------------------------------------
// UNCLEAR: the kinds table (2.1) says a subroutine has "States of its own: yes", and the contract
// says "subroutines also: states, default, exits", yet v3's own Confirm declares no states. Reading
// chosen: states are optional; a subroutine without them is placed as a leaf.
export const Confirm = subroutine(
  { id: "Confirm", events: { Yes: {}, No: {} }, exits: { Confirmed: {}, Declined: {} } },
  ({ exits }) => ({ on: { Yes: exits.Confirmed, No: exits.Declined } }),
);

// ---------------------------------------------------------------------------------------------
// HoldToConfirm: entered on press; confirms after `hold`, cancels on early release.
// Used by: issue list (HOLDING).
// ---------------------------------------------------------------------------------------------
export const HoldToConfirm = (p: { hold: Duration.Input }) =>
  subroutine(
    {
      id: "HoldToConfirm",
      events: { Release: {} },
      internalEvents: { Held: {} },
      exits: { Confirmed: {}, Cancelled: {} },
    },
    ({ E, exits }) => ({
      // No armOn: armed by entry (P7), cancelled by leaving (V3 RULE 1), fresh on every entry.
      schedules: { held: { schedule: p.hold, send: E.Held } },
      // V3 RULE 8: the timer-fired handler is unguarded and ends in an exit, which the host must fill.
      on: { Release: exits.Cancelled, Held: exits.Confirmed },
    }),
  );

// ---------------------------------------------------------------------------------------------
// Debounce: `draft` follows every change; `applied` catches up `wait` after the last change.
// Used by: issue list (search).
// ---------------------------------------------------------------------------------------------
export const Debounce = <V, I>(value: Schema.Codec<V, I>, p: { wait: Duration.Input }) =>
  trait(
    {
      id: "Debounce",
      input: { start: value },
      events: { Changed: { value } },
      internalEvents: { Settled: {} },
      memory: { draft: value, applied: value },
      initial: ({ input }) => ({ draft: input.start, applied: input.start }),
    },
    ({ E }) => ({
      // armOn rather than restartOn: every keystroke re-arms, even one that restores the old text,
      // which is exactly "300 ms after the last keystroke".
      schedules: { settle: { schedule: p.wait, send: E.Settled, armOn: [E.Changed] } },
      on: {
        Changed: { target: "self", updateMemory: ({ event }) => ({ draft: event.value }) },
        Settled: { target: "self", updateMemory: ({ memory }) => ({ applied: memory.draft }) },
      },
    }),
  );

// ---------------------------------------------------------------------------------------------
// Pager: a 1-based page number. The host decides whether a next page exists.
// Used by: issue list (pager).
// ---------------------------------------------------------------------------------------------
export const Pager = trait(
  {
    id: "Pager",
    events: { Next: {}, Previous: {} },
    memory: { page: Schema.Int },
    initial: () => ({ page: 1 }),
    // UNCLEAR: v3 only shows `optional()` for ports; it never spells a *required* guard or callback.
    // Reading chosen: a bare payload record (`{}` for a guard, `{ fields }` for a callback) is the
    // required form, mirroring how `events` are declared. hasNext protects nothing, but the host is
    // the only party that knows the total, so it is required.
    guards: { hasNext: {} },
  },
  ({ guards }) => ({
    on: {
      Next: { target: "self", guard: guards.hasNext, updateMemory: ({ memory }) => ({ page: memory.page + 1 }) },
      // UNCLEAR: v3 shows fragment transitions guarded only by declared ports. Reading chosen: a
      // fragment may also write its own inline guard over its own memory (the host cannot touch it).
      Previous: {
        target: "self",
        guard: ({ memory }) => memory.page > 1 || deny("FirstPage"),
        updateMemory: ({ memory }) => ({ page: memory.page - 1 }),
      },
    },
  }),
);

// ---------------------------------------------------------------------------------------------
// Selection: a set of ids. Toggling is public; SelectAll and Clear are host facts.
// Used by: issue list (selection).
// ---------------------------------------------------------------------------------------------
export const Selection = trait(
  {
    id: "Selection",
    events: { Toggle: { id: Schema.String } },
    // V3 RULE 2: SelectAll is a hostEvent so a view cannot send ids from a click (spec fix S2).
    hostEvents: { SelectAll: { ids: Schema.Array(Schema.String) }, Clear: {} },
    memory: { ids: Schema.Array(Schema.String) },
    initial: () => ({ ids: [] }),
    guards: { canToggle: optional() },
  },
  ({ guards }) => ({
    on: {
      Toggle: {
        target: "self",
        guard: guards.canToggle,
        updateMemory: ({ memory, event }) => ({
          ids: memory.ids.includes(event.id) ? memory.ids.filter((i) => i !== event.id) : [...memory.ids, event.id],
        }),
      },
      SelectAll: { target: "self", updateMemory: ({ event }) => ({ ids: event.ids }) },
      Clear: { target: "self", updateMemory: () => ({ ids: [] }) },
    },
  }),
);

// ---------------------------------------------------------------------------------------------
// Flash: a message that clears itself after `length`. A new Show replaces the message and re-arms.
// Used by: issue list (flash).
// ---------------------------------------------------------------------------------------------
// FAKED: Flash repeats Countdown's "armOn timer + Done" shape instead of nesting a Countdown inside
// itself, because v3 never shows the syntax for a fragment placing and filling a child fragment
// (rule 10 says it may). See the UNCLEAR below.
// UNCLEAR: rule 10 ("A fragment fills its own children's ports and raises only into its direct
// children") has no syntax: is placement `traits:` in the contract and filling `traits:` in the
// body? Reading chosen: not nested, to avoid inventing it.
export const Flash = (p: { length: Duration.Input }) =>
  trait(
    {
      id: "Flash",
      hostEvents: { Show: { message: Schema.String } },
      internalEvents: { Expired: {} },
      memory: { message: Schema.NullOr(Schema.String) },
      initial: () => ({ message: null }),
    },
    ({ E }) => ({
      schedules: { expire: { schedule: p.length, send: E.Expired, armOn: [E.Show] } },
      on: {
        Show: { target: "self", updateMemory: ({ event }) => ({ message: event.message }) },
        Expired: { target: "self", updateMemory: () => ({ message: null }) },
      },
    }),
  );
```


---

## 1. Two-factor sign-in

```ts
// auth.operations.ts — operation shapes fixed by apps.md; the adapter service is out of scope.
import { transaction } from "flow-state";
import { Data, Effect, Schema, ServiceMap } from "effect";

export class WrongCode extends Data.TaggedError("WrongCode")<{}> {}
export class Expired extends Data.TaggedError("Expired")<{}> {}

export class AuthApi extends ServiceMap.Service<
  AuthApi,
  {
    readonly verifyCode: (p: { challengeId: string; code: string }) => Effect.Effect<void, WrongCode | Expired>;
    readonly resendCode: (p: { challengeId: string }) => Effect.Effect<void>;
  }
>()("AuthApi") {}

// UNCLEAR: Machines O1 says `operations` is "a flat record of operation or entity-domain handles",
// which gives `O.verifyCode`; v3 and apps.md write `operations: { Auth }` and `O.Auth.verifyCode`.
// Reading chosen: a plain record of handles may be nested one level as a namespace.
export const Auth = {
  verifyCode: transaction({
    id: "Auth/verifyCode",
    input: Schema.Struct({ challengeId: Schema.String, code: Schema.String }),
    commit: (p) =>
      Effect.gen(function* () {
        const api = yield* AuthApi;
        return yield* api.verifyCode(p);
      }),
    // "allow": a verify that settles after Back must not turn the next Submit into `notSent`.
    concurrency: "allow",
  }),
  resendCode: transaction({
    id: "Auth/resendCode",
    input: Schema.Struct({ challengeId: Schema.String }),
    commit: (p) =>
      Effect.gen(function* () {
        const api = yield* AuthApi;
        return yield* api.resendCode(p);
      }),
    concurrency: "reject",
  }),
};
```


```ts
// signin.definition.ts
import { definition, uncertain } from "flow-state";
import { Schema } from "effect";
import { Auth } from "./auth.operations";
import { Countdown, Field } from "../shared/fragments";

export const SignIn = definition({
  id: "Auth/SignIn",
  states: ["PASSWORD", { TWO_FACTOR: ["ENTERING", "VERIFYING", "LOCKED_OUT"] }, "SIGNED_IN"],
  // V3 RULE 1: lifetime comes from placement. `.at("TWO_FACTOR")` makes these fresh on every entry
  // to the step, so Back drops the typed code and the resend cooldown ("keeping nothing").
  traits: {
    code: Field(Schema.String, {
      validate: (v) => (/^\d{6}$/.test(v) ? null : "Enter the 6-digit code"),
    }).at("TWO_FACTOR"),
    resendCooldown: Countdown({ length: "30 seconds" }).at("TWO_FACTOR"),
    // At the root: the lockout survives Back to password (spec fix S1).
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
    // V3 RULE P9: `unknown`, `interrupt` and `defect` may only target an `uncertain` event.
    CodeUnchecked: uncertain({}),
  },
  // FAKED: wrongAttempts and lockedChallenge must survive Back (S1), so they live in host root
  // memory and are reset by hand on every path; v3 section 6 defers "node memory".
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

// UNCLEAR: v3 writes helpers such as `({ state }) => …` outside any handler, untyped. No plan names a
// guard-input type, and rule 1 types `.at` slices as present only in handlers "declared at or below
// X", which a shared const is not. Reading chosen: helpers take explicit slices of the definition's
// Snapshot Schema type (Machines O1) and never touch a trait slice; anything that reads `memory.code`
// is written inline in a handler under TWO_FACTOR.
type Snap = typeof SignIn.Snapshot.Type;

export const SignInMachine = machine(SignIn, ({ S, E, O }) => {
  // UNCLEAR: Machines O2 defines `token.is(snapshot)`; v3 rule (Machines O4 amendment) writes
  // `S.X.is(state)` in guards. Reading chosen: `is` accepts either the snapshot or its `state` path.
  const isLockedOut = ({ state }: Pick<Snap, "state">) => S.TWO_FACTOR.LOCKED_OUT.is(state);
  const lockMemory = ({ memory }: Pick<Snap, "memory">) => ({
    wrongAttempts: MAX_WRONG,
    lockedChallenge: memory.challengeId,
    error: null,
  });
  const lockNow = {
    target: S.TWO_FACTOR.LOCKED_OUT,
    updateMemory: lockMemory,
    // V3 RULE 8: both raises target unguarded hostEvents, so this is safe inside an outcome handler.
    // V3 RULE 7: host keys, `code` and `lockout` write disjoint memory; only the host changes state.
    raise: [E.code.Reset, E.lockout.Start],
  } as const;

  // UNCLEAR (same as the type note above): a handler shared by ENTERING and LOCKED_OUT has no
  // contextual type, so `schedules.resendCooldown` (placed `.at("TWO_FACTOR")`) is only "present"
  // if the shared object is checked where it is used. Reading chosen: it is checked at each use
  // site, as v3's own example assumes.
  const resend = {
    target: "self",
    // V3 RULE P6 / decided sentence 2: guards read `schedules` (armed or not), never time left.
    guard: ({ schedules }) => schedules.resendCooldown.done === undefined || deny("CoolingDown"),
    // V3 RULE P2: a "self" commit is fenced to the state the handler is written in (ENTERING or
    // LOCKED_OUT). No outcomes are mapped, so nothing has to be handled there; a late result is
    // dropped with evidence. apps.md specifies no resend failure behaviour.
    actions: [O.Auth.resendCode.commit(({ memory }) => ({ challengeId: memory.challengeId }))],
    raise: [E.resendCooldown.Start],
  } as const;

  const toEntering = (error: string) => ({ target: S.TWO_FACTOR.ENTERING, updateMemory: () => ({ error }) });

  return {
    default: S.PASSWORD,

    // V3 RULE 2.2: one filling block per instance, in the machine.
    traits: {
      code: {
        input: () => ({ start: "" }),
        // FAKED: a third wrong code that settles (in `abandoned`) after the user came back to
        // ENTERING is acted on only at the next Submit: typing is refused here, but the lockout
        // countdown does not start until Submit. `abandoned` may not raise or move (P10; v3 open
        // question 3), so nothing can start the lockout at settlement time.
        guards: {
          canEdit: [
            (g) => !isLockedOut(g) || deny("LockedOut"),
            ({ memory }) => memory.wrongAttempts < MAX_WRONG || deny("TooManyWrong"),
          ],
        },
      },
      resendCooldown: {},
      lockout: {
        callbacks: {
          // V3 RULE 6: a root trait's callback may move the host anywhere.
          // V3 RULE 8: a timer-fired chain must end in an unguarded alternative.
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
                wrongAttempts: memory.lockedChallenge === memory.challengeId ? 0 : memory.wrongAttempts,
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
            // S1: this challenge is still locked: back to its countdown, which keeps running.
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
              raise: [E.lockout.Start], // `code` is not active before this turn; it starts fresh
            },
            // S1: the same challenge keeps its wrong attempts; a new challenge starts at zero.
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
        // V3 RULE P2: leaving VERIFYING here abandons its fenced verify; see `abandoned` below.
        on: { BackToPassword: S.PASSWORD },
        states: {
          ENTERING: {
            on: {
              Submit: [
                // A late wrong code reached the limit while the user was already back here.
                { ...lockNow, guard: ({ memory }) => memory.wrongAttempts >= MAX_WRONG || deny("TriesLeft") },
                {
                  target: S.TWO_FACTOR.VERIFYING,
                  // V3 RULE 1: `memory.code` is typed present here, below TWO_FACTOR.
                  guard: ({ memory }) => memory.code.error === null || deny("InvalidCode"),
                  updateMemory: () => ({ error: null }),
                  actions: [
                    // V3 RULE P2: fenced to the VERIFYING activation this transition enters; its
                    // outcome events are handled only there (`flow check` error otherwise).
                    O.Auth.verifyCode.commit(
                      ({ memory }) => ({ challengeId: memory.challengeId, code: memory.code.value }),
                      {
                        outcomes: {
                          success: E.CodeAccepted,
                          failure: { WrongCode: E.CodeWrong, Expired: E.CodeExpired },
                          // V3 RULE P9: notSent may target an ordinary event; it never reached the
                          // server, so "couldn't check" is accurate and no attempt is counted.
                          notSent: E.CodeUnchecked,
                          unknown: E.CodeUnchecked,
                          interrupt: E.CodeUnchecked,
                          defect: E.CodeUnchecked,
                        },
                        // V3 RULE P10: runs with outcome "pending" in the leaving turn (writes
                        // nothing here) and again on settlement as its own turn. It never moves
                        // the actor. A wrong code that settles after Back still counts (S1).
                        abandoned: {
                          updateMemory: ({ payload, memory }) =>
                            payload.tag === "WrongCode" && payload.input.challengeId === memory.challengeId
                              ? { wrongAttempts: memory.wrongAttempts + 1 }
                              : {},
                        },
                      },
                    ),
                  ],
                },
              ],
              Resend: resend,
            },
          },
          VERIFYING: {
            // V3 RULE 8: every outcome event is handled here, each ending unguarded.
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
                  raise: [E.code.Reset], // the code field is cleared
                },
              ],
              CodeExpired: toEntering("Code expired, send a new one"),
              CodeUnchecked: toEntering("Couldn't check the code, try again"),
            },
          },
          // Submit is Unhandled here; typing is refused by canEdit.
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
import { SignIn } from "./signin.definition";
import { SignInMachine } from "./signin.machine";

const { S, E } = SignIn;
const secondsLeft = (dueAt: number | undefined, now: number) =>
  dueAt === undefined ? 0 : Math.max(0, Math.ceil((dueAt - now) / 1000));

export function SignInScreen() {
  const signIn = useActor(SignInMachine);
  const top = useView(signIn, (s) => S.root.child(s));
  if (top === "TWO_FACTOR") return <TwoFactorStep signIn={signIn} />;
  if (top === "SIGNED_IN") return <p>Signed in.</p>;
  return <PasswordStep signIn={signIn} />;
}

// The password step is a stub (apps.md): it only reports an accepted password.
function PasswordStep({ signIn }: { signIn: Actor<typeof SignInMachine> }) {
  return (
    <button type="button" onClick={() => signIn.send(E.PasswordAccepted({ challengeId: "challenge-1" }))}>
      Continue
    </button>
  );
}

export function TwoFactorStep({ signIn }: { signIn: Actor<typeof SignInMachine> }) {
  const now = useNow("1 second");
  // V3 RULE 1 / P6: fragment memory and deadlines are read directly; nothing is copied (D1).
  const code = useView(signIn, (s) => (S.TWO_FACTOR.is(s) ? s.memory.code : null));
  const error = useView(signIn, (s) => s.memory.error);
  const resendDue = useView(signIn, (s) => s.schedules.resendCooldown?.done?.dueAt);
  const lockoutDue = useView(signIn, (s) =>
    S.TWO_FACTOR.LOCKED_OUT.is(s) ? s.schedules.lockout.done?.dueAt : undefined,
  );
  const verifying = useView(signIn, (s) => S.TWO_FACTOR.VERIFYING.is(s));
  const canType = useView(signIn, (s) => check(s, E.code.Changed({ value: "" }))._tag === "Allowed");
  const canSubmit = useView(signIn, (s) => check(s, E.Submit())._tag === "Allowed");
  const canResend = useView(signIn, (s) => check(s, E.Resend())._tag === "Allowed");
  const resendIn = secondsLeft(resendDue, now);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        signIn.send(E.Submit());
      }}
    >
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
      <button type="submit" disabled={!canSubmit}>
        {verifying ? "Checking…" : "Submit"}
      </button>
      <button type="button" disabled={!canResend} onClick={() => signIn.send(E.Resend())}>
        {resendIn > 0 ? `Resend code (${resendIn} s)` : "Resend code"}
      </button>
      <button type="button" onClick={() => signIn.send(E.BackToPassword())}>
        Back to password
      </button>
      {/* V3 RULE 2: signIn.send(E.code.Reset()) and signIn.send(E.CodeWrong()) are type errors. */}
    </form>
  );
}
```


```ts
// signin.story.test.ts
import { check } from "flow-state";
import { story } from "flow-state/testing";
import { Effect, Layer } from "effect";
import { expect, test } from "vitest";
import { AuthApi, WrongCode } from "./auth.operations";
import { SignIn } from "./signin.definition";
import { SignInMachine } from "./signin.machine";

const { S, E } = SignIn;

// Server truth: only 123456 is right; resends always succeed.
const authFixture = Layer.succeed(AuthApi, {
  verifyCode: ({ code }) => (code === "123456" ? Effect.void : Effect.fail(new WrongCode())),
  resendCode: () => Effect.void,
});

// UNCLEAR: Testing O1 lists send and process but not whether `send` runs its own turn. Reading
// chosen: send runs the event's turn; process() drains operation work (commits settling).
export const lockoutSurvivesBack = story
  .machine(SignInMachine, { id: "SignIn/lockout-survives-back", fixtures: [authFixture] })
  .send(E.PasswordAccepted({ challengeId: "c1" }))
  .checkpoint("entering")
  .send(E.code.Changed({ value: "000000" }))
  .send(E.Submit())
  .process() // 1st WrongCode
  .send(E.code.Changed({ value: "000000" }))
  .send(E.Submit())
  .process() // 2nd WrongCode
  .send(E.code.Changed({ value: "000000" }))
  .send(E.Submit())
  .process() // 3rd WrongCode: locked
  .checkpoint("locked")
  .send(E.Resend())
  .process()
  .checkpoint("resent")
  .advance("1 minute")
  .send(E.BackToPassword())
  .send(E.PasswordAccepted({ challengeId: "c1" })) // S1: the same challenge, still locked
  .checkpoint("relocked")
  .advance("4 minutes")
  .process()
  .checkpoint("unlocked");

test("three wrong codes lock the challenge; the lock survives Back; it ends after 5 minutes", async () => {
  const run = await lockoutSurvivesBack.run();
  const { entering, locked, resent, relocked, unlocked } = run.checkpoints;

  expect(S.TWO_FACTOR.ENTERING.is(entering.snapshot)).toBe(true);
  expect(entering.snapshot.memory.code?.error).toBe("Enter the 6-digit code");

  expect(S.TWO_FACTOR.LOCKED_OUT.is(locked.snapshot)).toBe(true);
  expect(locked.snapshot.memory.wrongAttempts).toBe(3);
  expect(locked.snapshot.memory.code?.value).toBe(""); // cleared by Reset
  expect(locked.snapshot.schedules.lockout.done?.dueAt).toBe(locked.now + 300_000);
  expect(check(locked.snapshot, E.Submit())._tag).toBe("Unhandled");
  expect(check(locked.snapshot, E.code.Changed({ value: "1" }))._tag).toBe("Denied");

  // Resend is allowed while locked out, then cools down for 30 s.
  expect(resent.snapshot.schedules.resendCooldown?.done?.dueAt).toBe(resent.now + 30_000);
  expect(check(resent.snapshot, E.Resend())._tag).toBe("Denied");

  // S1: Back and re-entry for the same challenge lands on the same, still-running countdown.
  expect(S.TWO_FACTOR.LOCKED_OUT.is(relocked.snapshot)).toBe(true);
  expect(relocked.snapshot.schedules.lockout.done?.dueAt).toBe(locked.now + 300_000);
  expect(relocked.snapshot.schedules.resendCooldown?.done).toBeUndefined(); // fresh after Back

  expect(S.TWO_FACTOR.ENTERING.is(unlocked.snapshot)).toBe(true);
  expect(unlocked.snapshot.memory.wrongAttempts).toBe(0);
  expect(unlocked.snapshot.memory.lockedChallenge).toBeNull();
  expect(check(unlocked.snapshot, E.code.Changed({ value: "1" }))._tag).toBe("Allowed");
});
```


### Sign-in: counts and keywords

| Part | Lines |
| --- | --- |
| Fragments used (`Field` 33 + `Countdown` 20) | 53 |
| Definition | 35 |
| Machine | 148 |
| Components (`SignInScreen`, `PasswordStep`, `TwoFactorStep`) | 65 |
| *(Operations 33, Story 57: not counted)* | |

**New keywords used:**

- Fragments: `trait`, `traits`, `.at`, `hostEvents`, fragment `internalEvents`, `guards` (declared,
  and filled with an array), `callbacks` (filled with ordered alternatives), `optional`, `notify`,
  `raise`.
- Plans: `abandoned` (with `payload.tag` and `payload.input`), `notSent`, `uncertain`, `armOn`,
  `s.schedules`, `dueAt`.

**Not needed:** `subroutine`, `exits`, `.list`, `resetOn`, `retry`, `.pending`, `.history`.

**Notes:**

- I took the machine almost verbatim from v3 §3.1. It worked, with three changes:
  - the commit moved inline under TWO_FACTOR, so `memory.code` is typed (rule 1);
  - `canEdit` also refuses typing at the attempt limit (see the FAKED note in the machine);
  - concurrency is `"allow"`, so a verify that settles after Back can't make the next Submit
    `notSent`.
- **The machine is the biggest piece by far (148 lines).** v3 reuses the field and the timers. The
  lockout policy is still written by hand:
  - three `PasswordAccepted` alternatives;
  - `lockNow` used in two places;
  - the `abandoned` strike counter;
  - two `onDone` alternatives;
  - host keys reset by hand on every path.

  v3 says this openly in its "pieces, not policy" trade (§1) and its "node memory" item (§6).
- **There is one lockout slot.** The lockout is a single root `Countdown` paired with
  `lockedChallenge`. Locking challenge B while A is still locked restarts the timer for B, and A's
  lock is lost. The same goes for attempts: going to challenge B and back to A loses A's attempts.
  S1 only asks about returning to the same challenge, so this meets the spec. Per-challenge state
  would need `.list` keyed by `challengeId`, and author-chosen list keys are v3 open question 2.

---

## 2. Signup wizard

```ts
// accounts.operations.ts — operation shapes fixed by apps.md; the adapter service is out of scope.
import { transaction } from "flow-state";
import { Data, Effect, Schema, ServiceMap } from "effect";

export const Role = Schema.Literals(["engineer", "designer", "manager"]);

export class EmailTaken extends Data.TaggedError("EmailTaken")<{}> {}
export class Busy extends Data.TaggedError("Busy")<{}> {}

const CreateInput = Schema.Struct({
  email: Schema.String,
  password: Schema.String,
  name: Schema.String,
  role: Role,
  invites: Schema.Array(Schema.String),
});

export class AccountsApi extends ServiceMap.Service<
  AccountsApi,
  { readonly create: (p: typeof CreateInput.Type) => Effect.Effect<void, EmailTaken | Busy> }
>()("AccountsApi") {}

export const Accounts = {
  create: transaction({
    id: "Accounts/create",
    input: CreateInput,
    commit: (p) =>
      Effect.gen(function* () {
        const api = yield* AccountsApi;
        return yield* api.create(p);
      }),
    concurrency: "reject",
  }),
};
```


```ts
// signup.definition.ts
import { definition, uncertain } from "flow-state";
import { Schema } from "effect";
import { Accounts, Role } from "./accounts.operations";
import { Confirm, Field } from "../shared/fragments";

const isEmail = (v: string) => v.includes("@");

export const Signup = definition({
  id: "Accounts/Signup",
  states: [
    { WIZARD: ["ACCOUNT", "PROFILE", "INVITE", "REVIEW"] },
    // V3 RULE 2.1: the dialog blocks the page under it, so the actor goes *into* it: a subroutine.
    { CANCELLING: Confirm },
    "SUBMITTING",
    "UNSURE",
    "DONE",
    "CANCELLED",
  ],
  // V3 RULE 1: every draft is a root trait, so it survives Back, Next, Cancel → Keep (CANCELLING is
  // a sibling of WIZARD, so a trait placed `.at("WIZARD")` would be dropped by the dialog) and the
  // trip back to ACCOUNT after EmailTaken.
  traits: {
    email: Field(Schema.String, { validate: (v) => (isEmail(v) ? null : "Enter an email address") }),
    password: Field(Schema.String, { validate: (v) => (v.length >= 12 ? null : "Use at least 12 characters") }),
    name: Field(Schema.String, { validate: (v) => (v.trim() !== "" ? null : "Enter your name") }),
    role: Field(Schema.NullOr(Role), { validate: (v) => (v === null ? "Choose a role" : null) }),
    // V3 RULE 9: up to five keyed instances; Add is refused at max by the runtime.
    invites: Field(Schema.String, {
      validate: (v) => (v === "" || isEmail(v) ? null : "Enter an email address"),
    }).list({ max: 5 }),
  },
  events: { Next: {}, Back: {}, Cancel: {}, Submit: {} },
  internalEvents: {
    Created: {},
    EmailTaken: {},
    Busy: {},
    NotSent: {},
    Retrying: { n: Schema.Int },
    // V3 RULE P9: the only kind of event unknown / interrupt / defect may target.
    Unsure: uncertain({}),
  },
  memory: {
    error: Schema.NullOr(Schema.String),
    busyRetries: Schema.Int, // 0 when not retrying; n during "retrying (n/3)"
  },
  initial: () => ({ error: null, busyRetries: 0 }),
  operations: { Accounts },
});
```


```ts
// signup.machine.ts
import { deny, machine } from "flow-state";
import { Schedule } from "effect";
import { Signup } from "./signup.definition";

export const SignupMachine = machine(Signup, ({ S, E, O }) => {
  // A draft is editable only on its own page (and not under the Cancel dialog or while submitting).
  // UNCLEAR: same token-on-state reading as sign-in (`S.X.is(state)` in a guard).
  const onPage = (page: typeof S.WIZARD.ACCOUNT | typeof S.WIZARD.PROFILE | typeof S.WIZARD.INVITE) => ({
    canEdit: ({ state }) => page.is(state) || deny("NotOnPage"),
  });
  const clearError = () => ({ error: null });

  return {
    default: S.WIZARD,

    traits: {
      email: { input: () => ({ start: "" }), guards: onPage(S.WIZARD.ACCOUNT) },
      password: { input: () => ({ start: "" }), guards: onPage(S.WIZARD.ACCOUNT) },
      name: { input: () => ({ start: "" }), guards: onPage(S.WIZARD.PROFILE) },
      role: { input: () => ({ start: null }), guards: onPage(S.WIZARD.PROFILE) },
      // V3 RULE 9: one filling block serves every instance; `input` is read for each added one.
      // FAKED: Add and Remove are the list's own public events with no guard port, so a view (or
      // any sender) can add or remove invite rows while on ACCOUNT, REVIEW or even SUBMITTING. Only
      // `max` refuses Add. Harmless here (rows are empty, the commit resends its admitted input),
      // but "Add on the Invite page" is a convention of the view, not a rule.
      // UNCLEAR: can a list filling block carry a guard for Add (e.g. `guards: { add: … }`)? v3
      // declares Add/Remove as built in, refused only at max; reading chosen: no.
      invites: { input: () => ({ start: "" }), guards: onPage(S.WIZARD.INVITE) },
    },

    states: {
      WIZARD: {
        default: S.WIZARD.ACCOUNT,
        // Cancel is handled only under WIZARD, so it is Unhandled (refused) while submitting.
        on: { Cancel: S.CANCELLING },
        states: {
          ACCOUNT: {
            on: {
              Next: {
                target: S.WIZARD.PROFILE,
                guard: ({ memory }) =>
                  (memory.email.error === null && memory.password.error === null) || deny("AccountInvalid"),
                updateMemory: clearError,
              },
            },
          },
          PROFILE: {
            on: {
              Next: {
                target: S.WIZARD.INVITE,
                guard: ({ memory }) =>
                  (memory.name.error === null && memory.role.error === null) || deny("ProfileInvalid"),
                updateMemory: clearError,
              },
              Back: { target: S.WIZARD.ACCOUNT, updateMemory: clearError },
            },
          },
          INVITE: {
            on: {
              Next: {
                target: S.WIZARD.REVIEW,
                guard: ({ memory }) => memory.invites.every((f) => f.error === null) || deny("InvitesInvalid"),
                updateMemory: clearError,
                // V3 RULE 9: Remove never refuses, so raising it cannot refuse the turn (rule 7).
                // UNCLEAR: what a raise's `.from` mapper reads (pre-turn snapshot, or memory after
                // this turn's updateMemory?). Reading chosen: the pre-turn snapshot, like guards
                // and action parameters (Machines O3). Either works here.
                raise: [
                  E.invites.Remove.from(({ memory }) => ({
                    keys: memory.invites.filter((f) => f.value === "").map((f) => f.key),
                  })),
                ],
              },
              Back: { target: S.WIZARD.PROFILE, updateMemory: clearError },
            },
          },
          REVIEW: {
            on: {
              Submit: {
                target: S.SUBMITTING,
                // Every page guarded its own Next, and drafts are editable only on their page, so
                // this re-check exists for the type narrowing of `role` below.
                guard: ({ memory }) => memory.role.value !== null || deny("ProfileInvalid"),
                updateMemory: () => ({ error: null, busyRetries: 0 }),
                actions: [
                  // V3 RULE P2: fenced to the SUBMITTING activation this transition enters.
                  O.Accounts.create.commit(
                    ({ memory }) => ({
                      email: memory.email.value,
                      password: memory.password.value,
                      name: memory.name.value,
                      // FAKED: a non-null assertion. The guard proved it, but a guard does not
                      // narrow the select's input type.
                      role: memory.role.value!,
                      invites: memory.invites.map((f) => f.value).filter((v) => v !== ""),
                    }),
                    {
                      // V3 RULE P4: retries only Busy, resending the admitted input; never retries
                      // notSent, unknown, interrupt or defect. 1 s, 2 s, 4 s, then the last Busy is
                      // the ordinary failure.
                      retry: { on: ["Busy"], schedule: Schedule.exponential("1 second").pipe(Schedule.recurs(3)) },
                      outcomes: {
                        success: E.Created,
                        failure: { EmailTaken: E.EmailTaken, Busy: E.Busy },
                        // Decided sentence 5: fires before each wait, counting from 1.
                        retrying: E.Retrying.from(({ retry }) => ({ n: retry })),
                        // V3 RULE P9 + spec: a call never sent cannot have created the account, so
                        // it is not "UNSURE". (v3's own excerpt maps notSent to Unsure; apps.md
                        // only names unknown / interrupt / defect for UNSURE.)
                        notSent: E.NotSent,
                        unknown: E.Unsure,
                        interrupt: E.Unsure,
                        defect: E.Unsure,
                      },
                    },
                  ),
                ],
              },
              Back: { target: S.WIZARD.INVITE, updateMemory: clearError },
            },
          },
        },
      },

      // V3 RULE 6: every exit is filled, and each filling leaves CANCELLING.
      // V3 RULE P5: `.history` returns to the page Cancel came from; the drafts are root traits.
      CANCELLING: { exits: { Confirmed: S.CANCELLED, Declined: S.WIZARD.history } },

      SUBMITTING: {
        // V3 RULE 8: every outcome of the fenced commit is handled here, unguarded.
        on: {
          Created: S.DONE,
          Retrying: { target: "self", updateMemory: ({ event }) => ({ busyRetries: event.n }) },
          Busy: { target: S.WIZARD.REVIEW, updateMemory: () => ({ error: "Try again later", busyRetries: 0 }) },
          EmailTaken: {
            target: S.WIZARD.ACCOUNT,
            updateMemory: () => ({ error: "That email is registered", busyRetries: 0 }),
          },
          NotSent: {
            target: S.WIZARD.REVIEW,
            updateMemory: () => ({ error: "Couldn't send your signup, try again", busyRetries: 0 }),
          },
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
import { Signup } from "./signup.definition";
import { SignupMachine } from "./signup.machine";

const { S, E } = Signup;
type SignupActor = Actor<typeof SignupMachine>;
type FieldView<V> = { value: V; error: string | null; touched: boolean };

export function SignupWizard() {
  const signup = useActor(SignupMachine);
  const top = useView(signup, (s) => S.root.child(s));
  const page = useView(signup, (s) => S.WIZARD.child(s));
  // While the dialog is open, the page under it is the one `.history` will return to.
  // UNCLEAR: the snapshot exposes no "last active child" of WIZARD while CANCELLING is active
  // (P5 only defines the target). Reading chosen: the dialog renders on its own, without the page.
  switch (top) {
    case "WIZARD":
      return (
        <>
          {page === "ACCOUNT" && <AccountPage signup={signup} />}
          {page === "PROFILE" && <ProfilePage signup={signup} />}
          {page === "INVITE" && <InvitePage signup={signup} />}
          {page === "REVIEW" && <ReviewPage signup={signup} />}
          <button type="button" onClick={() => signup.send(E.Cancel())}>
            Cancel
          </button>
        </>
      );
    case "CANCELLING":
      return <DiscardDialog signup={signup} />;
    case "SUBMITTING":
      return <Submitting signup={signup} />;
    case "UNSURE":
      return <p role="status">Your account may have been created; check your email.</p>;
    case "DONE":
      return <p>Welcome aboard.</p>;
    case "CANCELLED":
      return <p>Signup discarded.</p>;
    default:
      return null;
  }
}

function TextInput(props: {
  label: string;
  type?: string;
  field: FieldView<string>;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {props.label}
      <input type={props.type ?? "text"} value={props.field.value} onChange={(e) => props.onChange(e.target.value)} />
      {props.field.touched && props.field.error && <span className="hint">{props.field.error}</span>}
    </label>
  );
}

function NavButtons({ signup, back }: { signup: SignupActor; back: boolean }) {
  const canNext = useView(signup, (s) => check(s, E.Next())._tag === "Allowed");
  return (
    <div>
      {back && (
        <button type="button" onClick={() => signup.send(E.Back())}>
          Back
        </button>
      )}
      <button type="button" disabled={!canNext} onClick={() => signup.send(E.Next())}>
        Next
      </button>
    </div>
  );
}

function PageError({ signup }: { signup: SignupActor }) {
  const error = useView(signup, (s) => s.memory.error);
  return error ? <p role="alert">{error}</p> : null;
}

function AccountPage({ signup }: { signup: SignupActor }) {
  const email = useView(signup, (s) => s.memory.email);
  const password = useView(signup, (s) => s.memory.password);
  return (
    <section>
      <h2>Account</h2>
      <PageError signup={signup} />
      <TextInput label="Email" field={email} onChange={(value) => signup.send(E.email.Changed({ value }))} />
      <TextInput
        label="Password"
        type="password"
        field={password}
        onChange={(value) => signup.send(E.password.Changed({ value }))}
      />
      <NavButtons signup={signup} back={false} />
    </section>
  );
}

function ProfilePage({ signup }: { signup: SignupActor }) {
  const name = useView(signup, (s) => s.memory.name);
  const role = useView(signup, (s) => s.memory.role);
  return (
    <section>
      <h2>Profile</h2>
      <TextInput label="Name" field={name} onChange={(value) => signup.send(E.name.Changed({ value }))} />
      <label>
        Role
        <select
          value={role.value ?? ""}
          onChange={(e) =>
            signup.send(
              E.role.Changed({ value: e.target.value === "" ? null : (e.target.value as "engineer" | "designer" | "manager") }),
            )
          }
        >
          <option value="">Choose…</option>
          <option value="engineer">Engineer</option>
          <option value="designer">Designer</option>
          <option value="manager">Manager</option>
        </select>
        {role.touched && role.error && <span className="hint">{role.error}</span>}
      </label>
      <NavButtons signup={signup} back />
    </section>
  );
}

function InvitePage({ signup }: { signup: SignupActor }) {
  // V3 RULE 9: instances in order, each with its runtime-minted key.
  const invites = useView(signup, (s) => s.memory.invites);
  const canAdd = useView(signup, (s) => check(s, E.invites.Add())._tag === "Allowed");
  return (
    <section>
      <h2>Invite teammates</h2>
      {invites.map((f) => (
        <div key={f.key}>
          {/* A keystroke for a row removed a moment earlier is Unhandled, never a neighbour's. */}
          <TextInput
            label="Teammate email"
            field={f}
            onChange={(value) => signup.send(E.invites.key(f.key).Changed({ value }))}
          />
          <button type="button" onClick={() => signup.send(E.invites.Remove({ keys: [f.key] }))}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" disabled={!canAdd} onClick={() => signup.send(E.invites.Add())}>
        Add
      </button>
      <NavButtons signup={signup} back />
    </section>
  );
}

function ReviewPage({ signup }: { signup: SignupActor }) {
  const review = useView(signup, (s) => ({
    email: s.memory.email.value,
    name: s.memory.name.value,
    role: s.memory.role.value,
    invites: s.memory.invites.map((f) => f.value),
  }));
  const canSubmit = useView(signup, (s) => check(s, E.Submit())._tag === "Allowed");
  return (
    <section>
      <h2>Review</h2>
      <PageError signup={signup} />
      <dl>
        <dt>Email</dt>
        <dd>{review.email}</dd>
        <dt>Name</dt>
        <dd>{review.name}</dd>
        <dt>Role</dt>
        <dd>{review.role}</dd>
        <dt>Invites</dt>
        <dd>{review.invites.length === 0 ? "None" : review.invites.join(", ")}</dd>
      </dl>
      <button type="button" onClick={() => signup.send(E.Back())}>
        Back
      </button>
      <button type="button" disabled={!canSubmit} onClick={() => signup.send(E.Submit())}>
        Submit
      </button>
    </section>
  );
}

function DiscardDialog({ signup }: { signup: SignupActor }) {
  // The view sends at the subroutine's instance path; nothing outside it can take an exit.
  return (
    <div role="dialog" aria-label="Discard your signup?">
      <p>Discard your signup?</p>
      <button type="button" onClick={() => signup.send(E.CANCELLING.Yes())}>
        Discard
      </button>
      <button type="button" onClick={() => signup.send(E.CANCELLING.No())}>
        Keep
      </button>
    </div>
  );
}

function Submitting({ signup }: { signup: SignupActor }) {
  const retries = useView(signup, (s) => s.memory.busyRetries);
  return <p role="status">{retries > 0 ? `Server busy, retrying (${retries}/3)` : "Creating your account…"}</p>;
}
```


```ts
// signup.story.test.ts
import { check } from "flow-state";
import { story } from "flow-state/testing";
import { Effect, Layer } from "effect";
import { expect, test } from "vitest";
import { AccountsApi, Busy } from "./accounts.operations";
import { Signup } from "./signup.definition";
import { SignupMachine } from "./signup.machine";

const { S, E } = Signup;

// Server truth: always busy. Fresh per run (Testing O3); counts calls for the retry assertion.
let createCalls = 0;
const alwaysBusy = Layer.effect(
  AccountsApi,
  Effect.sync(() => {
    createCalls = 0;
    return {
      create: () =>
        Effect.suspend(() => {
          createCalls += 1;
          return Effect.fail(new Busy());
        }),
    };
  }),
);

// V3 RULE 9: "Stories seed these keys".
// UNCLEAR: no syntax is given for seeding list keys, and Story commands take no callbacks, so a
// Story cannot read a minted key and address it later. Reading chosen: a `keys` option on
// story.machine lists, per list instance, the keys its successive Adds mint.
export const cancelKeepThenBusy = story
  .machine(SignupMachine, {
    id: "Signup/cancel-keep-then-busy",
    fixtures: [alwaysBusy],
    keys: { invites: ["inv-1", "inv-2"] },
  })
  .send(E.email.Changed({ value: "ada@example.com" }))
  .send(E.password.Changed({ value: "correct horse battery" }))
  .send(E.Next())
  .send(E.name.Changed({ value: "Ada" }))
  .send(E.role.Changed({ value: "engineer" }))
  .send(E.Next())
  .send(E.invites.Add()) // inv-1
  .send(E.invites.Add()) // inv-2, left empty
  .send(E.invites.key("inv-1").Changed({ value: "grace@example.com" }))
  .send(E.Next()) // inv-2 is dropped
  .checkpoint("review")
  .send(E.Cancel())
  .checkpoint("confirming")
  .send(E.CANCELLING.No()) // Keep
  .checkpoint("kept")
  .send(E.Submit())
  .process() // first call: Busy → retrying (1/3), waiting 1 s
  .checkpoint("retry1")
  .advance("1 second")
  .process() // second call: Busy → retrying (2/3), waiting 2 s
  .advance("2 seconds")
  .process() // third call: Busy → retrying (3/3), waiting 4 s
  .checkpoint("retry3")
  .advance("4 seconds")
  .process() // fourth call: Busy, retries exhausted → ordinary failure
  .checkpoint("gaveUp");

test("Keep returns to the same page with drafts; Busy retries three times, then Review", async () => {
  const run = await cancelKeepThenBusy.run();
  const { review, confirming, kept, retry1, retry3, gaveUp } = run.checkpoints;

  expect(S.WIZARD.REVIEW.is(review.snapshot)).toBe(true);
  expect(review.snapshot.memory.invites.map((f) => [f.key, f.value])).toEqual([["inv-1", "grace@example.com"]]);

  expect(S.CANCELLING.is(confirming.snapshot)).toBe(true);
  expect(check(confirming.snapshot, E.Next())._tag).toBe("Unhandled");

  expect(S.WIZARD.REVIEW.is(kept.snapshot)).toBe(true);
  expect(kept.snapshot.memory.email.value).toBe("ada@example.com");
  expect(kept.snapshot.memory.invites).toHaveLength(1);

  expect(S.SUBMITTING.is(retry1.snapshot)).toBe(true);
  expect(retry1.snapshot.memory.busyRetries).toBe(1);
  expect(check(retry1.snapshot, E.Cancel())._tag).toBe("Unhandled"); // refused while submitting

  expect(retry3.snapshot.memory.busyRetries).toBe(3);

  expect(S.WIZARD.REVIEW.is(gaveUp.snapshot)).toBe(true);
  expect(gaveUp.snapshot.memory.error).toBe("Try again later");
  expect(createCalls).toBe(4); // one call plus three retries
});
```


### Signup: counts and keywords

| Part | Lines |
| --- | --- |
| Fragments used (`Field` 33 + `Confirm` 4) | 37 |
| Definition | 40 |
| Machine | 116 |
| Components (`SignupWizard` and 9 helpers/pages) | 190 |
| *(Operations 28, Story 72: not counted)* | |

**New keywords used:**

- Fragments: `subroutine`, `exits` (filled on the state), `traits`, `.list({ max })`, `.key(k)`,
  `Add` / `Remove`, `guards` (filled), `optional`, `raise` (with `Remove.from`), and an invented
  Story `keys` option (UNCLEAR).
- Plans: `uncertain`, `notSent`, `retry` (`on`, `schedule`), `retrying`, `.history`.

**Not needed:** `.at`, `resetOn`, `armOn`, `notify`, `callbacks`, `abandoned`, `.pending`.

**Notes:**

- **Placement decides that every draft is a root trait.** CANCELLING is a sibling of WIZARD, so
  anything placed `.at("WIZARD")` would be dropped when the dialog opens. That means every draft is
  alive (and sendable) in every state. To make each field editable only on its own page, every
  filling needs a `canEdit` guard. The list's `Add` and `Remove` have no guard port at all (FAKED).
- **`notSent` goes to a new `NotSent` event**, not to `Unsure`, which is a departure from v3's own
  §3.2 excerpt. A call that was never sent cannot have created the account. apps.md does not cover
  `notSent`; it exists only because P9 adds it.
- **Retry was the cleanest part of the build.** It is one `retry` option and one `Retrying` handler.
  The Story shows four calls, with `busyRetries` going 1 → 3, then Review with "Try again later".

---

## 3. Issue list

```ts
// issues.operations.ts — operation shapes fixed by apps.md; the adapter service is out of scope.
import { resource, transaction } from "flow-state";
import { Data, Effect, Schema, ServiceMap } from "effect";

export const Issue = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  status: Schema.Literals(["open", "closed"]),
  pinned: Schema.Boolean,
});
export const Sort = Schema.Struct({
  field: Schema.Literals(["updated", "title"]),
  dir: Schema.Literals(["asc", "desc"]),
});
export const Status = Schema.Literals(["open", "closed", "all"]);
export const PAGE_SIZE = 20;

export type ListQuery = {
  search: string;
  sort: typeof Sort.Type;
  status: typeof Status.Type;
  page: number;
};
export type IssuePage = { items: ReadonlyArray<typeof Issue.Type>; total: number };

export class PinRejected extends Data.TaggedError("PinRejected")<{}> {}
export class DeleteRejected extends Data.TaggedError("DeleteRejected")<{}> {}

export class IssuesApi extends ServiceMap.Service<
  IssuesApi,
  {
    readonly list: (q: ListQuery) => Effect.Effect<IssuePage>;
    readonly setPinned: (p: { id: string; pinned: boolean }) => Effect.Effect<void, PinRejected>;
    readonly deleteMany: (p: { ids: ReadonlyArray<string> }) => Effect.Effect<void, DeleteRejected>;
  }
>()("IssuesApi") {}

export const Issues = {
  list: resource({
    id: "Issues/list",
    key: (q: ListQuery) => q, // every parameter affects the result
    lookup: (q: ListQuery) =>
      Effect.gen(function* () {
        const api = yield* IssuesApi;
        return yield* api.list(q);
      }),
    staleTime: "0 millis",
    gcTime: "5 minutes",
  }),
  setPinned: transaction({
    id: "Issues/setPinned",
    key: ({ id }: { id: string }) => ({ id }), // pins on different rows are independent
    input: Schema.Struct({ id: Schema.String, pinned: Schema.Boolean }),
    commit: (p) =>
      Effect.gen(function* () {
        const api = yield* IssuesApi;
        return yield* api.setPinned(p);
      }),
    concurrency: "reject", // never reached: the machine refuses a second pin on a row first
  }),
  deleteMany: transaction({
    id: "Issues/deleteMany",
    input: Schema.Struct({ ids: Schema.Array(Schema.String) }),
    commit: (p) =>
      Effect.gen(function* () {
        const api = yield* IssuesApi;
        return yield* api.deleteMany(p);
      }),
    concurrency: "reject",
  }),
};
```


```ts
// issuelist.definition.ts
import { definition, uncertain } from "flow-state";
import { Schema } from "effect";
import { Issues, Sort, Status } from "./issues.operations";
import { Debounce, Flash, HoldToConfirm, Pager, Selection } from "../shared/fragments";

export const IssueList = definition({
  id: "Issues/IssueList",
  // V3 RULE 2.1: a press blocks a second press until released or confirmed: the actor goes *into*
  // the hold. Everything else on the screen is handled at the root, so it keeps working meanwhile.
  states: ["BROWSING", { HOLDING: HoldToConfirm({ hold: "1.5 seconds" }) }, "DELETING"],
  traits: {
    search: Debounce(Schema.String, { wait: "300 millis" }),
    pager: Pager,
    selection: Selection,
    flash: Flash({ length: "3 seconds" }),
  },
  events: {
    SortChanged: { sort: Sort },
    StatusChanged: { status: Status },
    SelectPage: {}, // S2: carries no ids; they come from the snapshot
    Pin: { id: Schema.String }, // the new value comes from the snapshot, not the click
    HoldStart: {},
  },
  internalEvents: {
    RefreshDue: {},
    PinSettled: { id: Schema.String },
    PinFailed: { id: Schema.String },
    PinUnsure: uncertain({ id: Schema.String }),
    Deleted: {},
    DeleteFailed: {},
    DeleteUnsure: uncertain({}),
  },
  memory: {
    sort: Sort,
    status: Status,
    // FAKED: the title of each row with a pin in flight, copied at click time. Outcome mappers see
    // only `{ input, attempt }` (P1) and the input is fixed at `{ id, pinned }`, while the row may
    // have left the page (query change, refetch) by the time the failure lands. "Couldn't pin
    // <title>" therefore needs a host-kept copy, which is exactly the drift D1 warns about.
    pinTitles: Schema.Record(Schema.String, Schema.String),
  },
  initial: () => ({ sort: { field: "updated", dir: "desc" }, status: "open", pinTitles: {} }),
  operations: { Issues },
});
```


```ts
// issuelist.machine.ts
import { deny, machine } from "flow-state";
import { Schedule } from "effect";
import { IssueList } from "./issuelist.definition";
import { PAGE_SIZE, type IssuePage, type ListQuery } from "./issues.operations";

type Snap = typeof IssueList.Snapshot.Type;

export const IssueListMachine = machine(IssueList, ({ S, E, O }) => {
  // Root traits are present in every handler (V3 RULE 1), so this helper may read them.
  const listQuery = ({ memory }: Pick<Snap, "memory">): ListQuery => ({
    search: memory.search.applied,
    sort: memory.sort,
    status: memory.status,
    page: memory.pager.page,
  });
  const page = ({ activities }: Pick<Snap, "activities">): IssuePage | undefined => activities.issues?.data;
  const rowOf = (g: Pick<Snap, "activities">, id: string) => page(g)?.items.find((i) => i.id === id);
  const refetch = O.Issues.list.refetch(listQuery);
  const forget = (id: string, titles: Readonly<Record<string, string>>) => {
    const { [id]: _gone, ...rest } = titles;
    return rest;
  };
  // Every non-success pin outcome: the row reverts (Operations O5 removes the optimistic value for
  // failure, defect, interrupt and pre-invocation cancellation) and the flash names the row.
  const pinFlash = E.flash.Show.from(({ memory, event }) => ({
    message: `Couldn't pin ${memory.pinTitles[event.id] ?? "issue"}`,
  }));
  const hasSelection = ({ memory }: Pick<Snap, "memory">) => memory.selection.ids.length > 0 || deny("NothingSelected");

  return {
    default: S.BROWSING,

    // Refresh: every 30 s while the screen (the actor) is open. Root schedule, armed on entry.
    // UNCLEAR: P6 places a trait's schedules at `s.schedules.<instance>.<name>` but never says where
    // the host's own schedules sit, or whether a host schedule name may equal a trait instance name.
    // Reading chosen: `s.schedules.refresh`, sharing the instance namespace (a collision rejects).
    schedules: { refresh: { schedule: Schedule.spaced("30 seconds"), send: E.RefreshDue } },

    activities: { issues: O.Issues.list.subscribe(listQuery) },

    traits: {
      search: { input: () => ({ start: "" }) },
      pager: {
        // V3 RULE 1: resetOn re-activates the trait (page 1) inside the turn that changes the query.
        resetOn: ({ memory }) => [memory.search.applied, memory.sort, memory.status],
        guards: {
          hasNext: ({ memory, activities }) =>
            memory.pager.page * PAGE_SIZE < (activities.issues?.data?.total ?? 0) || deny("LastPage"),
        },
      },
      selection: {
        // Includes the page, so it also sees the pager's reset in the same turn (V3 RULE 1).
        resetOn: listQuery,
        guards: { canToggle: (g) => rowOf(g, g.event.id) !== undefined || deny("NotOnPage") },
      },
      flash: {},
    },

    on: {
      SortChanged: { target: "self", updateMemory: ({ event }) => ({ sort: event.sort }) },
      StatusChanged: { target: "self", updateMemory: ({ event }) => ({ status: event.status }) },

      // S2: select all on this page; the ids come from the snapshot, never from the click.
      // V3 RULE 2: SelectAll is a hostEvent, so this raise is the only way in.
      SelectPage: {
        target: "self",
        raise: [E.selection.SelectAll.from((g) => ({ ids: page(g)?.items.map((i) => i.id) ?? [] }))],
      },

      Pin: {
        target: "self",
        // V3 RULE 5: an array of guards, all must pass.
        guard: [
          (g) => rowOf(g, g.event.id) !== undefined || deny("NotOnPage"),
          // V3 RULE P3: `.pending` reads an outstanding call from the pre-turn snapshot.
          (g) => !O.Issues.setPinned.pending(g, { id: g.event.id }) || deny("PinInFlight"),
        ],
        updateMemory: (g) => ({ pinTitles: { ...g.memory.pinTitles, [g.event.id]: rowOf(g, g.event.id)!.title } }),
        actions: [
          // V3 RULE P2: a "self" commit written at the root is fenced to the root, so it lives as
          // long as the actor and its outcomes are handled at the root, in every state (rule 8).
          O.Issues.setPinned.commit((g) => ({ id: g.event.id, pinned: !rowOf(g, g.event.id)!.pinned }), {
            // UNCLEAR: Operations O3 names `optimistic?` but never shows its shape. Reading chosen:
            // a list of setData writes, as O5 defines setData; `key` is the resource's params.
            optimistic: [
              O.Issues.list.setData((g) => {
                const pinned = !rowOf(g, g.event.id)!.pinned;
                return {
                  key: listQuery(g),
                  data: (current) =>
                    current && {
                      ...current,
                      items: current.items.map((i) => (i.id === g.event.id ? { ...i, pinned } : i)),
                    },
                };
              }),
            ],
            // UNCLEAR: P1 says every mapper "also receives { input, attempt }" without saying how:
            // merged into one argument (v3's `retrying` mapper destructures `({ retry })`), or a
            // second argument after the value. Reading chosen: a second argument.
            outcomes: {
              success: E.PinSettled.from((_value, { input }) => ({ id: input.id })),
              failure: { PinRejected: E.PinFailed.from((_error, { input }) => ({ id: input.id })) },
              notSent: E.PinFailed.from((_none, { input }) => ({ id: input.id })),
              // V3 RULE P9: these may only target the `uncertain` PinUnsure.
              unknown: E.PinUnsure.from((_attempt, { input }) => ({ id: input.id })),
              interrupt: E.PinUnsure.from((_cause, { input }) => ({ id: input.id })),
              defect: E.PinUnsure.from((_cause, { input }) => ({ id: input.id })),
            },
          }),
        ],
      },
      PinSettled: { target: "self", updateMemory: ({ event, memory }) => ({ pinTitles: forget(event.id, memory.pinTitles) }) },
      PinFailed: {
        target: "self",
        updateMemory: ({ event, memory }) => ({ pinTitles: forget(event.id, memory.pinTitles) }),
        // UNCLEAR (raise mapper input, as in signup): pre-turn memory is read, so the title is
        // still there although this turn forgets it. If raises read post-update memory, the order
        // would have to be reversed by hand.
        raise: [pinFlash],
      },
      // S3: `unknown` (and interrupt/defect after invocation) — flash and refetch.
      // FAKED: the row does NOT revert at once. Operations O5 keeps an unknown commit's optimistic
      // value and invalidates the entry "until a confirming lookup lands"; v3 leaves an immediate
      // revert as open question 1. The row shows the clicked value until this refetch lands, then
      // shows the server's truth (which may or may not be the new value).
      PinUnsure: {
        target: "self",
        updateMemory: ({ event, memory }) => ({ pinTitles: forget(event.id, memory.pinTitles) }),
        raise: [pinFlash],
        actions: [refetch], // joins the refetch the invalidation already started, if any
      },

      // V3 RULE 8: a timer-fired handler, unguarded.
      RefreshDue: { target: "self", actions: [refetch] },
    },

    states: {
      BROWSING: {
        // Refused when nothing is selected; Unhandled while HOLDING or DELETING.
        on: { HoldStart: { target: S.HOLDING, guard: hasSelection } },
      },

      // UNCLEAR: rule 4 forbids the host handling a fragment's events, but v3 never says whether
      // the host's *own* root handlers still run while the actor is inside a subroutine state (an
      // ordinary Machines O2 fallthrough from the subroutine's leaf to the root). Reading chosen:
      // yes, so pins, paging, search, refresh and pin outcomes work during a hold. If not, rule 8
      // breaks: PinFailed and RefreshDue could arrive in HOLDING with no handler.
      // V3 RULE 6: both exits filled; each filling leaves HOLDING.
      // V3 RULE 8: an exit filling ends in an unguarded alternative.
      HOLDING: {
        exits: {
          Confirmed: [
            {
              // The query (and so the selection) may have changed during the hold.
              target: S.DELETING,
              guard: hasSelection,
              actions: [
                // V3 RULE P2: fenced to the DELETING activation this filling enters.
                O.Issues.deleteMany.commit(({ memory }) => ({ ids: memory.selection.ids }), {
                  outcomes: {
                    success: E.Deleted,
                    failure: { DeleteRejected: E.DeleteFailed },
                    notSent: E.DeleteFailed,
                    // V3 RULE P9: interrupt and defect must target an uncertain event too, so they
                    // share "Delete may have happened" with unknown (apps.md names only unknown).
                    unknown: E.DeleteUnsure,
                    interrupt: E.DeleteUnsure,
                    defect: E.DeleteUnsure,
                  },
                }),
              ],
            },
            { target: S.BROWSING },
          ],
          Cancelled: S.BROWSING,
        },
      },

      DELETING: {
        // V3 RULE 8: every outcome handled here, unguarded. Pins, paging, search etc. keep working
        // through the root handlers.
        on: {
          Deleted: { target: S.BROWSING, raise: [E.selection.Clear], actions: [refetch] },
          DeleteFailed: { target: S.BROWSING, raise: [E.flash.Show.from(() => ({ message: "Delete failed" }))] },
          DeleteUnsure: {
            target: S.BROWSING,
            raise: [E.flash.Show.from(() => ({ message: "Delete may have happened" }))],
            actions: [refetch],
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
import { useActor, useNow, useView } from "flow-state/react";
import { IssueList } from "./issuelist.definition";
import { IssueListMachine } from "./issuelist.machine";

const { S, E } = IssueList;
type IssueListActor = Actor<typeof IssueListMachine>;

export function IssueListScreen() {
  const list = useActor(IssueListMachine);
  const draft = useView(list, (s) => s.memory.search.draft);
  const sort = useView(list, (s) => s.memory.sort);
  const status = useView(list, (s) => s.memory.status);
  const pageNo = useView(list, (s) => s.memory.pager.page);
  const lane = useView(list, (s) => s.activities.issues);
  const flash = useView(list, (s) => s.memory.flash.message);
  const canPrev = useView(list, (s) => check(s, E.pager.Previous())._tag === "Allowed");
  const canNext = useView(list, (s) => check(s, E.pager.Next())._tag === "Allowed");
  const canSelectPage = useView(list, (s) => (s.activities.issues?.data?.items.length ?? 0) > 0);

  return (
    <main>
      {flash && <p role="status">{flash}</p>}
      <input
        type="search"
        placeholder="Search issues"
        value={draft}
        onChange={(e) => list.send(E.search.Changed({ value: e.target.value }))}
      />
      <select
        value={`${sort.field}:${sort.dir}`}
        onChange={(e) => {
          const [field, dir] = e.target.value.split(":") as ["updated" | "title", "asc" | "desc"];
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
        onChange={(e) => list.send(E.StatusChanged({ status: e.target.value as "open" | "closed" | "all" }))}
      >
        <option value="open">Open</option>
        <option value="closed">Closed</option>
        <option value="all">All</option>
      </select>

      <button type="button" disabled={!canSelectPage} onClick={() => list.send(E.SelectPage())}>
        Select all on this page
      </button>
      <HoldToDelete list={list} />

      {lane === undefined || lane.data === undefined ? (
        <p>Loading…</p>
      ) : (
        <table>
          <tbody>
            {lane.data.items.map((issue) => (
              <IssueRow key={issue.id} list={list} id={issue.id} title={issue.title} pinned={issue.pinned} />
            ))}
          </tbody>
        </table>
      )}

      <nav>
        <button type="button" disabled={!canPrev} onClick={() => list.send(E.pager.Previous())}>
          Previous
        </button>
        <span>Page {pageNo}</span>
        <button type="button" disabled={!canNext} onClick={() => list.send(E.pager.Next())}>
          Next
        </button>
      </nav>
    </main>
  );
}

function IssueRow(props: { list: IssueListActor; id: string; title: string; pinned: boolean }) {
  const { list, id } = props;
  const selected = useView(list, (s) => s.memory.selection.ids.includes(id));
  const canPin = useView(list, (s) => check(s, E.Pin({ id }))._tag === "Allowed");
  return (
    <tr>
      <td>
        <input type="checkbox" checked={selected} onChange={() => list.send(E.selection.Toggle({ id }))} />
      </td>
      <td>{props.title}</td>
      <td>
        {/* The shown value already includes the optimistic pin (Operations O5). */}
        <button type="button" aria-pressed={props.pinned} disabled={!canPin} onClick={() => list.send(E.Pin({ id }))}>
          {props.pinned ? "Unpin" : "Pin"}
        </button>
      </td>
    </tr>
  );
}

function HoldToDelete({ list }: { list: IssueListActor }) {
  const now = useNow("100 millis");
  const count = useView(list, (s) => s.memory.selection.ids.length);
  const canStart = useView(list, (s) => check(s, E.HoldStart())._tag === "Allowed");
  const holding = useView(list, (s) => S.HOLDING.is(s));
  const deleting = useView(list, (s) => S.DELETING.is(s));
  // UNCLEAR: P6 / decided sentence 4 place only *trait* schedules (`s.schedules.<instance>.<name>`).
  // A subroutine's schedules are not placed anywhere. Reading chosen: the same shape under the
  // subroutine's state name, undefined while inactive.
  const heldDue = useView(list, (s) => s.schedules.HOLDING?.held?.dueAt);
  const progress = heldDue === undefined ? 0 : Math.min(1, 1 - (heldDue - now) / 1500);
  const release = () => {
    if (holding) list.send(E.HOLDING.Release());
  };
  return (
    <button
      type="button"
      disabled={!canStart && !holding}
      onPointerDown={() => list.send(E.HoldStart())}
      onPointerUp={release}
      onPointerLeave={release}
      style={{ backgroundSize: `${progress * 100}% 100%` }}
    >
      {deleting ? "Deleting…" : holding ? "Keep holding…" : `Hold to delete ${count} selected`}
    </button>
  );
}
```


```ts
// issuelist.story.test.ts
import { check } from "flow-state";
import { story } from "flow-state/testing";
import { Effect, Layer } from "effect";
import { expect, test } from "vitest";
import { IssueList } from "./issuelist.definition";
import { IssueListMachine } from "./issuelist.machine";
import { IssuesApi, PAGE_SIZE, PinRejected, type ListQuery } from "./issues.operations";

const { S, E } = IssueList;

// Stateful server truth, fresh per run (Testing O3): 25 open issues; i1 is the most recently
// updated. Pinning i3 is slow and then rejected; every other pin succeeds.
const issuesFixture = Layer.effect(
  IssuesApi,
  Effect.sync(() => {
    const rows = Array.from({ length: 25 }, (_, n) => ({
      id: `i${n + 1}`,
      title: `Issue ${n + 1}`,
      status: "open" as const,
      pinned: false,
      updated: 1000 - n,
    }));
    const list = (q: ListQuery) =>
      Effect.sync(() => {
        const matching = rows
          .filter((r) => q.status === "all" || r.status === q.status)
          .filter((r) => r.title.toLowerCase().includes(q.search.toLowerCase()))
          .sort((a, b) => {
            const order = q.sort.field === "title" ? a.title.localeCompare(b.title) : a.updated - b.updated;
            return q.sort.dir === "asc" ? order : -order;
          });
        const start = (q.page - 1) * PAGE_SIZE;
        return {
          items: matching.slice(start, start + PAGE_SIZE).map(({ updated: _u, ...issue }) => issue),
          total: matching.length,
        };
      });
    return {
      list,
      setPinned: ({ id, pinned }: { id: string; pinned: boolean }) =>
        id === "i3"
          ? Effect.sleep("1 second").pipe(Effect.andThen(Effect.fail(new PinRejected())))
          : Effect.sync(() => {
              rows.find((r) => r.id === id)!.pinned = pinned;
            }),
      deleteMany: ({ ids }: { ids: ReadonlyArray<string> }) =>
        Effect.sync(() => {
          for (const id of ids) rows.splice(rows.findIndex((r) => r.id === id), 1);
        }),
    };
  }),
);

export const browsePinSelectDelete = story
  .machine(IssueListMachine, { id: "IssueList/pin-select-delete", fixtures: [issuesFixture] })
  .process() // first page lands
  .checkpoint("loaded")
  .send(E.Pin({ id: "i3" }))
  .checkpoint("pinning")
  .advance("1 second")
  .process() // PinRejected
  .checkpoint("pinFailed")
  .advance("3 seconds")
  .process() // flash expires
  .checkpoint("flashGone")
  .send(E.SelectPage())
  .checkpoint("selected")
  .send(E.pager.Next())
  .process()
  .checkpoint("page2")
  .send(E.SortChanged({ sort: { field: "title", dir: "asc" } }))
  .process()
  .checkpoint("sorted")
  .send(E.SelectPage())
  .send(E.HoldStart())
  .checkpoint("holding")
  .advance("1.5 seconds")
  .process() // Held → Confirmed → DELETING → Deleted → BROWSING, refetch lands
  .checkpoint("deleted")
  .send(E.search.Changed({ value: "Issue 2" }))
  .advance("299 millis")
  .process()
  .checkpoint("typing")
  .advance("1 millis")
  .process()
  .checkpoint("searched");

test("optimistic pin reverts with a flash; selection resets with the query; hold deletes", async () => {
  const run = await browsePinSelectDelete.run();
  const c = run.checkpoints;
  const row = (snap: typeof c.loaded.snapshot, id: string) =>
    snap.activities.issues?.data?.items.find((i) => i.id === id);

  expect(c.loaded.snapshot.activities.issues?.data?.total).toBe(25);
  expect(check(c.loaded.snapshot, E.pager.Previous())._tag).toBe("Denied");

  // Optimistic: the row shows the new value at once; a second click on it is refused, others not.
  expect(row(c.pinning.snapshot, "i3")?.pinned).toBe(true);
  expect(check(c.pinning.snapshot, E.Pin({ id: "i3" }))._tag).toBe("Denied");
  expect(check(c.pinning.snapshot, E.Pin({ id: "i4" }))._tag).toBe("Allowed");

  // Failure: reverted, flash for 3 s.
  expect(row(c.pinFailed.snapshot, "i3")?.pinned).toBe(false);
  expect(c.pinFailed.snapshot.memory.flash.message).toBe("Couldn't pin Issue 3");
  expect(c.pinFailed.snapshot.memory.pinTitles).toEqual({});
  expect(c.flashGone.snapshot.memory.flash.message).toBeNull();

  // S2: select-all took the 20 ids of the page in the snapshot.
  expect(c.selected.snapshot.memory.selection.ids).toHaveLength(20);

  // Page change clears the selection; sort change resets to page 1 and clears it again.
  expect(c.page2.snapshot.memory.pager.page).toBe(2);
  expect(c.page2.snapshot.memory.selection.ids).toEqual([]);
  expect(check(c.page2.snapshot, E.pager.Next())._tag).toBe("Denied");
  expect(c.sorted.snapshot.memory.pager.page).toBe(1);

  // Hold-to-confirm, then delete: selection cleared, list refetched.
  expect(S.HOLDING.is(c.holding.snapshot)).toBe(true);
  expect(S.BROWSING.is(c.deleted.snapshot)).toBe(true);
  expect(c.deleted.snapshot.memory.selection.ids).toEqual([]);
  expect(c.deleted.snapshot.activities.issues?.data?.total).toBe(5);

  // Search applies 300 ms after the last keystroke.
  expect(c.typing.snapshot.memory.search.applied).toBe("");
  expect(c.searched.snapshot.memory.search.applied).toBe("Issue 2");
});
```


### Issue list: counts and keywords

| Part | Lines |
| --- | --- |
| Fragments used (`Debounce` 20 + `Pager` 25 + `Selection` 24 + `Flash` 17 + `HoldToConfirm` 15) | 101 |
| Definition | 37 |
| Machine | 138 |
| Components (`IssueListScreen`, `IssueRow`, `HoldToDelete`) | 115 |
| *(Operations 65, Story 107: not counted)* | |

**New keywords used:**

- Fragments: `trait`, `subroutine`, `exits` (with guarded alternatives and actions), `traits`,
  `hostEvents`, fragment `internalEvents`, `guards` (a required one, an optional one, and a host
  array), `optional`, `raise` (with `.from` over `activities`), `resetOn`.
- Plans: `armOn`, `s.schedules`, `dueAt`, `.pending`, `uncertain`, `notSent`, and the mapper's
  `{ input }` (P1). `optimistic` is an existing word.

**Not needed:** `.at`, `.list`, `callbacks`, `notify`, `abandoned`, `retry`, `.history`.

**Notes:**

- **`resetOn` removed every "back to page 1 / clear selection" raise.** Page and selection resets
  appear nowhere in the handlers. The pager's reset is visible to the selection in the same turn
  (rule 1), which the Story checks.
- **Spec fix S3 cannot be met exactly.** On `unknown`, the row keeps its optimistic value until the
  refetch lands (Operations O5 and v3 open question 1). The flash and the refetch happen at once.
  The revert waits for the refetch, and if the server did pin the row it is not a revert at all.
- **P9 forces `interrupt` and `defect` onto an `uncertain` event.** For bulk delete they therefore
  share "Delete may have happened" with `unknown`. apps.md names only `unknown` there, so this is a
  reading, not a spec quote.
- **Pin titles are copied into memory** (FAKED). Outcome mappers see only `{ input, attempt }`,
  and the input is fixed at `{ id, pinned }`.

---

## Building from v3

### What was clear

- **Picking a kind.** "Does the actor have it, or go into it?" settled every fragment immediately:
  - field, countdown, debounce, pager, selection and flash are traits;
  - confirm and hold-to-confirm are subroutines.
- **Placement equals lifetime (rule 1).** `.at("TWO_FACTOR")` versus root gave S1's split (lockout
  kept, code and cooldown dropped) with no reset code. Root traits gave the wizard's drafts.
- **One filling block per instance**, and the split between the definition (placement) and the
  machine (filling). I was never unsure where something went.
- **The three sender lists (rule 2).** `SelectAll` as a `hostEvent` is exactly what S2 needs. The
  view cannot send ids at all.
- **Rule 8 and P2 fencing.** They give a mechanical checklist. For each commit I listed the state it
  enters and handled every outcome there, ending unguarded. For a root `"self"` commit, "fenced to
  the root" settled pins in flight during a hold.
- **P4 `retry`, P5 `.history`, P7 `armOn` and decided sentences 2–5.** Each one mapped to a single
  line of app code.
- **`resetOn` ordering (rule 1).** It is stated precisely enough to rely on: pager first, then the
  selection sees the new page in the same turn.

### Every UNCLEAR item

These are all the `// UNCLEAR:` markers, with the reading I chose.

1. **`operations` shape** (auth.operations.ts). Machines O1 says `operations` is "a flat record of
   operation handles". v3 writes `operations: { Auth }` with `O.Auth.verifyCode`.
   - Chosen: one level of namespace grouping is allowed.
2. **Required port syntax** (fragments, `Pager`). v3 only ever shows `optional()`; it never spells a
   required guard or callback.
   - Chosen: a bare payload record (`{}`) means required.
3. **Typing helpers and shared handlers declared outside a node** (sign-in machine, twice). v3's own
   `isLockedOut = ({ state }) => …` and `resend = {…}` have no contextual type. Rule 1 types `.at`
   slices only in handlers "declared at or below X", and no plan names a guard-input type.
   - Chosen: helpers take slices of `typeof Def.Snapshot.Type`, and shared handlers are checked at
     the place they are used.
   - Anything that reads a `.at` slice is written inline.
4. **`S.X.is(state)` versus `token.is(snapshot)`** (sign-in and signup machines). Machines O2 types
   `is` on a snapshot. The v3 rule writes `is(state)` in guards.
   - Chosen: `is` accepts either.
5. **How P1 hands `{ input, attempt }` to a mapper** (issue list machine). The value could be merged
   into one argument (v3's `retrying` mapper destructures `({ retry })`), or passed as a second
   argument.
   - Chosen: a second argument, `(value, { input, attempt })`.
6. **How Stories seed list keys** (signup Story). Rule 9 says Stories seed keys but gives no syntax.
   Story commands take no callbacks, so a Story can't read a minted key.
   - Chosen: an invented `keys: { invites: [...] }` option on `story.machine`.
7. **Where a subroutine's schedules appear** (`IssueListScreen`). P6 and decided sentence 4 place
   only trait schedules.
   - Chosen: `s.schedules.HOLDING.held`.
8. **Where the host's own schedules appear**, and whether their names share a namespace with trait
   instances (issue list machine).
   - Chosen: `s.schedules.refresh`, in the same namespace as the instances.
9. **Syntax for nesting (rule 10)** (fragments, `Flash`). No example shows a fragment placing and
   filling a child fragment.
   - Chosen: don't nest, which led to a FAKED duplicate of `Countdown` inside `Flash`.
10. **A trait without memory** (`Countdown`). It is not stated whether `s.memory.<instance>` exists.
    - Chosen: no memory slice.
11. **Can a raised `hostEvent` arm an `armOn` schedule?** (`Countdown`). P7 says "a transition …
    is accepted".
    - Chosen: yes, a raised transition fused into the turn counts.
12. **A subroutine with no states** (`Confirm`). The §2.1 table says subroutines have states of
    their own, but v3's own `Confirm` declares none.
    - Chosen: states are optional, and such a subroutine is a leaf.
13. **Inline guards inside a fragment** (`Pager.Previous`). v3 shows fragment transitions guarded
    only by declared ports.
    - Chosen: a fragment may guard over its own memory.
14. **Guarding a list's `Add` and `Remove`** (signup machine).
    - Chosen: there is no port for it; only `max` refuses. This led to a FAKED entry.
15. **What a raise's `.from` mapper reads** (signup and issue list machines). It could be the
    pre-turn snapshot, or memory after this turn's `updateMemory`. This matters for the pin flash,
    which reads a title that the same turn forgets.
    - Chosen: the pre-turn snapshot, like guards and action parameters.
16. **Do the host's root handlers run while the actor is inside a subroutine state?** (issue list
    machine).
    - Chosen: yes, by ordinary fallthrough. Otherwise rule 8 fails for root outcomes arriving
      during a hold.
17. **The shape of the `optimistic` commit option** (issue list machine). This is a plan gap
    (Operations O3 names it but never shows it), not a v3 one. The same goes for `setData`'s `key`:
    params or canonical key?
    - Chosen: a list of `setData` writes keyed by params.
18. **Does a Story `send` run its own turn?** (sign-in Story). This is a plan gap: v3 writes
    `.send(...).process()`.
    - Chosen: send runs the turn, and `process()` drains operation work.
19. **Can the view see WIZARD's remembered child while CANCELLING is active?** (`SignupWizard`).
    P5 defines only the target.
    - Chosen: the dialog renders without the page underneath.

### What strained

- **Host memory for step-scoped policy (sign-in).** `wrongAttempts` and `lockedChallenge` are reset
  by hand on five paths. That makes the machine 148 lines against 53 lines of fragments.
- **A late strike can't act when it settles.** `abandoned` cannot raise or move (P10). So a third
  wrong code that settles after Back-and-return only locks at the next Submit or entry. I added a
  `canEdit` refusal so the user can't type meanwhile, but the countdown isn't shown until Submit.
  This is v3 open question 3, and it is visible behaviour.
- **One lockout slot.** Per-challenge lockouts need list keys chosen by the author (open question 2).
- **Root placement for drafts.** It follows from the dialog being a sibling, and it forces:
  - a page guard on every field filling;
  - leaving the list's `Add` and `Remove` sendable from any page (FAKED).
- **Mappers see only `{ input, attempt }`.** "Couldn't pin \<title>" needs a title copied into host
  memory at click time (FAKED, a small D1 drift).
- **P9 routing.** `interrupt` and `defect` must go to an `uncertain` event. For bulk delete that
  meant choosing "may have happened" for them as well.
- **`Flash` duplicates `Countdown`'s timer**, because the nesting syntax is missing.
- **Guards don't narrow selects.** The signup create input needs `role.value!` after a guard proved
  it non-null (FAKED).

### apps.md behaviour I could not implement exactly

1. **S3, an immediate revert on an `unknown` pin.** It is not possible in v3. The row reverts only
   when the confirming refetch lands (Operations O5; v3 open question 1). The flash and the refetch
   are immediate.
2. **Sign-in, a late third wrong code that settles while the user is back in ENTERING.** It refuses
   typing at once, but the 5-minute lockout and its countdown start only at the next Submit (or
   re-entry). The clock starts late by however long the user waits.
3. **Signup, "Add appends an empty field" on the Invite page.** Add is accepted on every page and
   while submitting. It is harmless, but the rule is a view convention.
4. Everything else in apps.md, including S1 and S2, is implemented and covered by the three Stories.
   - The sign-in Story covers lockout, resend while locked out, and Back with re-entry to the
     still-running lock.
   - The signup Story covers drafts and list keys, Cancel → Keep returning to the same page, and
     three Busy retries followed by Review.
   - The issue list Story covers the optimistic pin reverting with a 3-second flash, a second click
     refused, select-all from the snapshot, page and sort resets, hold-to-delete, and the 300 ms
     debounce.
