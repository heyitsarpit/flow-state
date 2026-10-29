// machines.ts: the machines the Stories drive, in the settled syntax: a commit value with `outcomes` mappings onto
// author-declared events; the value is the handle (`retry`, `cancel`, `idle`, `pending`, `retryCount`). No `!`, no
// cast, no Attempt in any event or memory. Every late-routable event has an ancestor handler (D13; `checkLate`).
import { deny, machine, type Uncertain } from "./flow.ts"
import { charge, discard, refund, save, setLike, upload, verifyCode } from "./operations.ts"

// ── Checkout: PAYING is the call, WAITING and UNSURE are the waits (the CALL/WAIT split) ────────────────────
type CheckoutEv =
  | { readonly _tag: "Pay" } | { readonly _tag: "RetryNow" } | { readonly _tag: "CheckTick" } | { readonly _tag: "TookTooLong" }
  | { readonly _tag: "Paid"; readonly chargeId: string }
  | { readonly _tag: "Declined"; readonly code: string }
  | { readonly _tag: "Busy"; readonly retryAfterMs: number | undefined }
  | { readonly _tag: "TryLater"; readonly why: string }
  | Uncertain<{ readonly _tag: "Unsure" }>                                         // Flow.uncertain({})
type CheckoutMemory = { readonly retryInMs: number; readonly busyTries: number; readonly error: string | null; readonly chargeId: string | null; readonly paidLate: boolean }

/**
 * `onBusy: "newWrite"` is rule 7: Busy is definite, so trying again is a new write with a new id, budgeted in memory.
 * `onBusy: "retrySameId"` is the old recipe (CP 3.3): `pay.retry()`, the same id, budgeted by `retryCount`.
 */
export const makeCheckout = (onBusy: "newWrite" | "retrySameId") => {
  const checkout = machine<CheckoutEv>()({
    memory: { retryInMs: 0, busyTries: 0, error: null, chargeId: null, paidLate: false } as CheckoutMemory,
    operations: { Payments: { charge } },
  })
  const { E, O } = checkout
  const pay = O.Payments.charge.commit(() => ({ cents: 500 }), {
    outcomes: {
      success: E.Paid.from((v) => ({ chargeId: v.chargeId })),
      failure: {
        Declined: E.Declined.from((e) => ({ code: e.code })),
        Busy: E.Busy.from((e) => ({ retryAfterMs: e.retryAfterMs })),   // no Attempt to carry: Flow keeps it
        NotSent: E.TryLater.from((e) => ({ why: e.why })),            // required: reject, and this machine cancels and retries
      },
      unknown: E.Unsure,                                              // StillUnknown arrives here too (rule 6)
    },
  })
  const again = onBusy === "newWrite"
    ? { target: "PAYING", guard: [pay.idle()], actions: [pay] }                   // a new write, a new id
    : { target: "PAYING", actions: [pay.retry()] }                                 // the same id: a stored failure replays
  const underBudget = onBusy === "newWrite"
    ? ({ memory }: { memory: CheckoutMemory }) => memory.busyTries < 3 || deny("GaveUp")
    : (g: { lanes: any }) => pay.retryCount(g) < 3 || deny("GaveUp")
  return checkout.define({
    initial: "CARD",
    states: {
      "": {
        on: {   // late endings (rule 2): PAYING was left. Each is handled; most are explicit ignores (rule 8, D13).
          Paid: { target: "self", update: ({ event }) => ({ chargeId: event.chargeId, paidLate: true }) },
          Declined: { target: "self" }, Busy: { target: "self" }, TryLater: { target: "self" }, Unsure: { target: "self" },
        },
      },
      CARD: { on: { Pay: { target: "PAYING", guard: [pay.idle()], update: () => ({ error: null, busyTries: 0 }), actions: [pay] } } },
      PAYING: {
        after: { giveUp: { delay: () => 3000, send: { _tag: "TookTooLong" } } },
        on: {
          // the builder's hard timeout, unchanged: `pending` stays true until the ending's turn (rule 9)
          TookTooLong: [
            { target: "self", guard: (g) => pay.pending(g) || deny("NothingInFlight"), actions: [pay.cancel()] },
            { target: "CARD", update: () => ({ error: "That took too long. You were not charged." }) },
          ],
          Paid: { target: "DONE", update: ({ event }) => ({ chargeId: event.chargeId }) },
          Declined: { target: "CARD", update: ({ event }) => ({ error: `Declined (${event.code})` }) },
          Busy: [
            {
              target: "WAITING",
              guard: underBudget,
              update: ({ event, memory }) => ({ busyTries: memory.busyTries + 1, retryInMs: event.retryAfterMs ?? 1000 * 2 ** memory.busyTries }),  // the server's delay wins
            },
            { target: "CARD", update: () => ({ error: "The bank is busy. You were not charged." }) },  // true: Busy here is definite (rule 6)
          ],
          TryLater: { target: "CARD", update: ({ event }) => ({ error: `Not sent (${event.why}). You were not charged.` }) },
          Unsure: { target: "UNSURE" },
        },
      },
      WAITING: {
        after: { again: { delay: ({ memory }) => memory.retryInMs, send: { _tag: "RetryNow" } } },   // committed memory (rule 11)
        on: { RetryNow: [again, { target: "self" }] },
      },
      UNSURE: {
        after: { check: { delay: () => 1500, send: { _tag: "CheckTick" } } },
        on: { CheckTick: [{ target: "PAYING", guard: (g) => pay.retryCount(g) < 10 || deny("ChecksLeft"), actions: [pay.retry()] }, { target: "self" }] },   // never a new Attempt
      },
      DONE: {},
    },
  })
}
export const Checkout = makeCheckout("newWrite")

