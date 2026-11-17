import { Story } from "../../../src/host/testing/index.ts";
import { Git } from "../../services/git/server/git.ts";
import { GitFake } from "../../services/git/server/layer.ts";
import { lanesGrownSetup, secondSerialize, serializeClient } from "../app.ts";

/**
 * The grown lanes app over the Git port fake, with no steps yet.
 */
export const grownStory = (id: string) => Story.app(lanesGrownSetup, { id, fixtures: [GitFake] });

const commit = (repo: string) => ({ _tag: "Commit", repo }) as const;

/**
 * Two `serialize` clients commit to the same repository; the first one's answer is lost.
 */
export const oneKeyTwoActors = grownStory("lanes/one-key-two-actors")
  .ensure(serializeClient)
  .ensure(secondSerialize)
  .world(Git.sync.drop({ at: "response" }))
  .send(serializeClient, commit("flow"))
  .send(secondSerialize, commit("flow"))
  .checkpoint("settled");

const withWork = (id: string) =>
  grownStory(id)
    .ensure(serializeClient)
    .world(Git.sync.hold())
    .send(serializeClient, commit("a"))
    .send(serializeClient, commit("a"))
    .world(Git.sync.drop({ at: "response" }))
    .send(serializeClient, commit("b"))
    .send(serializeClient, commit("c"))
    .world(Git.sync.hold({ at: "response" }))
    .send(serializeClient, commit("d"));

/**
 * The Runtime is disposed with a running head on one key, a queued commit behind it, a held lane
 * on another and a head whose answer is held on a third; the tab reloads after the disposal's
 * bound.
 */
export const disposedWithWork = withWork("lanes/disposed-with-work")
  .checkpoint("busy")
  .disposeRuntime()
  .advance("6 seconds")
  .reload()
  .checkpoint("reloaded");

/**
 * The same work when the tab reloads.
 */
export const reloadedWithWork = withWork("lanes/reloaded-with-work")
  .checkpoint("busy")
  .reload()
  .checkpoint("reloaded");
