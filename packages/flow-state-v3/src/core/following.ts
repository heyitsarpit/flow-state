import { Data, Option } from "effect";
import { type ChainId, Mail } from "./world.ts";

// The loop guard's chain the item being served follows: none between items; an admitted item
// follows none until it first enqueues mail, which starts its chain.
type Following = Data.TaggedEnum<{
  Idle: {};
  Admitted: { serving: Mail };
  Chained: { chain: ChainId };
}>;

const Following = Data.taggedEnum<Following>();

// The chain each kind of mail follows when served: an event or context update carries its own;
// an ending or a firing is admitted.
const chainOf = (mail: Mail) =>
  Mail.$match(mail, {
    Event: ({ chain }) => chain,
    Context: ({ chain }) => chain,
    Ending: () => Option.none<ChainId>(),
    Firing: () => Option.none<ChainId>(),
  });

/**
 * The chain one step's mail follows, as items are served. `start` begins the chain of an admitted
 * item the first time it enqueues mail.
 */
export const makeFollowing = (start: (serving: Mail) => ChainId) => {
  let following: Following = Following.Idle();

  const chainNow = () =>
    Following.$match(following, {
      Idle: () => Option.none<ChainId>(),
      Chained: ({ chain }) => Option.some(chain),
      Admitted: ({ serving }) => {
        const chain = start(serving);
        following = Following.Chained({ chain });

        return Option.some(chain);
      },
    });

  const follow = (mail: Mail) => {
    following = Option.match(chainOf(mail), {
      onNone: () => Following.Admitted({ serving: mail }),
      onSome: (chain) => Following.Chained({ chain }),
    });
  };

  const followNone = () => {
    following = Following.Idle();
  };

  return { chainNow, follow, followNone };
};