// ── Sign-in: a wrong code that settles after the soft timeout still strikes its own challenge ────────────────
type SignInEv =
  | { readonly _tag: "Submit" } | { readonly _tag: "StopWaiting" }
  | { readonly _tag: "CodeAccepted" } | { readonly _tag: "CodeWrong"; readonly challengeId: string } | { readonly _tag: "CodeExpired" }
  | Uncertain<{ readonly _tag: "CodeUnchecked" }>
const strike = (strikes: Readonly<Record<string, number>>, id: string) => ({ strikes: { ...strikes, [id]: (strikes[id] ?? 0) + 1 } })
const signIn = machine<SignInEv>()({
  memory: { challengeId: "c1", code: "123456", strikes: {} as Readonly<Record<string, number>>, error: null as string | null },
  operations: { Auth: { verifyCode } },
})
const verify = signIn.O.Auth.verifyCode.commit(({ memory }) => ({ challengeId: memory.challengeId, code: memory.code }), {
  outcomes: {
    success: signIn.E.CodeAccepted,
    failure: { WrongCode: signIn.E.CodeWrong.from((_e, { input }) => ({ challengeId: input.challengeId })), Expired: signIn.E.CodeExpired, NotSent: signIn.E.CodeUnchecked },
    unknown: signIn.E.CodeUnchecked,
  },
})
export const SignIn = signIn.define({
  initial: "TWO_FACTOR",
  states: {
    "": {
      on: {   // late: VERIFYING was left. The strike goes to the challenge the call was for, not memory's.
        CodeWrong: { target: "self", update: ({ event, memory }) => strike(memory.strikes, event.challengeId) },
        CodeAccepted: { target: "self" }, CodeExpired: { target: "self" }, CodeUnchecked: { target: "self" },
      },
    },
    TWO_FACTOR: { initial: "TWO_FACTOR.ENTERING" },
    "TWO_FACTOR.ENTERING": {
      on: { Submit: { target: "TWO_FACTOR.VERIFYING", guard: [verify.idle(({ memory }) => ({ challengeId: memory.challengeId }))], actions: [verify] } },
    },
    "TWO_FACTOR.VERIFYING": {
      after: { gaveUp: { delay: () => 15_000, send: { _tag: "StopWaiting" } } },
      on: {
        StopWaiting: { target: "TWO_FACTOR.ENTERING", update: () => ({ error: "Couldn't check the code, try again" }) },
        CodeAccepted: { target: "SIGNED_IN" },
        CodeWrong: { target: "TWO_FACTOR.ENTERING", update: ({ event, memory }) => ({ ...strike(memory.strikes, event.challengeId), error: "Wrong code" }) },
        CodeExpired: { target: "TWO_FACTOR.ENTERING", update: () => ({ error: "Code expired" }) },
        CodeUnchecked: { target: "TWO_FACTOR.ENTERING", update: () => ({ error: "Couldn't check the code, try again" }) },
      },
    },
    SIGNED_IN: {},
  },
})

// ── M1 save: a second Save while one is in flight. Two forms (rule 4) ──────────────────────────────────────
type ShellEv =
  | { readonly _tag: "Save" } | { readonly _tag: "Edit"; readonly body: string } | { readonly _tag: "OpenList" } | { readonly _tag: "OpenDoc" }
  | { readonly _tag: "Saved"; readonly rev: number } | { readonly _tag: "SaveRejected"; readonly serverRev: number }
  | { readonly _tag: "SaveDeclined" } | Uncertain<{ readonly _tag: "SaveUnsure" }>
