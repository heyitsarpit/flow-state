# `HttpApiBuilder` (unstable)

Import from `effect/unstable/httpapi`. This module turns an `HttpApi` contract
and typed handlers into router layers, request decoding, response encoding, and
security effects.

Source: [Effect v4 `HttpApiBuilder` API](https://www.effect.website/docs/v4/api/effect/unstable/httpapi/HttpApiBuilder).

## API index

1. [HttpApiBuilder.group](#httpapibuildergroup)
2. [HttpApiBuilder.layer](#httpapibuilderlayer)
3. [HttpApiBuilder.Handlers](#httpapibuilderhandlers)
4. [HttpApiBuilder.Handlers.handle](#httpapibuilderhandlershandle)
5. [HttpApiBuilder.Handlers.handleAll](#httpapibuilderhandlershandleall)
6. [HttpApiBuilder.Handlers.handleRaw](#httpapibuilderhandlershandleraw)
7. [HttpApiBuilder.endpoint](#httpapibuilderendpoint)
8. [HttpApiBuilder.securityDecode](#httpapibuildersecuritydecode)
9. [HttpApiBuilder.securitySetCookie](#httpapibuildersecuritysetcookie)

### Additional known APIs (not expanded)

`HttpApiBuilder.HandlerRuntime`, `HttpApiBuilder.Handlers.FromGroup`, `HttpApiBuilder.Handlers.ValidateReturn`, `HttpApiBuilder.Handlers.Error`, `HttpApiBuilder.Handlers.Context`, `HttpApiBuilder.handlerToRoute`

### [HttpApiBuilder.group](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApiBuilder.ts:121)

Creates a layer implementing every endpoint in one API group. The handler builder is checked so unhandled endpoints remain visible at compile time.

```ts
import { Effect } from "effect"
import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { HttpServerResponse } from "effect/unstable/http"

const api = HttpApi.make("App").add(
  HttpApiGroup.make("health").add(HttpApiEndpoint.get("check", "/health")),
)
const health = HttpApiBuilder.group(api, "health", (handlers) =>
  handlers.handle("check", () => Effect.succeed(HttpServerResponse.text("ok"))),
)
```

### [HttpApiBuilder.layer](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApiBuilder.ts:64)

Registers all group layers for an API with an `HttpRouter`; `openapiPath` optionally exposes the generated OpenAPI document.

```ts
import { Layer } from "effect"

const routes = HttpApiBuilder.layer(api, { openapiPath: "/openapi.json" }).pipe(
  Layer.provide(health),
)
```

### [HttpApiBuilder.Handlers](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApiBuilder.ts:261)

`Handlers` is the mutable-looking, type-tracked collection used while implementing one group; its type records which endpoint identifiers are already handled.

```ts
import type { HttpApiBuilder } from "effect/unstable/httpapi"

declare const handlers: HttpApiBuilder.Handlers<never>
```

### [HttpApiBuilder.Handlers.handle](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApiBuilder.ts:277)

Adds one decoded endpoint implementation and prevents handling the same identifier twice.

```ts
const implemented = handlers.handle("check", () => Effect.succeed(HttpServerResponse.text("ok")))
```

### [HttpApiBuilder.Handlers.handleAll](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApiBuilder.ts:297)

Registers several endpoint handlers at once while checking the supplied keys against the group contract.

```ts
const implemented = handlers.handleAll({
  check: () => Effect.succeed(HttpServerResponse.text("ok")),
})
```

### [HttpApiBuilder.Handlers.handleRaw](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApiBuilder.ts:311)

Implements an endpoint without automatic payload decoding, exposing the raw request for custom parsing.

```ts
const raw = handlers.handleRaw("check", ({ request }) =>
  Effect.succeed(HttpServerResponse.text(request.method)),
)
```

### [HttpApiBuilder.endpoint](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApiBuilder.ts:436)

Builds the server effect for one endpoint when a group-wide handler collection is unnecessary.

```ts
const check = HttpApiBuilder.endpoint(api, "health", "check", () =>
  Effect.succeed(HttpServerResponse.text("ok")),
)
```

### [HttpApiBuilder.securityDecode](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApiBuilder.ts:476)

Decodes bearer, API-key, or basic credentials from the current request into the security scheme's typed value.

```ts
import type { HttpApiSecurity } from "effect/unstable/httpapi"

declare const security: HttpApiSecurity.HttpApiSecurity
const credentials = HttpApiBuilder.securityDecode(security)
```

### [HttpApiBuilder.securitySetCookie](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApiBuilder.ts:542)

Registers a pre-response handler that writes an API-key cookie, defaulting it to secure and HTTP-only behavior.

```ts
import type { HttpApiSecurity } from "effect/unstable/httpapi"

declare const sessionCookie: HttpApiSecurity.ApiKey
const setSession = HttpApiBuilder.securitySetCookie(sessionCookie, "token")
```
