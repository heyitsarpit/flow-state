// Round 1's scenarios, worked out by hand from SCENARIOS.md and pay.machine.ts, before any runtime existed.
import type { Answer, Harness } from "../harness.ts"
import { payFixture } from "../fixtures/pay.compiled.ts"

export const A = { actor: "Checkout/Pay", id: "shopper-1" }
const K = { intentId: "pi1" }
export const CART = { cartId: "c1", intentId: "pi1" }
const req_cap = { ok: { status: "requires_capture", clientSecret: "" } }
const NOT_CHARGED = "Your payment wasn't sent. You haven't been charged."

export class Mismatch extends Error {}

export class Ctx {
  namedIssues: string[] = []
  constructor(readonly h: Harness) {}
  get r() {
    return this.h.read
  }
  private checkStep() {
    const q = this.r.quiet()
    const stuck = q.waits.filter((w) => w.startsWith("stuck:"))
    if (stuck.length) throw new Mismatch(`L3: ${stuck.join(", ")}`)
    if (!q.idle) throw new Mismatch(`do() returned with work runnable: ${q.waits.join(", ")}`)
  }
  do(step: Parameters<Harness["do"]>[0]) {
    this.h.do(step)
    this.checkStep()
  }
  eq(label: string, actual: unknown, expected: unknown) {
    const a = JSON.stringify(actual)
    const e = JSON.stringify(expected)
    if (a !== e) throw new Mismatch(`${label}: expected ${e}, got ${a}`)
  }
  ensure = () => this.do({ ensure: A })
  send = (event: string, payload: unknown = {}) => this.do({ send: A, event, payload })
  start = () => this.send("Start", CART)
  pay = () => this.send("PayRequested", { paymentMethodId: "visa" })
  ack = () => this.do({ storage: "ack" })
  answer = (op: string, a: Answer) => this.do({ answer: op, with: a })
  advance = (ms: number) => this.do({ advance: ms })
  reload = () => this.do({ reload: true })
  fault = (f: any) => this.do({ fault: f })
  state = (s: string) => this.eq("state", this.r.state(A), s)
  mem = () => this.r.memory(A)
  row = (op = "pay", key: unknown = K) => this.r.row(A, op, key)
  reqs = (op: string) => this.r.requests().filter((x) => x.op === op)
  keys = (op: string) => [...new Set(this.reqs(op).map((x) => x.idempotencyKey))]
  endings = (op: string) => this.r.evidence("ending").filter((e) => e.op === op)
  lastEnding = (op: string) => this.endings(op).at(-1)
  onWire = () => (this.ensure(), this.start(), this.pay(), this.ack())
}

export type Scenario = {
  id: string
  kind: "example" | "bounded" | "fault"
  cites: readonly string[]
  run?: (c: Ctx) => void
  variants?: Record<string, (c: Ctx) => void>
}

const toResend = (c: Ctx) => {
  c.onWire()
  c.answer("pay", { lost: true })
  c.state("UNSURE")
  c.eq("charges", c.r.truth().charges, 0)
  c.advance(3000)
  c.answer("order", { ok: null })
  c.answer("intent", { ok: { status: "requires_payment_method" } })
  c.state("PAYING")
  c.eq("not sent before capture", c.reqs("pay").length, 1)
  c.ack()
  c.eq("re-sent after capture", c.reqs("pay").length, 2)
  c.eq("same id", c.keys("pay").length, 1)
}

const reloadOnWire = (c: Ctx) => {
  c.onWire()
  c.reload()
  const boot = c.r.frames().find((f) => f.cause === "boot" && f.seq > 1_000_000)
  c.eq("after boot, saved leaf", boot?.view[`${A.actor}/${A.id}`]?.state, "PAYING")
  c.eq("after boot, not yet uncertain", boot?.view[`${A.actor}/${A.id}`]?.rows["pay"]?.uncertain, false)
  c.state("UNSURE")
  c.eq("uncertain", c.row()?.uncertain, true)
  c.eq("reason", c.lastEnding("pay")?.reason, "Restored")
  c.eq("requests", c.reqs("pay").length, 1)
  c.eq("initial not re-run", c.r.evidence("initial").length, 1)
  // The old tab's request finishes on the server; nobody hears it (pay.story.ts `reloadWhileConfirming`).
  c.fault({ lateAnswer: ["pay", req_cap] })
  c.advance(3000)
  c.answer("order", { ok: null })
  c.answer("intent", { ok: { status: "requires_capture" } })
  c.state("PLACING")
  c.ack()
  c.answer("place", { ok: { orderId: "o1" } })
  c.state("PAID")
  c.eq("charges", c.r.truth().charges, 1)
}

