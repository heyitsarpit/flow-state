#!/usr/bin/env bun
/**
 * Per-agent process metrics for Claude Code subagent transcripts (JSONL).
 *
 * Usage:
 *   bun tools/process/agent-metrics.ts [--json] <file.jsonl>...
 *   bun tools/process/agent-metrics.ts [--json] --dir <subagents-dir> [--since HH:MM]
 *       [--from HH:MM] [--to HH:MM]
 *
 * One row per transcript, sorted by start time. Durations are minutes. `--since HH:MM` keeps agents
 * whose start, in local time of day, is at or after HH:MM. `--from` and `--to` (local time, `to`
 * exclusive) restrict every column to the transcript lines inside that window, so a session can be
 * split before and after a change.
 */
import { createReadStream } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { createInterface } from "node:readline";
import { REPO_ROOT, findViolation } from "./block-shell-writes.ts";

const MINUTE_MS = 60_000;
const IDLE_GAP_MS = 2 * MINUTE_MS;
const VERIFY_COMMAND = /check|test|vitest|conformance|falsify|gates|soak/i;

export interface AgentRow {
  agent: string;
  model: string;
  effort: string;
  start: string;
  end: string;
  wall_min: number;
  turns: number;
  calls: number;
  calls_per_turn: number;
  model_min: number;
  think_min: number;
  verify_min: number;
  sidecar_min: number;
  idle_min: number;
  pre_edit_chars: number;
  slips: number;
  compactions: number;
}

interface Block {
  type?: string;
  id?: string;
  name?: string;
  input?: { command?: unknown };
  tool_use_id?: string;
  content?: unknown;
  text?: unknown;
}

interface Line {
  type?: string;
  subtype?: string;
  uuid?: string;
  timestamp?: string;
  isCompactSummary?: boolean;
  thinkingDurationMs?: number;
  message?: { id?: string; model?: string; content?: unknown };
}

interface Meta {
  model?: string;
  effort?: string;
}

type Span = [from: number, to: number];

interface PendingCall {
  name: string;
  ts: number;
  command?: string;
}

/** Local time-of-day bounds in minutes: a line counts when its minute is in [from, to). */
export interface Window {
  from?: number;
  to?: number;
}

