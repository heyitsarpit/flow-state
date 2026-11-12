import type { Scenario } from "../dsl/case.ts";

/**
 * The hand cases as they froze with R15's text (2026-11-11, at a21e9086): the 99 named examples and
 * the Spec model's tests (Conformance R15). The three ACT cases came after and cite rulings.
 */
const FROZEN: ReadonlySet<string> = new Set([
  "PAY-01",
  "PAY-02",
  "PAY-03",
  "PAY-04",
  "PAY-05",
  "PAY-23",
  "PAY-06/interruptible",
  "PAY-06/uninterruptible",
  "PAY-07/leaveMidCharge",
  "PAY-07/late-in-a-new-PAYING",
  "PAY-07/late-may-not-leave",
  "PAY-08/reloadDuringCharge",
  "PAY-08/reload-while-reconciling",
  "PAY-09/ack-not-stored",
  "PAY-09/ack-stored-confirmation-lost",
  "PAY-10/refuse",
  "PAY-10/hang",
  "PAY-12/defect",
  "PAY-12/sync",
  "PAY-12/cancel-on-wire",
  "PAY-14",
  "PAY-15/press-pay-while-held",
  "PAY-15/busy-then-new-write",
  "PAY-15/reload-holds-exactly-once",
  "PAY-15/dead-activation-timer",
  "PAY-15/retry-budget",
  "PAY-15/cancel-idle",
  "PAY-15/cancel-on-wire",
  "PAY-16/restore-keeps-mayHaveApplied",
  "PAY-16/timeout-per-send",
  "PAY-16/resend-refused-capture",
  "PAY-16/retry-count-persists",
  "PAY-16/stale-send-fenced",
  "PAY-16/schedule-reads-after-memory",
  "PAY-16/read-defect-issue",
  "PAY-16/superseded-read",
  "PAY-18",
  "PAY-19/void-answers-first",
  "PAY-19/place-answers-first",
  "PAY-20/a-500-that-landed-is-unknown-and-pay-reads-the-intent",
  "PAY-20/a-pruned-key-does-not-charge-twice-since-pay-reads-first",
  "PAY-21",
  "PAY-22",
  "PAY-13/hung-commit",
  "PAY-13/waiting-flushed",
  "PAY-13/waiting-flush-lost",
  "PAY-15/dispose-held",
  "PAY-15/dispose-held-moved",
  "PAY-16/settled-during-disposal-parked",
  "PAY-16/on-the-wire-at-the-bound-ends-unknown-disposed",
  "PAY-16/never-answered-waits-for-the-bound",
  "PAY-16/dispose-waiting-resend",
  "PAY-16/disposal-ends-with-the-last-fiber",
  "PAY-16/answered-inside-the-bound",
  "DISP-01",
  "DISP-02",
  "DISP-03",
  "DISP-04",
  "DISP-05",
  "DISP-06",
  "DISP-07",
  "LANE-01",
  "LANE-02",
  "LANE-03",
  "LANE-04",
  "LANE-05",
  "LANE-10",
  "LANE-06",
  "LANE-07",
  "LANE-08",
  "LANE-09",
  "LANE-11",
  "LANE-12/release-ends-queue",
  "LANE-12/release-leaves-head",
  "LANE-12/release-uninterruptible",
  "LANE-12/release-uninterruptible-lost",
  "LANE-13",
  "LANE-14",
  "LANE-15",
  "LANE-16",
  "DLV-01",
  "DLV-02",
  "DLV-03",
  "DLV-04",
  "DLV-05",
  "DLV-06",
  "DLV-07",
  "TURN-01/schedule-refused",
  "TURN-01/mapper-refused",
  "TURN-02",
  "TURN-03/unused",
  "TURN-03/exited",
  "TURN-03/on-time",
  "TURN-03/re-entered",
  "TURN-04/re-entry-makes-the-first-ending-late",
  "TURN-04/a-late-exit-with-nothing-queued-goes",
  "TURN-05/child-refusal",
  "TURN-05/removed-copy-ends-once",
  "TURN-05/a-part-writing-the-key-is-a-pending-reset",
]);

/**
 * The ruling each hand case added after the freeze documents, by case id: a log note, a Spec
 * decision or a Task comment, cited by its record link.
 */
export const RULINGS = {
  "ACT-01/free-actor-ends": "code:workflow/tasks/V3/P4.task (T45, comment 2026-11-11T21:17:53Z)",
  "ACT-02/dirty-record-written-at-end":
    "code:workflow/tasks/V3/log.task (note 2026-11-11T22:32:05Z, the decision on review B1)",
  "ACT-03/no-end-before-the-grace":
    "code:workflow/tasks/V3/log.task (note 2026-11-11T22:32:05Z, the decision on review B1)",
} satisfies Readonly<Record<string, string>>;

/**
 * How many hand cases froze: R15 says 99.
 */
export const frozenCount = FROZEN.size;

/**
 * The scenarios added after the hand cases froze that cite no ruling (Conformance R15, I50).
 */
export const uncitedNew = (scenarios: ReadonlyArray<Scenario>) =>
  scenarios.filter((s) => !FROZEN.has(s.id) && !Object.hasOwn(RULINGS, s.id)).map((s) => s.id);
