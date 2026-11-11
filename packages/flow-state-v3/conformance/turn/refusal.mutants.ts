import type { Mutant } from "../dsl/oracle.ts";

/**
 * Wrong runtimes the `refusal` oracle must catch.
 *
 * **Details**
 *
 * - `refusal.reports-kept`: a refused turn's reports are not dropped, so its `Turn` is reported.
 * - `refusal.state-kept`: a turn writes its actor before it validates its schedules, and a refused
 *   turn's world is not rolled back.
 * - `refusal.unhandled-patches`: an Unhandled or Denied event still writes into memory.
 */
export const refusalMutants: ReadonlyArray<Mutant> = [
  {
    name: "refusal.reports-kept",
    says: "a refused turn keeps the reports it made before it was refused",
    expects: "Turn I14",
    runtime: "prototype",
    cases: ["TURN-01/schedule-refused"],
    edits: [{ file: "turn.ts", find: "    tx.evidence.length = kept.evidence;\n", replace: "" }],
  },
  {
    name: "refusal.state-kept",
    says: "a turn writes its actor before validating its schedules, and a refusal keeps it",
    expects: "Turn I14",
    runtime: "prototype",
    cases: ["TURN-01/schedule-refused"],
    edits: [
      {
        file: "turn.ts",
        find: "  const armings = collectArmings(w, entered);",
        replace:
          "  tx.w = { ...tx.w, actors: setActor(tx.w.actors, w.a.key, { ...w.a, root: w.root }) };\n  const armings = collectArmings(w, entered);",
      },
      {
        file: "turn.ts",
        find: "    tx.w = { ...kept.w, disabled: tx.w.disabled };",
        replace: "    tx.w = { ...tx.w, disabled: tx.w.disabled };",
      },
    ],
  },
  {
    name: "refusal.unhandled-patches",
    says: "an Unhandled or Denied event still writes its name into memory",
    expects: "Turn I15",
    runtime: "prototype",
    cases: ["TURN-02"],
    edits: [
      {
        file: "turn.ts",
        find: '    return note(tx, sel.denied ? "Denied" : "Unhandled", { event: ev.tag, reasons: sel.reasons });',
        replace:
          '  {\n    tx.w = { ...tx.w, actors: setActor(tx.w.actors, a.key, { ...a, root: { ...a.root, memory: { ...(a.root.memory as object), notice: ev.tag } } }) };\n    tx.touchedActors.add(a.key);\n    tx.visible = true;\n    return note(tx, sel.denied ? "Denied" : "Unhandled", { event: ev.tag, reasons: sel.reasons });\n  }',
      },
    ],
  },
];
