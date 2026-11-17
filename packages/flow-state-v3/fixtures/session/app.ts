import { actorRef, app, runtimeSetup } from "../../src/index.ts";
import { IdentityLive } from "./adapters/identity.ts";
import { BadgeMachine } from "./machines/badge.ts";
import { OrgMachine } from "./machines/org.ts";
import { SessionMachine } from "./machines/session.ts";
import { TeamMachine } from "./machines/team.ts";
import { AvatarMachine } from "./machines/avatar.ts";
import { AgendaMachine, CalendarMachine, PeekMachine } from "./machines/agenda.ts";
import {
  ArchiveMachine,
  DigestMachine,
  InboxMachine,
  ThreadViewMachine,
  UnreadMachine,
} from "./machines/inbox.ts";
import { NestsMachine, NestViewMachine } from "./machines/nests.ts";
import { OutlineMachine, PreviewMachine } from "./machines/outline.ts";
import { DotMachine, PresenceMachine } from "./machines/presence.ts";
import { BylineMachine } from "./machines/byline.ts";
import { StatusMachine } from "./machines/status.ts";

/**
 * The organisation every session belongs to unless its ref says otherwise.
 */
export const acme = actorRef(OrgMachine, "acme");

/**
 * A second organisation: the root of a second, independent tree.
 */
export const globex = actorRef(OrgMachine, "globex");

/**
 * The workspace's own session, in the default organisation.
 */
export const mainSession = actorRef(SessionMachine, "main");

/**
 * A guest's session, whose ref puts it in the second organisation.
 */
export const guestSession = actorRef(SessionMachine, "guest", { context: { org: globex } });

/**
 * The team led by the main session, the default for every badge.
 */
export const coreTeam = actorRef(TeamMachine, "core");

/**
 * A team whose ref binds it, at the middle layer, to the guest's session instead of the default.
 */
export const guestTeam = actorRef(TeamMachine, "guests", { context: { user: guestSession } });

/**
 * A badge bound to the default team.
 */
export const badge = actorRef(BadgeMachine, "badge");

/**
 * A badge whose ref binds it to the guests' team.
 */
export const guestBadge = actorRef(BadgeMachine, "guest-badge", { context: { team: guestTeam } });

/**
 * The `n`th badge of a wall of badges, all on the default team.
 */
export const wallBadge = (n: number) => actorRef(BadgeMachine, `wall-${n}`);

/**
 * The workspace app: organisations, sessions in the default organisation, teams led by the main
 * session, and badges on the core team, unless a ref says otherwise.
 */
export const workspace = app({
  id: "workspace",
  machines: {
    org: OrgMachine,
    session: { machine: SessionMachine, context: { org: acme } },
    team: { machine: TeamMachine, context: { user: mainSession } },
    badge: { machine: BadgeMachine, context: { team: coreTeam } },
  },
});

/**
 * The workspace's real setup: the identity provider over HTTP, persisted, each capture written at
 * once. A Story never builds its services.
 */
export const workspaceSetup = runtimeSetup({
  app: workspace,
  services: IdentityLive("https://id.example"),
  scope: "workspace",
  persistence: { captureMs: 0 },
});

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
 * The unread badge of the workspace's inbox.
 */
export const mainUnread = actorRef(UnreadMachine, "unread");

/**
 * The archive beside the workspace's inbox.
 */
export const mainArchive = actorRef(ArchiveMachine, "archive");

/**
 * The workspace calendar.
 */
export const mainCalendar = actorRef(CalendarMachine, "main");

/**
 * The agenda beside the calendar, kept across reloads.
 */
export const mainAgenda = actorRef(AgendaMachine, "agenda");

/**
 * A glance at the agenda, never saved.
 */
export const agendaPeek = actorRef(PeekMachine, "peek");

/**
 * The workspace outline.
 */
export const mainOutline = actorRef(OutlineMachine, "main");

/**
 * The outline's preview.
 */
export const mainPreview = actorRef(PreviewMachine, "preview");

/**
 * The workspace's nested things.
 */
export const mainNests = actorRef(NestsMachine, "main");

/**
 * The nests' viewer.
 */
export const nestView = actorRef(NestViewMachine, "view");

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
    unread: { machine: UnreadMachine, context: { oldest: mainInbox } },
    archive: { machine: ArchiveMachine, context: { newest: mainInbox } },
    calendar: CalendarMachine,
    outline: OutlineMachine,
    nests: NestsMachine,
    nestView: {
      machine: NestViewMachine,
      context: {
        lists: mainNests,
        folders: mainNests,
        maps: mainNests,
        title: mainNests,
        tree: mainNests,
        boxed: mainNests,
      },
    },
    preview: { machine: PreviewMachine, context: { doc: mainOutline } },
    agenda: { machine: AgendaMachine, context: { days: mainCalendar } },
    peek: { machine: PeekMachine, context: { days: mainCalendar } },
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
