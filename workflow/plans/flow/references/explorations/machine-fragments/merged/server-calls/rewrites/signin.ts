// sign-in (v4 3.1), rewritten with calls-next in the in-machine-calls syntax. signin.operations.ts is unchanged except the key records
// (`key: (i) => ({ challengeId: i.challengeId })`, Operations O1) the builder wrote as scalars.
// ───────────────────────────────────────────────── signin.definition.ts
import { Duration, Schema } from "effect"
import { definition, deny, Flow, machine } from "flow-state"
import { Auth } from "./signin.operations"

export const LIMIT = 3
export const LOCK_MS = Duration.toMillis(Duration.minutes(5))
export const sixDigits = (v: string) => /^\d{6}$/.test(v) || deny("CodeFormat", { length: 6 })

export const SignIn = definition({
  id: "Auth/SignIn",
  states: ["PASSWORD", { TWO_FACTOR: Flow.state(["ENTERING", "VERIFYING", "LOCKED_OUT"]) }, "SIGNED_IN"],  // INVENTED (v4 gap, as the builder): Flow.state without traits
  events: { PasswordAccepted: { challengeId: Schema.String }, CodeChanged: { value: Schema.String }, Submit: {}, Resend: {}, BackToPassword: {} },
  internalEvents: {
    CodeAccepted: {}, CodeWrong: { challengeId: Schema.String }, CodeExpired: {}, CodeUnchecked: Flow.uncertain({}),
    ResendSent: {}, ResendRefused: {},
    StopWaiting: {}, Unlock: { key: Schema.String }, CooldownDone: {},
  },
  memory: {
    challengeId: Flow.initial(Schema.String, ""),
    code: Flow.initial(Schema.String, ""),
    codeTouched: Flow.initial(Schema.Boolean, false),
    error: Flow.initial(Schema.NullOr(Schema.String), null),
    cooling: Flow.initial(Schema.Boolean, false),
    strikes: Flow.initial(Schema.Record(Schema.String, Schema.Int), {}),
    lockedUntil: Flow.initial(Schema.Record(Schema.String, Schema.Number), {}),
  },
  operations: { Auth },
})

// ───────────────────────────────────────────────── signin.machine.ts
type Memory = typeof SignIn.Memory.Type
const strikesOf = (m: Memory, id: string) => m.strikes[id] ?? 0
const isLocked = (m: Memory, id: string) => m.lockedUntil[id] !== undefined
const third = (m: Memory, id: string) => strikesOf(m, id) + 1 >= LIMIT
const strike = (m: Memory, id: string, now: number): Partial<Memory> => {
  if (isLocked(m, id)) return {}
  const n = strikesOf(m, id) + 1
  return n >= LIMIT ? { strikes: { ...m.strikes, [id]: n }, lockedUntil: { ...m.lockedUntil, [id]: now + LOCK_MS } } : { strikes: { ...m.strikes, [id]: n } }
}
const unlock = (m: Memory, id: string): Partial<Memory> => {
  const { [id]: _s, ...strikes } = m.strikes
  const { [id]: _l, ...lockedUntil } = m.lockedUntil
  return { strikes, lockedUntil }
}
const fresh = { code: "", codeTouched: false }

