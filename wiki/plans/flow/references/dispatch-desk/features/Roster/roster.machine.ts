// The roster admin's behaviour. Reads are placed at the root for the actor's life; writes start on the admin's
// events and every holding write's endings are handled at the root, because a new incarnation can adopt a lane in
// any leaf (rule 44): a merge started before the admin left the screen lands on the next roster screen.
//
// Where an unknown ending goes, per write (rule 45: every hold has an owner):
//   move, setSkills, remove  re-sent once at once as the same Attempt, then released (the record stays uncertain)
//   rename                   held: the row shows a retry chip; RetryRename re-sends, DismissRename releases
//   merge                    held: the footer lists it as pending; it re-sends once, then the admin is told
//   invite                   re-sent twice, then the draft says "may exist"
//   inviteEmail (`allow`)    re-sent once in its own ending's turn, never held
//   rebuild (unkeyed)        released at once: rebuilding twice is harmless
import { deny, machine } from "flow-state";
import { AUDIT_KEPT, MAX_SKILLS, Roster } from "./roster.definition.js";

type Memory = typeof Roster.Memory.Type;

const workspace = ({ memory }: { memory: Memory }) => ({ workspaceId: memory.workspaceId });

const technician = ({ memory, event }: { memory: Memory; event: { technicianId: string } }) => ({
  workspaceId: memory.workspaceId,
  technicianId: event.technicianId,
});

// Every write is an admin's (F22): a dispatcher sees the roster and the buttons, disabled, with this reason.
const isAdmin = ({ context }: { context: { isAdmin: boolean } }) =>
  context.isAdmin || deny("NotAdmin");

const editInvite = (
  memory: Memory,
  draftId: string,
  change: Partial<Memory["inviting"][number]>,
) => ({
  inviting: memory.inviting.map((d) => (d.draftId === draftId ? { ...d, ...change } : d)),
});

