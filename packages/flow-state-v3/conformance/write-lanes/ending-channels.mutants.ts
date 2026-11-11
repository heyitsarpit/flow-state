import type { Mutant } from "../dsl/oracle.ts";

/**
 * Wrong runtimes the ending-channels oracle must catch.
 *
 * **Details**
 *
 * - `mutant.ending-without-id`: a send's ending names no Attempt, so the answered send has none.
 * - `k.failure-as-success`: a failure ending runs the success event.
 * - `mutant.still-unknown-dropped`: a definite failure after an unknown send stays a failure.
 * - `mutant.success-without-answer`: a success ending comes in a step with no server answer.
 */
export const endingChannelsMutants: ReadonlyArray<Mutant> = [
  {
    name: "mutant.ending-without-id",
    says: "a send's ending is reported with no Attempt id",
    expects: "WriteLanes I3",
    runtime: "prototype",
    cases: ["PAY-01"],
    edits: [
      {
        file: "lane.ts",
        find: "noteEnding(tx, { op: lane.op, attempt: h.id, send }, final);",
        replace: "noteEnding(tx, { op: lane.op, send }, final);",
      },
    ],
  },
  {
    name: "k.failure-as-success",
    says: "a failure ending runs the operation's success event",
    expects: "WriteLanes I3",
    runtime: "prototype",
    cases: ["PAY-02"],
    edits: [
      {
        file: "turn.ts",
        find: "const mapped = mappedFor(m, item);",
        replace:
          'const mapped = item.ending.ch === "failure" && m.ops[item.op]?.outcomes.success ? m.ops[item.op]!.outcomes.success : mappedFor(m, item);',
      },
    ],
  },
  {
    name: "mutant.still-unknown-dropped",
    says: "a definite failure after an unknown send is delivered as a failure, not unknown StillUnknown",
    expects: "WriteLanes I3",
    runtime: "prototype",
    cases: ["PAY-05"],
    edits: [
      {
        file: "lane.ts",
        find: 'ending.ch === "failure" && h.mayHaveApplied',
        replace: 'ending.ch === "failure" && h.mayHaveApplied && h.retryCount < 0',
      },
    ],
  },
  {
    name: "mutant.success-without-answer",
    says: "a call still on the wire at the disposal bound ends success, with no answer from the server",
    expects: "WriteLanes I3",
    runtime: "prototype",
    cases: ["PAY-16/on-the-wire-at-the-bound-ends-unknown-disposed"],
    edits: [
      {
        file: "lane.ts",
        find: '  const e: Ending = { ch: "unknown", reason: "Disposed" };',
        replace: '  const e: Ending = { ch: "success", reason: "success" };',
      },
    ],
  },
  {
    name: "mutant.unsent-ends-unknown",
    says: "the Runtime's disposal ends each queued, never-sent commit unknown { Disposed } instead of NotSent { Disposed }",
    expects: "WriteLanes I3",
    runtime: "prototype",
    cases: ["DISP-03"],
    edits: [
      {
        file: "lane.ts",
        find: '  const parked = lane.w.map((a) => {\n    const e = declined("Disposed");',
        replace:
          '  const parked = lane.w.map((a) => {\n    const e: Ending = { ch: "unknown", reason: "Disposed" };',
      },
    ],
  },
  {
    name: "mutant.unsent-restored-outside-boot",
    says: "a refused first capture ends the never-sent head unknown { Restored } instead of NotSent { StorageRefused }",
    expects: "WriteLanes I3",
    runtime: "prototype",
    cases: ["PAY-10/refuse"],
    edits: [
      {
        file: "lane.ts",
        find: '    const e = declined("StorageRefused");\n    noteEnding(tx, { op: l!.op, attempt: h.id }, e);',
        replace:
          '    const e: Ending = { ch: "unknown", reason: "Restored" };\n    noteEnding(tx, { op: l!.op, attempt: h.id }, e);',
      },
    ],
  },
];
