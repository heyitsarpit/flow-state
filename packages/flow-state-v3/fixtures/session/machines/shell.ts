import { Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";
import { profile, teams } from "../operations/reads.ts";
import { renameTeam } from "../operations/writes.ts";

/**
 * The shell's profile and team names: the user shown, their display name and the org's teams as
 * last read; signing out clears what was read.
 */
export const Shell = definition({
  id: "Workspace/Shell",
  states: ["SIGNED_IN", "SIGNED_OUT"],
  events: {
    Refresh: {},
    Rename: { team: Schema.String, name: Schema.String },
    SignOut: {},
    SignIn: {},
  },
  internalEvents: {
    Profiled: { name: Schema.String },
    Teamed: { names: Schema.Record(Schema.String, Schema.String) },
    Unread: {},
    Renamed: {},
    RenameUnsure: Flow.uncertain({}),
  },
  memory: {
    user: Flow.initial(Schema.String, "ada"),
    org: Flow.initial(Schema.String, "acme"),
    name: Flow.initial(Schema.String, ""),
    teams: Flow.initial(Schema.Record(Schema.String, Schema.String), {}),
    notice: Flow.initial(Schema.String, ""),
  },
  operations: ({ E }) => ({
    profile: profile.outcomes({
      value: E.Profiled.from((v) => ({ name: v.name })),
      failure: { NoAnswer: E.Unread, Defect: E.Unread, Interrupted: E.Unread },
    }),
    teams: teams.outcomes({
      value: E.Teamed.from((v) => ({ names: v.names })),
      failure: { NoAnswer: E.Unread, Defect: E.Unread, Interrupted: E.Unread },
    }),
    renameTeam: renameTeam.outcomes(
      { success: E.Renamed, failure: {}, unknown: E.RenameUnsure },
      {
        writes: ({ value }) => [
          teams.update({ org: value.org ?? "" }, (current) => ({
            ...current,
            names: { ...current.names, [value.team]: value.name },
          })),
        ],
      },
    ),
  }),
});

/**
 * Signed in, the shell places the profile and the teams; a refresh reads the profile again; a
 * rename shows at once as an optimistic team name; signing out clears the profile off the device.
 */
export const ShellMachine = machine(Shell, ({ S, O }) => ({
  default: S.SIGNED_IN,
  states: {
    SIGNED_IN: {
      activities: [
        O.profile.subscribe(({ memory }) => ({ user: memory.user })),
        O.teams.subscribe(({ memory }) => ({ org: memory.org })),
      ],
      on: {
        Profiled: { updateMemory: ({ event }) => ({ name: event.name }) },
        Teamed: { updateMemory: ({ event }) => ({ teams: event.names }) },
        Unread: { updateMemory: () => ({ notice: "workspace unavailable" }) },
        Refresh: { actions: [O.profile.refetch] },
        Rename: {
          actions: [
            O.renameTeam.commit(
              ({ memory, event }) => ({ org: memory.org, team: event.team, name: event.name }),
              {
                optimistic: ({ memory, event }) => [
                  teams.update({ org: memory.org }, (current) => ({
                    ...current,
                    names: { ...current.names, [event.team]: event.name },
                  })),
                ],
              },
            ),
          ],
        },
        RenameUnsure: { updateMemory: () => ({ notice: "rename may not have saved" }) },
        SignOut: {
          target: S.SIGNED_OUT,
          updateMemory: () => ({ name: "", teams: {} }),
          actions: [O.profile.clear(({ memory }) => ({ user: memory.user }))],
        },
      },
    },
    SIGNED_OUT: { on: { SignIn: S.SIGNED_IN } },
  },
}));
