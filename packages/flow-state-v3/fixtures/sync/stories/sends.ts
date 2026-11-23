import { samplesOf, Story } from "../../../src/host/testing/index.ts";
import { RuntimeDefaults } from "../../../src/index.ts";
import {
  client,
  docsRepo,
  gitMirroredSetup,
  mirrorA,
  mirrorB,
  mirrorOf,
  replicaA,
  replicaB,
  statusA,
} from "../app.ts";
import { Mirror, Replica } from "../machines/mirror.ts";
import { Repo } from "../machines/repo.ts";
import { GitFake } from "../../services/git/server/layer.ts";
import { Git } from "../../services/git/server/git.ts";

/**
 * The Git app with push mirrors over its port fake, with no steps yet: every Story of a mirror or a
 * repository's sends starts here.
 */
export const mirrorStory = (id: string) => Story.app(gitMirroredSetup, { id, fixtures: [GitFake] });

/**
 * A commit's full name, as a push carries it.
 */
export const SHA = "0123456789abcdef0123456789abcdef01234567";

/**
 * A push of `SHA` that has travelled `hops` hops.
 */
export const push = (hops: number) => Mirror.E.Push({ sha: SHA, hops });

/**
 * The docs repository is opened on the main client; a commit is made, then the host reports a
 * push.
 */
export const repoCommits = mirrorStory("sync/repo-commits")
  .ensure(client)
  .ensure(docsRepo)
  .send(docsRepo, Repo.E.Commit())
  .checkpoint("committed")
  .send(docsRepo, Repo.E.PushSeen())
  .checkpoint("pushed");

/**
 * Two mirrors are set up to forward to each other, a misconfiguration, with a time to live far past
 * the loop guard; a push reaches the first.
 */
export const mirrorLoop = mirrorStory("sync/mirror-loop")
  .ensure(mirrorA)
  .ensure(mirrorB)
  .send(mirrorA, Mirror.E.Link({ upstream: "b", maxHops: RuntimeDefaults.loopGuard + 10 }))
  .send(mirrorB, Mirror.E.Link({ upstream: "a", maxHops: RuntimeDefaults.loopGuard + 10 }))
  .send(mirrorA, push(0))
  .checkpoint("stopped");

/**
 * Two mirrors forward to each other with a time to live of exactly the loop guard, while a status
 * line reads the first mirror's count as context; a push reaches the first.
 */
export const mirrorChainWithStatus = mirrorStory("sync/mirror-chain-with-status")
  .ensure(mirrorA)
  .ensure(mirrorB)
  .ensure(statusA)
  .send(mirrorA, Mirror.E.Link({ upstream: "b", maxHops: RuntimeDefaults.loopGuard }))
  .send(mirrorB, Mirror.E.Link({ upstream: "a", maxHops: RuntimeDefaults.loopGuard }))
  .send(mirrorA, push(0))
  .checkpoint("arrived");

/**
 * A mirror forwards to another; someone imports a branch name where a commit's full name belongs.
 */
export const mirrorImportsRef = mirrorStory("sync/mirror-imports-ref")
  .ensure(mirrorA)
  .ensure(mirrorB)
  .send(mirrorA, Mirror.E.Link({ upstream: "b", maxHops: 10 }))
  .send(mirrorA, Mirror.E.Import({ ref: "main" }))
  .checkpoint("imported");

/**
 * A replica of the first mirror pushes each commit that mirror takes to the second, and the second
 * forwards to the first, a misconfiguration, each with a limit far past the loop guard; a push
 * reaches the first.
 */
export const replicaLoop = mirrorStory("sync/replica-loop")
  .ensure(mirrorA)
  .ensure(mirrorB)
  .ensure(replicaA)
  .send(mirrorB, Mirror.E.Link({ upstream: "a", maxHops: RuntimeDefaults.loopGuard + 10 }))
  .send(replicaA, Replica.E.Follow({ upstream: "b", maxPushes: RuntimeDefaults.loopGuard + 10 }))
  .send(mirrorA, push(0))
  .checkpoint("stopped");

const FAR = RuntimeDefaults.loopGuard + 10;

/**
 * A replica's link: it pushes each commit its mirror takes to `upstream`, far past the loop guard.
 */
