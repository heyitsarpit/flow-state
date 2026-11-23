// The Desk server's roster half: technicians, teams and customers. It lives on the one Desk server, not a fake
// of its own, because its truth is shared: a customer merge re-points tickets, and a technician with open
// tickets cannot be removed. A fake cannot read another server's truth (2.10.4), so the roster's endpoints are
// spread into `Desk` (desk.fake.ts) as the socket's are.
//
// The client half is different from every other desk port's. The roster adapter (features/Roster/roster-api.ts)
// is written on Effect's `HttpClient`, so a Story runs that real adapter and replaces only the transport:
// `Fake.fetch(Desk, routes)` provides `FetchHttpClient.Fetch`, and the route table turns each method and path into an
// endpoint and its input (MD 2.10.4, transport bindings). The status codes below are what the adapter reads.
import { Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import { Fake } from "flow-state/testing";
import * as Server from "../app/desk-server.js";
import { RosterHttp, TechnicianStatus } from "../features/Roster/roster-api.js";
import { idempotency, step, toWire, withDesk, type Desk, type FakeTruth } from "./desk.fake.js";

const ORIGIN = "http://desk.test";

const tech = { workspaceId: Schema.String, technicianId: Schema.String };

const workspace = { workspaceId: Schema.String };

const key = { key: Schema.String };

const read = (body: unknown) => ({ status: 200, body });

export const rosterEndpoints = {
  technicians: Fake.call({
    request: { ...workspace, teamId: Schema.String, page: Schema.optional(Schema.Int) },
    handle: (truth: FakeTruth, req) => ({
      response: read(Server.listTechnicians(truth.desk, req)),
    }),
  }),
  technician: Fake.call({
    request: tech,
    handle: (truth: FakeTruth, req) => ({
      response: toWire(Server.loadTechnician(truth.desk, req)),
    }),
  }),
  teams: Fake.call({
    request: workspace,
    handle: (truth: FakeTruth, req) => ({
      response: read(truth.desk.teams.filter((team) => team.workspaceId === req.workspaceId)),
    }),
  }),
  teamSizes: Fake.call({
    request: workspace,
    handle: (truth: FakeTruth, req) => ({
      response: read(Server.teamSizes(truth.desk, req.workspaceId)),
    }),
  }),
  customers: Fake.call({
    request: workspace,
    handle: (truth: FakeTruth, req) => ({
      response: read(
        truth.desk.customers.filter((customer) => customer.workspaceId === req.workspaceId),
      ),
    }),
  }),
  // One poll of the change log. The polling recipe asks again a second after each answer (roster.contracts.ts).
  rosterChanges: Fake.call({
    request: { ...workspace, after: Schema.Int },
    handle: (truth: FakeTruth, req) => ({
      response: read(Server.rosterChanges(truth.desk, req.workspaceId, req.after)),
    }),
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
      const { truth: next, response } = step(
        truth,
        Server.removeTechnician(truth.desk, req, req.key),
      );

      return { truth: next, response: response.status === 200 ? { status: 204 } : response };
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

      return { truth: withDesk(truth, desk), response: { status: 200, body: items } };
    },
  }),
  inviteEmail: Fake.call({
    request: { ...tech, ...key },
    handle: (truth: FakeTruth, req) => {
      const found = Server.loadTechnician(truth.desk, req);

      return { response: found.ok ? { status: 202 } : toWire(found) };
    },
  }),
  reindex: Fake.call({
    request: { ...workspace, ...key },
    handle: () => ({ response: { status: 202 } }),
  }),
};

export const rosterControls = {
  // Another admin moves a technician: the change log and both teams' counts change on the server.
  moveTechnicianElsewhere: Fake.control(
    { ...tech, to: Schema.String },
    (truth: FakeTruth, { to, ...key }) => ({
      truth: withDesk(
        truth,
        Server.moveTechnician(truth.desk, { ...key, to }, `elsewhere-move-${key.technicianId}`)[0],
      ),
    }),
  ),
  // A technician's device reports a new status: the change log gets it, and the next poll delivers it.
  statusElsewhere: Fake.control(
    { ...tech, status: TechnicianStatus },
    (truth: FakeTruth, { status, ...key }) => ({
      truth: withDesk(truth, Server.setStatusElsewhere(truth.desk, key, status)),
    }),
  ),
  // Another admin renames a technician: the same rule a client rename uses, under a key nobody else holds.
  renameTechnicianElsewhere: Fake.control(
    { ...tech, name: Schema.String },
    (truth: FakeTruth, { name, ...key }) => ({
      truth: withDesk(
        truth,
        Server.renameTechnician(truth.desk, { ...key, name }, `elsewhere-${name}`)[0],
      ),
    }),
  ),
};

// The URL space the adapter uses, as the real server would route it. A technician write is one PATCH path whose body decides the
// endpoint (move, rename or skills), so its `endpoint` is a function of the body. `:merge`, `:batch` and `:reindex` are literal
// colons, spelled `::` in a key. A write's key is a header, so those routes spell `input`; a read is the short form.
// The real adapter, over Effect's fetch client, over the fake's transport. Built per tab; it holds no state.
export const rosterClient = (desk: typeof Desk) =>
  RosterHttp(ORIGIN).pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(
      Fake.fetch(desk, {
        "GET /api/workspaces/:workspaceId/technicians": {
          endpoint: "technicians",
          input: ({ params, query }) => ({
            ...params,
            teamId: query["team"],
            page: Number(query["page"] ?? 0),
          }),
        },
        "GET /api/workspaces/:workspaceId/technicians/:technicianId": "technician",
        "PATCH /api/workspaces/:workspaceId/technicians/:technicianId": {
          endpoint: ({ body }) =>
            "to" in body ? "moveTechnician" : "name" in body ? "renameTechnician" : "setSkills",
          input: ({ params, body, headers }) => ({
            ...params,
            ...body,
            key: idempotency(headers),
          }),
        },
        "DELETE /api/workspaces/:workspaceId/technicians/:technicianId": {
          endpoint: "removeTechnician",
          input: ({ params, headers }) => ({ ...params, key: idempotency(headers) }),
        },
        "POST /api/workspaces/:workspaceId/technicians/:technicianId/invite-email": {
          endpoint: "inviteEmail",
          input: ({ params, headers }) => ({ ...params, key: idempotency(headers) }),
        },
        "GET /api/workspaces/:workspaceId/teams": "teams",
        "GET /api/workspaces/:workspaceId/team-sizes": "teamSizes",
        "GET /api/workspaces/:workspaceId/customers": "customers",
        "POST /api/workspaces/:workspaceId/customers::merge": {
          endpoint: "mergeCustomers",
          input: ({ params, body, headers }) => ({
            ...params,
            ...body,
            key: idempotency(headers),
          }),
        },
        "POST /api/workspaces/:workspaceId/invites::batch": {
          endpoint: "inviteBatch",
          input: ({ body }) => ({ invites: body }),
        },
        "POST /api/workspaces/:workspaceId/roster::reindex": {
          endpoint: "reindex",
          input: ({ params, headers }) => ({ ...params, key: idempotency(headers) }),
        },
        "GET /api/workspaces/:workspaceId/roster/changes": {
          endpoint: "rosterChanges",
          input: ({ params, query }) => ({ ...params, after: Number(query["after"] ?? 0) }),
        },
      }),
    ),
  );
