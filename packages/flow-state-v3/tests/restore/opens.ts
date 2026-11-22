import { Option } from "effect";
import type { StoryRun } from "../../src/host/testing/index.ts";
import { TraceRecord } from "../../src/host/trace.ts";

/**
 * The Runtime evidence of one open of the tab, in order.
 */
export const inOpen = (run: StoryRun<string>, open: number) =>
  run.trace.events.flatMap((e) =>
    e.tab.open === open && TraceRecord.$is("Runtime")(e.record) ? [e.record.evidence] : [],
  );

/**
 * The reports of one open, each as its code and the record it names.
 */
export const reports = (run: StoryRun<string>, open: number) =>
  inOpen(run, open).flatMap((e) =>
    e._tag === "Reported" ? [`${e.code} ${Option.getOrElse(e.record, () => "-")}`] : [],
  );

/**
 * The reports of one open with their reasons.
 */
export const reportsWithReasons = (run: StoryRun<string>, open: number) =>
  inOpen(run, open).flatMap((e) =>
    e._tag === "Reported"
      ? [{ code: e.code, record: Option.getOrElse(e.record, () => "-"), reason: e.reason }]
      : [],
  );

/**
 * The events one open delivered for an operation's endings, in order.
 */
export const heard = (run: StoryRun<string>, open: number, operation: string) =>
  inOpen(run, open).flatMap((e) =>
    e._tag === "Delivered" && e.operation === operation ? [e.event] : [],
  );

/**
 * Every ending one open recorded, as its channel, reason and Attempt.
 */
export const endedIn = (run: StoryRun<string>, open: number) =>
  inOpen(run, open).flatMap((e) =>
    e._tag === "Ended"
      ? [`${e.channel} ${e.reason} ${Option.getOrElse(e.attempt, () => "-")}`]
      : [],
  );
