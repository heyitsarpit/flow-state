// Second-choice evidence: Effect's Stream.callback at the bound, real run.
import { Effect, Queue, Stream } from "effect"
const run = (strategy: "suspend" | "dropping" | "sliding") => Effect.gen(function* () {
  const results: boolean[] = []
  const s = Stream.callback<number>((q) => Effect.sync(() => {
    for (const i of [1, 2, 3, 4]) results.push(Queue.offerUnsafe(q, i))
    Queue.endUnsafe(q)
  }), { bufferSize: 2, strategy })
  const out = yield* Stream.runCollect(s)
  console.log(strategy, "offered returned", results, "delivered", [...out], "stream failed: no")
})
Effect.runPromise(Effect.gen(function* () { yield* run("suspend"); yield* run("dropping"); yield* run("sliding") }))
