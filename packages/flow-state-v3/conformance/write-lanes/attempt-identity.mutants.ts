import type { Mutant } from "../dsl/oracle.ts";

const SEND = "      input: h.input,\n      ctx: { id: h.id, mayHaveApplied: h.mayHaveApplied },";

/**
 * Wrong runtimes the attempt-identity oracle must catch.
 *
 * **Details**
 *
 * The first two edit the prototype's invoke command, where a re-send's commit gets its id and
 * input; the third edits the report of an invoke, which names another operation than the one
 * the Attempt was minted under.
 */
export const attemptIdentityMutants: ReadonlyArray<Mutant> = [
  {
    name: "mutant.resend-new-id",
    says: "a re-send gives its commit a new id while reporting the Attempt's own",
    runtime: "prototype",
    cases: ["PAY-04"],
    edits: [
      {
        file: "lane.ts",
        find: SEND,
        replace:
          "      input: h.input,\n      ctx: { id: h.mayHaveApplied ? `${h.id}-again` : h.id, mayHaveApplied: h.mayHaveApplied },",
      },
    ],
  },
  {
    name: "mutant.resend-new-input",
    says: "a re-send carries another input under the same id",
    runtime: "prototype",
    cases: ["PAY-04"],
    edits: [
      {
        file: "lane.ts",
        find: SEND,
        replace:
          "      input: h.mayHaveApplied ? { ...h.input, again: true } : h.input,\n      ctx: { id: h.id, mayHaveApplied: h.mayHaveApplied },",
      },
    ],
  },
  {
    name: "mutant.sent-under-another-operation",
    says: "an invoke of a pay Attempt is reported under the place operation",
    runtime: "prototype",
    cases: ["PAY-01"],
    edits: [
      {
        file: "lane.ts",
        find: 'note(tx, "invoked", { op: l!.op, attempt: h.id, send: gen });',
        replace: 'note(tx, "invoked", { op: "place", attempt: h.id, send: gen });',
      },
    ],
  },
];
