import type { Mutant } from "../dsl/oracle.ts";

const SEND = "      input: h.input,\n      ctx: { id: h.id, mayHaveApplied: h.mayHaveApplied },";

/**
 * Wrong runtimes the attempt-identity oracle must catch.
 *
 * **Details**
 *
 * The first two edit the prototype's invoke command, where a re-send's commit gets its id and
 * input; the third edits the report of an invoke, which names another operation than the one
 * the Attempt was minted under; the fourth edits the invoke command's input, so the sends carry
 * another key than the one the mint reported.
 */
export const attemptIdentityMutants: ReadonlyArray<Mutant> = [
  {
    name: "mutant.resend-new-id",
    says: "a re-send gives its commit a new id while reporting the Attempt's own",
    expects: "WriteLanes I6",
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
    expects: "WriteLanes I6",
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
    expects: "WriteLanes I6",
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
  {
    name: "mutant.mint-key-differs",
    says: "an Attempt's sends carry another intent than the key its mint reported",
    expects: "WriteLanes I6",
    runtime: "prototype",
    cases: ["PAY-01"],
    edits: [
      {
        file: "lane.ts",
        find: SEND,
        replace:
          '      input: h.input !== null && typeof h.input === "object" && "intentId" in h.input ? { ...h.input, intentId: "elsewhere" } : h.input,\n      ctx: { id: h.id, mayHaveApplied: h.mayHaveApplied },',
      },
    ],
  },
];
