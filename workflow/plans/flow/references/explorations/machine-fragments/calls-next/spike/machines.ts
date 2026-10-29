// machines.ts: the machines the Stories drive. No `!`, no cast, no hand-declared ending event, no mapping:
// every payload below is typed from the commit's Effect through the derived events.
import { deny, machine } from "./flow.ts"
import { charge, discard, refund, save, setLike, upload, verifyCode } from "./operations.ts"

// ── Checkout: PAYING is the call, WAITING and UNSURE are the waits (the CALL/WAIT split) ────────────────────
type CheckoutEv = { readonly _tag: "Pay" } | { readonly _tag: "RetryNow" } | { readonly _tag: "CheckTick" } | { readonly _tag: "TookTooLong" }
const checkout = machine<CheckoutEv>()({
  calls: { pay: charge },
  memory: { retryInMs: 0, error: null as string | null, chargeId: null as string | null, paidLate: false },
})
const { pay } = checkout.C
export const Checkout = checkout.define({
  initial: "CARD",
  states: {
    "": {
      on: {   // late endings (rule 2): PAYING was left. Each ends in a non-moving alternative (rule 3).
        "pay.success": { target: "self", update: ({ event }) => ({ chargeId: event.value.chargeId, paidLate: true }) },
        "pay.Declined": { target: "self" }, "pay.Busy": { target: "self" }, "pay.NotSent": { target: "self" },
        "pay.unknown": { target: "self" },
      },
    },
    CARD: { on: { Pay: { target: "PAYING", update: () => ({ error: null }), actions: [pay.start(() => ({ cents: 500 }))] } } },
    PAYING: {
      after: { giveUp: { delay: () => 3000, send: { _tag: "TookTooLong" } } },
      on: {
        // the builder's hard timeout, unchanged: `pending` now stays true until the ending's turn (rule 9)
        TookTooLong: [
          { target: "self", guard: ({ calls }) => calls.pay.pending || deny("NothingInFlight"), actions: [pay.cancel()] },
          { target: "CARD", update: () => ({ error: "That took too long. You were not charged." }) },
        ],
        "pay.success": { target: "DONE", update: ({ event }) => ({ chargeId: event.value.chargeId }) },
        "pay.Declined": { target: "CARD", update: ({ event }) => ({ error: `Declined (${event.error.code})` }) },
        "pay.Busy": [
          {
            target: "WAITING",
            guard: ({ event }) => event.attempt.sends < 4 || deny("GaveUp"),
            update: ({ event }) => ({ retryInMs: event.error.retryAfterMs ?? 1000 * 2 ** event.attempt.sends }),  // the server's delay wins
          },
          { target: "CARD", update: () => ({ error: "The bank is busy. You were not charged." }) },  // true: Busy here is definite (rule 6)
        ],
        "pay.NotSent": { target: "CARD", update: () => ({ error: "Not sent. You were not charged." }) },
        "pay.unknown": { target: "UNSURE" },
      },
    },
    WAITING: {
      after: { again: { delay: ({ memory }) => memory.retryInMs, send: { _tag: "RetryNow" } } },   // committed memory (rule 11)
      on: { RetryNow: [{ target: "PAYING", actions: [pay.resend()] }, { target: "self" }] },        // same Attempt, same events; a tick is total
    },
    UNSURE: {
      after: { check: { delay: () => 1500, send: { _tag: "CheckTick" } } },
      on: { CheckTick: [{ target: "PAYING", actions: [pay.resend()] }, { target: "self" }] },       // never a new Attempt
    },
    DONE: {},
  },
})

