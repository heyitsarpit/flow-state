// Round 13: `flow story list | describe <id> | run <id>` (machine-design 2.10.14) and `flow trace <id> [--at <checkpoint>]` (round 7's paper design,
// `round-7/cli-outputs.md`: `flow trace` keeps the timeline; `explain --trace --at` is the point). Stories come from `../story/index.ts`, as
// `defineConfig({ stories })` would list them.
//  - `list` and `describe` read the plan alone: no run, no fake handler, no control, no Slot. The count is a fact: every handler and control of every fake
//    the plan names is wrapped to count before the command reads anything.
//  - `run` reports what ran, never pass or fail (W40); exit 2 when `run()` rejects, with the error on stderr.
//  - `trace` runs the Story once and prints its timeline from the runtime's evidence and the executor's step log.
import { Schema } from "effect";
import type { AnyServer } from "../story/fake.ts";
import { stories, storyById } from "../story/index.ts";
import type { Record_, Step, Story, StoryRun } from "../story/story.ts";

const out = (json: boolean, doc: unknown, text: () => string) => console.log(json ? JSON.stringify(doc) : text());
const fail = (reason: string, operand: string): number => {
  process.stderr.write(`${JSON.stringify({ error: "InvalidOperand", reason, operand })}\n`);
  return 2;
};
const schemaDoc = (s: unknown) => {
  try {
    return Schema.toJsonSchemaDocument(s as Schema.Top).schema;
  } catch {
    return { tag: (s as Schema.Top).ast?._tag ?? "?" };
  }
};
const fields = (f: Readonly<Record<string, unknown>>) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, schemaDoc(v)]));
// Every closure a fake carries, counted: `describe` must leave the count at 0.
const counted = { n: 0 };
const guard = (servers: readonly AnyServer[]) => {
  for (const f of servers) {
    for (const c of Object.values(f.def.endpoints)) {
      const h = c.handle;
      (c as { handle: unknown }).handle = (...a: unknown[]) => (counted.n++, (h as (...x: unknown[]) => unknown)(...a));
    }
    for (const c of Object.values(f.def.controls ?? {})) {
      const h = c.apply;
      (c as { apply: unknown }).apply = (...a: unknown[]) => (counted.n++, (h as (...x: unknown[]) => unknown)(...a));
    }
  }
};
const stepText = (s: Step): string => {
  if ("send" in s) return `send ${s.send[0].tag}${Object.keys(s.send[0].payload).length ? ` ${JSON.stringify(s.send[0].payload)}` : ""}`;
  if ("world" in s) return `world ${s.world.map((w) => ("wire" in w ? `${w.wire.server}.${w.wire.endpoint}.${w.wire.word}(${w.wire.word === "drop" ? JSON.stringify({ at: w.wire.at, times: w.wire.times }) : ""})` : `${w.control.server}.${w.control.name}(${JSON.stringify(w.control.params)})`)).join(", ")}`;
  if ("advance" in s) return `advance ${typeof s.advance === "number" ? `${s.advance} ms` : JSON.stringify(s.advance)}`;
  if ("checkpoint" in s) return `checkpoint ${s.checkpoint[0]}`;
  if ("enter" in s) return `enter${s.enter.length ? ` ${JSON.stringify(s.enter[0])}` : ""}`;
  if ("guards" in s) return `guards ${JSON.stringify(s.guards)}`;
  if ("reload" in s) return `reload ${s.reload}`;
  return "leave";
};
const checkpoints = (s: Story<string>) => s.steps.flatMap((x) => ("checkpoint" in x ? [x.checkpoint[0]] : []));
const subjectOf = (s: Story<string>) => (s.subject.kind === "machine" ? s.subject.compiled.id : s.subject.fragment.compiled.id);

