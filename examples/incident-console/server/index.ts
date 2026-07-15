import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import {
  decode,
  FaultRequestSchema,
  IncidentFiltersSchema,
  IncidentPatchSchema,
  ResetRequestSchema,
  type ApiError,
} from "../src/domain/incidents";
import { IncidentStore } from "./store";

const store = new IncidentStore();
const port = Number(process.env.INCIDENT_API_PORT ?? "5190");
const allowDevControls = process.env.NODE_ENV !== "production" || process.env.ACCEPTANCE === "1";

const cors = {
  "access-control-allow-origin": process.env.INCIDENT_WEB_ORIGIN ?? "http://127.0.0.1:5187",
  "access-control-allow-methods": "GET,PATCH,POST,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,last-event-id",
};

const json = (response: ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, { ...cors, "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
};

const fail = (response: ServerResponse, status: number, error: ApiError) =>
  json(response, status, error);

const readJson = async (request: IncomingMessage) => {
  const chunks: Array<Buffer> = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 64 * 1024) throw new Error("request body exceeds 64 KiB");
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

const delay = (millis: number) => new Promise<void>((resolve) => setTimeout(resolve, millis));

const handler = async (request: IncomingMessage, response: ServerResponse) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, cors);
    response.end();
    return;
  }
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
  try {
    if (request.method === "GET" && url.pathname === "/api/incidents") {
      if (store.consume("delayed-response")) await delay(350);
      if (store.consume("shift-before-list")) store.remove("INC-006");
      const filters = decode(IncidentFiltersSchema, Object.fromEntries(url.searchParams));
      json(response, 200, store.list(filters));
      return;
    }

    const incidentMatch = /^\/api\/incidents\/([^/]+)$/.exec(url.pathname);
    if (incidentMatch !== null && request.method === "GET") {
      const id = decodeURIComponent(incidentMatch[1]!);
      if (store.consume("delayed-response")) await delay(350);
      if (store.consume("remove-before-detail")) store.remove(id);
      if (store.consume("refresh-503")) {
        fail(response, 503, { code: "unavailable", message: "Detail refresh unavailable" });
        return;
      }
      const incident = store.get(id);
      if (incident === undefined) {
        fail(response, 404, { code: "not_found", message: `Incident ${id} was not found` });
        return;
      }
      if (store.consume("malformed-detail")) {
        json(response, 200, { ...incident, version: "invalid-version" });
        return;
      }
      json(response, 200, incident);
      return;
    }

    if (incidentMatch !== null && request.method === "PATCH") {
      const id = decodeURIComponent(incidentMatch[1]!);
      if (store.consume("delayed-patch")) await delay(350);
      const patch = decode(IncidentPatchSchema, await readJson(request));
      const result = store.patch(id, patch);
      if (result.kind === "not-found") {
        fail(response, 404, { code: "not_found", message: `Incident ${id} was not found` });
      } else if (result.kind === "conflict") {
        fail(response, 409, {
          code: "version_conflict",
          message: `Incident ${id} changed on the server`,
          current: result.current,
        });
      } else {
        json(response, 200, result.incident);
      }
      return;
    }

    const eventsMatch = /^\/api\/incidents\/([^/]+)\/events$/.exec(url.pathname);
    if (eventsMatch !== null && request.method === "GET") {
      const id = decodeURIComponent(eventsMatch[1]!);
      if (store.get(id) === undefined) {
        fail(response, 404, { code: "not_found", message: `Incident ${id} was not found` });
        return;
      }
      const eventIdHeader = request.headers["last-event-id"];
      if (Array.isArray(eventIdHeader)) throw new Error("Last-Event-ID must be singular");
      const replay = store.events(id, eventIdHeader ?? url.searchParams.get("after") ?? undefined);
      response.writeHead(200, {
        ...cors,
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      response.write(": connected\n\n");
      for (const event of replay) {
        response.write(`id: ${event.id}\nevent: incident\ndata: ${JSON.stringify(event)}\n\n`);
      }
      const unsubscribe = store.subscribe(id, {
        response,
        disconnectAfterFirst: store.consume("sse-disconnect"),
      });
      request.once("close", unsubscribe);
      return;
    }

    const runbookStartMatch = /^\/api\/incidents\/([^/]+)\/runbooks$/.exec(url.pathname);
    if (runbookStartMatch !== null && request.method === "POST") {
      const id = decodeURIComponent(runbookStartMatch[1]!);
      const runbook = store.startRunbook(id);
      if (runbook === undefined) {
        fail(response, 404, { code: "not_found", message: `Incident ${id} was not found` });
      } else {
        json(response, 202, { runId: runbook.id });
      }
      return;
    }

    const runbookMatch = /^\/api\/runbooks\/([^/]+)$/.exec(url.pathname);
    if (runbookMatch !== null && request.method === "GET") {
      if (store.consume("delayed-runbook")) await delay(350);
      const runbook = store.getRunbook(decodeURIComponent(runbookMatch[1]!));
      if (runbook === undefined) {
        fail(response, 404, { code: "not_found", message: "Runbook was not found" });
      } else {
        json(response, 200, runbook);
      }
      return;
    }
    if (runbookMatch !== null && request.method === "DELETE") {
      const runbook = store.cancelRunbook(decodeURIComponent(runbookMatch[1]!));
      if (runbook === undefined) {
        fail(response, 404, { code: "not_found", message: "Runbook was not found" });
      } else {
        json(response, 200, runbook);
      }
      return;
    }

    if (allowDevControls && request.method === "POST" && url.pathname === "/__dev/reset") {
      const input = decode(ResetRequestSchema, await readJson(request));
      store.reset(input.seed);
      json(response, 200, { ok: true, seed: input.seed });
      return;
    }
    if (allowDevControls && request.method === "POST" && url.pathname === "/__dev/faults") {
      const input = decode(FaultRequestSchema, await readJson(request));
      if (input.fault === "timeline-burst") {
        const emitted = await store.burstTimeline("INC-002");
        json(response, 200, { ok: true, fault: input.fault, emitted });
        return;
      }
      store.arm(input.fault);
      const disconnected = input.fault === "sse-disconnect" ? store.disconnectSubscribers() : 0;
      json(response, 200, { ok: true, fault: input.fault, disconnected });
      return;
    }
    if (allowDevControls && request.method === "GET" && url.pathname === "/__dev/status") {
      const waitForSubscribers = url.searchParams.get("waitForSubscribers");
      if (waitForSubscribers !== null && waitForSubscribers !== "0") {
        throw new Error("waitForSubscribers only accepts 0");
      }
      if (waitForSubscribers === "0") await store.waitForNoSubscribers();
      json(response, 200, store.diagnostics());
      return;
    }

    fail(response, 404, { code: "not_found", message: "Route was not found" });
  } catch (cause) {
    fail(response, 400, {
      code: "bad_request",
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }
};

const server = createServer((request, response) => void handler(request, response));
server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`incident-api http://127.0.0.1:${port}\n`);
});

const shutdown = () => {
  store.cancelAllRunbooks();
  store.disconnectSubscribers();
  server.close(() => process.exit(0));
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
