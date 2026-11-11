// Round 11: runs `cold.ts` 9 times per option, each a fresh process, and prints the median. bun round-11/codec/measure-cold.ts
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compilePay, shopFrom } from "../../conformance/typed/pay.ts";
import { provide } from "../../conformance/typed/flow.ts";
import { emitModule, toData } from "./codec.ts";

const dir = join(import.meta.dir, ".cold");
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const { data } = toData(provide(compilePay(), shopFrom(new Proxy({}, { get: () => () => undefined }) as never)));
writeFileSync(join(dir, "pay.json"), JSON.stringify(data));
writeFileSync(join(dir, "table.ts"), `export const table = globalThis.__codecTable;\n`);
writeFileSync(join(dir, "pay.gen.ts"), emitModule(data, { from: "./table.ts", name: "table" }));
const lines: string[] = [];
for (const mode of ["hand", "in-process", "data", "module"]) {
  const xs: number[] = [];
  for (let i = 0; i < 9; i++) {
    const p = Bun.spawnSync(["bun", join(import.meta.dir, "cold.ts"), mode, dir], { stdin: "ignore" });
    xs.push(Number(p.stdout.toString().trim().split(" ")[1]));
  }
  xs.sort((a, b) => a - b);
  const l = `cold ${mode.padEnd(11)} median ${xs[4]!.toFixed(2)} ms (min ${xs[0]!.toFixed(2)}, max ${xs[8]!.toFixed(2)}): import + build + seal of Pay, after the runtime's own modules`;
  console.log(l);
  lines.push(l);
}
rmSync(dir, { recursive: true, force: true });
await Bun.write(join(import.meta.dir, "measure-cold.txt"), lines.join("\n") + "\n");
