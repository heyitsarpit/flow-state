import type { Fault } from "./faults.ts";

/**
 * Faults of placements and released calls, each caught by its own target tests. Each edits the
 * code that owns its rule; when that code moves, a fault keeps its test and takes a new `find`
 * there.
 */
export const placementFaults: ReadonlyArray<Fault> = [
  {
    name: "overdue-early",
    tests: ["tests/chat/reads.test.ts"],
    says: "a released call shows ReleaseOverdue from its release, before the disposal bound passes",
    rule: "Operations R8, I11",
    edits: [
      {
        file: "src/core/issues-of.ts",
        find: "      .filter(([call]) => !world.alarms.has(alarmKey(Alarm.Release({ call }))))",
        replace: "      .filter(([call]) => call !== alarmKey(Alarm.Release({ call })))",
      },
    ],
  },
  {
    name: "overdue-kept-after-end",
    tests: ["tests/chat/reads.test.ts"],
    says: "a released call that ends stays releasing, so its holders keep ReleaseOverdue",
    rule: "Operations R8, I11",
    edits: [
      {
        file: "src/core/entry-releases.ts",
        find: '    tx.drop("releasing", call);\n',
        replace: "",
      },
    ],
  },
  {
    name: "release-alarm-not-cleared",
    tests: ["tests/chat/reads.test.ts"],
    says: "a released call that ends keeps its Release alarm, which owns no fact",
    rule: "Operations I22",
    edits: [
      {
        file: "src/core/entry-releases.ts",
        find: "    tx.clearAlarm(Alarm.Release({ call }));\n",
        replace: "",
      },
    ],
  },
  {
    name: "release-without-interrupt",
    tests: ["tests/search/results.test.ts"],
    says: "a released call is never told to stop, so it runs on and its answer is delivered",
    rule: "Operations R8, Releases",
    edits: [
      {
        file: "src/core/entry-releases.ts",
        find: "        tx.command(Command.Interrupt({ call }));\n",
        replace: "",
      },
    ],
  },
  {
    name: "released-unrecorded",
    tests: ["tests/chat/reads.test.ts"],
    says: "a released call that ends leaves no Released evidence",
    rule: "Operations Releases (evidence Released)",
    edits: [
      {
        file: "src/core/entry-releases.ts",
        find: "    tx.act(Act.ReadReleased({ operation: releasing.operation }));\n",
        replace: "",
      },
    ],
  },
  {
    name: "overdue-unrecorded",
    tests: ["tests/chat/reads.test.ts"],
    says: "a released call past the disposal bound leaves no ReleaseOverdue evidence",
    rule: "Operations Releases (evidence ReleaseOverdue)",
    edits: [
      {
        file: "src/core/entry-releases.ts",
        find: "        tx.act(Act.ReleaseOverdue());\n",
        replace: "",
      },
    ],
  },
  {
    name: "placement-kept-after-exit",
    tests: ["tests/search/results.test.ts"],
    says: "a state's exit leaves its placement holding its entry, so its read runs on",
    rule: "Operations, placements (unplace at exit)",
    edits: [
      {
        file: "src/core/placements.ts",
        find: "      if (!active.has(operation)) entries.unplace(incarnation, operation);",
        replace:
          "      if (active.has(operation) && !active.has(operation)) entries.unplace(incarnation, operation);",
      },
    ],
  },
  {
    name: "placeholder-unmarked",
    tests: ["tests/transfers/reads.test.ts"],
    says: "a placement's placeholder reaches its mapper as landed data",
    rule: "Plan Operations O6",
    edits: [
      {
        file: "src/core/serve.ts",
        find: '          placeholder: Origin.$is("Placeholder")(ending.origin),',
        replace: "          placeholder: false,",
      },
    ],
  },
  {
    name: "select-failure-quiet",
    tests: ["tests/transfers/reads.test.ts"],
    says: "a placement whose select named no key shows no issue",
    rule: "Operations R11, I23",
    edits: [
      {
        file: "src/core/issues-of.ts",
        find: "          Unkeyed: ({ failed }) => Option.some(failed),",
        replace: "          Unkeyed: () => Option.none<string>(),",
      },
    ],
  },
  {
    name: "kept-key-quiet",
    tests: ["tests/transfers/reads.test.ts"],
    says: "a placement whose select throws keeps its last key but shows no issue",
    rule: "Operations R11, I23",
    edits: [
      {
        file: "src/core/entry-placements.ts",
        find: "          onSome: (p) => ({ ...p, failed: Option.some(slot) }),",
        replace: "          onSome: (p) => ({ ...p, failed: Option.none<string>() }),",
      },
    ],
  },
  {
    name: "row-confirmed-only",
    tests: ["tests/shop/mini-cart.test.ts", "tests/session/shell-reads.test.ts"],
    says: "a read's row shows only confirmed data, never a live optimistic value",
    rule: "Plan Operations O5, O6 (every reader sees optimistic updates)",
    edits: [
      {
        file: "src/core/read-rows.ts",
        find: "    data: Option.getOrUndefined(Option.map(entry.data, (d) => viewOf(entry, d.value))),",
        replace: "    data: Option.getOrUndefined(Option.map(entry.data, (d) => d.value)),",
      },
    ],
  },
  {
    name: "row-never-predicted",
    tests: ["tests/shop/mini-cart.test.ts", "tests/session/shell-reads.test.ts"],
    says: "a read's row never marks a live optimistic value as predicted",
    rule: "Plan Operations O6 (predicted)",
    edits: [
      {
        file: "src/core/read-rows.ts",
        find: "    predicted: entry.layers.length > 0,",
        replace: "    predicted: entry.layers.length < 0,",
      },
    ],
  },
  {
    name: "row-defect-ready",
    tests: ["tests/chat/reads.test.ts"],
    says: "a read whose last landed ending is a Defect rows as Ready",
    rule: "Plan Operations O6 (resource tags)",
    edits: [
      {
        file: "src/core/read-rows.ts",
        find: "          Defect: () => ReadRow.Defect(seen),",
        replace: "          Defect: () => ReadRow.Ready(seen),",
      },
    ],
  },
  {
    name: "failure-kept-as-unknown",
    tests: ["tests/shop/mini-cart.test.ts"],
    says: "a commit's plain failure keeps its optimistic value and reads again, as an unknown does",
    rule: "Plan Operations O5",
    edits: [
      {
        file: "src/core/entry-view.ts",
        find: '  failure: "removed",',
        replace: '  failure: "unknown",',
      },
    ],
  },
];