// ── Sign-in: a wrong code that settles after the soft timeout still strikes its own challenge ────────────────
type SignInEv = { readonly _tag: "Submit" } | { readonly _tag: "StopWaiting" }
const strike = (strikes: Readonly<Record<string, number>>, id: string) => ({ strikes: { ...strikes, [id]: (strikes[id] ?? 0) + 1 } })
const signIn = machine<SignInEv>()({
  calls: { verify: verifyCode },
  memory: { challengeId: "c1", code: "123456", strikes: {} as Readonly<Record<string, number>>, error: null as string | null },
})
const { verify } = signIn.C
export const SignIn = signIn.define({
  initial: "TWO_FACTOR",
  states: {
    "": {
      on: {   // late: VERIFYING was left. The strike goes to the challenge the call was for (event.input), not memory's.
        "verify.WrongCode": { target: "self", update: ({ event, memory }) => strike(memory.strikes, event.input.challengeId) },
        "verify.success": { target: "self" }, "verify.Expired": { target: "self" }, "verify.unknown": { target: "self" },
      },
    },
    TWO_FACTOR: { initial: "TWO_FACTOR.ENTERING" },
    "TWO_FACTOR.ENTERING": {
      on: { Submit: { target: "TWO_FACTOR.VERIFYING", actions: [verify.start(({ memory }) => ({ challengeId: memory.challengeId, code: memory.code }))] } },
    },
    "TWO_FACTOR.VERIFYING": {
      after: { gaveUp: { delay: () => 15_000, send: { _tag: "StopWaiting" } } },
      on: {
        StopWaiting: { target: "TWO_FACTOR.ENTERING", update: () => ({ error: "Couldn't check the code, try again" }) },
        "verify.success": { target: "SIGNED_IN" },
        "verify.WrongCode": { target: "TWO_FACTOR.ENTERING", update: ({ event, memory }) => ({ ...strike(memory.strikes, event.input.challengeId), error: "Wrong code" }) },
        "verify.Expired": { target: "TWO_FACTOR.ENTERING", update: () => ({ error: "Code expired" }) },
        "verify.unknown": { target: "TWO_FACTOR.ENTERING", update: () => ({ error: "Couldn't check the code, try again" }) },
      },
    },
    SIGNED_IN: {},
  },
})

// ── M1 save: no `!pending` guard anywhere; a second Save is Denied, never silently declined ─────────────────
type ShellEv = { readonly _tag: "Save" } | { readonly _tag: "Edit"; readonly body: string } | { readonly _tag: "OpenList" } | { readonly _tag: "OpenDoc" }
const shell = machine<ShellEv>()({ calls: { save }, memory: { docId: "d1", body: "", toast: null as string | null } })
const saveCall = shell.C.save
export const Shell = shell.define({
  initial: "DOC",
  states: {
    "": {
      on: {   // current or late: one place for the toast. SAVING has its own, so it wins while the user waits there.
        "save.success": { target: "self", update: ({ event }) => ({ toast: `Saved rev ${event.value.rev}` }) },
        "save.Conflict": { target: "self", update: ({ event }) => ({ toast: `Someone else saved (rev ${event.error.serverRev})` }) },
        "save.unknown": { target: "self", update: () => ({ toast: "Could not confirm the save" }) },
      },
    },
    DOC: { initial: "DOC.EDITING" },
    "DOC.EDITING": {
      on: {
        Edit: { target: "self", update: ({ event }) => ({ body: event.body }) },
        Save: { target: "DOC.SAVING", actions: [saveCall.start(({ memory }) => ({ docId: memory.docId, body: memory.body }))] },
        OpenList: { target: "LIST" },
      },
    },
    "DOC.SAVING": {
      on: {
        OpenList: { target: "LIST" },
        "save.success": { target: "DOC.EDITING", update: ({ event }) => ({ toast: `Saved rev ${event.value.rev}` }) },
      },
    },
    LIST: { on: { OpenDoc: { target: "DOC" } } },
  },
})

