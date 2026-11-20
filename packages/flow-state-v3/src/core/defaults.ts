import { Duration } from "effect";

/**
 * The Runtime's named defaults: every timing and pacing value it runs on, each defined here once.
 *
 * **When to use**
 *
 * Read a default by name wherever its value matters: a test that waits out the disposal bound
 * advances by `disposalBound`, never by a copied literal.
 *
 * **Details**
 *
 * - `freeGrace`: how long a shared actor free of uses and work lives before it ends.
 * - `disposalBound`: how long the Runtime's disposal waits for calls on the wire and its own
 *   writes.
 * - `storageSilent`: how long an awaited store write, or the boot's load, may stay unanswered
 *   before StorageSilent is reported; it decides nothing.
 * - `captureInterval`: how long a plain dirty record may wait before its capture is issued, when
 *   the setup names no `captureMs`. A refused batch is captured again one interval later.
 * - `drainYield`: how many mail items one step serves before it yields to the host and leaves the
 *   rest to a later step. A fairness yield, never a limit: nothing is dropped or refused. Set so a
 *   step stays within `slowWorkBudget` at the bench's slowest ordinary turn.
 * - `loopGuard`: how many events the turns of one admitted event may send before the next send is
 *   refused as a runaway chain. Set so a runaway chain stops within about a second at the bench's
 *   slowest ordinary turn. It counts only events sent by turns, among them the turns of the
 *   `onContext` events its context updates reach; the context updates and those events never
 *   count.
 * - `slowWorkBudget`: a step slower than this is reported SlowWork, on a host that times work
 *   (dev only): one 60 Hz frame, about a hundred times the bench's ordinary turn.
 *
 * None of them caps a size or a queue: a mailbox, a lane's queue, a key, a name and a record have
 * no limit beyond the host's memory and storage quota.
 */
export const RuntimeDefaults = {
  freeGrace: Duration.millis(100),
  disposalBound: Duration.seconds(5),
  storageSilent: Duration.seconds(10),
  captureInterval: Duration.seconds(5),
  drainYield: 100,
  loopGuard: 5000,
  slowWorkBudget: Duration.millis(16),
} as const;

/**
 * The largest delay a host timer holds, 2^31 - 1 ms: a platform limit, not a default.
 */
export const TIMER_LIMIT_MS = 2_147_483_647;
