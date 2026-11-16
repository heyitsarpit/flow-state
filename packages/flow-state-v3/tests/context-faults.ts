import type { Fault } from "./faults.ts";

/**
 * Planted faults of context, its waves and the admission that binds it, each with the tests that
 * must catch it.
 */
export const contextFaults: ReadonlyArray<Fault> = [
  {
    name: "context-update-skips-mailbox",
    tests: ["tests/actors/context.test.ts"],
    says: "a provider's change updates each consumer at once, mid-wave, so a diamond's consumer mixes a new value with a stale one",
    rule: "Actors I27",
    edits: [
      {
        file: "src/core/context.ts",
        find: "        if (!waiting) tx.enqueue(Mail.Context({ actor: consumer.actor }));",
        replace: "        if (!waiting) update(consumer.actor);",
      },
    ],
  },
  {
    name: "equal-context-not-silent",
    tests: ["tests/actors/context.test.ts"],
    says: "a wave whose selections are equal still runs the reactions and enqueues their events",
    rule: "Turn R22",
    edits: [
      {
        file: "src/core/context.ts",
        find: "    if (!changed && incarnation.stale.size === 0) {",
        replace: "    if (changed && !changed) {",
      },
      {
        file: "src/core/context.ts",
        find: "      if (Option.exists(previous, (p) => Equal.equals(p, current.success))) continue;",
        replace: "",
      },
    ],
  },
  {
    name: "consumer-not-a-use",
    tests: ["tests/actors/context.test.ts"],
    says: "a bound consumer holds no use of its provider, so the provider ends under it",
    rule: "Actors R18",
    edits: [
      {
        file: "src/core/context.ts",
        find: '        needs.ensure(provider, Option.some("context"));',
        replace: "        needs.ensure(provider, Option.none());",
      },
    ],
  },
  {
    name: "throwing-selector-drops-value",
    tests: ["tests/actors/context.test.ts"],
    says: "a selector that throws loses its slot's last valid value",
    rule: "Actors R19",
    edits: [
      {
        file: "src/core/context.ts",
        find: "      else values.set(slot, value.success);",
        replace: "      values.set(slot, Result.getOrUndefined(value));",
      },
    ],
  },
  {
    name: "context-cycle-admitted",
    tests: ["tests/actors/context.test.ts"],
    says: "a provider graph that reaches an actor again is admitted",
    rule: "Actors I28",
    edits: [
      {
        file: "src/host/wiring.ts",
        find: "      if (path.includes(key))",
        replace: "      if (path.length < 0)",
      },
    ],
  },
  {
    name: "provider-disposed-under-consumers",
    tests: ["tests/actors/context.test.ts"],
    says: "a provider with bound consumers is disposed",
    rule: "Actors R20",
    edits: [
      {
        file: "src/host/runtime.ts",
        find: "        dependents.length > 0 &&",
        replace: "        dependents.length < 0 &&",
      },
    ],
  },
  {
    name: "conflicting-ref-admitted",
    tests: ["tests/actors/context.test.ts"],
    says: "a ref with other context than its live identity's is admitted",
    rule: "Actors R5",
    edits: [
      {
        file: "src/host/runtime.ts",
        find: "      if (conflicting)",
        replace: "      if (conflicting && !conflicting)",
      },
    ],
  },
  {
    name: "owed-wave-publishes-unchanged",
    tests: ["tests/session/workspace.test.ts", "tests/session/session.test.ts"],
    says: "an owed wave that changes no slot publishes the start's snapshot again",
    rule: "Turn I9",
    edits: [
      {
        file: "src/core/context.ts",
        find: "    if (changed || after.issues !== incarnation.issues) needs.publish(after);",
        replace: "    needs.publish(after);",
      },
    ],
  },
  {
    name: "unencodable-slot-withholds-record",
    tests: ["tests/session/workspace.test.ts"],
    says: "a context slot whose last-seen value cannot be encoded withholds its consumer's whole record",
    rule: "Actors R18",
    edits: [
      {
        file: "src/core/record.ts",
        find: "      json: Option.flatMap(last, (v) => Result.getSuccess(toCanonicalJson(v))),",
        replace: "      json: Option.flatMap(last, (v) => Option.some(v)),",
      },
    ],
  },
  {
    name: "unknown-slot-owes-no-wave",
    tests: ["tests/session/workspace.test.ts"],
    says: "a start from a record whose slot was saved unknown owes no wave, so a change it missed is never heard",
    rule: "Actors R9",
    edits: [
      {
        file: "src/core/context.ts",
        find: "          !Option.exists(last, (v) => Equal.equals(v, incarnation.context.get(slot))),",
        replace:
          "          !Option.getOrElse(Option.map(last, (v) => Equal.equals(v, incarnation.context.get(slot))), () => true),",
      },
    ],
  },
  {
    name: "known-slot-owes-a-wave",
    tests: ["tests/session/workspace.test.ts"],
    says: "every saved slot owes a wave at a start, so a slot whose saved value is unchanged is heard again",
    rule: "Actors R9",
    edits: [
      {
        file: "src/core/context.ts",
        find: "          !Option.exists(last, (v) => Equal.equals(v, incarnation.context.get(slot))),",
        replace: "          Option.isSome(last),",
      },
    ],
  },
  {
    name: "start-publishes-saved-context",
    tests: ["tests/session/workspace.test.ts"],
    says: "a start from a record publishes the context its record saw, not its providers' current one",
    rule: "Actors R18",
    edits: [
      {
        file: "src/core/context.ts",
        find: "    return { ...incarnation, stale, baselines: baselinesOf(compiled, incarnation, stale) };",
        replace:
          "    const context = new Map([...incarnation.context].map(([slot, v]) => [slot, Option.getOrElse(stale.get(slot) ?? Option.some(v), () => v)]));\n    return { ...incarnation, context, stale, baselines: baselinesOf(compiled, incarnation, stale) };",
      },
    ],
  },
  {
    name: "deferred-update-moves-to-end",
    tests: ["src/core/serve.test.ts"],
    says: "a context update deferred for unsettled providers goes behind the mail queued after it",
    rule: "Actors R19",
    edits: [
      {
        file: "src/core/serve.ts",
        find: "    tx.enqueueFirst([mail]);",
        replace: "    tx.enqueue(mail);",
      },
    ],
  },
  {
    name: "story-dispose-skips-admission",
    tests: ["tests/session/session.test.ts", "tests/pay/store.test.ts"],
    says: "a Story's dispose goes past the Runtime's admission, so a provider with bound consumers is disposed",
    rule: "Stories R3",
    edits: [
      {
        file: "src/host/testing/run.ts",
        find: "          tab.built.admission.dispose(actor);\n",
        replace: "",
      },
    ],
  },
  {
    name: "story-ensure-skips-admission",
    tests: ["tests/session/workspace.test.ts"],
    says: "a Story's ensure goes past the Runtime's admission, so a missing provider or a conflicting ref is admitted",
    rule: "Stories R3",
    edits: [
      {
        file: "src/host/testing/run.ts",
        find: "      Option.some(tab.built.admission.ensure(actor, context)),",
        replace: "      context.size === 0 ? Option.none() : Option.some(context),",
      },
    ],
  },
  {
    name: "generator-disposes-providers",
    tests: ["tests/generated/pairs-0.test.ts"],
    says: "the generator and the pair sweep dispose a provider whose consumers are live, which the Runtime refuses",
    rule: "Stories R3",
    edits: [
      {
        file: "src/host/testing/generate.ts",
        find: "  const order = [...view.dependents(actor).flatMap((d) => closing(view, d)), actor];",
        replace: "  const order = [actor];",
      },
    ],
  },
  {
    name: "context-follow-ups-capped",
    tests: ["tests/actors/follow-ups.test.ts"],
    says: "context updates and onContext events count toward 64 follow-ups, and those past it are dropped",
    rule: "Actors R13",
    edits: [
      {
        file: "src/core/serve.ts",
        find: "      if (!deferred(followUp))",
        replace: "      if (!deferred(followUp) && count <= 64)",
      },
    ],
  },

  {
    name: "wave-reads-unsettled-providers",
    tests: ["tests/actors/context.test.ts"],
    says: "a context update reads its providers while one of them still has mail of the same wave",
    rule: "Actors R19",
    edits: [
      {
        file: "src/core/serve.ts",
        find: '    if (!Mail.$is("Context")(mail) || !incarnations.context.settling(mail.actor)) return false;',
        replace: "    if (mail.actor.name.length >= 0) return false;",
      },
    ],
  },
  {
    name: "return-without-wave",
    tests: ["tests/actors/context.test.ts"],
    says: "a persisted consumer returning after its provider changed gets no onContext wave",
    rule: "Actors R9",
    edits: [
      {
        file: "src/core/incarnations.ts",
        find: "    if (bound.stale.size > 0) enqueue(Mail.Context({ actor }));",
        replace:
          '    if (bound.stale.size > 0 && actor.name === "") enqueue(Mail.Context({ actor }));',
      },
    ],
  },
  {
    name: "record-forgets-seen-context",
    tests: ["tests/actors/context.test.ts"],
    says: "an actor record saves no last-seen context, so a return after a reload compares against nothing it saw",
    rule: "Actors R18",
    edits: [
      {
        file: "src/core/record.ts",
        find: "        seen: Object.fromEntries(",
        replace: "        seen: {},\n        dropped: Object.fromEntries(",
      },
    ],
  },
  {
    name: "wave-events-behind-mail",
    tests: ["tests/actors/context.test.ts"],
    says: "a context update's reaction events go behind the mail already queued, after the event that returned the actor",
    rule: "Actors R9",
    edits: [
      {
        file: "src/core/context.ts",
        find: "    tx.enqueueFirst(events.map((event) => Mail.Event({ actor, ...event })));",
        replace: "    for (const event of events) tx.enqueue(Mail.Event({ actor, ...event }));",
      },
    ],
  },

  {
    name: "foreign-context-ref-accepted",
    tests: ["tests/actors/context.test.ts"],
    says: "a context ref of a machine this Runtime's app does not run binds",
    rule: "Actors R24",
    edits: [
      {
        file: "src/host/wiring.ts",
        find: "    if (machines.get(ref.machine.compiled.id) !== ref.machine)",
        replace: "    if (machines.get(ref.machine.compiled.id) === undefined)",
      },
    ],
  },
  {
    name: "story-ensure-drops-ref-context",
    tests: ["tests/actors/context.test.ts"],
    says: "a Story's ensure binds its entry's default providers, dropping the ref's context",
    rule: "Actors R18",
    edits: [
      {
        file: "src/host/testing/run.ts",
        find: "      Option.some(tab.built.admission.ensure(actor, context)),",
        replace: "      Option.some(tab.built.admission.ensure(actor, new Map())),",
      },
    ],
  },
];