export const describe = (s: Story<string>) => ({
  id: s.id,
  kind: s.kind,
  subject: subjectOf(s),
  options: { id: s.id, ...(s.options.input === undefined ? {} : { input: s.options.input }), world: s.options.world ?? [] },
  steps: s.steps.map((x, i) => ({ index: i, step: x })),
  checkpoints: checkpoints(s),
  fakes: s.fakes.map((f) => ({
    server: f.name,
    truth: fields(f.def.truth),
    endpoints: Object.entries(f.def.endpoints).map(([k, c]) => ({ endpoint: k, route: c.route ?? k, request: fields(c.request) })),
    controls: Object.entries(f.def.controls ?? {}).map(([k, c]) => ({ control: k, params: fields(c.params) })),
  })),
});

const timeline = (r: StoryRun<string>, s: Story<string>, upTo?: number) => {
  const lines: string[] = [];
  const recs = r.evidence;
  const word = (e: Record_): string | undefined => {
    switch (e.kind) {
      case "turn": {
        const parts = (e["parts"] as Array<{ at: string; definition: string; path: readonly string[] }>) ?? [];
        const mv = e["moved"] as { path: readonly string[]; from?: string; to?: string } | undefined;
        const inner = mv && mv.path.length ? `  ([${mv.path.join("/")}] ${mv.from} -> ${mv.to})` : "";
        return `turn     ${e["event"]}  ${e["from"]} -> ${e["to"]}${inner}  ${parts.map((p) => `${p.path.length ? `[${p.path.join("/")}] ` : ""}${p.at}`).join(" + ")}`;
      }
      case "Denied":
        return `denied   ${e["event"]}  ${(e["reasons"] as string[]).join(", ")}`;
      case "Unhandled":
        return `unhandled ${e["event"]}`;
      case "ending":
        return `ending   ${e["op"]}  ${e["channel"]} ${e["reason"]}${e["attempt"] ? `  ${e["attempt"]}` : ""}`;
      case "mint":
        return `mint     ${e["op"]}  ${e["attempt"]}`;
      case "lane":
        return `lane     ${e["op"]}  ${e["cell"]}`;
      case "BesideOldVersion":
      case "OldVersionLane":
      case "LaneRekeyed":
      case "Superseded":
      case "Released":
        return `${e.kind.padEnd(8)} ${e["op"]}`;
      default:
        return undefined;
    }
  };
  let from = 0;
  let wasPhase = new Map<string, string>();
  for (const c of r.cuts) {
    if (upTo !== undefined && c.index > upTo) break;
    const names = s.steps.flatMap((x, i) => ("checkpoint" in x && i > c.step && (s.steps.slice(c.step + 1, i).every((y) => "checkpoint" in y)) ? [x.checkpoint[0]] : []));
    lines.push(`[${c.step < 0 ? "start" : c.step}] ${"start" in c.command ? "start" : stepText(c.command as Step)}   t=${c.now}${c.state ? `  ${c.state}` : "  (absent)"}`);
    for (let i = from; i < c.evidence; i++) {
      const w = word(recs[i]!);
      if (w) lines.push(`      ${String(i).padStart(4)}  ${w}`);
    }
    // The wire as it stood at this cut: each request that arrived or changed phase in this step.
    const now = new Map<string, string>();
    for (const [ep, qs] of Object.entries(c.requests)) for (const q of qs) now.set(`${ep}#${q.seq}`, q.phase);
    for (const [k, ph] of now)
      if (wasPhase.get(k) !== ph) {
        const [ep, seq] = k.split("#") as [string, string];
        const q = c.requests[ep]!.find((x) => String(x.seq) === seq)!;
        lines.push(`      wire  ${ep}  ${wasPhase.has(k) ? `${wasPhase.get(k)} -> ` : ""}${ph}${q.via.attempts[0] ? `  ${q.via.attempts[0]}` : ""}`);
      }
    wasPhase = now;
    for (const n of names) lines.push(`      checkpoint ${n}  seq ${c.evidence}`);
    from = c.evidence;
  }
  return lines;
};

