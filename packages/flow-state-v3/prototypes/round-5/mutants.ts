// Builder-written, to find gaps only. Not an independent number (owner's instruction). Each breaks one line .
import { REPLACED, ROUND5 } from "./mutants-r5.ts";
const OLD = [
  {
    id: "d58-pos-no-tick",
    kills: ["D58"],
    edits: [["world.ts", "tx.w = { ...tx.w, nextId: n + 1 }; return n;", "return n;"]],
  },
  {
    id: "d58-ge",
    kills: ["D58"],
    edits: [["entities.ts", "r.changedAt > start &&", "r.changedAt >= start &&"]],
  },
  {
    id: "d59-read-applies",
    kills: ["D59"],
    edits: [
      [
        "entities.ts",
        "out = doubted(out, c.ref, a.machine, cx); continue;",
        "out = doubted(out, c.ref, a.machine, cx);",
      ],
    ],
  },
  {
    id: "d59-success-no-doubt",
    kills: ["D59"],
    edits: [["entities.ts", "if (doubt) out = doubted(out, c.ref, e.machine, cx);", ""]],
  },
  {
    id: "d59-success-not-applied",
    kills: ["D59"],
    edits: [
      [
        "entities.ts",
        "out = carry(out, c.ref, c, cx.pos()); if (doubt)",
        "if (!doubt) out = carry(out, c.ref, c, cx.pos()); if (doubt)",
      ],
    ],
  },
  {
    id: "d58-doubt-cleared-by-early-read",
    kills: ["D58"],
    edits: [
      [
        "entities.ts",
        "if (r.doubt === undefined || start < r.doubt) return r;",
        "if (r.doubt === undefined) return r;",
      ],
    ],
  },
  {
    id: "d58-doubt-never-cleared",
    kills: ["D58"],
    edits: [["entities.ts", "const { doubt: _d, ...rest } = r; return rest;", "return r;"]],
  },
  {
    id: "d59-threw-no-doubt",
    kills: ["D59"],
    edits: [
      [
        "entities.ts",
        "for (const ref of e.refs) out = doubted(out, ref, e.machine, cx);",
        "for (const ref of e.refs) out = startRepair(out, ref, e.machine, cx);",
      ],
    ],
  },
  {
    id: "d57-carried-unchecked",
    kills: ["D57"],
    edits: [
      ["entities.ts", "if (Array.isArray(v) && v.every(ok)) return v;", "return v as never;"],
    ],
  },
  {
    id: "l4-read-replaces",
    kills: ["D58"],
    edits: [["entities.ts", "base: { ...r.base, ...fields },", "base: { ...fields },"]],
  },
  { id: "d57-canon-unsorted", kills: ["D57"], edits: [["gate.ts", ".sort()", ""]] },
  {
    id: "d57-list-non-array-throws",
    kills: ["D57"],
    edits: [
      [
        "gate.ts",
        "Array.isArray(v) ? { list: v, bad: false } : { list: [], bad: v !== undefined };",
        "({ list: v as never, bad: false });",
      ],
    ],
  },
  {
    id: "d57-list-bad-not-counted",
    kills: ["D57"],
    edits: [["gate.ts", "bad: v !== undefined }", "bad: false }"]],
  },
  {
    id: "d57-valid-leaf-unchecked",
    kills: ["D61"],
    edits: [["gate.ts", '!isStr(i["leaf"]) || !f.nodes[i["leaf"]]', '!isStr(i["leaf"])']],
  },
  {
    id: "d57-valid-kid-frag-unchecked",
    kills: ["D61"],
    edits: [
      [
        "gate.ts",
        'k["frag"] === p.fragment && validInc(m, k, p.fragment)',
        'validInc(m, k, k["frag"] as string)',
      ],
    ],
  },
  {
    id: "d57-valid-history-unchecked",
    kills: ["D61"],
    edits: [
      [
        "gate.ts",
        'if (!Object.values(i["history"]).every((n) => isStr(n) && f.nodes[n])) return false;',
        "",
      ],
    ],
  },
  {
    id: "d57-valid-frozen-unchecked",
    kills: ["D61"],
    edits: [["gate.ts", "fz !== undefined &&", "false &&"]],
  },
  {
    id: "d57-parked-not-sanitised",
    kills: ["D57"],
    edits: [["durable.ts", "if (text(p.ending) !== undefined) return p;", "return p;"]],
  },
  {
    id: "h3-hold-dropped-on-second-boot",
    kills: ["rule:46"],
    edits: [
      [
        "durable.ts",
        'if (h.held) { setLane(tx, { ...base, head: revive(h, { t: "held" }, true), subject: l.subject ?? [] });',
        'if (false) { setLane(tx, { ...base, head: revive(h, { t: "held" }, true), subject: l.subject ?? [] });',
      ],
    ],
  },
  {
    id: "l5-parked-in-lane-order",
    kills: ["rule:44"],
    edits: [
      [
        "durable.ts",
        "for (const [, l] of ordered) for (const p of l.parked ?? []) {",
        "for (const [, l] of [] as typeof ordered) for (const p of l.parked ?? []) {",
      ],
    ],
  },
  {
    id: "h6-exit-still-abandons",
    kills: ["rule:6"],
    edits: [["turn.ts", 'if (kind === "exits") w.exited.add(kid.id);', ""]],
  },
  {
    id: "h6-exit-skips-descendants",
    kills: ["rule:6"],
    edits: [["turn.ts", "if (w.exited.has(e.inc.id)) continue;", "if (w.exited.size) continue;"]],
  },
  { id: "m2-refreeze", kills: ["rule:1"], edits: [["turn.ts", "if (inc.frozen) return;", ""]] },
  {
    id: "m2-thaw-any",
    kills: ["rule:1"],
    edits: [["turn.ts", "if (kid.frozen && onActive(kid.name!))", "if (kid.frozen)"]],
  },
  {
    id: "m3-frozen-not-reconciled",
    kills: ["rule:9"],
    edits: [
      [
        "turn.ts",
        "if (host.kids[part]!.frozen && !want.has(host.kids[part]!.key!)) endInc(w, path, part, p);",
        "",
      ],
    ],
  },
  {
    id: "m4-facts-dropped",
    kills: ["rule:8"],
    edits: [
      [
        "turn.ts",
        "const mail = over ? facts : [...loops, ...facts, ...sends];",
        "const mail = over ? [] : [...loops, ...facts, ...sends];",
      ],
    ],
  },
  {
    id: "m4-loops-unbound",
    kills: ["D35"],
    edits: [
      [
        "turn.ts",
        "const mail = over ? facts : [...loops, ...facts, ...sends];",
        "const mail = [...loops, ...facts, ...(over ? [] : sends)];",
      ],
    ],
  },
  {
    id: "m5-fire-not-redelivered",
    kills: ["D50"],
    edits: [
      [
        "turn.ts",
        'if (item.k === "fire" && !again) enqueue(tx, { ...item, redelivered: true });',
        "",
      ],
    ],
  },
  {
    id: "m7-no-reorder",
    kills: ["rule:9"],
    edits: [["turn.ts", "if (!samePath(now, order)) {", "if (false) {"]],
  },
  {
    id: "d64-thaw-no-check",
    kills: ["D64"],
    edits: [
      [
        "turn.ts",
        "if (p.resetOn && resetValue(kidAt(w.root, mv.path)!, p) !== k.reset) endInc(w, mv.path, part, p); else",
        "",
      ],
    ],
  },
  {
    id: "r53-thaw-no-adoption",
    kills: ["rule:54"],
    edits: [["turn.ts", "w.thawed.push(path);", ""]],
  },
  {
    id: "thaw-says-restored",
    kills: ["rule:54"],
    edits: [
      [
        "turn.ts",
        'if (!thawing && l.head?.phase.t === "held" && !had) {',
        'if (l.head?.phase.t === "held" && !had) {',
      ],
    ],
  },
  {
    id: "m1-then-regardless",
    kills: ["D48"],
    edits: [
      [
        "lane.ts",
        "if (!queueBehind(tx, l!, a, policy)) return;",
        "queueBehind(tx, l!, a, policy);",
      ],
    ],
  },
  {
    id: "l6-fire-touches",
    kills: ["rule:8"],
    edits: [
      [
        "step.ts",
        "// L6: the record is not touched: if the turn never commits, the disk still has this timer.",
        "tx.touchedActors.add(t.actor);",
      ],
    ],
  },
  {
    id: "d57-to-unchecked",
    kills: ["D57"],
    edits: [
      [
        "turn.ts",
        "const path = Array.isArray(to) ? (to as Path) : [];",
        "const path = (to ?? []) as Path;",
      ],
    ],
  },
  // The spike's seam.
  {
    id: "seam-deliver-unfenced",
    kills: ["T9"],
    edits: [
      [
        "turn.ts",
        'if (!inc || inc.frozen) { note(tx, "fence", { dead: item.inc });',
        'if (false) { note(tx, "fence", { dead: item.inc });',
      ],
    ],
  },
  {
    id: "seam-no-retract",
    kills: ["rule:70"],
    edits: [["sessions.ts", "if (x.inFlight) cx.retract(x.inFlight.tag);", ""]],
  },
  {
    id: "seam-member-applied-at-once",
    kills: ["F3"],
    edits: [
      [
        "hooks.ts",
        "const a = tx.w.actors[actor]; const path = a && pathOfId(a.root, inc);",
        "const a = tx.w.actors[actor]; const path = a && pathOfId(a.root, inc); if (tx.inTurn) return;",
      ],
    ],
  },
  {
    id: "seam-actor-not-told-on-gone",
    kills: ["T9"],
    edits: [
      [
        "step.ts",
        "const now = tx.w.actors; const was = before.actors;",
        "const now = tx.w.actors; const was = {} as typeof now;",
      ],
    ],
  },
  {
    id: "seam-bookmark-not-on-denied",
    kills: ["T3:filled"],
    edits: [
      ["sessions.ts", 'if (it.kind === "value" && it.moves && spec.position) {', "if (false) {"],
    ],
  },
  {
    id: "seam-filled-stuck",
    kills: ["T3:filled"],
    edits: [
      ["sessions.ts", "if (b && b.filled !== filled) writeMark(cx, x, { ...b, filled });", ""],
    ],
  },
  {
    id: "seam-old-conn-unfenced",
    kills: ["D5"],
    edits: [
      [
        "sessions.ts",
        'const x = Object.values(s.sessions).find((y) => y.conn === p.conn); if (!x || x.st === "Releasing" || x.st === "Ended" || x.st === "Waiting") {',
        "const x = Object.values(s.sessions)[0]; if (!x) {",
      ],
    ],
  },
] as const;
export const MUTANTS = [...OLD.filter((x) => !REPLACED.includes(x.id)), ...ROUND5];
