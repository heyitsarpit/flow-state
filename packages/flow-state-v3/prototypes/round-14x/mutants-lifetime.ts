// The lifetime experiment's wrong runtimes: each breaks one clause of the actor-lifetime rule, and LIFE-01..04 must go red on it.
// Same shape as mutate.ts's lists; run by ../conformance/lifetime-falsify.ts.
const m = (id: string, kills: string, file: string, find: string, replace = "") => ({ id, kills: [kills], edits: [[file, find, replace]] as ReadonlyArray<readonly [string, string, string]> });
export const MUTANTS = [
  // Work in progress is not a use: a busy actor goes when its last consumer does.
  m("life.busy-ignored", "lifetime:work-is-a-use", "step.ts", "export const busy = (w: World, key: string): boolean => {", "export const busy = (w: World, key: string): boolean => { if (w) return false;"),
  // A lane that is not Idle counts, but a parked ending does not.
  m("life.parked-not-a-use", "lifetime:work-is-a-use", "step.ts", "(l.head !== undefined || l.w.length > 0 || l.parked.length > 0)", "(l.head !== undefined || l.w.length > 0)"),
  // The sweep runs in the same task, so a StrictMode remount disposes.
  m("life.sweep-same-task", "lifetime:after-the-commit", "driver.ts", 'host.later(() => {\n      sweepAsked = false;\n      if (sweepDue(world)) input({ k: "sweep" });\n    });', 'sweepAsked = false;\n    input({ k: "sweep" });'),
  // No sweep at all: nothing is disposed for having no uses.
  m("life.no-sweep", "lifetime:non-persisted-is-gone", "driver.ts", "if (sweepAsked || fatal || work() || !sweepDue(world)) return;", "return;"),
  // A send to an absent persisted target stays unbound, as round 13.
  m("life.send-no-restore", "lifetime:send-restores", "step.ts", "restoreForSend(tx, input.actor);", ""),
  // Uses are not counted: any attach is the one use.
  m("life.uses-not-counted", "lifetime:uses-are-counted", "step.ts", "setUses(tx, i.actor, i.once ? Math.max(n, 1) : n + 1);", "setUses(tx, i.actor, 1);"),
  // The sweep disposes a persisted actor as if it were not: its record is not kept for the next ensure.
  m("life.sweep-drops-record", "lifetime:persisted-keeps-record", "step.ts", "    setUses(tx, key, undefined);\n    onDisposeActor(tx, key);", "    setUses(tx, key, undefined);\n    onDisposeActor(tx, key);\n    tx.w = { ...tx.w, retired: without(tx.w.retired, key) };"),
];
