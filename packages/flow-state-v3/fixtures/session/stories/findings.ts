import { Fake } from "../../../src/host/testing/index.ts";
import { badge } from "../app.ts";
import { workspaceStory } from "./usual.ts";

/**
 * The session's record in the middle of the badge's chain (an org provides the session, which
 * provides the team, which provides the badge), with its org slot bound to a local actor, beside
 * an owed sign-in ending that wakes the session at the boot: as a damaged disk could leave them.
 */
export const forgedChain = {
  session: "actor/Workspace/Session/main",
  sessionText:
    '{"context":{"org":{"machine":"Workspace/Org","name":"~1"}},"format":3,"graph":{"Workspace/Org/~1":{}},"machine":"Workspace/Session","memories":[],"memory":{"displayName":"ada","notice":"","user":"ada"},"name":"main","reactions":[],"schedules":[],"seen":{"org":"Acme"},"state":"SIGNED_IN"}',
  owed: "owed/Workspace/Session/main",
  owedText:
    '{"format":3,"machine":"Workspace/Session","name":"main","rows":[{"attempt":null,"channel":"unknown","kept":false,"lane":null,"operation":"signIn","reason":"Restored","value":null}]}',
} as const;

/**
 * The badge's chain is running; then the session's record is replaced by one bound to a local org
 * beside an owed ending, and the tab reloads and ensures the badge, the deepest node: the session's
 * record is set aside and reported, no local org starts, the session hears its owed ending and the
 * chain runs. Until records decode their bindings it breaks a run rule, so it is a builder its test
 * runs; the manifest registers it once it passes.
 */
export const chainBoundToLocal = () =>
  workspaceStory("session/chain-bound-to-local")
    .ensure(badge)
    .world(
      Fake.storage.put(forgedChain.session, forgedChain.sessionText),
      Fake.storage.put(forgedChain.owed, forgedChain.owedText),
    )
    .reload({ reattach: false })
    .checkpoint("booted")
    .ensure(badge)
    .checkpoint("restored");
