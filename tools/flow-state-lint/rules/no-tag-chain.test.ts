// Planted violations for no-tag-chain and no-id-text, run through oxlint with the options vite.config.ts gives them.
// Run: node --experimental-strip-types tools/flow-state-lint/rules/no-tag-chain.test.ts
import { plantRules } from "./test-support.ts";

const tests = [
  "src/core/planted.test.ts",
  "src/core/test/planted.ts",
  "src/host/planted.test.ts",
  "tests/planted.ts",
  "fixtures/planted.ts",
  "bench/planted.ts",
];

plantRules({
  "no-tag-chain": {
    fires: [
      // An `$is` chain, negated or not, on one subject.
      'const a = Phase.$is("OnWire")(p) || Phase.$is("Cancelling")(p);',
      'const b = !Delivery.$is("Queued")(d) && !Delivery.$is("Retrying")(d);',
      'const c = n > 0 || Phase.$is("Held")(h.phase) || (Phase.$is("Resending")(h.phase));',
      // An else-if ladder over one subject's tag.
      'if (Delivery.$is("Waiting")(row.delivery)) Other.gen(); else if (Delivery.$is("Kept")(row.delivery)) Other.gen();',
      // `_tag` compares, chained or in a ternary ladder.
      'const d = e._tag === "Turn" || e._tag === "Delivered";',
      'const f = x._tag === "A" ? 1 : x._tag === "B" ? 2 : 3;',
      "const f2 = x._tag === `A` || x._tag === `B`;",
      'if (m._tag === "Answer") Other.gen(); else if (Move.$is("EndUnsent")(m)) Other.gen(); else Other.gen();',
      // A membership test over one subject's tags.
      'const l2 = ["OnWire", "Cancelling"].includes(p._tag);',
      'const l3 = [`Queued`, `Retrying`].includes(row.delivery._tag);',
      // Consecutive early returns on one subject's tag.
      'const l4 = () => { if (Phase.$is("Held")(p)) return 1; if (Phase.$is("OnWire")(p)) return 2; return 3; };',
      'const l5 = () => { if (d._tag === "Queued") return 1; if (d._tag === "Kept") return 2; return 3; };',
    ],
    quiet: [
      'const g = Phase.$is("Held")(p);',
      'const h = Phase.$is("Held")(p) || Phase.$is("Held")(q);',
      'const i = Life.$is("Open")(life) && Option.isSome(found);',
      'if (Phase.$is("Held")(p)) Other.gen(); else Other.gen();',
      'const j = e._tag === "Turn" ? 1 : 2;',
      "const k = Phase.$match(p, {});",
      'const l = a.kind === "x" || a.kind === "y";',
      'const l6 = ["x", "y"].includes(a.kind);',
      'const l7 = () => { if (Phase.$is("Held")(p)) return 1; if (Phase.$is("Held")(q)) return 2; return 3; };',
      'const l8 = () => { if (Phase.$is("Held")(p)) return 1; Other.gen(); if (Phase.$is("OnWire")(p)) return 2; return 3; };',
    ],
    silent: tests,
  },
  "no-id-text": {
    fires: [
      'const m = incarnation.id.slice(incarnation.id.lastIndexOf("-") + 1);',
      'const n = key.startsWith("actor/");',
      'const o = record.slice(5);',
      'const p = laneId.split("|")[0];',
      "const q = Number(id);",
      "const r = id === `${own}${text}`;",
      'const s = row.key.endsWith("|");',
      "const s2 = Number.parseInt(incarnationId);",
      "const s3 = +id;",
      'const s4 = laneKey.replace("lane/", "");',
      // A binding renamed from an id, then cut.
      "const { id: who } = incarnation; const z1 = who.slice(1);",
      'const handle = actor.key; const z2 = handle.split("/");',
      // A pattern tested or run against an id.
      "const z3 = /^actor\\//u.test(key);",
      "const z4 = /-(\\d+)$/u.exec(incarnationId);",
      // A character code read out of an id.
      "const z5 = id.charCodeAt(0);",
    ],
    quiet: [
      'const t = name.startsWith("~");',
      'const u = path.split(".");',
      "const v = id === other.id;",
      "const w = Number(count);",
      "const x = `${id}-${n}`;",
      'const y = key === "actor/";',
      "const z = ids.slice(1);",
      "const who2 = actor.name; const z6 = who2.slice(1);",
      "const z7 = /^~/u.test(name);",
    ],
    silent: [
      "src/host/planted.ts",
      "src/host/platform/planted.ts",
      ...tests,
    ],
  },
});

console.log("flow-state no-tag-chain and no-id-text tests passed");
