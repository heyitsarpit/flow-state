import type { Mutant } from "../dsl/oracle.ts";

const DROP_CANCELS = {
  file: "turn.ts",
  find: "    return part.alt.members.map((mem: Member) => {",
  replace:
    '    return part.alt.members.filter((mem: Member) => mem.verb !== "cancel" && mem.verb !== "cancelAll").map((mem: Member) => {',
};

const HEADER_NOWHERE = {
  file: "turn.ts",
  find: "    to: w.root.leaf,",
  replace:
    '    to: w.parts.some((p) => p.alt.members.some((m: Member) => m.verb === "cancel" || m.verb === "cancelAll")) ? "Nowhere" : w.root.leaf,',
};

/**
 * The step 9 review's header probe as a `lane-queue` mutant: with the lifecycle reading the header
 * as Turn I2 judges it, the dropped cancels are WriteLanes I12 again.
 */
export const headerLaneMutants: ReadonlyArray<Mutant> = [
  {
    name: "lie.cancels-dropped-header-nowhere",
    says: "a turn drops every cancel and cancelAll member and reports ending at a state that does not exist",
    expects: "WriteLanes I12",
    runtime: "prototype",
    cases: ["PAY-03", "LANE-09"],
    edits: [DROP_CANCELS, HEADER_NOWHERE],
  },
];

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
    name: "a3.r14-explicit-reentry-keeps-activation",
    says: "an explicit re-entry keeps the state's Activation instead of starting a new one (Turn Spec T1)",
    expects: "Turn I5",
    runtime: "prototype",
    cases: ["TURN-04/re-entry-makes-the-first-ending-late"],
    edits: [
      {
        file: "turn.ts",
        find: "for (const n of enters) activations[n] = nextGen(w.tx);",
        replace:
          "for (const n of enters) activations[n] = mv.history || inc.activations[n] === undefined ? nextGen(w.tx) : inc.activations[n];",
      },
    ],
  },
  {
    name: "audit-1.r14-reentry-keeps-activation",
    says: "every entered state keeps an Activation it already had (Turn Spec T1)",
    expects: "Turn I5",
    runtime: "prototype",
    cases: ["TURN-04/re-entry-makes-the-first-ending-late"],
    edits: [
      {
        file: "turn.ts",
        find: "for (const n of enters) activations[n] = nextGen(w.tx);",
        replace: "for (const n of enters) activations[n] = inc.activations[n] ?? nextGen(w.tx);",
      },
    ],
  },
  {
    name: "turn.part-turn-moves-header",
    says: "a turn that ran only a trait's alternative reports leaving the root's leaf",
    expects: "Turn I2",
    runtime: "prototype",
    cases: ["LANE-12/release-ends-queue"],
    edits: [
      {
        file: "turn.ts",
        find: "    to: w.root.leaf,",
        replace:
          '    to: w.parts.length > 0 && w.parts.every((p) => p.path.length > 0) ? "AWAY" : w.root.leaf,',
      },
    ],
  },
  {
    name: "turn.root-first-no-part",
    says: "selection reads the root before the leaf on CheckTick and those turns report no root part",
    expects: "Turn I2",
    runtime: "prototype",
    cases: ["TURN-03/on-time", "PAY-08/reload-while-reconciling"],
    edits: [
      {
        file: "turn.ts",
        find: "  for (const node of up(frag, start ?? inc.leaf)) {",
        replace:
          '  for (const node of ev.tag === "CheckTick" ? up(frag, start ?? inc.leaf).reverse() : up(frag, start ?? inc.leaf)) {',
      },
      {
        file: "turn.ts",
        find: "    parts: w.parts.map((p) => ({ path: p.path,",
        replace: '    parts: (ev.tag === "CheckTick" ? [] : w.parts).map((p) => ({ path: p.path,',
      },
    ],
  },
  {
    name: "turn.root-first-on-restored",
    says: "selection reads the root before the leaf for an unknown { Restored } ending only",
    expects: "Turn I2",
    runtime: "prototype",
    cases: ["DLV-01", "PAY-05", "PAY-08/reload-while-reconciling"],
    edits: [
      {
        file: "turn.ts",
        find: "  for (const node of up(frag, start ?? inc.leaf)) {",
        replace:
          '  for (const node of w.item?.k === "ending" && endingReason(w.item.ending) === "Restored" ? up(frag, start ?? inc.leaf).reverse() : up(frag, start ?? inc.leaf)) {',
      },
    ],
  },
  {
    name: "turn.cancels-dropped-no-part",
    says: "a turn drops its cancels, reports staying where it was and reports no root part",
    expects: "Turn I2",
    runtime: "prototype",
    cases: ["PAY-03", "PAY-14", "PAY-21", "LANE-09"],
    edits: [
      DROP_CANCELS,
      {
        file: "turn.ts",
        find: "    to: w.root.leaf,",
        replace:
          '    to: w.parts.some((p) => p.alt.members.some((m: Member) => m.verb === "cancel" || m.verb === "cancelAll")) ? from : w.root.leaf,',
      },
      {
        file: "turn.ts",
        find: "    parts: w.parts.map((p) => ({ path: p.path,",
        replace:
          '    parts: (w.parts.some((p) => p.alt.members.some((m: Member) => m.verb === "cancel" || m.verb === "cancelAll")) ? [] : w.parts).map((p) => ({ path: p.path,',
      },
    ],
  },
  {
    name: "turn.late-leaves-work",
    says: "a late turn may leave a state whose Activation owns pending work",
    expects: "Turn I27",
    runtime: "prototype",
    cases: ["PAY-07/late-may-not-leave"],
    edits: [
      {
        file: "turn.ts",
        find: '      if (w.late && leavesWork(w, inc, alt)) {\n        reasons.push("LateMayNotLeave");\n        continue;\n      }\n',
        replace: "",
      },
    ],
  },
  {
    name: "turn.header-to-nowhere",
    says: "a turn drops its cancel and cancelAll members and reports ending at a state that does not exist",
    expects: "Turn I2",
    runtime: "prototype",
    cases: ["PAY-12/cancel-on-wire", "LANE-09"],
    edits: [DROP_CANCELS, HEADER_NOWHERE],
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
  {
    name: "turn.cancel-turns-unhandled",
    says: "an event whose selected alternative runs a cancel is reported Unhandled and runs nothing",
    expects: "Turn I2",
    runtime: "prototype",
    cases: ["PAY-03"],
    edits: [
      {
        file: "turn.ts",
        find: "      return { node, alt };",
        replace:
          '      if (alt.members.some((m: Member) => m.verb === "cancel")) return { denied: false, reasons };\n      return { node, alt };',
      },
    ],
  },
  {
    name: "late.routed-from-leaf",
    says: "an ending whose owner Activation has ended is routed from the active leaf, as a current one",
    expects: "Turn I26",
    runtime: "prototype",
    cases: ["PAY-07/late-in-a-new-PAYING"],
    edits: [
      {
        file: "turn.ts",
        find: "  if (inc.activations[item.owner.node] === item.owner.activation)\n    return { start: undefined, late: false };",
        replace: "  if (true)\n    return { start: undefined, late: false };",
      },
    ],
  },
];
