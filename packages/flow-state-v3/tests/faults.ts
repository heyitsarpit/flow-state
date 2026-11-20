import { actorFaults } from "./actor-faults.ts";
import { boundaryFaults } from "./boundary-faults.ts";
import { consolidationFaults } from "./consolidation-faults.ts";
import { codecFaults } from "./codec-faults.ts";
import { contextFaults } from "./context-faults.ts";
import { lanePolicyFaults } from "./lane-policy-faults.ts";
import { lifeFaults } from "./life-faults.ts";
import { runtimeLifeFaults } from "./runtime-life-faults.ts";
import { mixFaults } from "./mix-faults.ts";
import { toolingFaults } from "./tooling-faults.ts";
import { structureFaults } from "./structure-faults.ts";
import { constructionFaults } from "./construction-faults.ts";
import { restoreFaults } from "./restore-faults.ts";
import { ruleFaults } from "./rule-faults.ts";
import { stepFaults } from "./step-faults.ts";
import { writeAheadFaults } from "./write-ahead-faults.ts";
import { typedCoreFaults } from "./typed-core-faults.ts";
import { scheduleFaults } from "./schedule-faults.ts";

/**
 * A planted fault: a named wrong behaviour of the runtime, the test files that catch it, the Spec
 * rule it breaks, and the source edits that plant it.
 */
