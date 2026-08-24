# `HttpApiClient` (unstable)

Import from `effect/unstable/httpapi`. This module derives typed client methods
and URL builders from the same endpoint schemas used by an `HttpApi` server.

Source: [Effect v4 `HttpApiClient` API](https://www.effect.website/docs/v4/api/effect/unstable/httpapi/HttpApiClient).

## API index

1. [HttpApiClient.make](#httpapiclientmake)
2. [HttpApiClient.makeWith](#httpapiclientmakewith)
3. [HttpApiClient.group](#httpapiclientgroup)
4. [HttpApiClient.endpoint](#httpapiclientendpoint)
5. [HttpApiClient.urlBuilder](#httpapiclienturlbuilder)
6. [HttpApiClient.Client](#httpapiclientclient)

### Additional known APIs (not expanded)

`HttpApiClient.makeClient`, `HttpApiClient.Client.Group`, `HttpApiClient.Client.Method`, `HttpApiClient.ForApi`, `HttpApiClient.UrlBuilder`

### [HttpApiClient.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApiClient.ts:476)

Builds a client for every group and endpoint using the `HttpClient` service from the environment.

```ts
import { Effect } from "effect"
import { HttpApiClient } from "effect/unstable/httpapi"

const client = Effect.gen(function*() {
  return yield* HttpApiClient.make(api, { baseUrl: "https://api.example.com" })
})
```

### [HttpApiClient.makeWith](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApiClient.ts:504)

Builds a typed client from an explicitly supplied `HttpClient`, which is useful for custom transports, retries, tracing, and tests.

```ts
import { HttpApiClient } from "effect/unstable/httpapi"
import { HttpClient } from "effect/unstable/http"

declare const httpClient: HttpClient.HttpClient
const client = HttpApiClient.makeWith(api, { httpClient, baseUrl: "https://api.example.com" })
```

### [HttpApiClient.group](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApiClient.ts:542)

Builds only one group's typed client methods, reducing the dependency and surface area of a focused consumer.

```ts
import { HttpApiClient } from "effect/unstable/httpapi"
import { HttpClient } from "effect/unstable/http"

declare const httpClient: HttpClient.HttpClient
const users = HttpApiClient.group(api, { group: "users", httpClient })
```

### [HttpApiClient.endpoint](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApiClient.ts:592)

Builds a client method for one endpoint, useful when a consumer should not construct a full API client.

```ts
import { HttpApiClient } from "effect/unstable/httpapi"
import { HttpClient } from "effect/unstable/http"

declare const httpClient: HttpClient.HttpClient
const getUser = HttpApiClient.endpoint(api, {
  group: "users",
  endpoint: "getUser",
  httpClient,
})
```

### [HttpApiClient.urlBuilder](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApiClient.ts:657)

Creates a typed URL builder that encodes path parameters and query values according to endpoint schemas.

```ts
const buildUrl = HttpApiClient.urlBuilder(api, { baseUrl: "https://api.example.com" })
const url = buildUrl.users.getUser({ params: { id: "u1" } })
```

### [HttpApiClient.Client](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApiClient.ts:50)

`Client` is the generated type-level shape of an API client, preserving group and endpoint request signatures.

```ts
import type { HttpApiClient } from "effect/unstable/httpapi"

declare const client: HttpApiClient.Client<never>
```
