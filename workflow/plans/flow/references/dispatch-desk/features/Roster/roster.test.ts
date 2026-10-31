// The roster's checks, read from its Stories' checkpoints (`@flow-state/vitest`, proposed; COVERAGE.md section 6;
// features/Tickets/editor/editor.test.ts says what `at` is). App Stories: every value is a read.
import { storyTest } from "@flow-state/vitest"; // NEW (proposed)
import { Story } from "flow-state/testing";
import { expect } from "vite-plus/test";
import { Desk } from "../../testing/desk.fake.js";
import { Ticket } from "../Tickets/ticket.domain.js";
import { Roster } from "./roster.definition.js";
import { Customer, Team, Technician } from "./roster.domain.js";
import {
  ana,
  audited,
  browse,
  countReplayed,
  invited,
  inviteEmails,
  merged,
  mergeOutlivesScreen,
  mergeRefused,
  mergeUnsure,
  movedTeam,
  North,
  notAdmin,
  rebuilt,
  removeRefused,
  renameUnsure,
  rosterHydrated,
  skills,
} from "./roster.story.js";

const { S, O } = Roster;

const ws = (rest: object) => ({ workspaceId: "north", ...rest });

type RosterRead =
  | {
      operations: {
        roster?: { data?: ReadonlyArray<{ technicians: ReadonlyArray<{ name: string }> }> };
      };
    }
  | undefined;

// The names on every loaded page, in the server's order.
const names = (roster: RosterRead) =>
  roster?.operations.roster?.data?.flatMap((page) => page.technicians.map((t) => t.name)) ?? [];

storyTest(browse, ({ at }) => {
  // East (Ana, Ben), then the unplaced (Eli): a null team sorts last on the server, and the client skips that pair.
  expect(names(at.roster.read(North))).toEqual(["Ana", "Ben", "Eli"]);
  expect(names(at.west.read(North))).toEqual(["Cy", "Dee", "Eli"]);
  expect(at.roster.read(North)?.operations.teamSizes?.data).toEqual({
    "team-east": 2,
    "team-west": 2,
  });
});

storyTest(movedTeam, ({ at }) => {
  const cut = at["moved-team"];
  expect(cut.read(Story.entity(Technician, ws(ana)))).toMatchObject({
    data: { teamId: "team-west" },
    predicted: true,
  });
  expect(cut.read(Story.entity(Team, ws({ teamId: "team-east" })))?.data.technicianCount).toBe(1);
  expect(cut.read(Story.entity(Team, ws({ teamId: "team-west" })))?.data.technicianCount).toBe(3);
  expect(names(cut.read(North))).toEqual(["Ben", "Eli"]); // Ana left "East and unplaced" by the prediction
  const done = at["move-confirmed"];
  expect(done.read(Story.entity(Technician, ws(ana)))?.predicted).toBe(false);
  // The counts were never in the response: they read `unconfirmed` until the confirming read lands, then not.
  expect(done.read(Story.entity(Team, ws({ teamId: "team-west" })))).toMatchObject({
    unconfirmed: [],
  });
  expect(done.read(Desk.teamSizes)).toHaveLength(2); // the first read, then the repair: `teamId` changed
});

storyTest(countReplayed, ({ at }) => {
  // The server's base after Dee's move is East 3, West 1; Ana's predicted -1/+1 replay over it: 2 and 2.
  const cut = at["count-replayed"];
  expect(cut.read(Story.entity(Team, ws({ teamId: "team-east" })))).toMatchObject({
    data: { technicianCount: 2 },
    predicted: true,
  });
  expect(cut.read(Story.entity(Team, ws({ teamId: "team-west" })))?.data.technicianCount).toBe(2);
  expect(at.settled.read(Story.entity(Team, ws({ teamId: "team-east" })))?.predicted).toBe(false);
});