// ── D1 upload: cancel, then clean up by the Attempt's key ────────────────────────────────────────────────────
type UploadEv = { readonly _tag: "Pick" } | { readonly _tag: "Cancel" }
const uploader = machine<UploadEv>()({ calls: { upload, discard }, memory: { ref: "r1" } })
const up = uploader.C
export const Upload = uploader.define({
  initial: "IDLE",
  states: {
    "": { on: { "upload.success": { target: "self" }, "upload.unknown": { target: "self" }, "upload.NotSent": { target: "self" } } },
    IDLE: { on: { Pick: { target: "UPLOADING", actions: [up.upload.start(({ memory }) => ({ ref: memory.ref }))] } } },
    UPLOADING: {
      on: {
        Cancel: { target: "self", actions: [up.upload.cancel(({ memory }) => ({ ref: memory.ref }))] },
        "upload.success": { target: "DONE" },
        "upload.NotSent": { target: "CANCELLED" },                                // cancelled before the adapter was called
        "upload.unknown": {                                                        // Cancelled after it was called: it may land
          target: "CLEANING",
          actions: [up.discard.start(({ event }) => ({ ref: event.input.ref, uploadKey: event.attempt.idempotencyKey }))],
        },
      },
    },
    CLEANING: { on: { "discard.success": { target: "CANCELLED" }, "discard.unknown": { target: "CANCELLED" }, "discard.NotSent": { target: "CANCELLED" } } },
    DONE: {}, CANCELLED: {},
  },
})

// ── B1 likes: `latest` coalesces; the input reads the memory this turn produced (rule 10) ─────────────────────
type LikesEv = { readonly _tag: "Toggle"; readonly id: string }
const likes = machine<LikesEv>()({
  calls: { like: setLike },
  memory: { desired: {} as Readonly<Record<string, boolean>>, confirmed: {} as Readonly<Record<string, boolean>>, count: 0 },
})
const { like } = likes.C
export const Likes = likes.define({
  initial: "READY",
  states: {
    READY: {
      on: {
        Toggle: {
          target: "self",
          update: ({ event, memory }) => ({ desired: { ...memory.desired, [event.id]: !memory.desired[event.id] } }),
          actions: [like.start(({ event, memory }) => ({ id: event.id, liked: memory.desired[event.id] ?? false }))],
        },
        "like.success": { target: "self", update: ({ event, memory }) => ({ confirmed: { ...memory.confirmed, [event.input.id]: event.input.liked }, count: event.value.count }) },
        "like.NotSent": { target: "self" },                                          // superseded by a newer click
        "like.unknown": { target: "self" },
      },
    },
  },
})

// ── F1 compensation (P4): the user leaves mid-charge; a late success starts a refund that must finish ────────
type BookingEv = { readonly _tag: "Pay" } | { readonly _tag: "Leave" }
const booking = machine<BookingEv>()({ calls: { pay: charge, refund }, memory: { refundId: null as string | null } })
const b = booking.C
export const Booking = booking.define({
  initial: "CARD",
  states: {
    "": {
      on: {
        // late: PAYING was left. Moving an idle LEFT is allowed; a state owning another pending call is not (rule 3).
        "pay.success": [
          { target: "REFUNDING", guard: ({ state }) => state === "LEFT" || deny("NotLeft"), actions: [b.refund.start(({ event }) => ({ chargeId: event.value.chargeId }))] },
          { target: "self" },
        ],
        "pay.Declined": { target: "self" }, "pay.Busy": { target: "self" }, "pay.NotSent": { target: "self" }, "pay.unknown": { target: "self" },
      },
    },
    CARD: { on: { Pay: { target: "PAYING", actions: [b.pay.start(() => ({ cents: 500 }))] } } },
    PAYING: { on: { Leave: { target: "LEFT" } } },
    LEFT: {},
    REFUNDING: {
      on: {   // current endings of the refund: REFUNDING owns it, so they may move (no transitive lateness)
        "refund.success": { target: "REFUNDED", update: ({ event }) => ({ refundId: event.value.refundId }) },
        "refund.unknown": { target: "REFUNDING_AGAIN" },
        "refund.NotSent": { target: "REFUNDING_AGAIN" },
      },
    },
    REFUNDING_AGAIN: { on: {} },
    REFUNDED: {},
  },
})