/** `guarded: false`: the decline is an ending (`NotSent Rejected` → SaveDeclined). `guarded: true`: `save.idle` refuses the transition. */
export const makeShell = (guarded: boolean) => {
  const shell = machine<ShellEv>()({ memory: { docId: "d1", body: "", toast: null as string | null }, operations: { Docs: { save } } })
  const key = ({ memory }: { memory: { docId: string } }) => ({ docId: memory.docId })
  const saveDoc = shell.O.Docs.save.commit(({ memory }) => ({ docId: memory.docId, body: memory.body }), {
    outcomes: {
      success: shell.E.Saved.from((v) => ({ rev: v.rev })),
      failure: { Conflict: shell.E.SaveRejected.from((e) => ({ serverRev: e.serverRev })), NotSent: shell.E.SaveDeclined },   // NotSent: reject (rule 8)
      unknown: shell.E.SaveUnsure,
    },
  })
  return shell.define({
    initial: "DOC",
    states: {
      "": {
        on: {   // current or late: one place for the toast. SAVING has its own, so it wins while the user waits there.
          Saved: { target: "self", update: ({ event }) => ({ toast: `Saved rev ${event.rev}` }) },
          SaveRejected: { target: "self", update: ({ event }) => ({ toast: `Someone else saved (rev ${event.serverRev})` }) },
          SaveUnsure: { target: "self", update: () => ({ toast: "Could not confirm the save" }) },
          SaveDeclined: { target: "self" },                                                   // late decline: explicit ignore
        },
      },
      DOC: { initial: "DOC.EDITING" },
      "DOC.EDITING": {
        on: {
          Edit: { target: "self", update: ({ event }) => ({ body: event.body }) },
          Save: guarded ? { target: "DOC.SAVING", guard: [saveDoc.idle(key)], actions: [saveDoc] } : { target: "DOC.SAVING", actions: [saveDoc] },
          OpenList: { target: "LIST" },
        },
      },
      "DOC.SAVING": {
        on: {
          OpenList: { target: "LIST" },
          Saved: { target: "DOC.EDITING", update: ({ event }) => ({ toast: `Saved rev ${event.rev}` }) },
          SaveDeclined: { target: "DOC.EDITING", update: () => ({ toast: "Already saving" }) },   // the decline, as an ending
        },
      },
      LIST: { on: { OpenDoc: { target: "DOC" } } },
    },
  })
}
export const Shell = makeShell(false)

// ── D1 upload: cancel, then clean up by the Attempt's id ─────────────────────────────────────────────────────
type UploadUnsure = Uncertain<{ readonly _tag: "UploadUnsure"; readonly ref: string; readonly uploadKey: string }>
type UploadEv =
  | { readonly _tag: "Pick" } | { readonly _tag: "Cancel" }
  | { readonly _tag: "Uploaded" } | { readonly _tag: "UploadNotSent" } | UploadUnsure
  | { readonly _tag: "Discarded" } | Uncertain<{ readonly _tag: "DiscardUnsure" }>
const uploader = machine<UploadEv>()({ memory: { ref: "r1" }, operations: { Uploads: { upload, discard } } })
const { E: UE, O: UO } = uploader
const put = UO.Uploads.upload.commit(({ memory }) => ({ ref: memory.ref }), {
  outcomes: {
    success: UE.Uploaded,
    failure: { NotSent: UE.UploadNotSent },                          // the commit has no failure tags; NotSent is required: reject, cancel
    unknown: UE.UploadUnsure.from((_r, { input, attempt }) => ({ ref: input.ref, uploadKey: attempt.id })),
  },
})
// The select reads the event of the transition that lists it (v4 rule 1 checks it there); the spike names it.
const clean = UO.Uploads.discard.commit<UploadUnsure>(({ event }) => ({ ref: event.ref, uploadKey: event.uploadKey }), {
  outcomes: { success: UE.Discarded, failure: { NotSent: UE.Discarded }, unknown: UE.DiscardUnsure },
})
export const Upload = uploader.define({
  initial: "IDLE",
  states: {
    "": { on: { Uploaded: { target: "self" }, UploadUnsure: { target: "self" }, UploadNotSent: { target: "self" }, Discarded: { target: "self" }, DiscardUnsure: { target: "self" } } },
    IDLE: { on: { Pick: { target: "UPLOADING", actions: [put] } } },
    UPLOADING: {
      on: {
        Cancel: { target: "self", actions: [put.cancel(({ memory }) => ({ ref: memory.ref }))] },
        Uploaded: { target: "DONE" },
        UploadNotSent: { target: "CANCELLED" },                          // cancelled before the adapter was called
        UploadUnsure: { target: "CLEANING", actions: [clean] },          // Cancelled after it was called: it may land
      },
    },
    CLEANING: { on: { Discarded: { target: "CANCELLED" }, DiscardUnsure: { target: "CANCELLED" } } },
    DONE: {}, CANCELLED: {},
  },
})

