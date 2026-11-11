import type { Mutant } from "../dsl/oracle.ts";

const mutant = (m: Omit<Mutant, "runtime">) => ({ ...m, runtime: "production" }) satisfies Mutant;

/**
 * The production runtime's mutants, by the oracle that must catch each (T16): source edits of
 * `src/` and of the production adapter, each run on its own copy of the package, over Pay cases.
 *
 * **Details**
 *
 * - Edit paths are relative to the package root (`src/core/answers.ts`).
 * - The adapter's mutants misreport what the runtime did; the runtime's mutants break a
 *   guarantee the adapter must not hide. Both must be caught by the named oracle.
 * - `late-results` and `graph-names` have none: no Pay case reaches a late result after cleanup,
 *   and the production runtime has no `flow graph` yet (T17).
 */
export const productionMutants = {
  "ending-channels": [
    mutant({
      name: "prod.failure-as-cancelled",
      says: "a definite failure the server answered is reported unknown Cancelled, with no cancel run",
      expects: "WriteLanes I25",
      cases: ["PAY-15/busy-then-new-write"],
      edits: [
        {
          file: "src/core/answers.ts",
          find: 'Failure: ({ reason, error }) => classified("failure", reason, error),',
          replace: 'Failure: ({ error }) => classified("unknown", "Cancelled", error),',
        },
      ],
    }),
    mutant({
      name: "prod.success-as-failure",
      says: "a success the server answered ends as a failure it never sent",
      expects: "WriteLanes I25",
      cases: ["PAY-01"],
      edits: [
        {
          file: "src/core/answers.ts",
          find: 'Success: ({ value }) => classified("success", "success", value),',
          replace: 'Success: ({ value }) => classified("failure", "CardDeclined", value),',
        },
      ],
    }),
    mutant({
      name: "prod.adapter-ended-success",
      says: "the adapter reports every ending as a success",
      expects: "WriteLanes I3",
      cases: ["PAY-05"],
      edits: [
        {
          file: "conformance/adapters/production.ts",
          find: "          channel: e.channel,\n          reason: e.reason,\n          actor: Option.isNone(e.attempt)",
          replace:
            '          channel: "success",\n          reason: e.reason,\n          actor: Option.isNone(e.attempt)',
        },
      ],
    }),
  ],
  "attempt-identity": [
    mutant({
      name: "prod.resend-new-id",
      says: "a re-send carries a fresh id",
      expects: "WriteLanes I6",
      cases: ["PAY-04"],
      edits: [
        {
          file: "src/core/lanes.ts",
          find: "          id: head.id,\n          key: lane.key,",
          replace: '          id: resend ? tx.mint("att") : head.id,\n          key: lane.key,',
        },
      ],
    }),
  ],
  "delivered-once": [
    mutant({
      name: "prod.kept-redelivered",
      says: "a kept ending's one try at a boot is redelivered after its refusal",
      expects: "Actors I24",
      cases: ["DLV-05"],
      edits: [
        {
          file: "src/core/incarnations.ts",
          find: "redelivered: p.kept,",
          replace: "redelivered: false,",
        },
      ],
    }),
  ],
  "lane-queue": [
    mutant({
      name: "prod.retry-not-owed",
      says: "a retry accepted on a Held lane never re-sends",
      expects: "WriteLanes I26",
      cases: ["PAY-04"],
      edits: [
        {
          file: "src/core/lanes.ts",
          find: "setLane({ ...l, head: { ...l.head, owner, phase: Phase.Ready() } });",
          replace: "setLane({ ...l, head: { ...l.head, owner } });",
        },
      ],
    }),
  ],
  disposal: [
    mutant({
      name: "prod.bound-forgets-the-wire",
      says: "past the disposal bound an Attempt on the wire gets no ending",
      expects: "Actors I35",
      cases: ["PAY-16/on-the-wire-at-the-bound-ends-unknown-disposed"],
      edits: [
        {
          file: "src/core/disposal.ts",
          find: '        parkOnLane(lane, "unknown", "Disposed", undefined);',
          replace: "        setLane(lane);",
        },
      ],
    }),
  ],
  "retry-count": [
    mutant({
      name: "prod.record-forgets-retries",
      says: "a lane record saves no re-sends, so a reload restores retryCount 0",
      expects: "WriteLanes I7",
      cases: ["PAY-16/retry-count-persists"],
      edits: [
        {
          file: "src/core/record.ts",
          find: "      retryCount: lane.head.retryCount,",
          replace: "      retryCount: 0,",
        },
      ],
    }),
    mutant({
      name: "prod.resend-uncounted",
      says: "an invoked re-send does not count",
      expects: "WriteLanes I7",
      cases: ["PAY-15/retry-budget"],
      edits: [
        {
          file: "src/core/lanes.ts",
          find: "retryCount: lane.head.retryCount + (resend ? 1 : 0),",
          replace: "retryCount: lane.head.retryCount,",
        },
      ],
    }),
  ],
  "evidence-kinds": [
    mutant({
      name: "prod.released-delivered",
      says: "a released lane also delivers Released as an ending",
      expects: "WriteLanes I4",
      cases: ["PAY-03"],
      edits: [
        {
          file: "src/core/lanes.ts",
          find: "    dropLane(lane);\n  };",
          replace:
            '    dropLane(lane);\n    endingMail(lane.actor, { operation: lane.operation, attempt: Option.some(lane.head.id), lane: Option.none(), channel: "unknown", reason: "Released", value: undefined, owner: 0, current: true, redelivered: false, parked: false });\n  };',
        },
      ],
    }),
  ],
  "idle-guard": [
    mutant({
      name: "prod.idle-fails-idle",
      says: "an idle guard fails even over an Idle lane",
      expects: "WriteLanes I13",
      cases: ["PAY-15/busy-then-new-write"],
      edits: [
        {
          file: "src/core/turn.ts",
          find: "Idle: () => PASSED, InFlight: () => IN_FLIGHT, Held: () => UNCERTAIN",
          replace: "Idle: () => IN_FLIGHT, InFlight: () => IN_FLIGHT, Held: () => UNCERTAIN",
        },
      ],
    }),
  ],
  selection: [
    mutant({
      name: "prod.actor-never-saved",
      says: "an actor's record is never written, so after a reload it runs from a state it never published",
      expects: "Turn I2",
      cases: ["DISP-01"],
      edits: [
        {
          file: "src/core/persist.ts",
          find: "    persist(actor, Option.toArray(actorWrite(incarnation)), Option.none());",
          replace: "    persist(actor, [], Option.none());",
        },
      ],
    }),
    mutant({
      name: "prod.root-first",
      says: "the root's handlers are tried before the active leaf's",
      expects: "Turn I2",
      cases: ["PAY-01"],
      edits: [
        {
          file: "src/core/turn.ts",
          find: '        { node: input.state, alternatives: leafAlternatives },\n        { node: "root", alternatives: input.compiled.root.get(input.tag) ?? [] },',
          replace:
            '        { node: "root", alternatives: input.compiled.root.get(input.tag) ?? [] },\n        { node: input.state, alternatives: leafAlternatives },',
        },
      ],
    }),
  ],
  publication: [
    mutant({
      name: "prod.state-move-copies-memory",
      says: "a turn that only moves state copies the memory object, so an unchanged part loses its identity",
      expects: "Turn I30",
      cases: ["PAY-04"],
      edits: [
        {
          file: "src/core/turn.ts",
          find: "    onNone: () => Result.succeed(input.memory),",
          replace: "    onNone: () => Result.succeed({ ...input.memory }),",
        },
      ],
    }),
  ],
  refusal: [
    mutant({
      name: "prod.refused-turn-reported",
      says: "a refused turn keeps a turn report besides its issue",
      expects: "Turn I14",
      cases: ["TURN-01/schedule-refused"],
      edits: [
        {
          file: "src/core/serve.ts",
          find: "      Refused: ({ code }) => {\n",
          replace:
            "      Refused: ({ code }) => {\n        tx.emit(Evidence.Turn({ actor: incarnation.actor, event: tag, from: incarnation.state, to: incarnation.state, parts: [], members: [] }));\n",
        },
      ],
    }),
  ],
  schedules: [
    mutant({
      name: "prod.fires-unused",
      says: "a schedule fires while its actor is not used",
      expects: "Turn I23",
      cases: ["TURN-03/unused"],
      edits: [
        {
          file: "src/core/step.ts",
          find: "if (used(actor)) enqueue(",
          replace: 'if (used(actor) || actor.name !== "") enqueue(',
        },
      ],
    }),
  ],
} satisfies Readonly<Record<string, ReadonlyArray<Mutant>>>;

/**
 * The production runtime's mutants held by case expectations: each must turn a case red by a
 * failed expectation that cites the Invariant it expects.
 */
export const productionCaseMutants: ReadonlyArray<Mutant> = [
  mutant({
    name: "prod.mint-not-replayable",
    says: "ids are not a function of the boot's seed and the world's counter",
    expects: "Turn I17",
    cases: ["PAY-01"],
    edits: [
      {
        file: "src/core/tx.ts",
        find: "      return branded<Id>(`${prefix}-${env.seed}-${world.counter}`);",
        replace:
          "      return branded<Id>(`${prefix}-${env.seed}-${world.counter}-${performance.now()}`);",
      },
    ],
  }),
];