storyTest(removeRefused, ({ at }) => {
  const ben = ws({ technicianId: "tech-ben" });
  expect(at["remove-predicted"].read(Story.entity(Technician, ben))).toBeUndefined();
  expect(at["remove-refused-restored"].read(Story.entity(Technician, ben))).toMatchObject({
    data: { name: "Ben" },
    predicted: false,
  });
  expect(at["remove-refused-restored"].read(North)?.memory.notice).toBe(
    "Still holds 1 open tickets",
  );
});

storyTest(merged, ({ at }) => {
  expect(at.comparing.read(North)?.state).toBe(S.MERGING);
  const cut = at["merge-predicted"];
  expect(cut.read(Story.records("verdict", { event: Roster.E.MERGING.Confirm }))).toMatchObject([
    { result: { _tag: "Denied", reasons: [{ code: "PickOne" }] } }, // nothing picked yet
    { result: { _tag: "Allowed" } },
  ]);
  expect(cut.read(Story.records("exit"))).toMatchObject([
    { instance: ["MERGING"], name: "Merge", payload: { survivorId: "acme", mergedId: "acme-ltd" } },
  ]);
  expect(cut.read(Story.entity(Customer, ws({ customerId: "acme-ltd" })))).toBeUndefined(); // the delete
  expect(cut.read(Story.entity(Customer, ws({ customerId: "acme" })))).toMatchObject({
    data: { ticketCount: 45 }, // 23 + 22, from `(beneath, input) => …`
    predicted: true,
  });
  expect(cut.read(Story.entity(Ticket, ws({ ticketId: "T-43" })))?.data.customerId).toBe("acme"); // re-pointed
  // One Attempt heads the record queues of both entities it predicts (E12).
  const queues = cut.read(Story.inspection).domains.roster.queues;
  expect(queues.map((q: { entity: string }) => q.entity)).toEqual(
    expect.arrayContaining(["DispatchDesk/Customer", "DispatchDesk/Ticket"]),
  );
  expect(at.merged.read(North)?.memory.notice).toBe("Customers merged");
  expect(at.merged.read(Story.entity(Customer, ws({ customerId: "acme" })))?.predicted).toBe(false);
});

storyTest(mergeRefused, ({ at }) => {
  const cut = at["merge-refused-restored"];
  expect(cut.read(Story.entity(Customer, ws({ customerId: "acme-ltd" })))).toMatchObject({
    predicted: false,
  });
  expect(cut.read(Story.entity(Customer, ws({ customerId: "acme" })))?.data.ticketCount).toBe(23);
  expect(cut.read(Story.entity(Ticket, ws({ ticketId: "T-43" })))?.data.customerId).toBe(
    "acme-ltd",
  );
  expect(cut.read(North)?.memory.notice).toBe("Not merged: Its tickets changed; check them again");
});

storyTest(mergeUnsure, ({ at }) => {
  const cut = at["merge-uncertain"];
  expect(cut.read(Story.entity(Customer, ws({ customerId: "acme" })))?.uncertain).toBe(true);
  expect(cut.read(Story.entity(Ticket, ws({ ticketId: "T-43" })))?.uncertain).toBe(true); // across two entities
  expect(cut.read(Desk.mergeCustomers)).toHaveLength(2); // the send and its one re-send, one Attempt
  expect(cut.read(North)?.memory.notice).toContain("We couldn't confirm the merge");
});

storyTest(mergeOutlivesScreen, ({ at }) => {
  expect(at["left-mid-merge"].read(North)).toBeUndefined();
  expect(at["left-mid-merge"].read(Story.inspection).lanes).toMatchObject([
    { contract: "DispatchDesk/merge-customers", state: "InFlight", binding: "unbound" },
  ]);
  expect(at["merge-adopted"].read(North)?.memory.notice).toBe("Customers merged"); // the parked ending, adopted
  expect(at["merge-adopted"].read(Story.inspection).lanes).toEqual([]);
});

