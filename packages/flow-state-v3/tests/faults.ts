import { toolingFaults } from "./tooling-faults.ts";

/**
 * A planted fault: a named wrong behaviour of the runtime, the Spec rule it breaks, and the source
 * edits that plant it.
 */
export type Fault = {
  readonly name: string;
  readonly says: string;
  readonly rule: string;
  readonly edits: ReadonlyArray<{
    readonly file: string;
    readonly find: string;
    readonly replace: string;
  }>;
};

/**
 * Wrong runtimes the tests must reject.
 *
 * **When to use**
 *
 * Run them when the test tooling changes, to show the tests still tell a right runtime from a wrong
 * one: each fault is planted alone in a scratch copy of the package, and at least one test must
 * fail.
 *
 * **Details**
 *
 * Edit paths are relative to the package root. Each `find` must occur exactly once in its file; a
 * fault whose text has moved is rewritten or removed, never skipped.
 */
export const faults: ReadonlyArray<Fault> = [
  {
    name: "failure-as-cancelled",
    says: "a definite failure the server answered is reported unknown Cancelled, with no cancel run",
    rule: "WriteLanes I25",
    edits: [
      {
        file: "src/core/answers.ts",
        find: 'Failure: ({ reason, error }) => classified("failure", reason, error),',
        replace: 'Failure: ({ error }) => classified("unknown", "Cancelled", error),',
      },
    ],
  },
  {
    name: "success-as-failure",
    says: "a success the server answered ends as a failure it never sent",
    rule: "WriteLanes I25",
    edits: [
      {
        file: "src/core/answers.ts",
        find: 'Success: ({ value }) => classified("success", "success", value),',
        replace: 'Success: ({ value }) => classified("failure", "CardDeclined", value),',
      },
    ],
  },
  {
    name: "resend-new-id",
    says: "a re-send carries a fresh id",
    rule: "WriteLanes I6",
    edits: [
      {
        file: "src/core/lane-moves.ts",
        find: "          id: head.id,\n          key: at.key,",
        replace: '          id: resend ? tx.mint("att") : head.id,\n          key: at.key,',
      },
    ],
  },
  {
    name: "kept-redelivered",
    says: "a kept ending's one try at a boot is redelivered after its refusal",
    rule: "Actors I24",
    edits: [
      {
        file: "src/core/ledger.ts",
        find: "        adopt(row, Delivery.Retrying());",
        replace: "        adopt(row, Delivery.Queued());",
      },
    ],
  },
  {
    name: "retry-not-owed",
    says: "a retry accepted on a Held lane never re-sends",
    rule: "WriteLanes I26",
    edits: [
      {
        file: "src/core/cells.ts",
        find: "    Held: (_head, cue) => Move.Owe({ owner: cue.owner }),",
        replace: "    Held: stay,",
      },
    ],
  },
  {
    name: "kept-ignored",
    says: "a commit beside a kept ending mints, as if the kept ending held no lane",
    rule: "WriteLanes I8",
    edits: [
      {
        file: "src/core/lanes.ts",
        find: "    if (keptOn(tx.world().owed, incarnation.actor, id)) {",
        replace: '    if (keptOn(tx.world().owed, incarnation.actor, id) && id === "") {',
      },
    ],
  },
  {
    name: "bound-forgets-the-wire",
    says: "past the disposal bound an Attempt on the wire gets no ending",
    rule: "Actors I35",
    edits: [
      {
        file: "src/core/cells.ts",
        find: "    OnWire: disposedOnWire,",
        replace: "    OnWire: stay,",
      },
    ],
  },
  {
    name: "record-forgets-retries",
    says: "a lane record saves no re-sends, so a reload restores retryCount 0",
    rule: "WriteLanes I7",
    edits: [
      {
        file: "src/core/record.ts",
        find: "      retryCount: lane.head.retryCount,",
        replace: "      retryCount: 0,",
      },
    ],
  },
  {
    name: "resend-uncounted",
    says: "an invoked re-send does not count",
    rule: "WriteLanes I7",
    edits: [
      {
        file: "src/core/lane-moves.ts",
        find: "retryCount: lane.head.retryCount + (resend ? 1 : 0),",
        replace: "retryCount: lane.head.retryCount,",
      },
    ],
  },
  {
    name: "released-delivered",
    says: "a released lane also delivers Released as an ending",
    rule: "WriteLanes I4",
    edits: [
      {
        file: "src/core/lane-moves.ts",
        find: "      Release: () => dropLane(at.id, laneAt(at)),",
        replace:
          '      Release: () => {\n        const lane = laneAt(at);\n        dropLane(at.id, lane);\n        ledger.owe({ actor: at.actor, to: Audience.Identity(), operation: at.operation, attempt: Option.some(lane.head.id), lane: Option.none(), channel: "unknown", reason: "Released", value: undefined, owner: 0, current: true });\n      },',
      },
    ],
  },
  {
    name: "idle-fails-idle",
    says: "an idle guard fails even over an Idle lane",
    rule: "WriteLanes I13",
    edits: [
      {
        file: "src/core/turn.ts",
        find: "Idle: () => PASSED, InFlight: () => IN_FLIGHT, Held: () => UNCERTAIN",
        replace: "Idle: () => IN_FLIGHT, InFlight: () => IN_FLIGHT, Held: () => UNCERTAIN",
      },
    ],
  },
  {
    name: "actor-never-saved",
    says: "an actor's record always saves its initial state, so after a reload it runs from a state it never published",
    rule: "Turn I2",
    edits: [
      {
        file: "src/core/record.ts",
        find: "      state: incarnation.state,\n      memory,",
        replace: "      state: compiled.initial,\n      memory,",
      },
    ],
  },
  {
    name: "root-first",
    says: "the root's handlers are tried before the active leaf's",
    rule: "Turn I2",
    edits: [
      {
        file: "src/core/turn.ts",
        find: '        { node: input.state, alternatives: leafAlternatives },\n        { node: "root", alternatives: input.compiled.root.get(input.tag) ?? [] },',
        replace:
          '        { node: "root", alternatives: input.compiled.root.get(input.tag) ?? [] },\n        { node: input.state, alternatives: leafAlternatives },',
      },
    ],
  },
  {
    name: "state-move-copies-memory",
    says: "a turn that only moves state copies the memory object, so an unchanged part loses its identity",
    rule: "Turn I30",
    edits: [
      {
        file: "src/core/turn.ts",
        find: "    onNone: () => Result.succeed(input.memory),",
        replace: "    onNone: () => Result.succeed({ ...input.memory }),",
      },
    ],
  },
  {
    name: "refused-turn-reported",
    says: "a refused turn keeps a turn report besides its issue",
    rule: "Turn I14",
    edits: [
      {
        file: "src/core/serve.ts",
        find: "      Refused: ({ code }) => {\n",
        replace:
          "      Refused: ({ code }) => {\n        tx.emit(Evidence.Turn({ actor: incarnation.actor, event: tag, from: incarnation.state, to: incarnation.state, parts: [], members: [] }));\n",
      },
    ],
  },
  {
    name: "fires-unused",
    says: "a schedule fires while its actor is not used",
    rule: "Turn I23",
    edits: [
      {
        file: "src/core/step.ts",
        find: "if (used(actor)) enqueue(",
        replace: 'if (used(actor) || actor.name !== "") enqueue(',
      },
    ],
  },
  {
    name: "mint-not-replayable",
    says: "Attempt ids are not a function of the boot's seed and the Attempts' counter",
    rule: "Turn I17",
    edits: [
      {
        file: "src/core/tx.ts",
        find: "      return `att-${env.seed}-${world.attempts}`;",
        replace: "      return `att-${env.seed}-${world.attempts}-${performance.now()}`;",
      },
    ],
  },
  {
    name: "no-restored-unknown",
    says: "a Held head with no owed row hears nothing at its identity's start",
    rule: "Restore I6",
    edits: [
      {
        file: "src/core/incarnations.ts",
        find: 'if (Phase.$is("Held")(lane.head.phase) && !owedAttempts.has(lane.head.id))',
        replace:
          'if (Phase.$is("Held")(lane.head.phase) && !owedAttempts.has(lane.head.id) && id === "")',
      },
    ],
  },
  {
    name: "refused-acknowledgement-sent",
    says: "a commit whose acknowledging write was refused is sent anyway",
    rule: "WriteAhead R13",
    edits: [
      {
        file: "src/core/cells.ts",
        find: '    Acknowledging: () => Move.EndUnsent({ why: "StorageRefused" }),',
        replace: "    Acknowledging: () => Move.Send(),",
      },
    ],
  },
  {
    name: "sent-before-acknowledged",
    says: "a commit is sent before its acknowledging write lands",
    rule: "WriteAhead R13",
    edits: [
      {
        file: "src/core/lane-moves.ts",
        find: "    Option.match(saveAwaited(at.actor, at.id, { attempt: lane.head.id, purpose }), {",
        replace:
          "    saveAwaited(at.actor, at.id, { attempt: lane.head.id, purpose });\n    Option.match(Option.none(), {",
      },
    ],
  },
  ...toolingFaults,
  {
    name: "ending-heard-twice",
    says: "an ending a turn heard is delivered once more, as if its turn had been refused",
    rule: "WriteLanes I15",
    edits: [
      {
        file: "src/core/ledger.ts",
        find: '        else if (heard === "Heard") close(now.value, Closed.Delivered());',
        replace:
          '        else if (heard === "Heard" && Delivery.$is("Queued")(now.value.delivery))\n          queue(now.value, Delivery.Retrying());\n        else if (heard === "Heard") close(now.value, Closed.Delivered());',
      },
    ],
  },
  {
    name: "success-keeps-hold",
    says: "a success leaves its lane Held, so the next start delivers unknown Restored after it",
    rule: "WriteLanes I16",
    edits: [
      {
        file: "src/core/lane-moves.ts",
        find: '        if (channel === "unknown") hold(at, lane, true);',
        replace:
          '        if (channel === "unknown" || channel === "success") hold(at, lane, true);',
      },
    ],
  },
  {
    name: "unsent-as-failure",
    says: "a never-sent Attempt ends as a failure, not NotSent",
    rule: "WriteLanes I3",
    edits: [
      {
        file: "src/core/lane-moves.ts",
        find: '      channel: "notSent",\n      reason: why,\n      value: { why },\n      current: true,\n    });\n\n  const invoke',
        replace:
          '      channel: "failure",\n      reason: why,\n      value: { why },\n      current: true,\n    });\n\n  const invoke',
      },
    ],
  },
  {
    name: "turn-published-twice",
    says: "a turn that moves to another leaf publishes twice",
    rule: "Turn I9",
    edits: [
      {
        file: "src/core/serve.ts",
        find: "          publish(after);\n        saveActor(after.actor);",
        replace:
          "          publish(after);\n        if (after.state !== incarnation.state) publish(after);\n        saveActor(after.actor);",
      },
    ],
  },
  {
    name: "disposal-resends-held",
    says: "the Runtime's disposal re-sends each Held head",
    rule: "Actors I30",
    edits: [
      {
        file: "src/core/cells.ts",
        find: "    Held: stay,\n  },\n  BoundPassed",
        replace: "    Held: () => Move.Resend(),\n  },\n  BoundPassed",
      },
    ],
  },
  {
    name: "boot-wakes-no-one",
    says: "a boot restores no identity live, so an owed ending waits for an ensure",
    rule: "Restore I1",
    edits: [
      {
        file: "src/core/incarnations.ts",
        find: "      if (!restored.undecodable.has(key)) ensure(actor, Option.none(), true);",
        replace:
          '      if (!restored.undecodable.has(key) && key === "") ensure(actor, Option.none(), true);',
      },
    ],
  },
  {
    name: "dispose-forgets-uses",
    says: "the test tooling's disposeRuntime forgets the Story's uses, so the next reload ensures nothing",
    rule: "Stories R13",
    edits: [
      {
        file: "src/host/testing/run.ts",
        find: "      disposeRuntime: () => {\n        disposed = true;\n",
        replace: "      disposeRuntime: () => {\n        disposed = true;\n        uses.clear();\n",
      },
    ],
  },
  {
    name: "trace-omits-requests",
    says: "the trace leaves out the calls the fake servers received",
    rule: "Stories I20",
    edits: [
      {
        file: "src/host/testing/run.ts",
        find: '    (index) => note({ kind: "call", index }),\n',
        replace: "    () => undefined,\n",
      },
    ],
  },
  {
    name: "bench-drops-a-round",
    says: "the bench times a Story with its last round of steps cut, so it does less work than the tested run",
    rule: "Stories I18",
    edits: [
      {
        file: "bench/time.ts",
        find: "const run = await story.run();",
        replace: "const run = await story.run({ steps: story.steps.slice(0, -10) });",
      },
    ],
  },
  {
    name: "landed-write-lost",
    says: "a reload asked to land the held writes marks them landed but writes nothing to the store",
    rule: "Stories R13",
    edits: [
      {
        file: "src/host/testing/fake.ts",
        find: '        apply(out.writes);\n        mark(out, "landed");\n      }\n    },',
        replace: '        mark(out, "landed");\n      }\n    },',
      },
    ],
  },
  {
    name: "turn-bound-after-the-chain",
    says: "the run judges the turn bound only between tasks, so a chain of commits that answer at once runs past 10,000 turns",
    rule: "Stories I7",
    edits: [
      {
        file: "src/host/testing/run.ts",
        find: '.length > TURN_LIMIT) limits.fail("Turns");',
        replace: '.length > Number.POSITIVE_INFINITY) limits.fail("Turns");',
      },
    ],
  },
];
