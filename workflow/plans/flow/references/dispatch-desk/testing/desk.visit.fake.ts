// The Desk server's find and on-site half: the palette's search, the van's parts, signatures and resolutions. On
// the one Desk server because a resolution closes a ticket and writes its history. Client halves are the real
// adapters (`FindHttp`, `ResolveHttp`) over `Fake.fetch`.
import { Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import { Fake } from "flow-state/testing";
import * as Server from "../app/desk-server.js";
import { FindHttp } from "../features/Find/find-api.js";
import { ResolveHttp } from "../features/Resolve/resolve-api.js";
import { type Desk, type FakeTruth, step, toWire, withDesk } from "./desk.fake.js";

const ORIGIN = "http://desk.test";

const ticket = { workspaceId: Schema.String, ticketId: Schema.String };

export const visitEndpoints = {
  find: Fake.call({
    request: { workspaceId: Schema.String, q: Schema.String },
    handle: (truth: FakeTruth, req) => [
      truth,
      { status: 200, body: Server.search(truth.desk, req) },
    ],
  }),
  part: Fake.call({
    request: { partNumber: Schema.String },
    handle: (truth: FakeTruth, req) => [
      truth,
      toWire(Server.partByNumber(truth.desk, req.partNumber)),
    ],
  }),
  reservePart: Fake.call({
    request: { ...ticket, partNumber: Schema.String, key: Schema.String },
    handle: (truth: FakeTruth, req) => step(truth, Server.reservePart(truth.desk, req, req.key)),
  }),
  releaseParts: Fake.call({
    request: { ...ticket, partNumbers: Schema.Array(Schema.String), key: Schema.String },
    handle: (truth: FakeTruth, req) => {
      const [next] = step(truth, Server.releaseParts(truth.desk, req, req.key));

      return [next, { status: 204, body: null }];
    },
  }),
  signature: Fake.call({
    request: { ref: Schema.String },
    handle: (truth: FakeTruth, req) => [
      withDesk(truth, Server.uploadSignature(truth.desk, req.ref)),
      { status: 201, body: null },
    ],
  }),
  resolve: Fake.call({
    request: {
      ...ticket,
      reason: Schema.String,
      parts: Schema.Array(Schema.String),
      signatureRef: Schema.String,
      key: Schema.String,
    },
    handle: (truth: FakeTruth, req) => step(truth, Server.resolveTicket(truth.desk, req, req.key)),
  }),
};

// design gap: `route` reads the request's JSON body, so it is async here; 2.10.4 shows only a URL being read.
const route = async (request: Request) => {
  const url = new URL(request.url);
  const parts = url.pathname
    .split("/")
    .filter((p) => p !== "")
    .map(decodeURIComponent);
  const body =
    request.method === "GET" || request.method === "PUT"
      ? {}
      : ((await request.json()) as Record<string, unknown>);
  const key = request.headers.get("Idempotency-Key") ?? "";

  if (parts[1] === "parts") return { endpoint: "part", input: { partNumber: parts[2] } };

  if (parts[1] === "signatures") return { endpoint: "signature", input: { ref: parts[2] } };

  const [, , workspaceId, what, ticketId, action] = parts;

  if (what === "find")
    return { endpoint: "find", input: { workspaceId, q: url.searchParams.get("q") ?? "" } };

  const at = { workspaceId, ticketId };

  if (action === "parts")
    return { endpoint: "reservePart", input: { ...at, partNumber: body.partNumber, key } };

  if (action === "parts:release")
    return { endpoint: "releaseParts", input: { ...at, partNumbers: body.partNumbers, key } };

  if (action === "resolve") return { endpoint: "resolve", input: { ...at, ...body, key } };

  return undefined;
};

export const visitClient = (desk: typeof Desk) =>
  Layer.mergeAll(FindHttp(ORIGIN), ResolveHttp(ORIGIN)).pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(Fake.fetch(desk, route)),
  );
