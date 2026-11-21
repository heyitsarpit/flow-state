// Planted violations for no-undeclared-schedule, run through oxlint with the options vite.config.ts
// gives it: a schedule placed in a machine body that its definition does not declare, in any form,
// and every use of the old form's names.
// Run: node --experimental-strip-types tools/flow-state-lint/rules/no-undeclared-schedule.test.ts
import { plantRules } from "./test-support.ts";

const Plain = 'const Plain = definition({ id: "P", states: ["ON"], events: {}, internalEvents: { T: {} } });';

const Declared =
  'const Declared = definition({ id: "D", states: ["ON"], events: {}, internalEvents: { T: {} }, schedules: { tick: {} } });';

plantRules({
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
    ],
    quiet: [
      `${Declared} machine(Declared, ({ S, E }) => ({ default: S.ON, states: { ON: { schedules: { tick: { schedule: 1000, send: E.T } } } } }));`,
      `${Declared} const ticks = { tick: { schedule: 1000, send: Declared.E.T } }; machine(Declared, ({ S }) => ({ default: S.ON, states: { ON: { schedules: ticks } } }));`,
      "const timers = snapshot.schedules;",
      'const text = "schedules";',
    ],
    silent: [],
  },
});

console.log("flow-state no-undeclared-schedule tests passed");