/** Streams one subagent transcript into its metrics row; lines outside the window are skipped. */
export async function analyzeFile(file: string, window: Window = {}): Promise<AgentRow> {
  const meta = await readMeta(file);
  const pending = new Map<string, PendingCall>();
  const turnIds = new Set<string>();
  const totals = {
    calls: 0,
    thinkMs: 0,
    modelMs: 0,
    idleMs: 0,
    preEditChars: 0,
    slips: 0,
    compactions: 0,
  };
  let first: number | undefined;
  let last: number | undefined;
  let turnId: string | undefined;
  let lastAssistantTs = 0;
  let userTs: number | undefined; // latest user or tool_result line not yet followed by a model turn
  let turnEnded = false; // the previous user or assistant line was an assistant line with no tool_use
  const verifySpans: Span[] = [];
  const sidecarSpans: Span[] = [];
  let sawEditOrWrite = false;
  let assistantModel: string | undefined;

  const lines = createInterface({ input: createReadStream(file, "utf8"), crlfDelay: Infinity });
  for await (const raw of lines) {
    const line = parseLine(raw);
    if (line === undefined) continue;
    const ts = Date.parse(line.timestamp ?? "");
    if (Number.isNaN(ts) || !inWindow(ts, window)) continue;
    if (line.type === "system") {
      if (line.subtype === "compact_boundary") totals.compactions += 1;
      continue;
    }
    if (line.type !== "user" && line.type !== "assistant") continue;
    first ??= ts;
    last = ts;

    if (line.type === "user") {
      // The compaction summary is written by the model; its lead-in stays with the line before it.
      if (line.isCompactSummary === true) continue;
      const blocks = contentBlocks(line);
      // A message that is not a tool result, arriving after a finished turn, ends a wait.
      if (turnEnded && !blocks.some((block) => block.type === "tool_result"))
        totals.idleMs += ts - lastAssistantTs;
      turnEnded = false;
      userTs = ts;
      for (const block of blocks) {
        if (block.type !== "tool_result") continue;
        if (!sawEditOrWrite) totals.preEditChars += textChars(block.content);
        const call = block.tool_use_id === undefined ? undefined : pending.get(block.tool_use_id);
        if (call === undefined || block.tool_use_id === undefined) continue;
        pending.delete(block.tool_use_id);
        const span: Span = [call.ts, ts];
        if (call.name === "Agent") sidecarSpans.push(span);
        if (call.command !== undefined && VERIFY_COMMAND.test(call.command)) verifySpans.push(span);
      }
      continue;
    }

    // Assistant line: one JSON line per content block; lines of one model turn share message.id.
    const id = line.message?.id ?? line.uuid ?? "";
    if (id !== turnId) {
      turnId = id;
      // A synthetic line (a usage-limit notice) ends a turn but is not a model turn.
      if (line.message?.model !== "<synthetic>") turnIds.add(id);
      if (userTs !== undefined) {
        const leadMs = ts - userTs;
        if (leadMs > IDLE_GAP_MS) totals.idleMs += leadMs;
        else totals.modelMs += leadMs;
      }
      userTs = undefined;
    } else {
      totals.modelMs += ts - lastAssistantTs;
    }
    lastAssistantTs = ts;
    assistantModel ??= line.message?.model;
    if (typeof line.thinkingDurationMs === "number") totals.thinkMs += line.thinkingDurationMs;

    turnEnded = !contentBlocks(line).some((block) => block.type === "tool_use");
    for (const block of contentBlocks(line)) {
      if (block.type !== "tool_use" || block.id === undefined || block.name === undefined) continue;
      totals.calls += 1;
      const command =
        block.name === "Bash" && typeof block.input?.command === "string"
          ? block.input.command
          : undefined;
      pending.set(block.id, { name: block.name, ts, command });
      if (block.name === "Edit" || block.name === "Write") sawEditOrWrite = true;
      if (command !== undefined && writesFile(command)) totals.slips += 1;
    }
  }

  const turns = turnIds.size;
  return {
    agent: basename(file)
      .replace(/^agent-/, "")
      .replace(/\.jsonl$/, ""),
    model: meta.model ?? assistantModel ?? "-",
    effort: meta.effort ?? "-",
    start: first === undefined ? "" : new Date(first).toISOString(),
    end: last === undefined ? "" : new Date(last).toISOString(),
    wall_min: minutes(first === undefined || last === undefined ? 0 : last - first),
    turns,
    calls: totals.calls,
    calls_per_turn: turns === 0 ? 0 : round2(totals.calls / turns),
    model_min: minutes(totals.modelMs),
    think_min: minutes(totals.thinkMs),
    verify_min: minutes(unionMs(verifySpans)),
    sidecar_min: minutes(unionMs(sidecarSpans)),
    idle_min: minutes(totals.idleMs),
    pre_edit_chars: totals.preEditChars,
    slips: totals.slips,
    compactions: totals.compactions,
  };
}

/**
 * True when a Bash command is a slip: a shell write to a project file, the same definition the
 * write hook enforces (`findViolation` in block-shell-writes.ts). Relative targets resolve from the
 * repo root, moved by any `cd` earlier in the same command.
 */
export function writesFile(command: string): boolean {
  return findViolation(command, REPO_ROOT) !== null;
}

/** Formats rows as an aligned text table, numbers right-aligned. */
export function formatTable(rows: AgentRow[]): string {
  const grid = [COLUMNS.map((c) => c.head), ...rows.map((r) => COLUMNS.map((c) => c.cell(r)))];
  const widths = COLUMNS.map((_, i) => Math.max(...grid.map((row) => row[i].length)));
  return grid
    .map((row) =>
      row
        .map((cell, i) => (COLUMNS[i].numeric ? cell.padStart(widths[i]) : cell.padEnd(widths[i])))
        .join("  ")
        .trimEnd(),
    )
    .join("\n");
}

const COLUMNS: { head: string; numeric: boolean; cell: (r: AgentRow) => string }[] = [
  { head: "agent", numeric: false, cell: (r) => r.agent },
  { head: "model", numeric: false, cell: (r) => r.model },
  { head: "effort", numeric: false, cell: (r) => r.effort },
  { head: "start", numeric: false, cell: (r) => clock(r.start) },
  { head: "end", numeric: false, cell: (r) => clock(r.end) },
  { head: "wall_min", numeric: true, cell: (r) => r.wall_min.toFixed(2) },
  { head: "turns", numeric: true, cell: (r) => String(r.turns) },
  { head: "calls", numeric: true, cell: (r) => String(r.calls) },
  { head: "calls/turn", numeric: true, cell: (r) => r.calls_per_turn.toFixed(2) },
  { head: "model_min", numeric: true, cell: (r) => r.model_min.toFixed(2) },
  { head: "think_min", numeric: true, cell: (r) => r.think_min.toFixed(2) },
  { head: "verify_min", numeric: true, cell: (r) => r.verify_min.toFixed(2) },
  { head: "sidecar_min", numeric: true, cell: (r) => r.sidecar_min.toFixed(2) },
  { head: "idle_min", numeric: true, cell: (r) => r.idle_min.toFixed(2) },
  { head: "pre_edit_chars", numeric: true, cell: (r) => String(r.pre_edit_chars) },
  { head: "slips", numeric: true, cell: (r) => String(r.slips) },
  { head: "compactions", numeric: true, cell: (r) => String(r.compactions) },
];

