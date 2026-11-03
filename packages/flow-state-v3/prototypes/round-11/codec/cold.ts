// Round 11: a cold load, as an app's first boot is: a fresh process, nothing JIT-warm, `effect` already imported (every option needs it).
// bun round-11/codec/cold.ts <hand|in-process|data|module> [dir]   Prints one line: mode, ms. `measure-cold.ts` runs each several times.
import "effect";
const mode = process.argv[2]!;
const dir = process.argv[3] ?? "";
const t0 = performance.now();
const api = new Proxy({}, { get: () => () => undefined }) as never;
const { seal } = await import("../gate.ts");
const t1 = performance.now(); // the runtime's own module, the same for every option
let c: unknown;
if (mode === "hand") c = (await import("../../conformance/fixtures/pay.compiled.ts")).payFixture.make(api);
else {
  const m = await import("../../conformance/typed/pay.ts");
  const { provide } = await import("../../conformance/typed/flow.ts");
  const pay = provide(m.payCompiled, m.shopFrom(api));
  if (mode === "in-process") c = pay;
  else {
    const { toData, load } = await import("./codec.ts");
    const { table } = toData(pay); // the code table: from the evaluated definition, which is the in-process compile already
    if (mode === "data") c = load(JSON.parse(await Bun.file(`${dir}/pay.json`).text()), table);
    else {
      (globalThis as Record<string, unknown>)["__codecTable"] = table;
      c = (await import(`${dir}/pay.gen.ts`)).default;
    }
  }
}
seal(c as never);
const t2 = performance.now();
console.log(`${mode} ${(t2 - t1).toFixed(2)} ${(t1 - t0).toFixed(2)}`);
