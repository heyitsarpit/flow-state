import { Option } from "effect";
import type { StoryRun } from "../../src/host/testing/index.ts";
import type { TraceRecord } from "../../src/host/trace.ts";

type Task = Extract<TraceRecord, { readonly _tag: "Task" }>;

type Report = Extract<TraceRecord, { readonly _tag: "Report" }>;

// One task as an open's trace shows it: where it started, and where it ended, if it did.
type Life = {
  readonly key: string;
  readonly started: number;
  ended: Option.Option<{ readonly at: number; readonly failed: boolean }>;
};

// One open's Owner records: each Owner's tasks by number, each report with its sequence, and the
// open's CleanupFailed Issues.
type Open = {
  readonly tasks: Map<string, Map<number, Life>>;
  readonly reports: Array<{ readonly at: number; readonly report: Report }>;
  readonly breaches: Array<string>;
  issues: number;
};

const taskOf = (open: number, into: Open, at: number, task: Task) => {
  const lives = into.tasks.get(task.owner) ?? new Map<number, Life>();
  into.tasks.set(task.owner, lives);
  const id = `${task.owner}#${task.task} ${task.key}`;
  const life = lives.get(task.task);

  if (task.phase === "started") {
    if (life !== undefined)
      into.breaches.push(`Actors I47: open ${open}'s task ${id} started twice`);
    lives.set(task.task, { key: task.key, started: at, ended: Option.none() });

    return;
  }

  if (life === undefined)
    into.breaches.push(`Actors I47: open ${open}'s task ${id} ended with no start`);
  else if (Option.isSome(life.ended))
    into.breaches.push(`Actors I47: open ${open}'s task ${id} ended twice`);
  else life.ended = Option.some({ at, failed: task.failed });
};

const isCleanupIssue = (record: TraceRecord) =>
  record._tag === "Runtime" &&
  record.evidence._tag === "Issue" &&
  record.evidence.code === "CleanupFailed";

const opensOf = (run: StoryRun) => {
  const opens = new Map<number, Open>();

  for (const { sequence, tab, record } of run.trace.events) {
    const into: Open = opens.get(tab.open) ?? {
      tasks: new Map(),
      reports: [],
      breaches: [],
      issues: 0,
    };

    opens.set(tab.open, into);

    if (record._tag === "Task") taskOf(tab.open, into, sequence, record);
    else if (record._tag === "Report") into.reports.push({ at: sequence, report: record });
    else if (isCleanupIssue(record)) into.issues += 1;
  }

  return opens;
};

// A report's breaches: a task that had not ended or started after it, and causes that are not its
// tasks' failed cleanups, its own Scope's failures and its nested Owners' causes.
const reportBreaches = (
  open: number,
  { at, report }: { readonly at: number; readonly report: Report },
  lives: ReadonlyMap<number, Life>,
  nested: number,
) => {
  const breaches: Array<string> = [];
  let failed = 0;

  for (const [n, life] of lives) {
    const id = `${report.owner}#${n} ${life.key}`;

    if (life.started > at)
      breaches.push(`Actors R23: open ${open}'s task ${id} started after its Owner reported`);
    else if (!Option.exists(life.ended, (e) => e.at < at))
      breaches.push(
        `Actors R23: open ${open}'s Owner ${report.owner} reported while its task ${id} had not ended`,
      );

    if (Option.exists(life.ended, (e) => e.failed)) failed += 1;
  }

  const expected = failed + nested;

  if (report.causes !== expected)
    breaches.push(
      `Actors I48: open ${open}'s Owner ${report.owner} reported ${report.causes} causes; its tasks' failed cleanups (its own Scope's release among them) and the Owners its close ended hold ${expected}`,
    );

  return breaches;
};

/**
 * Actors R23, I47 and I48 and Diagnostics R8, over each open's dev trace: every task an Owner
 * starts is judged once (I47), and every failed cleanup is heard by its closer and is one Issue
 * (I48).
 *
 * **Details**
 *
 * - Each task starts once and ends at most once, and never ends unstarted.
 * - An Owner reports once. Its close awaits every task it holds: each task it started has ended
 *   before its report, and none starts after it. An Owner that never closes (its Runtime still
 *   open, or its tab abandoned by a reload) may hold tasks still running.
 * - A report hears every failed cleanup: its causes are its tasks' failed cleanups and the causes
 *   of each nested Owner its close started. An Owner's own Scope's release is one of its tasks
 *   (keyed `scope`), so its own count comes from its Task records, never from the report it
 *   checks; a nested Owner's causes come from that Owner's report, which its own check holds to
 *   its Task records in turn.
 * - Every failed cleanup is an Issue CleanupFailed: as many Issues as failed endings, so a Cause
 *   that is not a pure interrupt is never dropped unseen. A close past its bound is an `overdue`
 *   Owner whose one task failed.
 *
 * **Gotchas**
 *
 * - The core records no Issue in a life that admits no CleanupFailed (Inert, Booting, Failed,
 *   Stopped), so an open whose Runtime failed its boot or stopped on a defect breaks the Issue
 *   count; no fixture Story does either.
 */
export const everyTaskAccounted = {
  rule: "Actors R23, I47, I48",
  breaches: (run: StoryRun) =>
    [...opensOf(run)].flatMap(([open, into]) => openBreaches(open, into)),
};

// Each Owner reports once; the causes each Owner's close heard from the nested Owners it closed.
const nestedOf = (open: number, into: Open) => {
  const nested = new Map<string, number>();
  const seen = new Set<string>();
  const twice: Array<string> = [];

  for (const { report } of into.reports) {
    if (seen.has(report.owner))
      twice.push(`Actors R23: open ${open}'s Owner ${report.owner} reported twice`);
    seen.add(report.owner);

    if (report.heardBy === "parent" && Option.isSome(report.parent))
      nested.set(report.parent.value, (nested.get(report.parent.value) ?? 0) + report.causes);
  }

  return { nested, twice };
};

// Every failed cleanup an open judged, read from its Task records alone: its tasks' and its Scopes'
// releases'.
const failuresOf = (into: Open) =>
  [...into.tasks.values()]
    .flatMap((lives) => [...lives.values()])
    .filter((life) => Option.exists(life.ended, (e) => e.failed)).length;

// One open's breaches: its tasks', its reports' and its Issues'.
const openBreaches = (open: number, into: Open) => {
  const { nested, twice } = nestedOf(open, into);

  const heard = into.reports.flatMap((r) =>
    reportBreaches(
      open,
      r,
      into.tasks.get(r.report.owner) ?? new Map(),
      nested.get(r.report.owner) ?? 0,
    ),
  );

  const failures = failuresOf(into);

  const issues =
    into.issues === failures
      ? []
      : [
          `Actors I48, Diagnostics R8: open ${open} judged ${failures} failed cleanups and recorded ${into.issues} Issues CleanupFailed`,
        ];

  return [...into.breaches, ...twice, ...heard, ...issues];
};
