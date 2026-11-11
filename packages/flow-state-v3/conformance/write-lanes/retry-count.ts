import { Option, Predicate } from "effect";
import { addressable, sameLane } from "../dsl/lifecycle-model.ts";
import { Fact, oracle, violation } from "../dsl/oracle.ts";
import type { Json } from "../port.ts";
import type { Request } from "../world/network.ts";

const retryCountOf = (row: Option.Option<Json>) =>
  Option.flatMap(row, (r) =>
    Predicate.hasProperty(r, "retryCount") && Predicate.isNumber(r.retryCount)
      ? Option.some(r.retryCount)
      : Option.none(),
  );

const sendsOf = (requests: ReadonlyArray<Request>, operation: string, attempt: string) =>
  requests.filter((r) => r.operation === operation && Option.contains(r.key, attempt)).length;

/**
 * Retry counts (WriteLanes I7): a row's `retryCount` equals the re-sends of its lane's head that
 * the suite's server received.
 *
 * **Details**
 *
 * - On each row the suite reads (`Read`), the head is the one addressable Attempt the Case's
 *   lifecycle holds on that lane; its sends are the server's requests carrying its id, across
 *   reloads (the server's log outlives a page). A head never sent counts 0.
 * - A lane with no single addressable head, or a row with no `retryCount`, is not judged.
 *
 * **Gotchas**
 *
 * - Re-sends are counted at the server, so a re-send the runtime invoked and the network never
 *   received is not told apart (the fake network receives every invocation at once).
 */
export const retryCount = oracle<Record<string, never>>({
  name: "retry-count",
  guarantee: ["WriteLanes I7"],
  start: () => ({}),
  step: (state, step, requests, lives) => {
    const found = step.flatMap((fact) => {
      if (!Fact.$is("Read")(fact)) return [];

      return Option.match(retryCountOf(fact.row), {
        onNone: () => [],
        onSome: (count) => {
          const lane = { actor: fact.actor, operation: fact.operation, key: Option.some(fact.key) };

          const heads = lives.after.attempts.filter(
            (a) =>
              addressable(a.phase) &&
              (sameLane(a.lane, lane) ||
                (sameLane(a.lane, { ...lane, key: Option.none() }) && Option.isNone(a.lane.key))),
          );

          const [head, ...more] = heads;

          if (head === undefined || more.length > 0) return [];

          const sends = sendsOf(requests, fact.operation, head.id);
          const resends = Math.max(0, sends - 1);

          return count === resends
            ? []
            : [
                violation(
                  `WriteLanes I7: ${fact.operation} ${head.id}'s row says retryCount ${count}, but the server received ${resends} re-sends of it`,
                ),
              ];
        },
      });
    });

    return [state, found];
  },
});