// ── B1 likes: `latest` coalesces; the input reads the memory this turn produced (rule 10) ─────────────────────
type Toggle = { readonly _tag: "Toggle"; readonly id: string }
type LikesEv =
  | Toggle
  | { readonly _tag: "LikeSynced"; readonly id: string; readonly liked: boolean; readonly count: number }
  | { readonly _tag: "LikeSkipped" } | Uncertain<{ readonly _tag: "LikeUnsure" }>
const likes = machine<LikesEv>()({
  memory: { desired: {} as Readonly<Record<string, boolean>>, confirmed: {} as Readonly<Record<string, boolean>>, count: 0 },
  operations: { Issues: { setLike } },
})
const like = likes.O.Issues.setLike.commit<Toggle>(({ event, memory }) => ({ id: event.id, liked: memory.desired[event.id] ?? false }), {
  outcomes: {
    success: likes.E.LikeSynced.from((v, { input }) => ({ id: input.id, liked: input.liked, count: v.count })),
    failure: { NotSent: likes.E.LikeSkipped },                           // superseded by a newer click (latest)
    unknown: likes.E.LikeUnsure,
  },
})
export const Likes = likes.define({
  initial: "READY",
  states: {
    READY: {
      on: {
        Toggle: { target: "self", update: ({ event, memory }) => ({ desired: { ...memory.desired, [event.id]: !memory.desired[event.id] } }), actions: [like] },
        LikeSynced: { target: "self", update: ({ event, memory }) => ({ confirmed: { ...memory.confirmed, [event.id]: event.liked }, count: event.count }) },
        LikeSkipped: { target: "self" },
        LikeUnsure: { target: "self" },
      },
    },
  },
})

// ── F1 compensation (P4): the user leaves mid-charge; a late success starts a refund that must finish ────────
type BookingEv =
  | { readonly _tag: "Pay" } | { readonly _tag: "Leave" }
  | { readonly _tag: "Paid"; readonly chargeId: string } | { readonly _tag: "PayFailed" } | Uncertain<{ readonly _tag: "PayUnsure" }>
  | { readonly _tag: "Refunded"; readonly refundId: string } | { readonly _tag: "RefundNotSent" } | Uncertain<{ readonly _tag: "RefundUnsure" }>
const booking = machine<BookingEv>()({ memory: { refundId: null as string | null }, operations: { Payments: { charge, refund } } })
const { E: BE, O: BO } = booking
const charge2 = BO.Payments.charge.commit(() => ({ cents: 500 }), {
  outcomes: { success: BE.Paid.from((v) => ({ chargeId: v.chargeId })), failure: { Declined: BE.PayFailed, Busy: BE.PayFailed, NotSent: BE.PayFailed }, unknown: BE.PayUnsure },
})
type PaidEv = Extract<BookingEv, { readonly _tag: "Paid" }>
const giveBack = BO.Payments.refund.commit<PaidEv>(({ event }) => ({ chargeId: event.chargeId }), {
  outcomes: { success: BE.Refunded.from((v) => ({ refundId: v.refundId })), failure: { NotSent: BE.RefundNotSent }, unknown: BE.RefundUnsure },
})
export const Booking = booking.define({
  initial: "CARD",
  states: {
    "": {
      on: {
        // late: PAYING was left. Moving an idle LEFT is allowed; a state owning another pending call is not (rule 3).
        Paid: [{ target: "REFUNDING", guard: ({ state }) => state === "LEFT" || deny("NotLeft"), actions: [giveBack] }, { target: "self" }],
        PayFailed: { target: "self" }, PayUnsure: { target: "self" },
        Refunded: { target: "self" }, RefundNotSent: { target: "self" }, RefundUnsure: { target: "self" },
      },
    },
    CARD: { on: { Pay: { target: "PAYING", actions: [charge2] } } },
    PAYING: { on: { Leave: { target: "LEFT" } } },
    LEFT: {},
    REFUNDING: {
      on: {   // REFUNDING owns the refund, so its endings are current here and may move (no transitive lateness)
        Refunded: { target: "REFUNDED", update: ({ event }) => ({ refundId: event.refundId }) },
        RefundNotSent: { target: "REFUNDING_AGAIN" },
        RefundUnsure: { target: "REFUNDING_AGAIN" },
      },
    },
    REFUNDING_AGAIN: {},
    REFUNDED: {},
  },
})
