// The Desk server's roster half: technicians, teams and customers. It lives on the one Desk server, not a fake
// of its own, because its truth is shared: a customer merge re-points tickets, and a technician with open
// tickets cannot be removed. A fake cannot read another server's truth (2.10.4), so the roster's endpoints are
// spread into `Desk` (desk.fake.ts) as the socket's are.
//
// The client half is different from every other desk port's. The roster adapter (features/Roster/roster-api.ts)
// is written on Effect's `HttpClient`, so a Story runs that real adapter and replaces only the transport:
// `Fake.fetch(Desk, route)` provides `FetchHttpClient.Fetch`, and `route` turns each web `Request` into an
// endpoint and its input (MD 2.10.4, transport bindings; Y6). The status codes below are what the adapter reads.
import { Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import { Fake } from "flow-state/testing";
import * as Server from "../app/desk-server.js";
import { RosterHttp, TechnicianStatus } from "../features/Roster/roster-api.js";
import { type Desk, type FakeTruth, step, toWire, withDesk } from "./desk.fake.js";

const ORIGIN = "http://desk.test";

const tech = { workspaceId: Schema.String, technicianId: Schema.String };

const workspace = { workspaceId: Schema.String };

const key = { key: Schema.String };

const read = (body: unknown) => ({ status: 200, body });

export const rosterEndpoints = {
  technicians: Fake.call({
    request: { ...workspace, teamId: Schema.String, page: Schema.optional(Schema.Int) },
    handle: (truth: FakeTruth, req) => [truth, read(Server.listTechnicians(truth.desk, req))],
  }),
  technician: Fake.call({
    request: tech,
    handle: (truth: FakeTruth, req) => [truth, toWire(Server.loadTechnician(truth.desk, req))],
  }),
  teams: Fake.call({
    request: workspace,
    handle: (truth: FakeTruth, req) => [
      truth,
      read(truth.desk.teams.filter((team) => team.workspaceId === req.workspaceId)),
    ],
  }),
  teamSizes: Fake.call({
    request: workspace,
    handle: (truth: FakeTruth, req) => [truth, read(Server.teamSizes(truth.desk, req.workspaceId))],
  }),
  customers: Fake.call({
    request: workspace,
    handle: (truth: FakeTruth, req) => [
      truth,
      read(truth.desk.customers.filter((customer) => customer.workspaceId === req.workspaceId)),
    ],
  }),
  // One poll of the change log. The polling recipe asks again a second after each answer (roster.contracts.ts).
  rosterChanges: Fake.call({
    request: { ...workspace, after: Schema.Int },
    handle: (truth: FakeTruth, req) => [
      truth,
      read(Server.rosterChanges(truth.desk, req.workspaceId, req.after)),
    ],
  }),
  moveTechnician: Fake.call({
    request: { ...tech, from: Schema.String, to: Schema.String, ...key },
    handle: (truth: FakeTruth, req) => step(truth, Server.moveTechnician(truth.desk, req, req.key)),
  }),
  renameTechnician: Fake.call({
    request: { ...tech, name: Schema.String, ...key },
    handle: (truth: FakeTruth, req) =>
      step(truth, Server.renameTechnician(truth.desk, req, req.key)),
  }),
  setSkills: Fake.call({
    request: { ...tech, skills: Schema.Array(Schema.String), ...key },
    handle: (truth: FakeTruth, req) => step(truth, Server.setSkills(truth.desk, req, req.key)),
  }),
  removeTechnician: Fake.call({
    request: { ...tech, ...key },
    handle: (truth: FakeTruth, req) => {
      const [next, wire] = step(truth, Server.removeTechnician(truth.desk, req, req.key));

      return [next, wire.status === 200 ? { status: 204, body: null } : wire];
    },
  }),
  mergeCustomers: Fake.call({
    request: {
      ...workspace,
      survivorId: Schema.String,
      mergedId: Schema.String,
      tickets: Schema.Array(Schema.Struct({ workspaceId: Schema.String, ticketId: Schema.String })),
      ...key,
    },
    handle: (truth: FakeTruth, req) => step(truth, Server.mergeCustomers(truth.desk, req, req.key)),
  }),
  // One request for many invites; each item is answered on its own, with its own status (MD 2.7.11).
  inviteBatch: Fake.call({
    request: {
      invites: Schema.Array(
        Schema.Struct({
          ...workspace,
          draftId: Schema.String,
          name: Schema.String,
          email: Schema.String,
          idempotencyKey: Schema.String,
        }),
      ),
    },
    handle: (truth: FakeTruth, req) => {
      let desk = truth.desk;

      const items = req.invites.map(({ idempotencyKey, ...invite }) => {
        const [next, result] = Server.invite(desk, invite, idempotencyKey);
        desk = next;

        return result.ok
          ? { status: 201, technician: result.value }
          : { status: 422, reason: result.error.reason };
      });

      return [withDesk(truth, desk), { status: 200, body: items }];
    },
  }),
  inviteEmail: Fake.call({
    request: { ...tech, ...key },
    handle: (truth: FakeTruth, req) => {
      const found = Server.loadTechnician(truth.desk, req);

      return [truth, found.ok ? { status: 202, body: null } : toWire(found)];
    },
  }),
  reindex: Fake.call({
    request: { ...workspace, ...key },
    handle: (truth: FakeTruth) => [truth, { status: 202, body: null }],
  }),
};

export const rosterControls = {
  // Another admin moves a technician: the change log and both teams' counts change on the server.
  moveTechnicianElsewhere: Fake.control(
    { ...tech, to: Schema.String },
    (truth: FakeTruth, { to, ...key }) =>
      withDesk(
        truth,
        Server.moveTechnician(truth.desk, { ...key, to }, `elsewhere-move-${key.technicianId}`)[0],
      ),
  ),
  // A technician's device reports a new status: the change log gets it, and the next poll delivers it.
  statusElsewhere: Fake.control(
    { ...tech, status: TechnicianStatus },
    (truth: FakeTruth, { status, ...key }) =>
      withDesk(truth, Server.setStatusElsewhere(truth.desk, key, status)),
  ),
  // Another admin renames a technician: the same rule a client rename uses, under a key nobody else holds.
  renameTechnicianElsewhere: Fake.control(
    { ...tech, name: Schema.String },
    (truth: FakeTruth, { name, ...key }) =>
      withDesk(
        truth,
        Server.renameTechnician(truth.desk, { ...key, name }, `elsewhere-${name}`)[0],
      ),
  ),
};

// The URL space the adapter uses, as the real server would route it. Flow parses nothing else (2.10.4).
// design gap: `route` reads the request's JSON body, so it is async here; 2.10.4 shows only a URL being read.
const route = async (request: Request) => {
  const url = new URL(request.url);
  const parts = url.pathname
    .split("/")
    .filter((part) => part !== "")
    .map(decodeURIComponent); // api, workspaces, <ws>, …
  const workspaceId = parts[2]!;
  const body = request.method === "GET" ? {} : ((await request.json()) as Record<string, unknown>);
  const idem = request.headers.get("Idempotency-Key") ?? "";
  const [, , , what, id, action] = parts;

  if (what === "technicians" && id === undefined)
    return {
      endpoint: "technicians",
      input: {
        workspaceId,
        teamId: url.searchParams.get("team")!,
        page: Number(url.searchParams.get("page") ?? 0),
      },
    };

  if (what === "technicians" && request.method === "GET")
    return { endpoint: "technician", input: { workspaceId, technicianId: id } };

  if (what === "technicians" && action === "invite-email")
    return { endpoint: "inviteEmail", input: { workspaceId, technicianId: id, key: idem } };

  if (what === "technicians" && request.method === "DELETE")
    return { endpoint: "removeTechnician", input: { workspaceId, technicianId: id, key: idem } };

  if (what === "technicians") {
    const endpoint =
      "to" in body ? "moveTechnician" : "name" in body ? "renameTechnician" : "setSkills";

    return { endpoint, input: { workspaceId, technicianId: id, ...body, key: idem } };
  }

  if (what === "teams") return { endpoint: "teams", input: { workspaceId } };

  if (what === "team-sizes") return { endpoint: "teamSizes", input: { workspaceId } };

  if (what === "customers") return { endpoint: "customers", input: { workspaceId } };

  if (what === "customers:merge")
    return { endpoint: "mergeCustomers", input: { workspaceId, ...body, key: idem } };

  if (what === "invites:batch") return { endpoint: "inviteBatch", input: { invites: body } };

  if (what === "roster:reindex") return { endpoint: "reindex", input: { workspaceId, key: idem } };

  if (what === "roster")
    return {
      endpoint: "rosterChanges",
      input: { workspaceId, after: Number(url.searchParams.get("after") ?? 0) },
    };

  return undefined;
};

// The real adapter, over Effect's fetch client, over the fake's transport. Built per tab; it holds no state.
export const rosterClient = (desk: typeof Desk) =>
  RosterHttp(ORIGIN).pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(Fake.fetch(desk, route)),
  );
