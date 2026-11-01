// The Desk server's ticket-details half: the description fields, the body with its etag, and the history. On the
// one Desk server because a ticket's details belong to the ticket (a fake cannot read another server's truth).
// Like the roster's, its client half is the REAL adapter (`DetailsHttp`, on Effect's `HttpClient`) over
// `Fake.fetch`: a Story replaces the transport, never the adapter (2.10.4).
import { Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import { Fake } from "flow-state/testing";
import * as Server from "../app/desk-server.js";
import { DetailsHttp, FieldName } from "../features/Tickets/editor/details-api.js";
import { type Desk, type FakeTruth, step, withDesk } from "./desk.fake.js";

const ORIGIN = "http://desk.test";

const ticket = { workspaceId: Schema.String, ticketId: Schema.String };

const key = { key: Schema.String };

export const detailsEndpoints = {
  details: Fake.call({
    request: ticket,
    handle: (truth: FakeTruth, req) => [
      truth,
      { status: 200, body: Server.loadDetails(truth.desk, req) },
    ],
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
    handle: (truth: FakeTruth, req) => [
      truth,
      { status: 200, body: Server.historyPage(truth.desk, req) },
    ],
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
    (truth: FakeTruth, { body, ...key }) =>
      withDesk(truth, Server.editBodyElsewhere(truth.desk, key, body)),
  ),
};

// design gap: `route` reads the request's JSON body, so it is async here; 2.10.4 shows only a URL being read.
const route = async (request: Request) => {
  const url = new URL(request.url);
  const [, , workspaceId, , ticketId, what, id, action] = url.pathname
    .split("/")
    .filter((p) => p !== "")
    .map(decodeURIComponent);
  const body = request.method === "GET" ? {} : ((await request.json()) as Record<string, unknown>);
  const idem = request.headers.get("Idempotency-Key") ?? "";
  const at = { workspaceId, ticketId };

  if (what === undefined) return { endpoint: "details", input: at };

  if (what === "fields")
    return { endpoint: "saveField", input: { ...at, field: id, value: body.value, key: idem } };

  if (what === "body")
    return {
      endpoint: "saveBody",
      input: { ...at, body: body.body, ifMatch: request.headers.get("If-Match") ?? "", key: idem },
    };

  if (what === "history" && action === "pin")
    return { endpoint: "pinNote", input: { ...at, entryId: id, pinned: body.pinned, key: idem } };

  if (what === "history") {
    const before = url.searchParams.get("before");

    return { endpoint: "history", input: before === null ? at : { ...at, before } };
  }

  return undefined;
};

export const detailsClient = (desk: typeof Desk) =>
  DetailsHttp(ORIGIN).pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(Fake.fetch(desk, route)),
  );
