# `HttpApi` (unstable)

Import from `effect/unstable/httpapi`. This module describes schema-backed HTTP
APIs that can be implemented by `HttpApiBuilder` and consumed by
`HttpApiClient`.

Source: [Effect v4 `HttpApi` API](https://www.effect.website/docs/v4/api/effect/unstable/httpapi/HttpApi).

## API index

1. [HttpApi.HttpApi](#httpapihttpapi)
2. [HttpApi.make](#httpapimake)
3. [HttpApi.add](#httpapiadd)
4. [HttpApi.addHttpApi](#httpapiaddhttpapi)
5. [HttpApi.prefix](#httpapiprefix)
6. [HttpApi.middleware](#httpapimiddleware)
7. [HttpApi.annotate](#httpapiannotate)
8. [HttpApi.reflect](#httpapireflect)
9. [HttpApi.isHttpApi](#httpapiishttpapi)

### Additional known APIs (not expanded)

`HttpApi.Constraint`, `HttpApi.Top`, `HttpApi.annotateMerge`, `HttpApi.AdditionalSchemas`

### [HttpApi.HttpApi](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApi.ts:54)

An `HttpApi` is a typed collection of groups and endpoints. Its metadata is shared by server builders, clients, reflection, and OpenAPI generation.

```ts
import type { HttpApi } from "effect/unstable/httpapi"

declare const api: HttpApi.HttpApi<"App">
```

### [HttpApi.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApi.ts:229)

Creates an empty API with a stable identifier. Add groups to this value before building routes or clients.

```ts
import { HttpApi } from "effect/unstable/httpapi"

const api = HttpApi.make("App")
```

### [HttpApi.add](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApi.ts:67)

Adds one or more `HttpApiGroup` values while preserving their endpoint types.

```ts
import { HttpApi, HttpApiGroup } from "effect/unstable/httpapi"

const api = HttpApi.make("App").add(HttpApiGroup.make("users"))
```

### [HttpApi.addHttpApi](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApi.ts:87)

Flattens another API's groups into the current API and keeps annotations scoped to the groups being added.

```ts
import { HttpApi, HttpApiGroup } from "effect/unstable/httpapi"

const users = HttpApi.make("Users").add(HttpApiGroup.make("users"))
const app = HttpApi.make("App").addHttpApi(users)
```

### [HttpApi.prefix](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApi.ts:94)

Prefixes every endpoint path in an API, which is useful for mounting a complete API under a version or service prefix.

```ts
const versioned = api.prefix("/v1")
```

### [HttpApi.middleware](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApi.ts:103)

Adds middleware to endpoints that already exist in the API. Endpoints added later are not changed by this call.

```ts
import type { Context } from "effect"

declare const RequestId: Context.Key<"RequestId", unknown>
const instrumented = api.middleware(RequestId)
```

### [HttpApi.annotate](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApi.ts:110)

Attaches typed metadata to the API for builders, middleware, documentation, or reflection consumers.

```ts
import { Context } from "effect"

const Title = Context.Service<string>("api-title")
const documented = api.annotate(Title, "Public API")
```

### [HttpApi.reflect](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApi.ts:247)

Visits groups and endpoints with merged annotations, middleware, and response schemas grouped by status code.

```ts
HttpApi.reflect(api, {
  onGroup: ({ group }) => console.log(group.identifier),
  onEndpoint: ({ endpoint }) => console.log(endpoint.method, endpoint.path),
})
```

### [HttpApi.isHttpApi](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApi.ts:33)

Checks an unknown value at a runtime boundary and narrows it to an API description.

```ts
declare const value: unknown
if (HttpApi.isHttpApi(value)) {
  console.log(value.identifier)
}
```
