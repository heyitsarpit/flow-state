import type { Fault } from "./faults.ts";

/**
 * Wrong runtimes for the schedule state rules: a schedule's issues read from its timers' check
 * outcomes and stored nowhere, each check writing only its own field, a refused start kept, saved
 * and tried again, and a baseline kept across a reload. Each is caught by the sequence rows or a
 * Story test that cites its rule.
 */
export const scheduleStateFaults: ReadonlyArray<Fault> = [
  {
    name: "schedule-issue-stored",
    rule: "Schedules R5, I14",
    tests: ["tests/turn/schedule-sequences.test.ts"],
    says: "a schedule's failures are also stored on the incarnation, so an issue outlives the check that cleared it",
    edits: [
      {
        file: "src/core/schedules.ts",
        find: "    const after = new Map<string, Scheduled>();",
        replace:
          "    const after = new Map<string, Scheduled>();\n    const stored: Array<Issue> = [];",
      },
      {
        file: "src/core/schedules.ts",
        find: "      reported(incarnation, schedule, decision.seen, decision.raised);",
        replace:
          "      reported(incarnation, schedule, decision.seen, decision.raised);\n      stored.push(...decision.raised.map((f) => issueOf(schedule.name, f.key, f)));",
      },
      {
        file: "src/core/schedules.ts",
        find: "    return changed ? reconciled({ ...incarnation, schedules: after }) : incarnation;",
        replace:
          "    const issued = { ...incarnation, issues: [...incarnation.issues, ...stored] };\n\n    return changed || stored.length > 0 ? reconciled({ ...issued, schedules: after }) : incarnation;",
      },
    ],
  },
  {
    name: "reason-read-touches-arming",
    rule: "Schedules I10, R4",
    tests: ["tests/turn/schedule-keys-table.test.ts", "tests/turn/schedule-sequences.test.ts"],
    says: "a pause reason that throws also idles its timer, so another check's state changes with it",
    edits: [
      {
        file: "src/core/schedule-decision.ts",
        find: "  const reasons = reasoned(pass, timer);",
        replace:
          '  const reasons = reasoned(pass, timer);\n\n  if (reasons._tag === "Failed") return timerOf({ ...timer, reasons, arming: IDLE });',
      },
    ],
  },
  {
    name: "hold-skipped-without-reasons",
    rule: "Schedules R14, I3",
    tests: ["tests/restore/schedule-edits.test.ts", "tests/turn/schedule-sequences.test.ts"],
    says: "table Timing is skipped for a schedule that declares no pause reason, so a restored hold stays held",
    edits: [
      {
        file: "src/core/schedule-decision.ts",
        find: "  const timing = timed(pass, timer.key, arming, valueOf(reasons));",
        replace:
          "  const timing =\n    pass.schedule.paused.length === 0 ? arming : timed(pass, timer.key, arming, valueOf(reasons));",
      },
    ],
  },
  {
    name: "restore-drops-refused-marker",
    rule: "Schedules R1, R14",
    tests: [
      "tests/restore/schedule-records.test.ts",
      "tests/home/hub.test.ts",
      "tests/turn/schedule-sequences.test.ts",
    ],
    says: "a saved refused start decodes idle, so a reload drops its issue and never tries it again",
    edits: [
      {
        file: "src/core/schedule-restore.ts",
        find: "        return Arming.Refused({ failure: { code: arming.code, slot: arming.slot } });",
        replace: "        return Arming.Idle();",
      },
    ],
  },
  {
    name: "refused-start-goes-idle",
    rule: "Schedules R1, I1",
    tests: ["tests/turn/schedule-keys-table.test.ts", "tests/turn/schedule-sequences.test.ts"],
    says: "a start whose first step fails leaves its timer idle with no issue",
    edits: [
      {
        file: "src/core/schedule-decision.ts",
        find: "    return Arming.Refused({ failure: first.failure });",
        replace: "    return IDLE;",
      },
    ],
  },
  {
    name: "restore-keeps-undeclared-reason",
    rule: "Schedules R14, I3",
    tests: ["tests/turn/schedule-sequences.test.ts"],
    says: "the decoder keeps a saved reason the build no longer declares, so a throwing renamed reason keeps the hold",
    edits: [
      {
        file: "src/core/schedule-restore.ts",
        find: '      reasons: { _tag: "Read", value: (saved.reasons ?? []).filter((r) => declared.has(r)) },',
        replace: '      reasons: { _tag: "Read", value: saved.reasons ?? [] },',
      },
    ],
  },
  {
    name: "first-read-restarts",
    rule: "Schedules R2, S-3",
    tests: ["tests/turn/schedule-sequences.test.ts"],
    says: "a timer's first clean selection counts as a change and restarts it",
    edits: [
      {
        file: "src/core/schedule-decision.ts",
        find: '    restart: restarts && Selection.$is("Selected")(p) && !unchanged,',
        replace: "    restart: restarts && !unchanged,",
      },
    ],
  },
  {
    name: "selection-dropped-at-wake",
    rule: "Schedules R3, I6",
    tests: ["tests/turn/schedule-sequences.test.ts", "tests/home/hub.test.ts"],
    says: "the decoder drops a saved baseline, so the next clean read after a reload is taken silently",
    edits: [
      {
        file: "src/core/schedule-restore.ts",
        find: "      selection: savedSelection(schedule, codecs, saved),",
        replace: '      selection: { _tag: "Read", value: Selection.Unselected() },',
      },
    ],
  },
  {
    name: "refused-not-retried",
    rule: "Schedules R1",
    tests: ["tests/turn/schedule-sequences.test.ts"],
    says: "a refused start is not tried again, so a delay that becomes valid never arms",
    edits: [
      {
        file: "src/core/schedule-decision.ts",
        find: '    Arming.$is("Refused")(timer.arming);',
        replace: '    Arming.$is("Refused")(timer.arming) && false;',
      },
    ],
  },
  {
    name: "reentry-finds-old-state",
    rule: "Schedules R11, I17",
    tests: ["tests/turn/schedule-sequences.test.ts"],
    says: "a re-entered state's schedules keep the old activation's timers",
    edits: [
      {
        file: "src/core/schedules.ts",
        find: "      const was = fresh.has(schedule.name)",
        replace: '      const was = fresh.has("")',
      },
    ],
  },
  {
    name: "no-wave-after-wake",
    rule: "Schedules R3, I13",
    tests: ["tests/turn/schedule-sequences.test.ts"],
    says: "no context change is heard after a wake whose context moved, so the owed restart is lost",
    edits: [
      {
        file: "src/core/incarnations.ts",
        find: "        return moved ? schedules.rechecked(woken, Occasion.Context()) : woken;",
        replace: "        return moved ? woken : woken;",
      },
    ],
  },
  {
    name: "wake-rebases",
    rule: "Schedules R3, I13",
    tests: ["tests/turn/schedule-sequences.test.ts"],
    says: "a wake re-reads restartOn for a timer with a baseline and takes the change silently",
    edits: [
      {
        file: "src/core/schedule-decision.ts",
        find: '    (Selection.$is("Unselected")(p) ||',
        replace:
          '    (Selection.$is("Unselected")(p) ||\n      Occasion.$is("Wake")(pass.occasion) ||',
      },
    ],
  },
  {
    name: "broken-resume-restarts",
    rule: "Schedules R4",
    tests: ["tests/restore/schedule-records.test.ts"],
    says: "a series whose delay throws at the wake fires on as a Duration with no issue",
    edits: [
      {
        file: "src/core/schedule-restore.ts",
        find: '      return Cursor.Broken({ failure: { code: "InvalidTurn", slot: planned.failure } });',
        replace: "      return Cursor.Once();",
      },
    ],
  },
];
