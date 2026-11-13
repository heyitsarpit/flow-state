// The Desk server's find and on-site half: the palette's search, the van's parts, signatures and resolutions. On
// the one Desk server because a resolution closes a ticket and writes its history. Client halves are the real
// adapters (`FindHttp`, `ResolveHttp`) over `Fake.fetch`.
import { Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import { Fake } from "flow-state/testing";
import * as Server from "../app/desk-server.js";
import { FindHttp } from "../features/Find/find-api.js";
import { ResolveHttp } from "../features/Resolve/resolve-api.js";
import { idempotency, step, toWire, withDesk, type Desk, type FakeTruth } from "./desk.fake.js";
import { pushed } from "./desk.socket.fake.js";

const ORIGIN = "http://desk.test";

const ticket = { workspaceId: Schema.String, ticketId: Schema.String };

export const visitEndpoints = {
  find: Fake.call({
    request: { workspaceId: Schema.String, q: Schema.String },
    handle: (truth: FakeTruth, req) => ({
      response: { status: 200, body: Server.search(truth.desk, req) },
    }),
  }),
  part: Fake.call({
    request: { partNumber: Schema.String },
    handle: (truth: FakeTruth, req) => ({
      response: toWire(Server.partByNumber(truth.desk, req.partNumber)),
    }),
  }),
  reservePart: Fake.call({
    request: { ...ticket, partNumber: Schema.String, key: Schema.String },
    handle: (truth: FakeTruth, req) => step(truth, Server.reservePart(truth.desk, req, req.key)),
  }),
  releaseParts: Fake.call({
    request: { ...ticket, partNumbers: Schema.Array(Schema.String), key: Schema.String },
    handle: (truth: FakeTruth, req) => {
      const { truth: next } = step(truth, Server.releaseParts(truth.desk, req, req.key));

      return { truth: next, response: { status: 204 } };
    },
  }),
  signature: Fake.call({
    request: { ref: Schema.String },
    handle: (truth: FakeTruth, req) => ({
      truth: withDesk(truth, Server.uploadSignature(truth.desk, req.ref)),
      response: { status: 201 },
    }),
  }),
  // A resolution closes the ticket, which appends to the log: the socket pushes it.
  resolve: Fake.call({
    request: {
      ...ticket,
      reason: Schema.String,
      parts: Schema.Array(Schema.String),
      signatureRef: Schema.String,
      key: Schema.String,
    },
    handle: (truth: FakeTruth, req) => {
      const { truth: next, response } = step(truth, Server.resolveTicket(truth.desk, req, req.key));

      return { ...pushed(truth, next), response };
    },
  }),
};

// The URL space the adapters use, as the real server would route it. `:release` is a literal colon, spelled `::` in a key. The
// signature upload is a PUT of image bytes, so its `input` names only the ref: the short form would spread the body.
export const visitClient = (desk: typeof Desk) =>
  Layer.mergeAll(FindHttp(ORIGIN), ResolveHttp(ORIGIN)).pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(
      Fake.fetch(desk, {
        "GET /api/parts/:partNumber": "part",
        "PUT /api/signatures/:ref": {
          endpoint: "signature",
          input: ({ params }) => ({ ref: params.ref }),
        },
        "GET /api/workspaces/:workspaceId/find": {
          endpoint: "find",
          input: ({ params, query }) => ({ ...params, q: query["q"] ?? "" }),
        },
        "POST /api/workspaces/:workspaceId/tickets/:ticketId/parts": {
          endpoint: "reservePart",
          input: ({ params, body, headers }) => ({
            ...params,
            partNumber: body.partNumber,
            key: idempotency(headers),
          }),
        },
        "POST /api/workspaces/:workspaceId/tickets/:ticketId/parts::release": {
          endpoint: "releaseParts",
          input: ({ params, body, headers }) => ({
            ...params,
            partNumbers: body.partNumbers,
            key: idempotency(headers),
          }),
        },
        "POST /api/workspaces/:workspaceId/tickets/:ticketId/resolve": {
          endpoint: "resolve",
          input: ({ params, body, headers }) => ({
            ...params,
            reason: body.reason,
            parts: body.parts,
            signatureRef: body.signatureRef,
            key: idempotency(headers),
          }),
        },
      }),
    ),
  );
