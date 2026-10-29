// stories.ts: plain Effect on the controlled clock. Fixtures replace whole services (Testing O3) and keep server
// truth; no Story injects an outcome. Each Story runs the proposal's rules, then the old rule it replaces, on the
// same machine and the same fixture, and asserts server truth.
import { Deferred, Effect, Layer } from "effect"
import * as TestClock from "effect/testing/TestClock"
import { type Legacy, makeActor } from "./flow.ts"
import { Booking, Checkout, Likes, Shell, SignIn, Upload } from "./machines.ts"
import { AuthApi, type ChargeResponse, DocsApi, LikesApi, NoResponse, PaymentsApi, RefundsApi, UploadsApi } from "./operations.ts"

// ── fixtures: stateful fake servers ──────────────────────────────────────────────────────────────────────────
/** Stripe-like: 100 ms each way; dedups by idempotency key; a key still running answers 429 (lock). */
const fakeStripe = (o: { processingMs: number; dropFirst?: boolean; script?: ChargeResponse[]; cacheFailures?: boolean }) => {
  const truth = { charges: 0, keys: [] as string[] }
  const byKey = new Map<string, { done?: ChargeResponse }>()
  const script = [...(o.script ?? [])]
  let n = 0
  const serve = (key: string) => Effect.gen(function* () {
    truth.keys.push(key)
    const seen = byKey.get(key)
    if (seen?.done) return seen.done                          // the original answer, never a second charge
    if (seen) return { status: 429, retryAfterMs: 500 }       // lock_timeout: this key is still being processed
    const scripted = script.shift()
    if (scripted) { if (o.cacheFailures) byKey.set(key, { done: scripted }); return scripted }
    const entry: { done?: ChargeResponse } = {}
    byKey.set(key, entry)
    yield* Effect.sleep(`${o.processingMs} millis`)
    truth.charges++
    entry.done = { status: 200, chargeId: `ch_${truth.charges}` }
    return entry.done
  })
  const layer = Layer.succeed(PaymentsApi, {
    charge: (_body, { idempotencyKey }) => Effect.gen(function* () {
      const first = ++n === 1
      const answer = yield* Deferred.make<ChargeResponse>()
      yield* Effect.forkDetach(Effect.sleep("100 millis").pipe(Effect.andThen(serve(idempotencyKey)), Effect.flatMap((r) => Deferred.succeed(answer, r))))
      if (o.dropFirst && first) { yield* Effect.sleep("1 second"); return yield* new NoResponse() }  // reset; the server carries on
      const r = yield* Deferred.await(answer)
      yield* Effect.sleep("100 millis")
      return r
    }),
  })
  return { truth, layer }
}
const fakeAuth = (o: { answerAtMs: number; status: number }) =>
  ({ truth: {}, layer: Layer.succeed(AuthApi, { verify: () => Effect.sleep(`${o.answerAtMs} millis`).pipe(Effect.as({ status: o.status })) }) })
const fakeDocs = () => {
  const truth = { puts: 0 }
  return { truth, layer: Layer.succeed(DocsApi, { put: () => Effect.sleep("1 second").pipe(Effect.as({ status: 200, rev: ++truth.puts })) }) }
}
/** The body takes 2 s to arrive and the adapter does not abort it. `tombstones`: the discard endpoint remembers the key. */
const fakeUploads = (o: { tombstones: boolean }) => {
  const truth = { files: new Map<string, string>(), refused: 0 }
  const graves = new Set<string>()
  const layer = Layer.succeed(UploadsApi, {
    put: (ref, { idempotencyKey }) => Effect.gen(function* () {
      const answer = yield* Deferred.make<{ fileId: string }>()
      yield* Effect.forkDetach(Effect.sleep("2 seconds").pipe(Effect.andThen(Effect.sync(() => {
        if (graves.has(idempotencyKey)) { truth.refused++; return }
        truth.files.set(idempotencyKey, ref)
      })), Effect.andThen(Deferred.succeed(answer, { fileId: `f_${idempotencyKey}` }))))
      return yield* Deferred.await(answer)
    }),
    discard: ({ ref, uploadKey }) => Effect.sleep("100 millis").pipe(Effect.andThen(Effect.sync(() => {
      if (o.tombstones) { graves.add(uploadKey); truth.files.delete(uploadKey) }
      else for (const [k, r] of truth.files) if (r === ref) truth.files.delete(k)     // delete by ref: whatever is there now
      return { status: 200 }
    }))),
  })
  return { truth, layer }
}
const fakeLikes = () => {
  const truth = { requests: [] as string[], liked: new Map<string, boolean>() }
  return {
    truth,
    layer: Layer.succeed(LikesApi, {
      set: (id, liked, { idempotencyKey }) => Effect.sleep("300 millis").pipe(Effect.andThen(Effect.sync(() => {
        truth.requests.push(`${idempotencyKey}:${liked}`); truth.liked.set(id, liked); return { count: liked ? 1 : 0 }
      }))),
    }),
  }
}

