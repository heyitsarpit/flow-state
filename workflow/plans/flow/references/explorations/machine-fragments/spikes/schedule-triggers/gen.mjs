// node gen.mjs <groups> <leavesPerGroup> <timers> <tag>  -> scaled/<tag>/{a,b,c}.ts
import { mkdirSync, writeFileSync } from "node:fs";
const [G, L, T, tag] = [+process.argv[2], +process.argv[3], +process.argv[4], process.argv[5]];
const dir = `scaled/${tag}`; mkdirSync(dir, { recursive: true });
const NE = 20;
const ev = (i) => `Ev${i}`;
const states = Array.from({ length: G }, (_, g) => `{ G${g}: [${Array.from({ length: L }, (_, l) => `"L${l}"`).join(", ")}] }`).join(", ");
const events = Array.from({ length: NE }, (_, i) => `${ev(i)}: {}`).join(", ");
const ievents = Array.from({ length: T }, (_, i) => `T${i}Done: {}`).join(", ");
const tnames = Array.from({ length: T }, (_, i) => `t${i}: {}`).join(", ");
const group = (t) => t % G;
function body(kind) {
  let out = "";
  for (let g = 0; g < G; g++) {
    const mine = Array.from({ length: T }, (_, t) => t).filter((t) => group(t) === g);
    const sched = mine.map((t) => kind === "c" ? `t${t}` : `t${t}: { schedule: "${t + 1} seconds", send: E.T${t}Done }`).join(", ");
    const pick = (k) => mine.length ? [mine[k % mine.length], mine[(k + 1) % mine.length]] : [];
    const arm = (k) => pick(k).map((t) => kind === "c" ? `t${t}` : `"t${t}"`).join(", ");
    const on = Array.from({ length: 4 }, (_, k) => `${ev(k)}: { target: "self", arm: [${arm(k)}], disarm: [${arm(k + 2)}] }`).join(", ");
    const leaves = Array.from({ length: L }, (_, l) => {
      const lon = Array.from({ length: 3 }, (_, k) => `${ev(4 + k + l)}: { target: S.G${g}.L${(l + 1) % L}, arm: [${arm(k + l)}] }`).join(", ");
      return `L${l}: { on: { ${lon} } }`;
    }).join(", ");
    out += `G${g}: { default: S.G${g}.L0, schedules: { ${sched} }, on: { ${on} }, states: { ${leaves} } },\n`;
  }
  return out;
}
const timersDecl = (kind) => kind === "c" ? Array.from({ length: T }, (_, t) => `const t${t} = timer("${t + 1} seconds", E0.T${t}Done);`).join("\n") : "";
for (const kind of ["a", "b", "c"]) {
  const head = `import { definition, tokens } from "../../src/core.ts";\nimport { machine${kind === "c" ? ", timer" : ""} } from "../../src/${kind}.ts";\n`;
  const def = `const D = definition({ id: "X", states: [${states}], events: { ${events} }, internalEvents: { ${ievents} }${kind === "b" ? `, schedules: { ${tnames} }` : ""} });\n`;
  const pre = kind === "c" ? `const E0 = tokens(D).E;\n${timersDecl("c")}\n` : "";
  writeFileSync(`${dir}/${kind}.ts`, `${head}${def}${pre}export const m = machine(D, ({ S, E }) => ({\n default: S.G0,\n states: {\n${body(kind)}} }));\nexport const v = m.snapshot.schedules.t0;\n`);
  writeFileSync(`tsconfig.scaled-${tag}-${kind}.json`, JSON.stringify({ extends: "./tsconfig.json", include: [`scaled/${tag}/${kind}.ts`, "src/core.ts", `src/${kind}.ts`] }));
}
