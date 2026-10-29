import { Effect } from "effect"
import { classify, Outcome } from "./outcome.ts"

class NoResponse { readonly _tag = "NoResponse" }
class OutOfStock { readonly _tag = "OutOfStock" }
class Invalid { readonly _tag = "Invalid" }

const cases = {
  success: Outcome.success({ id: "o1" }),
  failure: Effect.fail(Outcome.failure(new OutOfStock())),
  plainError: Effect.fail(new Invalid()),
  unknown: Effect.fail(Outcome.unknown(new NoResponse())),
  viaCatch: Effect.try({ try: () => { throw 1 }, catch: () => Outcome.unknown(new NoResponse()) }),
  thrown: Effect.sync(() => { throw new Error("bug") }),
  interrupted: Effect.interrupt,
  failThenDie: Effect.fail(new Invalid()).pipe(Effect.ensuring(Effect.die("finalizer bug"))),
}
for (const [name, eff] of Object.entries(cases)) {
  const exit = Effect.runSyncExit(eff as Effect.Effect<unknown, unknown>)
  const c = classify(exit) as any
  console.log(name.padEnd(12), "→", c._tag, c._tag === "Success" ? JSON.stringify(c.value) : c.reason?._tag ?? c.reason?.constructor?.name)
}
