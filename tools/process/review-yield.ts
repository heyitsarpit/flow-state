/**
 * Review yield by sidecar angle, and the tally of builder misses.
 *
 * Run: bun tools/process/review-yield.ts [--json]
 *
 * Table 1 reads the sidecar log tables of the review files in
 * wiki/plans/flow/references/proposals (names matching review-...-2026- or recheck).
 * A table counts when it sits under a heading containing "sidecar" and has a Result,
 * Outcome, Ruling, Logged or Verdict column. Prose-only logs are listed, not parsed.
 *
 * Table 2 reads the "Missed by the builder..." and "Missed by own checks" sentences in
 * wiki/tasks/V3/log.task and counts each lowercase parenthesised cause in that sentence, such as
 * (weak check); "Missed by the builder's gathering:" counts as (gathering).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type Verdict = "accepted" | "changed" | "rejected" | "noted" | "held" | "confirmed";

export interface Row {
  readonly angle: string;
  readonly verdict: Verdict | undefined;
  readonly result: string;
}

export interface ReviewFile {
  readonly name: string;
  readonly tables: number;
  readonly rows: readonly Row[];
}

export interface Counts {
  readonly items: number;
  readonly accepted: number;
  readonly changed: number;
  readonly rejected: number;
  readonly noted: number;
  readonly held: number;
  readonly confirmed: number;
  readonly other: number;
}

export interface Note {
  readonly ts: string;
  readonly date: string;
  readonly body: string;
}

export interface Miss {
  readonly date: string;
  readonly clause: string;
  readonly causes: readonly string[];
}

export interface CauseRow {
  readonly cause: string;
  readonly count: number;
  readonly dates: readonly string[];
  readonly flagged: boolean;
}

export interface Report {
  readonly angles: ReadonlyArray<{
    readonly angle: string;
    readonly counts: Counts;
    readonly used: number | null;
  }>;
  readonly fileAngles: ReadonlyArray<{
    readonly file: string;
    readonly angle: string;
    readonly counts: Counts;
    readonly used: number | null;
  }>;
  readonly unparsed: {
    readonly noTableFiles: readonly string[];
    readonly noAngleFiles: readonly string[];
    readonly unknownResults: ReadonlyArray<{
      readonly angle: string;
      readonly result: string;
      readonly count: number;
    }>;
  };
  readonly misses: {
    readonly sentences: number;
    readonly causes: readonly CauseRow[];
    readonly noCause: ReadonlyArray<{ readonly date: string; readonly clause: string }>;
    readonly notCounted: ReadonlyArray<{ readonly date: string; readonly clause: string }>;
    readonly flagAt: number;
  };
}

export const REVIEW_DIR = join(
  import.meta.dir,
  "..",
  "..",
  "wiki",
  "plans",
  "flow",
  "references",
  "proposals",
);
export const LOG_PATH = join(import.meta.dir, "..", "..", "wiki", "tasks", "V3", "log.task");

const NO_ANGLE = "(no angle column)";
const FLAG_AT = 3;
const ANGLE_HEADERS = new Set(["sidecar", "angle", "agent", "reviewer", "lens", "by"]);
const RESULT_HEADERS = new Set(["result", "outcome", "ruling", "logged", "verdict"]);
const MISS = /Missed by/g;
const BUILDER = /^Missed by (?:the builders?(?:'s|')?|own checks)/;
const GATHERING = /^Missed by the builders?(?:'s|')? gathering\b/;
const CAUSE = /\(([^()]+)\)/g;
const SENTENCE_END = /\.\s+(?=[A-Z])/;

const plain = (s: string): string => s.replace(/[`*_]/g, "").replace(/\s+/g, " ").trim();

export const isReviewName = (name: string): boolean =>
  name.endsWith(".md") && (/review.*-2026-/.test(name) || name.includes("recheck"));

export function splitRow(line: string): string[] {
  const inner = line
    .trim()
    .replace(/^\|/, "")
    .replace(/(^|[^\\])\|$/, "$1");
  return inner.split(/(?<!\\)\|/).map((cell) => cell.replace(/\\\|/g, "|").trim());
}

const isSeparator = (line: string | undefined): boolean =>
  line !== undefined && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line);

const verdictOf = (result: string): Verdict | undefined => {
  const verdict = /^(accepted|changed|rejected|noted|held|confirmed)\b/;
  const m = verdict.exec(plain(result).toLowerCase());
  return m ? (m[1] as Verdict) : undefined;
};

const angleName = (cell: string): string => {
  // "A blind" and "blind" are one angle: the leading letter only labels the sidecar in that review.
  const angle = plain(cell)
    .toLowerCase()
    .replace(/^[a-z] (?=\S)/, "");
  return angle === "" ? "(empty)" : angle;
};

export function parseReview(name: string, text: string): ReviewFile {
  const lines = text.split(/\r?\n/);
  const rows: Row[] = [];
  let tables = 0;
  let heading = "";
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (h) {
      heading = h[1] ?? "";
      i++;
      continue;
    }
    if (line.trim().startsWith("|") && isSeparator(lines[i + 1])) {
      const header = splitRow(line).map((c) => plain(c).toLowerCase());
      const angleAt = header.findIndex((c) => ANGLE_HEADERS.has(c));
      const resultAt = header.findIndex((c) => RESULT_HEADERS.has(c));
      const counted = /sidecar/i.test(heading) && resultAt >= 0;
      let j = i + 2;
      while (j < lines.length && (lines[j] ?? "").trim().startsWith("|")) {
        const cells = splitRow(lines[j] ?? "");
        // A row with an empty first cell continues the previous row's wrapped text.
        if (counted && (cells[0] ?? "") !== "") {
          const result = cells[resultAt] ?? "";
          rows.push({
            angle: angleAt >= 0 ? angleName(cells[angleAt] ?? "") : NO_ANGLE,
            verdict: verdictOf(result),
            result: plain(result),
          });
        }
        j++;
      }
      if (counted) tables++;
      i = j;
      continue;
    }
    i++;
  }
  return { name, tables, rows };
}

const emptyCounts = (): Counts => ({
  items: 0,
  accepted: 0,
  changed: 0,
  rejected: 0,
  noted: 0,
  held: 0,
  confirmed: 0,
  other: 0,
});

function bump(counts: Counts, row: Row): Counts {
  const next = { ...counts, items: counts.items + 1 };
  if (row.verdict === undefined) return { ...next, other: next.other + 1 };
  return { ...next, [row.verdict]: next[row.verdict] + 1 };
}

/** Share of verdicts that were used: (accepted + changed) / (accepted + changed + rejected). */
export function usedShare(c: Counts): number | null {
  const decided = c.accepted + c.changed + c.rejected;
  return decided === 0 ? null : (c.accepted + c.changed) / decided;
}