export const payScenarios: readonly Scenario[] = [
  {
    id: "PAY-01",
    kind: "example",
    cites: ["rule:17", "rule:21", "cell:lane.commit.Idle", "cell:lane.success.InFlight", "sec:2.7.12", "D2", "D4"],
    run(c) {
      c.ensure()
      c.start()
      c.state("CARD")
      c.pay()
      c.state("PAYING")
      c.eq("pending", c.row()?.pending, true)
      c.eq("no send before ack", c.reqs("pay").length, 0)
      c.ack()
      c.eq("sent", c.reqs("pay").length, 1)
      c.answer("pay", req_cap)
      c.state("PLACING")
      c.eq("lane gone", c.row(), undefined)
      c.eq("place waits", c.reqs("place").length, 0)
      c.ack()
      c.eq("place sent", c.reqs("place").length, 1)
      c.answer("place", { ok: { orderId: "o1" } })
      c.state("PAID")
      c.eq("receipt", c.mem().receipt, { orderId: "o1", afterUnsure: false, alreadyPlaced: false })
      c.eq("charges", c.r.truth().charges, 1)
    },
  },
  {
    id: "PAY-02",
    kind: "example",
    cites: ["rule:16", "cell:lane.commit.InFlight", "sec:2.7.1.NotSent"],
    run(c) {
      c.onWire()
      c.pay()
      c.state("PAYING")
      c.eq("requests", c.reqs("pay").length, 1)
      c.eq("cell", c.r.evidence("lane").filter((e) => e.op === "pay").at(-1)?.cell, "lane.commit.InFlight")
      c.eq("notice", c.mem().notice, "")
      c.eq("decline ending", c.lastEnding("pay")?.reason, "Rejected")
    },
  },
  {
    id: "PAY-03",
    kind: "example",
    cites: ["rule:24", "cell:lane.cancel.Held", "cell:lane.unknown.InFlight", "rule:18", "D23"],
    run(c) {
      c.onWire()
      c.answer("pay", { lostButLanded: req_cap.ok })
      c.state("UNSURE")
      c.eq("uncertain", c.row()?.uncertain, true)
      c.eq("afterUnsure", c.mem().afterUnsure, true)
      c.eq("charges", c.r.truth().charges, 1)
      c.advance(3000)
      c.eq("intent read", c.reqs("intent").length, 1)
      c.eq("order read", c.reqs("order").length, 1)
      c.answer("intent", { ok: { status: "requires_capture" } })
      c.state("PLACING")
      c.eq("released", c.row(), undefined)
      c.eq("evidence", c.r.evidence("Released").length, 1)
      c.eq("no re-send", c.reqs("pay").length, 1)
      c.answer("order", { ok: null })
      c.state("PLACING")
      c.ack()
      c.answer("place", { ok: { orderId: "o1" } })
      c.state("PAID")
      c.eq("afterUnsure receipt", c.mem().receipt.afterUnsure, true)
      c.eq("charges", c.r.truth().charges, 1)
    },
  },
  {
    id: "PAY-04",
    kind: "example",
    cites: ["rule:19", "cell:lane.retry.Held", "cell:lane.invoked.InFlight", "S6"],
    run(c) {
      toResend(c)
      c.eq("retryCount", c.row()?.retryCount, 1)
      c.answer("pay", req_cap)
      c.state("PLACING")
      c.eq("charges", c.r.truth().charges, 1)
      c.eq("distinct keys", c.keys("pay").length, 1)
      c.eq("afterUnsure", c.mem().afterUnsure, true)
    },
  },
  {
    id: "PAY-05",
    kind: "example",
    cites: ["rule:18", "sec:2.7.1.StillUnknown"],
    run(c) {
      toResend(c)
      const notice = c.mem().notice
      c.answer("pay", { fail: { tag: "CardDeclined", code: "card_declined" } })
      c.state("UNSURE")
      c.eq("uncertain", c.row()?.uncertain, true)
      c.eq("reason", c.lastEnding("pay")?.reason, "StillUnknown")
      c.eq("notice unchanged", c.mem().notice, notice)
    },
  },
  {
    id: "PAY-06",
    kind: "fault",
    cites: ["D8", "D5", "S4", "rule:25"],
    variants: {
      interruptible(c) {
        c.onWire()
        c.answer("pay", { never: true })
        c.advance(8000)
        c.state("PAYING")
        c.eq("notice", c.mem().notice, "Still confirming with your bank…")
        c.eq("pending", c.row()?.pending, true)
        c.advance(52000)
        c.state("UNSURE")
        c.eq("uncertain", c.row()?.uncertain, true)
        c.eq("reason", c.lastEnding("pay")?.reason, "TimedOut")
        c.eq("interrupted", c.r.evidence("interrupt").length, 1)
        c.fault({ lateAnswer: ["pay", req_cap] })
        c.state("UNSURE")
        c.eq("uncertain", c.row()?.uncertain, true)
        c.eq("fence", c.r.evidence("fence").length, 1) // the interrupted fiber's own exit
        c.eq("charges", c.r.truth().charges, 1)
        c.eq("one ending", c.endings("pay").length, 1)
      },
      // Added: an interrupt that cannot land, so `fetch`'s late answer really reaches the core (walkthrough step 5).
      uninterruptible(c) {
        c.ensure()
        c.fault({ uninterruptibleHang: "pay" })
        c.start()
        c.pay()
        c.ack()
        c.advance(60000)
        c.state("UNSURE")
        c.eq("no fence yet", c.r.evidence("fence").length, 0)
        c.fault({ lateAnswer: ["pay", req_cap] })
        c.eq("late answer dropped", c.r.evidence("fence").length, 1)
        c.state("UNSURE")
        c.eq("one ending", c.endings("pay").length, 1)
      },
    },
  },
  {
    id: "PAY-07",
    kind: "example",
    cites: ["rule:14", "rule:15", "rule:17"],
    run(c) {
      c.onWire()
      c.send("Leave")
      c.state("LEFT")
      c.eq("still pending", c.row()?.pending, true)
      c.answer("pay", req_cap)
      c.state("LEFT")
      c.ack()
      c.eq("void sent", c.reqs("void").length, 1)
      c.answer("void", { ok: {} })
      c.state("LEFT")
      c.eq("notice", c.mem().notice, "The hold on your card was released.")
      c.eq("authorized", c.mem().authorized, false)
    },
  },
  {
    id: "PAY-08",
    kind: "example",
    cites: ["rule:38", "rule:46", "cell:lane.restore.InFlight", "S10", "sec:2.7.15"],
    run: reloadOnWire,
  },
  {
    id: "PAY-09",
    kind: "fault",
    cites: ["sec:2.7.1.NotSent", "cell:lane.restore.InFlight", "S7", "rule:38"],
    variants: {
      "ack-not-stored"(c) {
        c.ensure()
        c.start()
        c.pay()
        c.reload()
        c.eq("requests", c.reqs("pay").length, 0)
        c.state("CARD")
        c.eq("notice", c.mem().notice, NOT_CHARGED)
        c.eq("charges", c.r.truth().charges, 0)
        c.eq("row", c.row(), undefined)
      },
      // Added: design 2.10's `hold({ at: "response" })`, the G1 cell. Stored, confirmation lost: cannot say "not charged".
      "ack-stored-confirmation-lost"(c) {
        c.ensure()
        c.start()
        c.pay()
        c.do({ storage: "landNoAck" })
        c.reload()
        c.eq("requests", c.reqs("pay").length, 0)
        c.state("UNSURE")
        c.eq("reason", c.lastEnding("pay")?.reason, "Restored")
        c.eq("uncertain", c.row()?.uncertain, true)
      },
    },
  },
  {
    id: "PAY-10",
    kind: "fault",
    cites: ["cell:lane.storageRefused.InFlight", "D14", "S7"],
    variants: {
      refuse(c) {
        c.ensure()
        c.start()
        c.pay()
        c.do({ storage: "refuse" })
        c.eq("requests", c.reqs("pay").length, 0)
        c.state("CARD")
        c.eq("evidence", c.r.evidence("StorageFailure").length, 1)
      },
      hang(c) {
        c.ensure()
        c.start()
        c.pay()
        c.do({ storage: "hang" })
        c.advance(9999)
        c.state("PAYING")
        c.advance(1)
        c.eq("requests", c.reqs("pay").length, 0)
        c.state("CARD")
        c.eq("evidence", c.r.evidence("StorageFailure").length, 1)
      },
    },
  },
  {
    id: "PAY-11",
    kind: "fault",
    cites: ["rule:12", "F3", "F6", "D10", "sec:2.5.1"],
    variants: {
      guard(c) {
        c.onWire()
        c.fault({ throwIn: "states.PAYING.on.Confirmed[1].guard[0]", times: 1 })
        c.answer("pay", req_cap)
        c.state("PAYING")
        c.eq("cell kept", c.row(), undefined)
        const i = c.r.issues()
        c.eq("issue", i[0]?.code, "InvalidTurn")
        c.eq("origin", i[0]?.origin, "Checkout/Pay states.PAYING.on.Confirmed[1].guard[0]")
        c.eq("input", i[0]?.input, { k: "mail", event: "Confirmed" })
        c.namedIssues = ["InvalidTurn"]
        c.send("Leave")
        c.state("LEFT")
      },
      // Added: D10's other half, our own bug. A module is data, so this needs no seam in the core.
      module(c) {
        c.onWire()
        c.fault({ throwInModule: "onCommit" })
        const before = c.r.frames().length
        c.send("Leave") // the step that hits the module aborts, the value stays
        c.state("PAYING")
        c.eq("no publication", c.r.frames().length, before)
        c.eq("issue", c.r.issues().at(-1)?.code, "StepDefect")
        c.namedIssues = ["StepDefect"]
        c.send("Leave")
        c.state("LEFT")
      },
    },
  },
  {
    id: "PAY-12",
    kind: "fault",
    cites: ["rule:17", "D5", "D6", "F2", "S4"],
    variants: {
      defect(c) {
        c.onWire()
        c.answer("pay", { die: "boom" })
        c.state("UNSURE")
        c.eq("reason", c.lastEnding("pay")?.reason, "Defect")
        c.eq("issue", c.r.issues().map((i) => i.code), ["Defect"])
        c.namedIssues = ["Defect"]
      },
      sync(c) {
        c.ensure()
        c.fault({ syncAnswer: ["pay", req_cap] })
        c.start()
        c.pay()
        c.ack()
        c.state("PLACING")
        c.eq("endings", c.endings("pay").length, 1)
        const seqs = c.r.frames().map((f) => f.seq)
        c.eq("frames in order", seqs, [...seqs].sort((a, b) => a - b))
      },
      duplicate(c) {
        c.onWire()
        c.fault({ duplicateCompletion: "pay" })
        c.answer("pay", req_cap)
        c.state("PLACING")
        c.eq("endings", c.endings("pay").length, 1)
        c.eq("fence", c.r.evidence("fence").length, 1)
      },
      shuffle(c) {
        const injects = [{ send: A, event: "Leave", payload: {} }, { send: A, event: "AbortPay", payload: {} }]
        let totalSends = 0
        for (let seed = 1; seed <= 8; seed++)
          for (let tick = 0; tick <= 6; tick++)
            for (const inject of injects) {
              const h = (c as any).fresh() as Harness
              const d = new Ctx(h)
              d.ensure()
              d.start()
              d.fault({ schedulerShuffle: seed, atTick: tick, inject })
              d.pay()
              d.ack()
              if (d.r.requests().some((r) => r.op === "pay" && !r.answered)) {
                try {
                  d.answer("pay", req_cap)
                } catch {
                  // aborted before the answer: the fiber is gone, which is the case under test
                }
              }
              const sends = d.r.evidence("invoked").filter((e) => e.op === "pay")
              const ends = d.endings("pay").filter((e) => e.send !== undefined)
              totalSends += sends.length
              d.eq(`seed ${seed} tick ${tick} ${inject.event}: one ending per send`, ends.length, sends.length)
              d.eq(`seed ${seed} tick ${tick} ${inject.event}: replay`, d.r.replay().same, true)
            }
        c.eq("some sends happened", totalSends > 0, true)
      },
    },
  },
  {
    id: "PAY-13",
    kind: "fault",
    cites: ["D6", "L5", "cell:lane.runtimeDisposal.InFlight"],
    variants: {
      "hung-commit"(c) {
        c.ensure()
        c.fault({ uninterruptibleHang: "pay" })
        c.start()
        c.pay()
        c.ack()
        c.do({ disposeRuntime: true })
        c.eq("not yet", c.r.evidence("Disposed").length, 0)
        c.advance(5000)
        c.eq("disposed", c.r.evidence("Disposed").length, 1)
        c.eq("abandoned", c.r.evidence("AbandonedFiber").length, 1)
        c.eq("lane stored", [...c.r.stored().keys()].some((k) => k.startsWith("lane/")), true)
        c.reload() // next boot delivers Restored
        c.state("UNSURE")
        c.eq("reason", c.lastEnding("pay")?.reason, "Restored")
      },
      // Added: the never-sent half of the same cell.
      waiting(c) {
        c.ensure()
        c.start()
        c.pay()
        c.do({ disposeRuntime: true })
        c.eq("disposed at once", c.r.evidence("Disposed").length, 1)
        c.eq("requests", c.reqs("pay").length, 0)
        c.reload()
        c.state("CARD")
        c.eq("reason", c.lastEnding("pay")?.reason, "Disposed")
        c.eq("no send after boot", c.reqs("pay").length, 0)
      },
    },
  },
  {
    id: "PAY-14",
    kind: "example",
    cites: ["S11", "D1"],
    run(c) {
      reloadOnWire(c)
      c.eq("replay", c.r.replay().same, true)
      const seqs = c.r.frames().map((f) => f.seq)
      c.eq("frames monotonic", seqs, [...new Set(seqs)].sort((a, b) => a - b))
    },
  },
]

export const fixtures = [payFixture]
