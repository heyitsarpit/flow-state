// The Desk server's technician half: phone pulses, breaks, nudges and dispatch. On the one Desk server because a
// dispatch changes a ticket and a technician together. Its client half is the real `TechniciansHttp` adapter over
// `Fake.fetch`.
import { Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import { Fake } from "flow-state/testing";
import * as Server from "../app/desk-server.js";
import { Pulse, TechniciansHttp } from "../features/Tickets/technicians/technicians-api.js";
import { idempotency, step, withDesk, type Desk, type FakeTruth } from "./desk.fake.js";
import { pushed } from "./desk.socket.fake.js";

const ORIGIN = "http://desk.test";

const tech = { workspaceId: Schema.String, technicianId: Schema.String };

export const techniciansEndpoints = {
  // While the poller is down (`Desk.pulseOutage`), every GET answers 503: the adapter's `PollFailed`.
  pulse: Fake.call({
    request: tech,
    handle: (truth: FakeTruth, req) => {
      const pulse = Server.pulseOf(truth.desk, req);

      return {
        response:
          truth.pulseDown || pulse === undefined ? { status: 503 } : { status: 200, body: pulse },
      };
    },
  }),
  breaks: Fake.call({
    request: { workspaceId: Schema.String },
    handle: (truth: FakeTruth, req) => ({
      response: { status: 200, body: Server.breaksOf(truth.desk, req.workspaceId) },
    }),
  }),
  setBreak: Fake.call({
    request: { ...tech, onBreak: Schema.Boolean, key: Schema.String },
    handle: (truth: FakeTruth, req) => step(truth, Server.setBreak(truth.desk, req, req.key)),
  }),
  nudge: Fake.call({
    request: { ...tech, from: Schema.String, text: Schema.String, key: Schema.String },
    handle: () => ({ response: { status: 202 } }),
  }),
  // A dispatch assigns the ticket, which appends to the log: the socket pushes it.
  dispatch: Fake.call({
    request: {
      workspaceId: Schema.String,
      ticketId: Schema.String,
      technicianId: Schema.String,
      key: Schema.String,
    },
    handle: (truth: FakeTruth, req) => {
      const { truth: next, response } = step(truth, Server.dispatch(truth.desk, req, req.key));

      return { ...pushed(truth, next), response };
    },
  }),
};

export const techniciansControls = {
  // A phone reports: the next poll returns it.
  pulseFrom: Fake.control({ ...tech, pulse: Pulse }, (truth: FakeTruth, { pulse, ...key }) => ({
    truth: withDesk(truth, Server.reportPulse(truth.desk, key, pulse)),
  })),
  // The pulse service is down (or back): every poll fails, and each session drops (`Feed.down`).
  pulseOutage: Fake.control({ on: Schema.Boolean }, (truth: FakeTruth, { on }) => ({
    truth: { ...truth, pulseDown: on },
  })),
};

// The URL space the adapter uses, as the real server would route it. A write carries its key in a header, so those routes spell
// `input`; a read is the short form (`{ ...params, ...query }`).
export const techniciansClient = (desk: typeof Desk) =>
  TechniciansHttp(ORIGIN).pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(
      Fake.fetch(desk, {
        "GET /api/workspaces/:workspaceId/breaks": "breaks",
        "GET /api/workspaces/:workspaceId/technicians/:technicianId/pulse": "pulse",
        "POST /api/workspaces/:workspaceId/technicians/:technicianId/break": {
          endpoint: "setBreak",
          input: ({ params, body, headers }) => ({
            ...params,
            onBreak: body.onBreak,
            key: idempotency(headers),
          }),
        },
        "POST /api/workspaces/:workspaceId/technicians/:technicianId/nudge": {
          endpoint: "nudge",
          input: ({ params, body, headers }) => ({
            ...params,
            from: body.from,
            text: body.text,
            key: idempotency(headers),
          }),
        },
        "POST /api/workspaces/:workspaceId/tickets/:ticketId/dispatch": {
          endpoint: "dispatch",
          input: ({ params, body, headers }) => ({
            ...params,
            technicianId: body.technicianId,
            key: idempotency(headers),
          }),
        },
      }),
    ),
  );
