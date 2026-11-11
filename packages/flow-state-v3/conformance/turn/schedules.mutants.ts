import type { Mutant } from "../dsl/oracle.ts";

/**
 * Wrong runtimes the `schedules` oracle must catch.
 *
 * **Details**
 *
 * - `life.schedule-fires-unused`: round-14's own mutant; a deadline fires while its actor is not
 *   used.
 * - `sched.outlives-activation`: an exit leaves its schedules armed and their firings are not
 *   fenced (round-14's `turn.timers-not-reaped` with the fence dropped).
 * - `sched.fires-at-once`: a schedule is armed due at once, so it fires in the arming step.
 * - `life.waiting-never-wakes`: round-14's own mutant; a deadline that waited is never fired when
 *   a use returns (caught by `TURN-03/unused`'s expectation).
 */
export const schedulesMutants: ReadonlyArray<Mutant> = [
  {
    name: "life.schedule-fires-unused",
    says: "a deadline fires while its actor is not used",
    expects: "Turn I23",
    runtime: "prototype",
    cases: ["TURN-03/unused"],
    edits: [
      {
        file: "step.ts",
        find: "if (counted(tx, t.actor) && usesOf(tx.w, t.actor) === 0) {",
        replace: "if (false) {",
      },
    ],
  },
  {
    name: "sched.outlives-activation",
    says: "an exit leaves its schedules armed and a firing of an ended Activation is delivered",
    expects: "Turn I20",
    runtime: "prototype",
    cases: ["TURN-03/exited", "TURN-03/re-entered"],
    edits: [
      { file: "turn.ts", find: "  reapTimers(w);\n", replace: "" },
      {
        file: "turn.ts",
        find: '    if (!inc || inc.frozen || !Object.values(inc.activations).includes(item.activation))\n      return note(tx, "fence"',
        replace: '    if (!inc || inc.frozen)\n      return note(tx, "fence"',
      },
    ],
  },
  {
    name: "sched.fires-at-once",
    says: "a schedule is armed due at once, in the turn that arms it",
    expects: "Turn I21",
    runtime: "prototype",
    cases: ["TURN-03/on-time"],
    edits: [
      {
        file: "turn.ts",
        find: "      dueAt: tx.env.now + x.ms,",
        replace: "      dueAt: tx.env.now,",
      },
    ],
  },
];

/**
 * Wrong runtimes the schedule cases' own expectations must catch.
 */
export const schedulesCaseMutants: ReadonlyArray<Mutant> = [
  {
    name: "pay16.schedule-reads-pre-transition-memory",
    says: "a schedule function reads the pre-turn memory instead of the After memory (round-14's own mutant, Turn Spec T5)",
    expects: "Turn I12",
    runtime: "prototype",
    cases: ["PAY-16/schedule-reads-after-memory"],
    edits: [
      {
        file: "turn.ts",
        find: "run(spec.schedule, inView(inc, {}) as never)",
        replace:
          "run(spec.schedule, inView(kidAt(w.root0, pathOfId(w.root, inc.id)!) ?? inc, {}) as never)",
      },
    ],
  },
  {
    name: "life.waiting-never-wakes",
    says: "a deadline that waited for a use is never fired when the use returns",
    expects: "Turn I22",
    runtime: "prototype",
    cases: ["TURN-03/unused"],
    edits: [
      {
        file: "step.ts",
        find: "if (was === 0 && getActor(tx.w.actors, key)) wake(tx, key);",
        replace: "",
      },
    ],
  },
];
