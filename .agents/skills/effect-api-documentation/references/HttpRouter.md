# `HttpRouter` (unstable)

Import from `effect/unstable/http`. This module registers typed routes and
middleware, decodes request data, and turns an application layer into an HTTP
handler.

Source: [Effect v4 `HttpRouter` API](https://www.effect.website/docs/v4/api/effect/unstable/http/HttpRouter).

## API index

1. [HttpRouter.HttpRouter](#httprouterhttprouter)
2. [HttpRouter.make](#httproutermake)
3. [HttpRouter.add](#httprouteradd)
4. [HttpRouter.addAll](#httprouteraddall)
5. [HttpRouter.route](#httprouterroute)
6. [HttpRouter.schemaJson](#httprouterschemajson)
7. [HttpRouter.schemaNoBody](#httprouterschemanobody)
8. [HttpRouter.schemaParams](#httprouterschemaparams)
9. [HttpRouter.params](#httprouterparams)
10. [HttpRouter.middleware](#httproutermiddleware)
11. [HttpRouter.cors](#httproutercors)
12. [HttpRouter.prefixPath](#httprouterprefixpath)
13. [HttpRouter.toHttpEffect](#httproutertohttpeffect)
14. [HttpRouter.serve](#httprouterserve)
15. [HttpRouter.toWebHandler](#httproutertowebhandler)

### Additional known APIs (not expanded)

`HttpRouter.RouteContext`, `HttpRouter.RouterConfig`, `HttpRouter.PathInput`, `HttpRouter.schemaPathParams`, `HttpRouter.prefixRoute`, `HttpRouter.use`, `HttpRouter.layer`, `HttpRouter.provideRequest`, `HttpRouter.disableLogger`, `HttpRouter.addGlobalMiddleware`

### [HttpRouter.HttpRouter](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpRouter.ts:47)

The router service stores routes, global middleware, and the effect that dispatches the current request.

```ts
import { HttpRouter } from "effect/unstable/http"

const router = HttpRouter.HttpRouter
```

### [HttpRouter.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpRouter.ts:118)

Constructs an empty router that can later be provided to route and middleware layers.

```ts
import { HttpRouter } from "effect/unstable/http"

const router = HttpRouter.make
```

### [HttpRouter.add](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpRouter.ts:486)

Creates a layer registering one route with a static response, response effect, or request-aware handler.

```ts
import { Effect } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/unstable/http"

const health = HttpRouter.add(
  "GET",
  "/health",
  Effect.succeed(HttpServerResponse.text("ok")),
)
```

### [HttpRouter.addAll](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpRouter.ts:520)

Registers a collection of routes together and can apply one path prefix to all of them.

```ts
const routes = HttpRouter.addAll([
  HttpRouter.route("GET", "/health", Effect.succeed(HttpServerResponse.text("ok"))),
], { prefix: "/v1" })
```

### [HttpRouter.route](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpRouter.ts:652)

Builds a reusable `Route` value before registering it with `addAll` or another router.

```ts
const healthRoute = HttpRouter.route(
  "GET",
  "/health",
  Effect.succeed(HttpServerResponse.text("ok")),
)
```

### [HttpRouter.schemaJson](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpRouter.ts:305)

Decodes request metadata and a JSON body with a `Schema`, failing on invalid JSON or schema input.

```ts
import { Schema } from "effect"

const input = HttpRouter.schemaJson(Schema.Struct({ body: Schema.String }))
```

### [HttpRouter.schemaNoBody](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpRouter.ts:360)

Decodes method, URL, headers, cookies, path parameters, and search parameters without reading the body.

```ts
import { Schema } from "effect"

const request = HttpRouter.schemaNoBody(Schema.Struct({ method: Schema.String }))
```

### [HttpRouter.schemaParams](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpRouter.ts:411)

Decodes path and search parameters together, with path values taking precedence when keys overlap.

```ts
import { Schema } from "effect"

const params = HttpRouter.schemaParams(Schema.Struct({ id: Schema.String }))
```

### [HttpRouter.params](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpRouter.ts:287)

Reads the captured path parameters for the current matched route.

```ts
const id = Effect.map(HttpRouter.params, (params) => params.id)
```

### [HttpRouter.middleware](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpRouter.ts:919)

Creates typed route middleware that can provide request services or handle route errors.

```ts
const withRequestId = HttpRouter.middleware((effect) => effect)
```

### [HttpRouter.cors](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpRouter.ts:1153)

Adds global CORS middleware with explicit origins, methods, headers, and credentials policy.

```ts
const cors = HttpRouter.cors({
  allowedOrigins: ["https://app.example.com"],
  credentials: true,
})
```

### [HttpRouter.prefixPath](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpRouter.ts:699)

Combines a route path with a prefix while handling root and wildcard paths consistently.

```ts
const path = HttpRouter.prefixPath("/users", "/v1")
```

### [HttpRouter.toHttpEffect](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpRouter.ts:563)

Builds the request-handling effect from an application layer, preserving router and request dependencies.

```ts
const handler = HttpRouter.toHttpEffect(health)
```

### [HttpRouter.serve](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpRouter.ts:1219)

Runs an application layer through an HTTP server, with optional server-wide middleware and router configuration.

```ts
const server = HttpRouter.serve(health)
```

### [HttpRouter.toWebHandler](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpRouter.ts:1283)

Builds a Fetch-compatible handler and disposal function for serverless, worker, and test environments.

```ts
const web = HttpRouter.toWebHandler(health)
const response = await web.handler(new Request("https://example.com/health"))
```
