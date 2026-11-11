// The roster's checks, read from its Stories' checkpoints (2.10.6): each test runs its Story once and destructures
// what it names. App Stories: every value is a read of an actor (`cp.read(North)`), an entity, a record or a lane
// named by an address (`cp.lane({ actor: North, operation, key })`).
import { expect, test } from "vite-plus/test";
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
  onlineDots,
  rebuilt,
  removeRefused,
  renameUnsure,
  rosterHydrated,
  skills,
} from "./roster.story.js";

const { O } = Roster;

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

test("the roster lists East and the unplaced, then West", async () => {
  const { roster, west } = (await browse.run()).checkpoints;

  // East (Ana, Ben), then the unplaced (Eli): a null team sorts last on the server, and the client skips that pair.
  expect(names(roster.read(North))).toEqual(["Ana", "Ben", "Eli"]);
  expect(names(west.read(North))).toEqual(["Cy", "Dee", "Eli"]);
  expect(roster.read(North)?.operations.teamSizes?.data).toEqual({
    "team-east": 2,
    "team-west": 2,
  });
});

test("a move shows at once in the technician, both counts and the list", async () => {
  const { movedTeam: cut, moveConfirmed: done } = (await movedTeam.run()).checkpoints;

  expect(cut.entity(Technician, ws(ana))).toMatchObject({
    data: { teamId: "team-west" },
    predicted: true,
  });
  expect(cut.entity(Team, ws({ teamId: "team-east" }))?.data.technicianCount).toBe(1);
  expect(cut.entity(Team, ws({ teamId: "team-west" }))?.data.technicianCount).toBe(3);
  expect(names(cut.read(North))).toEqual(["Ben", "Eli"]); // Ana left "East and unplaced" by the prediction
  expect(done.entity(Technician, ws(ana))?.predicted).toBe(false);
  // The counts were never in the response: they read `unconfirmed` until the confirming read lands, then not.
  expect(done.entity(Team, ws({ teamId: "team-west" }))).toMatchObject({ unconfirmed: [] });
  expect(done.read(Desk.teamSizes)).toHaveLength(2); // the first read, then the repair: `teamId` changed
});

test("the predicted counts replay over a new base", async () => {
  const { countReplayed: cut, settled } = (await countReplayed.run()).checkpoints;

  // The server's base after Dee's move is East 3, West 1; Ana's predicted -1/+1 replay over it: 2 and 2.
  expect(cut.entity(Team, ws({ teamId: "team-east" }))).toMatchObject({
    data: { technicianCount: 2 },
    predicted: true,
  });
  expect(cut.entity(Team, ws({ teamId: "team-west" }))?.data.technicianCount).toBe(2);
  expect(settled.entity(Team, ws({ teamId: "team-east" }))?.predicted).toBe(false);
});

test("a technician who still holds a ticket is back in place, with the reason", async () => {
  const { removePredicted, removeRefusedRestored } = (await removeRefused.run()).checkpoints;
  const ben = ws({ technicianId: "tech-ben" });

  expect(removePredicted.entity(Technician, ben)).toBeUndefined();
  expect(removeRefusedRestored.entity(Technician, ben)).toMatchObject({
    data: { name: "Ben" },
    predicted: false,
  });
  expect(removeRefusedRestored.read(North)?.memory.notice).toBe("Still holds 1 open tickets");
});

