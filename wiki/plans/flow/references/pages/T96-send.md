---
page T96-send
description A machine can send another actor a command from inside a transition, as a rare escape hatch.
---
# Actor-to-actor send: what an app author notices (T96, 2026-11-19)

**Bottom line:** a machine can now tell another actor to do something, from inside a transition, with `send`. It is
a rare escape hatch: read another actor's data through context first, and send only a genuine command.

## How it looks

```ts
import { Pay, PayMachine } from "./pay.ts"                  // the target's definition and machine
const toPay = () => actorRef(PayMachine, "checkout-1")      // existing: actorRef

PayWith: {
  actions: [
    send(toPay, Pay.E.PayRequested.from(({ event }) => ({ paymentMethodId: event.paymentMethodId }))),
    // NEW: send   existing: Pay.E.X.from(fn), the same form operations use
  ],
},
Cancel: { actions: [send(toPay, Pay.E.Cancel())] },         // a constant payload: call the token
// The callback form also works: send(toPay, ({ event }) => ({ _tag: "PayRequested", ... }))
```

The event's type comes from the target, so a wrong tag, field or another machine's internal event fails to compile.
A send always names its target with a ref; it never guesses one.

## What happens

| The target is                                                | What happens                                                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Live                                                         | It hears the event as its own next turn, after the sender's turn commits |
| Ending and persisted                                         | Queued for its next life                                                 |
| Ended, persisted, record readable                            | Restored, then hears it                                                  |
| Not persisted and gone, never created, disposed or forgotten | Dropped; the sender's evidence names `NoRecord`                          |
| Being disposed                                               | Dropped with `NoRecord`                                                  |
| Its saved record can't be read                               | Dropped with `RecordUndecodable`                                         |

A send never creates an actor or adopts a lazy one, never counts as a use, and never rolls back the sender's turn.
Several sends arrive in order. A bad target name or an event the target refuses refuses the sender's turn
(`InvalidTurn`).

## Loops

Two machines may send to each other. One admitted event may cause at most `loopGuard` (5,000) sends in all, across
every actor its context update reaches; the turn that would send one more is refused, naming the event. Context
updates themselves never count.

## Known gaps

- Two machines that send to each other need one side annotated as `Machine<typeof Def>`, or TypeScript can't
  infer their types.
- "A lazy entry not adopted" waits for lazy entries (@task.V3.T48); "a persisted actor while the Runtime boots" is
  owed by @task.V3.T99.
- For your call: the `Shop/Subscription` fixture (a weekly renewal sending to its Pay) fits "The right tool" only
  weakly, and its renewals never come due in generated runs.