export type Fault = {
  readonly name: string;
  readonly tests: ReadonlyArray<string>;
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
 * Edit and test paths are relative to the package root. Each `find` must occur exactly once in its
 * file; a fault whose text has moved is rewritten or removed, never skipped. `tests` names the
 * files run first; the whole suite runs only when they let the fault through, so a wrong name
 * costs time, never a verdict.
 */
export const faults: ReadonlyArray<Fault> = [
  {
    name: "failure-as-cancelled",
    tests: ["tests/stories/fake.test.ts"],
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
    tests: ["tests/stories/storage.test.ts"],
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
    tests: ["src/host/lanes.test.ts"],
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
    tests: ["src/core/ledger.test.ts"],
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
    tests: ["src/core/cells.test.ts"],
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
    tests: ["tests/write-lanes/ending-delivery.test.ts"],
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
    tests: ["src/core/cells.test.ts"],
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
    tests: ["tests/write-lanes/payment-retry.test.ts"],
    says: "a lane record saves no re-sends, so a reload restores retryCount 0",
    rule: "WriteLanes I7",
    edits: [
      {
        file: "src/core/record.ts",
        find: '            retryCount: l.head.retryCount + (Phase.$is("Recapturing")(l.head.phase) ? 1 : 0),',
        replace: "            retryCount: 0,",
      },
    ],
  },
  {
    name: "resend-uncounted",
    tests: ["tests/write-lanes/lane-anchors.test.ts"],
    says: "an invoked re-send does not count",
    rule: "WriteLanes I7",
    edits: [
      {
        file: "src/core/lane-moves.ts",
        find: "      retryCount,\n      phase: Phase.OnWire({ call }),",
        replace: "      retryCount: lane.head.retryCount,\n      phase: Phase.OnWire({ call }),",
      },
    ],
  },
  {
    name: "released-delivered",
    tests: ["tests/write-lanes/lane-policies.test.ts"],
    says: "a released lane also delivers Released as an ending",
    rule: "WriteLanes I4",
    edits: [
      {
        file: "src/core/lane-moves.ts",
        find: "      Release: () => vacate(at, laneAt(at)),",
        replace:
          '      Release: () => {\n        const lane = laneAt(at);\n        vacate(at, lane);\n        ledger.owe({ actor: at.actor, to: Audience.Identity(), operation: at.operation, attempt: Option.some(lane.head.id), lane: Option.none(), channel: "unknown", reason: "Released", value: undefined, owner: 0, current: true });\n      },',
      },
    ],
  },
  {
    name: "idle-fails-idle",
    tests: ["tests/cells/cells.test.ts"],
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
    tests: ["tests/shop/pay.test.ts"],
    says: "an actor's record always saves its initial state, so after a reload it runs from a state it never published",
    rule: "Turn I2",
    edits: [
      {
        file: "src/core/actor-record.ts",
        find: "      state: record.state,\n      memory,",
        replace: "      state: compiled.initial,\n      memory,",
      },
    ],
  },
  {
    name: "root-first",
    tests: ["tests/turn/refusal.test.ts"],
    says: "the root's handlers are tried before the active leaf's",
    rule: "Turn I2",
    edits: [
      {
        file: "src/core/turn.ts",
        find: "return written ? levels : Option.toArray(implicit(input));",
        replace: "return written ? levels.toReversed() : Option.toArray(implicit(input));",
      },
    ],
  },
  {
    name: "refused-turn-reported",
    tests: ["tests/turn/refusal.test.ts"],
    says: "a refused turn keeps a turn report besides its issue",
    rule: "Turn I14",
    edits: [
      {
        file: "src/core/serve.ts",
        find: "      Refused: ({ code, slot }) => refusal(incarnation, route, { code, slot }),\n",
        replace:
          "      Refused: ({ code, slot }) => {\n        tx.act(Act.Turned({ actor: incarnation.actor, event: tag, from: incarnation.state, to: incarnation.state, parts: [], members: [] }));\n\n        return refusal(incarnation, route, { code, slot });\n      },\n",
      },
    ],
  },
  {
    name: "fires-unused",
    tests: ["tests/turn/schedules.test.ts"],
    says: "a schedule fires while its actor is not used",
    rule: "Turn I23",
    edits: [
      {
        file: "src/core/step.ts",
        find: "if (used(t.actor))",
        replace: 'if (used(t.actor) || t.actor.name !== "")',
      },
    ],
  },
  {
    name: "mint-not-replayable",
    tests: ["tests/turn/refusal.test.ts"],
    says: "Attempt ids are not a function of the boot's seed and the Attempts' counter",
    rule: "Turn I17",
    edits: [
      {
        file: "src/core/tx.ts",
        find: "    return branded<AttemptId>(`att-${env.seed}-${world.attempts}`);",
        replace:
          "    return branded<AttemptId>(`att-${env.seed}-${world.attempts}-${performance.now()}`);",
      },
    ],
  },
  {
    name: "no-restored-unknown",
    tests: ["tests/stories/storage.test.ts"],
    says: "a Held head with no owed row hears nothing at its identity's start",
    rule: "Restore I6",
    edits: [
      {
        file: "src/core/ledger.ts",
        find: 'if (Phase.$is("Held")(lane.head.phase) && !owedAttempts.has(lane.head.id))',
        replace:
          'if (Phase.$is("Held")(lane.head.phase) && !owedAttempts.has(lane.head.id) && id === "")',
      },
    ],
  },
  {
    name: "refused-acknowledgement-sent",
    tests: ["src/core/cells.test.ts"],
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
    tests: ["tests/stories/storage.test.ts"],
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
  ...consolidationFaults,
  ...lanePolicyFaults,
  ...lifeFaults,
  ...runtimeLifeFaults,
  ...writeAheadFaults,
  ...typedCoreFaults,
  ...scheduleFaults,
  ...restoreFaults,
  ...ruleFaults,
  ...structureFaults,
  ...constructionFaults,
  ...mixFaults,
  ...actorFaults,
  ...contextFaults,
  ...stepFaults,
  ...codecFaults,
  ...boundaryFaults,
  {
    name: "ending-heard-twice",
    tests: ["src/core/ledger.test.ts"],
    says: "an ending a turn heard is delivered once more, as if its turn had been refused",
    rule: "WriteLanes I15",
    edits: [
      {
        file: "src/core/ledger.ts",
        find: "    Heard: (row) => close(row, Closed.Delivered()),",
        replace: "    Heard: refused,",
      },
    ],
  },
  {
    name: "success-keeps-hold",
    tests: ["tests/stories/reload.test.ts"],
    says: "a success leaves its lane Held, so the next start delivers unknown Restored after it",
    rule: "WriteLanes I16",
    edits: [
      {
        file: "src/core/lane-moves.ts",
        find: '        if (channel === "unknown") hold(at, lane);',
        replace: '        if (channel === "unknown" || channel === "success") hold(at, lane);',
      },
    ],
  },
  {
    name: "unsent-as-failure",
    tests: ["tests/stories/storage.test.ts"],
    says: "a never-sent Attempt ends as a failure, not NotSent",
    rule: "WriteLanes I3",
    edits: [
      {
        file: "src/core/lane-moves.ts",
        find: '      channel: "notSent",\n      reason: why,\n      value: { why },\n      route: Route.Current(),\n    });\n\n  const invoke',
        replace:
          '      channel: "failure",\n      reason: why,\n      value: { why },\n      route: Route.Current(),\n    });\n\n  const invoke',
      },
    ],
  },
  {
    name: "turn-published-twice",
    tests: ["tests/actors/lifetime.test.ts"],
    says: "a turn that moves to another leaf publishes twice",
    rule: "Turn I9",
    edits: [
      {
        file: "src/core/serve.ts",
        find: "        setIncarnation(settled);\n        publish(settled);",
        replace:
          "        setIncarnation(settled);\n        publish(settled);\n        if (settled.state !== incarnation.state) publish(settled);",
      },
    ],
  },
  {
    name: "disposal-resends-held",
    tests: ["src/core/cells.test.ts"],
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
    tests: ["src/host/lanes.test.ts"],
    says: "a boot restores no identity live, so an owed ending waits for an ensure",
    rule: "Restore I1",
    edits: [
      {
        file: "src/core/incarnations.ts",
        find: '    for (const actor of owing.values()) ensure(actor, Option.none(), "wake", Option.none());',
        replace: "    for (const actor of owing.values()) void actor;",
      },
    ],
  },
  {
    name: "memory-not-plain",
    tests: ["tests/stories/storage.test.ts"],
    says: "a published snapshot carries its memory behind a function in a plain object, not as plain data",
    rule: "Turn R24",
    edits: [
      {
        file: "src/core/incarnations.ts",
        find: "        memory: incarnation.memory,\n      }),\n    );",
        replace: "        memory: { held: { run: () => incarnation.memory } },\n      }),\n    );",
      },
    ],
  },
  {
    name: "armon-keeps-deadline",
    tests: ["tests/number-input/number-input.test.ts"],
    says: "an event a running schedule lists in armOn leaves its deadline as it was instead of restarting it",
    rule: "Turn R14",
    edits: [
      {
        file: "src/core/schedule-decision.ts",
        find: "    w.start = w.start || Option.isSome(given) || (keyedSchedule && w.fresh) || (adds && w.fresh);",
        replace:
          "    w.start =\n      w.start ||\n      (Option.isSome(given) && Option.isNone(w.track.run)) ||\n      (keyedSchedule && w.fresh) ||\n      (adds && w.fresh);",
      },
    ],
  },
  {
    name: "exit-keeps-schedules",
    tests: [
      "tests/turn/schedules.test.ts",
      "tests/write-lanes/payment-late-answers.test.ts",
      "tests/player/player.test.ts",
    ],
    says: "leaving a state leaves its schedules' timers in the incarnation, shown and saved in the state entered",
    rule: "Turn R14",
    edits: [
      {
        file: "src/core/schedules.ts",
        find: "    for (const tracked of undeclared) Option.map(tracked.run, disarmRun);",
        replace:
          "    for (const tracked of undeclared) timers.set(trackOf(tracked.name, tracked.key), tracked);",
      },
    ],
  },
  {
    name: "first-guard-only",
    tests: ["tests/number-input/number-input.test.ts"],
    says: "an alternative passes when its first guard passes, whatever the rest of its guard array says",
    rule: "Turn R12",
    edits: [
      {
        file: "src/core/turn.ts",
        find: "  for (const guard of alternative.guards) {",
        replace: "  for (const guard of alternative.guards.slice(0, 1)) {",
      },
    ],
  },
  {
    name: "alternatives-reversed",
    tests: ["tests/turn/refusal.test.ts"],
    says: "a level's alternatives are tried last first, not in authored order",
    rule: "Turn R2",
    edits: [
      {
        file: "src/core/turn.ts",
        find: "    for (const alternative of level.alternatives) {",
        replace: "    for (const alternative of level.alternatives.toReversed()) {",
      },
    ],
  },
  {
    name: "denied-last-reason",
    tests: ["tests/command-palette/palette.test.ts"],
    says: "a denial keeps only its last declined alternative's reason",
    rule: "Turn R13",
    edits: [
      {
        file: "src/core/turn.ts",
        find: "      reasons.push(code);",
        replace: "      reasons.splice(0, reasons.length, code);",
      },
    ],
  },
];
