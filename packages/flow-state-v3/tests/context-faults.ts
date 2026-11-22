import type { Fault } from "./faults.ts";

/**
 * Planted faults of context, its waves and the admission that binds it, each with the tests that
 * must catch it.
 */
export const contextFaults: ReadonlyArray<Fault> = [
  {
    name: "provider-loses-ref-override",
    tests: ["tests/session/workspace.test.ts"],
    says: "a provider started for a consumer binds its entry's defaults, not the overrides its ref gave",
    rule: "Actors R18",
    edits: [
      {
        file: "src/host/wiring.ts",
        find: "new Map([...inherited, ...overrides])",
        replace: "new Map<string, ReadonlyMap<string, ActorId>>()",
      },
    ],
  },
  {
    name: "mix-acts-on-closed-screens",
    tests: ["tests/generated/mix.test.ts"],
    says: "the mix sends to actors no one uses, so a reload that attaches nothing leaves its apps unreachable",
    rule: "Testing O6",
    edits: [
      {
        file: "src/host/testing/generate.ts",
        find: '    drawing === "mix" && step._tag === "send" && view.uses(step.actor) === 0',
        replace: '    drawing === "drive" && step._tag === "send" && view.uses(step.actor) === 0',
      },
    ],
  },
  {
    name: "baseline-saved-as-slot",
    tests: ["tests/session/values.test.ts", "tests/actors/context.test.ts"],
    says: "a record saves no reaction's own baseline, so a baseline a defect kept reads back as its slot's last value and a reload makes up an event",
    rule: "Actors R18",
    edits: [
      {
        file: "src/core/actor-record.ts",
        find: "    if (!sameForm(baseline, Option.fromUndefinedOr(record.seen.get(reaction.slot))))",
        replace: "    if (!sameForm(baseline, baseline))",
      },
    ],
  },
  {
    name: "record-forgets-provider-graph",
    tests: ["tests/session/values.test.ts"],
    says: "an actor record saves no provider graph, so a provider started again for it binds its entry's defaults",
    rule: "Actors R18",
    edits: [
      {
        file: "src/core/persist.ts",
        find: "    graph,\n  });",
        replace: "    graph: new Map(),\n  });",
      },
    ],
  },
  {
    name: "nested-conflict-admitted",
    tests: ["tests/session/values.test.ts"],
    says: "only the ensured identity is checked for conflicting context, so a nested ref naming a live provider with other context is admitted",
    rule: "Actors R5",
    edits: [
      {
        file: "src/host/runtime.ts",
        find: "      if (conflicting !== undefined) {",
        replace: "      if (conflicting !== undefined && conflicting[0] === actorKey(actor)) {",
      },
    ],
  },
  {
    name: "format-one-drops-forms",
    tests: ["src/core/actor-record.test.ts"],
    says: "the format-1 step refuses a saved Option none, so the record is quarantined",
    rule: "Restore R5",
    edits: [
      {
        file: "src/core/actor-record.ts",
        find: '  ["none", () => Result.succeed(Option.none())],',
        replace: '  ["none", () => notAForm],',
      },
    ],
  },
  {
    name: "never-selected-slot-heard-as-same",
    tests: ["tests/actors/context.test.ts"],
    says: "a reaction with no baseline owes its slot's value nothing, so a return never hears a slot's first value",
    rule: "Actors R9",
    edits: [
      {
        file: "src/core/context.ts",
        find: "      onNone: () => true,\n      onSome: (b) => !sameValue(b.value, c.value),",
        replace: "      onNone: () => false,\n      onSome: (b) => !sameValue(b.value, c.value),",
      },
    ],
  },
  {
    name: "defect-moves-baseline",
    tests: ["tests/actors/context.test.ts"],
    says: "a when or mapper defect still moves its reaction's baseline",
    rule: "Turn R22",
    edits: [
      {
        file: "src/core/context.ts",
        find: "        onFailure: (slot) => {\n          outcomes.push(",
        replace:
          "        onFailure: (slot) => {\n          baselines[at] = Option.some(current);\n          outcomes.push(",
      },
    ],
  },
  {
    name: "context-update-skips-mailbox",
    tests: ["tests/actors/context.test.ts"],
    says: "a provider's change updates each consumer at once, mid-wave, so a diamond's consumer mixes a new value with a stale one",
    rule: "Actors I27",
    edits: [
      {
        file: "src/core/apply.ts",
        find: "            context.wave(incarnation.actor);",
        replace:
          "            for (const consumer of tx.consumersOf(incarnation.actor)) for (const read of Option.toArray(context.inputsOf(consumer))) apply(Option.some(consumer), Change.Inputs({ read }));",
      },
    ],
  },
  {
    name: "equal-context-not-silent",
    tests: ["tests/actors/context.test.ts"],
    says: "a wave whose values are equal still runs the reactions and enqueues their events",
    rule: "Turn R22",
    edits: [
      {
        file: "src/core/context.ts",
        find: "    if (!changed && !owes(view)) {",
        replace: "    if (changed && !changed) {",
      },
      {
        file: "src/core/context.ts",
        find: "      if (Option.exists(previous, (p) => sameValue(p.value, current.value))) {\n        baselines[at] = Option.some(current);\n        outcomes.push(...clear(read.issues, source));\n        continue;\n      }\n",
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
        find: '        needs.ensure(provider, Option.some("context"), graph);',
        replace: "        needs.ensure(provider, Option.none(), graph);",
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
        find: "      if (Result.isSuccess(value)) {\n        values.set(slot, value.success);",
        replace:
          "      if (Result.isFailure(value)) values.delete(slot);\n      if (Result.isSuccess(value)) {\n        values.set(slot, value.success);",
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
        find: "      if (conflicting !== undefined) {",
        replace: "      if (conflicting !== undefined && conflicting[0] !== actorKey(actor)) {",
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
        file: "src/core/change.ts",
        find: "    Inputs: () => false,",
        replace: "    Inputs: () => true,",
      },
    ],
  },
  {
    name: "changed-slot-owes-no-wave",
    tests: ["tests/actors/context.test.ts"],
    says: "a start from a record takes its providers' current values as its baselines, so a change it missed is never heard",
    rule: "Actors R9",
    edits: [
      {
        file: "src/core/apply.ts",
        find: "        onSome: (r) => context.restoredBaselines(actor, r),",
        replace: "        onSome: () => bound.baselines,",
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
        file: "src/core/apply.ts",
        find: "      context: bound.context,",
        replace: "      context: new Map([...bound.context, ...saved]),",
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
        find: "      if (passedOver(key)) tx.rotate(key);",
        replace:
          '      if (passedOver(key)) { const later = tx.takeOldest(key, "rotate"); if (later !== undefined) tx.enqueue(later); }',
      },
    ],
  },
  {
    name: "story-dispose-skips-admission",
    tests: ["tests/session/session.test.ts", "tests/shop/store.test.ts"],
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
        find: "      Option.some(on.built.admission.ensure(actor, context)),",
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
    says: "context updates count toward a cap of 32 follow-ups, and those past it are dropped",
    rule: "Actors R13",
    edits: [
      {
        file: "src/core/serve.ts",
        find: "      if (followUp !== undefined)\n",
        replace: "      if (followUp !== undefined && count <= 32)\n",
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
        find: '      (mail) => Mail.$is("Context")(mail) && context.settling(mail.actor),',
        replace: '      (mail) => Mail.$is("Context")(mail) && mail.actor.name.length < 0,',
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
        file: "src/core/apply.ts",
        find: "          if (context.owes(incarnation)) tx.owe(incarnation.actor);",
        replace:
          '          if (context.owes(incarnation) && incarnation.actor.name === "") tx.owe(incarnation.actor);',
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
        file: "src/core/actor-record.ts",
        find: "      seen: Object.fromEntries([...record.seen].map(([slot, s]) => [slot, s.text])),",
        replace: "      seen: {},",
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
        file: "src/core/apply.ts",
        find: "          tx.front(",
        replace: "          ((mails: ReadonlyArray<Mail>) => mails.forEach((m) => tx.enqueue(m)))(",
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
        find: "    if (machines.get(compiledOf(ref.machine).id) !== ref.machine)",
        replace: "    if (machines.get(compiledOf(ref.machine).id) === undefined)",
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
        find: "      Option.some(on.built.admission.ensure(actor, context)),",
        replace: "      Option.some(on.built.admission.ensure(actor, new Map())),",
      },
    ],
  },
  {
    name: "issue-never-cleared",
    tests: ["tests/session/values.test.ts", "tests/actors/context.test.ts"],
    says: "a context or onContext issue stays after its own source succeeds",
    rule: "Turn R25",
    edits: [
      {
        file: "src/core/context.ts",
        find: "    openOf(issues, source) ? [OutcomeEdit.Clear({ source })] : [];",
        replace:
          "    openOf(issues, source) && issues.length < 0 ? [OutcomeEdit.Clear({ source })] : [];",
      },
    ],
  },
  {
    name: "issue-raised-every-wave",
    tests: ["tests/actors/context.test.ts"],
    says: "a standing refusal raises its issue again at every wave",
    rule: "Actors R19",
    edits: [
      {
        file: "src/core/context.ts",
        find: "  const raise = (issues: ReadonlyArray<StoredIssue>, issue: StoredIssue) =>\n    issues.some(",
        replace:
          "  const raise = (issues: ReadonlyArray<StoredIssue>, issue: StoredIssue) =>\n    issues.length < 0 && issues.some(",
      },
    ],
  },
  {
    name: "throwing-slot-decode-escapes-boot",
    tests: ["src/core/actor-record.test.ts"],
    says: "a slot Schema whose decode throws at the boot escapes quarantine: the walker throws the parser's defect again",
    rule: "Restore R5",
    edits: [
      {
        file: "src/core/boundary.ts",
        find: '    : Result.fail<"schema">("schema");',
        replace:
          '    : Exit.hasDies(parsed)\n      ? Result.fail<"schema">(Effect.runSync(parsed) as "schema")\n      : Result.fail<"schema">("schema");',
      },
    ],
  },
  {
    name: "context-issue-published-twice",
    tests: ["tests/session/values.test.ts", "tests/generated/generated.test.ts"],
    says: "a context update that raises an issue publishes its consumer twice",
    rule: "Turn I9",
    edits: [
      {
        file: "src/core/apply.ts",
        find: "          tx.act(Act.Published({ actor: incarnation.actor, incarnation, why }));",
        replace:
          '          {\n            tx.act(Act.Published({ actor: incarnation.actor, incarnation, why }));\n            if (Change.$is("Inputs")(change) && Option.exists(before, (b) => b.issues !== incarnation.issues)) tx.act(Act.Published({ actor: incarnation.actor, incarnation, why }));\n          }',
      },
    ],
  },
  {
    name: "context-recompute-every-turn",
    tests: ["tests/actors/context-slots.test.ts", "tests/actors/context.test.ts"],
    says: "a wave runs every slot's select again, whether one of its reads changed or not",
    rule: "Actors R18",
    edits: [
      {
        file: "src/core/context.ts",
        find: "      if (last !== undefined && sameReads(last, reads) && !openOf(consumer.issues, source))\n        continue;",
        replace: "",
      },
    ],
  },
  {
    name: "troubled-slot-skipped",
    tests: ["tests/actors/context.test.ts"],
    says: "a slot whose select failed is not read again when its provider returns to its last good reads, so its issue stays open",
    rule: "Actors R19",
    edits: [
      {
        file: "src/core/context.ts",
        find: "      if (last !== undefined && sameReads(last, reads) && !openOf(consumer.issues, source))\n        continue;",
        replace: "      if (last !== undefined && sameReads(last, reads)) continue;",
      },
    ],
  },
  {
    name: "first-value-after-none-silent",
    tests: ["tests/session/values.test.ts", "tests/actors/context.test.ts"],
    says: "a slot's first value after its select failed at the start is taken silently, so the change is never heard",
    rule: "Turn R22",
    edits: [
      {
        file: "src/core/context.ts",
        find: "      if (Option.exists(previous, (p) => sameValue(p.value, current.value))) {",
        replace:
          "      if (Option.isNone(previous) || Option.exists(previous, (p) => sameValue(p.value, current.value))) {",
      },
    ],
  },
];
