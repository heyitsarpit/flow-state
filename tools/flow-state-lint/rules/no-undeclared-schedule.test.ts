// Planted violations for no-undeclared-schedule, run through oxlint with the options vite.config.ts
// gives it: a schedule placed in a machine body that its definition does not declare, in any form,
// and every use of the old form's names.
// Run: node --experimental-strip-types tools/flow-state-lint/rules/no-undeclared-schedule.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { imports, inWorkdir, plantRules, root } from "./test-support.ts";

const Plain = 'const Plain = definition({ id: "P", states: ["ON"], events: {}, internalEvents: { T: {} } });';

const Declared =
  'const Declared = definition({ id: "D", states: ["ON"], events: {}, internalEvents: { T: {} }, schedules: { tick: {} } });';

// Each part runs and reports alone, so one failing part never hides another's verdict.
const failures: Array<string> = [];

const part = (name: string, run: () => void) => {
  try {
    run();
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
  }
};

part("planted uses", () => plantRules({
  "no-undeclared-schedule": {
    fires: [
      `${Plain} machine(Plain, ({ S, E }) => ({ default: S.ON, states: { ON: { schedules: { tick: { schedule: 1000, send: E.T } } } } }));`,
      `${Plain} const ticks = { tick: { schedule: 1000, send: Plain.E.T } }; machine(Plain, ({ S }) => ({ default: S.ON, states: { ON: { schedules: ticks } } }));`,
      `${Plain} const on = (send) => ({ schedules: { tick: { schedule: 1000, send } } }); machine(Plain, ({ S, E }) => ({ default: S.ON, states: { ON: on(E.T) } }));`,
      `${Declared} machine(Declared, ({ S, E }) => ({ default: S.ON, states: { ON: { schedules: { tock: { schedule: 1000, send: E.T } } } } }));`,
      `${Plain} const tick = { schedule: 1000, send: Plain.E.T }; machine(Plain, ({ S }) => ({ default: S.ON, states: { ON: { schedules: { tick } } } }));`,
      `${Plain} const base = { tick: { schedule: 1000, send: Plain.E.T } }; machine(Plain, ({ S }) => ({ default: S.ON, states: { ON: { schedules: { ...base } } } }));`,
      `${Plain} const schedules = { tick: { schedule: 1000, send: Plain.E.T } }; machine(Plain, ({ S }) => ({ default: S.ON, states: { ON: { schedules } } }));`,
      'const wrapped = { "~flow": "keyed", config: {} };',
      "Flow.keyed({ keys: () => [], schedule: 1000, send: Plain.E.T });",
      "const wrap = Flow.keyed;",
      "type Old = KeyedConfig<never, never, string, never, never>;",
      "type Wide = ScheduleKey;",
      "type Kin = KeyedSchedule | ScheduleParts<never, never, string, never, never> | ErasedEntry;",
    ],
    quiet: [
      `${Declared} machine(Declared, ({ S, E }) => ({ default: S.ON, states: { ON: { schedules: { tick: { schedule: 1000, send: E.T } } } } }));`,
      `${Declared} const ticks = { tick: { schedule: 1000, send: Declared.E.T } }; machine(Declared, ({ S }) => ({ default: S.ON, states: { ON: { schedules: ticks } } }));`,
      "const timers = snapshot.schedules;",
      'const text = "schedules";',
    ],
    silent: [],
  },
}));

// A body whose definition sits in a sibling file, as every reference app writes it: the rule reads
// the imported definition's declaration.
part("a definition in a sibling file", () => inWorkdir(({ pkg, write, lint, lines }) => {
  const folder = join(pkg, "fixtures", "split");

  write(
    join(folder, "lamp.definition.ts"),
    `${imports}\nexport ${Plain}\nexport ${Declared}\n`,
  );

  const body = [
    'import { Declared, Plain } from "./lamp.definition.ts";',
    "machine(Plain, ({ S, E }) => ({ default: S.ON, states: { ON: { schedules: { tick: { schedule: 1000, send: E.T } } } } }));",
    "machine(Declared, ({ S, E }) => ({ default: S.ON, states: { ON: { schedules: { tick: { schedule: 1000, send: E.T } } } } }));",
  ];

  write(join(folder, "lamp.machine.ts"), `${imports}\n${body.join("\n")}\n`);

  const importLines = imports.split("\n").length;

  assert.deepEqual(
    lines(lint(), join(folder, "lamp.machine.ts"), "no-undeclared-schedule"),
    [importLines + 2],
    "an imported undeclared definition fires and an imported declared one stays quiet",
  );
}));

// `nub run check` runs the rule over the reference apps, which sit outside the package.
const scripts: Readonly<Record<string, string>> = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
).scripts;

for (const app of ["wiki/plans/flow/references/checkout", "wiki/plans/flow/references/dispatch-desk"])
  part(`the reference app ${app}`, () => assert.ok(
    Object.values(scripts).some((script) => script.includes("no-undeclared-schedule") && script.includes(app)) &&
      /references/u.test(scripts["check"] ?? ""),
    `nub run check runs no-undeclared-schedule over ${app}`,
  ));

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else console.log("flow-state no-undeclared-schedule tests passed");