storyTest(invited, ({ at }) => {
  const cut = at.invited;
  expect(cut.read(Desk.inviteBatch)).toHaveLength(1); // three commits, one request (O19)
  expect(cut.read(North)?.memory.inviting).toMatchObject([
    { draftId: "i1", status: "invited", technicianId: "tech-fay" },
    { draftId: "i2", status: "invited", technicianId: "tech-gus" },
    { draftId: "i3", status: "failed", reason: "Not an email address" },
  ]);
  expect(cut.read(Story.records("ending", { operation: O.invite }))).toHaveLength(3); // one per Attempt
});

storyTest(inviteEmails, ({ at }) => {
  // `allow`: three Attempts at once, two on one technician's lane key; the row counts them.
  expect(O.inviteEmail.get(at["emails-in-flight"].read(North), ws(ana))).toMatchObject({
    pending: true,
    outstanding: 1,
  });
  expect(at["emails-sent"].read(Desk.inviteEmail)).toHaveLength(3);
  expect(at["emails-sent"].read(Story.inspection).lanes).toEqual([]); // nothing holds
});

storyTest(rebuilt, ({ at }) => {
  expect(at.rebuilding.read(North)?.operations.rebuild).toMatchObject({ pending: true }); // a plain row: unkeyed
  expect(
    at.rebuilding.read(Story.records("verdict", { event: Roster.E.RebuildIndex })),
  ).toMatchObject([
    { result: { _tag: "Allowed" } },
    { result: { _tag: "Denied", reasons: [{ code: "InFlight" }] } },
  ]);
  expect(at.rebuilt.read(Desk.reindex)).toHaveLength(1);
});

storyTest(notAdmin, ({ at }) => {
  expect(at.refused.read(Story.records("verdict"))).toContainEqual(
    expect.objectContaining({ result: { _tag: "Denied", reasons: [{ code: "NotAdmin" }] } }),
  );
  expect(at.refused.read(Desk.removeTechnician)).toEqual([]);
});

storyTest(skills, ({ at }) => {
  expect(at["two-chips"].read(North)?.memory.chips).toMatchObject([
    { key: "ladders" },
    { key: "keys" },
  ]);
  expect(at["one-chip"].read(North)?.memory.skillsDraft).toEqual(["keys"]); // the host removed it (rule 9)
  expect(at["skills-saved"].read(Story.entity(Technician, ws(ana)))?.data.skills).toEqual(["keys"]);
});

storyTest(renameUnsure, ({ at }) => {
  expect(O.rename.get(at["rename-uncertain"].read(North), ws(ana)).uncertain).toBe(true);
  expect(at["rename-uncertain"].read(Story.entity(Technician, ws(ana)))).toMatchObject({
    data: { name: "Ana Lopez" },
    uncertain: true,
  });
  expect(at["rename-confirmed"].read(Story.entity(Technician, ws(ana)))).toMatchObject({
    uncertain: false,
  });
});

// pending merge 6
storyTest(audited, ({ at }) => {
  expect(at.fresh.read(North)?.memory.notice).toBe(""); // a fresh first registration owes nothing (T2)
  expect(
    at.audited.read(Story.entity(Technician, ws({ technicianId: "tech-cy" })))?.data.status,
  ).toBe("break");
  expect(at.audited.read(North)?.memory.audit).toMatchObject([{ _tag: "TechnicianSaved", seq: 1 }]);
  expect(at.audited.read(North)?.memory.cursor).toBe(1);
});

storyTest(rosterHydrated, ({ at }) => {
  // The server's polled sessions were released at capture; the browser's own started after hydration.
  expect(at.hydrated.read(Story.records("hydration"))).not.toContainEqual(
    expect.objectContaining({ code: "DehydrateCommitInFlight" }),
  );
  expect(at.hydrated.read(Desk.rosterChanges).some((r) => r.via.tab.name === "server")).toBe(true);
});
