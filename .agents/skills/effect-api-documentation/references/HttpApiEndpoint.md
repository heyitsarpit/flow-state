# `HttpApiEndpoint` (unstable)

Import from `effect/unstable/httpapi`. This module declares one schema-backed
route, including its method, path, request parts, success responses, errors,
middleware, and annotations.

Source: [Effect v4 `HttpApiEndpoint` API](https://www.effect.website/docs/v4/api/effect/unstable/httpapi/HttpApiEndpoint).

## API index

1. [HttpApiEndpoint.HttpApiEndpoint](#httpapiendpointhttpapiendpoint)
2. [HttpApiEndpoint.get](#httpapiendpointget)
3. [HttpApiEndpoint.post](#httpapiendpointpost)
4. [HttpApiEndpoint.make](#httpapiendpointmake)
5. [HttpApiEndpoint.prefix](#httpapiendpointprefix)
6. [HttpApiEndpoint.middleware](#httpapiendpointmiddleware)
7. [HttpApiEndpoint.annotate](#httpapiendpointannotate)
8. [HttpApiEndpoint.getPayloadSchemas](#httpapiendpointgetpayloadschemas)
9. [HttpApiEndpoint.getSuccessSchemas](#httpapiendpointgetsuccessschemas)
10. [HttpApiEndpoint.getErrorSchemas](#httpapiendpointgeterrorschemas)
11. [HttpApiEndpoint.isHttpApiEndpoint](#httpapiendpointishttpapiendpoint)

### Additional known APIs (not expanded)

`HttpApiEndpoint.Constraint`, `HttpApiEndpoint.ConstraintRequest`, `HttpApiEndpoint.Top`, `HttpApiEndpoint.Request`, `HttpApiEndpoint.RequestRaw`, `HttpApiEndpoint.ClientRequest`, `HttpApiEndpoint.Handler`, `HttpApiEndpoint.HandlerRaw`, `HttpApiEndpoint.put`, `HttpApiEndpoint.patch`, `HttpApiEndpoint.delete`, `HttpApiEndpoint.head`, `HttpApiEndpoint.options`, `HttpApiEndpoint.annotateMerge`

### [HttpApiEndpoint.HttpApiEndpoint](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApiEndpoint.ts:140)

An endpoint declaration carries the type-level request and response contract used by both server handlers and generated clients.

```ts
import type { HttpApiEndpoint } from "effect/unstable/httpapi"

declare const endpoint: HttpApiEndpoint.HttpApiEndpoint<"health", "GET", "/health">
```

### [HttpApiEndpoint.get](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApiEndpoint.ts:1309)

Declares a `GET` endpoint and infers path, query, header, success, and error types from its schemas.

```ts
import { Schema } from "effect"
import { HttpApiEndpoint } from "effect/unstable/httpapi"

const getUser = HttpApiEndpoint.get("getUser", "/users/:id", {
  params: { id: Schema.String },
  success: Schema.String,
})
```

### [HttpApiEndpoint.post](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApiEndpoint.ts:1317)

Declares a `POST` endpoint with a schema-encoded request payload.

```ts
import { Schema } from "effect"
import { HttpApiEndpoint } from "effect/unstable/httpapi"

const createUser = HttpApiEndpoint.post("createUser", "/users", {
  payload: Schema.Struct({ name: Schema.String }),
  success: Schema.Struct({ id: Schema.String }),
})
```

### [HttpApiEndpoint.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApiEndpoint.ts:964)

Creates a constructor for a chosen HTTP method when the built-in method helpers are not enough.

```ts
import { HttpApiEndpoint } from "effect/unstable/httpapi"

const trace = HttpApiEndpoint.make("TRACE")("trace", "/trace")
```

### [HttpApiEndpoint.prefix](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApiEndpoint.ts:181)

Returns an endpoint with its path prefixed while retaining its request and response contract.

```ts
const versioned = getUser.prefix("/v1")
```

### [HttpApiEndpoint.middleware](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApiEndpoint.ts:200)

Attaches a typed API middleware requirement to one endpoint.

```ts
import type { Context } from "effect"

declare const Auth: Context.Key<"Auth", unknown>
const protectedUser = getUser.middleware(Auth)
```

### [HttpApiEndpoint.annotate](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApiEndpoint.ts:217)

Adds endpoint-local metadata that can be consumed by builders, clients, or reflection.

```ts
import { Context } from "effect"

const Operation = Context.Service<string>("operation")
const documented = getUser.annotate(Operation, "Get user")
```

### [HttpApiEndpoint.getPayloadSchemas](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApiEndpoint.ts:255)

Returns the payload schemas declared by an endpoint, which is useful for tooling and custom documentation.

```ts
const payloads = HttpApiEndpoint.getPayloadSchemas(createUser)
```

### [HttpApiEndpoint.getSuccessSchemas](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApiEndpoint.ts:264)

Returns the endpoint's success schemas, including buffered and streaming responses.

```ts
const successes = HttpApiEndpoint.getSuccessSchemas(getUser)
```

### [HttpApiEndpoint.getErrorSchemas](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApiEndpoint.ts:270)

Returns the declared error schemas for response mapping, OpenAPI tooling, or custom validation.

```ts
const errors = HttpApiEndpoint.getErrorSchemas(getUser)
```

### [HttpApiEndpoint.isHttpApiEndpoint](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApiEndpoint.ts:45)

Checks an unknown value and narrows it to an endpoint declaration.

```ts
declare const value: unknown
if (HttpApiEndpoint.isHttpApiEndpoint(value)) {
  console.log(value.method, value.path)
}
```
