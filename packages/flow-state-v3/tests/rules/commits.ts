import { Option } from "effect";
import type { Evidence } from "../../src/host/inspect.ts";
import type { StoryRun } from "../../src/host/testing/index.ts";
import { nameOf } from "./deliveries.ts";
import { knownAt, placesOf } from "./places.ts";
import type { Rule } from "./rules.ts";

// What an evidence record says about commits of an operation: admitted by a turn's commit member,
// or accounted for as a new Attempt, an ending with no Attempt (a decline, or a queued commit's
// end) or a queued commit superseded.
const admittedBy = (e: Evidence) =>
  e._tag === "Turn" ? e.members.filter((m) => m.kind === "commit").map((m) => m.operation) : [];

const accountedBy = (e: Evidence) => {
  if (e._tag === "Minted") return [e.operation];

  if (e._tag === "Ended" && e.channel === "notSent" && Option.isNone(e.attempt))
    return [e.operation];

  return e._tag === "Lane" && e.kind === "Superseded" && Option.isNone(e.attempt)
    ? [e.operation]
    : [];
};

/**
 * WriteAhead I17, across reloads: an Attempt whose acknowledgement landed and that had no ending in
 * that open, and was not superseded or released there, is heard in a later open of its identity:
 * its saved ending, or unknown Restored. Only
 * identities started again in a later open are judged, since a disposed identity's endings wait
 * for an adopting ensure; and an Attempt whose lane record a later boot could not read is reported
 * there instead, its key held until a cancel (Restore R5).
 */
export const acknowledgedHeardAgain: Rule = {
  rule: "WriteAhead I17",
  breaches: (run: StoryRun) => {
    const { owner, ended, started, operation, unread } = opensOf(run);

    return run.end.records.batches.flatMap((b) =>
      b.status !== "landed"
        ? []
        : b.acknowledges.flatMap((attempt) => {
            const open = b.tab.open;
            const actor = owner.get(attempt) ?? "";
            const heard = [...(ended.get(attempt) ?? [])];
            const later = [...(started.get(actor) ?? [])].filter((o) => o > open);

            const quarantined = [...unread].some(
              ([key, opens]) =>
                key.startsWith(`lane/${actor}|${operation.get(attempt) ?? ""}|`) &&
                [...opens].some((o) => o > open),
            );

            return heard.length > 0 || later.length === 0 || quarantined
              ? []
              : [
                  `WriteAhead I17: ${attempt} of ${actor} was acknowledged in open ${open} with no ending there, and no later open of ${actor} heard it`,
                ];
          }),
    );
  },
};

const addTo = (map: Map<string, Set<number>>, key: string, open: number) =>
  map.set(key, (map.get(key) ?? new Set()).add(open));

// Each Attempt's actor, the opens each Attempt was ended or left in, and the opens each identity
// started in. A head superseded before its send, or released, leaves its lane with no ending.
const leftBy = (e: Evidence) => {
  if (e._tag === "Ended") return Option.toArray(e.attempt);

  return e._tag === "Lane" && (e.kind === "Superseded" || e.kind === "Released")
    ? Option.toArray(e.attempt)
    : [];
};

const opensOf = (run: StoryRun) => {
  const places = placesOf(run);
  const owner = new Map<string, string>();
  const operation = new Map<string, string>();
  const ended = new Map<string, Set<number>>();
  const started = new Map<string, Set<number>>();

  for (const [at, e] of run.evidence.entries()) {
    const open = places[at]?.open ?? 0;

    if (e._tag === "Minted") {
      owner.set(e.attempt, nameOf(e.actor));
      operation.set(e.attempt, e.operation);
    }

    if (e._tag === "Incarnated") addTo(started, nameOf(e.actor), open);

    for (const attempt of leftBy(e)) addTo(ended, attempt, open);
  }

  return { owner, operation, ended, started, unread: unreadBy(run, places) };
};

// The records each open's boot could not read, by key.
const unreadBy = (run: StoryRun, places: ReturnType<typeof placesOf>) => {
  const unread = new Map<string, Set<number>>();

  for (const [at, e] of run.evidence.entries())
    if (e._tag === "Reported" && e.code === "RecordUndecodable")
      for (const key of Option.toArray(e.record)) addTo(unread, key, places[at]?.open ?? 0);

  return unread;
};

const tally = (counts: Map<string, number>, operation: string) =>
  counts.set(operation, (counts.get(operation) ?? 0) + 1);

/**
 * WriteLanes I27: every admitted commit ends exactly once, across reloads. Per operation, the
 * commits turns admitted equal the Attempts minted, plus the endings with no Attempt (declines and
 * queued commits' ends, NotSent Restored at a reload included), plus the queued commits superseded,
 * once the run ends with the Runtime disposed (nothing still queued); before that, never more.
 * A crash forgets what was never saved (WriteAhead I21), so only what the run's end still knows is
 * counted.
 */
export const everyCommitEndsOnce: Rule = {
  rule: "WriteLanes I27",
  breaches: (run: StoryRun) => {
    const places = placesOf(run);
    const last = run.evidence.length - 1;
    const admitted = new Map<string, number>();
    const accounted = new Map<string, number>();
    let actor = "";

    for (const [at, e] of run.evidence.entries()) {
      if (e._tag === "Turn" || e._tag === "Minted" || e._tag === "Ended") actor = nameOf(e.actor);

      if (!knownAt(run, places, at, last, actor)) continue;

      for (const operation of admittedBy(e)) tally(admitted, operation);

      for (const operation of accountedBy(e)) tally(accounted, operation);
    }

    const lastOpen = places[last]?.open;

    const disposed = run.evidence.some(
      (e, at) => e._tag === "RuntimeDisposed" && places[at]?.open === lastOpen,
    );

    // A replaced lookup is also Superseded with no Attempt: only operations that commit count.
    const writes = new Set(run.evidence.flatMap(admittedBy));

    return [...writes].flatMap((operation) => {
      const a = admitted.get(operation) ?? 0;
      const b = accounted.get(operation) ?? 0;

      return b > a || (disposed && b !== a)
        ? [
            `WriteLanes I27: ${a} commits of ${operation} were admitted but ${b} were minted, declined, ended while queued or superseded while queued`,
          ]
        : [];
    });
  },
};