function inWindow(ts: number, window: Window): boolean {
  const minute = minutesOfDay(ts);
  const afterFrom = window.from === undefined || minute >= window.from;
  const beforeTo = window.to === undefined || minute < window.to;
  return afterFrom && beforeTo;
}

function contentBlocks(line: Line): Block[] {
  const content = line.message?.content;
  return Array.isArray(content) ? (content as Block[]) : [];
}

/** Characters of a tool_result body: the string itself, or the text blocks of an array. */
function textChars(content: unknown): number {
  if (typeof content === "string") return content.length;
  if (!Array.isArray(content)) return 0;
  let chars = 0;
  for (const block of content as Block[]) {
    if (typeof block?.text === "string") chars += block.text.length;
  }
  return chars;
}

function parseLine(raw: string): Line | undefined {
  if (raw.trim() === "") return undefined;
  try {
    return JSON.parse(raw) as Line;
  } catch {
    return undefined;
  }
}

async function readMeta(file: string): Promise<Meta> {
  try {
    return JSON.parse(await readFile(file.replace(/\.jsonl$/, ".meta.json"), "utf8")) as Meta;
  } catch {
    return {};
  }
}

/** Total time covered by the spans, so calls that run in parallel count once. */
function unionMs(spans: Span[]): number {
  let total = 0;
  let end = -Infinity;
  for (const [from, to] of [...spans].sort((a, b) => a[0] - b[0])) {
    if (to > end) {
      total += to - Math.max(from, end);
      end = to;
    }
  }
  return total;
}

function minutes(ms: number): number {
  return round2(ms / MINUTE_MS);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clock(iso: string): string {
  if (iso === "") return "-";
  const date = new Date(iso);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function minutesOfDay(ms: number): number {
  const date = new Date(ms);
  return date.getHours() * 60 + date.getMinutes();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

interface Options extends Window {
  files: string[];
  dir?: string;
  since?: number;
  json: boolean;
}

const TIME_OPTIONS = new Set(["--since", "--from", "--to"]);

function parseArgs(argv: string[]): Options {
  const options: Options = { files: [], json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--dir" || TIME_OPTIONS.has(arg)) {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      if (arg === "--dir") options.dir = value;
      else if (arg === "--since") options.since = parseClock(arg, value);
      else if (arg === "--from") options.from = parseClock(arg, value);
      else options.to = parseClock(arg, value);
    } else if (arg.startsWith("--")) {
      throw new Error(`unknown option ${arg}`);
    } else {
      options.files.push(arg);
    }
  }
  if (options.dir === undefined && options.files.length === 0) {
    throw new Error(
      "usage: agent-metrics.ts [--json] <file.jsonl>... | --dir <subagents-dir> [--since HH:MM] [--from HH:MM] [--to HH:MM]",
    );
  }
  if (options.from !== undefined && options.to !== undefined && options.from >= options.to) {
    throw new Error("--from must be earlier than --to");
  }
  return options;
}

/** Minutes of day for an HH:MM option value. */
function parseClock(flag: string, value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (match === null || Number(match[1]) > 23 || Number(match[2]) > 59) {
    throw new Error(`${flag} wants HH:MM, got ${value}`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

async function transcriptsIn(dir: string): Promise<string[]> {
  const names = (await readdir(dir)).filter((name) => /^agent-.+\.jsonl$/.test(name)).sort();
  return names.map((name) => join(dir, name));
}

async function main(argv: string[]): Promise<void> {
  const options = parseArgs(argv);
  const files = [
    ...options.files,
    ...(options.dir === undefined ? [] : await transcriptsIn(options.dir)),
  ];
  const window: Window = { from: options.from, to: options.to };
  const rows: AgentRow[] = [];
  for (const file of files) rows.push(await analyzeFile(file, window));
  const since = options.since;
  const kept =
    since === undefined
      ? rows
      : rows.filter((r) => r.start !== "" && minutesOfDay(Date.parse(r.start)) >= since);
  kept.sort((a, b) => a.start.localeCompare(b.start));
  console.log(options.json ? JSON.stringify(kept, null, 2) : formatTable(kept));
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  });
}
