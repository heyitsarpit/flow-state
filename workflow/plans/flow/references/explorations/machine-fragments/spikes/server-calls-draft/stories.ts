// Stories: a fixture replaces the PaymentsApi service; the controlled clock moves time. No outcome is injected.
import { Deferred, Effect, Layer } from "effect"
import * as TestClock from "effect/testing/TestClock"
import { charge, makeCalls, ok, PaymentsApi, type Attempt, type HttpResult } from "./calls.ts"

// A stateful fake server: 100 ms to arrive, 400 ms to process, 100 ms back. It honours idempotency keys.
const fakeServer = (opts: { wired: boolean; script?: HttpResult[] }) => {
  const truth = { applied: 0, received: 0, byKey: new Map<string, HttpResult>() }
  const script = [...(opts.script ?? [])]
  const handle = (key: string, cents: number) => Effect.gen(function* () {
    truth.received++
    yield* Effect.sleep("400 millis")
    const seen = truth.byKey.get(key)
    if (seen) return seen                                  // a re-sent Attempt gets the original answer
    const res = script.shift() ?? { status: 200, body: { chargeId: `ch_${key}` } }
    if (res.status === 200) { truth.applied++; truth.byKey.set(key, res) }
    void cents
    return res
  })
  const layer = Layer.succeed(PaymentsApi, {
    charge: (body, { idempotencyKey }) => Effect.gen(function* () {
      const answer = yield* Deferred.make<HttpResult>()
      const travel = Effect.sleep("100 millis").pipe(Effect.andThen(handle(idempotencyKey, body.cents)), Effect.flatMap((r) => Deferred.succeed(answer, r)))
      if (opts.wired) yield* Effect.forkChild(travel)       // wired: interrupting the client stops the request in flight
      else yield* Effect.forkDetach(travel)                  // not wired: the request goes anyway
      const r = yield* Deferred.await(answer)
      yield* Effect.sleep("100 millis")
      return r
    }),
  })
  return { truth, layer }
}

type Ev = any
const story = (name: string, opts: Parameters<typeof fakeServer>[0], body: (t: {
  calls: ReturnType<typeof makeCalls<Ev>>; mailbox: Array<{ late: boolean; event: Ev }>; owner: { active: boolean }
  start: (prev?: Attempt<{ cents: number }>, abandoned?: boolean) => Effect.Effect<Attempt<{ cents: number }>>
}) => Effect.Effect<void>) => {
  const server = fakeServer(opts)
  const mailbox: Array<{ late: boolean; event: Ev }> = []
  const calls = makeCalls<Ev>(mailbox)
  const owner = { active: true }
  const start = (prev?: Attempt<{ cents: number }>, abandoned = true) =>
    calls.start(charge, { cents: 500 }, { outcomes: ok, abandoned: abandoned ? { success: (v) => ({ _tag: "ChargedAfterLeaving", chargeId: v.chargeId }) } : undefined }, owner, prev) as Effect.Effect<Attempt<{ cents: number }>>
  return Effect.runPromise(body({ calls, mailbox, owner, start }).pipe(Effect.provide(Layer.merge(server.layer, TestClock.layer())))).then(() =>
    console.log(name.padEnd(34), JSON.stringify(mailbox.map((m) => (m.late ? "late:" : "") + m.event._tag + (m.event.attempt ? `(${m.event.attempt.id}#${m.event.attempt.sends})` : ""))), "server:", JSON.stringify({ received: server.truth.received, applied: server.truth.applied })))
}

const run = async () => {
  await story("1 success", { wired: true }, ({ start }) => Effect.gen(function* () {
    yield* start(); yield* TestClock.adjust("1 second")
  }))

  await story("2 Busy → wait Retry-After → re-send", { wired: true, script: [{ status: 503, retryAfterMs: 2000 }] }, ({ start, mailbox }) => Effect.gen(function* () {
    yield* start(); yield* TestClock.adjust("1 second")
    const busy = mailbox.at(-1)!.event                     // the machine's Busy handler: a schedule armed with event.retryAfterMs
    yield* TestClock.adjust(`${busy.retryAfterMs} millis`)
    yield* start(busy.attempt); yield* TestClock.adjust("1 second")   // its firing runs O.Payments.charge.retry(attempt)
  }))

  await story("3 cancel at 50ms, signal wired", { wired: true }, ({ start, calls, mailbox }) => Effect.gen(function* () {
    const a = yield* start(); yield* TestClock.adjust("50 millis"); yield* calls.cancel(a.id); yield* TestClock.adjust("2 seconds")
    yield* start(mailbox.at(-1)!.event.attempt); yield* TestClock.adjust("1 second")   // reconcile: same Attempt
  }))

  await story("4 cancel at 50ms, signal NOT wired", { wired: false }, ({ start, calls, mailbox }) => Effect.gen(function* () {
    const a = yield* start(); yield* TestClock.adjust("50 millis"); yield* calls.cancel(a.id); yield* TestClock.adjust("2 seconds")
    yield* start(mailbox.at(-1)!.event.attempt); yield* TestClock.adjust("1 second")
  }))

  await story("5 leave mid-call, abandoned mapped", { wired: true }, ({ start, owner }) => Effect.gen(function* () {
    yield* start(); yield* TestClock.adjust("200 millis"); owner.active = false; yield* TestClock.adjust("1 second")
  }))

  await story("6 leave mid-call, nothing mapped", { wired: true }, ({ start, owner }) => Effect.gen(function* () {
    yield* start(undefined, false); yield* TestClock.adjust("200 millis"); owner.active = false; yield* TestClock.adjust("1 second")
  }))
}
run()
