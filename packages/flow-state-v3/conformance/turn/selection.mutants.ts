import type { Mutant } from "../dsl/oracle.ts";

const DROP_CANCELS = {
  file: "turn.ts",
  find: "    return part.alt.members.map((mem: Member) => {",
  replace:
    '    return part.alt.members.filter((mem: Member) => mem.verb !== "cancel" && mem.verb !== "cancelAll").map((mem: Member) => {',
};

/**
 * Wrong runtimes the `selection` oracle must catch, each by a violation of Turn I2.
 *
 * **Details**
 *
 * `turn.header-to-nowhere` is the step 9 review's probe (its H1): a runtime that drops every
 * cancel and cancelAll member and reports `to` as a state no handler names on those turns, so a
 * lane oracle reading the header would choose no row.
 */
export const selectionMutants: ReadonlyArray<Mutant> = [
  {
    name: "turn.header-to-nowhere",
    says: "a turn drops its cancel and cancelAll members and reports ending at a state that does not exist",
    expects: "Turn I2",
    runtime: "prototype",
    cases: ["PAY-12/cancel-on-wire", "LANE-09"],
    edits: [
      DROP_CANCELS,
      {
        file: "turn.ts",
        find: "    to: w.root.leaf,",
        replace:
          '    to: w.parts.some((p) => p.alt.members.some((m: Member) => m.verb === "cancel" || m.verb === "cancelAll")) ? "Nowhere" : w.root.leaf,',
      },
    ],
  },
  {
    name: "turn.from-misreported",
    says: "a turn reports starting at the leaf it ends at",
    expects: "Turn I2",
    runtime: "prototype",
    cases: ["PAY-01"],
    edits: [
      {
        file: "turn.ts",
        find: "    from,\n    to: w.root.leaf,",
        replace: "    from: w.root.leaf,\n    to: w.root.leaf,",
      },
    ],
  },
  {
    name: "turn.root-first",
    says: "selection reads the root's handlers before the active leaf's",
    expects: "Turn I2",
    runtime: "prototype",
    cases: ["PAY-04"],
    edits: [
      {
        file: "turn.ts",
        find: "  for (const node of up(frag, start ?? inc.leaf)) {",
        replace: "  for (const node of up(frag, start ?? inc.leaf).reverse()) {",
      },
    ],
  },
];
