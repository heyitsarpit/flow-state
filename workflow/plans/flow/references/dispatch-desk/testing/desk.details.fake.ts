// The Desk server's ticket-details half: the description fields, the body with its etag, and the history. On the
// one Desk server because a ticket's details belong to the ticket (a fake cannot read another server's truth).
// Like the roster's, its client half is the REAL adapter (`DetailsHttp`, on Effect's `HttpClient`) over
// `Fake.fetch`: a Story replaces the transport, never the adapter (2.10.4).
import { Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import { Fake } from "flow-state/testing";
import * as Server from "../app/desk-server.js";
import { DetailsHttp, FieldName } from "../features/Tickets/editor/details-api.js";
import { idempotency, step, withDesk, type Desk, type FakeTruth } from "./desk.fake.js";

const ORIGIN = "http://desk.test";

const ticket = { workspaceId: Schema.String, ticketId: Schema.String };

const key = { key: Schema.String };

export const detailsEndpoints = {
  details: Fake.call({
    request: ticket,
    handle: (truth: FakeTruth, req) => ({
      response: { status: 200, body: Server.loadDetails(truth.desk, req) },
    }),
  }),
  saveField: Fake.call({
    request: { ...ticket, field: FieldName, value: Schema.String, ...key },
    handle: (truth: FakeTruth, req) => step(truth, Server.saveField(truth.desk, req, req.key)),
  }),
  // A 412 answers with the server's body and etag, which the adapter reads into `BodyConflict`.
  saveBody: Fake.call({
    request: { ...ticket, body: Schema.String, ifMatch: Schema.String, ...key },
    handle: (truth: FakeTruth, req) => step(truth, Server.saveBody(truth.desk, req, req.key)),
  }),
  history: Fake.call({
    request: { ...ticket, before: Schema.optional(Schema.String) },
    handle: (truth: FakeTruth, req) => ({
      response: { status: 200, body: Server.historyPage(truth.desk, req) },
    }),
  }),
  pinNote: Fake.call({
    request: { ...ticket, entryId: Schema.String, pinned: Schema.Boolean, ...key },
    handle: (truth: FakeTruth, req) => step(truth, Server.pinNote(truth.desk, req, req.key)),
  }),
};

export const detailsControls = {
  // Someone else saves the body: its etag moves on, so our next save meets 412.
  editBodyElsewhere: Fake.control(
    { ...ticket, body: Schema.String },
    (truth: FakeTruth, { body, ...key }) => ({
      truth: withDesk(truth, Server.editBodyElsewhere(truth.desk, key, body)),
    }),
  ),
};

// The URL space the adapter uses, as the real server would route it. A write's key and the body's etag are headers, so those
// routes spell `input`; a read is the short form (`{ ...params, ...query }`).
export const detailsClient = (desk: typeof Desk) =>
  DetailsHttp(ORIGIN).pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(
      Fake.fetch(desk, {
        "GET /api/workspaces/:workspaceId/tickets/:ticketId": "details",
        "PATCH /api/workspaces/:workspaceId/tickets/:ticketId/fields/:field": {
          endpoint: "saveField",
          input: ({ params, body, headers }) => ({
            ...params,
            value: body.value,
            key: idempotency(headers),
          }),
        },
        "PUT /api/workspaces/:workspaceId/tickets/:ticketId/body": {
          endpoint: "saveBody",
          input: ({ params, body, headers }) => ({
            ...params,
            body: body.body,
            ifMatch: headers.get("If-Match") ?? "",
            key: idempotency(headers),
          }),
        },
        "GET /api/workspaces/:workspaceId/tickets/:ticketId/history": "history",
        "POST /api/workspaces/:workspaceId/tickets/:ticketId/history/:entryId/pin": {
          endpoint: "pinNote",
          input: ({ params, body, headers }) => ({
            ...params,
            pinned: body.pinned,
            key: idempotency(headers),
          }),
        },
      }),
    ),
  );
