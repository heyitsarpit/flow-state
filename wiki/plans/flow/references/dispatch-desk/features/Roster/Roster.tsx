// The roster admin screen. Three stores are read and told apart (2.8.1): records (`Technician.get`: what every
// screen shows, with `predicted` greyed and `uncertain` as a retry chip, E9), lanes (`Roster.O.x.get`: what this
// screen has on the wire), and memory (drafts, the notice, the audit log).
// design gap: the pending-changes footer reads `runtime.unsettledWrites()` from a view through `useRuntime()`,
// which the design does not name (REVIEW gap 15); the entry's fields are the lane listing's (gap 1).
import { check } from "flow-state";
import { useActorByRef, useRuntime, useView } from "flow-state/react";
import { Customer, Team, Technician } from "./roster.domain.js";
import { Roster } from "./roster.definition.js";
import { rosterRef } from "./roster.ref.js";
import { MergeCustomers } from "./MergeCustomers.js";

const { S, E, O } = Roster;

export function RosterScreen({ workspaceId }: { workspaceId: string }) {
  const roster = useActorByRef(rosterRef(workspaceId), { input: { workspaceId } });
  const rows = useView(
    roster,
    (s) => s.operations.roster?.data?.flatMap((page) => page.technicians) ?? [],
  );
  const teams = useView(roster, (s) => s.operations.teams?.data ?? []);
  const sizes = useView(roster, (s) => s.operations.teamSizes?.data ?? {});
  const notice = useView(roster, (s) => s.memory.notice);
  const merging = useView(roster, (s) => S.MERGING.is(s));
  const canRebuild = useView(roster, (s) => check(s, E.RebuildIndex())._tag === "Allowed");

  return (
    <main aria-label="Roster">
      {notice !== "" && <p role="status">{notice}</p>}
      <nav>
        {teams.map((team) => (
          <TeamTab
            key={team.teamId}
            roster={roster}
            teamId={team.teamId}
            size={sizes[team.teamId] ?? 0}
          />
        ))}
      </nav>
      <ul>
        {rows.map((row) => (
          <RosterRow
            key={row.technicianId}
            roster={roster}
            technicianId={row.technicianId}
            workspaceId={workspaceId}
          />
        ))}
      </ul>
      <button onClick={() => roster.send(E.LoadMore())}>More</button>
      <button disabled={!canRebuild} onClick={() => roster.send(E.RebuildIndex())}>
        Rebuild index
      </button>
      {merging && <MergeCustomers roster={roster} />}
      <CustomerList roster={roster} />
      <PendingChanges />
    </main>
  );
}

function TeamTab({
  roster,
  teamId,
  size,
}: {
  roster: ReturnType<typeof useActorByRef>;
  teamId: string;
  size: number;
}) {
  const team = useView(roster, (s) =>
    Team.get(
      s,
      { workspaceId: s.memory.workspaceId, teamId },
      Team.pick("name", "technicianCount"),
    ),
  );

  return (
    <button aria-busy={team.predicted} onClick={() => roster.send(E.TeamChosen({ teamId }))}>
      {team.data?.name} ({team.data?.technicianCount ?? size})
    </button>
  );
}

// One technician: greyed while a write to it is predicted, a "?" retry chip while its rename is held.
function RosterRow({
  roster,
  workspaceId,
  technicianId,
}: {
  roster: ReturnType<typeof useActorByRef>;
  workspaceId: string;
  technicianId: string;
}) {
  const key = { workspaceId, technicianId };
  const tech = useView(roster, (s) =>
    Technician.get(s, key, Technician.pick("name", "teamId", "skills")),
  );
  const rename = useView(roster, (s) => O.rename.get(s, key));
  const online = useView(roster, (s) => O.online.get(s, key)?.value === true);
  const removable = useView(roster, (s) => check(s, E.Remove(key)));

  if (tech.data === undefined) return null; // removed, as every screen sees it

  return (
    <li style={{ opacity: tech.predicted ? 0.6 : 1 }}>
      <span aria-label={online ? "online" : "offline"}>{online ? "●" : "○"}</span> {tech.data.name}{" "}
      · {tech.data.teamId ?? "unplaced"} · {tech.data.skills.join(", ")}
      {rename.uncertain && (
        <>
          <button onClick={() => roster.send(E.RetryRename(key))}>Retry rename?</button>
          <button onClick={() => roster.send(E.DismissRename(key))}>Dismiss</button>
        </>
      )}
      <button
        disabled={removable._tag !== "Allowed"}
        title={removable._tag === "Denied" ? removable.reasons[0]?.code : undefined}
        onClick={() => roster.send(E.Remove(key))}
      >
        Remove
      </button>
      <button onClick={() => roster.send(E.EditSkills(key))}>Skills</button>
      <button onClick={() => roster.send(E.ResendInviteEmail(key))}>Resend invite</button>
    </li>
  );
}

function CustomerList({ roster }: { roster: ReturnType<typeof useActorByRef> }) {
  const customers = useView(roster, (s) => s.operations.customers?.data ?? []);

  return (
    <section aria-label="Customers">
      {customers.map((c) => (
        <CustomerLine key={c.customerId} roster={roster} customerId={c.customerId} />
      ))}
      {customers.length >= 2 && (
        <button
          onClick={() =>
            roster.send(
              E.MergeRequested({
                first: customers[0]!.customerId,
                second: customers[1]!.customerId,
              }),
            )
          }
        >
          Merge the first two
        </button>
      )}
    </section>
  );
}

function CustomerLine({
  roster,
  customerId,
}: {
  roster: ReturnType<typeof useActorByRef>;
  customerId: string;
}) {
  const customer = useView(roster, (s) =>
    Customer.get(
      s,
      { workspaceId: s.memory.workspaceId, customerId },
      Customer.pick("name", "ticketCount"),
    ),
  );

  if (customer.data === undefined) return null;

  return (
    <p aria-busy={customer.predicted}>
      {customer.data.name}: {customer.data.ticketCount} tickets{" "}
      {customer.uncertain && <em>may have changed</em>}
    </p>
  );
}

// Writes that have not settled, from every screen: a merge started here and left behind is listed until it lands.
function PendingChanges() {
  const runtime = useRuntime();
  const unsettled = runtime
    .unsettledWrites()
    .filter((write) => write.contract.startsWith("DispatchDesk/"));

  return unsettled.length === 0 ? null : (
    <footer role="status">
      {unsettled.length} change{unsettled.length === 1 ? "" : "s"} not confirmed yet
    </footer>
  );
}
