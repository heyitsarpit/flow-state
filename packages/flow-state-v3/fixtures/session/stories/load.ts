import type { Story } from "../../../src/host/testing/index.ts";
import { wallAvatar } from "../app.ts";
import { acme, coreTeam, mainSession, wallBadge } from "../machine.ts";
import { grownStory } from "./structure.ts";

const ping = { _tag: "Ping" } as const;

// A wall of `count` badges on the core team; the team is renamed, then every badge is pinged twice
// in a burst.
const wall = (id: string, count: number) => {
  const badges = Array.from({ length: count }, (_, n) => wallBadge(n));

  const built = badges.reduce<Story>(
    (s, b) => s.ensure(b),
    grownStory(id).ensure(acme).ensure(mainSession).ensure(coreTeam),
  );

  const renamed = built.send(coreTeam, { _tag: "Rename", name: "Platform" }).checkpoint("renamed");

  return [...badges, ...badges].reduce((s, b) => s.send(b, ping), renamed).checkpoint("pinged");
};

/**
 * 64 badges on one team, renamed, then pinged in a burst.
 */
export const wall64 = wall("session/wall-64", 64);

/**
 * 1,024 badges on one team, renamed, then pinged in a burst. A stress Story, built on call and kept
 * out of `stories`: its 3,000 steps are too long for the CLI's runs and the reload sweep.
 */
export const stressWall1024 = () => wall("session/stress-wall-1024", 1024);

/**
 * 65 header avatars on the main session; Ada signs in, so one admitted event adds 65 context
 * updates and 65 onContext events.
 */
export const avatarWall65 = Array.from({ length: 65 }, (_, n) => wallAvatar(n))
  .reduce<Story>((s, a) => s.ensure(a), grownStory("session/avatar-wall-65").ensure(acme))
  .ensure(mainSession)
  .send(mainSession, { _tag: "SignIn", user: "ada" })
  .checkpoint("signed in");
