import { Data, Option } from "effect";
import { type Cue, LaneState } from "./cells.ts";
import type { Values } from "./compiled.ts";
import { Evidence } from "./evidence.ts";
import { type ActorId, Command, type Ending } from "./world.ts";

/**
 * An act whose reports it determines: a lane's cue with its states before and after and the
 * commands it gave, a replaced lookup, a silent store, or an admitted or parked ending.
 */
export type Act = Data.TaggedEnum<{
  Lane: {
    actor: ActorId;
    operation: string;
    key: Values;
    before: LaneState;
    cue: Cue;
    after: LaneState;
    commands: ReadonlyArray<Command>;
  };
  ReadReplaced: { operation: string };
  Silent: { operation: string; attempt: string };
  Ended: { actor: ActorId; ending: Ending };
}>;

/**
 * Constructors and matchers for {@link Act}.
 */
export const Act = Data.taggedEnum<Act>();

const headOf = (state: LaneState) =>
  LaneState.$match(state, {
    Idle: () => Option.none(),
    Kept: () => Option.none(),
    Head: ({ head }) => Option.some(head),
  });

const RELEASED: ReadonlyArray<string> = ["Recapturing", "Resending", "Held"];

/**
 * The reports an act determines, derived from the act alone: Minted for a new head, Sent for
 * each invocation, the lane facts of a retry, cancel or refusal, and Ended for an ending.
 */
// RETURN_TYPE: every act gives a list of the one Evidence type, whichever case built it.
export const evidenceOf = (act: Act): ReadonlyArray<Evidence> =>
  Act.$match(act, {
    ReadReplaced: ({ operation }) => [
      Evidence.Lane({ kind: "Superseded", operation, attempt: Option.none() }),
    ],
    Silent: ({ operation, attempt }) => [
      Evidence.Lane({ kind: "StorageSilent", operation, attempt: Option.some(attempt) }),
    ],
    Ended: ({ actor, ending }) => [
      Evidence.Ended({
        operation: ending.operation,
        attempt: ending.attempt,
        channel: ending.channel,
        reason: ending.reason,
        actor,
      }),
    ],
    Lane: ({ actor, operation, key, before, cue, after, commands }) => {
      const was = headOf(before);
      const attempt = Option.map(was, (h) => h.id);

      const minted =
        cue._tag === "CommitReject" && Option.isNone(was)
          ? Option.toArray(headOf(after)).map((h) =>
              Evidence.Minted({ operation, attempt: h.id, actor, key }),
            )
          : [];

      const sent = commands.flatMap((c) =>
        Command.$is("Invoke")(c) ? [Evidence.Sent({ operation, attempt: c.attempt.id })] : [],
      );

      const retried =
        cue._tag === "Retry"
          ? Option.match(was, {
              onNone: () => [
                Evidence.Lane({ kind: "NothingToResend", operation, attempt: Option.none() }),
              ],
              onSome: (h) =>
                h.phase._tag === "Held"
                  ? []
                  : [Evidence.Lane({ kind: "InFlight", operation, attempt })],
            })
          : [];

      const released =
        cue._tag === "Cancel" && Option.exists(was, (h) => RELEASED.includes(h.phase._tag))
          ? [Evidence.Lane({ kind: "Released", operation, attempt })]
          : [];

      const refused =
        cue._tag === "Refused"
          ? [Evidence.Lane({ kind: "StorageFailure", operation, attempt })]
          : [];

      return [...minted, ...retried, ...released, ...refused, ...sent];
    },
  });
