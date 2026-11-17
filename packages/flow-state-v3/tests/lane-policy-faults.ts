import type { Fault } from "./faults.ts";

/**
 * Wrong runtimes of the write-lane policies: a latest that keeps every queued commit, a serialize
 * that runs as latest or keeps only some of its queue, a head that resolves and promotes nothing, queued
 * commits that outlive the disposal, a row that never reads waiting, a displaced ending routed by
 * the wrong rule, a NotSent heard by a failure tag, and a Kept row that blocks a cancel-policy
 * commit; each planted alone like the runtime's other faults.
 */
export const lanePolicyFaults: ReadonlyArray<Fault> = [
  {
    name: "latest-keeps-every-queued",
    tests: ["tests/write-lanes/policy-cells.test.ts"],
    says: "a latest commit behind a queued commit queues beside it instead of superseding it",
    rule: "WriteLanes R7",
    edits: [
      {
        file: "src/core/cells.ts",
        find: "Move.Queue({ input: cue.input, owner: cue.owner, latest: true })",
        replace: "Move.Queue({ input: cue.input, owner: cue.owner, latest: false })",
      },
    ],
  },
  {
    name: "serialize-as-latest",
    tests: ["tests/lanes/lanes.test.ts", "tests/write-lanes/policy-cells.test.ts"],
    says: "a serialize commit replaces the commit queued before it, as latest does",
    rule: "WriteLanes R7",
    edits: [
      {
        file: "src/core/cells.ts",
        find: "  Move.Queue({ input: cue.input, owner: cue.owner, latest: false });",
        replace: "  Move.Queue({ input: cue.input, owner: cue.owner, latest: true });",
      },
    ],
  },
  {
    name: "serialize-capped",
    tests: ["tests/lanes/lanes.test.ts"],
    says: "serialize keeps 64 queued commits and loses every later one, with no ending",
    rule: "WriteLanes R7, I8",
    edits: [
      {
        file: "src/core/lane-moves.ts",
        find: "queue: latest ? [queued] : [...lane.queue, queued]",
        replace: "queue: latest ? [queued] : [...lane.queue, queued].slice(0, 64)",
      },
    ],
  },
  {
    name: "resolved-head-promotes-nothing",
    tests: ["tests/write-lanes/policy-cells.test.ts"],
    says: "a head that resolves drops its lane and the commits queued behind it with it",
    rule: "WriteLanes R8",
    edits: [
      {
        file: "src/core/lane-moves.ts",
        find: "    if (next === undefined) {\n      dropLane(at.id, lane);",
        replace: "    if (next !== null) {\n      dropLane(at.id, lane);",
      },
    ],
  },
  {
    name: "queue-outlives-disposal",
    tests: ["tests/write-lanes/policy-cells.test.ts"],
    says: "queued commits get no ending when the Runtime's disposal starts",
    rule: "WriteLanes I27",
    edits: [
      {
        file: "src/core/lanes.ts",
        find: 'endQueue(atOf(id, lane), "Disposed");',
        replace: "void lane;",
      },
    ],
  },
  {
    name: "waiting-never-read",
    tests: ["tests/write-lanes/policy-cells.test.ts"],
    says: "a row reads waiting false while commits wait behind its head",
    rule: "Reads R14",
    edits: [
      {
        file: "src/core/rows.ts",
        find: "waiting: lane.queue.length > 0,",
        replace: "waiting: false,",
      },
    ],
  },
  {
    name: "displaced-ending-misrouted",
    tests: ["tests/write-lanes/policy-cells.test.ts"],
    says: "a displaced Attempt's ending is delivered with no cancel pending on it, and recorded with one",
    rule: "WriteLanes I15",
    edits: [
      {
        file: "src/core/lane-moves.ts",
        find: "    if (d.owed) {",
        replace: "    if (!d.owed) {",
      },
    ],
  },
  {
    name: "notsent-heard-by-failure-tag",
    tests: ["src/host/runtime.test.ts", "tests/write-lanes/policy-cells.test.ts"],
    says: "Flow's NotSent is mapped by a failure tag named NotSent instead of the notSent key",
    rule: "WriteLanes I39",
    edits: [
      {
        file: "src/core/serve.ts",
        find: "        Write: (w) => w.notSent,",
        replace: '        Write: (w) => Option.fromUndefinedOr(w.failure.get("NotSent")),',
      },
    ],
  },
  {
    name: "queue-not-saved",
    tests: ["tests/write-lanes/policy-cells.test.ts"],
    says: "a lane record holds no queue, so a reload loses the queued commits with no ending",
    rule: "WriteLanes I27",
    edits: [
      {
        file: "src/core/record.ts",
        find: "            queue,\n",
        replace: "            queue: queue.slice(0, 0),\n",
      },
    ],
  },
  {
    name: "displaced-not-saved",
    tests: ["src/host/lane-record.test.ts"],
    says: "a lane record drops its displaced Attempts, so a reload loses their owed endings",
    rule: "Restore R3",
    edits: [
      {
        file: "src/core/record.ts",
        find: "      displaced,\n",
        replace: "      displaced: displaced.slice(0, 0),\n",
      },
    ],
  },
  {
    name: "kept-blocks-cancel-policy",
    tests: ["src/host/ledger.test.ts"],
    says: "a cancel-policy commit on a key with a Kept row declines Rejected instead of letting it go",
    rule: "WriteLanes R6",
    edits: [
      {
        file: "src/core/lanes.ts",
        find: 'if (policyOf(operation) !== "cancel") {',
        replace: "if (policyOf(operation) !== null) {",
      },
    ],
  },
  {
    name: "local-actor-declined-without-persistence",
    tests: ["tests/actors/edges.test.ts"],
    says: "a local actor of a persisted machine, in a Runtime without persistence, has its commit declined NoPersistence",
    rule: "Actors R6",
    edits: [
      {
        file: "src/core/lanes.ts",
        find: "      !tx.world().persistence &&\n      !incarnation.actor.name.startsWith(LOCAL_PREFIX)\n",
        replace: "      !tx.world().persistence\n",
      },
    ],
  },
  {
    name: "decline-named-failure-stays-definite",
    tests: ["tests/actors/edges.test.ts"],
    says: "an app error tagged like one of Flow's declines, after an unknown send, stays a definite failure",
    rule: "WriteLanes R2",
    edits: [
      {
        file: "src/core/cells.ts",
        find: '  return channel === "failure" && sentBefore(head)\n',
        replace: '  return channel === "failure" && sentBefore(head) && reason !== "Rejected"\n',
      },
    ],
  },
];
