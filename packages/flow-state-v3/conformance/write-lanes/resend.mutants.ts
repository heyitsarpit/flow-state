import type { Mutant } from "../dsl/oracle.ts";

/**
 * Wrong runtimes of a retry's re-send the `lane-queue` oracle must catch: the owed re-send never
 * made (WriteLanes I26, the step 6 review's PF) and a re-send under another Attempt (I9).
 */
export const resendMutants: ReadonlyArray<Mutant> = [
  {
    name: "lane.retry-members-dropped",
    says: "a turn drops every retry member from its act and its report (step 6 review PF)",
    expects: "WriteLanes I26",
    runtime: "prototype",
    cases: ["PAY-04", "PAY-22"],
    edits: [
      {
        file: "turn.ts",
        find: "    return part.alt.members.map((mem: Member) => {",
        replace:
          '    return part.alt.members.filter((mem: Member) => mem.verb !== "retry").map((mem: Member) => {',
      },
    ],
  },
  {
    name: "lane.retry-sends-another-attempt",
    says: "a retry re-sends the head under a new Attempt id, not the one its lane last sent",
    expects: "WriteLanes I9",
    runtime: "prototype",
    cases: ["PAY-04", "PAY-22"],
    edits: [
      {
        file: "lane.ts",
        find: '    note(tx, "invoked", { op: l!.op, attempt: h.id, send: gen });',
        replace:
          '    const rid = h.mayHaveApplied ? `${h.id}-again` : h.id;\n    note(tx, "invoked", { op: l!.op, attempt: rid, send: gen });',
      },
      {
        file: "lane.ts",
        find: '      k: "invoke",\n      attempt: h.id,',
        replace: '      k: "invoke",\n      attempt: rid,',
      },
      {
        file: "lane.ts",
        find: "      ctx: { id: h.id, mayHaveApplied: h.mayHaveApplied },",
        replace: "      ctx: { id: rid, mayHaveApplied: h.mayHaveApplied },",
      },
    ],
  },
];
