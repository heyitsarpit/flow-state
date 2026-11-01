// What the roster contracts mean for shared records. Three entities with relations in one domain: a `Technician`
// belongs to a `Team` (its `teamId` names one), and a ticket names a `Customer` (`Ticket.customerId`).
//
// How this domain differs from the desk's others (COVERAGE.md 5.2): writes that change several entities at once
// and say so (a move `.alsoChanges` both teams' counts; a merge predicts a delete, a patch and N re-pointed tickets
// across two entities); a condition that admits a null (`isNull(teamId)`: the unplaced technicians); a derived
// read (technicians per team); and pushes that arrive from a polled log, not a socket.
import { and, asc, domain, entity, eq, isNull, listen, or, read, write } from "flow-state"; // pending merge 6: listen
import { Ticket } from "../Tickets/ticket.domain.js";
import { CustomerRow, TeamRow, TechnicianRow } from "./roster-api.js";
import {
  customersOf,
  inviteTechnician,
  mergeCustomers,
  moveTechnician,
  removeTechnician,
  renameTechnician,
  rosterOf,
  setSkills,
  teamSizesOf,
  teamsOf,
  technicianById,
  technicianChanges,
} from "./roster.contracts.js";

export const Technician = entity({
  id: "DispatchDesk/Technician",
  fields: TechnicianRow.fields,
  primaryKey: ["workspaceId", "technicianId"],
  version: "revision",
});

export const Team = entity({
  id: "DispatchDesk/Team",
  fields: TeamRow.fields,
  primaryKey: ["workspaceId", "teamId"],
  version: "revision",
});

export const Customer = entity({
  id: "DispatchDesk/Customer",
  fields: CustomerRow.fields,
  primaryKey: ["workspaceId", "customerId"],
  version: "revision",
});

const techKey = (input: { workspaceId: string; technicianId: string }) => ({
  workspaceId: input.workspaceId,
  technicianId: input.technicianId,
});

const team = (workspaceId: string, teamId: string) => ({ workspaceId, teamId });

export const RosterDomain = domain("roster", {
  technicianById: read(technicianById)
    .one(Technician)
    .byKey(({ input }) => techKey(input)),

  // My team, or nobody's yet (M5-D7: `isNull` is "yes" for a null, never "maybe"). Ordered by team, then name, then
  // the key: a null `teamId` pair is skipped (M5-D4), and names are strings, which the client never compares, so a
  // response is checked only on its key ties (entity-domain 4.4).
  // design gap: COVERAGE.md E19 names `.ignoring(lastSeenAt)`. `.ignoring` takes inputs (entity-domain 2.1); a field
  // that is neither a condition nor an order field repairs nothing already (2.3), so `lastSeenAt` churn needs no
  // word. What `.ignoring` is for here is the `locale` input, which changes neither membership nor order.
  roster: read(rosterOf)
    .list(Technician, ({ output }) => output.technicians)
    .where(({ input, record }) =>
      and(
        eq(record.workspaceId, input.workspaceId),
        or(eq(record.teamId, input.teamId), isNull(record.teamId)),
      ),
    )
    .orderBy(({ record }) => [
      asc(record.teamId),
      asc(record.name),
      asc(record.workspaceId),
      asc(record.technicianId),
    ])
    .ignoring(({ input }) => [input.locale])
    .pagedBy(
      ({ input }) => input.page,
      ({ output }) => output.nextPage,
    ),

  teams: read(teamsOf)
    .list(Team, ({ output }) => output)
    .where(({ input, record }) => eq(record.workspaceId, input.workspaceId))
    .orderBy(({ record }) => [asc(record.name), asc(record.workspaceId), asc(record.teamId)]),

  // A count the server computes from records it does not return: it repairs when a technician enters or leaves a
  // team (`teamId` changes) or the workspace, and on nothing else (E15).
  teamSizes: read(teamSizesOf)
    .derivedFrom(Technician, ({ record }) => [record.teamId])
    .where(({ input, record }) => eq(record.workspaceId, input.workspaceId)),

  customers: read(customersOf)
    .list(Customer, ({ output }) => output)
    .where(({ input, record }) => eq(record.workspaceId, input.workspaceId))
    .orderBy(({ record }) => [asc(record.name), asc(record.workspaceId), asc(record.customerId)]),

  // A move changes the technician, and the server changes both teams' counts, which the response does not carry.
  // So both counts are declared targets and predicted with field functions over the record beneath (merge 5),
  // which replay over every new base (E11, E14): another admin's move meanwhile is still -1 and +1 from there.
  move: write(moveTechnician)
    .one(Technician)
    .alsoChanges(({ input }) => [
      Team.fields(team(input.workspaceId, input.from), ({ record }) => [record.technicianCount]),
      Team.fields(team(input.workspaceId, input.to), ({ record }) => [record.technicianCount]),
    ])
    .predicts(({ input }) => [
      Technician.patch(techKey(input), { teamId: input.to }),
      Team.patch(team(input.workspaceId, input.from), {
        technicianCount: (beneath) => beneath.technicianCount - 1,
      }),
      Team.patch(team(input.workspaceId, input.to), {
        technicianCount: (beneath) => beneath.technicianCount + 1,
      }),
    ]),

  rename: write(renameTechnician)
    .one(Technician)
    .predicts(({ input }) => Technician.patch(techKey(input), { name: input.name })),

  setSkills: write(setSkills)
    .one(Technician)
    .predicts(({ input }) => Technician.patch(techKey(input), { skills: input.skills })),

  // A remove hides the technician everywhere; a 409 (open tickets) brings the row back in place (E3).
  remove: write(removeTechnician).predicts(({ input }) => Technician.delete(techKey(input))),

  // The merge: two entities and many records in one write (E2). The merged customer is deleted, the survivor's
  // count grows by the tickets moved, and every listed ticket is re-pointed. `input.tickets` is an array of keys,
  // so the domain records that patch as `many` and predicts each listed ticket once (rule 34, M5-D9). An unknown
  // ending keeps all of it predicted, marks every record uncertain and forces their repair (E17).
  merge: write(mergeCustomers)
    .one(Customer)
    .predicts(({ input }) => [
      Customer.delete({ workspaceId: input.workspaceId, customerId: input.mergedId }),
      Customer.patch(
        { workspaceId: input.workspaceId, customerId: input.survivorId },
        { ticketCount: (beneath, input) => beneath.ticketCount + input.tickets.length },
      ),
      Ticket.patch(input.tickets, { customerId: input.survivorId }),
    ]),

  // An invite creates a technician: a draft in the admin's memory until the roster holds the server's id (E13).
  invite: write(inviteTechnician).one(Technician),
});

// The polled change log, into the store (pending merge 6, M6 2.8). Versions decide duplicates: the poll replays
// from its start on every session, and a change the client already holds changes nothing.
export const RosterFeed = domain("roster-feed", {
  changes: listen(technicianChanges).as([Technician], (change) =>
    change._tag === "TechnicianRemoved"
      ? Technician.delete(techKey(change), { version: change.revision })
      : Technician.save(change.technician),
  ),
});