export const storyCommand = async (cmd: string, rest: readonly string[], json: boolean): Promise<number> => {
  if (cmd === "story" && rest[0] === "list") {
    const rows = stories.map((s) => ({ id: s.id, kind: s.kind, subject: subjectOf(s), steps: s.steps.length, checkpoints: checkpoints(s) }));
    out(json, { command: "story list", stories: rows, callbacksRun: 0 }, () => [...rows.map((x) => `${x.id.padEnd(30)} ${x.kind.padEnd(9)} ${x.subject.padEnd(16)} ${x.steps} steps  ${x.checkpoints.join(", ")}`), "callbacks run: 0"].join("\n"));
    return 0;
  }
  const id = cmd === "story" ? rest[1] : rest[0];
  const s = id ? storyById(id) : undefined;
  if (!s) return fail("UnknownStory", id ?? "");
  if (cmd === "story" && rest[0] === "describe") {
    guard(s.fakes);
    const d = describe(s);
    out(json, { command: "story describe", ...d, callbacksRun: counted.n }, () =>
      [
        `${d.id}  ${d.kind} ${d.subject}`,
        `options  ${JSON.stringify(d.options)}`,
        ...d.steps.map((x) => `  [${x.index}] ${stepText(x.step)}`),
        `checkpoints  ${d.checkpoints.join(", ")}`,
        ...d.fakes.flatMap((f) => [
          `fake ${f.server}  truth ${JSON.stringify(f.truth)}`,
          ...f.endpoints.map((e) => `  endpoint ${e.endpoint} (route ${e.route})  request ${JSON.stringify(e.request)}`),
          ...f.controls.map((c) => `  control ${c.control}  ${JSON.stringify(c.params)}`),
        ]),
        `callbacks run: ${counted.n}`,
      ].join("\n"),
    );
    return 0;
  }
  let run: StoryRun<string>;
  try {
    run = s.run();
  } catch (e) {
    process.stderr.write(`${JSON.stringify({ error: "StoryExecution", story: s.id, cause: String((e as Error).message ?? e) })}\n`);
    return 2;
  }
  const cps = Object.entries(run.checkpoints as Record<string, { cut: { state?: string; evidence: number; index: number } }>);
  if (cmd === "story" && rest[0] === "run") {
    const endings = run.evidence.filter((e) => e.kind === "ending").map((e) => `${e["op"]} ${e["channel"]} ${e["reason"]}`);
    const per: Record<string, Record<string, number>> = {};
    for (const q of run.requests) ((per[q.endpoint] ??= {})[q.phase] = (per[q.endpoint]![q.phase] ?? 0) + 1);
    const doc = { command: "story run", id: s.id, steps: s.steps.length, checkpoints: cps.map(([k, c]) => ({ name: k, state: c.cut.state ?? null, seq: c.cut.evidence })), endings, requests: per, issues: run.issues.map((i) => i.code) };
    out(json, doc, () => [`${s.id}: ran ${s.steps.length} steps`, ...doc.checkpoints.map((c) => `  checkpoint ${c.name}  ${c.state ?? "(absent)"}  seq ${c.seq}`), ...endings.map((e) => `  ending ${e}`), ...Object.entries(per).map(([k, v]) => `  requests ${k}  ${JSON.stringify(v)}`), `  issues ${doc.issues.length ? doc.issues.join(", ") : "none"}`].join("\n"));
    return 0;
  }
  if (cmd === "trace") {
    const at = process.argv.indexOf("--at") >= 0 ? process.argv[process.argv.indexOf("--at") + 1] : undefined;
    const cp = at === undefined ? undefined : cps.find(([k]) => k === at);
    if (at !== undefined && !cp) return fail("UnknownCheckpoint", at);
    const lines = timeline(run, s, cp?.[1].cut.index);
    out(json, { command: "trace", id: s.id, ...(at ? { at } : {}), lines }, () => [`flow trace ${s.id}${at ? ` --at ${at}` : ""}`, ...lines].join("\n"));
    return 0;
  }
  return fail("UnknownCommand", `${cmd} ${rest.join(" ")}`);
};
