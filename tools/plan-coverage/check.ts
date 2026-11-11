// Plan-to-Task coverage gate: every outcome of every Plan (except Pending) must be satisfied by a Task or deferred.
// Deferred means the outcome id appears in revisit.md, or in a Task description line that starts with "Deferred:".
// Outcomes whose title ends in "(removed)" are cut from the Plan and need no Task.
// Run from the project root: bun tools/plan-coverage/check.ts
import { readFileSync, readdirSync } from "node:fs"
import { spawnSync } from "node:child_process"

const run = (...args: ReadonlyArray<string>): any => {
  const out = spawnSync("workflow", [...args, "--json"], {
    encoding: "utf8",
    maxBuffer: 1 << 28,
    stdio: ["ignore", "pipe", "inherit"]
  })
  if (out.status !== 0) throw new Error(`workflow ${args.join(" ")} failed`)
  return JSON.parse(out.stdout)
}

const plansDir = "workflow/plans/flow"
const plans = readdirSync(plansDir)
  .filter((f) => f.endsWith(".plan"))
  .map((f) => f.slice(0, -".plan".length))
  .filter((id) => id !== "Pending")

const tasks: ReadonlyArray<{ description?: string; satisfies: ReadonlyArray<string> }> = run("list", "task").tasks
const normalize = (ref: string): string => ref.replace(/^@/, "").replace(/^plan\./, "")

const satisfied = new Set(tasks.flatMap((t) => t.satisfies.map(normalize)))
const revisit = readFileSync(`${plansDir}/references/proposals/revisit.md`, "utf8")
const deferredLines = tasks.flatMap((t) => (t.description ?? "").split("\n").filter((l) => /^\s*Deferred:/.test(l)))
const deferredText = [revisit, ...deferredLines].join("\n")

const isRemoved = (title: string): boolean => /\(removed\)\s*$/.test(title)
const uncovered: Array<string> = []
let total = 0
for (const plan of plans) {
  for (const outcome of run("show", `@plan.${plan}`).plan.outcomes as ReadonlyArray<{ id: string; title: string }>) {
    if (isRemoved(outcome.title)) continue
    const id = `${plan}.${outcome.id}`
    total += 1
    const deferred = new RegExp(`(?<![\\w.])${id.replace(".", "\\.")}(?!\\w)`).test(deferredText)
    if (!satisfied.has(id) && !deferred) uncovered.push(id)
  }
}

if (uncovered.length > 0) {
  console.error(`${uncovered.length} of ${total} Plan outcomes have no Task that satisfies them and no deferral:`)
  for (const id of uncovered) console.error(`  @plan.${id}`)
  process.exit(1)
}
console.log(`plan-coverage: all ${total} Plan outcomes are satisfied or deferred`)