export const SignInMachine = machine(SignIn, ({ S, E, O }) => {
  const challenge = ({ memory }) => ({ challengeId: memory.challengeId })
  const verify = O.Auth.verifyCode.commit(({ memory }) => ({ challengeId: memory.challengeId, code: memory.code }), {
    outcomes: {
      success: E.CodeAccepted,
      failure: { WrongCode: E.CodeWrong.from((_r, { input }) => ({ challengeId: input.challengeId })), Expired: E.CodeExpired, NotSent: E.CodeUnchecked },   // the call's own challenge; NotSent: reject (rule 8)
      unknown: E.CodeUnchecked,
    },
  })
  const resend = O.Auth.resendCode.commit(({ memory }) => ({ challengeId: memory.challengeId }), {
    outcomes: { success: E.ResendSent, failure: { Throttled: E.ResendRefused, NotSent: E.ResendRefused }, unknown: E.ResendSent },   // unknown: the SMS may be on its way
  })
  const notSignedIn = ({ state }) => !S.SIGNED_IN.is(state) || deny("SignedIn")
  return {
    default: S.PASSWORD,

    schedules: {
      cooldown: { schedule: "30 seconds", send: E.CooldownDone, armOn: [E.Resend] },
      // ← NEW keyed schedule: one timer per locked challenge, armed when its key appears, cancelled when it leaves.
      unlock: { keys: ({ memory }) => Object.keys(memory.lockedUntil), schedule: ({ key, memory, now }) => Duration.millis(Math.max(0, memory.lockedUntil[key] - now)), send: E.Unlock.from(({ key }) => ({ key })) },
    },

    on: {
      // Late (rule 2): VERIFYING was left by Back or the soft timeout. The strike goes to the call's own challenge.
      CodeWrong: [
        {
          target: S.TWO_FACTOR.LOCKED_OUT,   // ENTERING owns no call, so a late turn may move it (rule 3)
          guard: [S.TWO_FACTOR.ENTERING, ({ event, memory }) => event.challengeId === memory.challengeId || deny("OtherChallenge"), ({ event, memory }) => third(memory, event.challengeId) || deny("TriesLeft")],
          updateMemory: ({ event, memory, now }) => ({ ...strike(memory, event.challengeId, now), ...fresh, error: null }),
        },
        { target: "self", guard: notSignedIn, updateMemory: ({ event, memory, now }) => strike(memory, event.challengeId, now) },
        { target: "self" },                  // signed in: ignored
      ],
      CodeAccepted: { target: "self" },      // late: the user was told "couldn't check" (v4's accepted cost)
      CodeUnchecked: { target: "self" },
      ResendSent: { target: "self" },        // late: TWO_FACTOR was left
      CodeExpired: { target: "self" }, ResendRefused: { target: "self" },   // late failures: explicit ignores (rule 8, D13)
      Unlock: [
        { target: S.TWO_FACTOR.ENTERING, guard: [S.TWO_FACTOR.LOCKED_OUT, ({ event, memory }) => event.key === memory.challengeId || deny("OtherChallenge")], updateMemory: ({ event, memory }) => ({ ...unlock(memory, event.key), error: null }) },
        { target: "self", updateMemory: ({ event, memory }) => unlock(memory, event.key) },
      ],
      CooldownDone: { target: "self", updateMemory: () => ({ cooling: false }) },
    },

    states: {
      PASSWORD: {
        on: {
          PasswordAccepted: [
            { target: S.TWO_FACTOR.LOCKED_OUT, guard: ({ event, memory }) => isLocked(memory, event.challengeId) || deny("NotLocked"), updateMemory: ({ event }) => ({ challengeId: event.challengeId, error: null, ...fresh }) },
            { target: S.TWO_FACTOR, updateMemory: ({ event }) => ({ challengeId: event.challengeId, error: null, ...fresh }) },
          ],
        },
      },

      TWO_FACTOR: {
        default: S.TWO_FACTOR.ENTERING,
        on: {
          BackToPassword: S.PASSWORD,
          CodeChanged: { target: "self", guard: ({ state }) => !S.TWO_FACTOR.LOCKED_OUT.is(state) || deny("LockedOut"), updateMemory: ({ event }) => ({ code: event.value, codeTouched: true }) },
          Resend: {
            target: "self",
            guard: [({ state }) => !S.TWO_FACTOR.VERIFYING.is(state) || deny("Checking"), ({ memory }) => !memory.cooling || deny("CoolingDown")],
            updateMemory: () => ({ cooling: true }),
            actions: [resend],
          },
          ResendSent: { target: "self" },
          ResendRefused: { target: "self", updateMemory: () => ({ error: "Too many requests, try again later" }) },
        },
        states: {
          ENTERING: {
            on: {
              Submit: {
                target: S.TWO_FACTOR.VERIFYING,
                // one verify per challenge: verify.idle refuses a second Submit while one is in flight (rule 4)
                guard: [({ memory }) => sixDigits(memory.code), ({ memory }) => strikesOf(memory, memory.challengeId) < LIMIT || deny("NoTriesLeft"), verify.idle(challenge)],
                updateMemory: () => ({ error: null }),
                actions: [verify],
              },
            },
          },
          VERIFYING: {
            schedules: { gaveUp: { schedule: "15 seconds", send: E.StopWaiting } },   // soft timeout: leave, keep the call
            on: {
              StopWaiting: { target: S.TWO_FACTOR.ENTERING, updateMemory: () => ({ error: "Couldn't check the code, try again" }) },
              CodeAccepted: { target: S.SIGNED_IN, updateMemory: () => ({ strikes: {}, lockedUntil: {}, error: null }) },
              CodeWrong: [
                { target: S.TWO_FACTOR.LOCKED_OUT, guard: ({ event, memory }) => third(memory, event.challengeId) || deny("TriesLeft"), updateMemory: ({ event, memory, now }) => ({ ...strike(memory, event.challengeId, now), ...fresh, error: null }) },
                { target: S.TWO_FACTOR.ENTERING, updateMemory: ({ event, memory, now }) => ({ ...strike(memory, event.challengeId, now), ...fresh, error: `Wrong code, ${LIMIT - strikesOf(memory, event.challengeId) - 1} tries left` }) },
              ],
              CodeExpired: { target: S.TWO_FACTOR.ENTERING, updateMemory: () => ({ error: "Code expired, send a new one" }) },
              CodeUnchecked: { target: S.TWO_FACTOR.ENTERING, updateMemory: () => ({ error: "Couldn't check the code, try again" }) },
            },
          },
          LOCKED_OUT: {},
        },
      },

      SIGNED_IN: {},
    },
  }
})