export function parseNotes(text: string): Note[] {
  const notes: { ts: string; lines: string[] }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const head = /^note (\S+)/.exec(line);
    if (head) notes.push({ ts: head[1] ?? "", lines: [] });
    else notes.at(-1)?.lines.push(line.trim());
  }
  return notes.map((n) => ({
    ts: n.ts,
    date: n.ts.slice(0, 10),
    body: n.lines.join(" ").replace(/\s+/g, " "),
  }));
}

function clauseAt(body: string, start: number): string {
  const rest = body.slice(start);
  const end = rest.search(SENTENCE_END);
  return end < 0 ? rest : rest.slice(0, end + 1);
}

function causesIn(clause: string): string[] {
  const out: string[] = [];
  for (const m of clause.matchAll(CAUSE)) {
    const cause = (m[1] ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    if (/^[a-z][a-z ]*$/.test(cause) && cause.split(" ").length <= 4) out.push(cause);
  }
  return out;
}

/** Splits the notes' "Missed by" sentences into builder misses and other phrasings. */
export function missesIn(notes: readonly Note[]): { counted: Miss[]; notCounted: Miss[] } {
  const counted: Miss[] = [];
  const notCounted: Miss[] = [];
  for (const note of notes) {
    for (const m of note.body.matchAll(MISS)) {
      const at = m.index ?? 0;
      const clause = clauseAt(note.body, at);
      const causes = causesIn(clause);
      // "Missed by the builder's gathering: ..." names its cause in the phrase instead of in parentheses.
      if (causes.length === 0 && GATHERING.test(clause)) causes.push("gathering");
      const miss: Miss = { date: note.date, clause, causes };
      (BUILDER.test(note.body.slice(at)) ? counted : notCounted).push(miss);
    }
  }
  return { counted, notCounted };
}

export function tallyCauses(misses: readonly Miss[]): CauseRow[] {
  const seen = new Set(misses.flatMap((m) => m.causes));
  // "weak checks" counts as "weak check" when the singular also occurs; other variants stay apart.
  const canon = (c: string): string =>
    c.endsWith("s") && seen.has(c.slice(0, -1)) ? c.slice(0, -1) : c;
  const byCause = new Map<string, { count: number; dates: Set<string> }>();
  for (const miss of misses) {
    for (const cause of miss.causes.map(canon)) {
      const entry = byCause.get(cause) ?? { count: 0, dates: new Set<string>() };
      entry.count++;
      entry.dates.add(miss.date);
      byCause.set(cause, entry);
    }
  }
  return [...byCause.entries()]
    .map(([cause, { count, dates }]) => ({
      cause,
      count,
      dates: [...dates].sort(),
      flagged: count >= FLAG_AT,
    }))
    .sort((a, b) => b.count - a.count || a.cause.localeCompare(b.cause));
}

export function buildReport(reviews: readonly ReviewFile[], logText: string): Report {
  const byAngle = new Map<string, Counts>();
  const fileAngles: { file: string; angle: string; counts: Counts }[] = [];
  const unknown = new Map<string, { angle: string; result: string; count: number }>();
  const noTableFiles: string[] = [];
  const noAngleFiles: string[] = [];

  for (const review of reviews) {
    if (review.tables === 0) noTableFiles.push(review.name);
    const perAngle = new Map<string, Counts>();
    for (const row of review.rows) {
      byAngle.set(row.angle, bump(byAngle.get(row.angle) ?? emptyCounts(), row));
      perAngle.set(row.angle, bump(perAngle.get(row.angle) ?? emptyCounts(), row));
      if (row.angle === NO_ANGLE && !noAngleFiles.includes(review.name))
        noAngleFiles.push(review.name);
      if (row.verdict === undefined) {
        const first = (row.result.toLowerCase().split(/[\s:,(]/)[0] ?? "") || "(empty)";
        const key = `${row.angle}\u0000${first}`;
        const entry = unknown.get(key) ?? { angle: row.angle, result: first, count: 0 };
        unknown.set(key, { ...entry, count: entry.count + 1 });
      }
    }
    for (const [angle, counts] of perAngle) fileAngles.push({ file: review.name, angle, counts });
  }

  const { counted, notCounted } = missesIn(parseNotes(logText));
  const causes = tallyCauses(counted);

  return {
    angles: [...byAngle.entries()]
      .map(([angle, counts]) => ({ angle, counts, used: usedShare(counts) }))
      .sort((a, b) => b.counts.items - a.counts.items || a.angle.localeCompare(b.angle)),
    fileAngles: fileAngles.map((f) => ({ ...f, used: usedShare(f.counts) })),
    unparsed: {
      noTableFiles,
      noAngleFiles,
      unknownResults: [...unknown.values()].sort((a, b) => b.count - a.count),
    },
    misses: {
      sentences: counted.length,
      causes,
      noCause: counted
        .filter((m) => m.causes.length === 0)
        .map((m) => ({ date: m.date, clause: m.clause })),
      notCounted: notCounted.map((m) => ({ date: m.date, clause: m.clause })),
      flagAt: FLAG_AT,
    },
  };
}

export function loadReviews(dir: string): ReviewFile[] {
  return readdirSync(dir)
    .filter(isReviewName)
    .sort()
    .map((name) => parseReview(name, readFileSync(join(dir, name), "utf8")));
}

function renderTable(headers: string[], rows: string[][], align: ("l" | "r")[]): string[] {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const fmt = (cells: string[]) =>
    cells
      .map((c, i) => (align[i] === "r" ? c.padStart(widths[i] ?? 0) : c.padEnd(widths[i] ?? 0)))
      .join("  ")
      .trimEnd();
  return [fmt(headers), widths.map((w) => "-".repeat(w)).join("  "), ...rows.map(fmt)];
}

const pct = (used: number | null): string => (used === null ? "n/a" : `${Math.round(used * 100)}%`);

const countCells = (c: Counts): string[] => [
  String(c.items),
  String(c.accepted),
  String(c.changed),
  String(c.rejected),
  String(c.noted),
  String(c.held),
  String(c.confirmed),
  String(c.other),
];

export function renderText(report: Report): string {
  const out: string[] = [];
  const countHeaders = [
    "Items",
    "Accepted",
    "Changed",
    "Rejected",
    "Noted",
    "Held",
    "Confirmed",
    "Other",
    "Used",
  ];
  const countAlign: ("l" | "r")[] = ["r", "r", "r", "r", "r", "r", "r", "r", "r"];

  out.push("Table 1: review yield by sidecar angle (summed across review files)");
  out.push(
    ...renderTable(
      ["Angle", ...countHeaders],
      report.angles.map((a) => [a.angle, ...countCells(a.counts), pct(a.used)]),
      ["l", ...countAlign],
    ),
  );
  out.push(
    "Used = (accepted + changed) / (accepted + changed + rejected). Other = result not starting with a verdict.",
  );
  out.push("");

  out.push("Table 1b: per review file and angle");
  out.push(
    ...renderTable(
      ["File", "Angle", ...countHeaders],
      report.fileAngles.map((f) => [f.file, f.angle, ...countCells(f.counts), pct(f.used)]),
      ["l", "l", ...countAlign],
    ),
  );
  out.push("");

  out.push("Unparsed");
  out.push(
    `- Review files with no sidecar verdict table (prose logs or none): ${report.unparsed.noTableFiles.length}`,
  );
  for (const f of report.unparsed.noTableFiles) out.push(`    ${f}`);
  out.push(
    `- Files with a table but no angle column: ${report.unparsed.noAngleFiles.join(", ") || "none"}`,
  );
  out.push("- Results not starting with accepted, changed or rejected:");
  for (const r of report.unparsed.unknownResults)
    out.push(`    ${r.angle} | "${r.result}" x${r.count}`);
  out.push("");

  const m = report.misses;
  out.push(
    `Table 2: builder misses, "Missed by the builder..." sentences in log.task (${m.sentences} sentences)`,
  );
  out.push(
    ...renderTable(
      ["Cause", "Count", "Flag", "Dates of notes"],
      m.causes.map((c) => [c.cause, String(c.count), c.flagged ? "FLAG" : "", c.dates.join(", ")]),
      ["l", "r", "l", "l"],
    ),
  );
  out.push(`Flag = seen ${m.flagAt} or more times. Each cause in a sentence counts once.`);
  out.push(`No parenthesised cause (${m.noCause.length}):`);
  for (const n of m.noCause) out.push(`    ${n.date}: ${n.clause.slice(0, 100)}`);
  out.push(`Not counted, phrase is not "Missed by the builder" (${m.notCounted.length}):`);
  for (const n of m.notCounted) out.push(`    ${n.date}: ${n.clause.slice(0, 100)}`);
  return out.join("\n");
}

if (import.meta.main) {
  const report = buildReport(loadReviews(REVIEW_DIR), readFileSync(LOG_PATH, "utf8"));
  console.log(
    process.argv.includes("--json") ? JSON.stringify(report, null, 2) : renderText(report),
  );
}