// ── harness ────────────────────────────────────────────────────────────────────────────────────────────────────
let failures = 0
const check = (ok: boolean, what: string) => { if (!ok) failures++; console.log(`   ${ok ? "PASS" : "FAIL"} ${what}`) }
const run = <F extends { layer: Layer.Layer<any> }>(title: string, fixture: () => F, body: (f: F) => Effect.Effect<string[], never, any>) => {
  const f = fixture()
  return Effect.runPromise(body(f).pipe(Effect.provide(Layer.merge(f.layer, TestClock.layer()))) as Effect.Effect<string[]>).then((trace) => {
    console.log(`\n${title}`)
    for (const line of trace) console.log("   " + line)
    return f
  })
}

const main = async () => {
  // ── P1: the mailbox race. StopWaiting (15.000 s) and WrongCode (15.005 s) both queue before the next turn.
  for (const legacy of [{}, { routeAtSettlement: true }] as Legacy[]) {
    let strikes = {} as Readonly<Record<string, number>>
    await run(`P1 mailbox race: ${legacy.routeAtSettlement ? "OLD (outcomes/abandoned chosen at settlement)" : "NEW (routed when the turn is admitted)"}`,
      () => fakeAuth({ answerAtMs: 15_005, status: 401 }),
      () => Effect.gen(function* () {
        const a = makeActor(SignIn, { legacy })
        yield* a.boot
        yield* a.send({ _tag: "Submit" })
        yield* a.advance(14_990)
        yield* a.advanceHeld(30)   // the main thread is busy: both arrivals wait in the mailbox
        yield* a.process
        strikes = a.memory.strikes
        return a.trace
      }))
    if (legacy.routeAtSettlement) check(strikes.c1 === undefined, "old rule: the strike is lost (reproduces correctness C1)")
    else check(strikes.c1 === 1, "the late WrongCode strikes its own challenge at the root")
  }

  // ── P2: send 1 is unknown but the server charges; re-sends meet 429 (key still running), classified as Busy.
  for (const legacy of [{}, { perSendFailure: true }] as Legacy[]) {
    let state = ""
    const f = await run(`P2 unknown then failure: ${legacy.perSendFailure ? "OLD (a failure on a re-send is definite)" : "NEW (the Attempt's ending: failure after unknown stays unknown)"}`,
      () => fakeStripe({ processingMs: 10_000, dropFirst: true }),
      () => Effect.gen(function* () {
        const a = makeActor(Checkout, { legacy })
        yield* a.boot
        yield* a.send({ _tag: "Pay" })
        let repaid = false
        for (let t = 0; t < 30_000; t += 500) {
          yield* a.advance(500)
          if (a.state === "CARD" && !repaid) { repaid = true; a.trace.push(`         user reads "${a.memory.error}" and presses Pay again`); yield* a.send({ _tag: "Pay" }) }
        }
        state = a.state
        return a.trace
      }))
    console.log(`   server truth: charges=${f.truth.charges} keys=${JSON.stringify(f.truth.keys)}`)
    if (legacy.perSendFailure) check(f.truth.charges === 2, "old rule: the card is charged twice (reproduces correctness C3)")
    else check(f.truth.charges === 1 && state === "DONE", "charged once; the machine never said 'not charged'")
  }

  // ── P3: the 3 s timeout fires at 3.000 s and the success arrives at 3.005 s, both before the next turn.
  for (const legacy of [{}, { pendingUntilSettlement: true }] as Legacy[]) {
    let out = { state: "", error: null as string | null }
    const f = await run(`P3 timeout racing the ending: ${legacy.pendingUntilSettlement ? "OLD (.pending false at settlement)" : "NEW (.pending until the ending's turn; cancel never rewrites a settled ending)"}`,
      () => fakeStripe({ processingMs: 2_805 }),
      () => Effect.gen(function* () {
        const a = makeActor(Checkout, { legacy })
        yield* a.boot
        yield* a.send({ _tag: "Pay" })
        yield* a.advance(2_990)
        yield* a.advanceHeld(30)
        yield* a.process
        yield* a.advance(1_000)
        out = { state: a.state, error: a.memory.error }
        return a.trace
      }))
    console.log(`   server truth: charges=${f.truth.charges}; screen: ${out.state} "${out.error ?? ""}"`)
    if (legacy.pendingUntilSettlement) check(out.state === "CARD" && f.truth.charges === 1, "old rule: 'You were not charged' shown, but the card was charged")
    else check(out.state === "DONE" && f.truth.charges === 1, "the real ending wins: DONE, charged once")
  }
  // P3b: the timeout really interrupts a running send: unknown(Cancelled), then reconciled with the same Attempt.
  {
    let state = ""
    const f = await run("P3b timeout before the ending: cancel → unknown(Cancelled) → same Attempt again",
      () => fakeStripe({ processingMs: 5_000 }),
      () => Effect.gen(function* () {
        const a = makeActor(Checkout)
        yield* a.boot
        yield* a.send({ _tag: "Pay" })
        yield* a.advance(12_000)
        state = a.state
        return a.trace
      }))
    console.log(`   server truth: charges=${f.truth.charges} keys=${JSON.stringify(f.truth.keys)}`)
    check(f.truth.charges === 1 && state === "DONE", "charged once, reconciled by key")
  }

  // ── P5: Save, leave, come back, Save again while the first is in flight. No `!pending` guard in the machine.
  for (const legacy of [{}, { silentReject: true }] as Legacy[]) {
    let out = { state: "", verdict: "" }
    const f = await run(`P5 decline: ${legacy.silentReject ? "OLD (reject declines silently)" : "NEW (reject is an implicit guard: Denied InFlight)"}`,
      () => fakeDocs(),
      () => Effect.gen(function* () {
        const a = makeActor(Shell, { legacy })
        yield* a.boot
        yield* a.send({ _tag: "Edit", body: "v1" })
        yield* a.send({ _tag: "Save" })
        yield* a.advance(200)
        yield* a.send({ _tag: "OpenList" })
        yield* a.send({ _tag: "OpenDoc" })
        yield* a.send({ _tag: "Edit", body: "v2" })
        const verdict = a.check({ _tag: "Save" })
        a.trace.push(`         check(Save) = ${verdict}   (what the view's button reads)`)
        yield* a.send({ _tag: "Save" })
        yield* a.advance(5_000)
        out = { state: a.state, verdict }
        return a.trace
      }))
    console.log(`   server truth: puts=${f.truth.puts}; final state ${out.state}`)
    if (legacy.silentReject) check(out.state === "DOC.SAVING", "old rule: SAVING waits forever (reproduces correctness C5)")
    else check(out.verdict === `Denied ["InFlight"]` && out.state === "DOC.EDITING", "the second Save is Denied and the user stays in EDITING")
  }

  // ── P6 (+P21): Busy with Retry-After, then the same Attempt again. Its ending arrives through the call's own events.
  for (const legacy of [{}, { sameWireKey: true }] as Legacy[]) {
    let state = ""
    const f = await run(`P6 retry mapping: ${legacy.sameWireKey ? "OLD wire key (the Attempt id again: the server replays its cached 503)" : "NEW (pay.retry(): same Attempt, same outcomes, fresh wire key after a definite failure)"}`,
      () => fakeStripe({ processingMs: 300, script: [{ status: 503, retryAfterMs: 2_000 }], cacheFailures: true }),
      () => Effect.gen(function* () {
        const a = makeActor(Checkout, { legacy })
        yield* a.boot
        yield* a.send({ _tag: "Pay" })
        yield* a.advance(12_000)
        state = a.state
        return a.trace
      }))
    console.log(`   server truth: charges=${f.truth.charges} keys=${JSON.stringify(f.truth.keys)}`)
    if (legacy.sameWireKey) check(f.truth.charges === 0 && state === "CARD", "old key: the cached failure comes back every time (reproduces correctness C12)")
    else check(f.truth.charges === 1 && state === "DONE", "Busy(a1#1) → WAITING 2 s (from Retry-After) → retry → Paid(a1#2), mapped by the same outcomes")
  }

  // ── P8: cancel an upload whose body is already going; clean up.
  for (const tombstones of [false, true]) {
    let state = ""
    const f = await run(`P8 cancel then clean-up: ${tombstones ? "NEW (discard by the Attempt's key; the server refuses a later arrival)" : "OLD (discard by ref: whatever is there now)"}`,
      () => fakeUploads({ tombstones }),
      () => Effect.gen(function* () {
        const a = makeActor(Upload)
        yield* a.boot
        yield* a.send({ _tag: "Pick" })
        yield* a.advance(500)
        yield* a.send({ _tag: "Cancel" })
        yield* a.advance(3_000)
        state = a.state
        return a.trace
      }))
    console.log(`   server truth: files=${f.truth.files.size} refused=${f.truth.refused}; final state ${state}`)
    if (tombstones) check(f.truth.files.size === 0 && state === "CANCELLED", "no orphan: the upload that lands at 2 s is refused")
    else check(f.truth.files.size === 1, "old clean-up: the file lands after the discard (reproduces correctness C8)")
  }

  // ── P16 (+P11, P13): three rapid toggles under `latest`; the middle one never leaves and ends NotSent(Superseded).
  {
    let desired: boolean | undefined
    const f = await run("P16 latest coalescing: Toggle at 0, 50, 100 ms; each request takes 300 ms",
      () => fakeLikes(),
      () => Effect.gen(function* () {
        const a = makeActor(Likes)
        yield* a.boot
        yield* a.send({ _tag: "Toggle", id: "i1" })
        yield* a.advance(50)
        yield* a.send({ _tag: "Toggle", id: "i1" })
        yield* a.advance(50)
        yield* a.send({ _tag: "Toggle", id: "i1" })
        yield* a.advance(1_000)
        desired = a.memory.desired.i1
        return a.trace
      }))
    console.log(`   server truth: requests=${JSON.stringify(f.truth.requests)} liked=${f.truth.liked.get("i1")}`)
    check(f.truth.requests.length === 2 && f.truth.liked.get("i1") === desired, "two requests; the server ends at the last click")
  }

  // ── P4: compensation after leaving. The late success moves an idle LEFT to REFUNDING; the refund's own ending moves on.
  {
    let out = { state: "", refundId: null as string | null }
    const refunds = { count: 0 }
    const f = await run("P4 compensation chain: leave mid-charge, the charge lands, refund, REFUNDED",
      () => {
        const s = fakeStripe({ processingMs: 800 })
        return { truth: s.truth, layer: Layer.merge(s.layer, Layer.succeed(RefundsApi, { refund: (_id, { idempotencyKey }) => Effect.sleep("300 millis").pipe(Effect.andThen(Effect.sync(() => (refunds.count++, { refundId: `re_${idempotencyKey}` })))) })) }
      },
      () => Effect.gen(function* () {
        const a = makeActor(Booking)
        yield* a.boot
        yield* a.send({ _tag: "Pay" })
        yield* a.advance(300)
        yield* a.send({ _tag: "Leave" })
        yield* a.advance(3_000)
        out = { state: a.state, refundId: a.memory.refundId }
        return a.trace
      }))
    console.log(`   server truth: charges=${f.truth.charges} refunds=${refunds.count}`)
    check(out.state === "REFUNDED" && refunds.count === 1, "the refund started by a late turn finishes (v4 rule 6 forbade it)")
  }

  // ── P11: cancel before the adapter is called (the Attempt is still being stored, Persistence O6): NotSent.
  {
    let state = ""
    const f = await run("P11 NotSent is producible: cancel while the Attempt's storage ack is pending (50 ms)",
      () => fakeUploads({ tombstones: true }),
      () => Effect.gen(function* () {
        const a = makeActor(Upload, { ackDelayMs: 50 })
        yield* a.boot
        yield* a.send({ _tag: "Pick" })
        yield* a.advance(20)
        yield* a.send({ _tag: "Cancel" })
        yield* a.advance(3_000)
        state = a.state
        return a.trace
      }))
    console.log(`   server truth: files=${f.truth.files.size}; final state ${state}`)
    check(state === "CANCELLED" && f.truth.files.size === 0, "NotSent → UploadNotSent: nothing left the device, no clean-up needed")
  }

  console.log(`\n${failures === 0 ? "all stories pass" : `${failures} FAILED`}`)
  if (failures) throw new Error("stories failed")
}
main()