test("a merge predicts across two entities and many records, and the answer confirms it", async () => {
  const { comparing, mergePredicted, merged: done } = (await merged.run()).checkpoints;

  expect(comparing.read(North)?.state).toBe(Roster.S.MERGING);
  expect(comparing.entity(Customer, ws({ customerId: "acme-ltd" }))).toBeDefined(); // there before the delete below
  expect(mergePredicted.records("verdict", { event: Roster.E.MERGING.Confirm })).toMatchObject([
    { result: { _tag: "Denied", reasons: [{ code: "PickOne" }] } }, // nothing picked yet
    { result: { _tag: "Allowed" } },
  ]);
  expect(mergePredicted.records("exit")).toMatchObject([
    { instance: ["MERGING"], name: "Merge", payload: { survivorId: "acme", mergedId: "acme-ltd" } },
  ]);
  expect(mergePredicted.entity(Customer, ws({ customerId: "acme-ltd" }))).toBeUndefined(); // the delete
  expect(mergePredicted.entity(Customer, ws({ customerId: "acme" }))).toMatchObject({
    data: { ticketCount: 45 }, // 23 + 22, from `(beneath, input) => …`
    predicted: true,
  });
  expect(mergePredicted.entity(Ticket, ws({ ticketId: "T-43" }))?.data.customerId).toBe("acme"); // re-pointed
  // One Attempt heads the record queues of both entities it predicts (E12).
  const queues = mergePredicted.inspection?.domains.roster.queues;
  expect(queues.map((q: { entity: string }) => q.entity)).toEqual(
    expect.arrayContaining(["DispatchDesk/Customer", "DispatchDesk/Ticket"]),
  );
  expect(done.read(North)?.memory.notice).toBe("Customers merged");
  expect(done.entity(Customer, ws({ customerId: "acme" }))?.predicted).toBe(false);
});

test("a refused merge takes every prediction back with no repair", async () => {
  const { mergeRefusedRestored: cut } = (await mergeRefused.run()).checkpoints;

  expect(cut.entity(Customer, ws({ customerId: "acme-ltd" }))).toMatchObject({ predicted: false });
  expect(cut.entity(Customer, ws({ customerId: "acme" }))?.data.ticketCount).toBe(23);
  expect(cut.entity(Ticket, ws({ ticketId: "T-43" }))?.data.customerId).toBe("acme-ltd");
  expect(cut.read(North)?.memory.notice).toBe("Not merged: Its tickets changed; check them again");
});

test("a merge with both answers lost stays predicted and uncertain across both entities", async () => {
  const { mergeUncertain: cut } = (await mergeUnsure.run()).checkpoints;

  expect(cut.entity(Customer, ws({ customerId: "acme" }))?.uncertain).toBe(true);
  expect(cut.entity(Ticket, ws({ ticketId: "T-43" }))?.uncertain).toBe(true); // across two entities
  expect(cut.read(Desk.mergeCustomers)).toHaveLength(2); // the send and its one re-send, one Attempt
  expect(cut.read(North)?.memory.notice).toContain("We couldn't confirm the merge");
});

test("a merge outlives the screen and the next roster adopts its answer", async () => {
  const { leftMidMerge, mergeAdopted } = (await mergeOutlivesScreen.run()).checkpoints;

  expect(leftMidMerge.read(North)).toBeUndefined();
  expect(leftMidMerge.inspection?.lanes).toMatchObject([
    { contract: "DispatchDesk/merge-customers", state: "InFlight", binding: "unbound" },
  ]);
  expect(mergeAdopted.read(North)?.memory.notice).toBe("Customers merged"); // the parked ending, adopted
  expect(mergeAdopted.inspection?.lanes).toEqual([]);
});

test("three invites in one window are one request, each completed from its own item", async () => {
  const { invited: cut } = (await invited.run()).checkpoints;

  expect(cut.read(Desk.inviteBatch)).toHaveLength(1); // three commits, one request (O19)
  expect(cut.read(North)?.memory.inviting).toMatchObject([
    { draftId: "i1", status: "invited", technicianId: "tech-fay" },
    { draftId: "i2", status: "invited", technicianId: "tech-gus" },
    { draftId: "i3", status: "failed", reason: "Not an email address" },
  ]);
  expect(cut.records("ending", { operation: O.invite })).toHaveLength(3); // one per Attempt
});

test("invite emails run several at once under allow, and nothing holds", async () => {
  const { emailsInFlight, emailsSent } = (await inviteEmails.run()).checkpoints;

  // `allow`: three Attempts at once, two on one technician's lane key; the row counts them.
  expect(
    emailsInFlight.lane({ actor: North, operation: O.inviteEmail, key: ws(ana) }),
  ).toMatchObject({ pending: true, outstanding: 2 });
  expect(emailsSent.read(Desk.inviteEmail)).toHaveLength(3);
  expect(emailsSent.inspection?.lanes).toEqual([]); // nothing holds
});

