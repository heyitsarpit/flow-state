// Stage A, round 10: undo each small runtime fix, and the audit's survivors that whole output should now see. Builder-written.
import type { Mutant } from "../conformance/mutate.ts";
const m = (id: string, kills: string, file: string, find: string, replace: string): Mutant => ({ id, kills: [kills], edits: [[file, find, replace]] });
export const MUTANTS: readonly Mutant[] = [
  m("d136.bill-per-pump", "D136", "driver.ts", "running = true;\n    try {", "running = true;\n    mark = clock();\n    try {"),
  m("d136.chain-keeps-counting", "D136", "driver.ts", "chain = 0; // D136, review H2: a task has passed, so what a listener sends next is a new chain. The bound counts one cascade, not how many slices a long drain took\n      stormed = false;", ""),
  m("d136.notify-each-pump", "D136", "driver.ts", "if (heard) {\n      owed = true;\n      return;\n    }", ""),
  m("d136.owed-lost", "D136", "driver.ts", "if (owed) {\n          owed = false;\n          notify();\n        }", ""),
  m("d137.mismatch-silent", "D137", "step.ts", 'if (live.machine !== machine) issue(tx, { code: "ActorMachineMismatch", origin: `ensure ${machine}`, input: { key, is: live.machine } });', ""),
  m("d138.self-allowed", "D138", "gate.ts", 'new Set(["self", "__proto__"])', 'new Set(["__proto__"])'),
  m("d139.symbol-text", "D139", "gate.ts", 'typeof x === "function" || typeof x === "symbol" ||', 'typeof x === "function" ||'),
  m("d139.nan-carried", "D139", "gate.ts", "throw new Error(`${x} has no carried form`);", "return `$${x}`;"),
  m("d140.queue-loses-order", "D140", "mailq.ts", "else runs[i] = { ...r, start: r.start + 1 };", "else runs[i] = { ...r, end: r.end - 1 };"),
  m("d140.branch-shares-buffer", "D140", "mailq.ts", "const buf = last.buf.length === last.end ? last.buf : last.buf.slice(last.start, last.end);", "const buf = last.buf;"),
  m("d141.date-collapses", "D141", "adapter.ts", "if (v instanceof Date) return `$date:${v.getTime()}`;", ""),
  m("audit.A02-junk-key", "rule:46", "edge.ts", "host.storage.write(writes, purpose,", 'host.storage.write([...writes, { key: "junk/x", value: "1" }], purpose,'),
];
