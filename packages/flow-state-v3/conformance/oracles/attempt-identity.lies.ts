import type { Lie } from "./oracle.ts";

const SEND = "      input: h.input,\n      ctx: { id: h.id, mayHaveApplied: h.mayHaveApplied },";

/**
 * Wrong runtimes the attempt-identity oracle must catch.
 *
 * **Details**
 *
 * Both edit the prototype's invoke command, where a re-send's commit gets its id and input.
 */
export const attemptIdentityLies: ReadonlyArray<Lie> = [
  {
    name: "lie.resend-new-id",
    oracle: "attempt-identity",
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
    name: "lie.resend-new-input",
    oracle: "attempt-identity",
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
];
