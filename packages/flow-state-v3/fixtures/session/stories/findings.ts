import { Fake } from "../../../src/host/testing/index.ts";
import { badge } from "../app.ts";
import { workspaceStory } from "./usual.ts";

/**
 * The session's record in the middle of the badge's chain (an org provides the session, which
 * provides the team, which provides the badge), with its org slot bound to a local actor, beside
 * an owed declined sign-in that wakes the session at the boot: as a damaged disk could leave them.
 */
export const forgedChain = {
  session: "actor/Workspace/Session/main",
  sessionText:
    '{"context":{"org":{"machine":"Workspace/Org","name":"~1"}},"format":4,"graph":{"Workspace/Org/~1":{}},"memories":[],"memory":{"displayName":"ada","notice":"","user":"ada"},"reactions":[],"schedules":[],"seen":{"org":"Acme"},"state":"SIGNED_IN"}',
  owed: "owed/Workspace/Session/main",
  owedText:
    '{"format":4,"rows":[{"attempt":null,"channel":"notSent","kept":false,"operation":"signIn","reason":"Rejected","value":{"why":"Rejected"}}]}',
} as const;

/**
 * The badge's chain is running; then the session's record is replaced by one bound to a local org
 * beside an owed ending, and the tab reloads and ensures the badge, the deepest node: the session's
 * record is set aside and reported, no local org starts, the session hears its owed ending and the
 * chain runs.
 */
export const chainBoundToLocal = workspaceStory("session/chain-bound-to-local")
  .ensure(badge)
  .world(
    Fake.storage.put(forgedChain.session, forgedChain.sessionText),
    Fake.storage.put(forgedChain.owed, forgedChain.owedText),
  )
  .reload({ reattach: false })
  .checkpoint("booted")
  .ensure(badge)
  .checkpoint("restored");