test("a second rebuild while one runs is refused before anything is sent", async () => {
  const { rebuilding, rebuilt: done } = (await rebuilt.run()).checkpoints;

  expect(rebuilding.lane({ actor: North, operation: O.rebuild })).toMatchObject({ pending: true }); // unkeyed
  expect(rebuilding.records("verdict", { event: Roster.E.RebuildIndex })).toMatchObject([
    { result: { _tag: "Allowed" } },
    { result: { _tag: "Denied", reasons: [{ code: "InFlight" }] } },
  ]);
  expect(done.read(Desk.reindex)).toHaveLength(1);
});

test("a dispatcher who is not an admin is refused by the session's context", async () => {
  const { refused } = (await notAdmin.run()).checkpoints;

  expect(refused.records("verdict")).toContainEqual(
    expect.objectContaining({ result: { _tag: "Denied", reasons: [{ code: "NotAdmin" }] } }),
  );
  expect(refused.read(Desk.removeTechnician)).toEqual([]);
});

test("skill chips are copies, the host owns the list, and saving predicts the skills", async () => {
  const { twoChips, oneChip, skillsSaved } = (await skills.run()).checkpoints;

  expect(twoChips.read(North)?.memory.chips).toMatchObject([{ key: "ladders" }, { key: "keys" }]);
  expect(oneChip.read(North)?.memory.skillsDraft).toEqual(["keys"]); // the host removed it (rule 9)
  expect(skillsSaved.entity(Technician, ws(ana))?.data.skills).toEqual(["keys"]);
});

test("a rename whose answer is lost is held, and Retry sends the same Attempt", async () => {
  const { renameUncertain, renameConfirmed } = (await renameUnsure.run()).checkpoints;

  expect(renameUncertain.lane({ actor: North, operation: O.rename, key: ws(ana) })).toMatchObject({
    uncertain: true,
  });
  expect(renameUncertain.entity(Technician, ws(ana))).toMatchObject({
    data: { name: "Ana Lopez" },
    uncertain: true,
  });
  expect(renameConfirmed.entity(Technician, ws(ana))).toMatchObject({ uncertain: false });
  expect(renameConfirmed.lane({ actor: North, operation: O.rename, key: ws(ana) })).toBeUndefined(); // settled
});

test("a technician's status change reaches the record and the audit log once each", async () => {
  const { fresh, audited: cp } = (await audited.run()).checkpoints;
  const audit = { actor: North, operation: O.audit };

  expect(fresh.read(North)?.memory.notice).toBe(""); // a fresh first registration owes nothing (T2)
  expect(cp.entity(Technician, ws({ technicianId: "tech-cy" }))?.data.status).toBe("break");
  expect(cp.read(North)?.memory.audit).toMatchObject([{ _tag: "TechnicianSaved", seq: 1 }]);
  // The resume position is Flow's bookmark, advanced only by a fact's turn (was `memory.cursor`).
  expect(cp.records("session", audit).at(-1)?.bookmark?.at).toBe(1);
});

test("the server's polled sessions are released at capture, and the browser opens its own", async () => {
  const { hydrated } = (await rosterHydrated.run()).checkpoints;

  expect(hydrated.records("hydration")).not.toContainEqual(
    expect.objectContaining({ code: "DehydrateCommitInFlight" }),
  );
  expect(hydrated.read(Desk.rosterChanges).some((r) => r.via.tab.name === "server")).toBe(true);
});

test("online dots: one session per technician on the page, Ana's phone joins", async () => {
  const { anaOnline } = (await onlineDots.run()).checkpoints;
  const roster = anaOnline.read(North);

  if (roster === undefined) throw new Error("the roster is not running");

  expect(roster.operations.online).toHaveLength(3); // one session per technician on the page (Ana, Ben, Eli)
  expect(O.online.get(roster, ws(ana))?.value).toBe(true);
  expect(O.online.get(roster, ws({ technicianId: "tech-ben" }))?.value).toBe(false);
});
