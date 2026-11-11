// Rough cost of the two ways to hand a record to IndexedDB: a JSON string, or the object for structured clone.
// Not IndexedDB itself: Bun's structuredClone stands in for the browser's serializer, so this shows the shape of the cost only.
const msg = (i: number) => ({ id: `m${i}`, author: `u${i % 50}`, text: "hello there ".repeat(8), at: 1_700_000_000_000 + i, likes: i % 7, tags: ["a", "b"] })
const record = (n: number) => ({ memory: { thread: "t1", draft: "typing…", messages: Array.from({ length: n }, (_, i) => msg(i)) }, state: "OPEN" })

const time = (label: string, f: () => unknown, runs = 50) => {
  for (let i = 0; i < 5; i++) f()
  const t0 = performance.now()
  for (let i = 0; i < runs; i++) f()
  const ms = (performance.now() - t0) / runs
  console.log(`${label.padEnd(44)} ${ms.toFixed(3)} ms`)
  return ms
}

for (const n of [100, 1_000, 10_000]) {
  const r = record(n)
  const s = JSON.stringify(r)
  console.log(`-- ${n} messages, ${(s.length / 1024).toFixed(0)} KB as JSON`)
  time("JSON.stringify (write side, string to store)", () => JSON.stringify(r))
  time("JSON.parse (read side)", () => JSON.parse(s))
  time("structuredClone (write side, object to store)", () => structuredClone(r))
  time("structuredClone of the JSON string", () => structuredClone(s))
}
