import { actorRef, app, runtimeSetup } from "../../src/index.ts";
import { IdentityLive } from "./identity-http.ts";
import {
  acme,
  guestSession,
  BadgeMachine,
  coreTeam,
  mainSession,
  OrgMachine,
  SessionMachine,
  TeamMachine,
} from "./machine.ts";
import { AvatarMachine } from "./machines/avatar.ts";
import { DigestMachine, InboxMachine, ThreadViewMachine } from "./machines/inbox.ts";
import { DotMachine, PresenceMachine } from "./machines/presence.ts";
import { BylineMachine } from "./machines/byline.ts";
import { StatusMachine } from "./machines/status.ts";

/**
 * The header avatar of the main session.
 */
export const mainAvatar = actorRef(AvatarMachine, "avatar");

/**
 * The `n`th header avatar of a wall of them, each reading the main session.
 */
export const wallAvatar = (n: number) => actorRef(AvatarMachine, `avatar-${n}`);

/**
 * The page byline of the main session and its team.
 */
export const mainByline = actorRef(BylineMachine, "byline");

/**
 * A status line whose ref names no team.
 */
export const teamStatus = actorRef(StatusMachine, "status");

/**
 * The workspace's inbox.
 */
export const mainInbox = actorRef(InboxMachine, "main");

/**
 * The header digest of the workspace's inbox.
 */
export const mainDigest = actorRef(DigestMachine, "digest");

/**
 * The thread view of the workspace's inbox.
 */
export const mainThread = actorRef(ThreadViewMachine, "thread");

/**
 * The guest's presence, whose ref binds it to the guest session instead of the default.
 */
export const guestPresence = actorRef(PresenceMachine, "guest", {
  context: { user: guestSession },
});

/**
 * The online dot beside the guest's name, whose ref binds it to the guest's presence.
 */
export const guestDot = actorRef(DotMachine, "guest-dot", { context: { online: guestPresence } });

/**
 * The workspace grown with the header avatar, the page byline, team status lines, the inbox with its
 * digest and thread view, and presence with its online dots around its four layers.
 */
export const workspaceGrown = app({
  id: "workspace",
  machines: {
    org: OrgMachine,
    session: { machine: SessionMachine, context: { org: acme } },
    team: { machine: TeamMachine, context: { user: mainSession } },
    badge: { machine: BadgeMachine, context: { team: coreTeam } },
    avatar: { machine: AvatarMachine, context: { user: mainSession } },
    byline: { machine: BylineMachine, context: { user: mainSession, team: coreTeam } },
    status: StatusMachine,
    inbox: InboxMachine,
    digest: {
      machine: DigestMachine,
      context: {
        latest: mainInbox,
        unread: mainInbox,
        owed: mainInbox,
        bySender: mainInbox,
        senders: mainInbox,
        writers: mainInbox,
        envelope: mainInbox,
        first: mainInbox,
        summary: mainInbox,
      },
    },
    thread: { machine: ThreadViewMachine, context: { thread: mainInbox } },
    presence: { machine: PresenceMachine, context: { user: mainSession } },
    dot: { machine: DotMachine, context: { online: actorRef(PresenceMachine, "main") } },
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
