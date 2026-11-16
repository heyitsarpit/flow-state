import { actorRef, app, runtimeSetup } from "../../src/index.ts";
import { IdentityLive } from "./identity-http.ts";
import {
  acme,
  BadgeMachine,
  coreTeam,
  mainSession,
  OrgMachine,
  SessionMachine,
  TeamMachine,
} from "./machine.ts";
import { AvatarMachine } from "./machines/avatar.ts";
import { StatusMachine } from "./machines/status.ts";

/**
 * The header avatar of the main session.
 */
export const mainAvatar = actorRef(AvatarMachine, "avatar");

/**
 * A status line whose ref names no team.
 */
export const teamStatus = actorRef(StatusMachine, "status");

/**
 * The workspace grown with the header avatar and team status lines around its four layers.
 */
export const workspaceGrown = app({
  id: "workspace",
  machines: {
    org: OrgMachine,
    session: { machine: SessionMachine, context: { org: acme } },
    team: { machine: TeamMachine, context: { user: mainSession } },
    badge: { machine: BadgeMachine, context: { team: coreTeam } },
    avatar: { machine: AvatarMachine, context: { user: mainSession } },
    status: StatusMachine,
  },
});

/**
 * The grown workspace's real setup: the identity provider over HTTP, persisted, each capture
 * written at once.
 */
export const workspaceGrownSetup = runtimeSetup({
  app: workspaceGrown,
  services: IdentityLive("https://id.example"),
  scope: "workspace",
  persistence: { captureMs: 0 },
});