export const follow = (upstream: string) => Replica.E.Follow({ upstream, maxPushes: FAR });

/**
 * Two replicas follow the first mirror, which forwards nowhere; each pushes every commit it takes
 * to the second mirror, which forwards to the first, a misconfiguration; a host push reaches the
 * first.
 */
export const replicasLoop = mirrorStory("sync/replicas-loop")
  .ensure(mirrorA)
  .ensure(mirrorB)
  .ensure(replicaA)
  .ensure(replicaB)
  .send(mirrorB, Mirror.E.Link({ upstream: "a", maxHops: FAR }))
  .send(replicaA, follow("b"))
  .send(replicaB, follow("b"))
  .send(mirrorA, push(0))
  .checkpoint("stopped");

/**
 * Two replicas follow the first mirror, each feeding its own pair of mirrors that forward to each
 * other, a misconfiguration; a host push reaches the first mirror.
 */
export const replicaPairs = mirrorStory("sync/replica-pairs")
  .ensure(mirrorA)
  .ensure(replicaA)
  .ensure(replicaB)
  .ensure(mirrorOf("b"))
  .ensure(mirrorOf("c"))
  .ensure(mirrorOf("d"))
  .ensure(mirrorOf("e"))
  .send(mirrorOf("b"), Mirror.E.Link({ upstream: "c", maxHops: FAR }))
  .send(mirrorOf("c"), Mirror.E.Link({ upstream: "b", maxHops: FAR }))
  .send(mirrorOf("d"), Mirror.E.Link({ upstream: "e", maxHops: FAR }))
  .send(mirrorOf("e"), Mirror.E.Link({ upstream: "d", maxHops: FAR }))
  .send(replicaA, follow("b"))
  .send(replicaB, follow("d"))
  .send(mirrorA, push(0))
  .checkpoint("stopped");

const commit = Repo.E.Commit();

const pushSeen = Repo.E.PushSeen();

const linkB = Mirror.E.Link({ upstream: "b", maxHops: 3 });

const linkA = Mirror.E.Link({ upstream: "a", maxHops: 3 });

const linkNowhere = Mirror.E.Link({ upstream: "", maxHops: 3 });

const pushed = push(0);

const pushedAtLive = push(3);

const importSha = Mirror.E.Import({ ref: SHA });

const importRef = Mirror.E.Import({ ref: "main" });

const followB = Replica.E.Follow({ upstream: "b", maxPushes: 3 });

const followNowhere = Replica.E.Follow({ upstream: "", maxPushes: 3 });

const followNoPushes = Replica.E.Follow({ upstream: "b", maxPushes: 0 });

/**
 * What a developer and the host can do around a repository and two mirrors, for generated runs:
 * commit and report a push; link a mirror (to nothing among them), push at no hops and at the time
 * to live, and import a commit or a branch name; have a replica of the first push on to the second,
 * to nothing among them, or with no pushes allowed; the host rate-limits.
 */
export const mirrorSamples = samplesOf({
  id: "git-mirrors",
  story: mirrorStory("git-mirrors/samples").ensure(client),
  names: { setup: "gitMirroredSetup", fixtures: ["GitFake"] },
  actors: { client, docsRepo, mirrorA, mirrorB, statusA, replicaA },
  servers: { Git },
  failures: [Git.rateLimit({ retryAfterMs: 0 })],
  landedFailures: [],
  values: {
    commit,
    pushSeen,
    linkB,
    linkA,
    linkNowhere,
    pushed,
    pushedAtLive,
    importSha,
    importRef,
    followB,
    followNowhere,
    followNoPushes,
  },
  controls: [],
  steps: (story) =>
    story
      .send(docsRepo, commit)
      .send(mirrorA, linkB)
      .send(mirrorB, linkA)
      .send(mirrorA, linkNowhere)
      .send(mirrorA, pushed)
      .send(mirrorA, pushedAtLive)
      .send(mirrorA, importSha)
      .send(mirrorA, importRef)
      .send(replicaA, followB)
      .send(replicaA, followNowhere)
      .send(replicaA, followNoPushes)
      .send(docsRepo, pushSeen),
});