export const RosterMachine = machine(Roster, ({ S, E, O }) => {
  const roster = O.roster.subscribe(({ memory }) => ({
    workspaceId: memory.workspaceId,
    teamId: memory.teamId,
    locale: memory.locale,
  }));

  const pagedRoster = ({ memory }: { memory: Memory }) => ({
    workspaceId: memory.workspaceId,
    teamId: memory.teamId,
    locale: memory.locale,
  });

  return {
    default: S.ROSTER,

    activities: [
      roster,
      O.teams.subscribe(workspace),
      O.teamSizes.subscribe(workspace),
      O.customers.subscribe(workspace),
      // one SDK session per technician on the loaded pages; keys follow paging and team changes
      O.online.subscribe.each(({ memory, operations }) =>
        (operations.roster?.data?.flatMap((page) => page.technicians) ?? []).map((t) => ({
          workspaceId: memory.workspaceId,
          technicianId: t.technicianId,
        })),
      ),
      // both readers of the polled change log, for the actor's life
      O.changes.subscribe(workspace, { when: ({ memory }) => !memory.feedPaused }),
      O.audit.subscribe(workspace, { when: ({ memory }) => !memory.feedPaused }),
    ],

    on: {
      TeamChosen: { target: "self", updateMemory: ({ event }) => ({ teamId: event.teamId }) },
      // PROPOSED, not decided: `more` on a paged live read is the plan's (gap 23).
      LoadMore: { target: "self", actions: [O.roster.more(pagedRoster)] },
      DismissNotice: { target: "self", updateMemory: () => ({ notice: "" }) },
      Refresh: {
        target: "self",
        actions: [O.teams.refetch(workspace), O.roster.refetch(pagedRoster)],
      },

      Move: {
        target: "self",
        guard: [
          isAdmin,
          ({ event }) => event.from !== event.to || deny("SameTeam"),
          O.move.idle(technician),
        ],
        actions: [
          O.move.commit(({ memory, event }) => ({
            ...technician({ memory, event }),
            from: event.from,
            to: event.to,
          })),
        ],
      },
      Rename: {
        target: "self",
        guard: [
          isAdmin,
          ({ event }) => event.name.trim() !== "" || deny("EmptyName"),
          O.rename.idle(technician),
        ],
        actions: [
          O.rename.commit(({ memory, event }) => ({
            ...technician({ memory, event }),
            name: event.name,
          })),
        ],
      },
      // The row's retry chip: the same Attempt, within a budget. Dismiss releases it; the mark stays (rule 32).
      RetryRename: {
        target: "self",
        guard: [O.rename.retryable(technician, { times: 3 })],
        actions: [O.rename.retry(technician)],
      },
      DismissRename: { target: "self", actions: [O.rename.cancel(technician)] },
      Remove: {
        target: "self",
        guard: [isAdmin, O.remove.idle(technician)],
        actions: [O.remove.commit(technician)],
      },
      // One event per invitee ("Invite all" sends one each), so one commit, one Attempt and one lane per draft.
      // Batching is below the commit: the adapter's `RequestResolver` waits 10 ms and sends every invite that
      // arrived meanwhile in one request (MD 2.7.11), so the machine never knows how many went together.
      Invite: {
        target: "self",
        guard: [
          isAdmin,
          ({ memory, event }) =>
            !memory.inviting.some((d) => d.draftId === event.draftId) || deny("DuplicateDraft"),
        ],
        updateMemory: ({ memory, event }) => ({
          inviting: [
            ...memory.inviting,
            { ...event, status: "sending" as const, reason: null, technicianId: null },
          ],
        }),
        actions: [
          O.invite.commit(({ memory, event }) => ({
            workspaceId: memory.workspaceId,
            draftId: event.draftId,
            name: event.name,
            email: event.email,
          })),
        ],
      },
      ResendInviteEmail: {
        target: "self",
        guard: [isAdmin],
        actions: [O.inviteEmail.commit(technician)], // `allow`: several at once, each its own Attempt
      },
      RebuildIndex: {
        target: "self",
        guard: [isAdmin, O.rebuild.idle], // unkeyed: one lane for this actor, named without a key
        actions: [O.rebuild.commit(workspace)],
      },

      // Endings, at the root.
      Changed: { target: "self" },
      Refused: { target: "self", updateMemory: ({ event }) => ({ notice: event.notice }) },
      MoveUnsure: [
        { target: "self", guard: [O.move.retryable({ times: 1 })], actions: [O.move.retry] },
        {
          target: "self",
          updateMemory: () => ({ notice: "We couldn't confirm that move" }),
          actions: [O.move.cancel],
        },
      ],
      RenameUnsure: { target: "self" }, // held; the row's retry chip owns it (RetryRename, DismissRename)
      SkillsUnsure: [
        {
          target: "self",
          guard: [O.setSkills.retryable({ times: 1 })],
          actions: [O.setSkills.retry],
        },
        { target: "self", actions: [O.setSkills.cancel] },
      ],
      RemoveUnsure: [
        { target: "self", guard: [O.remove.retryable({ times: 1 })], actions: [O.remove.retry] },
        {
          target: "self",
          updateMemory: () => ({ notice: "We couldn't confirm that removal" }),
          actions: [O.remove.cancel],
        },
      ],
      Merged: { target: "self", updateMemory: () => ({ notice: "Customers merged" }) },
      MergeRefused: {
        target: "self",
        updateMemory: ({ event }) => ({ notice: `Not merged: ${event.reason}` }),
      },
      // The merge may have happened: the records stay predicted and uncertain, and their repair is forced (E17).
      MergeUnsure: [
        { target: "self", guard: [O.merge.retryable({ times: 1 })], actions: [O.merge.retry] },
        {
          target: "self",
          updateMemory: () => ({
            notice: "We couldn't confirm the merge. Check both customers before trying again.",
          }),
          actions: [O.merge.cancel],
        },
      ],
      Invited: {
        target: "self",
        updateMemory: ({ memory, event }) =>
          editInvite(memory, event.draftId, {
            status: "invited",
            technicianId: event.technicianId,
          }),
      },
      InviteRefused: {
        target: "self",
        updateMemory: ({ memory, event }) =>
          editInvite(memory, event.draftId, { status: "failed", reason: event.reason }),
      },
      InviteUnsure: [
        { target: "self", guard: [O.invite.retryable({ times: 2 })], actions: [O.invite.retry] },
        {
          target: "self",
          updateMemory: ({ memory, event }) =>
            editInvite(memory, event.draftId, { status: "unsure" }),
          actions: [O.invite.cancel],
        },
      ],
      EmailSent: { target: "self" },
      // `allow`: key-less retry only here, in this ending's own turn (rule N2). Nothing is held after it.
      EmailUnsure: [
        {
          target: "self",
          guard: [O.inviteEmail.retryable({ times: 1 })],
          actions: [O.inviteEmail.retry],
        },
        {
          target: "self",
          updateMemory: () => ({ notice: "An invite email may not have gone out" }),
        },
      ],
      IndexRebuilt: { target: "self" },
      IndexUnsure: { target: "self", actions: [O.rebuild.cancel] }, // unkeyed: names the one lane

      // the audit log. Delivery is at least once, so it stores by `seq`.
      Change: {
        target: "self",
        updateMemory: ({ memory, event }) => ({
          audit: [...memory.audit.filter((c) => c.seq !== event.change.seq), event.change].slice(
            -AUDIT_KEPT,
          ),
        }),
      },
      // A first open owes nothing (Streams T2), so this is a real gap: `Unproven`, `Lost` or `Reset`.
      MayHaveMissed: {
        target: "self",
        updateMemory: () => ({ notice: "Some roster changes may be missing from the log" }),
      },
      // The poll's budget is spent. The desk feed waits and re-opens on a timer (its RETRY_WAIT); the roster asks the
      // admin instead: its placements are switched off by `when`, and Resume places them again (rule 25: Flow
      // never re-opens a session; a placement that starts again does).
      FeedEnded: {
        target: "self",
        updateMemory: () => ({ feedPaused: true, notice: "Live roster updates paused" }),
      },
      ResumeFeed: { target: "self", updateMemory: () => ({ feedPaused: false, notice: "" }) },
    },

    states: {
      ROSTER: {
        default: S.ROSTER.BROWSING,
        on: {
          // The dialog takes both customers; their tickets are read while it is open (one session per customer).
          MergeRequested: {
            target: S.MERGING,
            guard: [
              isAdmin,
              ({ event }) => event.first !== event.second || deny("SameCustomer"),
              O.merge.idle(({ memory, event }) => ({
                workspaceId: memory.workspaceId,
                mergedId: event.second,
              })),
            ],
            updateMemory: ({ event }) => ({
              mergePair: { first: event.first, second: event.second },
            }),
          },
        },
        states: {
          BROWSING: {
            on: {
              EditSkills: {
                target: S.ROSTER.SKILLS,
                guard: [isAdmin],
                updateMemory: ({ event }) => ({ skillsFor: event.technicianId, skillsDraft: [] }),
              },
            },
          },
          // The form's chips: one `SkillChip` copy per entry of `skillsDraft` (rule 9: membership is host data).
          SKILLS: {
            traits: {
              chips: {
                input: ({ item }) => ({ skill: item }),
                callbacks: {
                  onRemove: {
                    updateMemory: ({ memory, payload }) => ({
                      skillsDraft: memory.skillsDraft.filter((s) => s !== payload.skill),
                    }),
                  },
                },
              },
            },
            on: {
              AddSkill: {
                target: "self",
                guard: [
                  ({ memory }) => memory.skillsDraft.length < MAX_SKILLS || deny("TooManySkills"),
                  ({ memory, event }) =>
                    !memory.skillsDraft.includes(event.skill) || deny("AlreadyListed"),
                ],
                updateMemory: ({ memory, event }) => ({
                  skillsDraft: [...memory.skillsDraft, event.skill],
                }),
              },
              SaveSkills: {
                target: S.ROSTER.BROWSING,
                guard: [({ memory }) => memory.skillsFor !== null || deny("NoTechnician")],
                actions: [
                  O.setSkills.commit(({ memory }) => ({
                    workspaceId: memory.workspaceId,
                    technicianId: memory.skillsFor ?? "",
                    skills: memory.skillsDraft,
                  })),
                ],
                updateMemory: () => ({ skillsFor: null }),
              },
              CloseSkills: {
                target: S.ROSTER.BROWSING,
                updateMemory: () => ({ skillsFor: null, skillsDraft: [] }),
              },
            },
          },
        },
      },
      // The subroutine's filling: its input, and both exits. `Merge` carries the survivor; the commit's select reads
      // the merged customer's tickets from the read placed for this state (rule 22: selects see the lanes).
      MERGING: {
        input: ({ event }) => ({ first: event.first, second: event.second }),
        activities: [
          O.mergedTickets.subscribe.each(({ memory }) =>
            memory.mergePair === null
              ? []
              : [memory.mergePair.first, memory.mergePair.second].map((customerId) => ({
                  workspaceId: memory.workspaceId,
                  customerId,
                })),
          ),
        ],
        exits: {
          Merge: {
            target: S.ROSTER,
            updateMemory: () => ({ mergePair: null }),
            actions: [
              O.merge.commit(({ memory, payload, operations }) => ({
                workspaceId: memory.workspaceId,
                survivorId: payload.survivorId,
                mergedId: payload.mergedId,
                tickets: (
                  O.mergedTickets.get(operations, {
                    workspaceId: memory.workspaceId,
                    customerId: payload.mergedId,
                  })?.data ?? []
                ).map((ticket) => ({ workspaceId: ticket.workspaceId, ticketId: ticket.ticketId })),
              })),
            ],
          },
          Cancelled: { target: S.ROSTER, updateMemory: () => ({ mergePair: null }) },
        },
      },
    },
  };
});
