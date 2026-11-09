# `HttpClient` (unstable)

Import from `effect/unstable/http`. This module provides an injectable HTTP
client plus composable request, response, retry, rate-limit, cookie, and scope
policies.

Source: [Effect v4 `HttpClient` API](https://www.effect.website/docs/v4/api/effect/unstable/http/HttpClient).

## API index

1. [HttpClient.HttpClient](#httpclienthttpclient)
2. [HttpClient.get](#httpclientget)
3. [HttpClient.post](#httpclientpost)
4. [HttpClient.execute](#httpclientexecute)
5. [HttpClient.transformResponse](#httpclienttransformresponse)
6. [HttpClient.mapRequest](#httpclientmaprequest)
7. [HttpClient.filterStatusOk](#httpclientfilterstatusok)
8. [HttpClient.retry](#httpclientretry)
9. [HttpClient.retryTransient](#httpclientretrytransient)
10. [HttpClient.withRateLimiter](#httpclientwithratelimiter)
11. [HttpClient.tapRequest](#httpclienttaprequest)
12. [HttpClient.withCookiesRef](#httpclientwithcookiesref)
13. [HttpClient.withScope](#httpclientwithscope)
14. [HttpClient.followRedirects](#httpclientfollowredirects)

### Additional known APIs (not expanded)

`HttpClient.isHttpClient`, `HttpClient.head`, `HttpClient.patch`, `HttpClient.put`, `HttpClient.del`, `HttpClient.options`, `HttpClient.transform`, `HttpClient.catch`, `HttpClient.catchTag`, `HttpClient.catchTags`, `HttpClient.filterOrElse`, `HttpClient.filterOrFail`, `HttpClient.filterStatus`, `HttpClient.mapRequestEffect`, `HttpClient.mapRequestInput`, `HttpClient.mapRequestInputEffect`, `HttpClient.make`, `HttpClient.makeWith`, `HttpClient.tap`, `HttpClient.tapError`

### [HttpClient.HttpClient](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpClient.ts:61)

`HttpClient` is the injectable service and client interface used by request accessors and API clients.

```ts
import { HttpClient } from "effect/unstable/http"

const client = HttpClient.HttpClient
```

### [HttpClient.get](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpClient.ts:175)

Executes a `GET` request through the current `HttpClient` service.

```ts
import { HttpClient } from "effect/unstable/http"

const response = HttpClient.get("https://api.example.com/users")
```

### [HttpClient.post](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpClient.ts:199)

Executes a `POST` request through the current service, accepting request options for headers and body encoding.

```ts
import { HttpClient, HttpClientRequest } from "effect/unstable/http"

const response = HttpClient.post("https://api.example.com/users", {
  body: HttpClientRequest.bodyText("new user"),
})
```

### [HttpClient.execute](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpClient.ts:165)

Executes a prebuilt `HttpClientRequest`, which is the escape hatch for precise request construction.

```ts
import { HttpClient, HttpClientRequest } from "effect/unstable/http"

const request = HttpClientRequest.get("https://api.example.com/health")
const response = HttpClient.execute(request)
```

### [HttpClient.transformResponse](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpClient.ts:295)

Wraps every response effect so decoding, metrics, tracing, or domain error conversion can be applied once.

```ts
import { Effect } from "effect"
import { HttpClient } from "effect/unstable/http"

const traced = HttpClient.transformResponse(HttpClient.HttpClient, (effect) =>
  Effect.tap(effect, () => Effect.log("response received")),
)
```

### [HttpClient.mapRequest](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpClient.ts:730)

Transforms every outgoing request, making it a compact place to add a base URL or common headers.

```ts
import { HttpClient, HttpClientRequest } from "effect/unstable/http"

const api = HttpClient.mapRequest(
  HttpClient.HttpClient,
  HttpClientRequest.prependUrl("https://api.example.com"),
)
```

### [HttpClient.filterStatusOk](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpClient.ts:569)

Converts non-2xx responses into the typed `HttpClientError` channel instead of leaving status handling to every caller.

```ts
import { HttpClient } from "effect/unstable/http"

const checked = HttpClient.filterStatusOk(HttpClient.HttpClient)
```

### [HttpClient.retry](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpClient.ts:850)

Retries client failures using an `Effect` `Schedule`, keeping retry policy separate from request construction.

```ts
import { Schedule } from "effect"
import { HttpClient } from "effect/unstable/http"

const resilient = HttpClient.retry(HttpClient.HttpClient, Schedule.recurs(3))
```

### [HttpClient.retryTransient](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpClient.ts:888)

Retries transient network, timeout, rate-limit, or response failures and can distinguish error-only from response-aware retrying.

```ts
import { Schedule } from "effect"
import { HttpClient } from "effect/unstable/http"

const resilient = HttpClient.retryTransient(HttpClient.HttpClient, {
  retryOn: "errors-and-responses",
  schedule: Schedule.recurs(2),
})
```

### [HttpClient.withRateLimiter](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpClient.ts:1046)

Applies a persistence-backed rate-limiter policy and can learn from rate-limit response headers.

```ts
import { HttpClient } from "effect/unstable/http"

const limited = HttpClient.withRateLimiter(HttpClient.HttpClient, {
  limit: 20,
  window: "1 second",
})
```

### [HttpClient.tapRequest](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpClient.ts:1372)

Runs an effect before each request, useful for request logs, metrics, and context-sensitive signing.

```ts
import { Effect } from "effect"
import { HttpClient } from "effect/unstable/http"

const observed = HttpClient.tapRequest(HttpClient.HttpClient, () => Effect.log("sending request"))
```

### [HttpClient.withCookiesRef](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpClient.ts:1400)

Shares cookie state across requests through a `Ref`, which is useful for session-oriented clients.

```ts
import { Ref } from "effect"
import { HttpClient, Cookies } from "effect/unstable/http"

const cookies = Ref.unsafeMake(Cookies.empty)
const sessionClient = HttpClient.withCookiesRef(HttpClient.HttpClient, cookies)
```

### [HttpClient.withScope](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpClient.ts:1433)

Attaches request cancellation to the current `Scope`, ensuring outstanding requests are aborted during teardown.

```ts
import { HttpClient } from "effect/unstable/http"

const scoped = HttpClient.withScope(HttpClient.HttpClient)
```

### [HttpClient.followRedirects](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpClient.ts:1454)

Enables bounded redirect following for clients whose transport does not already provide the desired policy.

```ts
import { HttpClient } from "effect/unstable/http"

const redirected = HttpClient.followRedirects(HttpClient.HttpClient, 5)
```
