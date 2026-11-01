// The Desk server's technician half: phone pulses, breaks, nudges and dispatch. On the one Desk server because a
// dispatch changes a ticket and a technician together. Its client half is the real `TechniciansHttp` adapter over
// `Fake.fetch` (pending merge 6 for the pulse feed it serves).
import { Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import { Fake } from "flow-state/testing";
import * as Server from "../app/desk-server.js";
import { Pulse, TechniciansHttp } from "../features/Tickets/technicians/technicians-api.js";
import { type Desk, type FakeTruth, step, withDesk } from "./desk.fake.js";

const ORIGIN = "http://desk.test";

const tech = { workspaceId: Schema.String, technicianId: Schema.String };

export const techniciansEndpoints = {
  // While the poller is down (`Desk.pulseOutage`), every GET answers 503: the adapter's `PollFailed`.
  pulse: Fake.call({
    request: tech,
    handle: (truth: FakeTruth, req) => {
      const pulse = Server.pulseOf(truth.desk, req);

      return [
        truth,
        truth.pulseDown || pulse === undefined
          ? { status: 503, body: null }
          : { status: 200, body: pulse },
      ];
    },
  }),
  breaks: Fake.call({
    request: { workspaceId: Schema.String },
    handle: (truth: FakeTruth, req) => [
      truth,
      { status: 200, body: Server.breaksOf(truth.desk, req.workspaceId) },
    ],
  }),
  setBreak: Fake.call({
    request: { ...tech, onBreak: Schema.Boolean, key: Schema.String },
    handle: (truth: FakeTruth, req) => step(truth, Server.setBreak(truth.desk, req, req.key)),
  }),
  nudge: Fake.call({
    request: { ...tech, from: Schema.String, text: Schema.String, key: Schema.String },
    handle: (truth: FakeTruth) => [truth, { status: 202, body: null }],
  }),
  dispatch: Fake.call({
    request: {
      workspaceId: Schema.String,
      ticketId: Schema.String,
      technicianId: Schema.String,
      key: Schema.String,
    },
    handle: (truth: FakeTruth, req) => step(truth, Server.dispatch(truth.desk, req, req.key)),
  }),
};

export const techniciansControls = {
  // A phone reports: the next poll returns it.
  pulseFrom: Fake.control({ ...tech, pulse: Pulse }, (truth: FakeTruth, { pulse, ...key }) =>
    withDesk(truth, Server.reportPulse(truth.desk, key, pulse)),
  ),
  // The pulse service is down (or back): every poll fails, and each session drops (`Feed.down`).
  pulseOutage: Fake.control({ on: Schema.Boolean }, (truth: FakeTruth, { on }) => ({
    ...truth,
    pulseDown: on,
  })),
};

// design gap: `route` reads the request's JSON body, so it is async here; 2.10.4 shows only a URL being read.
const route = async (request: Request) => {
  const url = new URL(request.url);
  const [, , workspaceId, what, id, action] = url.pathname
    .split("/")
    .filter((p) => p !== "")
    .map(decodeURIComponent);
  const body = request.method === "GET" ? {} : ((await request.json()) as Record<string, unknown>);
  const key = request.headers.get("Idempotency-Key") ?? "";

  if (what === "breaks") return { endpoint: "breaks", input: { workspaceId } };

  if (what === "technicians" && action === "pulse")
    return { endpoint: "pulse", input: { workspaceId, technicianId: id } };

  if (what === "technicians" && action === "break")
    return {
      endpoint: "setBreak",
      input: { workspaceId, technicianId: id, onBreak: body.onBreak, key },
    };

  if (what === "technicians" && action === "nudge")
    return { endpoint: "nudge", input: { workspaceId, technicianId: id, ...body, key } };

  if (what === "tickets" && action === "dispatch")
    return {
      endpoint: "dispatch",
      input: { workspaceId, ticketId: id, technicianId: body.technicianId, key },
    };

  return undefined;
};

export const techniciansClient = (desk: typeof Desk) =>
  TechniciansHttp(ORIGIN).pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(Fake.fetch(desk, route)),
  );
