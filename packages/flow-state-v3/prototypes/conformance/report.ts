// Parses SCENARIOS.md, convergence-1.md and machine-design.md 2.4, and prints the runner's two reports.
import { readFileSync } from "node:fs"
import { join } from "node:path"

const proto = join(import.meta.dir, "..")
const design = join(proto, "../../../workflow/plans/flow/references/explorations/machine-fragments/machine-design.md")

export type Row = { id: string; R: number; kind: string; src: string; cites: string[]; thin: boolean }

export const catalog = (): Row[] => {
  const rows: Row[] = []
  for (const line of readFileSync(join(proto, "SCENARIOS.md"), "utf8").split("\n")) {
    if (!line.startsWith("| ") || line.startsWith("| id") || line.startsWith("| ---")) continue
    const c = line.split("|").map((x) => x.trim())
    const R = Number(c[2])
    if (!c[1] || !Number.isInteger(R) || R === 0) continue
    rows.push({ id: c[1], R, kind: c[3]!, src: c[4]!, cites: c[5]!.split(",").map((x) => x.trim()), thin: c[6] === "*" })
  }
  return rows
}

export const changed = (): Map<string, string[]> => {
  const text = readFileSync(join(proto, "convergence-1.md"), "utf8")
  const block = /```decisions-changed\n([\s\S]*?)```/.exec(text)![1]!
  const m = new Map<string, string[]>()
  for (const l of block.trim().split("\n")) {
    const [id, , repl] = l.trim().split(/\s+/)
    m.set(id!, (repl ?? "").split(","))
  }
  return m
}

// Reachable cells of the 2.7.13 holding table, parsed: a cell whose text says "cannot occur" is not owed.
export const laneCells = (): string[] => {
  const lines = readFileSync(design, "utf8").split("\n")
  const start = lines.findIndex((l) => l.startsWith("| Row | `Idle` | `InFlight` | `Held` |"))
  const names: Record<string, string> = {
    commit: "commit", retry: "retry", cancel: "cancel", idle: "idle", retryable: "retryable", invoked: "invoked",
    "storage refused": "storageRefused", success: "success", failure: "failure", unknown: "unknown", interrupt: "interrupt",
    dispose: "dispose", rebind: "rebind", restore: "restore", "Runtime disposal": "runtimeDisposal", "SSR hydration": "ssrHydration",
  }
  const out: string[] = []
  for (const l of lines.slice(start + 2)) {
    if (!l.startsWith("|")) break
    // A cell can hold an escaped pipe in code; the table has none in round 1's rows.
    const c = l.split(" | ").map((x) => x.replace(/^\| /, "").trim())
    const m = /\*\*`?([^*`(]+?)`?(?:\([^)]*\))?\*\*/.exec(c[0]!)
    const row = m && names[m[1]!.trim()]
    if (!row) continue
    ;(["Idle", "InFlight", "Held"] as const).forEach((s, i) => {
      if (!c[i + 1]?.startsWith("cannot occur")) out.push(`cell:lane.${row}.${s}`)
    })
  }
  return out
}

const allIds = (): string[] => {
  const lines = readFileSync(design, "utf8").split("\n")
  const a = lines.findIndex((l) => l.startsWith("### 2.4 The rules"))
  const b = lines.findIndex((l) => l.startsWith("### 2.5 The turn"))
  const rules = new Set<string>()
  for (const l of lines.slice(a, b)) {
    const m = /^(\d+)\. \*\*/.exec(l)
    if (m) rules.add(`rule:${m[1]}`)
    const n = /^\s*\*?\*?(N[123])\b/.exec(l)
    if (n) rules.add(n[1]!)
  }
  const ds = Array.from({ length: 24 }, (_, i) => `D${i + 1}`)
  const ts = Array.from({ length: 9 }, (_, i) => `T${i + 1}`)
  return [...rules, ...laneCells(), ...ts, ...ds]
}

// Section 11's "In" list. Anything else uncited is out of this round's scope, not owed.
const ROUND1_ROWS = ["commit", "retry", "cancel", "idle", "retryable", "invoked", "storageRefused", "success", "failure", "unknown", "interrupt", "restore", "runtimeDisposal"]
const ROUND1_DS = ["D1", "D2", "D4", "D5", "D6", "D7", "D8", "D10", "D13", "D14", "D23"]
const inRound1 = (id: string) => {
  const m = /^cell:lane\.(\w+)\./.exec(id)
  return m ? ROUND1_ROWS.includes(m[1]!) : ROUND1_DS.includes(id)
}

const cited = (id: string, c: readonly string[]) =>
  c.includes(id) || (/^T\d$/.test(id) && c.some((x) => x.startsWith(`${id}:`)))

export const printReports = (round: number, ran: ReadonlyArray<{ id: string; cites: readonly string[] }>, cellsHit: ReadonlySet<string>) => {
  const rows = catalog()
  const here = rows.filter((r) => r.R <= round)
  const citedIds = here.flatMap((r) => r.cites)
  const untested = allIds().filter((id) => !cited(id, citedIds))
  const owed = untested.filter(inRound1)
  console.log(`\nUNTESTED     ${untested.length} ids with no scenario in rounds <= ${round}`)
  console.log(`  owed by this round (${owed.length}): ${owed.join(" ")}`)
  console.log(`  not in this round's scope (${untested.length - owed.length}): ${untested.filter((x) => !inRound1(x)).join(" ")}`)
  const hitNotCited = [...cellsHit].filter((c) => !citedIds.includes(`cell:${c}`))
  console.log(`  cells hit by a run though no scenario cites them (${hitNotCited.length}): ${hitNotCited.sort().join(" ")}`)
  const ch = changed()
  console.log("\nOLD-RULE")
  for (const r of ran) {
    for (const id of r.cites) {
      const repl = ch.get(id)
      if (!repl) continue
      const ok = repl.some((x) => r.cites.includes(x))
      console.log(`  ${r.id} cites ${id}: changed to ${repl.join(",")}, ${ok ? "also cites it: ok" : "no replacement cited: FLAG"}`)
    }
  }
  console.log(`\nNO-DECISION  ${rows.filter((r) => r.cites.includes("no-decision")).map((r) => r.id).join(" ")}`)
  console.log(`THIN         ${here.filter((r) => r.thin).map((r) => r.id).join(" ")}`)
}
